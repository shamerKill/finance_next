// Command gateway is the Phase 0 Go HTTP gateway that replaces the NestJS
// backend. It exposes the same /api/v1/option REST surface and reads the same
// MONGODB_URI / ENCRYPTION_KEY env vars as the legacy server.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/finance_next/gateway/internal/config"
	"github.com/finance_next/gateway/internal/crypto"
	"github.com/finance_next/gateway/internal/exchange/meta"
	gwhttp "github.com/finance_next/gateway/internal/http"
	"github.com/finance_next/gateway/internal/orderengine"
	"github.com/finance_next/gateway/internal/quantclient"
	mongostore "github.com/finance_next/gateway/internal/store/mongo"
	tsstore "github.com/finance_next/gateway/internal/store/timescale"
	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		logger.Error("config load failed", "err", err)
		os.Exit(1)
	}

	cryptoSvc, err := crypto.New(cfg.EncryptionKey)
	if err != nil {
		logger.Error("crypto init failed", "err", err)
		os.Exit(1)
	}

	rootCtx, cancel := context.WithCancel(context.Background())
	defer cancel()

	connectCtx, connectCancel := context.WithTimeout(rootCtx, 10*time.Second)
	defer connectCancel()

	client, err := mongo.Connect(options.Client().ApplyURI(cfg.MongoURI))
	if err != nil {
		logger.Error("mongo connect failed", "err", err)
		os.Exit(1)
	}
	if err := client.Ping(connectCtx, nil); err != nil {
		logger.Error("mongo ping failed", "err", err)
		os.Exit(1)
	}

	dbName := databaseFromURI(cfg.MongoURI)
	if dbName == "" {
		logger.Error("mongo URI missing database name in path")
		os.Exit(1)
	}
	db := client.Database(dbName)
	optRepo := mongostore.NewOptionRepo(db)
	if err := optRepo.EnsureIndexes(connectCtx); err != nil {
		// Non-fatal: indexes may already exist or the user may not have privileges.
		logger.Warn("ensure option indexes failed", "err", err)
	}
	acctRepo := mongostore.NewAccountRepo(db)
	if err := acctRepo.EnsureIndexes(connectCtx); err != nil {
		logger.Warn("ensure account indexes failed", "err", err)
	}
	bktRepo := mongostore.NewBacktestRepo(db)
	if err := bktRepo.EnsureIndexes(connectCtx); err != nil {
		logger.Warn("ensure backtest indexes failed", "err", err)
	}
	orderRepo := mongostore.NewOrderRepo(db)
	if err := orderRepo.EnsureIndexes(connectCtx); err != nil {
		logger.Warn("ensure order indexes failed", "err", err)
	}
	metaRepo := mongostore.NewExchangeMetaRepo(db)
	if err := metaRepo.EnsureIndexes(connectCtx); err != nil {
		logger.Warn("ensure exchange_meta indexes failed", "err", err)
	}
	// Phase 5: refresh `exchange_meta` from each venue's public catalog
	// at startup, but only when the cached rows are >24h old (or empty).
	// We run this in a goroutine so a slow upstream doesn't block boot;
	// the order engine doesn't *yet* require the meta rows but the next
	// sub-task (precision/min-notional validation) will.
	go meta.New(metaRepo, logger).RefreshIfStale(rootCtx)

	envelope := crypto.NewEnvelope(cryptoSvc)

	// ---- Phase 2 wiring: Timescale pool + quant gRPC client (best-effort) ----
	var tsStore *tsstore.Store
	var tsPool interface{ Close() }
	if cfg.TimescaleDSN != "" {
		pool, err := tsstore.Connect(rootCtx, cfg.TimescaleDSN)
		if err != nil {
			// Non-fatal: log + continue. Market endpoints will return 503.
			logger.Warn("timescale connect failed; market endpoints disabled", "err", err)
		} else {
			tsStore = tsstore.New(pool)
			tsPool = pool
			logger.Info("timescale connected")
		}
	}

	var quantCli quantclient.Client
	if cfg.QuantGRPCAddr != "" {
		// Lazy: don't block startup on the quant worker being up. The first
		// admin call will dial.
		quantCli = quantclient.NewLazy(cfg.QuantGRPCAddr)
		logger.Info("quant grpc client configured (lazy)", "addr", cfg.QuantGRPCAddr)
	}

	// ---- Phase 3 wiring: Redis client for WS backtest fan-out ----
	var redisClient *redis.Client
	if cfg.RedisURL != "" {
		opt, err := redis.ParseURL(cfg.RedisURL)
		if err != nil {
			logger.Warn("redis URL parse failed; backtest WS disabled", "err", err)
		} else {
			redisClient = redis.NewClient(opt)
			logger.Info("redis client configured", "addr", opt.Addr)
		}
	}

	// ---- Phase 4 wiring: order engine + reconcile loop --------------------
	// The engine is started only when Redis is configured (its job queue is
	// the Redis stream). Otherwise we skip — the strategy endpoints will
	// 503 cleanly. Mainnet remains gated even when env enabled until an
	// admin POSTs /admin/mainnet/confirm with a valid token.
	mainnetEnvEnabled := os.Getenv("MAINNET_TRADING_ENABLED") == "true"
	gate := orderengine.NewTokenStore(mainnetEnvEnabled, logger)
	if mainnetEnvEnabled {
		logger.Warn("MAINNET_TRADING_ENABLED=true — mainnet allowed once an admin confirms a token")
	} else {
		logger.Info("mainnet trading disabled (set MAINNET_TRADING_ENABLED=true to opt in; testnet is always available)")
	}

	var orderEngine *orderengine.Engine
	if redisClient != nil {
		orderEngine = orderengine.New(orderengine.Deps{
			Redis:       redisClient,
			OrderRepo:   orderRepo,
			OptionRepo:  optRepo,
			AccountRepo: acctRepo,
			Envelope:    envelope,
			Gate:        gate,
			Log:         logger,
		})
		go func() {
			if err := orderEngine.Start(rootCtx); err != nil && !errors.Is(err, context.Canceled) {
				logger.Error("order engine stopped", "err", err)
			}
		}()
		logger.Info("order engine started", "workers", 4, "stream", orderengine.CommandSubmitStream)
	} else {
		logger.Info("order engine disabled (no REDIS_URL)")
	}

	e := gwhttp.NewRouter(gwhttp.Deps{
		OptionRepo:       optRepo,
		AccountRepo:      acctRepo,
		BacktestRepo:     bktRepo,
		OrderRepo:        orderRepo,
		ExchangeMetaRepo: metaRepo,
		Crypto:           cryptoSvc,
		Envelope:         envelope,
		Timescale:        tsStore,
		Quant:            quantCli,
		AdminKey:         cfg.AdminKey,
		Redis:            redisClient,
		OrderEngine:      orderEngine,
	})

	addr := ":" + cfg.Port
	srvErr := make(chan error, 1)
	go func() {
		logger.Info("gateway listening", "addr", addr)
		if err := e.Start(addr); err != nil && !errors.Is(err, http.ErrServerClosed) {
			srvErr <- err
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-srvErr:
		logger.Error("server failed", "err", err)
	case s := <-sig:
		logger.Info("signal received, shutting down", "signal", s.String())
	}

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := e.Shutdown(shutdownCtx); err != nil {
		logger.Error("echo shutdown error", "err", err)
	}
	if quantCli != nil {
		if err := quantCli.Close(); err != nil {
			logger.Error("quant grpc close error", "err", err)
		}
	}
	if redisClient != nil {
		if err := redisClient.Close(); err != nil {
			logger.Error("redis close error", "err", err)
		}
	}
	if tsPool != nil {
		tsPool.Close()
	}
	if err := client.Disconnect(shutdownCtx); err != nil {
		logger.Error("mongo disconnect error", "err", err)
	}
	logger.Info("gateway stopped")
}

// databaseFromURI extracts the database name from the path segment of a Mongo URI.
// Returns "" if absent. We avoid pulling a URL parser since SRV strings have an
// odd shape; a simple split is robust enough.
func databaseFromURI(uri string) string {
	// strip query string
	if i := strings.Index(uri, "?"); i >= 0 {
		uri = uri[:i]
	}
	// after "//" find next "/"
	idx := strings.Index(uri, "//")
	if idx < 0 {
		return ""
	}
	rest := uri[idx+2:]
	slash := strings.Index(rest, "/")
	if slash < 0 {
		return ""
	}
	return rest[slash+1:]
}

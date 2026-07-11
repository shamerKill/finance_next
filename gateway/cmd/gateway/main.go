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
	auditmw "github.com/finance_next/gateway/internal/http/middleware"
	"github.com/finance_next/gateway/internal/observability"
	"github.com/finance_next/gateway/internal/orderengine"
	predictionengine "github.com/finance_next/gateway/internal/prediction/engine"
	"github.com/finance_next/gateway/internal/prediction/polymarket"
	"github.com/finance_next/gateway/internal/quantclient"
	mongostore "github.com/finance_next/gateway/internal/store/mongo"
	tsstore "github.com/finance_next/gateway/internal/store/timescale"
	walletpkg "github.com/finance_next/gateway/internal/wallet/polygon"
	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// buildSHA / buildAt are stamped at compile time via:
//
//	go build -ldflags "-X main.buildSHA=$(git rev-parse --short HEAD) \
//	                    -X main.buildAt=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
//	         ./cmd/gateway
//
// Unset (plain `go build`) → fall back to the placeholder values; the
// /api/v1/settings/system-info handler likewise defaults them to
// "dev" / "unknown" if these slip through empty.
var (
	buildSHA = "dev"
	buildAt  = "unknown"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		logger.Error("config load failed", "err", err)
		os.Exit(1)
	}

	// Opt-in s2s header bypass advisory. We log unconditionally so
	// operators can grep this line to confirm the gateway's auth
	// posture. Default deployments leave ALLOW_S2S_HEADER unset and
	// hit the second branch.
	if cfg.AllowS2SHeader {
		logger.Warn("WARNING: ALLOW_S2S_HEADER=true; X-Admin-Key bypass enabled — ensure port is not internet-facing")
	} else {
		logger.Info("s2s header bypass disabled (cookie auth required on every /api/v1 path)")
	}

	cryptoSvc, err := crypto.New(cfg.EncryptionKey)
	if err != nil {
		logger.Error("crypto init failed", "err", err)
		os.Exit(1)
	}

	// Node 3.E.4: AI provider keys are now stored encrypted in Mongo
	// (system_state.aiConfig.*ApiKeyCiphertext) and editable from the
	// /settings/ai UI. Env vars remain as a legacy fallback for one
	// release — log a one-liner so operators know to migrate. Quant
	// worker prefers the Mongo doc; env fires only when the persisted
	// ciphertext is absent.
	for _, env := range []string{"ANTHROPIC_API_KEY", "OPENAI_API_KEY", "DEEPSEEK_API_KEY"} {
		if os.Getenv(env) != "" {
			logger.Warn("legacy AI API key detected in env — these are now stored in /settings/ai (encrypted); env is legacy fallback for one release. Consider migrating: open /settings/ai → paste keys → save.",
				"var", env)
		}
	}

	rootCtx, cancel := context.WithCancel(context.Background())
	defer cancel()

	connectCtx, connectCancel := context.WithTimeout(rootCtx, 10*time.Second)
	defer connectCancel()

	// ObjectIDAsHexString lets bson.Unmarshal decode `_id` (ObjectID) into
	// our `ID string` domain fields without manual stash/restore plumbing
	// in every decode site. mongo-driver v2 made this opt-in (default off);
	// we set it globally on the client so every collection inherits it.
	bsonOpts := &options.BSONOptions{ObjectIDAsHexString: true}
	client, err := mongo.Connect(options.Client().ApplyURI(cfg.MongoURI).SetBSONOptions(bsonOpts))
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

	// Phase 6: AI recommendations + optimization runs.
	recRepo := mongostore.NewRecommendationRepo(db)
	if err := recRepo.EnsureIndexes(connectCtx); err != nil {
		logger.Warn("ensure recommendation indexes failed", "err", err)
	}
	optRunRepo := mongostore.NewOptimizationRunRepo(db)
	if err := optRunRepo.EnsureIndexes(connectCtx); err != nil {
		logger.Warn("ensure optimization_runs indexes failed", "err", err)
	}
	aiGoalRunRepo := mongostore.NewAIGoalRunRepo(db)
	if err := aiGoalRunRepo.EnsureIndexes(connectCtx); err != nil {
		logger.Warn("ensure ai_goal_runs indexes failed", "err", err)
	}

	// Phase 7: kill switch + portfolio limits, audit log.
	systemRepo := mongostore.NewSystemRepo(db)
	if err := systemRepo.EnsureIndexes(connectCtx); err != nil {
		logger.Warn("ensure system_state indexes failed", "err", err)
	}
	auditRepo := mongostore.NewAuditRepo(db)
	if err := auditRepo.EnsureIndexes(connectCtx); err != nil {
		logger.Warn("ensure audit indexes failed", "err", err)
	}

	// Phase 1.A.1: auth users + invitations. Both repos run their index
	// ensure unconditionally — duplicate-key errors on re-runs are
	// non-fatal.
	userRepo := mongostore.NewUserRepo(db)
	if err := userRepo.EnsureIndexes(connectCtx); err != nil {
		logger.Warn("ensure users indexes failed", "err", err)
	}
	invitationRepo := mongostore.NewInvitationRepo(db)
	if err := invitationRepo.EnsureIndexes(connectCtx); err != nil {
		logger.Warn("ensure invitations indexes failed", "err", err)
	}
	// First-boot bootstrap log: the very next /auth/register call wins
	// admin role when the collection is empty. Operators look for this
	// log line to know whether they need an invite link.
	if n, err := userRepo.Count(connectCtx); err != nil {
		logger.Warn("user count probe failed", "err", err)
	} else if n == 0 {
		logger.Info("no users yet; first /api/v1/auth/register call becomes admin")
	} else {
		logger.Info("users collection populated", "count", n)
	}

	// Phase 9: Polymarket wallet + prediction strategy/order repos.
	walletRepo := mongostore.NewWalletRepo(db)
	if err := walletRepo.EnsureIndexes(connectCtx); err != nil {
		logger.Warn("ensure polygon_wallets indexes failed", "err", err)
	}
	predStratRepo := mongostore.NewPredictionStrategyRepo(db)
	if err := predStratRepo.EnsureIndexes(connectCtx); err != nil {
		logger.Warn("ensure prediction_strategies indexes failed", "err", err)
	}
	predOrderRepo := mongostore.NewPredictionOrderRepo(db)
	if err := predOrderRepo.EnsureIndexes(connectCtx); err != nil {
		logger.Warn("ensure prediction_orders indexes failed", "err", err)
	}

	// R2 multi-tenant userId backfill. Idempotent — re-runs are no-ops.
	// Every user-scoped collection gets userId="default" on docs that
	// pre-date the boundary. Runs after every EnsureIndexes so the new
	// compound indexes already exist when later reads happen.
	//
	// Node 1.A.2 adds the three previously un-stamped collections
	// (ai_recommendations / optimization_runs / backtest_results); their
	// per-repo EnsureUserIDIndex runs alongside the backfill so the new
	// (userId, *) compound indexes are present after the first boot
	// that picks up this code.
	runUserIDBackfills(connectCtx, logger, optRepo, acctRepo, orderRepo, walletRepo, predStratRepo, predOrderRepo, recRepo, optRunRepo, bktRepo)

	// Phase 7: KEK provider selection. Default is the env-backed Service;
	// `KEK_PROVIDER=aws-kms` / `gcp-kms` swap to a stub that errors at
	// runtime — production swap requires the corresponding SDK.
	kekProvider := selectKEKProvider(cryptoSvc, logger)
	envelope := crypto.NewEnvelopeWithProvider(kekProvider)
	logger.Info("envelope crypto wired", "kek", envelope.KEKName())

	// Phase 7 observability registry. Cheap when nothing scrapes.
	metrics := observability.NewRegistry()
	auditMW, err := auditmw.New(auditmw.Config{Writer: auditRepo, BufferSize: 1024, Log: logger})
	if err != nil {
		logger.Error("audit middleware init failed", "err", err)
		os.Exit(1)
	}
	go auditMW.Start(rootCtx)

	// ---- Phase 2 wiring: Timescale pool + quant gRPC client (best-effort) ----
	var tsStore *tsstore.Store
	var tsPool interface{ Close() }
	if cfg.TimescaleDSN != "" {
		pool, err := tsstore.Connect(rootCtx, cfg.TimescaleDSN)
		if err != nil {
			// Non-fatal: log + continue. Market endpoints will return 503.
			logger.Warn("timescale connect failed; market endpoints disabled", "err", err)
		} else {
			// Idempotent schema migration. docker-entrypoint-initdb.d only
			// fires on a virgin data dir, so a re-attached compose volume
			// silently skips the SQL. Re-applying every boot guarantees the
			// tables exist regardless of volume state.
			if err := tsstore.Migrate(rootCtx, pool, logger); err != nil {
				logger.Warn("timescale migrate had errors (continuing)", "err", err)
			}
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
			Redis:          redisClient,
			OrderRepo:      orderRepo,
			OptionRepo:     optRepo,
			AccountRepo:    acctRepo,
			Envelope:       envelope,
			Gate:           gate,
			SystemRepo:     systemRepo,
			PortfolioStats: orderRepo,
			ExchangeMeta:   metaRepo,
			Log:            logger,
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

	// ---- Phase 9 wiring: Polymarket gate + CLOB client + prediction engine -
	// The Polymarket gate is its own type but shares the underlying
	// Phase 4 TokenStore — opening one mainnet window opens both perp +
	// prediction. Default RPC is Noop (no Polygon dial); operators set
	// POLYGON_RPC_URL to wire a real client when ready (production path
	// requires a full ethclient implementation in wallet/polygon/rpc.go;
	// the audit-loop path tolerates the Noop until that PR lands).
	polymarketEnvEnabled := os.Getenv("POLYMARKET_TRADING_ENABLED") == "true"
	predGate := polymarket.GateFunc{
		AllowedFn:    gate.Allowed, // shares TokenStore with perp engine
		EnvEnabledFn: func() bool { return polymarketEnvEnabled },
	}
	if polymarketEnvEnabled {
		logger.Warn("POLYMARKET_TRADING_ENABLED=true — Polymarket mainnet allowed once admin confirms a token")
	} else {
		logger.Info("polymarket trading disabled (set POLYMARKET_TRADING_ENABLED=true to opt in)")
	}
	clobURL := os.Getenv("POLYMARKET_CLOB_URL")
	clobClient := polymarket.NewClient(clobURL)
	walletRPC := walletpkg.RPC(walletpkg.NoopRPC{})
	if rpcURL := os.Getenv("POLYGON_RPC_URL"); rpcURL != "" {
		// Production wiring: dial the JSON-RPC node and bind the
		// ethclient-backed RPC. On dial failure we log a warning and
		// fall back to NoopRPC so the gateway boots even when the node
		// is briefly unavailable; /wallets/:id/approve will then 503
		// with ErrRPCNotConfigured until the operator restarts with a
		// healthy endpoint.
		dialCtx, dialCancel := context.WithTimeout(rootCtx, 10*time.Second)
		ethRPC, ethErr := walletpkg.NewEthClientRPC(dialCtx, rpcURL, logger)
		dialCancel()
		if ethErr != nil {
			logger.Warn("polygon RPC dial failed — falling back to NoopRPC", "url", rpcURL, "err", ethErr)
		} else {
			walletRPC = ethRPC
			logger.Info("polygon RPC connected", "url", rpcURL)
		}
	}

	var predEngine *predictionengine.Engine
	if redisClient != nil {
		predEngine = predictionengine.New(predictionengine.Deps{
			Redis:          redisClient,
			StrategyRepo:   predStratRepo,
			OrderRepo:      predOrderRepo,
			WalletRepo:     walletRepo,
			Envelope:       envelope,
			CLOB:           clobClient,
			Gate:           predGate,
			SystemRepo:     systemRepo,
			PortfolioStats: orderRepo,
			Log:            logger,
		})
		go func() {
			if err := predEngine.Start(rootCtx); err != nil && !errors.Is(err, context.Canceled) {
				logger.Error("prediction engine stopped", "err", err)
			}
		}()
		logger.Info("prediction engine started", "stream", predictionengine.CommandSubmitStream)
	} else {
		logger.Info("prediction engine disabled (no REDIS_URL)")
	}

	e := gwhttp.NewRouter(gwhttp.Deps{
		OptionRepo:          optRepo,
		AccountRepo:         acctRepo,
		BacktestRepo:        bktRepo,
		OrderRepo:           orderRepo,
		ExchangeMetaRepo:    metaRepo,
		RecommendationRepo:  recRepo,
		OptimizationRunRepo: optRunRepo,
		AIGoalRunRepo:       aiGoalRunRepo,
		SystemRepo:          systemRepo,
		AuditRepo:           auditRepo,
		Crypto:              cryptoSvc,
		Envelope:            envelope,
		Timescale:           tsStore,
		Quant:               quantCli,
		AdminKey:            cfg.AdminKey,
		Redis:               redisClient,
		OrderEngine:         orderEngine,
		AuditMiddleware:     auditMW,
		Metrics:             metrics,

		WalletRepo:             walletRepo,
		PredictionStrategyRepo: predStratRepo,
		PredictionOrderRepo:    predOrderRepo,
		WalletRPC:              walletRPC,
		PredictionEngine:       predEngine,

		UserRepo:       userRepo,
		InvitationRepo: invitationRepo,
		MongoDB:        db,

		RequireUserID:  cfg.RequireUserID,
		AllowedOrigins: cfg.AllowedOrigins,

		Config: cfg,

		// Node 3.E.2: surface build provenance in /settings/system-info.
		BuildSHA: buildSHA,
		BuildAt:  buildAt,
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

// selectKEKProvider chooses a [crypto.KEKProvider] based on the
// KEK_PROVIDER env var. Default is the env-backed AES-256-GCM Service.
// AWS / GCP variants return stubs that surface ErrKEKNotConfigured at
// runtime — production swap requires the corresponding SDK; see
// gateway/internal/crypto/kek.go for the integration shape.
func selectKEKProvider(svc *crypto.Service, log *slog.Logger) crypto.KEKProvider {
	switch os.Getenv("KEK_PROVIDER") {
	case "aws-kms":
		log.Warn("KEK_PROVIDER=aws-kms — using stub; runtime calls will fail until SDK is wired")
		return crypto.NewAWSKMSKEKProvider(os.Getenv("AWS_KMS_KEY_ID"), os.Getenv("AWS_REGION"))
	case "gcp-kms":
		log.Warn("KEK_PROVIDER=gcp-kms — using stub; runtime calls will fail until SDK is wired")
		return crypto.NewGCPKMSKEKProvider(os.Getenv("GCP_KMS_KEY_NAME"))
	default:
		return crypto.NewEnvKEKProvider(svc)
	}
}

// runUserIDBackfills upserts userId="default" onto every doc in the
// user-scoped collections that pre-dates the R2 multi-tenant boundary.
// Each call is idempotent; subsequent boots become no-ops once every
// row carries the field. Failures are logged but never fatal — a Mongo
// blip should not block gateway startup.
//
// Node 1.A.2 added the last three collections (ai_recommendations /
// optimization_runs / backtest_results) and made their per-repo
// EnsureUserIDIndex part of the same loop so the new compound indexes
// are guaranteed to exist after the first boot that picks up this
// code. The order matters only for log readability — operations on
// distinct collections are independent.
func runUserIDBackfills(
	ctx context.Context,
	log *slog.Logger,
	opt *mongostore.OptionRepo,
	acct *mongostore.AccountRepo,
	order *mongostore.OrderRepo,
	wallet *mongostore.WalletRepo,
	predStrat *mongostore.PredictionStrategyRepo,
	predOrder *mongostore.PredictionOrderRepo,
	rec *mongostore.RecommendationRepo,
	optRun *mongostore.OptimizationRunRepo,
	bkt *mongostore.BacktestRepo,
) {
	type job struct {
		name      string
		backfill  func(context.Context) (int64, error)
		ensureIdx func(context.Context) error // optional Node 1.A.2 (userId,*) index ensure
	}
	jobs := []job{
		{"options", opt.BackfillMissingUserID, nil},
		{"accounts", acct.BackfillMissingUserID, nil},
		{"order_log", order.BackfillMissingUserID, nil},
		{"polygon_wallets", wallet.BackfillMissingUserID, nil},
		{"prediction_strategies", predStrat.BackfillMissingUserID, nil},
		{"prediction_orders", predOrder.BackfillMissingUserID, nil},
		{"ai_recommendations", rec.BackfillMissingUserID, rec.EnsureUserIDIndex},
		{"optimization_runs", optRun.BackfillMissingUserID, optRun.EnsureUserIDIndex},
		{"backtest_results", bkt.BackfillMissingUserID, bkt.EnsureUserIDIndex},
	}
	for _, j := range jobs {
		n, err := j.backfill(ctx)
		if err != nil {
			log.Warn("userId backfill failed", "collection", j.name, "err", err)
		} else if n > 0 {
			log.Info("userId backfill applied", "collection", j.name, "docs", n)
		}
		if j.ensureIdx != nil {
			if err := j.ensureIdx(ctx); err != nil {
				log.Warn("ensure userId index failed", "collection", j.name, "err", err)
			}
		}
	}
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

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
	gwhttp "github.com/finance_next/gateway/internal/http"
	mongostore "github.com/finance_next/gateway/internal/store/mongo"
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

	envelope := crypto.NewEnvelope(cryptoSvc)

	e := gwhttp.NewRouter(gwhttp.Deps{
		OptionRepo:  optRepo,
		AccountRepo: acctRepo,
		Crypto:      cryptoSvc,
		Envelope:    envelope,
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

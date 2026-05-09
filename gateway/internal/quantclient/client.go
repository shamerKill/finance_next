// Package quantclient is a thin wrapper around the auto-generated gRPC
// stubs for the Python quant worker. It lives behind an interface so HTTP
// handlers can inject a fake in tests without spinning up a real gRPC
// channel.
package quantclient

import (
	"context"
	"fmt"
	"time"

	quantv1 "github.com/finance_next/shared-proto/gen/go/quantpb/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// Client is the minimal surface the gateway uses. We DO NOT re-export the
// full QuantClient interface — only the methods phases 2 + 3 actually call.
// More methods get added as later phases need them.
type Client interface {
	IngestNow(ctx context.Context, req *quantv1.IngestRequest) (*quantv1.IngestAck, error)

	// Phase 3 — backtest RPCs.
	RunBacktest(ctx context.Context, req *quantv1.BacktestRequest) (*quantv1.BacktestHandle, error)
	GetBacktestStatus(ctx context.Context, req *quantv1.GetBacktestStatusRequest) (*quantv1.BacktestStatus, error)
	StreamBacktestProgress(ctx context.Context, req *quantv1.GetBacktestStatusRequest) (quantv1.Quant_StreamBacktestProgressClient, error)

	// Phase 6 — optimization RPCs.
	StartOptimization(ctx context.Context, req *quantv1.OptimizationRequest) (*quantv1.StudyHandle, error)
	GetOptimizationStatus(ctx context.Context, req *quantv1.StudyHandle) (*quantv1.OptimizationStatus, error)

	Close() error
}

type grpcClient struct {
	conn *grpc.ClientConn
	stub quantv1.QuantClient
}

// Dial opens an insecure connection to the quant gRPC server. Inside the
// docker network this is a clear-text private link; phase 7 swaps in mTLS
// once the auth story is settled.
func Dial(ctx context.Context, addr string) (Client, error) {
	if addr == "" {
		return nil, fmt.Errorf("quant grpc address is empty")
	}
	dialCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	conn, err := grpc.DialContext(
		dialCtx,
		addr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithBlock(),
	)
	if err != nil {
		return nil, fmt.Errorf("dial quant grpc %q: %w", addr, err)
	}
	return &grpcClient{
		conn: conn,
		stub: quantv1.NewQuantClient(conn),
	}, nil
}

func (c *grpcClient) IngestNow(
	ctx context.Context,
	req *quantv1.IngestRequest,
) (*quantv1.IngestAck, error) {
	return c.stub.IngestNow(ctx, req)
}

func (c *grpcClient) RunBacktest(
	ctx context.Context,
	req *quantv1.BacktestRequest,
) (*quantv1.BacktestHandle, error) {
	return c.stub.RunBacktest(ctx, req)
}

func (c *grpcClient) GetBacktestStatus(
	ctx context.Context,
	req *quantv1.GetBacktestStatusRequest,
) (*quantv1.BacktestStatus, error) {
	return c.stub.GetBacktestStatus(ctx, req)
}

func (c *grpcClient) StreamBacktestProgress(
	ctx context.Context,
	req *quantv1.GetBacktestStatusRequest,
) (quantv1.Quant_StreamBacktestProgressClient, error) {
	return c.stub.StreamBacktestProgress(ctx, req)
}

func (c *grpcClient) StartOptimization(
	ctx context.Context,
	req *quantv1.OptimizationRequest,
) (*quantv1.StudyHandle, error) {
	return c.stub.StartOptimization(ctx, req)
}

func (c *grpcClient) GetOptimizationStatus(
	ctx context.Context,
	req *quantv1.StudyHandle,
) (*quantv1.OptimizationStatus, error) {
	return c.stub.GetOptimizationStatus(ctx, req)
}

func (c *grpcClient) Close() error {
	if c.conn == nil {
		return nil
	}
	return c.conn.Close()
}

// LazyClient defers Dial until the first call so the gateway can boot even
// if the quant worker is offline. Useful in dev when you bring services up
// in any order.
type LazyClient struct {
	addr  string
	inner Client
}

// NewLazy returns a Client whose Dial is deferred. Concurrent first calls
// race; the loser closes its winning conn — acceptable for dev.
func NewLazy(addr string) *LazyClient {
	return &LazyClient{addr: addr}
}

func (l *LazyClient) ensure(ctx context.Context) (Client, error) {
	if l.inner != nil {
		return l.inner, nil
	}
	c, err := Dial(ctx, l.addr)
	if err != nil {
		return nil, err
	}
	l.inner = c
	return c, nil
}

func (l *LazyClient) IngestNow(
	ctx context.Context,
	req *quantv1.IngestRequest,
) (*quantv1.IngestAck, error) {
	c, err := l.ensure(ctx)
	if err != nil {
		return nil, err
	}
	return c.IngestNow(ctx, req)
}

func (l *LazyClient) RunBacktest(
	ctx context.Context,
	req *quantv1.BacktestRequest,
) (*quantv1.BacktestHandle, error) {
	c, err := l.ensure(ctx)
	if err != nil {
		return nil, err
	}
	return c.RunBacktest(ctx, req)
}

func (l *LazyClient) GetBacktestStatus(
	ctx context.Context,
	req *quantv1.GetBacktestStatusRequest,
) (*quantv1.BacktestStatus, error) {
	c, err := l.ensure(ctx)
	if err != nil {
		return nil, err
	}
	return c.GetBacktestStatus(ctx, req)
}

func (l *LazyClient) StreamBacktestProgress(
	ctx context.Context,
	req *quantv1.GetBacktestStatusRequest,
) (quantv1.Quant_StreamBacktestProgressClient, error) {
	c, err := l.ensure(ctx)
	if err != nil {
		return nil, err
	}
	return c.StreamBacktestProgress(ctx, req)
}

func (l *LazyClient) StartOptimization(
	ctx context.Context,
	req *quantv1.OptimizationRequest,
) (*quantv1.StudyHandle, error) {
	c, err := l.ensure(ctx)
	if err != nil {
		return nil, err
	}
	return c.StartOptimization(ctx, req)
}

func (l *LazyClient) GetOptimizationStatus(
	ctx context.Context,
	req *quantv1.StudyHandle,
) (*quantv1.OptimizationStatus, error) {
	c, err := l.ensure(ctx)
	if err != nil {
		return nil, err
	}
	return c.GetOptimizationStatus(ctx, req)
}

func (l *LazyClient) Close() error {
	if l.inner == nil {
		return nil
	}
	return l.inner.Close()
}

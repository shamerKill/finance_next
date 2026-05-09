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
// full QuantClient interface — only the methods Phase 2 actually calls.
// More methods get added as later phases need them.
type Client interface {
	IngestNow(ctx context.Context, req *quantv1.IngestRequest) (*quantv1.IngestAck, error)
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

func (l *LazyClient) Close() error {
	if l.inner == nil {
		return nil
	}
	return l.inner.Close()
}

package http

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/finance_next/gateway/internal/http/handlers"
	auditmw "github.com/finance_next/gateway/internal/http/middleware"
	"github.com/finance_next/gateway/internal/ws"
	"github.com/redis/go-redis/v9"
)

// jtiRevocationStore is the narrow surface buildWSVerifier needs to check
// whether a JWT's jti has been revoked. The production wiring passes a
// *redis.Client which satisfies this interface via the adapter below;
// tests can pass an in-memory map without pulling miniredis into the
// build graph.
//
// Get must return ("", redis.Nil) for "key absent" (= not revoked) and
// (value, nil) for "key present" (= revoked). Any other error is treated
// by the caller as a transient backend failure and the verifier fails
// open — same semantics as the HTTP middleware path (a Redis blip must
// not lock every legitimate WS subscriber out).
type jtiRevocationStore interface {
	Get(ctx context.Context, key string) (string, error)
}

// redisRevocationStore adapts a *redis.Client to jtiRevocationStore.
// Implemented as a thin wrapper so the verifier function itself stays
// agnostic of go-redis internals.
type redisRevocationStore struct{ c *redis.Client }

func (r redisRevocationStore) Get(ctx context.Context, key string) (string, error) {
	return r.c.Get(ctx, key).Result()
}

// buildWSVerifier returns the AuthVerifier closure mounted on /ws. The
// closure
//
//  1. reads the `auth_token` cookie
//  2. validates the JWT signature + claims via handlers.ParseJWT
//  3. checks the jti against the revocation set (auth:revoked:<jti>) —
//     mirroring middleware/auth.go so a logged-out token can't be reused
//     via a leaked cookie to subscribe to /ws
//
// A nil revocation store skips step 3 (dev fallback when no Redis is
// wired). A non-nil store whose Get fails with redis.Nil treats the
// token as not-revoked; any other error is logged-but-passed so a
// Redis outage doesn't lock out legitimate sessions (HTTP semantics).
func buildWSVerifier(secret string, store jtiRevocationStore) ws.AuthVerifier {
	if secret == "" {
		return nil
	}
	return func(r *http.Request) (string, string, error) {
		cookie, err := r.Cookie(auditmw.AuthCookieName)
		if err != nil || cookie == nil || cookie.Value == "" {
			return "", "", errors.New("ws: missing auth_token cookie")
		}
		cl, perr := handlers.ParseJWT(cookie.Value, secret)
		if perr != nil {
			return "", "", fmt.Errorf("ws: parse jwt: %w", perr)
		}
		if cl.UserID == "" {
			return "", "", errors.New("ws: empty subject claim")
		}
		// JTI revocation check. Mirrors middleware/auth.go:isRevoked.
		// - redis.Nil → key absent → not revoked → admit
		// - non-nil value → revoked → reject
		// - any other error → Redis hiccup → admit (HTTP path is the
		//   same, see middleware/auth.go which discards the error from
		//   isRevoked and treats it as "not revoked")
		if store != nil && cl.ID != "" {
			v, gerr := store.Get(r.Context(), "auth:revoked:"+cl.ID)
			if gerr == nil && v != "" {
				return "", "", errors.New("ws: token revoked")
			}
			// errors.Is(gerr, redis.Nil) or any other non-nil error →
			// admit (fail-open on backend errors, fail-closed only on
			// confirmed positive revocation).
		}
		return cl.UserID, cl.Role, nil
	}
}

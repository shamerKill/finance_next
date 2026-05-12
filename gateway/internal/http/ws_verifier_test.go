package http

import (
	"context"
	nethttp "net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/finance_next/gateway/internal/http/handlers"
	auditmw "github.com/finance_next/gateway/internal/http/middleware"
	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"
)

// fakeRevocationStore is a tiny in-memory jtiRevocationStore for the
// FIX-B test. revoked["<jti>"] = true → Get returns ("revoked", nil).
// Anything else returns ("", redis.Nil) — same semantics as the real
// *redis.Client.
type fakeRevocationStore struct {
	revoked map[string]bool
	getErr  error // when non-nil, returned verbatim from Get to simulate Redis outage
}

func (f *fakeRevocationStore) Get(_ context.Context, key string) (string, error) {
	if f.getErr != nil {
		return "", f.getErr
	}
	jti := strings.TrimPrefix(key, "auth:revoked:")
	if f.revoked[jti] {
		return "revoked", nil
	}
	return "", redis.Nil
}

// signTestJWT mints a real HS256 token with a known jti so the verifier
// (which delegates to handlers.ParseJWT) sees the same shape as
// production. We can't use handlers.signJWT directly (it's unexported)
// so we re-implement the minimal claim set here — keeping the test
// hermetic and independent of the handler package's internals.
func signTestJWT(t *testing.T, secret, userID, role, jti string) string {
	t.Helper()
	now := time.Now().UTC()
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":  userID,
		"jti":  jti,
		"iat":  now.Unix(),
		"exp":  now.Add(time.Hour).Unix(),
		"role": role,
	})
	s, err := tok.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("sign jwt: %v", err)
	}
	return s
}

// TestBuildWSVerifier_AcceptsValidUnrevokedToken pins the happy path.
func TestBuildWSVerifier_AcceptsValidUnrevokedToken(t *testing.T) {
	const secret = "wave1-fix-b-test-secret"
	store := &fakeRevocationStore{revoked: map[string]bool{}}
	v := buildWSVerifier(secret, store)

	tok := signTestJWT(t, secret, "alice", "user", "jti-good")
	req := httptest.NewRequest("GET", "/ws", nil)
	req.AddCookie(&nethttp.Cookie{Name: auditmw.AuthCookieName, Value: tok})

	uid, role, err := v(req)
	if err != nil {
		t.Fatalf("expected admit, got err: %v", err)
	}
	if uid != "alice" || role != "user" {
		t.Fatalf("expected (alice,user) got (%s,%s)", uid, role)
	}
}

// TestBuildWSVerifier_RejectsRevokedJTI is the core FIX-B guarantee:
// a token whose jti is in `auth:revoked:*` MUST be rejected even when
// the signature + claim shape are otherwise valid. Pre-FIX, the
// router-internal verifier returned the userID and the WS upgrade
// succeeded, letting a leaked-after-logout token keep streaming.
func TestBuildWSVerifier_RejectsRevokedJTI(t *testing.T) {
	const secret = "wave1-fix-b-test-secret"
	store := &fakeRevocationStore{revoked: map[string]bool{"jti-revoked": true}}
	v := buildWSVerifier(secret, store)

	tok := signTestJWT(t, secret, "alice", "user", "jti-revoked")
	req := httptest.NewRequest("GET", "/ws", nil)
	req.AddCookie(&nethttp.Cookie{Name: auditmw.AuthCookieName, Value: tok})

	uid, _, err := v(req)
	if err == nil {
		t.Fatal("expected revoked token to be rejected")
	}
	if uid != "" {
		t.Errorf("expected empty userID on rejection, got %q", uid)
	}
	if !strings.Contains(err.Error(), "revoked") {
		t.Errorf("expected error to mention 'revoked', got: %v", err)
	}
}

// TestBuildWSVerifier_NilStore_SkipsRevocationCheck verifies the dev
// fallback: when no Redis is wired, the verifier admits a syntactically
// valid token without consulting any revocation set. This preserves
// the legacy single-process developer workflow (no Redis required).
func TestBuildWSVerifier_NilStore_SkipsRevocationCheck(t *testing.T) {
	const secret = "wave1-fix-b-test-secret"
	v := buildWSVerifier(secret, nil)

	tok := signTestJWT(t, secret, "bob", "admin", "jti-whatever")
	req := httptest.NewRequest("GET", "/ws", nil)
	req.AddCookie(&nethttp.Cookie{Name: auditmw.AuthCookieName, Value: tok})

	uid, role, err := v(req)
	if err != nil {
		t.Fatalf("expected admit, got err: %v", err)
	}
	if uid != "bob" || role != "admin" {
		t.Errorf("expected (bob,admin), got (%s,%s)", uid, role)
	}
}

// TestBuildWSVerifier_BackendError_FailsOpen pins the "Redis outage
// must not lock out legitimate users" semantics. Same behaviour as
// middleware/auth.go which discards a non-Nil error from isRevoked.
func TestBuildWSVerifier_BackendError_FailsOpen(t *testing.T) {
	const secret = "wave1-fix-b-test-secret"
	store := &fakeRevocationStore{getErr: redisOutageErr{}}
	v := buildWSVerifier(secret, store)

	tok := signTestJWT(t, secret, "carol", "user", "jti-any")
	req := httptest.NewRequest("GET", "/ws", nil)
	req.AddCookie(&nethttp.Cookie{Name: auditmw.AuthCookieName, Value: tok})

	uid, _, err := v(req)
	if err != nil {
		t.Fatalf("expected admit on backend error, got: %v", err)
	}
	if uid != "carol" {
		t.Errorf("expected carol, got %q", uid)
	}
}

// TestBuildWSVerifier_MissingCookie_Rejected pins the pre-FIX-B baseline
// still holds (no cookie → reject).
func TestBuildWSVerifier_MissingCookie_Rejected(t *testing.T) {
	const secret = "wave1-fix-b-test-secret"
	v := buildWSVerifier(secret, nil)

	req := httptest.NewRequest("GET", "/ws", nil)
	if _, _, err := v(req); err == nil {
		t.Fatal("expected reject on missing cookie")
	}
}

// TestBuildWSVerifier_NoSecret_ReturnsNilVerifier pins the dev-mode
// short-circuit: when no JWT secret is configured the builder returns
// a nil AuthVerifier so the WS handler falls through to its
// no-auth-verifier path. router.go relies on this branch.
func TestBuildWSVerifier_NoSecret_ReturnsNilVerifier(t *testing.T) {
	if v := buildWSVerifier("", nil); v != nil {
		t.Fatal("expected nil verifier when secret is empty")
	}
}

// --- helpers --------------------------------------------------------

// redisOutageErr is a stand-in for a transient Redis connectivity
// failure (anything that's NOT redis.Nil). The verifier MUST fail-open
// in this case so a Redis blip doesn't disconnect every legitimate
// /ws session.
type redisOutageErr struct{}

func (redisOutageErr) Error() string { return "redis: connection refused" }

// Ensure the handlers package is referenced (so its init / imports are
// loaded even if the test runner reorders the file). buildWSVerifier
// uses handlers.ParseJWT internally; if a refactor accidentally drops
// the import the test would still build, but this keeps the dep graph
// explicit.
var _ = handlers.ParseJWT

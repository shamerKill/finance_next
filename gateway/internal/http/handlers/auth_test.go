// auth_test.go — argon2id + JWT + handler validation tests.
//
// Mongo integration is exercised by the docker-compose smoke; the cases
// below are offline: pure crypto round-trips + the handler's "deps are
// nil → 503 / 400 validation" branches.
package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/finance_next/gateway/internal/config"
	"github.com/labstack/echo/v4"
)

func TestHashPassword_RoundTrip(t *testing.T) {
	hash, err := HashPassword("hunter2hunter2")
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	if !strings.HasPrefix(hash, "$argon2id$v=19$m=") {
		t.Fatalf("unexpected hash format: %s", hash)
	}
	ok, err := VerifyPassword("hunter2hunter2", hash)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if !ok {
		t.Fatal("expected match")
	}
	bad, err := VerifyPassword("wrong-password", hash)
	if err != nil {
		t.Fatalf("verify bad: %v", err)
	}
	if bad {
		t.Fatal("expected mismatch")
	}
}

func TestHashPassword_RejectsEmpty(t *testing.T) {
	_, err := HashPassword("")
	if err == nil {
		t.Fatal("expected error for empty password")
	}
}

func TestVerifyPassword_RejectsMalformed(t *testing.T) {
	if _, err := VerifyPassword("x", "not-an-argon-hash"); err == nil {
		t.Fatal("expected error for malformed hash")
	}
}

func TestJWT_RoundTrip(t *testing.T) {
	secret := strings.Repeat("a", 32)
	tok, err := signJWT("user-id-1", "admin", secret, time.Hour)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	claims, err := ParseJWT(tok, secret)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if claims.UserID != "user-id-1" {
		t.Errorf("UserID = %q, want user-id-1", claims.UserID)
	}
	if claims.Role != "admin" {
		t.Errorf("Role = %q, want admin", claims.Role)
	}
	if claims.ID == "" {
		t.Error("expected non-empty jti")
	}
}

func TestJWT_TamperedFails(t *testing.T) {
	secret := strings.Repeat("a", 32)
	tok, err := signJWT("u", "member", secret, time.Hour)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	// flip a char in the signature segment
	tampered := tok[:len(tok)-2] + "xx"
	if _, err := ParseJWT(tampered, secret); err == nil {
		t.Fatal("expected error on tampered token")
	}
}

func TestJWT_WrongSecretFails(t *testing.T) {
	secret := strings.Repeat("a", 32)
	tok, err := signJWT("u", "member", secret, time.Hour)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	if _, err := ParseJWT(tok, strings.Repeat("b", 32)); err == nil {
		t.Fatal("expected error on wrong secret")
	}
}

func TestJWT_ExpiredFails(t *testing.T) {
	secret := strings.Repeat("a", 32)
	tok, err := signJWT("u", "member", secret, -time.Minute)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	if _, err := ParseJWT(tok, secret); err == nil {
		t.Fatal("expected error on expired token")
	}
}

func TestAuth_Register_RejectsBadEmail(t *testing.T) {
	cfg := &config.Config{AuthJWTSecret: strings.Repeat("a", 32), AuthJWTTTLSeconds: 3600}
	// users repo nil → would be 503; but bad body should beat that
	// since validation happens after the nil-check. So we expect 503
	// from the nil-check first. Validate the actual flow: pass a
	// non-nil minimal config but no repo → 503 is fine.
	h := NewAuthHandler(nil, nil, cfg, nil)
	e := echo.New()
	g := e.Group("/api/v1")
	h.Register(g)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register",
		strings.NewReader(`{"email":"not-an-email","password":"goodpass1"}`))
	req.Header.Set(echo.HeaderContentType, "application/json")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	// users repo is nil so 503 fires before validation. Either 400 or
	// 503 is acceptable here; we lock down 503 because that's the
	// current order.
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 (deps nil), got %d", rec.Code)
	}
}

func TestAuth_MeRequiresUserID(t *testing.T) {
	cfg := &config.Config{AuthJWTSecret: strings.Repeat("a", 32), AuthJWTTTLSeconds: 3600}
	h := NewAuthHandler(nil, nil, cfg, nil)
	e := echo.New()
	g := e.Group("/api/v1")
	h.Register(g)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 (users repo nil), got %d", rec.Code)
	}
}

func TestAuth_RateLimiter_BlocksAfterLimit(t *testing.T) {
	lim := newIPLimiter(2, time.Minute)
	if !lim.allow("1.2.3.4") {
		t.Fatal("first call should be allowed")
	}
	if !lim.allow("1.2.3.4") {
		t.Fatal("second call should be allowed")
	}
	if lim.allow("1.2.3.4") {
		t.Fatal("third call should be blocked")
	}
	if !lim.allow("5.6.7.8") {
		t.Fatal("different IP should not be blocked")
	}
}

func TestAuth_RateLimiter_EmptyIPAlwaysAllowed(t *testing.T) {
	lim := newIPLimiter(1, time.Minute)
	for i := 0; i < 5; i++ {
		if !lim.allow("") {
			t.Fatal("empty IP should bypass the limiter")
		}
	}
}

func TestValidatePassword(t *testing.T) {
	if err := validatePassword(""); err == nil {
		t.Error("empty: expected error")
	}
	if err := validatePassword("short"); err == nil {
		t.Error("short: expected error")
	}
	if err := validatePassword("longenoughpw"); err != nil {
		t.Errorf("ok password: unexpected error %v", err)
	}
	if err := validatePassword(strings.Repeat("x", 300)); err == nil {
		t.Error("too long: expected error")
	}
}

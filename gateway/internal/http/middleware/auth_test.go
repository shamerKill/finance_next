// auth_test.go — exercises the JWT cookie auth middleware.
//
// We inject a stub JWTParser so tests don't pull in the real signer.
// Coverage:
//   * whitelist path bypasses auth
//   * valid cookie → context populated, next called
//   * missing cookie + non-whitelisted → 401
//   * tampered / invalid cookie + no header → 401
//   * cookie absent but X-User-Id header set → next (s2s backdoor)
//   * cookie absent but X-Admin-Key header set → next (s2s backdoor)
package middleware

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"
)

// stubParser returns AuthClaims when token == "good" and an error otherwise.
func stubParser(token string) (*AuthClaims, error) {
	if token == "good" {
		return &AuthClaims{UserID: "u-1", Role: "admin", JTI: "jti-1"}, nil
	}
	return nil, errors.New("invalid token")
}

func runWithAuth(t *testing.T, req *http.Request) (*httptest.ResponseRecorder, bool, echo.Context) {
	t.Helper()
	e := echo.New()
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	called := false
	handler := WithAuth(AuthConfig{Secret: "test", Parser: stubParser})(func(c echo.Context) error {
		called = true
		return c.NoContent(http.StatusOK)
	})
	if err := handler(c); err != nil {
		// echo returns *echo.HTTPError; serialise it through the
		// default error handler so the recorder reflects the wire
		// response.
		e.HTTPErrorHandler(err, c)
	}
	return rec, called, c
}

func TestWithAuth_WhitelistBypasses(t *testing.T) {
	for _, p := range []string{
		"/api/v1/auth/register",
		"/api/v1/auth/login",
		"/api/v1/auth/accept-invite",
		"/api/v1/auth/logout",
	} {
		req := httptest.NewRequest(http.MethodPost, p, nil)
		rec, called, _ := runWithAuth(t, req)
		if !called {
			t.Errorf("path %s: expected handler called, got blocked (status=%d)", p, rec.Code)
		}
	}
}

func TestWithAuth_ValidCookiePopulatesContext(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/option", nil)
	req.AddCookie(&http.Cookie{Name: AuthCookieName, Value: "good"})
	rec, called, c := runWithAuth(t, req)
	if !called {
		t.Fatalf("expected handler called, got status=%d body=%s", rec.Code, rec.Body.String())
	}
	if uid, _ := c.Get(ContextKey).(string); uid != "u-1" {
		t.Errorf("expected userId=u-1, got %q", uid)
	}
	if role, _ := c.Get(ContextRoleKey).(string); role != "admin" {
		t.Errorf("expected role=admin, got %q", role)
	}
}

func TestWithAuth_MissingCookieAnd401(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/option", nil)
	rec, called, _ := runWithAuth(t, req)
	if called {
		t.Fatal("handler should not be invoked on missing cookie")
	}
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "unauthorized") {
		t.Errorf("expected body to contain 'unauthorized', got %s", rec.Body.String())
	}
}

func TestWithAuth_TamperedCookie401(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/option", nil)
	req.AddCookie(&http.Cookie{Name: AuthCookieName, Value: "tampered"})
	rec, called, _ := runWithAuth(t, req)
	if called {
		t.Fatal("handler should not be invoked on tampered cookie")
	}
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rec.Code)
	}
}

func TestWithAuth_HeaderBackdoor_UserID(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/option", nil)
	req.Header.Set(HeaderUserID, "alice")
	_, called, _ := runWithAuth(t, req)
	if !called {
		t.Fatal("expected handler called via X-User-Id backdoor")
	}
}

func TestWithAuth_HeaderBackdoor_AdminKey(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/audit", nil)
	req.Header.Set(HeaderAdminKey, "any")
	_, called, _ := runWithAuth(t, req)
	if !called {
		t.Fatal("expected handler called via X-Admin-Key backdoor")
	}
}

func TestWithAuth_NoSecretReturns503OnCookieAttempt(t *testing.T) {
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/option", nil)
	req.AddCookie(&http.Cookie{Name: AuthCookieName, Value: "anything"})
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	// No Secret AND no Parser — fail loud.
	handler := WithAuth(AuthConfig{})(func(c echo.Context) error {
		return c.NoContent(http.StatusOK)
	})
	if err := handler(c); err != nil {
		e.HTTPErrorHandler(err, c)
	}
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 when secret + parser both unset, got %d (body=%s)", rec.Code, rec.Body.String())
	}
}

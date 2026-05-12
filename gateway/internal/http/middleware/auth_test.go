// auth_test.go — exercises the JWT cookie auth middleware.
//
// We inject a stub JWTParser so tests don't pull in the real signer.
// Coverage:
//   * whitelist path bypasses auth
//   * valid cookie → context populated, next called
//   * missing cookie + non-whitelisted → 401
//   * tampered / invalid cookie + no header → 401
//   * default config: X-User-Id / X-Admin-Key headers do NOT bypass cookie auth
//   * AllowS2SHeader=true: only matching X-Admin-Key bypasses; bare X-User-Id still 401
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

// TestWithAuth_HeaderBypass_DefaultDenied locks in the post-fix-1 contract:
// the default config (AllowS2SHeader=false) must REJECT requests that
// authenticate only via X-User-Id or X-Admin-Key headers. Cookie auth is
// mandatory on every non-whitelisted path unless an operator opts in.
func TestWithAuth_HeaderBypass_DefaultDenied(t *testing.T) {
	cases := []struct {
		name   string
		header string
		value  string
	}{
		{"x-user-id alone", HeaderUserID, "alice"},
		{"x-admin-key alone", HeaderAdminKey, "secret"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			e := echo.New()
			req := httptest.NewRequest(http.MethodGet, "/api/v1/option", nil)
			req.Header.Set(tc.header, tc.value)
			rec := httptest.NewRecorder()
			c := e.NewContext(req, rec)

			called := false
			handler := WithAuth(AuthConfig{Secret: "test", Parser: stubParser})(func(c echo.Context) error {
				called = true
				return c.NoContent(http.StatusOK)
			})
			if err := handler(c); err != nil {
				e.HTTPErrorHandler(err, c)
			}
			if called {
				t.Fatalf("default cfg should not allow header-only auth (%s=%s)", tc.header, tc.value)
			}
			if rec.Code != http.StatusUnauthorized {
				t.Errorf("expected 401, got %d", rec.Code)
			}
		})
	}
}

// TestWithAuth_HeaderBypass_OptInRequiresAdminKey covers the opt-in path:
// AllowS2SHeader=true + AdminKey="secret" admits only a request that
// presents the matching X-Admin-Key. A wrong key or a bare X-User-Id
// header is still 401.
func TestWithAuth_HeaderBypass_OptInRequiresAdminKey(t *testing.T) {
	cases := []struct {
		name       string
		header     string
		value      string
		wantCalled bool
	}{
		{"matching admin key allows", HeaderAdminKey, "secret", true},
		{"wrong admin key denied", HeaderAdminKey, "wrong", false},
		{"bare x-user-id denied", HeaderUserID, "alice", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			e := echo.New()
			req := httptest.NewRequest(http.MethodGet, "/api/v1/option", nil)
			req.Header.Set(tc.header, tc.value)
			rec := httptest.NewRecorder()
			c := e.NewContext(req, rec)

			called := false
			cfg := AuthConfig{
				Secret:         "test",
				Parser:         stubParser,
				AllowS2SHeader: true,
				AdminKey:       "secret",
			}
			handler := WithAuth(cfg)(func(c echo.Context) error {
				called = true
				return c.NoContent(http.StatusOK)
			})
			if err := handler(c); err != nil {
				e.HTTPErrorHandler(err, c)
			}
			if called != tc.wantCalled {
				t.Fatalf("called=%v, want %v (header=%s=%s, status=%d)", called, tc.wantCalled, tc.header, tc.value, rec.Code)
			}
			if !tc.wantCalled && rec.Code != http.StatusUnauthorized {
				t.Errorf("expected 401, got %d", rec.Code)
			}
		})
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

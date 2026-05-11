// userctx_test.go — exercises the R2 multi-tenant userId middleware.
//
// Three cases:
//   * header present              → context value matches
//   * absent + require=false      → falls back to "default"
//   * absent + require=true       → 400 Bad Request
package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/finance_next/gateway/internal/domain"
	"github.com/labstack/echo/v4"
)

func TestWithUserID_HeaderPresent(t *testing.T) {
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/anything", nil)
	req.Header.Set(HeaderUserID, "alice")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	var captured string
	handler := WithUserID(false)(func(c echo.Context) error {
		captured = FromEcho(c)
		return c.NoContent(http.StatusOK)
	})

	if err := handler(c); err != nil {
		t.Fatalf("handler returned error: %v", err)
	}
	if captured != "alice" {
		t.Errorf("FromEcho = %q, want %q", captured, "alice")
	}
	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusOK)
	}
}

func TestWithUserID_AbsentFallsBackToDefault(t *testing.T) {
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/anything", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	var captured string
	handler := WithUserID(false)(func(c echo.Context) error {
		captured = FromEcho(c)
		return c.NoContent(http.StatusOK)
	})

	if err := handler(c); err != nil {
		t.Fatalf("handler returned error: %v", err)
	}
	if captured != domain.DefaultUserID {
		t.Errorf("FromEcho = %q, want %q (the DefaultUserID fallback)", captured, domain.DefaultUserID)
	}
}

func TestWithUserID_AbsentWhenRequiredReturns400(t *testing.T) {
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/anything", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	handler := WithUserID(true)(func(c echo.Context) error {
		t.Fatal("downstream handler should not be invoked")
		return nil
	})

	err := handler(c)
	if err == nil {
		t.Fatal("expected echo.HTTPError, got nil")
	}
	he, ok := err.(*echo.HTTPError)
	if !ok {
		t.Fatalf("expected *echo.HTTPError, got %T: %v", err, err)
	}
	if he.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", he.Code, http.StatusBadRequest)
	}
}

func TestFromEcho_PanicsWhenMiddlewareMissing(t *testing.T) {
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/anything", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	defer func() {
		r := recover()
		if r == nil {
			t.Fatal("expected panic, got nil")
		}
	}()
	_ = FromEcho(c)
}

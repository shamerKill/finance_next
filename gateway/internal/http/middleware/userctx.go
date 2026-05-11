// userctx.go — multi-tenant userId boundary middleware.
//
// Reads the `X-User-Id` header on every request under /api/v1 and stashes
// the value into the Echo context under the well-known key [ContextKey].
// Handlers retrieve the value via [FromEcho]; the helper panics if the
// middleware wasn't applied so misuse is caught immediately in dev.
//
// Trust model: this is intentionally a thin header pass-through. A future
// auth provider (Auth0 / Clerk / Cognito etc.) is expected to verify a
// JWT or session cookie at the edge and forward the authenticated subject
// in this header. The gateway itself does NOT verify identity here —
// `X-User-Id: bob` is "trust the network in front of us".
//
// Dev fallback: when the header is absent and `REQUIRE_USER_ID` is unset
// (or empty / != "true"), the middleware stashes `domain.DefaultUserID`
// ("default") so single-tenant local development keeps working without
// any client change.
//
// Mounting order matters: register WithUserID BEFORE the audit middleware
// so audit entries can pick up the resolved userId from the context (the
// audit middleware reads from the same Echo context).
package middleware

import (
	"net/http"

	"github.com/finance_next/gateway/internal/domain"
	"github.com/labstack/echo/v4"
)

// HeaderUserID is the request header carrying the caller's userId. Set by
// the upstream auth proxy (or by the dev console writing into
// localStorage); never trusted as a security boundary by the gateway.
const HeaderUserID = "X-User-Id"

// ContextKey is the [echo.Context] key under which the resolved userId is
// stashed by [WithUserID] and read by [FromEcho].
const ContextKey = "userId"

// WithUserID builds the Echo middleware that resolves the per-request
// userId. When `requireHeader` is true an empty / missing header is a
// 400 Bad Request; otherwise the middleware falls back to
// [domain.DefaultUserID] so existing dev workflows are unaffected.
//
// The middleware does no further validation — the header value is stored
// as-is. Auth providers are expected to constrain the format upstream.
func WithUserID(requireHeader bool) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			uid := c.Request().Header.Get(HeaderUserID)
			if uid == "" {
				if requireHeader {
					return echo.NewHTTPError(http.StatusBadRequest,
						"missing required header X-User-Id (set REQUIRE_USER_ID=false for dev fallback)")
				}
				uid = domain.DefaultUserID
			}
			c.Set(ContextKey, uid)
			return next(c)
		}
	}
}

// FromEcho returns the userId stashed by [WithUserID]. The middleware is
// mandatory; calling this from a handler that wasn't mounted under the
// `/api/v1` group panics — fail-fast surfaces the mis-wiring during the
// first request instead of silently leaking another tenant's data.
//
// For background goroutines (order engine workers, reconcile loops) that
// run OUTSIDE an HTTP request, do NOT call FromEcho — derive the userId
// from the owning strategy document instead.
func FromEcho(c echo.Context) string {
	v := c.Get(ContextKey)
	if v == nil {
		panic("middleware/userctx: WithUserID was not applied to this route — every /api/v1 handler must run under WithUserID")
	}
	uid, ok := v.(string)
	if !ok || uid == "" {
		panic("middleware/userctx: userId context value is empty or wrong type")
	}
	return uid
}

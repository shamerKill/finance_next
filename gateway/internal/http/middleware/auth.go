// auth.go — Phase 1.A.1 cookie / JWT authentication middleware.
//
// Mounted on /api/v1 BEFORE WithUserID so successful auth populates the
// userId context value that downstream handlers read via FromEcho. The
// cookie wins: if a valid `auth_token` cookie is present, the resolved
// userId comes from the JWT `sub` claim and the role is exposed under
// the `userRole` Echo context key.
//
// `X-User-Id` header continues to work as a SYSTEM-TO-SYSTEM backdoor:
// when no cookie is present but the header is set, the request is
// allowed through and WithUserID populates the context from the header.
// This is only safe when the gateway sits behind a trusted reverse
// proxy that strips client-supplied X-User-Id headers and re-injects
// the verified subject. Public-facing deployments MUST not trust the
// header — operators set `REQUIRE_USER_ID=true` and a corresponding
// proxy ACL. In Phase 2 we'll lift the header path entirely once every
// internal caller has been moved to cookies/JWT.
//
// White-list: /api/v1/auth/{register,login,accept-invite}. Other
// /api/v1 paths require a valid cookie OR an X-User-Id header.
// /healthz, /metrics, /ws are outside /api/v1 and therefore never
// touched by this middleware.
package middleware

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
	"github.com/redis/go-redis/v9"
)

// AuthCookieName is the cookie carrying the JWT. Must match the value
// the handler writes (handlers.AuthCookieName) — kept as a constant
// here to avoid an import cycle.
const AuthCookieName = "auth_token"

// HeaderAdminKey is the X-Admin-Key header used by /admin/* endpoints.
// Listed here so the middleware can let admin-key callers through when
// no cookie is present (matches the historical s2s flow).
const HeaderAdminKey = "X-Admin-Key"

// ContextRoleKey is the Echo context slot for the resolved role.
const ContextRoleKey = "userRole"

// jwtParser is the function shape used to decode + verify a token.
// Injected by the router so middleware doesn't import the handlers
// package (which would create a cycle).
type AuthClaims struct {
	UserID   string
	Role     string
	JTI      string
	IssuedAt int64
	ExpireAt int64
}

// JWTParser verifies signature + standard claims and returns the
// decoded form. Implementations should reject expired tokens.
type JWTParser func(token string) (*AuthClaims, error)

// AuthConfig holds the runtime knobs for WithAuth.
type AuthConfig struct {
	// Secret is the HS256 signing key. Empty value disables the
	// middleware entirely (every request 503). The router treats this
	// as a misconfiguration, but the middleware itself returns 503 so
	// the failure mode is observable.
	Secret string

	// Parser, when non-nil, overrides the default HS256 parser. Tests
	// inject a stub here so a fixed-string token can stand in for a
	// real signed JWT without re-implementing the JWT library.
	Parser JWTParser

	// Redis is optional. When set, the middleware checks the per-jti
	// blacklist (`auth:revoked:<jti>`) and rejects revoked tokens with
	// 401. nil → blacklist skipped (cookie remains valid until exp).
	Redis *redis.Client

	// WhitelistPrefixes is the set of /api/v1/ path suffixes that bypass
	// auth entirely. Defaults to {"/auth/register", "/auth/login",
	// "/auth/accept-invite", "/auth/logout"}. Logout is whitelisted so
	// the handler itself can decide whether to act on the cookie.
	WhitelistPrefixes []string
}

// DefaultAuthWhitelist returns the canonical bypass list. Mutating the
// returned slice is fine — each call returns a fresh copy.
func DefaultAuthWhitelist() []string {
	return []string{"/auth/register", "/auth/login", "/auth/accept-invite", "/auth/logout"}
}

// ErrAuthMissingSecret is returned by WithAuth at request-time when
// Secret is empty. Wired this way so the router can mount the
// middleware unconditionally and the failure mode is loud + clear.
var ErrAuthMissingSecret = errors.New("auth secret not configured")

// WithAuth builds the Echo middleware. Mount it on the /api/v1 group.
//
// Behaviour:
//   - whitelist path → next.ServeHTTP (no context mutation)
//   - valid cookie  → context["userId"]=sub, context["userRole"]=role; next
//   - no cookie + X-User-Id header set → next (header-based s2s backdoor;
//     WithUserID downstream copies the header into the context)
//   - no cookie + X-Admin-Key set → next (admin-key s2s; same fallback)
//   - otherwise → 401 with body {"error":"unauthorized"}
func WithAuth(cfg AuthConfig) echo.MiddlewareFunc {
	whitelist := cfg.WhitelistPrefixes
	if len(whitelist) == 0 {
		whitelist = DefaultAuthWhitelist()
	}
	parser := cfg.Parser

	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			path := c.Request().URL.Path
			if isWhitelisted(path, whitelist) {
				return next(c)
			}

			// Cookie path (preferred).
			if cookie, err := c.Cookie(AuthCookieName); err == nil && cookie != nil && cookie.Value != "" {
				if cfg.Secret == "" && parser == nil {
					return echo.NewHTTPError(http.StatusServiceUnavailable,
						"auth secret not configured")
				}
				claims, err := parseWith(parser, cookie.Value, cfg.Secret)
				if err == nil {
					if cfg.Redis != nil && claims.JTI != "" {
						if revoked, _ := isRevoked(c.Request().Context(), cfg.Redis, claims.JTI); revoked {
							return unauthorized(c)
						}
					}
					c.Set(ContextKey, claims.UserID)
					c.Set(ContextRoleKey, claims.Role)
					return next(c)
				}
				// Fall through to header backdoor; an invalid cookie
				// alone shouldn't lock out an s2s caller that meant
				// to use the header.
			}

			// Header backdoor (system-to-system). We accept either an
			// explicit X-User-Id (deployments with a trusted reverse
			// proxy) or X-Admin-Key (the legacy /admin/* path which
			// has its own per-handler key check). The handler /
			// downstream middleware enforces the actual authorisation.
			if c.Request().Header.Get(HeaderUserID) != "" ||
				c.Request().Header.Get(HeaderAdminKey) != "" {
				return next(c)
			}

			return unauthorized(c)
		}
	}
}

// parseWith dispatches to the injected parser when present, else to the
// stock HS256 verifier. Keeping the indirection lets tests drive the
// middleware without spinning up the handler package.
func parseWith(parser JWTParser, token, secret string) (*AuthClaims, error) {
	if parser != nil {
		return parser(token)
	}
	// Default HS256 parser lives in the handlers package to share the
	// signing code. We can't import it here (cycle), so we expect the
	// router to plug Parser unconditionally. If neither is wired we
	// surface a clear error.
	_ = secret
	return nil, ErrAuthMissingSecret
}

func isWhitelisted(path string, prefixes []string) bool {
	// We match the suffix part of /api/v1/... so the same list works
	// regardless of where the middleware is mounted (the production
	// mount is on the v1 group, but tests often mount on the root
	// Echo for convenience).
	for _, p := range prefixes {
		if strings.HasSuffix(path, p) || strings.Contains(path, p+"?") {
			return true
		}
	}
	return false
}

func isRevoked(ctx context.Context, r *redis.Client, jti string) (bool, error) {
	v, err := r.Get(ctx, "auth:revoked:"+jti).Result()
	if errors.Is(err, redis.Nil) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return v != "", nil
}

func unauthorized(c echo.Context) error {
	return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
}

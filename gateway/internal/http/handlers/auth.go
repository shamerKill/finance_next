// auth.go — Phase 1.A.1 authentication handlers.
//
// Endpoints (all under /api/v1):
//
//	POST /auth/register       — first call (users empty) or with invite token
//	POST /auth/login          — email + password → JWT cookie
//	POST /auth/logout         — clears cookie + blacklists jti in Redis
//	GET  /auth/me             — current user from cookie
//	POST /auth/invite         — admin only; generates invite link
//	POST /auth/accept-invite  — consumes invite + creates user
//
// JWT: HS256 with AUTH_JWT_SECRET (config-loaded; required). Claims hold
// sub (userId), role, jti, iat, exp.
// Cookie: auth_token, HttpOnly, Secure (config), SameSite=Lax, Path=/.
//
// Login rate-limit: in-memory token bucket per IP (5 requests / minute).
// Cheap and good enough for the single-gateway-instance assumption; if
// we ever scale horizontally we'll move it to Redis along with the jti
// blacklist (already Redis-backed).
package handlers

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/mail"
	"strings"
	"sync"
	"time"

	"github.com/finance_next/gateway/internal/config"
	"github.com/finance_next/gateway/internal/domain"
	mongostore "github.com/finance_next/gateway/internal/store/mongo"
	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v4"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/argon2"
)

// AuthCookieName is the cookie carrying the JWT. The frontend never reads
// it (HttpOnly); /auth/me is the canonical way to know the current user.
const AuthCookieName = "auth_token"

// RevokedJTISetKey is the Redis SET storing JTIs of logged-out tokens.
// We use SADD on logout with a per-entry expiry via a parallel
// `auth:revoked:<jti>` key (Redis SETs themselves don't support
// per-member TTL). The middleware checks both — see middleware/auth.go.
const RevokedJTISetKey = "auth:revoked"

// LoginRateLimitPerMinute caps /auth/login attempts per source IP.
const LoginRateLimitPerMinute = 5

// AuthHandler wires the auth endpoints.
//
// Redis is optional; when nil, logout still works (cookie cleared) but
// the jti blacklist is skipped (the JWT remains technically valid until
// exp). That's acceptable for dev — production deployments always set
// REDIS_URL.
type AuthHandler struct {
	users       *mongostore.UserRepo
	invitations *mongostore.InvitationRepo
	cfg         *config.Config
	redis       *redis.Client

	loginLimiter *ipLimiter
}

// NewAuthHandler builds the handler. users / invitations / cfg must be
// non-nil; redis may be nil.
func NewAuthHandler(
	users *mongostore.UserRepo,
	invitations *mongostore.InvitationRepo,
	cfg *config.Config,
	rds *redis.Client,
) *AuthHandler {
	return &AuthHandler{
		users:        users,
		invitations:  invitations,
		cfg:          cfg,
		redis:        rds,
		loginLimiter: newIPLimiter(LoginRateLimitPerMinute, time.Minute),
	}
}

// Register binds routes onto the v1 group.
//
// All six endpoints are mounted regardless of dep status; when users/
// cfg is nil the routes return 503. The white-list in
// middleware.WithAuth must keep /auth/register|login|accept-invite open
// (the other three sit behind WithAuth).
func (h *AuthHandler) Register(g *echo.Group) {
	g.POST("/auth/register", h.register)
	g.POST("/auth/login", h.login)
	g.POST("/auth/logout", h.logout)
	g.GET("/auth/me", h.me)
	g.POST("/auth/invite", h.invite)
	g.POST("/auth/accept-invite", h.acceptInvite)
}

// ---------- request / response shapes ----------

type registerReq struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	InviteToken string `json:"inviteToken,omitempty"`
}

type loginReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type inviteReq struct {
	Email string `json:"email"`
	Role  string `json:"role"`
}

type acceptInviteReq struct {
	Token    string `json:"token"`
	Password string `json:"password"`
}

type inviteResp struct {
	InviteURL string    `json:"inviteUrl"`
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expiresAt"`
}

// ---------- handlers ----------

func (h *AuthHandler) register(c echo.Context) error {
	if h.users == nil || h.cfg == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "auth not configured")
	}
	var req registerReq
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := validateEmailPassword(req.Email, req.Password); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	ctx := c.Request().Context()
	count, err := h.users.Count(ctx)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "user count: "+err.Error())
	}

	role := domain.UserRoleMember
	invitedBy := ""

	if count == 0 {
		// Bootstrap: first user becomes admin.
		role = domain.UserRoleAdmin
	} else {
		// Subsequent registrations require a valid invitation.
		if h.invitations == nil {
			return echo.NewHTTPError(http.StatusForbidden, "registration closed; ask an admin to invite you")
		}
		if req.InviteToken == "" {
			return echo.NewHTTPError(http.StatusForbidden, "registration closed; an invitation token is required")
		}
		inv, err := h.consumeInvitation(ctx, req.InviteToken, req.Email)
		if err != nil {
			return err
		}
		role = inv.Role
		invitedBy = inv.InvitedBy
	}

	user, err := h.createUser(ctx, req.Email, req.Password, role, invitedBy)
	if err != nil {
		return err
	}

	return h.issueCookieAndReturnUser(c, user, http.StatusCreated)
}

func (h *AuthHandler) login(c echo.Context) error {
	if h.users == nil || h.cfg == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "auth not configured")
	}
	// Rate-limit before parsing the body — protects against brute-force
	// burning password-hash CPU.
	ip := clientIP(c)
	if !h.loginLimiter.allow(ip) {
		return echo.NewHTTPError(http.StatusTooManyRequests, "too many login attempts; try again in a minute")
	}

	var req loginReq
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if req.Email == "" || req.Password == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "email and password required")
	}

	ctx := c.Request().Context()
	user, err := h.users.FindByEmail(ctx, req.Email)
	if errors.Is(err, mongostore.ErrUserNotFound) {
		return echo.NewHTTPError(http.StatusUnauthorized, "invalid email or password")
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	ok, vErr := VerifyPassword(req.Password, user.PasswordHash)
	if vErr != nil || !ok {
		return echo.NewHTTPError(http.StatusUnauthorized, "invalid email or password")
	}
	// Best-effort lastLogin update. Errors are logged at the slog default
	// level via the panic-safe defer-style — we don't want to fail an
	// otherwise valid login because of a Mongo blip.
	_ = h.users.SetLastLogin(ctx, user.ID, time.Now().UTC())

	return h.issueCookieAndReturnUser(c, user, http.StatusOK)
}

func (h *AuthHandler) logout(c echo.Context) error {
	// Clear the cookie unconditionally; success even when there was no
	// session to begin with (idempotent).
	h.clearCookie(c)

	// If Redis is wired, add the current token's jti to the blacklist
	// for the remaining lifetime. We parse the cookie ourselves rather
	// than relying on WithAuth context because /auth/logout is
	// whitelisted (so the middleware never ran).
	if h.redis != nil && h.cfg != nil && h.cfg.AuthJWTSecret != "" {
		if cookie, err := c.Cookie(AuthCookieName); err == nil && cookie != nil && cookie.Value != "" {
			if claims, err := parseJWT(cookie.Value, h.cfg.AuthJWTSecret); err == nil && claims.ID != "" {
				ttl := time.Until(claims.ExpiresAt.Time)
				if ttl > 0 {
					_ = h.redis.Set(c.Request().Context(),
						"auth:revoked:"+claims.ID, "1", ttl).Err()
					_ = h.redis.SAdd(c.Request().Context(),
						RevokedJTISetKey, claims.ID).Err()
				}
			}
		}
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *AuthHandler) me(c echo.Context) error {
	if h.users == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "auth not configured")
	}
	userID, ok := c.Get("userId").(string)
	if !ok || userID == "" || userID == domain.DefaultUserID {
		return echo.NewHTTPError(http.StatusUnauthorized, "not authenticated")
	}
	user, err := h.users.FindByID(c.Request().Context(), userID)
	if errors.Is(err, mongostore.ErrUserNotFound) {
		return echo.NewHTTPError(http.StatusUnauthorized, "not authenticated")
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, user)
}

func (h *AuthHandler) invite(c echo.Context) error {
	if h.users == nil || h.invitations == nil || h.cfg == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "auth not configured")
	}
	role, _ := c.Get("userRole").(string)
	if role != domain.UserRoleAdmin {
		return echo.NewHTTPError(http.StatusForbidden, "admin only")
	}
	actorID, _ := c.Get("userId").(string)

	var req inviteReq
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if _, err := mail.ParseAddress(req.Email); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid email")
	}
	if req.Role == "" {
		req.Role = domain.UserRoleMember
	}
	if req.Role != domain.UserRoleAdmin && req.Role != domain.UserRoleMember {
		return echo.NewHTTPError(http.StatusBadRequest, "role must be admin or member")
	}

	tok, err := randHex(32)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	now := time.Now().UTC()
	inv := &domain.Invitation{
		Token:     tok,
		Email:     req.Email,
		Role:      req.Role,
		InvitedBy: actorID,
		ExpiresAt: now.Add(domain.InvitationDefaultTTL),
		CreatedAt: now,
	}
	if err := h.invitations.Insert(c.Request().Context(), inv); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "create invitation: "+err.Error())
	}

	scheme := "https"
	if !h.cfg.AuthCookieSecure {
		// Dev / local default — non-secure cookies typically mean http.
		scheme = "http"
	}
	host := c.Request().Host
	inviteURL := fmt.Sprintf("%s://%s/accept-invite?token=%s", scheme, host, tok)

	return c.JSON(http.StatusCreated, inviteResp{
		InviteURL: inviteURL,
		Token:     tok,
		ExpiresAt: inv.ExpiresAt,
	})
}

func (h *AuthHandler) acceptInvite(c echo.Context) error {
	if h.users == nil || h.invitations == nil || h.cfg == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "auth not configured")
	}
	var req acceptInviteReq
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if req.Token == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "token required")
	}
	if err := validatePassword(req.Password); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	ctx := c.Request().Context()
	inv, err := h.consumeInvitation(ctx, req.Token, "" /* don't verify email */)
	if err != nil {
		return err
	}

	user, err := h.createUser(ctx, inv.Email, req.Password, inv.Role, inv.InvitedBy)
	if err != nil {
		return err
	}
	return h.issueCookieAndReturnUser(c, user, http.StatusCreated)
}

// ---------- helpers ----------

// consumeInvitation looks up + validates + marks-used an invitation
// token. When expectedEmail is non-empty, the invite's email must match
// (case-insensitive) — used by /auth/register where the caller supplied
// their own email and we want to bind them to the invited address.
// Mark-used is best-effort: if it races with another consumer, we
// surface 410 Gone.
func (h *AuthHandler) consumeInvitation(ctx context.Context, token, expectedEmail string) (*domain.Invitation, error) {
	inv, err := h.invitations.FindByToken(ctx, token)
	if errors.Is(err, mongostore.ErrInvitationNotFound) {
		return nil, echo.NewHTTPError(http.StatusNotFound, "invitation not found")
	}
	if err != nil {
		return nil, echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if inv.UsedAt != nil {
		return nil, echo.NewHTTPError(http.StatusGone, "invitation already used")
	}
	if time.Now().UTC().After(inv.ExpiresAt) {
		return nil, echo.NewHTTPError(http.StatusGone, "invitation expired")
	}
	if expectedEmail != "" && !strings.EqualFold(strings.TrimSpace(expectedEmail), inv.Email) {
		return nil, echo.NewHTTPError(http.StatusBadRequest, "email does not match invitation")
	}
	if err := h.invitations.MarkUsed(ctx, inv.Token, time.Now().UTC()); err != nil {
		if errors.Is(err, mongostore.ErrInvitationNotFound) {
			return nil, echo.NewHTTPError(http.StatusGone, "invitation already used")
		}
		return nil, echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return inv, nil
}

// createUser hashes the password and persists a new user. Returns a
// 409-friendly error on duplicate email so the handler doesn't need to
// translate the repo's sentinel itself.
func (h *AuthHandler) createUser(ctx context.Context, email, password, role, invitedBy string) (*domain.User, error) {
	hash, err := HashPassword(password)
	if err != nil {
		return nil, echo.NewHTTPError(http.StatusInternalServerError, "hash password: "+err.Error())
	}
	id, err := randHex(16)
	if err != nil {
		return nil, echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	now := time.Now().UTC()
	u := &domain.User{
		ID:           id,
		Email:        strings.ToLower(strings.TrimSpace(email)),
		PasswordHash: hash,
		Role:         role,
		CreatedAt:    now,
		UpdatedAt:    now,
		InvitedBy:    invitedBy,
	}
	if err := h.users.Insert(ctx, u); err != nil {
		if errors.Is(err, mongostore.ErrUserEmailConflict) {
			return nil, echo.NewHTTPError(http.StatusConflict, "email already registered")
		}
		return nil, echo.NewHTTPError(http.StatusInternalServerError, "create user: "+err.Error())
	}
	return u, nil
}

// issueCookieAndReturnUser signs a fresh JWT, sets the cookie, and
// returns the user JSON with the requested status code.
func (h *AuthHandler) issueCookieAndReturnUser(c echo.Context, user *domain.User, status int) error {
	tok, err := signJWT(user.ID, user.Role, h.cfg.AuthJWTSecret, h.cfg.AuthJWTTTL())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "sign token: "+err.Error())
	}
	h.setCookie(c, tok)
	return c.JSON(status, user)
}

func (h *AuthHandler) setCookie(c echo.Context, value string) {
	ttl := int(h.cfg.AuthJWTTTL().Seconds())
	cookie := &http.Cookie{
		Name:     AuthCookieName,
		Value:    value,
		Path:     "/",
		Domain:   h.cfg.AuthCookieDomain,
		MaxAge:   ttl,
		HttpOnly: true,
		Secure:   h.cfg.AuthCookieSecure,
		SameSite: http.SameSiteLaxMode,
	}
	c.SetCookie(cookie)
}

func (h *AuthHandler) clearCookie(c echo.Context) {
	cookie := &http.Cookie{
		Name:     AuthCookieName,
		Value:    "",
		Path:     "/",
		Domain:   h.cfg.AuthCookieDomain,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   h.cfg.AuthCookieSecure,
		SameSite: http.SameSiteLaxMode,
	}
	c.SetCookie(cookie)
}

// ---------- argon2id password hashing ----------

// Argon2id parameters. Tuned for ~50ms hashing on a 2024-era laptop;
// adjust upward if you run on bigger servers.
const (
	argonTime    uint32 = 3
	argonMemory  uint32 = 64 * 1024 // 64 MiB
	argonThreads uint8  = 2
	argonKeyLen  uint32 = 32
	argonSaltLen        = 16
)

// HashPassword returns an argon2id encoded string of the form
// $argon2id$v=19$m=65536,t=3,p=2$<salt-b64>$<hash-b64>.
// Empty passwords are rejected (defence in depth — the request-level
// validator should have already caught this).
func HashPassword(plain string) (string, error) {
	if plain == "" {
		return "", errors.New("password cannot be empty")
	}
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("argon2 salt: %w", err)
	}
	hash := argon2.IDKey([]byte(plain), salt, argonTime, argonMemory, argonThreads, argonKeyLen)
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, argonMemory, argonTime, argonThreads,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(hash),
	), nil
}

// VerifyPassword re-computes the hash with the embedded parameters and
// compares in constant time. Returns (true, nil) iff match. A malformed
// encoded string yields (false, error) so callers can distinguish from
// a clean mismatch.
func VerifyPassword(plain, encoded string) (bool, error) {
	parts := strings.Split(encoded, "$")
	// Expected: "" / "argon2id" / "v=19" / "m=X,t=Y,p=Z" / saltB64 / hashB64
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false, errors.New("invalid argon2id encoding")
	}
	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil {
		return false, fmt.Errorf("argon2id version: %w", err)
	}
	var mem, tm uint32
	var par uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &mem, &tm, &par); err != nil {
		return false, fmt.Errorf("argon2id params: %w", err)
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false, fmt.Errorf("argon2id salt: %w", err)
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false, fmt.Errorf("argon2id hash: %w", err)
	}
	got := argon2.IDKey([]byte(plain), salt, tm, mem, par, uint32(len(want)))
	return subtle.ConstantTimeCompare(got, want) == 1, nil
}

// ---------- JWT ----------

// signJWT mints a fresh HS256 token.
func signJWT(userID, role, secret string, ttl time.Duration) (string, error) {
	if secret == "" {
		return "", errors.New("AUTH_JWT_SECRET not configured")
	}
	jti, err := randHex(16)
	if err != nil {
		return "", err
	}
	now := time.Now().UTC()
	claims := jwt.RegisteredClaims{
		Subject:   userID,
		ID:        jti,
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
	}
	// Embed `role` as a private claim. We use MapClaims for the final
	// SignedString so registered + private claims can coexist without
	// declaring a custom struct.
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":  claims.Subject,
		"jti":  claims.ID,
		"iat":  claims.IssuedAt.Unix(),
		"exp":  claims.ExpiresAt.Unix(),
		"role": role,
	})
	return tok.SignedString([]byte(secret))
}

// AuthClaims is the decoded shape callers care about.
type AuthClaims struct {
	UserID    string
	Role      string
	ID        string // jti
	IssuedAt  jwt.NumericDate
	ExpiresAt jwt.NumericDate
}

func parseJWT(token, secret string) (*AuthClaims, error) {
	parsed, err := jwt.Parse(token, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}
	if !parsed.Valid {
		return nil, errors.New("invalid token")
	}
	mc, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		return nil, errors.New("invalid claims shape")
	}
	out := &AuthClaims{}
	if s, ok := mc["sub"].(string); ok {
		out.UserID = s
	}
	if s, ok := mc["role"].(string); ok {
		out.Role = s
	}
	if s, ok := mc["jti"].(string); ok {
		out.ID = s
	}
	if f, ok := mc["iat"].(float64); ok {
		out.IssuedAt = *jwt.NewNumericDate(time.Unix(int64(f), 0))
	}
	if f, ok := mc["exp"].(float64); ok {
		out.ExpiresAt = *jwt.NewNumericDate(time.Unix(int64(f), 0))
	}
	if out.UserID == "" {
		return nil, errors.New("missing sub claim")
	}
	return out, nil
}

// ParseJWT is the public hook used by middleware/auth.go to share the
// claim parser with the handler. Returning a typed struct (rather than
// jwt.MapClaims) keeps middleware code clean.
func ParseJWT(token, secret string) (*AuthClaims, error) {
	return parseJWT(token, secret)
}

// ---------- validation ----------

func validateEmailPassword(email, password string) error {
	email = strings.TrimSpace(email)
	if _, err := mail.ParseAddress(email); err != nil {
		return errors.New("invalid email")
	}
	return validatePassword(password)
}

func validatePassword(password string) error {
	if len(password) < 8 {
		return errors.New("password must be at least 8 characters")
	}
	if len(password) > 256 {
		return errors.New("password too long")
	}
	return nil
}

// ---------- misc ----------

func randHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func clientIP(c echo.Context) string {
	// Echo's RealIP() honours X-Forwarded-For but we use RemoteAddr as
	// a fallback so tests can drive a real socket.
	if ip := c.RealIP(); ip != "" {
		return ip
	}
	host, _, err := net.SplitHostPort(c.Request().RemoteAddr)
	if err != nil {
		return c.Request().RemoteAddr
	}
	return host
}

// ---------- in-memory IP rate-limiter ----------

// ipLimiter is a tiny fixed-window counter per IP. Reset every `window`.
// Not concurrency-fancy: a single sync.Mutex around a map; the login
// path is not on a hot path so contention cost is negligible.
type ipLimiter struct {
	mu     sync.Mutex
	limit  int
	window time.Duration
	state  map[string]*ipState
}

type ipState struct {
	count   int
	resetAt time.Time
}

func newIPLimiter(limit int, window time.Duration) *ipLimiter {
	return &ipLimiter{
		limit:  limit,
		window: window,
		state:  make(map[string]*ipState),
	}
}

// allow returns true iff the IP is within the rate budget. Side effect:
// increments the per-IP counter.
func (l *ipLimiter) allow(ip string) bool {
	if ip == "" {
		// Unknown source — let it through; the user-id middleware will
		// stamp it as "default" and downstream auth still applies.
		return true
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	s, ok := l.state[ip]
	if !ok || now.After(s.resetAt) {
		l.state[ip] = &ipState{count: 1, resetAt: now.Add(l.window)}
		return true
	}
	if s.count >= l.limit {
		return false
	}
	s.count++
	return true
}

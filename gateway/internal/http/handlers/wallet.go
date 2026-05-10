// wallet.go — Phase 9 Polygon wallet HTTP handlers.
//
// Routes:
//   GET    /api/v1/wallets                — list (NO ciphertext fields)
//   POST   /api/v1/wallets                — create (encrypts privateKey)
//   GET    /api/v1/wallets/:id            — detail
//   DELETE /api/v1/wallets/:id            — delete
//   GET    /api/v1/wallets/:id/balance    — live USDC via RPC
//   GET    /api/v1/wallets/:id/positions  — CTF outcome token balances
//   POST   /api/v1/wallets/:id/approve    — admin (X-Admin-Key) bounded approve
//
// SECURITY:
// - Private-key ciphertext fields use json:"-" on the domain struct so
//   they NEVER serialise in any response.
// - The audit middleware scrub list (extended in Phase 9) redacts
//   `privateKey*` / `mnemonic` / `seed` from every audited body.
// - Approve is HARD-CAPPED by `portfolio_limits.maxOpenNotionalUsd`.
//   Zero cap means the endpoint refuses; infinite approve is impossible.
package handlers

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/finance_next/gateway/internal/crypto"
	"github.com/finance_next/gateway/internal/domain"
	mongostore "github.com/finance_next/gateway/internal/store/mongo"
	walletpkg "github.com/finance_next/gateway/internal/wallet/polygon"
	"github.com/go-playground/validator/v10"
	"github.com/labstack/echo/v4"
)

// WalletHandler bundles the Phase 9 wallet routes.
type WalletHandler struct {
	repo       *mongostore.WalletRepo
	envelope   *crypto.EnvelopeService
	rpc        walletpkg.RPC
	systemRepo predictionSystemReader
	adminKey   string
	validate   *validator.Validate
}

// predictionSystemReader is the slice of SystemRepo we need (Phase 7 cap source).
type predictionSystemReader interface {
	GetPortfolioLimits(ctx context.Context, userID string) (*domain.PortfolioLimits, error)
}

// NewWalletHandler builds the handler.
func NewWalletHandler(
	repo *mongostore.WalletRepo,
	envelope *crypto.EnvelopeService,
	rpc walletpkg.RPC,
	systemRepo predictionSystemReader,
	adminKey string,
) *WalletHandler {
	if rpc == nil {
		rpc = walletpkg.NoopRPC{}
	}
	return &WalletHandler{
		repo:       repo,
		envelope:   envelope,
		rpc:        rpc,
		systemRepo: systemRepo,
		adminKey:   adminKey,
		validate:   validator.New(validator.WithRequiredStructEnabled()),
	}
}

// Register binds /wallets routes onto the v1 group.
func (h *WalletHandler) Register(g *echo.Group) {
	if h.repo == nil || h.envelope == nil {
		return // 503 cleanly: no routes registered when deps missing
	}
	g.GET("/wallets", h.list)
	g.POST("/wallets", h.create)
	g.GET("/wallets/:id", h.findOne)
	g.DELETE("/wallets/:id", h.remove)
	g.GET("/wallets/:id/balance", h.balance)
	g.GET("/wallets/:id/positions", h.positions)
	// Admin-gated approve. Hidden when ADMIN_KEY unset.
	if h.adminKey != "" {
		g.POST("/wallets/:id/approve", h.approve)
	}
}

func (h *WalletHandler) list(c echo.Context) error {
	out, err := h.repo.FindAll(c.Request().Context(), domain.DefaultUserID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, out)
}

func (h *WalletHandler) findOne(c echo.Context) error {
	w, err := h.repo.FindByID(c.Request().Context(), c.Param("id"))
	if errors.Is(err, mongostore.ErrWalletNotFound) {
		return echo.NewHTTPError(http.StatusNotFound, "wallet not found")
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, w)
}

func (h *WalletHandler) create(c echo.Context) error {
	var dto domain.CreateWalletInput
	if err := c.Bind(&dto); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := h.validate.Struct(&dto); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	addr, err := walletpkg.ValidateAndDerive(dto.PrivateKey, dto.ExpectedAddress)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid private key: "+err.Error())
	}
	dekCT, pkCT, err := h.envelope.EncryptForAccount(dto.PrivateKey)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "encrypt: "+err.Error())
	}
	w := &domain.Wallet{
		UserID:               domain.DefaultUserID,
		Label:                dto.Label,
		Address:              addr,
		DEKCiphertext:        dekCT,
		PrivateKeyCiphertext: pkCT,
	}
	saved, err := h.repo.Create(c.Request().Context(), w)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusCreated, saved)
}

func (h *WalletHandler) remove(c echo.Context) error {
	err := h.repo.Delete(c.Request().Context(), c.Param("id"))
	if errors.Is(err, mongostore.ErrWalletNotFound) {
		return echo.NewHTTPError(http.StatusNotFound, "wallet not found")
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, echo.Map{"success": true})
}

func (h *WalletHandler) balance(c echo.Context) error {
	w, err := h.repo.FindByID(c.Request().Context(), c.Param("id"))
	if errors.Is(err, mongostore.ErrWalletNotFound) {
		return echo.NewHTTPError(http.StatusNotFound, "wallet not found")
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	ctx, cancel := context.WithTimeout(c.Request().Context(), 15*time.Second)
	defer cancel()
	bal, err := h.rpc.USDCBalanceOf(ctx, w.Address)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, err.Error())
	}
	// Best-effort cache update.
	_ = h.repo.UpdateCachedBalance(ctx, w.ID, bal.BalanceUsdc, bal.AllowanceUsdc)
	return c.JSON(http.StatusOK, bal)
}

func (h *WalletHandler) positions(c echo.Context) error {
	w, err := h.repo.FindByID(c.Request().Context(), c.Param("id"))
	if errors.Is(err, mongostore.ErrWalletNotFound) {
		return echo.NewHTTPError(http.StatusNotFound, "wallet not found")
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	ctx, cancel := context.WithTimeout(c.Request().Context(), 15*time.Second)
	defer cancel()
	pos, err := h.rpc.CTFBalances(ctx, w.Address)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, err.Error())
	}
	return c.JSON(http.StatusOK, pos)
}

// approve is admin-gated. The bounded approve contract is the hardest
// security boundary in Phase 9: the requested USDC amount is capped by
// `portfolio_limits.maxOpenNotionalUsd`, which an admin must set to a
// non-zero value. Zero cap → refuse. Infinite approve is impossible.
func (h *WalletHandler) approve(c echo.Context) error {
	if c.Request().Header.Get("X-Admin-Key") != h.adminKey {
		return echo.NewHTTPError(http.StatusUnauthorized, "missing or invalid X-Admin-Key")
	}
	var dto domain.ApproveInput
	if err := c.Bind(&dto); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := h.validate.Struct(&dto); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if h.systemRepo == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "portfolio_limits source not configured")
	}
	limits, err := h.systemRepo.GetPortfolioLimits(c.Request().Context(), domain.DefaultUserID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "load portfolio_limits: "+err.Error())
	}
	if err := walletpkg.ValidateApproveAmount(dto.AmountUsdc, limits.MaxOpenNotionalUsd); err != nil {
		return echo.NewHTTPError(http.StatusForbidden, err.Error())
	}
	w, err := h.repo.FindByID(c.Request().Context(), c.Param("id"))
	if errors.Is(err, mongostore.ErrWalletNotFound) {
		return echo.NewHTTPError(http.StatusNotFound, "wallet not found")
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	pkHex, err := h.envelope.DecryptForAccount(w.DEKCiphertext, w.PrivateKeyCiphertext)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "decrypt private key: "+err.Error())
	}
	ctx, cancel := context.WithTimeout(c.Request().Context(), 60*time.Second)
	defer cancel()
	tx, err := h.rpc.ApproveUSDC(ctx, pkHex, dto.AmountUsdc)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, err.Error())
	}
	_ = h.repo.UpdateCachedBalance(ctx, w.ID, w.UsdcBalanceCached, dto.AmountUsdc)
	return c.JSON(http.StatusOK, echo.Map{
		"txHash":          tx,
		"amountApproved":  dto.AmountUsdc,
		"capUsd":          limits.MaxOpenNotionalUsd,
		"approvedAddress": w.Address,
		"spender":         walletpkg.CTFExchangeAddress,
	})
}

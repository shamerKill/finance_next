package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/finance_next/gateway/internal/crypto"
	"github.com/finance_next/gateway/internal/domain"
	"github.com/finance_next/gateway/internal/exchange"
	"github.com/finance_next/gateway/internal/exchange/binance"
	"github.com/finance_next/gateway/internal/exchange/bybit"
	"github.com/finance_next/gateway/internal/exchange/okx"
	gwmw "github.com/finance_next/gateway/internal/http/middleware"
	mongostore "github.com/finance_next/gateway/internal/store/mongo"
	"github.com/go-playground/validator/v10"
	"github.com/labstack/echo/v4"
)

// translateProbeError maps known upstream error patterns to user-actionable
// Chinese messages. Falls through to the raw upstream string when no match —
// the gateway never silently rewrites errors it doesn't understand.
//
// Binance error codes ref: https://binance-docs.github.io/apidocs/spot/en/#error-codes
func translateProbeError(err error) string {
	s := err.Error()
	switch {
	case strings.Contains(s, "code=-2008"):
		// Invalid Api-Key ID — key doesn't exist or was deleted.
		return "API 密钥不存在或已被删除，请检查输入或在交易所重新生成"
	case strings.Contains(s, "code=-2014"):
		// API-key format invalid — length/charset wrong.
		return "API 密钥格式无效（长度或字符集不对），请检查是否粘贴完整"
	case strings.Contains(s, "code=-2015"):
		// Invalid API-key, IP, or permissions for action — usually IP whitelist.
		return "API 密钥被拒绝：可能是 IP 白名单未包含本机、或权限不足"
	case strings.Contains(s, "code=-1022"):
		// Signature for this request is not valid — secret wrong.
		return "Secret 密钥不正确（签名校验失败）"
	case strings.Contains(s, "code=-1021"):
		// Timestamp outside recvWindow — local clock skew.
		return "本机时钟与交易所偏差过大，请校准系统时间后重试"
	case strings.Contains(s, "Service unavailable"), strings.Contains(s, "context deadline exceeded"):
		return "交易所暂时无法访问，请稍后重试"
	default:
		return "凭据校验失败：" + s
	}
}

// ClientFactory builds a fresh exchange.ReadOnlyClient for a decrypted
// credential triplet. Tests inject a fake; production wires this to
// binance.NewClient (etc., when more venues land).
type ClientFactory func(exch domain.Exchange, apiKey, secretKey, passphrase string) (exchange.ReadOnlyClient, error)

// DefaultClientFactory builds production exchange read-only clients.
// Phase 5 adds OKX and Bybit. AShare remains a phase 7+ placeholder.
func DefaultClientFactory(exch domain.Exchange, apiKey, secretKey, passphrase string) (exchange.ReadOnlyClient, error) {
	switch exch {
	case domain.ExchangeBinance:
		return binance.NewClient(apiKey, secretKey), nil
	case domain.ExchangeOKX:
		return okx.NewReadOnly(apiKey, secretKey, passphrase)
	case domain.ExchangeBybit:
		return bybit.NewReadOnly(apiKey, secretKey), nil
	case domain.ExchangeAShare:
		return nil, fmt.Errorf("exchange %q not supported until phase 7", exch)
	default:
		return nil, fmt.Errorf("unknown exchange %q", exch)
	}
}

// AccountHandler wires the account CRUD + read-only data endpoints.
type AccountHandler struct {
	repo     *mongostore.AccountRepo
	envelope *crypto.EnvelopeService
	factory  ClientFactory
	validate *validator.Validate
}

// NewAccountHandler constructs an AccountHandler.
func NewAccountHandler(
	repo *mongostore.AccountRepo,
	envelope *crypto.EnvelopeService,
	factory ClientFactory,
) *AccountHandler {
	if factory == nil {
		factory = DefaultClientFactory
	}
	return &AccountHandler{
		repo:     repo,
		envelope: envelope,
		factory:  factory,
		validate: validator.New(validator.WithRequiredStructEnabled()),
	}
}

// Register binds /accounts routes onto the v1 group.
func (h *AccountHandler) Register(g *echo.Group) {
	g.GET("/accounts", h.list)
	g.POST("/accounts", h.create)
	g.GET("/accounts/:id", h.findOne)
	g.DELETE("/accounts/:id", h.remove)
	g.GET("/accounts/:id/balances", h.balances)
	g.GET("/accounts/:id/positions", h.positions)
}

func (h *AccountHandler) list(c echo.Context) error {
	out, err := h.repo.FindAll(c.Request().Context(), gwmw.FromEcho(c))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, out)
}

func (h *AccountHandler) findOne(c echo.Context) error {
	a, err := h.repo.FindByID(c.Request().Context(), c.Param("id"))
	if errors.Is(err, mongostore.ErrAccountNotFound) {
		return echo.NewHTTPError(http.StatusNotFound, "account not found")
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, a)
}

func (h *AccountHandler) create(c echo.Context) error {
	var dto domain.CreateAccountInput
	if err := c.Bind(&dto); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := h.validate.Struct(&dto); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if !dto.Exchange.IsValid() {
		return echo.NewHTTPError(http.StatusBadRequest, "不支持的交易所")
	}
	// OKX-only: passphrase is required. validator/v10's required_if doesn't
	// compose cleanly with our enum type so we check by hand.
	if dto.Exchange == domain.ExchangeOKX && dto.Passphrase == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "OKX 账户必须填写 passphrase")
	}

	// Build a transient client to probe permissions BEFORE persisting anything.
	cli, err := h.factory(dto.Exchange, dto.APIKey, dto.SecretKey, dto.Passphrase)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	probeCtx, cancel := context.WithTimeout(c.Request().Context(), defaultProbeTimeout())
	defer cancel()
	perms, err := cli.ProbePermissions(probeCtx)
	if err != nil {
		// Probe failures are almost always client-side: wrong key, wrong secret,
		// IP not whitelisted, missing permission. Map to 400 so the UI shows a
		// "请求参数错误" hint rather than the misleading 502 ("服务器错误").
		// translateProbeError maps known upstream codes (Binance -2008/-2014/...)
		// to actionable Chinese; unknown errors pass through with the raw string.
		return echo.NewHTTPError(http.StatusBadRequest, translateProbeError(err))
	}
	if perms.CanWithdraw {
		// Hard rejection. Phase 1 contract: stored keys must be read+trade max.
		return echo.NewHTTPError(http.StatusForbidden, "API 密钥包含提现权限 — 出于安全考虑不允许添加。请先在交易所撤销提现权限后重试。")
	}

	// Envelope-encrypt credentials. One DEK per account; sealed with the
	// master KEK. See gateway/internal/crypto/envelope.go.
	dekCT, apiKeyCT, err := h.envelope.EncryptForAccount(dto.APIKey)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "encrypt apiKey: "+err.Error())
	}
	secretCT, err := h.envelope.EncryptWithDEK(dekCT, dto.SecretKey)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "encrypt secretKey: "+err.Error())
	}
	var passCT string
	if dto.Passphrase != "" {
		passCT, err = h.envelope.EncryptWithDEK(dekCT, dto.Passphrase)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "encrypt passphrase: "+err.Error())
		}
	}

	acct := &domain.Account{
		UserID:               gwmw.FromEcho(c),
		Exchange:             dto.Exchange,
		Label:                dto.Label,
		Email:                dto.Email,
		Permissions:          domain.Permissions(perms),
		DEKCiphertext:        dekCT,
		APIKeyCiphertext:     apiKeyCT,
		SecretKeyCiphertext:  secretCT,
		PassphraseCiphertext: passCT,
	}
	saved, err := h.repo.Create(c.Request().Context(), acct)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusCreated, saved)
}

func (h *AccountHandler) remove(c echo.Context) error {
	err := h.repo.Delete(c.Request().Context(), c.Param("id"))
	if errors.Is(err, mongostore.ErrAccountNotFound) {
		return echo.NewHTTPError(http.StatusNotFound, "account not found")
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, echo.Map{"success": true})
}

func (h *AccountHandler) balances(c echo.Context) error {
	cli, err := h.clientForAccount(c.Request().Context(), c.Param("id"))
	if err != nil {
		return err
	}
	out, err := cli.GetBalances(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, err.Error())
	}
	return c.JSON(http.StatusOK, out)
}

func (h *AccountHandler) positions(c echo.Context) error {
	cli, err := h.clientForAccount(c.Request().Context(), c.Param("id"))
	if err != nil {
		return err
	}
	out, err := cli.GetPositions(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, err.Error())
	}
	return c.JSON(http.StatusOK, out)
}

// clientForAccount loads the account, decrypts credentials, and builds an
// adapter. Errors are returned as echo.HTTPError ready for return.
func (h *AccountHandler) clientForAccount(ctx context.Context, id string) (exchange.ReadOnlyClient, error) {
	a, err := h.repo.FindByID(ctx, id)
	if errors.Is(err, mongostore.ErrAccountNotFound) {
		return nil, echo.NewHTTPError(http.StatusNotFound, "account not found")
	}
	if err != nil {
		return nil, echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	apiKey, err := h.envelope.DecryptForAccount(a.DEKCiphertext, a.APIKeyCiphertext)
	if err != nil {
		return nil, echo.NewHTTPError(http.StatusInternalServerError, "decrypt apiKey: "+err.Error())
	}
	secret, err := h.envelope.DecryptForAccount(a.DEKCiphertext, a.SecretKeyCiphertext)
	if err != nil {
		return nil, echo.NewHTTPError(http.StatusInternalServerError, "decrypt secretKey: "+err.Error())
	}
	var pass string
	if a.PassphraseCiphertext != "" {
		pass, err = h.envelope.DecryptForAccount(a.DEKCiphertext, a.PassphraseCiphertext)
		if err != nil {
			return nil, echo.NewHTTPError(http.StatusInternalServerError, "decrypt passphrase: "+err.Error())
		}
	}
	cli, err := h.factory(a.Exchange, apiKey, secret, pass)
	if err != nil {
		return nil, echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return cli, nil
}

// UpstreamFactoryFor returns a ws.UpstreamFactory bound to this handler's
// repository + crypto + client factory. Used by the WS hub at construction.
func (h *AccountHandler) UpstreamFactoryFor() func(ctx context.Context, accountID string) (exchange.UserDataStream, error) {
	return func(ctx context.Context, accountID string) (exchange.UserDataStream, error) {
		cli, err := h.clientForAccount(ctx, accountID)
		if err != nil {
			return nil, err
		}
		return cli.StreamUserData(ctx)
	}
}

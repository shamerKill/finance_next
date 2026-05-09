// Package okx implements [exchange.Adapter] for OKX v5 REST.
//
// We talk to OKX through a thin hand-rolled REST client rather than a
// vendored Go SDK — the OKX endpoints we need are small (account/balance,
// account/positions, account/config, trade/order, trade/cancel-order,
// trade/orders-pending, trade/order) and the public Go SDKs that exist
// (`go-okx-sdk`, `okxapi-go`) drag in heavy dependency trees.
//
// Demo trading
// ------------
// OKX serves *both* live and demo (simulated trading) traffic through
// the same hostname. The discriminator is a single header:
//
//	x-simulated-trading: 1
//
// When the order client is constructed with [domain.LiveModeTestnet]
// the header is added to every request. Mainnet keys and demo keys are
// disjoint on OKX; the operator must register a demo key in the OKX
// dashboard before trading flows like Phase 4's mainnet gate apply.
//
// Auth
// ----
// Every signed request carries:
//
//	OK-ACCESS-KEY        <api key>
//	OK-ACCESS-SIGN       base64(HMAC-SHA256(secret, ts + method + reqPath + body))
//	OK-ACCESS-TIMESTAMP  ISO-8601 UTC at millisecond precision
//	OK-ACCESS-PASSPHRASE <passphrase set when the key was created>
//
// Public endpoints (e.g. /api/v5/public/instruments) skip all four.
package okx

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Public host. OKX serves both mainnet *and* demo through this same
// origin; the x-simulated-trading: 1 header is the only discriminator.
const (
	// MainnetREST is the OKX REST host (used for both live + demo).
	MainnetREST = "https://www.okx.com"
)

// Client is the per-account REST client. Public + signed methods are
// split by package file (client.go: transport + auth; readonly.go: read
// endpoints; orders.go: order placement). All three share this struct.
type Client struct {
	apiKey, secretKey, passphrase string
	baseURL                       string
	// simulated, when true, adds the x-simulated-trading header to every
	// request — used for OKX's demo trading environment.
	simulated bool
	http      *http.Client
}

// NewClient builds a fresh REST client. Pass simulated=true for OKX's
// demo trading (Phase 5 Live.Mode == "testnet").
func NewClient(apiKey, secretKey, passphrase string, simulated bool) *Client {
	return &Client{
		apiKey:     apiKey,
		secretKey:  secretKey,
		passphrase: passphrase,
		baseURL:    MainnetREST,
		simulated:  simulated,
		http:       &http.Client{Timeout: 15 * time.Second},
	}
}

// SetBaseURL overrides the REST host. Used by tests against
// httptest.NewServer.
func (c *Client) SetBaseURL(u string) { c.baseURL = u }

// SetHTTPClient overrides the underlying *http.Client. Tests use this
// to inject deterministic transports.
func (c *Client) SetHTTPClient(h *http.Client) { c.http = h }

// Simulated reports whether the demo-trading header is on.
func (c *Client) Simulated() bool { return c.simulated }

// signedDo issues a signed request and JSON-decodes the body into out
// (when non-nil). Returns the raw body for caller-side raw stashing on
// the audit log.
func (c *Client) signedDo(ctx context.Context, method, reqPath string, body any, out any) ([]byte, error) {
	var bodyStr string
	var bodyReader io.Reader
	if body != nil {
		bs, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("okx: marshal body: %w", err)
		}
		bodyStr = string(bs)
		bodyReader = bytes.NewReader(bs)
	}
	ts := timestampISO(time.Now().UTC())
	sig := sign(c.secretKey, ts, method, reqPath, bodyStr)
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+reqPath, bodyReader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("OK-ACCESS-KEY", c.apiKey)
	req.Header.Set("OK-ACCESS-SIGN", sig)
	req.Header.Set("OK-ACCESS-TIMESTAMP", ts)
	req.Header.Set("OK-ACCESS-PASSPHRASE", c.passphrase)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.simulated {
		req.Header.Set("x-simulated-trading", "1")
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return raw, fmt.Errorf("okx: HTTP %d: %s", resp.StatusCode, string(raw))
	}
	// All OKX v5 responses share the envelope {"code":"0","msg":"","data":[...]}.
	// Non-zero `code` is a logical error even when HTTP is 200.
	var env envelope
	if err := json.Unmarshal(raw, &env); err != nil {
		return raw, fmt.Errorf("okx: decode envelope: %w (raw=%s)", err, string(raw))
	}
	if env.Code != "0" {
		return raw, fmt.Errorf("okx: code=%s msg=%s", env.Code, env.Msg)
	}
	if out != nil {
		if err := json.Unmarshal(env.Data, out); err != nil {
			return raw, fmt.Errorf("okx: decode data: %w", err)
		}
	}
	return raw, nil
}

// envelope is the wrapper every v5 response uses. We unmarshal the
// envelope first to surface the logical `code` field; the typed
// payload lives in Data.
type envelope struct {
	Code string          `json:"code"`
	Msg  string          `json:"msg"`
	Data json.RawMessage `json:"data"`
}

// sign computes the OK-ACCESS-SIGN value: base64(HMAC-SHA256(secret,
// ts + method + reqPath + body)). The body string is empty when there
// is no body; the method must be uppercase per OKX's documentation.
func sign(secret, ts, method, reqPath, body string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(ts + method + reqPath + body))
	return base64.StdEncoding.EncodeToString(mac.Sum(nil))
}

// timestampISO formats t as the ISO-8601 millisecond-precision string
// OKX expects — e.g. "2026-05-09T14:23:11.123Z". time.Time.Format with
// the "2006-01-02T15:04:05.000Z07:00" layout produces this exactly when
// t is in UTC.
func timestampISO(t time.Time) string {
	return t.UTC().Format("2006-01-02T15:04:05.000Z")
}

// ErrPassphraseRequired is returned by NewOrderClient / NewClient when
// the caller forgot to plumb the passphrase. We fail loudly because
// every signed call to OKX requires one.
var ErrPassphraseRequired = errors.New("okx: passphrase required")

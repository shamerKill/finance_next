// Package bybit implements [exchange.Adapter] for Bybit's unified
// trading v5 REST API.
//
// Hosts:
//
//	mainnet  https://api.bybit.com
//	testnet  https://api-testnet.bybit.com
//
// Auth (signed endpoints):
//
//	X-BAPI-API-KEY      <api key>
//	X-BAPI-TIMESTAMP    millis-since-epoch
//	X-BAPI-RECV-WINDOW  5000
//	X-BAPI-SIGN         hex(HMAC-SHA256(secret, timestamp + apiKey + recvWindow + payload))
//
// Where `payload` is the raw query string for GETs and the JSON body
// for POSTs. We send the request body verbatim — Bybit's signing scheme
// is sensitive to ordering, but JSON marshalled by encoding/json is
// deterministic enough for our usage (single map, lexicographic key
// order).
package bybit

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"
)

// Hosts.
const (
	MainnetREST = "https://api.bybit.com"
	TestnetREST = "https://api-testnet.bybit.com"
)

// RecvWindow is the static recv-window we use for every request. 5
// seconds is the Bybit-recommended default.
const RecvWindow = "5000"

// Client is the per-account Bybit REST client. Mode pinning happens at
// construction (mainnet vs testnet); the order client adds its own
// gate on top.
type Client struct {
	apiKey, secretKey string
	baseURL           string
	http              *http.Client
}

// NewClient builds a fresh REST client pinned to mainnet.
func NewClient(apiKey, secretKey string) *Client {
	return &Client{
		apiKey:    apiKey,
		secretKey: secretKey,
		baseURL:   MainnetREST,
		http:      &http.Client{Timeout: 15 * time.Second},
	}
}

// SetBaseURL overrides the host. Used by tests + by the order client to
// switch between mainnet/testnet.
func (c *Client) SetBaseURL(u string) { c.baseURL = u }

// signedDo issues a signed request. body is marshalled to JSON for
// POSTs; for GETs it's expected to be nil and the path may carry a
// query string.
func (c *Client) signedDo(ctx context.Context, method, reqPath string, body any, out any) ([]byte, error) {
	var bodyStr string
	var bodyReader io.Reader
	if body != nil {
		bs, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("bybit: marshal body: %w", err)
		}
		bodyStr = string(bs)
		bodyReader = bytes.NewReader(bs)
	}
	// For GETs the signed payload is the query string portion of the
	// request path; for POSTs it's the body. Match Bybit's docs.
	signedPayload := bodyStr
	if method == http.MethodGet {
		if i := bytesIndexByte(reqPath, '?'); i >= 0 {
			signedPayload = reqPath[i+1:]
		} else {
			signedPayload = ""
		}
	}
	ts := strconv.FormatInt(time.Now().UTC().UnixMilli(), 10)
	sig := sign(c.secretKey, ts, c.apiKey, RecvWindow, signedPayload)

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+reqPath, bodyReader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-BAPI-API-KEY", c.apiKey)
	req.Header.Set("X-BAPI-TIMESTAMP", ts)
	req.Header.Set("X-BAPI-RECV-WINDOW", RecvWindow)
	req.Header.Set("X-BAPI-SIGN", sig)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
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
		return raw, fmt.Errorf("bybit: HTTP %d: %s", resp.StatusCode, string(raw))
	}
	var env envelope
	if err := json.Unmarshal(raw, &env); err != nil {
		return raw, fmt.Errorf("bybit: decode envelope: %w (raw=%s)", err, string(raw))
	}
	if env.RetCode != 0 {
		return raw, fmt.Errorf("bybit: retCode=%d retMsg=%s", env.RetCode, env.RetMsg)
	}
	if out != nil {
		if err := json.Unmarshal(env.Result, out); err != nil {
			return raw, fmt.Errorf("bybit: decode result: %w", err)
		}
	}
	return raw, nil
}

// envelope is the v5 wrapper. result is endpoint-specific; we feed it
// to the per-endpoint typed unmarshaller.
type envelope struct {
	RetCode int             `json:"retCode"`
	RetMsg  string          `json:"retMsg"`
	Result  json.RawMessage `json:"result"`
}

// sign computes the X-BAPI-SIGN value: hex-encoded HMAC-SHA256 of
// ts + apiKey + recvWindow + payload.
func sign(secret, ts, apiKey, recvWindow, payload string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(ts + apiKey + recvWindow + payload))
	return hex.EncodeToString(mac.Sum(nil))
}

// bytesIndexByte is a small helper that mirrors strings.IndexByte but
// keeps client.go free of the `strings` import (reduces footprint).
func bytesIndexByte(s string, b byte) int {
	for i := 0; i < len(s); i++ {
		if s[i] == b {
			return i
		}
	}
	return -1
}

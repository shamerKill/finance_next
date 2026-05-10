// client.go — Polymarket CLOB REST client.
//
// REST surface used by the gateway:
//
//   GET    /book?token_id=<>           orderbook snapshot
//   GET    /trades?market=<>&limit=<>  recent trades
//   GET    /orders?market=<>           open orders for the API key
//   POST   /order                      submit signed order
//   DELETE /order/{id}                 cancel by order hash
//
// All endpoints reside under POLYMARKET_CLOB_URL (default
// https://clob.polymarket.com). Calls auth via API-key headers (Phase 9
// uses the wallet-based signed-order flow only — no separate API key
// header is required for POST /order; the EIP-712 signature carries
// authorisation).
//
// Errors from the upstream are wrapped with the HTTP status; non-2xx
// returns ErrCLOBHTTP. The tests stub the transport via httptest.
package polymarket

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

// DefaultCLOBURL is the production endpoint.
const DefaultCLOBURL = "https://clob.polymarket.com"

// DefaultGammaURL is the metadata endpoint.
const DefaultGammaURL = "https://gamma-api.polymarket.com"

// ErrCLOBHTTP wraps non-2xx responses from the CLOB REST API.
var ErrCLOBHTTP = errors.New("polymarket: CLOB http error")

// Client is the CLOB REST client.
type Client struct {
	baseURL string
	hc      *http.Client
}

// NewClient constructs a CLOB client. Pass empty baseURL to use DefaultCLOBURL.
func NewClient(baseURL string) *Client {
	if baseURL == "" {
		baseURL = DefaultCLOBURL
	}
	return &Client{
		baseURL: baseURL,
		hc: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

// SetHTTPClient lets tests inject a custom http.Client (used with
// httptest.NewServer).
func (c *Client) SetHTTPClient(h *http.Client) { c.hc = h }

// SetBaseURL overrides the base URL after construction (test convenience).
func (c *Client) SetBaseURL(u string) { c.baseURL = u }

// BookLevel is one orderbook side level.
type BookLevel struct {
	Price float64 `json:"price"`
	Size  float64 `json:"size"`
}

// Book is one orderbook snapshot. Bids descending, asks ascending.
type Book struct {
	MarketID string      `json:"market"`
	TokenID  string      `json:"token_id"`
	Bids     []BookLevel `json:"bids"`
	Asks     []BookLevel `json:"asks"`
}

// Mid returns the midpoint of best bid and best ask. Returns 0 when
// either side is empty (caller should treat as "no quote").
func (b *Book) Mid() float64 {
	if b == nil || len(b.Bids) == 0 || len(b.Asks) == 0 {
		return 0
	}
	return (b.Bids[0].Price + b.Asks[0].Price) / 2
}

// FetchBook returns the current orderbook for the given outcome token.
func (c *Client) FetchBook(ctx context.Context, tokenID string) (*Book, error) {
	if tokenID == "" {
		return nil, errors.New("polymarket: token_id required")
	}
	u, _ := url.Parse(c.baseURL + "/book")
	q := u.Query()
	q.Set("token_id", tokenID)
	u.RawQuery = q.Encode()

	var b Book
	if err := c.doJSON(ctx, http.MethodGet, u.String(), nil, &b); err != nil {
		return nil, err
	}
	if b.TokenID == "" {
		b.TokenID = tokenID
	}
	return &b, nil
}

// Trade is one historical trade row.
type Trade struct {
	ID       string  `json:"id"`
	MarketID string  `json:"market"`
	TokenID  string  `json:"token_id"`
	Side     string  `json:"side"`
	Price    float64 `json:"price"`
	Size     float64 `json:"size"`
	TxHash   string  `json:"transaction_hash,omitempty"`
	Time     time.Time `json:"timestamp,omitempty"`
}

// FetchTrades returns recent trades for the market.
func (c *Client) FetchTrades(ctx context.Context, marketID string, limit int) ([]Trade, error) {
	if marketID == "" {
		return nil, errors.New("polymarket: market id required")
	}
	if limit <= 0 || limit > 1000 {
		limit = 100
	}
	u, _ := url.Parse(c.baseURL + "/trades")
	q := u.Query()
	q.Set("market", marketID)
	q.Set("limit", strconv.Itoa(limit))
	u.RawQuery = q.Encode()

	var out struct {
		Data []Trade `json:"data"`
	}
	if err := c.doJSON(ctx, http.MethodGet, u.String(), nil, &out); err != nil {
		// Some endpoints return a bare array; retry decode as []Trade.
		var arr []Trade
		if err2 := c.doJSON(ctx, http.MethodGet, u.String(), nil, &arr); err2 == nil {
			return arr, nil
		}
		return nil, err
	}
	return out.Data, nil
}

// SubmitOrderRequest is the wire body for POST /order. We include the
// signed order hash + signature alongside the typed-data fields so the
// upstream can independently verify.
type SubmitOrderRequest struct {
	Order     submitOrderPayload `json:"order"`
	Owner     string             `json:"owner"`
	OrderType string             `json:"orderType,omitempty"` // "FOK" | "GTC" | etc.
}

type submitOrderPayload struct {
	Salt          string `json:"salt"`
	Maker         string `json:"maker"`
	Signer        string `json:"signer"`
	Taker         string `json:"taker"`
	TokenID       string `json:"tokenId"`
	MakerAmount   string `json:"makerAmount"`
	TakerAmount   string `json:"takerAmount"`
	Expiration    string `json:"expiration"`
	Nonce         string `json:"nonce"`
	FeeRateBps    string `json:"feeRateBps"`
	Side          uint8  `json:"side"`
	SignatureType uint8  `json:"signatureType"`
	Signature     string `json:"signature"`
}

// SubmitResult is the parsed POST /order response.
type SubmitResult struct {
	OrderID string `json:"orderID"`
	Status  string `json:"status"`
	TxHash  string `json:"transactionHash,omitempty"`
}

// SubmitOrder posts a signed order to the CLOB.
func (c *Client) SubmitOrder(ctx context.Context, owner string, signed *SignedOrder, orderType string) (*SubmitResult, error) {
	if signed == nil {
		return nil, errors.New("polymarket: signed order required")
	}
	body := SubmitOrderRequest{
		Owner:     owner,
		OrderType: orderType,
		Order: submitOrderPayload{
			Salt:          signed.Order.Salt.String(),
			Maker:         signed.Order.Maker,
			Signer:        signed.Order.Signer,
			Taker:         signed.Order.Taker,
			TokenID:       signed.Order.TokenID.String(),
			MakerAmount:   signed.Order.MakerAmount.String(),
			TakerAmount:   signed.Order.TakerAmount.String(),
			Expiration:    signed.Order.Expiration.String(),
			Nonce:         signed.Order.Nonce.String(),
			FeeRateBps:    signed.Order.FeeRateBps.String(),
			Side:          uint8(signed.Order.Side),
			SignatureType: uint8(signed.Order.SignatureType),
			Signature:     signed.SignatureHex(),
		},
	}
	bs, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	var res SubmitResult
	if err := c.doJSON(ctx, http.MethodPost, c.baseURL+"/order", bs, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// CancelOrder deletes an open order by its EIP-712 hash.
func (c *Client) CancelOrder(ctx context.Context, orderID string) error {
	if orderID == "" {
		return errors.New("polymarket: order id required")
	}
	return c.doJSON(ctx, http.MethodDelete, c.baseURL+"/order/"+url.PathEscape(orderID), nil, nil)
}

// OpenOrder is one order returned by GET /orders.
type OpenOrder struct {
	OrderID  string  `json:"orderID"`
	MarketID string  `json:"market"`
	TokenID  string  `json:"asset_id"`
	Side     string  `json:"side"`
	Price    float64 `json:"price"`
	Size     float64 `json:"size"`
	Filled   float64 `json:"size_matched"`
	Status   string  `json:"status"`
}

// OpenOrders returns all currently-open orders for the API key /
// signer. `marketID` filters to one market when non-empty.
func (c *Client) OpenOrders(ctx context.Context, marketID string) ([]OpenOrder, error) {
	u, _ := url.Parse(c.baseURL + "/orders")
	if marketID != "" {
		q := u.Query()
		q.Set("market", marketID)
		u.RawQuery = q.Encode()
	}
	var out struct {
		Data []OpenOrder `json:"data"`
	}
	if err := c.doJSON(ctx, http.MethodGet, u.String(), nil, &out); err != nil {
		var arr []OpenOrder
		if err2 := c.doJSON(ctx, http.MethodGet, u.String(), nil, &arr); err2 == nil {
			return arr, nil
		}
		return nil, err
	}
	return out.Data, nil
}

// doJSON issues an HTTP request and decodes a JSON body into out (when
// non-nil). Wraps non-2xx with ErrCLOBHTTP.
func (c *Client) doJSON(ctx context.Context, method, urlStr string, body []byte, out any) error {
	var bodyReader io.Reader
	if body != nil {
		bodyReader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, urlStr, bodyReader)
	if err != nil {
		return err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.hc.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("%w: %d %s", ErrCLOBHTTP, resp.StatusCode, string(respBody))
	}
	if out == nil {
		return nil
	}
	if len(respBody) == 0 {
		return nil
	}
	if err := json.Unmarshal(respBody, out); err != nil {
		return fmt.Errorf("polymarket: decode response: %w", err)
	}
	return nil
}

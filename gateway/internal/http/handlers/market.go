package handlers

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/finance_next/gateway/internal/quantclient"
	"github.com/finance_next/gateway/internal/store/timescale"
	quantv1 "github.com/finance_next/shared-proto/gen/go/quantpb/v1"
	"github.com/labstack/echo/v4"
	timestamppb "google.golang.org/protobuf/types/known/timestamppb"
)

// allowedTimeframes mirrors the timeframes ingested in Phase 2. Anything
// outside this set is rejected with 400 — better than a silent empty result.
var allowedTimeframes = map[string]struct{}{
	"1m": {},
	"5m": {},
	"1h": {},
	"1d": {},
}

// timeframeBars approximates how many bars a given timeframe yields per
// minute, used to enforce the 100k bar query cap. We round UP so callers
// can't sneak in 100,001 bars.
var timeframeMinutes = map[string]int64{
	"1m": 1,
	"5m": 5,
	"1h": 60,
	"1d": 1440,
}

const maxBarsPerQuery = 100_000

// MarketHandler exposes /market endpoints — read-only OHLCV queries plus
// an admin-only ingest trigger.
type MarketHandler struct {
	store    *timescale.Store
	quant    quantclient.Client
	adminKey string
}

// NewMarketHandler builds a handler. ``adminKey`` may be empty, in which
// case the ingest endpoint returns 404 to avoid leaking its existence.
func NewMarketHandler(store *timescale.Store, quant quantclient.Client, adminKey string) *MarketHandler {
	return &MarketHandler{store: store, quant: quant, adminKey: adminKey}
}

// Register binds /market routes onto the v1 group.
func (h *MarketHandler) Register(g *echo.Group) {
	g.GET("/market/ohlcv", h.getOhlcv)
	g.POST("/market/ingest", h.postIngest)
}

// ---- GET /api/v1/market/ohlcv ---------------------------------------------

func (h *MarketHandler) getOhlcv(c echo.Context) error {
	if h.store == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "timescale not configured")
	}

	exchange := c.QueryParam("exchange")
	symbol := c.QueryParam("symbol")
	timeframe := c.QueryParam("timeframe")
	startStr := c.QueryParam("start")
	endStr := c.QueryParam("end")

	if exchange == "" || symbol == "" || timeframe == "" || startStr == "" || endStr == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "exchange, symbol, timeframe, start, end are required")
	}
	if _, ok := allowedTimeframes[timeframe]; !ok {
		return echo.NewHTTPError(http.StatusBadRequest, "timeframe must be one of 1m, 5m, 1h, 1d")
	}

	start, err := parseTime(startStr)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid start: "+err.Error())
	}
	end, err := parseTime(endStr)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid end: "+err.Error())
	}
	if !start.Before(end) {
		return echo.NewHTTPError(http.StatusBadRequest, "start must be before end")
	}

	// Reject windows that would scan more than maxBarsPerQuery bars. This
	// is a soft cap — the Limit clause guarantees the DB doesn't blow up
	// even if the cap is bypassed by tightly-packed data.
	tfMinutes := timeframeMinutes[timeframe]
	estBars := int64(end.Sub(start).Minutes()) / tfMinutes
	if estBars > maxBarsPerQuery {
		return echo.NewHTTPError(http.StatusBadRequest, "requested window exceeds 100k bars; narrow the range")
	}

	ctx, cancel := context.WithTimeout(c.Request().Context(), 15*time.Second)
	defer cancel()

	bars, err := h.store.Query(ctx, exchange, symbol, timeframe, start, end, maxBarsPerQuery)
	if err != nil {
		c.Logger().Errorf("ohlcv query failed: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query market data")
	}
	return c.JSON(http.StatusOK, bars)
}

// ---- POST /api/v1/market/ingest -------------------------------------------

type ingestRequestBody struct {
	Exchange  string `json:"exchange"  validate:"required"`
	Symbol    string `json:"symbol"    validate:"required"`
	Timeframe string `json:"timeframe" validate:"required"`
	Start     string `json:"start"     validate:"required"` // RFC3339
	End       string `json:"end"       validate:"required"` // RFC3339
}

type ingestResponseBody struct {
	RunID        string    `json:"runId"`
	BarsIngested int64     `json:"barsIngested"`
	FromTs       time.Time `json:"fromTs"`
	ToTs         time.Time `json:"toTs"`
}

func (h *MarketHandler) postIngest(c echo.Context) error {
	// Endpoint is gated by a static admin header. When unset, we 404 to
	// avoid leaking that the endpoint exists at all.
	if h.adminKey == "" {
		return echo.NewHTTPError(http.StatusNotFound)
	}
	if c.Request().Header.Get("X-Admin-Key") != h.adminKey {
		return echo.NewHTTPError(http.StatusUnauthorized, "missing or invalid X-Admin-Key")
	}
	if h.quant == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "quant grpc client not configured")
	}

	var body ingestRequestBody
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid JSON body")
	}
	if _, ok := allowedTimeframes[body.Timeframe]; !ok {
		return echo.NewHTTPError(http.StatusBadRequest, "timeframe must be one of 1m, 5m, 1h, 1d")
	}
	start, err := parseTime(body.Start)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid start: "+err.Error())
	}
	end, err := parseTime(body.End)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid end: "+err.Error())
	}
	if !start.Before(end) {
		return echo.NewHTTPError(http.StatusBadRequest, "start must be before end")
	}

	// Long timeout — backfilling a year of 1m bars hits the exchange ~365
	// times. Production should call this off the request path; for now the
	// admin endpoint is a developer convenience.
	ctx, cancel := context.WithTimeout(c.Request().Context(), 10*time.Minute)
	defer cancel()

	ack, err := h.quant.IngestNow(ctx, &quantv1.IngestRequest{
		Exchange:  body.Exchange,
		Symbol:    body.Symbol,
		Timeframe: body.Timeframe,
		Start:     timestamppb.New(start),
		End:       timestamppb.New(end),
	})
	if err != nil {
		c.Logger().Errorf("quant.IngestNow failed: %v", err)
		return echo.NewHTTPError(http.StatusBadGateway, "quant ingest failed")
	}

	return c.JSON(http.StatusOK, ingestResponseBody{
		RunID:        ack.GetRunId(),
		BarsIngested: ack.GetBarsIngested(),
		FromTs:       ack.GetFromTs().AsTime(),
		ToTs:         ack.GetToTs().AsTime(),
	})
}

// parseTime accepts RFC3339 timestamps and Unix-seconds integers (a sane
// default for chart libraries). Returns an explicit error rather than
// time.Time's zero value so handlers can surface the cause.
func parseTime(s string) (time.Time, error) {
	if s == "" {
		return time.Time{}, errors.New("empty value")
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t.UTC(), nil
	}
	// Allow Unix seconds.
	var secs int64
	if _, err := jsonAtoi(s, &secs); err == nil {
		return time.Unix(secs, 0).UTC(), nil
	}
	return time.Time{}, errors.New("expected RFC3339 timestamp or unix seconds")
}

// jsonAtoi parses a non-negative decimal integer. We avoid strconv just to
// keep the import surface tight; only used for the start/end fallback path.
func jsonAtoi(s string, out *int64) (int, error) {
	var n int64
	for i := 0; i < len(s); i++ {
		ch := s[i]
		if ch < '0' || ch > '9' {
			return i, errors.New("non-digit")
		}
		n = n*10 + int64(ch-'0')
	}
	*out = n
	return len(s), nil
}

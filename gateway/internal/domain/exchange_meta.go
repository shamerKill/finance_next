package domain

import "time"

// ExchangeMeta is one row in the `exchange_meta` Mongo collection. It
// caches per-exchange-per-symbol metadata that the order engine and the
// UI need to format orders correctly.
//
// Composite uniqueness is on (exchange, canonicalSymbol). The startup
// refresh job upserts every row at most once per 24h.
type ExchangeMeta struct {
	ID              string    `json:"id" bson:"_id,omitempty"`
	Exchange        Exchange  `json:"exchange" bson:"exchange"`
	CanonicalSymbol string    `json:"canonicalSymbol" bson:"canonicalSymbol"`
	NativeSymbol    string    `json:"nativeSymbol" bson:"nativeSymbol"`
	BaseAsset       string    `json:"baseAsset" bson:"baseAsset"`
	QuoteAsset      string    `json:"quoteAsset" bson:"quoteAsset"`
	ContractType    string    `json:"contractType" bson:"contractType"` // "spot" | "linear-perp"
	PricePrecision  int       `json:"pricePrecision" bson:"pricePrecision"`
	QtyPrecision    int       `json:"qtyPrecision" bson:"qtyPrecision"`
	MinNotionalUsd  float64   `json:"minNotionalUsd" bson:"minNotionalUsd"`
	TakerFeeRate    float64   `json:"takerFeeRate" bson:"takerFeeRate"`
	MakerFeeRate    float64   `json:"makerFeeRate" bson:"makerFeeRate"`
	LastUpdated     time.Time `json:"lastUpdated" bson:"lastUpdated"`
}

// Package domain — Phase 7 audit log entry.
//
// `audit` is the append-only collection. Every non-GET API call writes a
// single row asynchronously via the audit middleware. Documents expire
// after 7 years via a TTL index on `expiresAt`.
package domain

import (
	"encoding/json"
	"time"
)

// ResourceType is one of the well-known audit categories. New types must
// be added here so the admin filter UI is exhaustive.
type ResourceType string

const (
	ResourceStrategy       ResourceType = "strategy"
	ResourceAccount        ResourceType = "account"
	ResourceOrder          ResourceType = "order"
	ResourceRecommendation ResourceType = "recommendation"
	ResourceSystem         ResourceType = "system"
	ResourceMarket         ResourceType = "market"
	// Phase 9 — Polymarket prediction-markets vertical.
	ResourceWallet         ResourceType = "wallet"
	ResourcePrediction     ResourceType = "prediction"
	ResourceUnknown        ResourceType = "unknown"
)

// AuditEntry is one persisted audit row.
type AuditEntry struct {
	ID           string          `json:"id" bson:"_id,omitempty"`
	Ts           time.Time       `json:"ts" bson:"ts"`
	ExpiresAt    time.Time       `json:"-" bson:"expiresAt"`
	Actor        string          `json:"actor" bson:"actor"`
	Action       string          `json:"action" bson:"action"`
	ResourceType ResourceType    `json:"resourceType" bson:"resourceType"`
	ResourceID   string          `json:"resourceId,omitempty" bson:"resourceId,omitempty"`
	Method       string          `json:"method" bson:"method"`
	Path         string          `json:"path" bson:"path"`
	StatusCode   int             `json:"statusCode" bson:"statusCode"`
	Payload      json.RawMessage `json:"payload,omitempty" bson:"payload,omitempty"`
	IP           string          `json:"ip,omitempty" bson:"ip,omitempty"`
	UserAgent    string          `json:"userAgent,omitempty" bson:"userAgent,omitempty"`
	RequestID    string          `json:"requestId,omitempty" bson:"requestId,omitempty"`
}

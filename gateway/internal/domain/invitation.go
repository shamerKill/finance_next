// invitation.go — Phase 1.A.1 invitation domain.
//
// Once the first admin has registered, every subsequent /auth/register call
// is rejected; new users must be invited. The admin POSTs /auth/invite to
// generate a token (32 byte hex), shares the resulting URL out-of-band,
// and the recipient POSTs /auth/accept-invite {token, password} to create
// their account. Tokens expire 24h after issue.
package domain

import "time"

// Invitation is a one-time, time-bounded grant to register an account.
//
// Token is a 64-char hex string (32 random bytes); it's the document _id
// so look-ups are an indexed point query. UsedAt is set when the
// invitation is consumed; subsequent /accept-invite calls with the same
// token return 410 Gone (handler responsibility).
type Invitation struct {
	Token     string     `bson:"_id"                json:"token"`
	Email     string     `bson:"email"              json:"email"`
	Role      string     `bson:"role"               json:"role"`
	InvitedBy string     `bson:"invitedBy"          json:"invitedBy"`
	ExpiresAt time.Time  `bson:"expiresAt"          json:"expiresAt"`
	UsedAt    *time.Time `bson:"usedAt,omitempty"   json:"usedAt,omitempty"`
	CreatedAt time.Time  `bson:"createdAt"          json:"createdAt"`
}

// InvitationDefaultTTL is the lifetime of a freshly minted invite.
const InvitationDefaultTTL = 24 * time.Hour

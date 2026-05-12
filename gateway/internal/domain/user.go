// user.go — Phase 1.A.1 auth user domain.
//
// `users` Mongo collection. The first /api/v1/auth/register call is granted
// admin role; every subsequent registration must arrive with a valid
// invitation token (see Invitation). PasswordHash is the argon2id encoded
// form ($argon2id$v=19$m=65536,t=3,p=2$<salt>$<hash>) — never the plain
// password.
package domain

import "time"

// User roles. Only two for now; future scopes (read-only viewer etc.)
// can be added without DB migration since `role` is a free-form string.
const (
	UserRoleAdmin  = "admin"
	UserRoleMember = "member"
)

// User is the persisted account record.
//
// PasswordHash uses json:"-" so it never leaves the gateway, even
// accidentally — every API surface that returns a User passes through
// this struct and the tag scrubs the hash without per-handler
// boilerplate.
type User struct {
	ID           string     `bson:"id"                       json:"id"`
	Email        string     `bson:"email"                    json:"email"`
	PasswordHash string     `bson:"passwordHash"             json:"-"`
	Role         string     `bson:"role"                     json:"role"`
	CreatedAt    time.Time  `bson:"createdAt"                json:"createdAt"`
	UpdatedAt    time.Time  `bson:"updatedAt"                json:"updatedAt"`
	LastLoginAt  *time.Time `bson:"lastLoginAt,omitempty"    json:"lastLoginAt,omitempty"`
	InvitedBy    string     `bson:"invitedBy,omitempty"      json:"invitedBy,omitempty"`
}

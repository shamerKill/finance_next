// ownership.go — Phase 1.A.4 per-subscription ownership checks.
//
// Before a session is allowed to receive events for (kind, id), the hub
// resolves the owner of that resource and compares against the session's
// authenticated userId. If the topic isn't owned by the requester (and
// the requester isn't an admin), Subscribe returns ErrOwnershipDenied
// and the upstream is never started for them.
//
// Resolvers are tiny read-only adapters around the existing Mongo repos.
// They live in this file (rather than as anonymous closures in router.go)
// so the wiring stays grep-able and tests can swap stub implementations
// in for offline verification.
package ws

import (
	"context"
	"errors"
)

// ErrOwnershipDenied is returned by Subscribe when the authenticated
// session doesn't own the requested resource (and isn't an admin).
var ErrOwnershipDenied = errors.New("ws: subscription denied: resource not owned by user")

// Note: an earlier draft also exposed `ErrOwnershipUnknown` as a distinct
// "no resolver wired" sentinel, but production code never returned it —
// topic kinds without a registered resolver fall through to the legacy
// no-check path so unit tests that pre-date auth keep working without
// per-test wiring. If a future tightening flips that default to
// fail-closed, reintroduce the sentinel here and surface it from
// Hub.Subscribe before the resolver lookup.

// OwnerResolver resolves the owning userId of one resource id within a
// topic kind. A resolver that doesn't know about a given id should
// return ("", nil) — Subscribe treats an empty owner as "not found"
// and denies (fail-closed). Returning an error surfaces a transient
// lookup failure (mongo down etc.) and Subscribe also denies in that
// case.
type OwnerResolver interface {
	OwnerOf(ctx context.Context, id string) (userID string, err error)
}

// OwnerResolverFunc adapts a function into an OwnerResolver. Convenient
// for both tests and router wiring (where the resolver is a one-liner
// around a typed repo method).
type OwnerResolverFunc func(ctx context.Context, id string) (string, error)

// OwnerOf satisfies OwnerResolver.
func (f OwnerResolverFunc) OwnerOf(ctx context.Context, id string) (string, error) {
	return f(ctx, id)
}

// AdminRole is the role string that bypasses ownership checks. Mirrors
// the value /api/v1/auth/* writes into JWT claims for an admin user.
const AdminRole = "admin"

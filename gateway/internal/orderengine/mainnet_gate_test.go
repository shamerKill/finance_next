package orderengine

import (
	"context"
	"log/slog"
	"strings"
	"testing"
	"time"
)

// captureHandler is a slog.Handler that records every Record it sees so
// tests can assert structured-log behaviour. It is intentionally minimal
// — no level filtering, no group/attr nesting — because our regression
// only cares about (1) what level fires and (2) what attribute keys ride
// along with each record.
type captureHandler struct {
	records []slog.Record
}

func (h *captureHandler) Enabled(_ context.Context, _ slog.Level) bool { return true }
func (h *captureHandler) Handle(_ context.Context, r slog.Record) error {
	h.records = append(h.records, r)
	return nil
}
func (h *captureHandler) WithAttrs(_ []slog.Attr) slog.Handler { return h }
func (h *captureHandler) WithGroup(_ string) slog.Handler      { return h }

// hasAttr reports whether the record has an attribute with the given key.
func hasAttr(r slog.Record, key string) bool {
	found := false
	r.Attrs(func(a slog.Attr) bool {
		if a.Key == key {
			found = true
			return false
		}
		return true
	})
	return found
}

func TestTokenStore_EnvDisabled_DeniesEverything(t *testing.T) {
	s := NewTokenStore(false, nil)
	if s.Allowed() {
		t.Error("Allowed must be false when env disabled")
	}
	if _, err := s.RequestToken(); err != ErrEnvDisabled {
		t.Errorf("RequestToken: expected ErrEnvDisabled, got %v", err)
	}
	if err := s.Confirm("anything"); err != ErrEnvDisabled {
		t.Errorf("Confirm: expected ErrEnvDisabled, got %v", err)
	}
}

func TestTokenStore_RequestThenConfirm_OpensGate(t *testing.T) {
	s := NewTokenStore(true, nil)
	if s.Allowed() {
		t.Fatal("expected gate closed before any confirm")
	}
	tok, err := s.RequestToken()
	if err != nil {
		t.Fatalf("RequestToken: %v", err)
	}
	if len(tok) != 32 {
		t.Errorf("expected 32-hex token, got %q (len=%d)", tok, len(tok))
	}
	// Still closed until confirm is called.
	if s.Allowed() {
		t.Error("gate should remain closed before Confirm")
	}
	if err := s.Confirm(tok); err != nil {
		t.Fatalf("Confirm: %v", err)
	}
	if !s.Allowed() {
		t.Error("gate should be open after confirm")
	}
	// Token is consumed — second Confirm fails.
	if err := s.Confirm(tok); err != ErrTokenUnknown {
		t.Errorf("Confirm twice: expected ErrTokenUnknown, got %v", err)
	}
}

func TestTokenStore_Confirm_UnknownToken(t *testing.T) {
	s := NewTokenStore(true, nil)
	if err := s.Confirm("not-a-real-token"); err != ErrTokenUnknown {
		t.Errorf("expected ErrTokenUnknown, got %v", err)
	}
}

func TestTokenStore_ExpiredRequest(t *testing.T) {
	s := NewTokenStore(true, nil)
	tok, err := s.RequestToken()
	if err != nil {
		t.Fatalf("RequestToken: %v", err)
	}
	// Surgically rewind the expiry to make the token expired.
	s.mu.Lock()
	s.requested[tok] = time.Now().Add(-1 * time.Minute)
	s.mu.Unlock()
	if err := s.Confirm(tok); err != ErrTokenUnknown {
		t.Errorf("expected ErrTokenUnknown for expired token, got %v", err)
	}
}

// TestTokenStore_RequestToken_DoesNotLogTokenToSlog is a regression guard
// for CLAUDE.md §8: the full mainnet token must NEVER travel through slog
// (which gets shipped to ELK/Datadog/CloudWatch in any real ops setup).
// Only stderr is allowed to see the full token; slog gets at most an 8-char
// prefix.
func TestTokenStore_RequestToken_DoesNotLogTokenToSlog(t *testing.T) {
	cap := &captureHandler{}
	log := slog.New(cap)
	s := NewTokenStore(true, log)

	tok, err := s.RequestToken()
	if err != nil {
		t.Fatalf("RequestToken: %v", err)
	}
	if len(cap.records) == 0 {
		t.Fatal("expected at least one slog record (redacted info), got none")
	}
	for _, r := range cap.records {
		if hasAttr(r, "token") {
			t.Errorf("slog record %q must not carry a 'token' attr (would leak to log aggregators)", r.Message)
		}
		// Sanity: ensure the literal token string isn't smuggled into the
		// message body either.
		if strings.Contains(r.Message, tok) {
			t.Errorf("slog message %q contains full token (must be stderr-only)", r.Message)
		}
		r.Attrs(func(a slog.Attr) bool {
			if a.Value.String() == tok {
				t.Errorf("slog attr %q has full token value (must be stderr-only)", a.Key)
			}
			return true
		})
	}
}

func TestTokenStore_Snapshot(t *testing.T) {
	s := NewTokenStore(true, nil)
	if _, err := s.RequestToken(); err != nil {
		t.Fatalf("RequestToken: %v", err)
	}
	snap := s.Snapshot()
	if !snap.EnvEnabled {
		t.Error("expected EnvEnabled=true")
	}
	if snap.MainnetAllowed {
		t.Error("expected MainnetAllowed=false before confirm")
	}
	if snap.PendingTokenCount != 1 {
		t.Errorf("expected 1 pending, got %d", snap.PendingTokenCount)
	}
}

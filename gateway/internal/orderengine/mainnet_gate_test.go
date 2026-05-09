package orderengine

import (
	"testing"
	"time"
)

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

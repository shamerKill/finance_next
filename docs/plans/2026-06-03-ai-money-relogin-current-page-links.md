# AI Money Re-Login Current Page Links Implementation Plan

**Goal:** Make visible "重新登录" links preserve the current dashboard/settings page, so users recovering a session can return to the exact AI Money or setup context.

**Architecture:** Add a pure `loginHrefForPath()` helper for path/search inputs, add a small client hook that derives the current page login href after mount, and use it in critical re-login UI surfaces.

**Tech Stack:** Next.js client components, plain `.mjs` auth redirect helper, Node test runner.

# Context
Filename: 2026-06-03-ai-money-relogin-current-page-links.md
Created On: 2026-06-03 12:34:43 +0800
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
Several dashboard surfaces still render hard-coded `/login` links. When an admin session is stale while configuring AI or trading safety settings, clicking "重新登录" sends the user to login without preserving the current page.

# Project Overview
`finance_next` is a monorepo with a Next.js frontend and Go gateway. This task only touches frontend auth redirect helpers and visible re-login links.

---
*The following sections are maintained by the AI during protocol execution*
---

# Analysis

`client/data/auth-redirect.mjs` already has `loginHrefForUrl()` for full URLs.

`client/components/kill-switch-banner.tsx` renders a hard-coded `/login` link after admin status becomes unauthorized.

`client/app/(dashboard)/settings/ai/client.tsx` renders a hard-coded `/login` link when AI config fetch returns 401/403.

`client/app/(dashboard)/settings/trading/client.tsx` renders a hard-coded `/login` link when mainnet token status fetch returns 401/403.

# Proposed Solution

Add `loginHrefForPath(pathname, search)` to reuse the same safe next encoding for path/search pairs. Add `client/data/use-login-href.ts`, a client hook that returns `/login` initially and updates to `loginHrefForUrl(window.location.href)` after mount.

Use this hook in the three critical re-login UI surfaces.

# Implementation Plan

### Task 1: Add RED Tests

**Files:**
- Modify: `client/data/auth-redirect.test.mjs`

**Steps:**
- Import `loginHrefForPath`.
- Assert `/settings/ai` with query becomes `/login?next=...`.
- Assert root path becomes `/login`.
- Run `node --test client/data/auth-redirect.test.mjs` and confirm missing export failure.

### Task 2: Implement Helper And Hook

**Files:**
- Modify: `client/data/auth-redirect.mjs`
- Add: `client/data/use-login-href.ts`

**Steps:**
- Add `loginHrefForPath(pathname, search = "")`.
- Implement hook with `useState("/login")` and `useEffect(() => setHref(loginHrefForUrl(window.location.href)), [])`.
- Run focused Node test and confirm pass.

### Task 3: Wire Critical Re-Login Links

**Files:**
- Modify: `client/components/kill-switch-banner.tsx`
- Modify: `client/app/(dashboard)/settings/ai/client.tsx`
- Modify: `client/app/(dashboard)/settings/trading/client.tsx`

**Steps:**
- Import `useLoginHref`.
- Replace hard-coded `/login` links in the unauthorized re-login actions.

### Task 4: Verify

Run:

```bash
node --test client/data/auth-redirect.test.mjs
cd client && yarn typecheck
cd client && yarn lint
git diff --check
```

Expected: auth helper tests pass, typecheck passes, lint exits 0 with the known existing warning in `client/data/use-activity-center.tsx:138`, and diff check passes.

Implementation Checklist:
1. Add failing tests for `loginHrefForPath()`.
2. Run focused Node test and confirm missing export failure.
3. Implement `loginHrefForPath()`.
4. Add `useLoginHref` hook.
5. Replace hard-coded re-login links in kill-switch, AI settings, and trading settings.
6. Run Node test, typecheck, lint, and `git diff --check`.
7. Update Task Progress and Final Review in this document.

# Current Execution Step
> Currently executing: "Complete."

# Task Progress

*   2026-06-03 12:36:47 +0800
    *   Step: 1. Add failing tests for `loginHrefForPath()`; 2. Run focused Node test and confirm missing export failure.
    *   Modifications: Added tests for settings-page login link generation and root omission behavior.
    *   Change Summary: RED confirmed with `SyntaxError: The requested module './auth-redirect.mjs' does not provide an export named 'loginHrefForPath'`.
    *   Reason: Executing plan steps 1-2.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 12:36:47 +0800
    *   Step: 3. Implement `loginHrefForPath()`; 4. Add `useLoginHref` hook.
    *   Modifications: Added `loginHrefForPath()` in `client/data/auth-redirect.mjs` and `useLoginHref()` in `client/data/use-login-href.ts`.
    *   Change Summary: GREEN confirmed with 15 passing auth redirect tests.
    *   Reason: Executing plan steps 3-4.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 12:36:47 +0800
    *   Step: 5. Replace hard-coded re-login links in kill-switch, AI settings, and trading settings.
    *   Modifications: Updated `KillSwitchBanner`, `AIConfigClient`, and `TradingSettingsClient` to use `useLoginHref()`.
    *   Change Summary: Critical re-login links now preserve the current dashboard/settings path and query.
    *   Reason: Executing plan step 5.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 12:36:47 +0800
    *   Step: 6. Run Node test, typecheck, lint, and `git diff --check`; 7. Update Task Progress and Final Review in this document.
    *   Modifications: Verified focused auth helper tests, frontend typecheck, frontend lint, and whitespace diff validation; updated this execution record and final review.
    *   Change Summary: Verification passed. Lint still reports only the known existing warning in `client/data/use-activity-center.tsx:138`.
    *   Reason: Executing plan steps 6-7.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation

# Final Review

Implementation perfectly matches the final plan.

Checklist items 1-7 were completed. Current-page login href generation is covered by tests, and the critical re-login links in AI/trading setup surfaces now preserve the current context.

No unreported deviations were found. Browser runtime inspection was not performed because no callable in-app browser control tool was available in this session.

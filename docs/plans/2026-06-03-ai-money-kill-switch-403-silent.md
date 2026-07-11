# AI Money Kill Switch 403 Silent Implementation Plan

**Goal:** Keep the global kill-switch banner silent for valid non-admin 403 responses so AI Money is not cluttered by irrelevant re-login prompts.

**Architecture:** Extend the auth event helper module with a pure banner-hint classifier. `KillSwitchBanner` will show its re-login hint only for true session failures, not normal permission denials.

**Tech Stack:** React client component, plain `.mjs` helper, Node test runner.

# Context
Filename: 2026-06-03-ai-money-kill-switch-403-silent.md
Created On: 2026-06-03 12:42:10 +0800
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
After the global auth event was changed to 401-only, `KillSwitchBanner` still treats both 401 and 403 as a visible "管理员状态不可用 · 重新登录" hint. The banner is mounted globally across the dashboard, including AI Money. Valid non-admin users should not see an admin-only background probe as a re-login prompt.

# Project Overview
`finance_next` is a monorepo with a Next.js frontend and Go gateway. This task only touches frontend auth-event helpers and the kill-switch banner.

---
*The following sections are maintained by the AI during protocol execution*
---

# Analysis

`client/components/kill-switch-banner.tsx` catches `ApiError` and sets `unauthorized=true` for 401 or 403.

Gateway admin-only status endpoints intentionally return 403 for non-admins.

The banner comment already says non-admin 403 should stay silent, but implementation contradicts it.

# Proposed Solution

Add `shouldShowAdminReloginHint(status)` to `client/data/api-auth-event.mjs`, returning true only for 401. Use it in `KillSwitchBanner` and explicitly keep 403 silent by clearing local banner state.

# Implementation Plan

### Task 1: Add RED Tests

**Files:**
- Modify: `client/data/api-auth-event.test.mjs`

**Steps:**
- Import `shouldShowAdminReloginHint`.
- Assert 401 returns true.
- Assert 403 returns false.
- Run `node --test client/data/api-auth-event.test.mjs` and confirm missing export failure.

### Task 2: Implement Helper

**Files:**
- Modify: `client/data/api-auth-event.mjs`

**Steps:**
- Export `shouldShowAdminReloginHint(status)`.
- Return true only when status is 401.
- Run focused Node test and confirm pass.

### Task 3: Wire Banner

**Files:**
- Modify: `client/components/kill-switch-banner.tsx`

**Steps:**
- Import `shouldShowAdminReloginHint`.
- Replace the 401/403 condition with the helper.
- If an admin-state call returns 403, clear state and keep `unauthorized=false`.
- Update comment to match the 401-only re-login hint behavior.

### Task 4: Verify

Run:

```bash
node --test client/data/api-auth-event.test.mjs
cd client && yarn typecheck
cd client && yarn lint
git diff --check
```

Expected: helper tests pass, typecheck passes, lint exits 0 with the known existing warning in `client/data/use-activity-center.tsx:138`, and diff check passes.

Implementation Checklist:
1. Add failing tests for `shouldShowAdminReloginHint()`.
2. Run focused Node test and confirm missing export failure.
3. Implement `shouldShowAdminReloginHint()`.
4. Run focused Node test and confirm pass.
5. Update `KillSwitchBanner` to keep 403 silent.
6. Run Node test, typecheck, lint, and `git diff --check`.
7. Update Task Progress and Final Review in this document.

# Current Execution Step
> Currently executing: "Complete."

# Task Progress

*   2026-06-03 12:43:56 +0800
    *   Step: 1. Add failing tests for `shouldShowAdminReloginHint()`; 2. Run focused Node test and confirm missing export failure.
    *   Modifications: Added tests proving 401 shows an admin re-login hint while 403 and 500 do not.
    *   Change Summary: RED confirmed with missing `shouldShowAdminReloginHint` export.
    *   Reason: Executing plan steps 1-2.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 12:43:56 +0800
    *   Step: 3. Implement `shouldShowAdminReloginHint()`; 4. Run focused Node test and confirm pass.
    *   Modifications: Added `shouldShowAdminReloginHint()` to `client/data/api-auth-event.mjs`, delegating to the 401-only global auth classifier.
    *   Change Summary: GREEN confirmed with 3 passing api-auth-event tests.
    *   Reason: Executing plan steps 3-4.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 12:43:56 +0800
    *   Step: 5. Update `KillSwitchBanner` to keep 403 silent; 6. Run Node test, typecheck, lint, and `git diff --check`; 7. Update Task Progress and Final Review in this document.
    *   Modifications: Updated `KillSwitchBanner` to use `shouldShowAdminReloginHint()` and changed the comment to reflect 401-only visible re-login hints.
    *   Change Summary: Non-admin 403 responses from admin-only system-state polling no longer show a global re-login banner on AI Money.
    *   Reason: Executing plan steps 5-7.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation

# Final Review

Implementation perfectly matches the final plan.

Checklist items 1-7 were completed. `shouldShowAdminReloginHint()` is tested, and `KillSwitchBanner` now keeps permission-only 403 responses silent while preserving 401 re-login behavior.

No unreported deviations were found. Browser runtime inspection was not performed because no callable in-app browser control tool was available in this session.

# AI Money 403 No Global Login Implementation Plan

**Goal:** Prevent permission-only 403 responses from kicking users out of AI Money via the global unauthorized redirect.

**Architecture:** Add a pure auth-event helper that decides whether a response status should dispatch the global `auth:unauthorized` event. Use it in `api-client.ts` so 401 still redirects to login, while 403 remains an inline permission error for the caller.

**Tech Stack:** TypeScript API client, plain `.mjs` helper, Node test runner.

# Context
Filename: 2026-06-03-ai-money-403-no-global-login.md
Created On: 2026-06-03 12:38:49 +0800
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
AI Money and dashboard pages mount admin-only background/status calls such as `getSystemState()`. The gateway returns 403 for normal non-admin permission denial. The frontend currently treats both 401 and 403 as global auth failures, so a valid non-admin session can be redirected to `/login` by a background admin-only request.

# Project Overview
`finance_next` is a monorepo with a Next.js frontend and Go gateway. This task only touches frontend auth event behavior.

---
*The following sections are maintained by the AI during protocol execution*
---

# Analysis

`client/data/api-client.ts` dispatches `AuthUnauthorizedEvent` when `res.status === 401 || res.status === 403`.

`client/components/kill-switch-banner.tsx` expects admin-only 403 to render a local permission hint, not log the user out.

Several gateway endpoints intentionally return 403 for permission denial, env gates, or admin-only calls. Treating every 403 as session expiry conflates authorization and authentication.

# Proposed Solution

Add `client/data/api-auth-event.mjs` with `shouldDispatchAuthUnauthorizedEvent(status)`, returning true only for HTTP 401. Cover with tests so 403 is explicitly not a global-login signal.

Import the helper in `client/data/api-client.ts` and replace the inline `res.status === 401 || res.status === 403` check.

# Implementation Plan

### Task 1: Add RED Tests

**Files:**
- Add: `client/data/api-auth-event.test.mjs`

**Steps:**
- Import `shouldDispatchAuthUnauthorizedEvent`.
- Assert 401 returns true.
- Assert 403 and other statuses return false.
- Run `node --test client/data/api-auth-event.test.mjs` and confirm missing module/export failure.

### Task 2: Implement Helper

**Files:**
- Add: `client/data/api-auth-event.mjs`

**Steps:**
- Export `shouldDispatchAuthUnauthorizedEvent(status)`.
- Return true only when `Number(status) === 401`.
- Run focused Node test and confirm pass.

### Task 3: Wire API Client

**Files:**
- Modify: `client/data/api-client.ts`

**Steps:**
- Import `shouldDispatchAuthUnauthorizedEvent`.
- Replace the inline 401/403 dispatch condition with the helper.
- Update nearby comments so 403 is described as inline permission denial.

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
1. Add failing tests for global auth event status classification.
2. Run focused Node test and confirm missing module/export failure.
3. Implement `shouldDispatchAuthUnauthorizedEvent()`.
4. Run focused Node test and confirm pass.
5. Wire `api-client.ts` to use the helper.
6. Run Node test, typecheck, lint, and `git diff --check`.
7. Update Task Progress and Final Review in this document.

# Current Execution Step
> Currently executing: "Complete."

# Task Progress

*   2026-06-03 12:40:16 +0800
    *   Step: 1. Add failing tests for global auth event status classification; 2. Run focused Node test and confirm missing module/export failure.
    *   Modifications: Added `api-auth-event` tests covering 401 dispatch and 403/404/500 non-dispatch.
    *   Change Summary: RED confirmed with `ERR_MODULE_NOT_FOUND` for `client/data/api-auth-event.mjs`.
    *   Reason: Executing plan steps 1-2.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 12:40:16 +0800
    *   Step: 3. Implement `shouldDispatchAuthUnauthorizedEvent()`; 4. Run focused Node test and confirm pass.
    *   Modifications: Added `client/data/api-auth-event.mjs` with a 401-only global auth event classifier.
    *   Change Summary: GREEN confirmed with 2 passing api-auth-event tests.
    *   Reason: Executing plan steps 3-4.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 12:40:16 +0800
    *   Step: 5. Wire `api-client.ts` to use the helper; 6. Run Node test, typecheck, lint, and `git diff --check`; 7. Update Task Progress and Final Review in this document.
    *   Modifications: Imported `shouldDispatchAuthUnauthorizedEvent()` in `api-client.ts`, replaced the inline 401/403 dispatch condition, and updated comments to describe 403 as inline permission denial.
    *   Change Summary: Permission-only 403 responses no longer trigger global re-login events; 401 still does.
    *   Reason: Executing plan steps 5-7.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation

# Final Review

Implementation perfectly matches the final plan.

Checklist items 1-7 were completed. The new classifier is tested, `api-client.ts` uses it, and global re-login events now fire only for 401 session failures rather than normal 403 permission denials.

No unreported deviations were found. Browser runtime inspection was not performed because no callable in-app browser control tool was available in this session.

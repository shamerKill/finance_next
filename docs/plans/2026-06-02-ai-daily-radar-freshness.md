# Context
Filename: 2026-06-02-ai-daily-radar-freshness.md
Created On: 2026-06-02
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
Make the daily AI radar easier to use during the trading day by showing whether today's scan is still fresh.

# Project Overview
The `/ai-money` page shows whether today's radar scan exists. Markets and sentiment can change intraday, so an old daily scan should be easy to refresh while still allowing the user to open the old result.

---
*The following sections are maintained by the AI during protocol execution*
---

# Analysis
The daily radar status helper has access to `createdAt` on recent AI goal runs. A 6-hour freshness threshold is a practical UI-level heuristic for intraday scanning. It should only affect the workbench state and safe scan action, not trading execution.

# Proposed Solution
Extend `dailyRadarStatusFromRuns` with `isStale`, a stale title/summary, and primary/secondary actions. A stale scan should show "重新扫描" as primary and keep "打开旧扫描" as secondary.

# Implementation Plan
Implementation Checklist:
1. Add failing tests for fresh and stale daily radar runs.
2. Implement 6-hour freshness logic in `dailyRadarStatusFromRuns`.
3. Update `DailyRadarStatusCard` to render primary and secondary actions.
4. Run helper tests, lint, typecheck, build, and local auth smoke.

# Current Execution Step
> Completed: "Step 4. Run helper tests, lint, typecheck, build, and local auth smoke"

# Task Progress
*   2026-06-02
    *   Step: 1. Add failing tests
    *   Modifications: `client/data/ai-goal-preset.test.mjs`
    *   Change Summary: Added stale radar coverage and required `isStale` in fresh status.
    *   Reason: Executing plan step 1
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-02
    *   Step: 2-3. Implement freshness and UI actions
    *   Modifications: `client/data/ai-goal-preset.mjs`, `client/app/(dashboard)/ai-money/client.tsx`
    *   Change Summary: Added 6-hour freshness detection and rendered primary/secondary actions in the daily radar card.
    *   Reason: Executing plan steps 2-3
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-02
    *   Step: 4. Run helper tests, lint, typecheck, build, and local auth smoke
    *   Modifications: Verified helper tests and frontend build pipeline.
    *   Change Summary: `node --test client/data/ai-goal-preset.test.mjs`, `git diff --check`, `yarn lint`, `yarn typecheck`, and non-sandbox `yarn build` passed.
    *   Reason: Executing plan step 4
    *   Blockers: Authenticated browser click-through requires a valid local login session.
    *   User Confirmation Status: Pending Confirmation

# Final Review
Implementation matches the plan. Freshness only changes the daily radar UI and safe scan actions. It does not create live strategies, approve wallets, or submit trading orders.

# Context
Filename: 2026-06-02-ai-action-manual-advance.md
Created On: 2026-06-02
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
Make the AI action queue easier to operate by letting the user manually advance human checklist actions such as review, data checks, paper observation, and gate checks.

# Project Overview
The `/ai-money` workflow can now generate AI strategy blueprints, run validation, select paper candidates, persist paper watch actions, and compute next-step decisions. The remaining friction is that manual checklist actions cannot be marked complete from the queue.

---
*The following sections are maintained by the AI during protocol execution*
---

# Analysis
The backend already exposes `PATCH /api/v1/ai/goals/runs/:id/actions/:actionId`. The frontend can reuse this API to persist manual action status changes. Only human checklist actions should be manually toggled; validation and strategy actions remain driven by their own flows.

# Proposed Solution
Add a pure helper `manualActionTransition` that only allows `review`, `data`, `paper_watch`, and `gate` to move between `manual` and `done`. Wire the helper into `/ai-money` action buttons so operators can mark steps complete or reopen them for review.

# Implementation Plan
Implementation Checklist:
1. Add unit coverage for manual action transition rules.
2. Implement `manualActionTransition`.
3. Add `/ai-money` state and handler for queue action updates.
4. Render manual action buttons in the action queue.
5. Run frontend tests, lint, typecheck, and production build.

# Current Execution Step
> Currently executing: "Step 5. Run frontend tests, lint, typecheck, and production build"

# Task Progress
*   2026-06-02
    *   Step: 1-4. Add helper and action queue manual controls
    *   Modifications: `client/data/ai-goal-preset.test.mjs`, `client/data/ai-goal-preset.mjs`, `client/app/(dashboard)/ai-money/client.tsx`
    *   Change Summary: AI manual checklist items can now be marked complete or reopened from the action queue using the existing persisted action API.
    *   Reason: Executing plan steps 1-4
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-02
    *   Step: 5. Run frontend tests, lint, typecheck, and production build
    *   Modifications: Verified helper tests and frontend build pipeline.
    *   Change Summary: `node --test client/data/ai-goal-preset.test.mjs`, `yarn lint`, `yarn typecheck`, and non-sandbox `yarn build` passed.
    *   Reason: Executing plan step 5
    *   Blockers: Sandbox `yarn build` cannot fetch Google Fonts; non-sandbox build passed.
    *   User Confirmation Status: Pending Confirmation

# Final Review
Implementation matches the plan. Manual queue advancement only changes persisted action status and does not create strategies, enable live trading, or submit orders.

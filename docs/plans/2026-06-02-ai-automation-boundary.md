# AI Automation Boundary Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the AI money page clearly show what AI can automate, what it has already completed, and what requires human confirmation before execution.

**Architecture:** Extend `aiAutopilotStateFromAnalysis()` with three explicit lists: completed automation steps, AI-available next steps, and human-required gates. The existing `AIAutopilotPanel` renders those lists without changing order submission or trading behavior.

**Tech Stack:** JavaScript helper logic in `client/data/ai-goal-preset.mjs`, Node test runner, Next.js client component in `client/app/(dashboard)/ai-money/client.tsx`.

### Task 1: RED tests for automation boundaries

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1:** Add a test proving backtest-ready AI analysis exposes AI-available automation and human gates.

**Step 2:** Add a test proving a mainnet-requested testnet candidate exposes completed paper work and mainnet human gates.

**Step 3:** Run `node --test client/data/ai-goal-preset.test.mjs` and confirm the tests fail because the new fields do not exist.

### Task 2: Minimal state implementation

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1:** Add helper logic inside `aiAutopilotStateFromAnalysis()` to compute `completedSteps`, `aiAvailableSteps`, and `humanRequiredSteps`.

**Step 2:** Preserve existing `canAutoExecute: false`; the new fields explain the boundary instead of changing trade execution behavior.

**Step 3:** Ensure idle, validation, paper, and mainnet-requested states all return non-empty boundary lists.

### Task 3: Render in the AI autopilot panel

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1:** Extend `AIAutopilotState` type with the three new arrays.

**Step 2:** Render the lists under the existing autopilot metrics using `PlanList`.

### Task 4: Verification

**Files:**
- Test: `client/data/ai-goal-preset.test.mjs`
- Test: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1:** Run `node --test client/data/ai-goal-preset.test.mjs`.

**Step 2:** Run `yarn typecheck`.

**Step 3:** Run `git diff --check`.

Implementation Checklist:
1. Add failing tests for AI automation boundary fields.
2. Run Node tests and verify RED.
3. Implement automation boundary fields in autopilot state.
4. Render the boundary fields in the autopilot panel.
5. Run Node tests, TypeScript check, and diff whitespace check.

## Task Progress

* 2026-06-02 22:13:13 CST
  * Step: 1-2. Add failing tests and verify RED.
  * Modifications: Added assertions in `client/data/ai-goal-preset.test.mjs` for `completedSteps`, `aiAvailableSteps`, and `humanRequiredSteps`.
  * Change Summary: The first test run failed because the new autopilot boundary fields were undefined.
  * Reason: Executing plan steps 1-2.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-02 22:13:13 CST
  * Step: 3-4. Implement state fields and render them.
  * Modifications: Updated `client/data/ai-goal-preset.mjs` and `client/app/(dashboard)/ai-money/client.tsx`.
  * Change Summary: AI 自动驾驶 now separates completed automation, AI-available next actions, and human-required confirmation gates.
  * Reason: Executing plan steps 3-4.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-02 22:13:13 CST
  * Step: 5. Run verification.
  * Modifications: No code changes.
  * Change Summary: Node tests, TypeScript check, and diff whitespace check passed.
  * Reason: Executing plan step 5.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.

## Final Review

Implementation perfectly matches the final plan. No unreported deviations were found. The change does not enable direct trading or mainnet execution; it only makes the AI automation boundary explicit in state and UI.

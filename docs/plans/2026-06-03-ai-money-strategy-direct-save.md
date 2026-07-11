# AI Money Strategy Direct Save Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make AI-generated, validated Grid DCA drafts directly savable from the strategy creation summary instead of making the user open the prefilled form first.

**Architecture:** Keep `/option` prefill as a secondary manual review link. Change the helper primary action for ready strategy creation to `save_strategy_draft`, then wire the summary panel to call the existing safe `saveStrategyDraft` flow, which creates a live-off credentialless Option and records the AI handoff.

**Tech Stack:** Next.js client component, HeroUI buttons, Node test runner, TypeScript.

### Task 1: RED test for direct save primary action

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Update the ready strategy creation test**

Change the assertion for `aiStrategyCreationSummaryFromDraft` so a ready Grid DCA draft expects:
- `primaryAction.kind === "save_strategy_draft"`
- `primaryAction.label === "保存为 AI 策略"`
- `primaryHref` still starts with `/option?`

**Step 2: Run focused test**

Run: `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'aiStrategyCreationSummaryFromDraft prepares'`

Expected: FAIL because the helper still returns `open_strategy_prefill`.

### Task 2: GREEN helper and UI implementation

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Update helper primary action**

When a strategy creation summary is ready, set `primaryAction` to `{ kind: "save_strategy_draft", label: "保存为 AI 策略" }` while preserving `primaryHref`.

**Step 2: Update TypeScript state type**

Allow `save_strategy_draft` in `AIStrategyCreationSummaryState.primaryAction.kind`.

**Step 3: Wire summary panel**

Pass `draft`, `isSavingStrategy`, and `onSaveStrategyDraft` into `AIStrategyCreationSummaryPanel`.

**Step 4: Render save button**

If `state.primaryAction.kind === "save_strategy_draft"`, render a primary button that calls `onSaveStrategyDraft(draft)`. Keep a secondary `/option` link when `primaryHref` exists.

### Task 3: Verification

**Files:**
- Review: `client/data/ai-goal-preset.mjs`
- Review: `client/data/ai-goal-preset.test.mjs`
- Review: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Run focused test**

Run: `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'aiStrategyCreationSummaryFromDraft prepares'`

Expected: PASS.

**Step 2: Run full validation**

Run:
- `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`
- `yarn typecheck` in `client/`
- `yarn lint` in `client/`
- `git diff --check`

Expected: tests/typecheck pass; lint exits 0 with the existing unrelated `use-activity-center.tsx` warning.

Implementation Checklist:
1. Update strategy creation test to expect direct save primary action.
2. Run focused RED test and confirm expected failure.
3. Change helper primary action to `save_strategy_draft`.
4. Update client state type.
5. Pass draft/save props into the summary panel.
6. Render direct save button and keep prefill link.
7. Run focused and full verification.
8. Append task progress and final review to this plan.

# Current Execution Step
> Currently executing: "1. Update strategy creation test to expect direct save primary action."

# Task Progress

*   2026-06-03T08:00:00+08:00
    *   Step: 1. Update strategy creation test to expect direct save primary action.
    *   Modifications: Updated `aiStrategyCreationSummaryFromDraft prepares a grid DCA draft for safe strategy creation` to expect `save_strategy_draft`.
    *   Change Summary: The test now describes the desired lower-friction AI action.
    *   Reason: Executing plan step 1
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation

*   2026-06-03T08:00:00+08:00
    *   Step: 2. Run focused RED test and confirm expected failure.
    *   Modifications: Ran `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'aiStrategyCreationSummaryFromDraft prepares'`.
    *   Change Summary: RED confirmed because the helper still returned `open_strategy_prefill`.
    *   Reason: Executing plan step 2
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation

*   2026-06-03T08:00:00+08:00
    *   Step: 3. Change helper primary action to `save_strategy_draft`.
    *   Modifications: Updated `aiStrategyCreationSummaryFromDraft` in `client/data/ai-goal-preset.mjs`.
    *   Change Summary: Ready AI Grid DCA drafts now expose "保存为 AI 策略" as the primary action while preserving the prefill href.
    *   Reason: Executing plan step 3
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation

*   2026-06-03T08:00:00+08:00
    *   Step: 4-6. Update client state type, pass draft/save props, render direct save button and keep prefill link.
    *   Modifications: Updated `AIStrategyCreationSummaryState`, `StrategyDraftCard`, and `AIStrategyCreationSummaryPanel` in `client/app/(dashboard)/ai-money/client.tsx`.
    *   Change Summary: The strategy creation summary now saves a safe live-off AI strategy draft directly, with the prefilled form still available as a secondary review link.
    *   Reason: Executing plan steps 4 through 6
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation

*   2026-06-03T08:00:00+08:00
    *   Step: 7. Run focused and full verification.
    *   Modifications: Ran focused helper test, full helper test suite, `yarn typecheck`, `yarn lint`, `git diff --check`, and trailing-whitespace scan.
    *   Change Summary: Focused test passed; full helper suite passed with 178 tests; typecheck passed; lint exited 0 with the existing unrelated warning; diff check and whitespace scan were clean.
    *   Reason: Executing plan step 7
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation

# Final Review

Implementation perfectly matches the final plan.

The strategy creation helper now treats safe Grid DCA drafts as directly savable AI strategy drafts. The UI summary panel follows that helper action by calling the existing safe save flow, while retaining the `/option` prefill link for manual review. No live trading, account binding, or credential behavior changed.

Verification evidence:
- `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'aiStrategyCreationSummaryFromDraft prepares'`: pass.
- `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`: 178 pass, 0 fail.
- `yarn typecheck`: exit 0.
- `yarn lint`: exit 0 with one existing unrelated warning in `client/data/use-activity-center.tsx`.
- `git diff --check`: exit 0.
- `rg -n "[[:blank:]]$" ...`: no matches.

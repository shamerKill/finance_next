# AI Money Settings Return Provider Prompt Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the AI Money "returned from AI settings" prompt reflect whether the real AI provider is actually ready.

**Architecture:** `client/data/ai-goal-preset.mjs` keeps deriving prompt state. `aiSettingsReturnPromptFromSearch` will accept an optional `providerGate`; blocked/loading gates produce a settings-focused prompt, while ready/unknown gates preserve the existing rerun prompt. The AI Money page will pass the already computed provider gate and render open-link actions correctly.

**Tech Stack:** Next.js client component, plain JS state helper, Node test runner.

### Task 1: Cover provider-aware settings return prompts

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write failing tests**

Add tests near the existing `aiSettingsReturnPromptFromSearch` cases:

- With `intent="rerun_ai"` and a blocked `providerGate`, the prompt title says AI configuration is still incomplete, `primaryHref` is `/settings/ai`, and the primary action is an `open_link`.
- With `intent="rerun_ai"` and a loading `providerGate`, the prompt says provider status is still being confirmed and does not trigger a scan.
- With `intent="rerun_ai"` and a ready `providerGate`, the prompt keeps the existing rescan behavior.

**Step 2: Verify red**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: the new blocked/loading provider tests fail because `aiSettingsReturnPromptFromSearch` does not yet read `providerGate`.

### Task 2: Implement provider-aware prompt state

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Extend input**

Add `providerGate = null` to `aiSettingsReturnPromptFromSearch`.

**Step 2: Return settings action for blocked provider**

When `providerGate.stage === "blocked"`, return:

- `tone: "warning"`
- `title: "AI 配置仍未完成"`
- `summary` from `providerGate.summary` or a safe fallback.
- `primaryHref` from `providerGate.primaryHref` or `/settings/ai`.
- `primaryAction.kind: "open_link"` with the gate label or `"继续配置 AI"`.
- next actions that point the user to key setup and connection test.

When `providerGate.stage === "loading"`, return:

- `tone: "warning"`
- `title` from `providerGate.title` or `"正在确认 AI provider"`
- `summary` from `providerGate.summary` or a safe fallback.
- `primaryHref` from `providerGate.primaryHref` or `/settings/ai`.
- `primaryAction.kind: "open_link"` with the gate label or `"查看 AI 配置"`.

**Step 3: Preserve existing behavior**

For ready, unknown, or missing provider gate, keep the existing rerun prompt behavior.

### Task 3: Render the prompt action correctly in the AI Money page

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Extend types and builder call**

Add `primaryHref?: string` and `providerGate?: AIProviderReadinessGateState | null` to the settings return prompt types.

**Step 2: Pass provider gate**

Pass `providerGate` into `buildSettingsReturnPrompt`.

**Step 3: Render open-link actions**

If `settingsReturnPrompt.primaryAction.kind === "open_link"` and `primaryHref` exists, render the button as a `Link` to `primaryHref`. Otherwise keep the existing daily radar scan button.

### Task 4: Verify and review

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
yarn typecheck
yarn lint
git diff --check
```

Expected:

- Node tests pass.
- TypeScript passes.
- Lint passes, allowing the existing warning in `client/data/use-activity-center.tsx`.
- Diff check reports no whitespace errors.

Implementation Checklist:
1. Add failing tests for blocked, loading, and ready provider gates in settings return prompt.
2. Run the focused Node test and confirm the blocked/loading provider tests fail for the expected reason.
3. Update `aiSettingsReturnPromptFromSearch` to accept `providerGate` and return a settings action when blocked or loading.
4. Update the AI Money page type, builder call, and prompt action rendering.
5. Re-run the focused Node test and confirm it passes.
6. Run `yarn typecheck`, `yarn lint`, and `git diff --check`.
7. Review the implementation against this plan and report any deviations.

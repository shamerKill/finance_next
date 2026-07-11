# AI Sentiment Review Evidence Gate Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent AI goal runs from treating a thin sentiment review note as completed execution evidence.

**Architecture:** The backend action patch normalizer is the authoritative guard for persisted AI goal run actions. The frontend manual transition helper must submit a note that satisfies the same guard, so operator clicks cannot silently bypass market direction, public opinion, and human-bias review.

**Tech Stack:** Go Echo handler helpers, Next.js data helpers, Node.js built-in test runner.

## Context

The AI Money workflow already blocks paper adoption when the AI detects heated sentiment, human bias, or watch signals. However, `sentiment_review` completion could still be recorded with a generic note such as `风向 / 人性复核已完成。`, which leaves no evidence that the operator checked market direction, public opinion, and crowd behavior before allowing paper adoption.

## Implementation Plan

### Task 1: Add Backend Evidence Tests

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal_test.go`

**Step 1: Write the failing tests**

Add:
- `TestAIGoalRunActionPatchRejectsThinSentimentReviewDone`
- `TestAIGoalRunActionPatchAllowsEvidenceBackedSentimentReviewDone`

The rejection test uses the old generic note. The allowed test uses a note that mentions market direction, public opinion sentiment, and human-bias/crowding evidence.

**Step 2: Run test to verify it fails**

Run: `env GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-cache go test ./internal/http/handlers -run 'TestAIGoalRunActionPatch.*Sentiment' -count=1`

Expected: FAIL because thin `sentiment_review done` still normalizes successfully.

### Task 2: Add Frontend Evidence Template Test

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing test**

Update `manualActionTransition only allows human checklist actions to advance` so `sentiment_review` manual completion expects:

```js
{
  label: "完成风向 / 人性复核",
  nextStatus: "done",
  note: "已复核市场风向、舆论情绪和人性偏差/拥挤度；确认未出现 FOMO 追涨或单边叙事过热，只允许进入 paper 采用前检查。",
}
```

**Step 2: Run test to verify it fails**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: FAIL because the frontend still returns the generic manual completion label and note.

### Task 3: Implement the Evidence Contract

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal.go`
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Backend minimal implementation**

Add `sentimentReviewDoneEvidenceComplete(note string) bool` requiring:
- market direction evidence
- public opinion / sentiment evidence
- human-bias / FOMO / crowding evidence

Call it from `normalizeAIGoalRunActionPatch` when `actionID == "sentiment_review"` and `status == "done"`.

**Step 2: Frontend minimal implementation**

Add `SENTIMENT_REVIEW_COMPLETION_NOTE` and return it from `manualActionTransition` when `id === "sentiment_review"`.

**Step 3: Run target tests**

Run:
- `env GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-cache go test ./internal/http/handlers -run 'TestAIGoalRunActionPatch.*Sentiment' -count=1`
- `node --test client/data/ai-goal-preset.test.mjs`

Expected: both pass.

## Implementation Checklist:

1. Add backend RED tests for thin and evidence-backed `sentiment_review done`.
2. Run backend target test and confirm RED.
3. Add frontend RED expectation for evidence-backed manual `sentiment_review` completion.
4. Run frontend target test and confirm RED.
5. Implement backend sentiment evidence guard.
6. Implement frontend sentiment evidence template.
7. Re-run target backend and frontend tests.
8. Run broader handler, frontend typecheck/lint, and diff checks.

## Task Progress

* 2026-06-03 04:50:08 CST
  * Step: 1-7
  * Modifications: Added backend and frontend tests, then implemented `sentiment_review` evidence validation and matching frontend manual completion note.
  * Change Summary: AI goal runs can no longer mark sentiment review complete with a thin generic note.
  * Reason: Market direction, public opinion, and human-bias evidence must stay in the AI strategy promotion path.
  * Blockers: None

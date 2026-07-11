"use client";

import {
  Button,
  Input,
  Select,
  SelectItem,
  Switch,
  Textarea,
} from "@heroui/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ApiErrorView } from "@/components/api-error";
import { Callout } from "@/components/callout";
import { EmptyState } from "@/components/empty-state";
import { FormField } from "@/components/form-field";
import { Section } from "@/components/section";
import { Stat } from "@/components/stat";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import {
  analyzeAIGoal,
  createBacktest,
  createOption,
  getAIGoalProviderStatus,
  getBacktest,
  getAIGoalRun,
  listAccounts,
  listAIGoalRuns,
  updateAIGoalRunAction,
} from "@/data/api-client";
import {
  actionPlanFromAnalysis,
  AI_DEFAULT_AVOID_TEXT,
  AI_DEFAULT_BEHAVIOR_TEXT,
  AI_DEFAULT_NARRATIVE_TEXT,
  AI_GOAL_EXECUTION_MODE_OPTIONS,
  AI_GOAL_TEMPLATES,
  aiCapitalPlanFromState,
  aiAutonomousCommandFromState,
  aiCommandCenterFromState,
  aiDelegationRunbookFromState,
  aiGoalAnalyzeTargetFormState,
  aiGoalComposerFromFormState,
  aiGoalExecutableFormStateFromState,
  aiGoalFormPrimaryActions,
  aiGoalRequestFromFormState,
  aiAutopilotStateFromAnalysis,
  aiDailyMissionFromState,
  aiDecisionJournalFromState,
  aiDraftEvidenceFromAnalysis,
  aiExecutionPreviewFromState,
  aiExecutionReadinessFromState,
  aiMarketMemoryFromState,
  aiMarketWatchtowerFromState,
  aiMoneyBriefFromState,
  aiMoneyPathFromState,
  aiNowActionFromState,
  aiObservationFocusFromState,
  aiPaperAdoptionPackageFromState,
  aiOperatorRhythmFromState,
  aiPaperReviewCoachFromState,
  aiProviderAnalysisAttemptFromGate,
  aiProviderReadinessGateFromStatus,
  aiProviderSetupPromptFromAnalysis,
  aiInitialRunToOpenFromRuns,
  aiRunFollowupPrimaryActionForQueue,
  aiRunRefreshComparisonFromRuns,
  aiRunFollowupQueueFromRuns,
  aiSentimentCompassFromAnalysis,
  aiSetupChecklistFromState,
  aiSettingsReturnAutoRunDecision,
  aiSettingsReturnPromptFromSearch,
  aiStrategyShortlistFromState,
  aiStrategyCreationSummaryFromDraft,
  aiThesisInvalidationFromState,
  autoDailyRadarDecision,
  autoDailyRadarEnabledFromStorage,
  autoDailyRadarPreferencePersistence,
  autoRadarProviderNoticeFromGate,
  autoValidationPlanFromAnalysis,
  backtestActionUpdateFromValidationResult,
  backtestRunIdsFromAction,
  backtestRequestFromDraft,
  dailyRadarFormStateFromRuns,
  dailyRadarStatusFromRuns,
  dailyMissionTaskCommandFromTask,
  defaultAIGoalRunActionsFromAnalysis,
  formStateFromAIGoalRun,
  formStateFromGoalTemplate,
  manualActionTransition,
  nextAIGoalDecision,
  opportunityRadarFromState,
  optimisticValidationRunsFromHandles,
  optionCreateRedirectHref,
  optionPayloadFromStrategyDraft,
  paperCandidateFromValidation,
  paperCandidateWithCapitalPlan,
  paperObservationPlanFromCandidate,
  paperReviewCoachPrimaryAction,
  paperWatchActionPatchFromCandidate,
  rankBacktestValidation,
  strategyActionPatchFromSavedDraft,
  strategyHrefWithAIRunId,
  strategyPresetSearchFromDraft,
  validationRunsNeedPolling,
} from "@/data/ai-goal-preset.mjs";
import type {
  TypeAIGoalAnalysis,
  TypeAIGoalProviderStatus,
  TypeAIGoalRequest,
  TypeAIGoalRun,
  TypeAIGoalRunAction,
  TypeAIGoalRunActionPatch,
  TypeAIGoalStrategyDraft,
  TypeAccount,
  TypeBacktest,
  TypeBacktestHandle,
  TypeCreateBacktest,
  TypeCreateOptionResponse,
  TypeOption,
} from "@/data/type";
import { useActivityCenter, withActivity } from "@/data/use-activity-center";

const RISK_OPTIONS = [
  { key: "conservative", label: "保守" },
  { key: "balanced", label: "均衡" },
  { key: "aggressive", label: "进取" },
];

const MODE_OPTIONS = AI_GOAL_EXECUTION_MODE_OPTIONS;

const AUTO_DAILY_RADAR_ENABLED_KEY =
  "finance_next.ai_money.auto_daily_radar.enabled";
const AUTO_DAILY_RADAR_LAST_KEY =
  "finance_next.ai_money.auto_daily_radar.last_key";
const DEFAULT_BEHAVIOR_TEXT = AI_DEFAULT_BEHAVIOR_TEXT;
const DEFAULT_NARRATIVE_TEXT = AI_DEFAULT_NARRATIVE_TEXT;
const DEFAULT_AVOID_TEXT = AI_DEFAULT_AVOID_TEXT;

type ActionQueueItem = {
  id: string;
  title: string;
  detail: string;
  status: string;
  action: string;
  targetDraftName?: string;
  relatedId?: string;
  href?: string;
  note?: string;
  statusLabel?: string;
  hrefLabel?: string;
  updatedAt?: string;
};

type ValidationScoreItem = {
  runId: string;
  strategyId: string;
  state: number;
  progress: number;
  score: number | null;
  totalReturn: number;
  sharpe: number;
  maxDrawdown: number;
  nTrades: number;
  recommendation: string;
  tone: "success" | "warning" | "danger" | "default";
};

type PaperCandidate = {
  draft: TypeAIGoalStrategyDraft;
  runId: string;
  strategyId: string;
  score: number;
  totalReturn: number;
  sharpe: number;
  maxDrawdown: number;
  nTrades: number;
  recommendation: string;
  strategyHref: string;
  backtestHref: string;
};

type AICommandCenterEvidenceItem = {
  id: string;
  label: string;
  status: string;
  tone: "success" | "warning" | "danger" | "default" | "primary";
  detail: string;
  href?: string;
};

type AICommandCenterState = {
  stage: string;
  title: string;
  tone: "success" | "warning" | "danger" | "default" | "primary";
  summary: string;
  primaryHref?: string;
  primaryAction?: {
    kind:
      | "analyze_and_validate"
      | "scan_today"
      | "rescan_today"
      | "run_all_backtests"
      | "accept_paper_candidate"
      | "save_and_accept_paper_candidate"
      | "complete_manual_action"
      | "open_link"
      | string;
    label: string;
    actionId?: string;
    runId?: string;
    href?: string;
  };
  metrics: Array<{
    label: string;
    value: string | number;
    hint: string;
  }>;
  evidence: AICommandCenterEvidenceItem[];
  nextActions: string[];
};

type AIAutonomousCommandState = {
  stage: string;
  title: string;
  tone: "success" | "warning" | "danger" | "default" | "primary";
  owner: "AI" | "你" | string;
  summary: string;
  primaryHref?: string;
  primaryAction?: {
    kind:
      | "analyze_and_validate"
      | "scan_today"
      | "rescan_today"
      | "run_all_backtests"
      | "accept_paper_candidate"
      | "save_and_accept_paper_candidate"
      | "complete_manual_action"
      | "validate_run"
      | "refresh_run"
      | "open_link"
      | string;
    label: string;
    actionId?: string;
    runId?: string;
    href?: string;
  };
  confidenceLabel: string;
  safety: string;
  proposedFormState?: AIGoalFormState;
  scanFormState?: AIGoalFormState;
  proposalCard?: {
    title: string;
    goal: string;
    stats: Array<{
      label: string;
      value: string;
      hint: string;
    }>;
    checks: string[];
  };
  why: string[];
  aiWillDo: string[];
  humanMustDo: string[];
};

type AIObservationFocusItem = {
  id: string;
  label: string;
  status: string;
  tone: "success" | "warning" | "danger" | "default" | "primary";
  detail: string;
  href?: string;
};

type AIObservationFocusState = {
  stage: string;
  title: string;
  tone: "success" | "warning" | "danger" | "default" | "primary";
  summary: string;
  primaryHref?: string;
  primaryAction?: {
    kind:
      | "scan_today"
      | "rescan_today"
      | "run_all_backtests"
      | "open_link"
      | string;
    label: string;
    href?: string;
  };
  items: AIObservationFocusItem[];
  nextActions: string[];
};

type AIPaperAdoptionPackageStep = {
  id: string;
  label: string;
  status: string;
  detail: string;
  href?: string;
};

type AIPaperAdoptionPackageState = {
  stage: string;
  title: string;
  tone: "success" | "warning" | "danger" | "default" | "primary";
  summary: string;
  candidate: PaperCandidate;
  strategyHref: string;
  backtestHref?: string;
  riskSummary: string;
  primaryAction: {
    kind:
      | "accept_paper_candidate"
      | "save_and_accept_paper_candidate"
      | string;
    label: string;
  };
  secondaryAction: {
    kind: "save_strategy_draft" | string;
    label: string;
  };
  steps: AIPaperAdoptionPackageStep[];
  guardrails: string[];
};

type AINowActionState = {
  stage: string;
  title: string;
  tone: "success" | "warning" | "danger" | "default" | "primary";
  owner: "AI" | "你" | string;
  summary: string;
  primaryHref?: string;
  primaryAction?: {
    kind:
      | "analyze_and_validate"
      | "scan_today"
      | "rescan_today"
      | "run_all_backtests"
      | "accept_paper_candidate"
      | "save_and_accept_paper_candidate"
      | "complete_manual_action"
      | "open_link"
      | string;
    label: string;
    actionId?: string;
    runId?: string;
    href?: string;
  };
  guardrail: string;
  proposedFormState?: AIGoalFormState;
  scanFormState?: AIGoalFormState;
  proposalCard?: {
    title: string;
    goal: string;
    stats: Array<{
      label: string;
      value: string;
      hint: string;
    }>;
    checks: string[];
  };
  why: string[];
  handoff: string;
  nextActions: string[];
};

type AIDelegationRunbookStep = {
  owner: "AI" | "human" | string;
  title: string;
  detail: string;
  status: string;
};

type AIDelegationRunbookState = {
  stage: string;
  tone: "success" | "warning" | "danger" | "default";
  title: string;
  decision: string;
  primaryAction?: {
    kind:
      | "scan_today"
      | "run_all_backtests"
      | "accept_paper_candidate"
      | "open_link"
      | string;
    label: string;
    href?: string;
  };
  metrics: Array<{
    label: string;
    value: string | number;
    hint: string;
  }>;
  aiSteps: AIDelegationRunbookStep[];
  humanSteps: AIDelegationRunbookStep[];
  guardrails: string[];
};

type AIDraftEvidenceState = {
  title: string;
  summary: string;
  tone: "success" | "warning" | "danger" | "default";
  metrics: Array<{ label: string; value: string; hint: string }>;
  evidence: string[];
  risks: string[];
  gates: string[];
  actions: string[];
};

type AIStrategyCreationSummaryState = {
  stage: string;
  title: string;
  tone: "success" | "warning" | "danger" | "default";
  summary: string;
  primaryHref?: string;
  primaryAction?: {
    kind: "save_strategy_draft" | "open_strategy_prefill" | string;
    label: string;
  };
  metrics: Array<{ label: string; value: string; hint: string }>;
  aiPrepared: string[];
  userRequired: string[];
  blockers: string[];
};

type AIStrategyShortlistItem = {
  draftName: string;
  symbol: string;
  kind: string;
  stage: string;
  tone: "success" | "warning" | "danger" | "default";
  rank: number;
  score: number | null;
  recommendation: string;
  actionKind:
    | "run_backtest"
    | "run_all_backtests"
    | "accept_paper_candidate"
    | "open_link"
    | string;
  actionLabel: string;
  href?: string;
  backtestHref?: string;
  strategyHref?: string;
  reasons: string[];
  blockers: string[];
};

type AIStrategyShortlistState = {
  stage: string;
  title: string;
  tone: "success" | "warning" | "danger" | "default";
  summary: string;
  primaryAction?: {
    kind:
      | "scan_today"
      | "run_all_backtests"
      | "accept_paper_candidate"
      | "open_link"
      | string;
    label: string;
  };
  metrics: Array<{ label: string; value: string | number; hint: string }>;
  items: AIStrategyShortlistItem[];
  guardrails: string[];
  nextChecks: string[];
};

type AIOperatorRhythmState = {
  stage: string;
  title: string;
  tone: "success" | "warning" | "danger" | "default";
  cadence: string;
  summary: string;
  primaryAction?: {
    kind:
      | "scan_today"
      | "refresh_run"
      | "run_all_backtests"
      | "accept_paper_candidate"
      | "open_link"
      | string;
    label: string;
    runId?: string;
    href?: string;
  };
  metrics: Array<{ label: string; value: string | number; hint: string }>;
  guardrails: string[];
  checks: string[];
};

type PaperObservationPlan = {
  title: string;
  window: string;
  summary: string;
  checklist: string[];
  stopRules: string[];
  triggers: Array<{
    source: string;
    signal: string;
    interpretation: string;
    action: string;
  }>;
  links: Array<{
    label: string;
    href: string;
  }>;
};

type AIGoalDecision = {
  stage: string;
  title: string;
  tone: "success" | "warning" | "danger" | "default";
  summary: string;
  reasons: string[];
  nextActions: string[];
  primaryHref?: string;
  primaryAction?: {
    kind:
      | "run_all_backtests"
      | "accept_paper_candidate"
      | "save_and_accept_paper_candidate"
      | "open_link"
      | string;
    label: string;
  };
};

type OpportunityRadarState = {
  stage: string;
  title: string;
  tone: "success" | "warning" | "danger" | "default";
  summary: string;
  metrics: Array<{
    label: string;
    value: string | number;
    hint: string;
  }>;
  reasons: string[];
  nextActions: string[];
  primaryHref?: string;
  primaryAction?: {
    kind: "analyze_and_validate" | "run_all_backtests" | "accept_paper_candidate" | "open_link" | string;
    label: string;
  };
};

type AIAutopilotState = {
  stage: string;
  title: string;
  tone: "success" | "warning" | "danger" | "default";
  progress: number;
  maxExecutionMode: string;
  canAutoExecute: boolean;
  summary: string;
  metrics: Array<{
    label: string;
    value: string | number;
    hint: string;
  }>;
  blockers: string[];
  safetyGates: string[];
  nextActions: string[];
  completedSteps: string[];
  aiAvailableSteps: string[];
  humanRequiredSteps: string[];
  primaryHref?: string;
  primaryAction?: {
    kind: "analyze_and_validate" | "run_all_backtests" | "accept_paper_candidate" | "open_link" | string;
    label: string;
  };
};

type AIDecisionJournalItem = {
  kind: string;
  tone: "success" | "warning" | "danger" | "default";
  title: string;
  detail: string;
  href?: string;
  at?: string;
};

type AIDailyMissionTask = {
  id: string;
  title: string;
  detail: string;
  priority: string;
  status: string;
  tone: "success" | "warning" | "danger" | "default";
  actionKind?: string;
  href?: string;
  runId?: string;
  proposedFormState?: AIGoalFormState;
};

type AIDailyMissionState = {
  focus: string;
  title: string;
  tone: "success" | "warning" | "danger" | "default";
  summary: string;
  tasks: AIDailyMissionTask[];
};

type AISentimentCompassState = {
  stage: string;
  title: string;
  tone: "success" | "warning" | "danger" | "default";
  summary: string;
  metrics: Array<{
    label: string;
    value: string | number;
    hint: string;
  }>;
  risks: string[];
  opportunities: string[];
  actions: string[];
};

type AIThesisInvalidationState = {
  stage: string;
  title: string;
  tone: "success" | "warning" | "danger" | "default";
  summary: string;
  primaryAction?: {
    kind:
      | "scan_today"
      | "run_all_backtests"
      | "open_link"
      | string;
    label: string;
    href?: string;
  };
  metrics: Array<{
    label: string;
    value: string | number;
    hint: string;
  }>;
  invalidators: string[];
  monitors: string[];
  stopRules: string[];
  guardrails: string[];
};

type AIMarketWatchSignal = {
  id: string;
  label: string;
  source: string;
  severity: "high" | "medium" | "watch" | string;
  detail: string;
  action: string;
};

type AIMarketWatchtowerState = {
  stage: string;
  title: string;
  tone: "success" | "warning" | "danger" | "default";
  summary: string;
  primaryHref?: string;
  primaryAction?: {
    kind:
      | "scan_today"
      | "rescan_today"
      | "run_all_backtests"
      | "accept_paper_candidate"
      | "open_link"
      | string;
    label: string;
  };
  metrics: Array<{
    label: string;
    value: string | number;
    hint: string;
  }>;
  signals: AIMarketWatchSignal[];
  stopRules: string[];
  nextChecks: string[];
};

type AIMarketMemoryItem = {
  id: string;
  goal: string;
  marketRead: string;
  humanFactors: string[];
  watchSignals: string[];
  watchSignalCount: number;
  openActionCount: number;
  href?: string;
};

type AIMarketMemoryState = {
  stage: string;
  title: string;
  tone: "success" | "warning" | "danger" | "default";
  summary: string;
  primaryAction?: {
    kind: "scan_today" | "open_memory" | string;
    label: string;
  };
  metrics: Array<{
    label: string;
    value: string | number;
    hint: string;
  }>;
  items: AIMarketMemoryItem[];
  nextActions: string[];
};

type AIMoneyBriefState = {
  stage: string;
  title: string;
  tone: "success" | "warning" | "danger" | "default";
  confidence: number;
  audit: {
    verdict: string;
    tone: "success" | "warning" | "danger" | "default";
    ready: string[];
    warnings: string[];
    blockers: string[];
  };
  summary: string;
  primaryHref?: string;
  primaryAction?: {
    kind:
      | "scan_today"
      | "rescan_today"
      | "open_today_run"
      | "run_all_backtests"
      | "accept_paper_candidate"
      | "open_link"
      | string;
    label: string;
  };
  metrics: Array<{
    label: string;
    value: string | number;
    hint: string;
  }>;
  checkpoints: string[];
};

type AIMoneyPathStep = {
  id: string;
  label: string;
  status: "done" | "current" | "blocked" | "pending" | string;
  tone: "success" | "warning" | "danger" | "default";
  detail: string;
  actionKind?: string;
  href?: string;
};

type AIMoneyPathState = {
  stage: string;
  title: string;
  tone: "success" | "warning" | "danger" | "default";
  summary: string;
  currentStepId?: string;
  primaryHref?: string;
  primaryAction?: {
    kind:
      | "scan_today"
      | "run_all_backtests"
      | "accept_paper_candidate"
      | "open_link"
      | "sentiment_review"
      | string;
    label: string;
  };
  steps: AIMoneyPathStep[];
  nextActions: string[];
};

type AICapitalPlanState = {
  stage: string;
  title: string;
  tone: "success" | "warning" | "danger" | "default";
  summary: string;
  recommendedNotionalUsd: number;
  maxDailyLossUsd: number;
  riskDiscount: number;
  primaryHref?: string;
  primaryAction?: {
    kind: "run_all_backtests" | "accept_paper_candidate" | "open_link" | string;
    label: string;
  };
  metrics: Array<{
    label: string;
    value: string | number;
    hint: string;
  }>;
  rules: string[];
  actions: string[];
};

type AIPaperReviewCoachItem = {
  id: string;
  label: string;
  status: "done" | "missing" | string;
  tone: "success" | "warning" | "danger" | "default";
  detail: string;
};

type AIPaperReviewCoachState = {
  stage: string;
  title: string;
  tone: "success" | "warning" | "danger" | "default";
  summary: string;
  candidateLabel: string;
  primaryHref?: string;
  primaryAction?: {
    kind: "run_all_backtests" | "accept_paper_candidate" | "open_link" | string;
    label: string;
  };
  items: AIPaperReviewCoachItem[];
  missingEvidence: string[];
  completionNote: string;
  nextActions: string[];
};

type AIExecutionReadinessState = {
  stage: string;
  title: string;
  tone: "success" | "warning" | "danger" | "default";
  score: number;
  summary: string;
  primaryHref?: string;
  primaryAction?: {
    kind:
      | "scan_today"
      | "rescan_today"
      | "run_all_backtests"
      | "accept_paper_candidate"
      | "open_link"
      | string;
    label: string;
  };
  metrics: Array<{
    label: string;
    value: string | number;
    hint: string;
  }>;
  ready: string[];
  blockers: string[];
};

type AIExecutionPreviewState = {
  stage: string;
  title: string;
  tone: "success" | "warning" | "danger" | "default";
  summary: string;
  primaryHref?: string;
  primaryAction?: {
    kind:
      | "analyze_and_validate"
      | "scan_today"
      | "rescan_today"
      | "run_all_backtests"
      | "accept_paper_candidate"
      | "open_link"
      | string;
    label: string;
  };
  metrics: Array<{
    label: string;
    value: string | number;
    hint: string;
  }>;
  wouldDo: string[];
  willNotDo: string[];
  requiredHumanConfirmations: string[];
};

type AISetupChecklistItem = {
  id: string;
  label: string;
  status: "ready" | "warning" | "blocked" | string;
  tone: "success" | "warning" | "danger" | "default";
  detail: string;
  href?: string;
};

type AISetupChecklistState = {
  stage: string;
  title: string;
  tone: "success" | "warning" | "danger" | "default";
  score: number;
  summary: string;
  primaryHref?: string;
  primaryAction?: {
    kind:
      | "scan_today"
      | "rescan_today"
      | "run_all_backtests"
      | "open_link"
      | string;
    label: string;
  };
  items: AISetupChecklistItem[];
  nextActions: string[];
};

type DailyRadarStatus = {
  hasToday: boolean;
  isStale: boolean;
  title: string;
  tone: "success" | "warning" | "danger" | "default";
  summary: string;
  run: TypeAIGoalRun | null;
  primaryAction: {
    kind: "scan_today" | "open_today_run" | "rescan_today" | string;
    label: string;
  };
  secondaryAction?: {
    kind: "scan_today" | "open_today_run" | "rescan_today" | string;
    label: string;
  };
};

type AISettingsReturnPromptState = {
  stage: string;
  tone: "success" | "warning" | "danger" | "default" | "primary";
  title: string;
  summary: string;
  primaryHref?: string;
  primaryAction: {
    kind: "scan_today" | "rescan_today" | "open_link" | string;
    label: string;
  };
  nextActions: string[];
};

type AIProviderReadinessGateState = {
  stage: string;
  visible: boolean;
  blockManualAnalysis: boolean;
  blockAutoRadar: boolean;
  tone: "success" | "warning" | "danger" | "default" | "primary" | string;
  title: string;
  summary: string;
  primaryHref: string;
  primaryAction: {
    kind: "open_link" | string;
    label: string;
  };
  nextActions: string[];
};

type AIProviderAnalysisAttempt = {
  kind: "allow" | "redirect" | string;
  href?: string;
  label?: string;
};

type AIRunFollowupQueueItem = {
  runId: string;
  goal: string;
  symbols: string;
  title: string;
  detail: string;
  tone: "success" | "warning" | "danger" | "default" | "primary";
  actionKind: string;
  href?: string;
  createdAt?: string;
};

type AIRunFollowupQueueState = {
  stage: string;
  tone: "success" | "warning" | "danger" | "default" | "primary";
  title: string;
  summary: string;
  items: AIRunFollowupQueueItem[];
  nextActions: string[];
  primaryAction?: {
    kind: "open_run" | "refresh_run" | "validate_run" | "scan_today" | string;
    label: string;
    runId?: string;
    href?: string;
  };
};

type AIRunRefreshComparisonItem = {
  oldRunId: string;
  newRunId: string;
  oldGoal: string;
  newGoal: string;
  oldSummary: string;
  newSummary: string;
  href: string;
  contextDelta: number;
  draftDelta: number;
  humanFactorChange: string;
  highlights: string[];
  refreshedAt?: string;
};

type AIRunRefreshComparisonState = {
  stage: string;
  tone: "success" | "warning" | "danger" | "default" | "primary";
  title: string;
  summary: string;
  items: AIRunRefreshComparisonItem[];
};

type AutoDailyRadarDecision = {
  shouldRun: boolean;
  key: string;
  reason: string;
};

type AutoRadarProviderNotice = {
  stage: string;
  tone: StatusTone;
  title: string;
  summary: string;
  primaryHref: string;
  primaryAction: {
    kind: "open_link" | string;
    label: string;
  };
};

type AIGoalTemplate = {
  id: string;
  label: string;
  goal: string;
  symbols: string[];
  horizon: string;
  riskPreference: string;
  executionMode: string;
};

type AIGoalFormState = {
  goal: string;
  symbolsText: string;
  horizon: string;
  riskPreference: string;
  executionMode: string;
  behaviorText?: string;
  narrativeText?: string;
  avoidText?: string;
};

type AIGoalComposerState = {
  stage: string;
  title: string;
  tone: "success" | "warning" | "danger" | "default";
  summary: string;
  proposedFormState: AIGoalFormState;
  checks: string[];
  missing: string[];
  primaryAction: {
    kind: "apply_suggestion" | "analyze_and_validate" | string;
    label: string;
  };
};

type AutoValidationPlan = {
  status: string;
  runnableCount: number;
  items: Array<{
    draft: TypeAIGoalStrategyDraft;
    request: TypeCreateBacktest;
  }>;
  coverage: string[];
  guardrails: string[];
  skippedDrafts: Array<{
    name: string;
    kind: string;
    symbol: string;
    reason: string;
  }>;
  activityLabel: string;
  activityDetail: string;
  actionNote: string;
};

const getDailyRadarStatus = dailyRadarStatusFromRuns as (
  runs: TypeAIGoalRun[],
) => DailyRadarStatus;
const buildSettingsReturnPrompt = aiSettingsReturnPromptFromSearch as unknown as (input: {
  intent: string;
  dailyRadarStatus: DailyRadarStatus;
  providerGate?: AIProviderReadinessGateState | null;
}) => AISettingsReturnPromptState | null;
const buildProviderReadinessGate =
  aiProviderReadinessGateFromStatus as unknown as (
    status: TypeAIGoalProviderStatus | null,
    options?: { loading?: boolean },
  ) => AIProviderReadinessGateState;
const buildProviderAnalysisAttempt =
  aiProviderAnalysisAttemptFromGate as unknown as (
    gate: AIProviderReadinessGateState | null,
  ) => AIProviderAnalysisAttempt;
const buildAutoRadarProviderNotice =
  autoRadarProviderNoticeFromGate as unknown as (input: {
    autoEnabled: boolean;
    gate: AIProviderReadinessGateState | null;
  }) => AutoRadarProviderNotice | null;

const decideAutoDailyRadar = autoDailyRadarDecision as unknown as (input: {
  enabled: boolean;
  busy: boolean;
  providerReady: boolean;
  status: DailyRadarStatus;
  lastKey: string;
}) => AutoDailyRadarDecision;
const decideSettingsReturnAutoRun =
  aiSettingsReturnAutoRunDecision as unknown as (input: {
    intent: string;
    busy: boolean;
    providerBlocked: boolean;
    providerReady: boolean;
    lastKey: string;
  }) => AutoDailyRadarDecision;
const parseAutoRadarEnabled = autoDailyRadarEnabledFromStorage as unknown as (
  value: string | null,
) => boolean;
const decideAutoRadarPreferencePersistence =
  autoDailyRadarPreferencePersistence as unknown as (input: {
    loaded: boolean;
    enabled: boolean;
  }) => { shouldWrite: boolean; value: string };
const buildAnalyzeTargetFormState = aiGoalAnalyzeTargetFormState as unknown as (input: {
  state: AIGoalFormState;
  target?: AIGoalFormState;
  runs: TypeAIGoalRun[];
}) => AIGoalFormState;
const chooseInitialRunToOpen = aiInitialRunToOpenFromRuns as unknown as (input: {
  runs: TypeAIGoalRun[];
  requestedRunId: string;
  activeRunId?: string;
  alreadyOpenedRunId?: string;
}) => string | null;
const buildRunFollowupPrimaryAction = aiRunFollowupPrimaryActionForQueue as unknown as (
  queue: AIRunFollowupQueueState,
) => {
  kind: string;
  label: string;
  runId?: string;
  href?: string;
} | null;
const buildRunFollowupQueue = aiRunFollowupQueueFromRuns as unknown as (
  runs: TypeAIGoalRun[],
) => AIRunFollowupQueueState;
const buildRunRefreshComparison = aiRunRefreshComparisonFromRuns as unknown as (
  runs: TypeAIGoalRun[],
) => AIRunRefreshComparisonState;

function compactJson(v: unknown): string {
  try {
    return JSON.stringify(v ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function providerBlocksAction(
  providerGate: AIProviderReadinessGateState | null | undefined,
  kind: string | undefined,
): boolean {
  const actionKind = String(kind || "");
  if (actionKind === "scan_today" || actionKind === "rescan_today") {
    return Boolean(providerGate?.blockAutoRadar);
  }
  if (actionKind === "analyze_and_validate") {
    return Boolean(providerGate?.blockManualAnalysis || providerGate?.blockAutoRadar);
  }
  return false;
}

function ProviderSetupButton({
  providerGate,
  size = "sm",
  variant,
}: {
  providerGate: AIProviderReadinessGateState | null | undefined;
  size?: "sm" | "md";
  variant?: "flat";
}) {
  if (!providerGate) return null;
  const href = providerGate.primaryHref || "/settings/ai";
  const label = providerGate.primaryAction?.label || "配置真实 AI";
  return (
    <Button
      as={Link}
      href={href}
      type="button"
      size={size}
      color="primary"
      {...(variant ? { variant } : {})}
    >
      {label}
    </Button>
  );
}

function AIProviderReadinessGate({
  state,
}: {
  state: AIProviderReadinessGateState;
}) {
  return (
    <Callout variant="warning" title={state.title}>
      <div className="space-y-3">
        <p>{state.summary}</p>
        {state.nextActions.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5">
            {state.nextActions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
        <Button
          as={Link}
          href={state.primaryHref}
          color="warning"
          variant="flat"
          size="sm"
        >
          {state.primaryAction.label}
        </Button>
      </div>
    </Callout>
  );
}

function runFromAnalysis(
  analysis: TypeAIGoalAnalysis,
  horizon: string,
  riskPreference: string,
): TypeAIGoalRun {
  return {
    id: analysis.id,
    userId: "default",
    createdAt: analysis.createdAt,
    updatedAt: analysis.createdAt,
    goal: analysis.goal,
    summary: analysis.summary,
    symbols: analysis.context.symbols,
    horizon,
    riskPreference,
    status: analysis.ai.status,
    aiStatus: analysis.ai.status,
    aiModel: analysis.ai.model,
    executionMode: analysis.execution.mode,
    strategyDraftCount: analysis.strategyDrafts.length,
    contextNewsCount: analysis.context.newsCount,
    contextMacroCount: analysis.context.macroCount,
    contextOnchainCount: analysis.context.onchainCount,
    analysis,
    actions: defaultAIGoalRunActionsFromAnalysis(analysis) as TypeAIGoalRunAction[],
  };
}

export function AIGoalClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activity = useActivityCenter();
  const requestedRunId = searchParams.get("runId") || "";
  const requestedIntent = searchParams.get("intent") || "";
  const [goal, setGoal] = useState(
    "用较低回撤在未来 1-4 周寻找 BTC/ETH 的 AI 辅助赚钱机会，同时考虑新闻情绪、市场拥挤和链上变化。",
  );
  const [symbolsText, setSymbolsText] = useState("BTC, ETH");
  const [horizon, setHorizon] = useState("1-4 weeks");
  const [riskPreference, setRiskPreference] = useState("balanced");
  const [executionMode, setExecutionMode] = useState("paper");
  const [behaviorText, setBehaviorText] = useState(DEFAULT_BEHAVIOR_TEXT);
  const [narrativeText, setNarrativeText] = useState(DEFAULT_NARRATIVE_TEXT);
  const [avoidText, setAvoidText] = useState(DEFAULT_AVOID_TEXT);
  const [analysis, setAnalysis] = useState<TypeAIGoalAnalysis | null>(null);
  const [activeRun, setActiveRun] = useState<TypeAIGoalRun | null>(null);
  const [runs, setRuns] = useState<TypeAIGoalRun[]>([]);
  const [accounts, setAccounts] = useState<TypeAccount[]>([]);
  const [providerStatus, setProviderStatus] = useState<TypeAIGoalProviderStatus | null>(null);
  const [providerStatusBusy, setProviderStatusBusy] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [runError, setRunError] = useState<unknown>(null);
  const [accountsError, setAccountsError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [runsBusy, setRunsBusy] = useState(true);
  const [accountsBusy, setAccountsBusy] = useState(true);
  const [backtestBusyKey, setBacktestBusyKey] = useState<string | null>(null);
  const [batchBacktestBusy, setBatchBacktestBusy] = useState(false);
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [actionBusyKey, setActionBusyKey] = useState<string | null>(null);
  const [strategySaveBusyKey, setStrategySaveBusyKey] = useState<string | null>(null);
  const [validationRuns, setValidationRuns] = useState<TypeBacktest[]>([]);
  const [validationBusy, setValidationBusy] = useState(false);
  const [validationError, setValidationError] = useState<unknown>(null);
  const [autoRadarEnabled, setAutoRadarEnabled] = useState(false);
  const [autoRadarPreferenceLoaded, setAutoRadarPreferenceLoaded] = useState(false);
  const autoRadarLastKeyRef = useRef("");
  const autoOpenedRunIdRef = useRef("");
  const settingsReturnAutoRunKeyRef = useRef("");
  const providerGate = buildProviderReadinessGate(providerStatus, {
    loading: providerStatusBusy,
  });
  const autoRadarProviderNotice = buildAutoRadarProviderNotice({
    autoEnabled: autoRadarEnabled,
    gate: providerGate,
  });
  const redirectIfProviderBlocksAnalysis = useCallback(() => {
    const attempt = buildProviderAnalysisAttempt(providerGate);
    if (attempt.kind !== "redirect") return false;
    router.push(attempt.href || "/settings/ai");
    return true;
  }, [providerGate, router]);

  const backtestAction = activeRun?.actions?.find((a) => a.id === "backtest");
  const validationRunIds = useMemo(
    () => backtestRunIdsFromAction(backtestAction),
    [backtestAction],
  );
  const validationRunKey = validationRunIds.join(",");

  const refreshRuns = async () => {
    setRunsBusy(true);
    setRunError(null);
    try {
      setRuns(await listAIGoalRuns(20));
    } catch (e) {
      setRunError(e);
    } finally {
      setRunsBusy(false);
    }
  };

  useEffect(() => {
    let alive = true;
    listAIGoalRuns(20)
      .then((next) => {
        if (alive) setRuns(next);
      })
      .catch((e) => {
        if (alive) setRunError(e);
      })
      .finally(() => {
        if (alive) setRunsBusy(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    listAccounts()
      .then((next) => {
        if (alive) {
          setAccounts(next);
          setAccountsError(null);
        }
      })
      .catch((e) => {
        if (alive) setAccountsError(e);
      })
      .finally(() => {
        if (alive) setAccountsBusy(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    getAIGoalProviderStatus()
      .then((next) => {
        if (alive) setProviderStatus(next);
      })
      .catch(() => {
        if (alive) setProviderStatus(null);
      })
      .finally(() => {
        if (alive) setProviderStatusBusy(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let enabled = false;
    let lastKey = "";
    try {
      enabled = parseAutoRadarEnabled(
        window.localStorage.getItem(AUTO_DAILY_RADAR_ENABLED_KEY),
      );
      lastKey = window.localStorage.getItem(AUTO_DAILY_RADAR_LAST_KEY) || "";
    } catch {
      enabled = parseAutoRadarEnabled(null);
      lastKey = "";
    }
    autoRadarLastKeyRef.current = lastKey;
    const timer = window.setTimeout(() => {
      setAutoRadarEnabled(enabled);
      setAutoRadarPreferenceLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const persistence = decideAutoRadarPreferencePersistence({
      loaded: autoRadarPreferenceLoaded,
      enabled: autoRadarEnabled,
    });
    if (!persistence.shouldWrite) return;
    try {
      window.localStorage.setItem(
        AUTO_DAILY_RADAR_ENABLED_KEY,
        persistence.value,
      );
    } catch {
      // localStorage can be unavailable in restricted browser contexts.
    }
  }, [autoRadarEnabled, autoRadarPreferenceLoaded]);

  useEffect(() => {
    let alive = true;
    let pollTimer: number | null = null;
    if (validationRunKey === "") {
      return () => {
        alive = false;
        if (pollTimer) window.clearTimeout(pollTimer);
      };
    }
    const ids = validationRunKey.split(",").filter(Boolean);
    const loadValidationRuns = (showBusy: boolean) => {
      if (pollTimer) {
        window.clearTimeout(pollTimer);
        pollTimer = null;
      }
      Promise.resolve()
        .then(() => {
          if (alive && showBusy) {
            setValidationBusy(true);
            setValidationError(null);
          }
          return Promise.all(ids.map((id) => getBacktest(id)));
        })
        .then((rows) => {
          if (!alive) return;
          setValidationRuns(rows);
          setValidationError(null);
          if (validationRunsNeedPolling(rows)) {
            pollTimer = window.setTimeout(() => loadValidationRuns(false), 5000);
          }
        })
        .catch((e) => {
          if (alive) setValidationError(e);
        })
        .finally(() => {
          if (alive && showBusy) setValidationBusy(false);
        });
    };
    loadValidationRuns(true);
    return () => {
      alive = false;
      if (pollTimer) window.clearTimeout(pollTimer);
    };
  }, [validationRunKey]);

  const currentFormState = (): AIGoalFormState => ({
    goal,
    symbolsText,
    horizon,
    riskPreference,
    executionMode,
    behaviorText,
    narrativeText,
    avoidText,
  });

  const applyFormState = useCallback((next: AIGoalFormState) => {
    setGoal(next.goal);
    setSymbolsText(next.symbolsText);
    setHorizon(next.horizon);
    setRiskPreference(next.riskPreference);
    setExecutionMode(next.executionMode);
    setBehaviorText(next.behaviorText ?? DEFAULT_BEHAVIOR_TEXT);
    setNarrativeText(next.narrativeText ?? DEFAULT_NARRATIVE_TEXT);
    setAvoidText(next.avoidText ?? DEFAULT_AVOID_TEXT);
  }, []);

  const runGoalAnalysis = useCallback(async (
    payload: TypeAIGoalRequest,
  ): Promise<TypeAIGoalAnalysis | null> => {
    setBusy(true);
    setError(null);
    try {
      const next = await withActivity(
        activity,
        {
          kind: "optimization",
          label: "AI 目标分析",
          detail: payload.symbols?.join(", ") || "auto",
        },
        () => analyzeAIGoal(payload),
      );
      setAnalysis(next);
      const preview = runFromAnalysis(
        next,
        payload.horizon ?? "",
        payload.riskPreference ?? "",
      );
      setActiveRun(preview);
      setRuns((prev) => [preview, ...prev.filter((r) => r.id !== preview.id)].slice(0, 20));
      return next;
    } catch (e) {
      setError(e);
      return null;
    } finally {
      setBusy(false);
    }
  }, [activity]);

  const openRun = useCallback(async (run: Pick<TypeAIGoalRun, "id">) => {
    setRunsBusy(true);
    setRunError(null);
    try {
      const detail = await getAIGoalRun(run.id);
      if (detail.analysis) {
        setAnalysis(detail.analysis);
      }
      setActiveRun(detail);
      const restored = formStateFromAIGoalRun(detail, {
        goal,
        symbolsText,
        horizon,
        riskPreference,
        executionMode,
        behaviorText,
        narrativeText,
        avoidText,
      });
      setGoal(restored.goal);
      setSymbolsText(restored.symbolsText);
      setHorizon(restored.horizon);
      setRiskPreference(restored.riskPreference);
      setExecutionMode(restored.executionMode);
      setRuns((prev) => [detail, ...prev.filter((r) => r.id !== detail.id)].slice(0, 20));
    } catch (e) {
      setRunError(e);
    } finally {
      setRunsBusy(false);
    }
  }, [
    avoidText,
    behaviorText,
    executionMode,
    goal,
    horizon,
    narrativeText,
    riskPreference,
    symbolsText,
  ]);

  useEffect(() => {
    if (!requestedRunId || autoOpenedRunIdRef.current === requestedRunId) return;
    autoOpenedRunIdRef.current = requestedRunId;
    void openRun({ id: requestedRunId });
  }, [openRun, requestedRunId]);

  useEffect(() => {
    if (runsBusy) return;
    const runId = chooseInitialRunToOpen({
      runs,
      requestedRunId,
      activeRunId: activeRun?.id,
      alreadyOpenedRunId: autoOpenedRunIdRef.current,
    });
    if (!runId) return;
    autoOpenedRunIdRef.current = runId;
    void openRun({ id: runId });
  }, [activeRun?.id, openRun, requestedRunId, runs, runsBusy]);

  const runBacktestDraft = async (draft: TypeAIGoalStrategyDraft) => {
    const request = backtestRequestFromDraft(draft) as TypeCreateBacktest | null;
    if (!request) return;
    const key = `${draft.name}-${draft.symbol}`;
    setBacktestBusyKey(key);
    setError(null);
    try {
      const handle = await withActivity(
        activity,
        {
          kind: "backtest",
          label: `AI 回测 - ${draft.name || draft.symbol}`,
          detail: `${request.symbol} · 90d · ${request.timeframe}`,
        },
        () => createBacktest(request),
      );
      if (analysis?.id) {
        try {
          const updated = await updateAIGoalRunAction(analysis.id, "backtest", {
            status: "done",
            relatedId: handle.runId,
            href: `/backtests/${handle.runId}`,
            note: "已发起 AI 草案回测",
          });
          setActiveRun(updated);
          setRuns((prev) => [updated, ...prev.filter((r) => r.id !== updated.id)].slice(0, 20));
        } catch (e) {
          setError(e);
        }
      }
      router.push(`/backtests/${handle.runId}`);
    } catch (e) {
      setError(e);
    } finally {
      setBacktestBusyKey(null);
    }
  };

  const runValidationBacktests = useCallback(async (
    target: TypeAIGoalAnalysis,
  ): Promise<TypeBacktestHandle[]> => {
    const plan = autoValidationPlanFromAnalysis(target) as AutoValidationPlan;
    if (plan.items.length === 0) return [];
    setBatchBacktestBusy(true);
    setError(null);
    try {
      const handles = await withActivity(
        activity,
        {
          kind: "backtest",
          label: plan.activityLabel,
          detail: plan.activityDetail,
        },
        async () => {
          const out: TypeBacktestHandle[] = [];
          for (const { request } of plan.items) {
            out.push(await createBacktest(request));
          }
          return out;
        },
      );
      if (handles.length > 0) {
        setValidationRuns(
          optimisticValidationRunsFromHandles(plan, handles) as TypeBacktest[],
        );
        setValidationError(null);
        try {
          const update = backtestActionUpdateFromValidationResult(plan, handles);
          const updated = await updateAIGoalRunAction(target.id, "backtest", update);
          setActiveRun(updated);
          setRuns((prev) => [updated, ...prev.filter((r) => r.id !== updated.id)].slice(0, 20));
        } catch (e) {
          setError(e);
        }
      }
      return handles;
    } catch (e) {
      setError(e);
      return [];
    } finally {
      setBatchBacktestBusy(false);
    }
  }, [activity]);

  const runAllBacktests = async (target: TypeAIGoalAnalysis) => {
    await runValidationBacktests(target);
  };

  const analyzeAndValidateGoal = useCallback(async (
    payload: TypeAIGoalRequest,
  ): Promise<TypeAIGoalAnalysis | null> => {
    setPipelineBusy(true);
    try {
      const next = await runGoalAnalysis(payload);
      if (next) {
        await runValidationBacktests(next);
      }
      return next;
    } finally {
      setPipelineBusy(false);
    }
  }, [runGoalAnalysis, runValidationBacktests]);

  const onAnalyzeAndValidate = async (targetFormState?: AIGoalFormState) => {
    if (redirectIfProviderBlocksAnalysis()) return;
    const next = buildAnalyzeTargetFormState({
      state: currentFormState(),
      target: targetFormState,
      runs,
    });
    if (targetFormState) {
      applyFormState(next);
    }
    const payload = aiGoalRequestFromFormState(next) as TypeAIGoalRequest;
    await analyzeAndValidateGoal(payload);
  };

  const buildExecutableFormState = aiGoalExecutableFormStateFromState as unknown as (input: {
    state: AIGoalFormState;
    runs: TypeAIGoalRun[];
  }) => AIGoalFormState;
  const executableFormState = () =>
    buildExecutableFormState({
      state: currentFormState(),
      runs,
    });

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await onAnalyzeAndValidate(executableFormState());
  };

  const onDailyRadarScan = useCallback(async (targetFormState?: AIGoalFormState) => {
    if (redirectIfProviderBlocksAnalysis()) return;
    const next =
      targetFormState ?? (dailyRadarFormStateFromRuns(runs) as AIGoalFormState);
    applyFormState(next);
    const payload = aiGoalRequestFromFormState(next) as TypeAIGoalRequest;
    await analyzeAndValidateGoal(payload);
  }, [
    analyzeAndValidateGoal,
    applyFormState,
    redirectIfProviderBlocksAnalysis,
    runs,
  ]);

  const refreshRun = useCallback(async (run: Pick<TypeAIGoalRun, "id">) => {
    setRunsBusy(true);
    setRunError(null);
    try {
      const detail = await getAIGoalRun(run.id);
      const restored = formStateFromAIGoalRun(detail, {
        goal,
        symbolsText,
        horizon,
        riskPreference,
        executionMode,
        behaviorText,
        narrativeText,
        avoidText,
      }) as AIGoalFormState;
      applyFormState(restored);
      if (redirectIfProviderBlocksAnalysis()) return;
      const payload = aiGoalRequestFromFormState(restored) as TypeAIGoalRequest;
      const refreshed = await analyzeAndValidateGoal(payload);
      if (refreshed) {
        try {
          const href = `/ai-money?${new URLSearchParams({ runId: refreshed.id }).toString()}`;
          const updatedOldRun = await updateAIGoalRunAction(detail.id, "refresh_context", {
            status: "done",
            relatedId: refreshed.id,
            href,
            note: `已重新扫描为新 AI run：${refreshed.id}`,
          });
          setRuns((prev) => {
            const exists = prev.some((entry) => entry.id === updatedOldRun.id);
            if (!exists) return [updatedOldRun, ...prev].slice(0, 20);
            return prev.map((entry) =>
              entry.id === updatedOldRun.id ? updatedOldRun : entry,
            );
          });
        } catch (e) {
          setError(e);
        }
      }
    } catch (e) {
      setRunError(e);
    } finally {
      setRunsBusy(false);
    }
  }, [
    analyzeAndValidateGoal,
    applyFormState,
    avoidText,
    behaviorText,
    executionMode,
    goal,
    horizon,
    narrativeText,
    riskPreference,
    redirectIfProviderBlocksAnalysis,
    symbolsText,
  ]);

  const validateRun = useCallback(async (run: Pick<TypeAIGoalRun, "id">) => {
    setRunsBusy(true);
    setRunError(null);
    try {
      const detail = await getAIGoalRun(run.id);
      if (!detail.analysis) {
        setRunError(new Error("此 AI run 缺少可验证的分析结果。"));
        return;
      }
      setAnalysis(detail.analysis);
      setActiveRun(detail);
      const restored = formStateFromAIGoalRun(detail, {
        goal,
        symbolsText,
        horizon,
        riskPreference,
        executionMode,
        behaviorText,
        narrativeText,
        avoidText,
      }) as AIGoalFormState;
      applyFormState(restored);
      setRuns((prev) => [detail, ...prev.filter((r) => r.id !== detail.id)].slice(0, 20));
      await runValidationBacktests(detail.analysis);
    } catch (e) {
      setRunError(e);
    } finally {
      setRunsBusy(false);
    }
  }, [
    applyFormState,
    avoidText,
    behaviorText,
    executionMode,
    goal,
    horizon,
    narrativeText,
    riskPreference,
    runValidationBacktests,
    symbolsText,
  ]);

  const acceptPaperCandidate = async (
    candidate: PaperCandidate,
    options: { skipStrategyActionUpdate?: boolean } = {},
  ) => {
    if (!analysis?.id) return;
    setError(null);
    try {
      const candidateWithRunHref = {
        ...candidate,
        strategyHref: strategyHrefWithAIRunId(candidate.strategyHref, analysis.id),
      };
      if (!options.skipStrategyActionUpdate) {
        await updateAIGoalRunAction(analysis.id, "strategy", {
          status: "ready",
          relatedId: candidateWithRunHref.strategyId,
          href: candidateWithRunHref.strategyHref,
          note: `AI 推荐进入 paper 观察：${candidateWithRunHref.draft.name}，评分 ${candidateWithRunHref.score}，关联回测 ${candidateWithRunHref.runId}`,
        });
      }
      const paperWatchPatch = paperWatchActionPatchFromCandidate(
        analysis,
        candidateWithRunHref,
      ) as TypeAIGoalRunActionPatch | null;
      if (!paperWatchPatch) {
        setError(new Error("无法生成 AI paper 观察交接。"));
        return;
      }
      const updated = await updateAIGoalRunAction(
        analysis.id,
        "paper_watch",
        paperWatchPatch,
      );
      setActiveRun(updated);
      setRuns((prev) => [updated, ...prev.filter((r) => r.id !== updated.id)].slice(0, 20));
    } catch (e) {
      setError(e);
    }
  };

  const saveStrategyDraftCore = async (
    draft: TypeAIGoalStrategyDraft,
    options: { redirect: boolean; requireRunAction?: boolean },
  ) => {
    const buildOptionPayload = optionPayloadFromStrategyDraft as unknown as (
      draft: TypeAIGoalStrategyDraft,
      options?: { aiRunId?: string },
    ) => TypeOption | null;
    const redirectAfterCreate = optionCreateRedirectHref as unknown as (input: {
      isAIPreset: boolean;
      response: TypeCreateOptionResponse;
      runId?: string;
    }) => string;
    const buildStrategyActionPatch = strategyActionPatchFromSavedDraft as unknown as (input: {
      analysis: TypeAIGoalAnalysis | null;
      draft: TypeAIGoalStrategyDraft;
      response: TypeCreateOptionResponse;
      href: string;
    }) => TypeAIGoalRunActionPatch;
    const payload = buildOptionPayload(draft, { aiRunId: analysis?.id });
    if (!payload) {
      setError(new Error("该 AI 草案不是可直接保存的 Grid DCA 策略。"));
      return;
    }
    const key = `${draft.name}-${draft.symbol}`;
    setStrategySaveBusyKey(key);
    setError(null);
    try {
      const response = await withActivity(
        activity,
        {
          kind: "other",
          label: `保存 AI 策略草案 - ${payload.name}`,
          detail: payload.execSymbol,
        },
        () => createOption(payload),
      );
      const href = redirectAfterCreate({
        isAIPreset: true,
        response,
        runId: analysis?.id,
      });
      if (analysis?.id) {
        try {
          const strategyActionPatch = buildStrategyActionPatch({
            analysis,
            draft,
            response,
            href,
          });
          const updated = await updateAIGoalRunAction(
            analysis.id,
            "strategy",
            strategyActionPatch,
          );
          setActiveRun(updated);
          setRuns((prev) => [updated, ...prev.filter((r) => r.id !== updated.id)].slice(0, 20));
        } catch (e) {
          setError(e);
          if (options.requireRunAction) return null;
        }
      }
      if (options.redirect) router.push(href);
      return { response, href };
    } catch (e) {
      setError(e);
      return null;
    } finally {
      setStrategySaveBusyKey(null);
    }
  };

  const saveStrategyDraft = async (draft: TypeAIGoalStrategyDraft) => {
    await saveStrategyDraftCore(draft, { redirect: true });
  };

  const saveAndAcceptPaperCandidate = async (candidate: PaperCandidate) => {
    if (!analysis?.id) return;
    const saved = await saveStrategyDraftCore(candidate.draft, {
      redirect: false,
      requireRunAction: true,
    });
    if (!saved) return;
    await acceptPaperCandidate(
      {
        ...candidate,
        strategyHref: saved.href,
      },
      { skipStrategyActionUpdate: true },
    );
  };

  const updateQueueAction = async (item: ActionQueueItem) => {
    if (!analysis?.id) return;
    const transition = manualActionTransition(item);
    if (!transition) return;
    setActionBusyKey(item.id);
    setError(null);
    try {
      const updated = await updateAIGoalRunAction(analysis.id, item.id, {
        status: transition.nextStatus,
        relatedId: item.relatedId,
        href: item.href,
        note: transition.note,
      });
      setActiveRun(updated);
      setRuns((prev) => [updated, ...prev.filter((r) => r.id !== updated.id)].slice(0, 20));
    } catch (e) {
      setError(e);
    } finally {
      setActionBusyKey(null);
    }
  };

  const applyGoalTemplate = (template: AIGoalTemplate) => {
    const next = formStateFromGoalTemplate(
      template,
      currentFormState(),
    ) as AIGoalFormState;
    applyFormState(next);
  };

  const analyzeGoalTemplate = async (template: AIGoalTemplate) => {
    const next = formStateFromGoalTemplate(
      template,
      currentFormState(),
    ) as AIGoalFormState;
    applyFormState(next);
    if (redirectIfProviderBlocksAnalysis()) return;
    const payload = aiGoalRequestFromFormState(next) as TypeAIGoalRequest;
    await runGoalAnalysis(payload);
  };

  const validateGoalTemplate = async (template: AIGoalTemplate) => {
    const next = formStateFromGoalTemplate(
      template,
      currentFormState(),
    ) as AIGoalFormState;
    applyFormState(next);
    await onAnalyzeAndValidate(next);
  };

  const activeActions: TypeAIGoalRunAction[] =
    activeRun && activeRun.id === analysis?.id ? activeRun.actions ?? [] : [];
  const activeValidationRuns =
    activeRun?.id === analysis?.id && validationRunKey !== "" ? validationRuns : [];
  const buildOpportunityRadar = opportunityRadarFromState as (input: {
    analysis: TypeAIGoalAnalysis | null;
    persistedActions: TypeAIGoalRunAction[];
    validationRuns: TypeBacktest[];
    runs: TypeAIGoalRun[];
  }) => OpportunityRadarState;
  const buildAutopilotState = aiAutopilotStateFromAnalysis as (input: {
    analysis: TypeAIGoalAnalysis | null;
    persistedActions: TypeAIGoalRunAction[];
    validationRuns: TypeBacktest[];
  }) => AIAutopilotState;
  const buildDecisionJournal = aiDecisionJournalFromState as (input: {
    analysis: TypeAIGoalAnalysis | null;
    persistedActions: TypeAIGoalRunAction[];
    validationRuns: TypeBacktest[];
    runs: TypeAIGoalRun[];
  }) => AIDecisionJournalItem[];
  const buildDailyMission = aiDailyMissionFromState as unknown as (input: {
    analysis: TypeAIGoalAnalysis | null;
    persistedActions: TypeAIGoalRunAction[];
    validationRuns: TypeBacktest[];
    runs: TypeAIGoalRun[];
    dailyRadarStatus: DailyRadarStatus;
    providerGate?: AIProviderReadinessGateState | null;
  }) => AIDailyMissionState;
  const buildSentimentCompass = aiSentimentCompassFromAnalysis as (
    analysis: TypeAIGoalAnalysis | null,
  ) => AISentimentCompassState;
  const buildThesisInvalidation = aiThesisInvalidationFromState as unknown as (input: {
    analysis: TypeAIGoalAnalysis | null;
    validationRuns: TypeBacktest[];
    persistedActions: TypeAIGoalRunAction[];
  }) => AIThesisInvalidationState;
  const buildMarketWatchtower = aiMarketWatchtowerFromState as unknown as (input: {
    analysis: TypeAIGoalAnalysis | null;
    persistedActions: TypeAIGoalRunAction[];
    validationRuns: TypeBacktest[];
    dailyRadarStatus: DailyRadarStatus;
  }) => AIMarketWatchtowerState;
  const buildMarketMemory = aiMarketMemoryFromState as unknown as (input: {
    analysis: TypeAIGoalAnalysis | null;
    runs: TypeAIGoalRun[];
  }) => AIMarketMemoryState;
  const buildMoneyBrief = aiMoneyBriefFromState as unknown as (input: {
    analysis: TypeAIGoalAnalysis | null;
    persistedActions: TypeAIGoalRunAction[];
    validationRuns: TypeBacktest[];
    runs: TypeAIGoalRun[];
    dailyRadarStatus: DailyRadarStatus;
    providerGate?: AIProviderReadinessGateState | null;
  }) => AIMoneyBriefState;
  const buildMoneyPath = aiMoneyPathFromState as unknown as (input: {
    analysis: TypeAIGoalAnalysis | null;
    persistedActions: TypeAIGoalRunAction[];
    validationRuns: TypeBacktest[];
    runs: TypeAIGoalRun[];
    accounts?: TypeAccount[];
    dailyRadarStatus: DailyRadarStatus;
    providerGate?: AIProviderReadinessGateState | null;
  }) => AIMoneyPathState;
  const buildCapitalPlan = aiCapitalPlanFromState as (input: {
    analysis: TypeAIGoalAnalysis | null;
    candidate: PaperCandidate | null;
    persistedActions: TypeAIGoalRunAction[];
  }) => AICapitalPlanState;
  const buildSizedPaperCandidate = paperCandidateWithCapitalPlan as unknown as (
    candidate: PaperCandidate | null,
    capitalPlan: AICapitalPlanState,
  ) => PaperCandidate | null;
  const buildPaperReviewCoach = aiPaperReviewCoachFromState as (input: {
    analysis: TypeAIGoalAnalysis | null;
    persistedActions: TypeAIGoalRunAction[];
    validationRuns: TypeBacktest[];
  }) => AIPaperReviewCoachState;
  const buildExecutionReadiness = aiExecutionReadinessFromState as (input: {
    analysis: TypeAIGoalAnalysis | null;
    persistedActions: TypeAIGoalRunAction[];
    validationRuns: TypeBacktest[];
    accounts?: TypeAccount[];
  }) => AIExecutionReadinessState;
  const buildExecutionPreview = aiExecutionPreviewFromState as (input: {
    analysis: TypeAIGoalAnalysis | null;
    persistedActions: TypeAIGoalRunAction[];
    validationRuns: TypeBacktest[];
    accounts?: TypeAccount[];
  }) => AIExecutionPreviewState;
  const buildSetupChecklist = aiSetupChecklistFromState as unknown as (input: {
    analysis: TypeAIGoalAnalysis | null;
    validationRuns: TypeBacktest[];
    accounts?: TypeAccount[];
    dailyRadarStatus: DailyRadarStatus;
    providerGate?: AIProviderReadinessGateState | null;
  }) => AISetupChecklistState;
  const buildGoalComposer = aiGoalComposerFromFormState as unknown as (input: {
    state: AIGoalFormState;
    runs: TypeAIGoalRun[];
  }) => AIGoalComposerState;
  const buildCommandCenter = aiCommandCenterFromState as unknown as (input: {
    analysis: TypeAIGoalAnalysis | null;
    persistedActions: TypeAIGoalRunAction[];
    validationRuns: TypeBacktest[];
    runs: TypeAIGoalRun[];
    accounts?: TypeAccount[];
    dailyRadarStatus: DailyRadarStatus;
    providerGate?: AIProviderReadinessGateState | null;
  }) => AICommandCenterState;
  const buildAutonomousCommand = aiAutonomousCommandFromState as unknown as (input: {
    analysis: TypeAIGoalAnalysis | null;
    persistedActions: TypeAIGoalRunAction[];
    validationRuns: TypeBacktest[];
    runs: TypeAIGoalRun[];
    accounts?: TypeAccount[];
    dailyRadarStatus: DailyRadarStatus;
    providerGate?: AIProviderReadinessGateState | null;
  }) => AIAutonomousCommandState;
  const buildObservationFocus = aiObservationFocusFromState as unknown as (input: {
    analysis: TypeAIGoalAnalysis | null;
    persistedActions: TypeAIGoalRunAction[];
    validationRuns: TypeBacktest[];
    runs: TypeAIGoalRun[];
    dailyRadarStatus: DailyRadarStatus;
    providerGate?: AIProviderReadinessGateState | null;
  }) => AIObservationFocusState;
  const buildPaperAdoptionPackage = aiPaperAdoptionPackageFromState as unknown as (input: {
    analysis: TypeAIGoalAnalysis | null;
    persistedActions: TypeAIGoalRunAction[];
    validationRuns: TypeBacktest[];
    capitalPlan: AICapitalPlanState;
    aiRunId?: string;
  }) => AIPaperAdoptionPackageState | null;
  const buildNowAction = aiNowActionFromState as unknown as (input: {
    analysis: TypeAIGoalAnalysis | null;
    persistedActions: TypeAIGoalRunAction[];
    validationRuns: TypeBacktest[];
    runs: TypeAIGoalRun[];
    dailyRadarStatus: DailyRadarStatus;
    providerGate?: AIProviderReadinessGateState | null;
  }) => AINowActionState;
  const buildDelegationRunbook = aiDelegationRunbookFromState as unknown as (input: {
    analysis: TypeAIGoalAnalysis | null;
    persistedActions: TypeAIGoalRunAction[];
    validationRuns: TypeBacktest[];
    accounts?: TypeAccount[];
    dailyRadarStatus: DailyRadarStatus;
    providerGate?: AIProviderReadinessGateState | null;
  }) => AIDelegationRunbookState;
  const buildOperatorRhythm = aiOperatorRhythmFromState as unknown as (input: {
    analysis: TypeAIGoalAnalysis | null;
    persistedActions: TypeAIGoalRunAction[];
    validationRuns: TypeBacktest[];
    runs: TypeAIGoalRun[];
    dailyRadarStatus: DailyRadarStatus;
    providerGate?: AIProviderReadinessGateState | null;
  }) => AIOperatorRhythmState;
  const dailyRadarStatus = useMemo(() => getDailyRadarStatus(runs), [runs]);
  const settingsReturnPrompt = useMemo(
    () => buildSettingsReturnPrompt({ intent: requestedIntent, dailyRadarStatus, providerGate }),
    [dailyRadarStatus, providerGate, requestedIntent],
  );
  const runFollowupQueue = useMemo(() => buildRunFollowupQueue(runs), [runs]);
  const runRefreshComparison = useMemo(
    () => buildRunRefreshComparison(runs),
    [runs],
  );
  const currentForm = currentFormState();
  const formActions = aiGoalFormPrimaryActions() as {
    primary: { kind: string; label: string; submit: boolean };
    secondary: { kind: string; label: string };
    goalRequired: boolean;
    helperText: string;
  };
  const goalComposer = buildGoalComposer({
    state: currentForm,
    runs,
  });
  const radar = buildOpportunityRadar({
    analysis,
    persistedActions: activeActions,
    validationRuns: activeValidationRuns,
    runs,
  });
  const autopilot = buildAutopilotState({
    analysis,
    persistedActions: activeActions,
    validationRuns: activeValidationRuns,
  });
  const decisionJournal = buildDecisionJournal({
    analysis,
    persistedActions: activeActions,
    validationRuns: activeValidationRuns,
    runs,
  });
  const dailyMission = buildDailyMission({
    analysis,
    persistedActions: activeActions,
    validationRuns: activeValidationRuns,
    runs,
    dailyRadarStatus,
    providerGate,
  });
  const sentimentCompass = buildSentimentCompass(analysis);
  const thesisInvalidation = buildThesisInvalidation({
    analysis,
    validationRuns: activeValidationRuns,
    persistedActions: activeActions,
  });
  const marketWatchtower = buildMarketWatchtower({
    analysis,
    persistedActions: activeActions,
    validationRuns: activeValidationRuns,
    dailyRadarStatus,
  });
  const marketMemory = buildMarketMemory({
    analysis,
    runs,
  });
  const moneyBrief = buildMoneyBrief({
    analysis,
    persistedActions: activeActions,
    validationRuns: activeValidationRuns,
    runs,
    dailyRadarStatus,
    providerGate,
  });
  const moneyPath = buildMoneyPath({
    analysis,
    persistedActions: activeActions,
    validationRuns: activeValidationRuns,
    runs,
    accounts: accountsBusy ? undefined : accounts,
    dailyRadarStatus,
    providerGate,
  });
  const radarCandidate = analysis
    ? (paperCandidateFromValidation(analysis, activeValidationRuns) as PaperCandidate | null)
    : null;
  const capitalPlan = buildCapitalPlan({
    analysis,
    candidate: radarCandidate,
    persistedActions: activeActions,
  });
  const capitalSizedCandidate = buildSizedPaperCandidate(radarCandidate, capitalPlan);
  const paperAdoptionPackage = buildPaperAdoptionPackage({
    analysis,
    persistedActions: activeActions,
    validationRuns: activeValidationRuns,
    capitalPlan,
    aiRunId: analysis?.id,
  });
  const paperReviewCoach = buildPaperReviewCoach({
    analysis,
    persistedActions: activeActions,
    validationRuns: activeValidationRuns,
  });
  const executionReadiness = buildExecutionReadiness({
    analysis,
    persistedActions: activeActions,
    validationRuns: activeValidationRuns,
    accounts: accountsBusy ? undefined : accounts,
  });
  const executionPreview = buildExecutionPreview({
    analysis,
    persistedActions: activeActions,
    validationRuns: activeValidationRuns,
    accounts: accountsBusy ? undefined : accounts,
  });
  const setupChecklist = buildSetupChecklist({
    analysis,
    validationRuns: activeValidationRuns,
    accounts: accountsBusy ? undefined : accounts,
    dailyRadarStatus,
    providerGate,
  });
  const commandCenter = buildCommandCenter({
    analysis,
    persistedActions: activeActions,
    validationRuns: activeValidationRuns,
    runs,
    accounts: accountsBusy ? undefined : accounts,
    dailyRadarStatus,
    providerGate,
  });
  const autonomousCommand = buildAutonomousCommand({
    analysis,
    persistedActions: activeActions,
    validationRuns: activeValidationRuns,
    runs,
    accounts: accountsBusy ? undefined : accounts,
    dailyRadarStatus,
    providerGate,
  });
  const observationFocus = buildObservationFocus({
    analysis,
    persistedActions: activeActions,
    validationRuns: activeValidationRuns,
    runs,
    dailyRadarStatus,
    providerGate,
  });
  const nowAction = buildNowAction({
    analysis,
    persistedActions: activeActions,
    validationRuns: activeValidationRuns,
    runs,
    dailyRadarStatus,
    providerGate,
  });
  const nowActionManualItem =
    analysis &&
    nowAction.primaryAction?.kind === "complete_manual_action" &&
    nowAction.primaryAction.actionId
      ? (actionPlanFromAnalysis(analysis, activeActions) as ActionQueueItem[]).find(
          (item) =>
            item.id === nowAction.primaryAction?.actionId ||
            item.action === nowAction.primaryAction?.actionId,
        ) ?? null
      : null;
  const delegationRunbook = buildDelegationRunbook({
    analysis,
    persistedActions: activeActions,
    validationRuns: activeValidationRuns,
    accounts: accountsBusy ? undefined : accounts,
    dailyRadarStatus,
    providerGate,
  });
  const operatorRhythm = buildOperatorRhythm({
    analysis,
    persistedActions: activeActions,
    validationRuns: activeValidationRuns,
    runs,
    dailyRadarStatus,
    providerGate,
  });

  useEffect(() => {
    const decision = decideSettingsReturnAutoRun({
      intent: requestedIntent,
      busy: busy || pipelineBusy || batchBacktestBusy || runsBusy,
      providerBlocked: providerGate.blockAutoRadar,
      providerReady: providerGate.stage === "ready",
      lastKey: settingsReturnAutoRunKeyRef.current,
    });
    if (!decision.shouldRun) return;
    settingsReturnAutoRunKeyRef.current = decision.key;
    void onDailyRadarScan();
  }, [
    batchBacktestBusy,
    busy,
    onDailyRadarScan,
    pipelineBusy,
    providerGate.blockAutoRadar,
    providerGate.stage,
    requestedIntent,
    runsBusy,
  ]);

  useEffect(() => {
    if (String(requestedIntent || "").toLowerCase() === "rerun_ai") return;
    if (!autoRadarPreferenceLoaded) return;
    if (providerGate.blockAutoRadar) return;
    if (runsBusy) return;
    const decision = decideAutoDailyRadar({
      enabled: autoRadarEnabled,
      busy: busy || pipelineBusy || batchBacktestBusy,
      providerReady: providerGate.stage === "ready",
      status: dailyRadarStatus,
      lastKey: autoRadarLastKeyRef.current,
    });
    if (!decision.shouldRun) return;
    autoRadarLastKeyRef.current = decision.key;
    try {
      window.localStorage.setItem(AUTO_DAILY_RADAR_LAST_KEY, decision.key);
    } catch {
      // localStorage can be unavailable in restricted browser contexts.
    }
    void onDailyRadarScan();
  }, [
    autoRadarEnabled,
    autoRadarPreferenceLoaded,
    batchBacktestBusy,
    busy,
    dailyRadarStatus,
    onDailyRadarScan,
    pipelineBusy,
    providerGate.blockAutoRadar,
    providerGate.stage,
    requestedIntent,
    runsBusy,
  ]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-6 items-start">
      <form onSubmit={onSubmit} className="space-y-4">
        <DailyRadarStatusCard
          status={dailyRadarStatus}
          busy={busy || pipelineBusy || batchBacktestBusy}
          autoEnabled={autoRadarEnabled}
          providerNotice={autoRadarProviderNotice}
          onAutoEnabledChange={setAutoRadarEnabled}
          onScan={onDailyRadarScan}
          onOpen={(run) => {
            void openRun(run);
          }}
        />
        <AIRunFollowupQueuePanel
          queue={runFollowupQueue}
          runs={runs}
          busy={busy || pipelineBusy || batchBacktestBusy || runsBusy}
          providerGate={providerGate}
          onScan={onDailyRadarScan}
          onRefreshRun={refreshRun}
          onValidateRun={validateRun}
          onOpen={(run) => {
            void openRun(run);
          }}
        />
        <AIRunRefreshComparisonPanel
          state={runRefreshComparison}
          runs={runs}
          busy={busy || pipelineBusy || batchBacktestBusy || runsBusy}
          onOpen={(run) => {
            void openRun(run);
          }}
        />
        <AISetupChecklistPanel
          state={setupChecklist}
          accountsBusy={accountsBusy}
          analysis={analysis}
          providerGate={providerGate}
          isWorking={busy || pipelineBusy || batchBacktestBusy}
          pipelineBusy={pipelineBusy}
          batchBacktestBusy={batchBacktestBusy}
          onScan={onDailyRadarScan}
          onRunAllBacktests={runAllBacktests}
        />
        <Section title="目标">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-2">
              {(AI_GOAL_TEMPLATES as AIGoalTemplate[]).map((template) => (
                <div
                  key={template.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2"
                >
                  <Button
                    type="button"
                    size="sm"
                    variant="flat"
                    className="justify-start truncate"
                    isDisabled={busy || pipelineBusy || batchBacktestBusy}
                    onPress={() => applyGoalTemplate(template)}
                  >
                    {template.label}
                  </Button>
                  {providerGate.blockManualAnalysis ? (
                    <ProviderSetupButton providerGate={providerGate} variant="flat" />
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      color="primary"
                      variant="flat"
                      isLoading={busy}
                      isDisabled={pipelineBusy || batchBacktestBusy}
                      onPress={() => {
                        void analyzeGoalTemplate(template);
                      }}
                    >
                      分析
                    </Button>
                  )}
                  {providerGate.blockManualAnalysis ? (
                    <ProviderSetupButton providerGate={providerGate} />
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      color="primary"
                      isLoading={pipelineBusy || batchBacktestBusy}
                      isDisabled={busy && !pipelineBusy}
                      onPress={() => {
                        void validateGoalTemplate(template);
                      }}
                    >
                      验证
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <AIGoalComposerPanel
              state={goalComposer}
              busy={busy || pipelineBusy || batchBacktestBusy}
              providerGate={providerGate}
              onApply={applyFormState}
              onAnalyzeAndValidate={async (next) => {
                applyFormState(next);
                await onAnalyzeAndValidate(next);
              }}
            />
            <FormField label="赚钱目标" required={formActions.goalRequired}>
              <Textarea
                aria-label="赚钱目标"
                minRows={6}
                value={goal}
                onValueChange={setGoal}
                isRequired={formActions.goalRequired}
              />
            </FormField>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="关注标的">
                <Input
                  aria-label="关注标的"
                  value={symbolsText}
                  onValueChange={setSymbolsText}
                />
              </FormField>
              <FormField label="周期">
                <Input
                  aria-label="周期"
                  value={horizon}
                  onValueChange={setHorizon}
                />
              </FormField>
              <FormField label="风险偏好">
                <Select
                  aria-label="风险偏好"
                  selectedKeys={[riskPreference]}
                  onSelectionChange={(keys) => {
                    const v = Array.from(keys)[0];
                    if (v) setRiskPreference(String(v));
                  }}
                >
                  {RISK_OPTIONS.map((o) => (
                    <SelectItem key={o.key}>{o.label}</SelectItem>
                  ))}
                </Select>
              </FormField>
              <FormField label="执行倾向">
                <Select
                  aria-label="执行倾向"
                  selectedKeys={[executionMode]}
                  onSelectionChange={(keys) => {
                    const v = Array.from(keys)[0];
                    if (v) setExecutionMode(String(v));
                  }}
                >
                  {MODE_OPTIONS.map((o) => (
                    <SelectItem key={o.key}>{o.label}</SelectItem>
                  ))}
                </Select>
              </FormField>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <FormField label="人性约束">
                <Textarea
                  aria-label="人性约束"
                  minRows={3}
                  value={behaviorText}
                  onValueChange={setBehaviorText}
                />
              </FormField>
              <FormField label="风向关注">
                <Textarea
                  aria-label="风向关注"
                  minRows={3}
                  value={narrativeText}
                  onValueChange={setNarrativeText}
                />
              </FormField>
              <FormField label="禁止场景">
                <Textarea
                  aria-label="禁止场景"
                  minRows={3}
                  value={avoidText}
                  onValueChange={setAvoidText}
                />
              </FormField>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              {providerGate.blockManualAnalysis ||
              providerBlocksAction(providerGate, formActions.primary.kind) ? (
                <ProviderSetupButton providerGate={providerGate} size="md" />
              ) : (
                <Button
                  type="submit"
                  color="primary"
                  isLoading={pipelineBusy || batchBacktestBusy}
                  isDisabled={busy && !pipelineBusy}
                >
                  {formActions.primary.label}
                </Button>
              )}
              {providerGate.blockManualAnalysis ||
              providerBlocksAction(providerGate, formActions.secondary.kind) ? (
                <ProviderSetupButton providerGate={providerGate} size="md" variant="flat" />
              ) : (
                <Button
                  type="button"
                  color="primary"
                  variant="flat"
                  isLoading={busy && !pipelineBusy}
                  isDisabled={pipelineBusy || batchBacktestBusy}
                  onPress={() => {
                    const next = executableFormState();
                    applyFormState(next);
                    if (redirectIfProviderBlocksAnalysis()) return;
                    const payload = aiGoalRequestFromFormState(next) as TypeAIGoalRequest;
                    void runGoalAnalysis(payload);
                  }}
                >
                  {formActions.secondary.label}
                </Button>
              )}
              {providerGate.blockAutoRadar ? (
                <ProviderSetupButton providerGate={providerGate} size="md" variant="flat" />
              ) : (
                <Button
                  type="button"
                  color="primary"
                  variant="flat"
                  isLoading={pipelineBusy || batchBacktestBusy}
                  isDisabled={busy && !pipelineBusy}
                  onPress={() => {
                    void onDailyRadarScan();
                  }}
                >
                  今日扫描并验证
                </Button>
              )}
            </div>
          </div>
        </Section>

        <Section title="快捷入口">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Link className="rounded border border-border-default px-3 py-2 hover:bg-bg-surface-2" href="/data-explorer/news">
              新闻舆情
            </Link>
            <Link className="rounded border border-border-default px-3 py-2 hover:bg-bg-surface-2" href="/data-explorer/macro">
              宏观数据
            </Link>
            <Link className="rounded border border-border-default px-3 py-2 hover:bg-bg-surface-2" href="/data-explorer/onchain">
              链上数据
            </Link>
            <Link className="rounded border border-border-default px-3 py-2 hover:bg-bg-surface-2" href="/settings/trading">
              交易闸门
            </Link>
          </div>
        </Section>

        <GoalRunsPanel
          runs={runs}
          activeId={activeRun?.id ?? analysis?.id}
          busy={runsBusy}
          error={runError}
          onRefresh={refreshRuns}
          onOpen={openRun}
        />
      </form>

      <div className="space-y-4 min-w-0">
        <ApiErrorView error={error} />
        {providerGate.visible ? (
          <AIProviderReadinessGate state={providerGate} />
        ) : null}
        {settingsReturnPrompt ? (
          <Callout variant="info" title={settingsReturnPrompt.title}>
            <div className="space-y-3">
              <p>{settingsReturnPrompt.summary}</p>
              <ul className="list-disc space-y-1 pl-5">
                {settingsReturnPrompt.nextActions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              {settingsReturnPrompt.primaryAction.kind === "open_link" &&
              settingsReturnPrompt.primaryHref ? (
                <Button
                  as={Link}
                  href={settingsReturnPrompt.primaryHref}
                  color="warning"
                  variant="flat"
                >
                  {settingsReturnPrompt.primaryAction.label}
                </Button>
              ) : (
                <Button
                  color="primary"
                  variant="flat"
                  isLoading={busy || pipelineBusy || batchBacktestBusy}
                  onPress={() => {
                    void onDailyRadarScan();
                  }}
                >
                  {settingsReturnPrompt.primaryAction.label}
                </Button>
              )}
            </div>
          </Callout>
        ) : null}
        <AIAutonomousCommandPanel
          state={autonomousCommand}
          analysis={analysis}
          candidate={capitalSizedCandidate}
          runs={runs}
          providerGate={providerGate}
          isWorking={busy || pipelineBusy || batchBacktestBusy || strategySaveBusyKey !== null}
          runsBusy={runsBusy}
          pipelineBusy={pipelineBusy}
          batchBacktestBusy={batchBacktestBusy}
          onAnalyzeAndValidate={onAnalyzeAndValidate}
          onScan={onDailyRadarScan}
          onRunAllBacktests={runAllBacktests}
          onAcceptPaperCandidate={acceptPaperCandidate}
          onSaveAndAcceptPaperCandidate={saveAndAcceptPaperCandidate}
          onRefreshRun={refreshRun}
          onValidateRun={validateRun}
          manualAction={nowActionManualItem}
          actionBusyKey={actionBusyKey}
          onUpdateAction={updateQueueAction}
        />
        <AIObservationFocusPanel
          state={observationFocus}
          analysis={analysis}
          providerGate={providerGate}
          isWorking={busy || pipelineBusy || batchBacktestBusy}
          pipelineBusy={pipelineBusy}
          batchBacktestBusy={batchBacktestBusy}
          onScan={onDailyRadarScan}
          onRunAllBacktests={runAllBacktests}
        />
        <AIPaperAdoptionPackagePanel
          state={paperAdoptionPackage}
          isWorking={busy || pipelineBusy || batchBacktestBusy}
          isSavingStrategy={strategySaveBusyKey !== null}
          onAcceptPaperCandidate={acceptPaperCandidate}
          onSaveAndAcceptPaperCandidate={saveAndAcceptPaperCandidate}
          onSaveStrategyDraft={saveStrategyDraft}
        />
        <AINowActionPanel
          state={nowAction}
          analysis={analysis}
          candidate={capitalSizedCandidate}
          runs={runs}
          providerGate={providerGate}
          isWorking={busy || pipelineBusy || batchBacktestBusy || strategySaveBusyKey !== null}
          runsBusy={runsBusy}
          pipelineBusy={pipelineBusy}
          batchBacktestBusy={batchBacktestBusy}
          onAnalyzeAndValidate={onAnalyzeAndValidate}
          onScan={onDailyRadarScan}
          onRunAllBacktests={runAllBacktests}
          onAcceptPaperCandidate={acceptPaperCandidate}
          onSaveAndAcceptPaperCandidate={saveAndAcceptPaperCandidate}
          onRefreshRun={refreshRun}
          onValidateRun={validateRun}
          manualAction={nowActionManualItem}
          actionBusyKey={actionBusyKey}
          onUpdateAction={updateQueueAction}
        />
        <AICommandCenterPanel
          state={commandCenter}
          analysis={analysis}
          candidate={capitalSizedCandidate}
          providerGate={providerGate}
          isWorking={busy || pipelineBusy || batchBacktestBusy || strategySaveBusyKey !== null}
          pipelineBusy={pipelineBusy}
          batchBacktestBusy={batchBacktestBusy}
          onAnalyzeAndValidate={onAnalyzeAndValidate}
          onScan={onDailyRadarScan}
          onRunAllBacktests={runAllBacktests}
          onAcceptPaperCandidate={acceptPaperCandidate}
          onSaveAndAcceptPaperCandidate={saveAndAcceptPaperCandidate}
        />
        <AIDelegationRunbookPanel
          state={delegationRunbook}
          analysis={analysis}
          candidate={capitalSizedCandidate}
          providerGate={providerGate}
          isWorking={busy || pipelineBusy || batchBacktestBusy}
          pipelineBusy={pipelineBusy}
          batchBacktestBusy={batchBacktestBusy}
          onScan={onDailyRadarScan}
          onRunAllBacktests={runAllBacktests}
          onAcceptPaperCandidate={acceptPaperCandidate}
        />
        <AIOperatorRhythmPanel
          state={operatorRhythm}
          analysis={analysis}
          candidate={capitalSizedCandidate}
          providerGate={providerGate}
          isWorking={busy || pipelineBusy || batchBacktestBusy || runsBusy}
          pipelineBusy={pipelineBusy}
          batchBacktestBusy={batchBacktestBusy}
          onScan={onDailyRadarScan}
          onRefreshRun={(run) => {
            void refreshRun(run);
          }}
          onRunAllBacktests={runAllBacktests}
          onAcceptPaperCandidate={acceptPaperCandidate}
        />
        <AIMoneyPathPanel
          state={moneyPath}
          analysis={analysis}
          candidate={capitalSizedCandidate}
          providerGate={providerGate}
          isWorking={busy || pipelineBusy || batchBacktestBusy}
          pipelineBusy={pipelineBusy}
          batchBacktestBusy={batchBacktestBusy}
          onScan={onDailyRadarScan}
          onRunAllBacktests={runAllBacktests}
          onAcceptPaperCandidate={acceptPaperCandidate}
        />
        <AIMoneyBriefPanel
          state={moneyBrief}
          dailyRadarStatus={dailyRadarStatus}
          analysis={analysis}
          candidate={capitalSizedCandidate}
          providerGate={providerGate}
          isWorking={busy || pipelineBusy || batchBacktestBusy}
          pipelineBusy={pipelineBusy}
          batchBacktestBusy={batchBacktestBusy}
          onScan={onDailyRadarScan}
          onOpenRun={(run) => {
            void openRun(run);
          }}
          onRunAllBacktests={runAllBacktests}
          onAcceptPaperCandidate={acceptPaperCandidate}
        />
        <OpportunityRadar
          radar={radar}
          analysis={analysis}
          candidate={capitalSizedCandidate}
          providerGate={providerGate}
          busy={busy}
          pipelineBusy={pipelineBusy}
          batchBacktestBusy={batchBacktestBusy}
          onAnalyzeAndValidate={onDailyRadarScan}
          onRunAllBacktests={runAllBacktests}
          onAcceptPaperCandidate={acceptPaperCandidate}
        />
        <AIDailyMissionPanel
          mission={dailyMission}
          analysis={analysis}
          candidate={capitalSizedCandidate}
          runs={runs}
          providerGate={providerGate}
          isWorking={busy || pipelineBusy || batchBacktestBusy || strategySaveBusyKey !== null}
          runsBusy={runsBusy}
          pipelineBusy={pipelineBusy}
          batchBacktestBusy={batchBacktestBusy}
          actionBusyKey={actionBusyKey}
          manualAction={nowActionManualItem}
          onAnalyzeAndValidate={onAnalyzeAndValidate}
          onScan={onDailyRadarScan}
          onRefreshRun={refreshRun}
          onValidateRun={validateRun}
          onRunAllBacktests={runAllBacktests}
          onAcceptPaperCandidate={acceptPaperCandidate}
          onSaveAndAcceptPaperCandidate={saveAndAcceptPaperCandidate}
          onUpdateAction={updateQueueAction}
        />
        <AIMarketWatchtowerPanel
          state={marketWatchtower}
          analysis={analysis}
          candidate={capitalSizedCandidate}
          providerGate={providerGate}
          isWorking={busy || pipelineBusy || batchBacktestBusy}
          pipelineBusy={pipelineBusy}
          batchBacktestBusy={batchBacktestBusy}
          onScan={onDailyRadarScan}
          onRunAllBacktests={runAllBacktests}
          onAcceptPaperCandidate={acceptPaperCandidate}
        />
        <AIMarketMemoryPanel state={marketMemory} />
        <AISentimentCompassPanel state={sentimentCompass} />
        <AIThesisInvalidationPanel
          state={thesisInvalidation}
          analysis={analysis}
          providerGate={providerGate}
          isWorking={busy || pipelineBusy || batchBacktestBusy}
          pipelineBusy={pipelineBusy}
          batchBacktestBusy={batchBacktestBusy}
          onScan={onDailyRadarScan}
          onRunAllBacktests={runAllBacktests}
        />
        <AICapitalPlanPanel
          state={capitalPlan}
          analysis={analysis}
          candidate={capitalSizedCandidate}
          isWorking={busy || pipelineBusy || batchBacktestBusy}
          batchBacktestBusy={batchBacktestBusy}
          onRunAllBacktests={runAllBacktests}
          onAcceptPaperCandidate={acceptPaperCandidate}
        />
        <AIPaperReviewCoachPanel
          state={paperReviewCoach}
          candidate={capitalSizedCandidate}
          isWorking={busy || pipelineBusy || batchBacktestBusy || strategySaveBusyKey !== null}
          onAcceptPaperCandidate={acceptPaperCandidate}
          onSaveAndAcceptPaperCandidate={saveAndAcceptPaperCandidate}
        />
        <AIExecutionReadinessPanel
          state={executionReadiness}
          accountsBusy={accountsBusy}
          accountsError={accountsError}
          analysis={analysis}
          candidate={capitalSizedCandidate}
          providerGate={providerGate}
          isWorking={busy || pipelineBusy || batchBacktestBusy}
          pipelineBusy={pipelineBusy}
          batchBacktestBusy={batchBacktestBusy}
          onScan={onDailyRadarScan}
          onRunAllBacktests={runAllBacktests}
          onAcceptPaperCandidate={acceptPaperCandidate}
        />
        <AIExecutionPreviewPanel
          state={executionPreview}
          analysis={analysis}
          candidate={capitalSizedCandidate}
          providerGate={providerGate}
          isWorking={busy || pipelineBusy || batchBacktestBusy}
          pipelineBusy={pipelineBusy}
          batchBacktestBusy={batchBacktestBusy}
          onScan={onDailyRadarScan}
          onRunAllBacktests={runAllBacktests}
          onAcceptPaperCandidate={acceptPaperCandidate}
        />
        <AIAutopilotPanel
          state={autopilot}
          analysis={analysis}
          candidate={capitalSizedCandidate}
          providerGate={providerGate}
          isWorking={busy || pipelineBusy || batchBacktestBusy}
          pipelineBusy={pipelineBusy}
          batchBacktestBusy={batchBacktestBusy}
          onScan={onDailyRadarScan}
          onRunAllBacktests={runAllBacktests}
          onAcceptPaperCandidate={acceptPaperCandidate}
        />
        <AIDecisionJournalPanel items={decisionJournal} />
        {analysis ? (
          <AnalysisResult
            analysis={analysis}
            persistedActions={activeActions}
            validationRuns={activeValidationRuns}
            validationBusy={validationRunKey !== "" && validationBusy}
            validationError={validationRunKey !== "" ? validationError : null}
            backtestBusyKey={backtestBusyKey}
            batchBacktestBusy={batchBacktestBusy}
            actionBusyKey={actionBusyKey}
            strategySaveBusyKey={strategySaveBusyKey}
            onRunBacktest={runBacktestDraft}
            onRunAllBacktests={runAllBacktests}
            onAcceptPaperCandidate={acceptPaperCandidate}
            onSaveStrategyDraft={saveStrategyDraft}
            onUpdateAction={updateQueueAction}
          />
        ) : (
          <EmptyResult />
        )}
      </div>
    </div>
  );
}

function AISetupChecklistPanel({
  state,
  accountsBusy,
  analysis,
  providerGate,
  isWorking,
  pipelineBusy,
  batchBacktestBusy,
  onScan,
  onRunAllBacktests,
}: {
  state: AISetupChecklistState;
  accountsBusy: boolean;
  analysis: TypeAIGoalAnalysis | null;
  providerGate?: AIProviderReadinessGateState | null;
  isWorking: boolean;
  pipelineBusy: boolean;
  batchBacktestBusy: boolean;
  onScan: (next?: AIGoalFormState) => void;
  onRunAllBacktests: (analysis: TypeAIGoalAnalysis) => void;
}) {
  const score = Math.max(0, Math.min(100, Number(state.score || 0)));
  const primary = state.primaryAction;
  const primaryButton =
    providerBlocksAction(providerGate, primary?.kind) ? (
      <ProviderSetupButton providerGate={providerGate} />
    ) : primary?.kind === "scan_today" || primary?.kind === "rescan_today" ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={pipelineBusy || batchBacktestBusy}
        isDisabled={isWorking && !pipelineBusy && !batchBacktestBusy}
        onPress={() => {
          void onScan();
        }}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "run_all_backtests" && analysis ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={batchBacktestBusy}
        isDisabled={isWorking && !batchBacktestBusy}
        onPress={() => onRunAllBacktests(analysis)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "open_link" && state.primaryHref ? (
      <Link
        href={state.primaryHref}
        className="rounded bg-brand-primary px-3 py-2 text-xs text-white hover:opacity-90"
      >
        {primary.label}
      </Link>
    ) : null;

  return (
    <Section
      title="AI 使用前检查"
      action={<StatusBadge tone={state.tone}>{state.stage}</StatusBadge>}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="text-sm font-semibold text-text-primary">
              {state.title}
            </div>
            <p className="text-sm text-text-secondary">{state.summary}</p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <div className="rounded border border-border-default px-3 py-2 text-xs">
              <div className="text-text-tertiary">
                {accountsBusy ? "账户读取中" : "准备度"}
              </div>
              <div className="font-medium text-text-primary">{score}%</div>
            </div>
            {primaryButton}
          </div>
        </div>
        <div className="h-2 overflow-hidden rounded bg-bg-surface-2">
          <div
            className="h-full rounded bg-brand-primary transition-all"
            style={{ width: `${score}%` }}
          />
        </div>
        <div className="space-y-2">
          {state.items.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded border border-border-default px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-text-primary">
                    {item.label}
                  </span>
                  <StatusBadge tone={item.tone}>{item.status}</StatusBadge>
                </div>
                <p className="mt-1 text-text-secondary">{item.detail}</p>
              </div>
              {item.href ? (
                <Link
                  href={item.href}
                  className="self-center rounded border border-border-default px-2 py-1 text-xs hover:bg-bg-surface-2"
                >
                  打开
                </Link>
              ) : null}
            </div>
          ))}
        </div>
        <PlanList title="下一步" rows={state.nextActions} />
      </div>
    </Section>
  );
}

function AIGoalComposerPanel({
  state,
  busy,
  providerGate,
  onApply,
  onAnalyzeAndValidate,
}: {
  state: AIGoalComposerState;
  busy: boolean;
  providerGate?: AIProviderReadinessGateState | null;
  onApply: (next: AIGoalFormState) => void;
  onAnalyzeAndValidate: (next: AIGoalFormState) => void;
}) {
  const primary = state.primaryAction;
  const primaryButton =
    providerBlocksAction(providerGate, primary.kind) ? (
      <ProviderSetupButton providerGate={providerGate} />
    ) : primary.kind === "apply_suggestion" ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        variant="flat"
        isDisabled={busy}
        onPress={() => onApply(state.proposedFormState)}
      >
        {primary.label}
      </Button>
    ) : (
      <Button
        type="button"
        size="sm"
        color="primary"
        isDisabled={busy}
        onPress={() => onAnalyzeAndValidate(state.proposedFormState)}
      >
        {primary.label}
      </Button>
    );

  return (
    <div className="rounded border border-border-default bg-bg-surface-2 px-3 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-text-primary">
              AI 目标补全
            </span>
            <StatusBadge tone={state.tone}>{state.stage}</StatusBadge>
          </div>
          <div className="text-sm font-medium text-text-primary">
            {state.title}
          </div>
          <p className="text-xs text-text-secondary">{state.summary}</p>
        </div>
        <div className="shrink-0">{primaryButton}</div>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 text-xs">
        <div className="rounded border border-border-default bg-bg-surface px-3 py-2">
          <div className="font-medium text-text-tertiary">补全后的目标</div>
          <p className="mt-1 text-text-secondary">{state.proposedFormState.goal}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Stat
            label="标的"
            value={state.proposedFormState.symbolsText || "auto"}
            hint="用于 AI 分析"
            className="p-2"
          />
          <Stat
            label="周期"
            value={state.proposedFormState.horizon || "auto"}
            hint={state.proposedFormState.riskPreference}
            className="p-2"
          />
          <Stat
            label="执行"
            value={state.proposedFormState.executionMode}
            hint="只允许 observe/paper"
            className="p-2"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <PlanList title="已检查" rows={state.checks} />
          <PlanList title="AI 补齐/限制" rows={state.missing} />
        </div>
      </div>
    </div>
  );
}

function AIAutonomousCommandPanel({
  state,
  analysis,
  candidate,
  runs,
  providerGate,
  isWorking,
  runsBusy,
  pipelineBusy,
  batchBacktestBusy,
  onAnalyzeAndValidate,
  onScan,
  onRunAllBacktests,
  onAcceptPaperCandidate,
  onSaveAndAcceptPaperCandidate,
  onRefreshRun,
  onValidateRun,
  manualAction,
  actionBusyKey,
  onUpdateAction,
}: {
  state: AIAutonomousCommandState;
  analysis: TypeAIGoalAnalysis | null;
  candidate: PaperCandidate | null;
  runs: TypeAIGoalRun[];
  providerGate?: AIProviderReadinessGateState | null;
  isWorking: boolean;
  runsBusy: boolean;
  pipelineBusy: boolean;
  batchBacktestBusy: boolean;
  onAnalyzeAndValidate: (next?: AIGoalFormState) => void;
  onScan: (next?: AIGoalFormState) => void;
  onRunAllBacktests: (analysis: TypeAIGoalAnalysis) => void;
  onAcceptPaperCandidate: (candidate: PaperCandidate) => void;
  onSaveAndAcceptPaperCandidate: (candidate: PaperCandidate) => void;
  onRefreshRun: (run: Pick<TypeAIGoalRun, "id">) => void;
  onValidateRun: (run: Pick<TypeAIGoalRun, "id">) => void;
  manualAction?: ActionQueueItem | null;
  actionBusyKey?: string | null;
  onUpdateAction?: (item: ActionQueueItem) => void;
}) {
  const primary = state.primaryAction;
  const primaryRun =
    primary?.runId
      ? runs.find((run) => run.id === primary.runId) ?? { id: primary.runId }
      : null;
  const primaryButton =
    providerBlocksAction(providerGate, primary?.kind) ? (
      <ProviderSetupButton providerGate={providerGate} size="md" />
    ) : primary?.kind === "analyze_and_validate" ? (
      <Button
        type="button"
        size="md"
        color="primary"
        isLoading={pipelineBusy || batchBacktestBusy}
        isDisabled={isWorking && !pipelineBusy && !batchBacktestBusy}
        onPress={() => {
          void onAnalyzeAndValidate(state.scanFormState ?? state.proposedFormState);
        }}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "scan_today" || primary?.kind === "rescan_today" ? (
      <Button
        type="button"
        size="md"
        color="primary"
        isLoading={pipelineBusy || batchBacktestBusy}
        isDisabled={isWorking && !pipelineBusy && !batchBacktestBusy}
        onPress={() => {
          void onScan(state.scanFormState ?? state.proposedFormState);
        }}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "run_all_backtests" && analysis ? (
      <Button
        type="button"
        size="md"
        color="primary"
        isLoading={batchBacktestBusy}
        isDisabled={isWorking && !batchBacktestBusy}
        onPress={() => onRunAllBacktests(analysis)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "accept_paper_candidate" && candidate ? (
      <Button
        type="button"
        size="md"
        color="primary"
        isDisabled={isWorking}
        onPress={() => onAcceptPaperCandidate(candidate)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "save_and_accept_paper_candidate" && candidate ? (
      <Button
        type="button"
        size="md"
        color="primary"
        isDisabled={isWorking}
        onPress={() => onSaveAndAcceptPaperCandidate(candidate)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "validate_run" && primaryRun ? (
      <Button
        type="button"
        size="md"
        color="primary"
        isLoading={runsBusy || batchBacktestBusy}
        isDisabled={isWorking && !runsBusy && !batchBacktestBusy}
        onPress={() => onValidateRun(primaryRun)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "refresh_run" && primaryRun ? (
      <Button
        type="button"
        size="md"
        color="primary"
        isLoading={runsBusy || pipelineBusy || batchBacktestBusy}
        isDisabled={isWorking && !runsBusy && !pipelineBusy && !batchBacktestBusy}
        onPress={() => onRefreshRun(primaryRun)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "complete_manual_action" && manualAction && onUpdateAction ? (
      <Button
        type="button"
        size="md"
        color="primary"
        isLoading={actionBusyKey === manualAction.id}
        isDisabled={isWorking && actionBusyKey !== manualAction.id}
        onPress={() => onUpdateAction(manualAction)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "open_link" && state.primaryHref ? (
      <Link
        href={state.primaryHref}
        className="rounded bg-brand-primary px-4 py-2 text-sm text-white hover:opacity-90"
      >
        {primary.label}
      </Link>
    ) : null;

  return (
    <Section
      title="AI 自主命令"
      action={<StatusBadge tone={state.tone}>{state.stage}</StatusBadge>}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={state.owner === "AI" ? "primary" : "warning"}>
                {state.owner}
              </StatusBadge>
              <span className="text-base font-semibold text-text-primary">
                {state.title}
              </span>
            </div>
            <p className="text-sm text-text-secondary">{state.summary}</p>
            <p className="text-xs text-text-tertiary">{state.safety}</p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
            <Stat
              label="托管进度"
              value={state.confidenceLabel}
              hint="基于当前 AI 路径"
              className="min-w-28 p-3"
            />
            {primaryButton}
          </div>
        </div>
        {state.proposalCard ? (
          <div className="space-y-3 border-y border-border-default py-3">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-text-primary">
                {state.proposalCard.title}
              </div>
              <p className="text-sm text-text-secondary">
                {state.proposalCard.goal}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {state.proposalCard.stats.map((item) => (
                <Stat
                  key={item.label}
                  label={item.label}
                  value={item.value}
                  hint={item.hint}
                  className="p-2"
                />
              ))}
            </div>
            <PlanList title="AI 会先检查" rows={state.proposalCard.checks} />
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <PlanList title="为什么现在做" rows={state.why} />
          <PlanList title="AI 将处理" rows={state.aiWillDo} />
          <PlanList title="你只确认" rows={state.humanMustDo} />
        </div>
      </div>
    </Section>
  );
}

function AIObservationFocusPanel({
  state,
  analysis,
  providerGate,
  isWorking,
  pipelineBusy,
  batchBacktestBusy,
  onScan,
  onRunAllBacktests,
}: {
  state: AIObservationFocusState;
  analysis: TypeAIGoalAnalysis | null;
  providerGate?: AIProviderReadinessGateState | null;
  isWorking: boolean;
  pipelineBusy: boolean;
  batchBacktestBusy: boolean;
  onScan: () => void;
  onRunAllBacktests: (analysis: TypeAIGoalAnalysis) => void;
}) {
  const primary = state.primaryAction;
  const primaryHref = state.primaryHref || primary?.href;
  const primaryButton =
    providerBlocksAction(providerGate, primary?.kind) ? (
      <ProviderSetupButton providerGate={providerGate} />
    ) : primary?.kind === "scan_today" || primary?.kind === "rescan_today" ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={pipelineBusy || batchBacktestBusy}
        isDisabled={isWorking && !pipelineBusy && !batchBacktestBusy}
        onPress={() => {
          void onScan();
        }}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "run_all_backtests" && analysis ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={batchBacktestBusy}
        isDisabled={isWorking && !batchBacktestBusy}
        onPress={() => onRunAllBacktests(analysis)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "open_link" && primaryHref ? (
      <Link
        href={primaryHref}
        className="rounded bg-brand-primary px-3 py-2 text-xs text-white hover:opacity-90"
      >
        {primary.label}
      </Link>
    ) : null;

  return (
    <Section
      title="AI 观察焦点"
      action={<StatusBadge tone={state.tone}>{state.stage}</StatusBadge>}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="text-sm font-semibold text-text-primary">
              {state.title}
            </div>
            <p className="text-sm text-text-secondary">{state.summary}</p>
          </div>
          <div className="shrink-0">{primaryButton}</div>
        </div>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-4">
          {state.items.map((item) => (
            <div
              key={item.id}
              className="rounded border border-border-default bg-bg-surface px-3 py-3 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-text-primary">{item.label}</span>
                <StatusBadge tone={item.tone}>{item.status}</StatusBadge>
              </div>
              <p className="mt-2 text-xs text-text-secondary">{item.detail}</p>
              {item.href ? (
                <Link
                  href={item.href}
                  className="mt-3 inline-flex rounded border border-border-default px-2 py-1 text-xs hover:bg-bg-surface-2"
                >
                  打开
                </Link>
              ) : null}
            </div>
          ))}
        </div>
        <PlanList title="AI 建议你现在看" rows={state.nextActions} />
      </div>
    </Section>
  );
}

function AIPaperAdoptionPackagePanel({
  state,
  isWorking,
  isSavingStrategy,
  onAcceptPaperCandidate,
  onSaveAndAcceptPaperCandidate,
  onSaveStrategyDraft,
}: {
  state: AIPaperAdoptionPackageState | null;
  isWorking: boolean;
  isSavingStrategy: boolean;
  onAcceptPaperCandidate: (candidate: PaperCandidate) => void;
  onSaveAndAcceptPaperCandidate: (candidate: PaperCandidate) => void;
  onSaveStrategyDraft: (draft: TypeAIGoalStrategyDraft) => void;
}) {
  if (!state) return null;
  const strategySaved = state.stage === "strategy_saved";
  const shouldSaveAndAccept =
    state.primaryAction.kind === "save_and_accept_paper_candidate";

  return (
    <Section
      title="AI paper 采用包"
      action={<StatusBadge tone={state.tone}>{state.stage}</StatusBadge>}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="text-sm font-semibold text-text-primary">
              {state.title}
            </div>
            <p className="text-sm text-text-secondary">{state.summary}</p>
            <p className="text-xs text-text-tertiary">{state.riskSummary}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              color="primary"
              variant="flat"
              isLoading={isSavingStrategy}
              isDisabled={isWorking || isSavingStrategy || strategySaved}
              onPress={() => onSaveStrategyDraft(state.candidate.draft)}
            >
              {state.secondaryAction.label}
            </Button>
            <Button
              type="button"
              size="sm"
              color="primary"
              isLoading={shouldSaveAndAccept && isSavingStrategy}
              isDisabled={isWorking || isSavingStrategy}
              onPress={() => {
                if (shouldSaveAndAccept) {
                  onSaveAndAcceptPaperCandidate(state.candidate);
                } else {
                  onAcceptPaperCandidate(state.candidate);
                }
              }}
            >
              {state.primaryAction.label}
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
          {state.steps.map((step) => (
            <div
              key={step.id}
              className="rounded border border-border-default bg-bg-surface px-3 py-3 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-text-primary">{step.label}</span>
                <StatusBadge tone={step.status === "done" ? "success" : "warning"}>
                  {step.status}
                </StatusBadge>
              </div>
              <p className="mt-2 text-xs text-text-secondary">{step.detail}</p>
              {step.href ? (
                <Link
                  href={step.href}
                  className="mt-3 inline-flex rounded border border-border-default px-2 py-1 text-xs hover:bg-bg-surface-2"
                >
                  打开
                </Link>
              ) : null}
            </div>
          ))}
        </div>
        <PlanList title="采用边界" rows={state.guardrails} />
      </div>
    </Section>
  );
}

function AINowActionPanel({
  state,
  analysis,
  candidate,
  runs,
  providerGate,
  isWorking,
  runsBusy,
  pipelineBusy,
  batchBacktestBusy,
  onAnalyzeAndValidate,
  onScan,
  onRunAllBacktests,
  onAcceptPaperCandidate,
  onSaveAndAcceptPaperCandidate,
  onRefreshRun,
  onValidateRun,
  manualAction,
  actionBusyKey,
  onUpdateAction,
}: {
  state: AINowActionState;
  analysis: TypeAIGoalAnalysis | null;
  candidate: PaperCandidate | null;
  runs: TypeAIGoalRun[];
  providerGate?: AIProviderReadinessGateState | null;
  isWorking: boolean;
  runsBusy: boolean;
  pipelineBusy: boolean;
  batchBacktestBusy: boolean;
  onAnalyzeAndValidate: (next?: AIGoalFormState) => void;
  onScan: (next?: AIGoalFormState) => void;
  onRunAllBacktests: (analysis: TypeAIGoalAnalysis) => void;
  onAcceptPaperCandidate: (candidate: PaperCandidate) => void;
  onSaveAndAcceptPaperCandidate: (candidate: PaperCandidate) => void;
  onRefreshRun: (run: Pick<TypeAIGoalRun, "id">) => void;
  onValidateRun: (run: Pick<TypeAIGoalRun, "id">) => void;
  manualAction?: ActionQueueItem | null;
  actionBusyKey?: string | null;
  onUpdateAction?: (item: ActionQueueItem) => void;
}) {
  const primary = state.primaryAction;
  const primaryRun =
    primary?.runId
      ? runs.find((run) => run.id === primary.runId) ?? { id: primary.runId }
      : null;
  const primaryButton =
    providerBlocksAction(providerGate, primary?.kind) ? (
      <ProviderSetupButton providerGate={providerGate} size="md" />
    ) : primary?.kind === "analyze_and_validate" ? (
      <Button
        type="button"
        size="md"
        color="primary"
        isLoading={pipelineBusy || batchBacktestBusy}
        isDisabled={isWorking && !pipelineBusy && !batchBacktestBusy}
        onPress={() => {
          void onAnalyzeAndValidate(state.scanFormState ?? state.proposedFormState);
        }}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "scan_today" || primary?.kind === "rescan_today" ? (
      <Button
        type="button"
        size="md"
        color="primary"
        isLoading={pipelineBusy || batchBacktestBusy}
        isDisabled={isWorking && !pipelineBusy && !batchBacktestBusy}
        onPress={() => {
          void onScan(state.scanFormState ?? state.proposedFormState);
        }}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "run_all_backtests" && analysis ? (
      <Button
        type="button"
        size="md"
        color="primary"
        isLoading={batchBacktestBusy}
        isDisabled={isWorking && !batchBacktestBusy}
        onPress={() => onRunAllBacktests(analysis)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "accept_paper_candidate" && candidate ? (
      <Button
        type="button"
        size="md"
        color="primary"
        isDisabled={isWorking}
        onPress={() => onAcceptPaperCandidate(candidate)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "save_and_accept_paper_candidate" && candidate ? (
      <Button
        type="button"
        size="md"
        color="primary"
        isDisabled={isWorking}
        onPress={() => onSaveAndAcceptPaperCandidate(candidate)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "validate_run" && primaryRun ? (
      <Button
        type="button"
        size="md"
        color="primary"
        isLoading={runsBusy || batchBacktestBusy}
        isDisabled={isWorking && !runsBusy && !batchBacktestBusy}
        onPress={() => onValidateRun(primaryRun)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "refresh_run" && primaryRun ? (
      <Button
        type="button"
        size="md"
        color="primary"
        isLoading={runsBusy || pipelineBusy || batchBacktestBusy}
        isDisabled={isWorking && !runsBusy && !pipelineBusy && !batchBacktestBusy}
        onPress={() => onRefreshRun(primaryRun)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "complete_manual_action" && manualAction && onUpdateAction ? (
      <Button
        type="button"
        size="md"
        color="primary"
        isLoading={actionBusyKey === manualAction.id}
        isDisabled={isWorking && actionBusyKey !== manualAction.id}
        onPress={() => onUpdateAction(manualAction)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "open_link" && state.primaryHref ? (
      <Link
        href={state.primaryHref}
        className="rounded bg-brand-primary px-4 py-2 text-sm text-white hover:opacity-90"
      >
        {primary.label}
      </Link>
    ) : null;

  return (
    <Section
      title="AI 当前任务"
      action={<StatusBadge tone={state.tone}>{state.stage}</StatusBadge>}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={state.owner === "AI" ? "primary" : "warning"}>
                {state.owner}
              </StatusBadge>
              <div className="text-lg font-semibold text-text-primary">
                {state.title}
              </div>
            </div>
            <p className="text-sm text-text-secondary">{state.summary}</p>
            <p className="rounded border border-border-default bg-bg-surface-2 px-3 py-2 text-xs text-text-secondary">
              {state.guardrail}
            </p>
          </div>
          <div className="shrink-0">{primaryButton}</div>
        </div>
        {state.proposalCard ? (
          <div className="space-y-3 border-y border-border-default py-3">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-text-primary">
                {state.proposalCard.title}
              </div>
              <p className="text-sm text-text-secondary">
                {state.proposalCard.goal}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {state.proposalCard.stats.map((item) => (
                <Stat
                  key={item.label}
                  label={item.label}
                  value={item.value}
                  hint={item.hint}
                  className="p-2"
                />
              ))}
            </div>
            <PlanList title="AI 会先检查" rows={state.proposalCard.checks} />
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <PlanList title="为什么现在做它" rows={state.why} />
          <PlanList title="交接方式" rows={[state.handoff, ...state.nextActions].filter(Boolean)} />
        </div>
      </div>
    </Section>
  );
}

function AICommandCenterPanel({
  state,
  analysis,
  candidate,
  providerGate,
  isWorking,
  pipelineBusy,
  batchBacktestBusy,
  onAnalyzeAndValidate,
  onScan,
  onRunAllBacktests,
  onAcceptPaperCandidate,
  onSaveAndAcceptPaperCandidate,
}: {
  state: AICommandCenterState;
  analysis: TypeAIGoalAnalysis | null;
  candidate: PaperCandidate | null;
  providerGate?: AIProviderReadinessGateState | null;
  isWorking: boolean;
  pipelineBusy: boolean;
  batchBacktestBusy: boolean;
  onAnalyzeAndValidate: () => void;
  onScan: () => void;
  onRunAllBacktests: (analysis: TypeAIGoalAnalysis) => void;
  onAcceptPaperCandidate: (candidate: PaperCandidate) => void;
  onSaveAndAcceptPaperCandidate: (candidate: PaperCandidate) => void;
}) {
  const primary = state.primaryAction;
  const primaryButton =
    providerBlocksAction(providerGate, primary?.kind) ? (
      <ProviderSetupButton providerGate={providerGate} />
    ) : primary?.kind === "analyze_and_validate" ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={pipelineBusy || batchBacktestBusy}
        isDisabled={isWorking && !pipelineBusy && !batchBacktestBusy}
        onPress={() => {
          void onAnalyzeAndValidate();
        }}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "scan_today" || primary?.kind === "rescan_today" ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={pipelineBusy || batchBacktestBusy}
        isDisabled={isWorking && !pipelineBusy && !batchBacktestBusy}
        onPress={() => {
          void onScan();
        }}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "run_all_backtests" && analysis ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={batchBacktestBusy}
        isDisabled={isWorking && !batchBacktestBusy}
        onPress={() => onRunAllBacktests(analysis)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "accept_paper_candidate" && candidate ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isDisabled={isWorking}
        onPress={() => onAcceptPaperCandidate(candidate)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "save_and_accept_paper_candidate" && candidate ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isDisabled={isWorking}
        onPress={() => onSaveAndAcceptPaperCandidate(candidate)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "open_link" && state.primaryHref ? (
      <Link
        href={state.primaryHref}
        className="rounded bg-brand-primary px-3 py-2 text-xs text-white hover:opacity-90"
      >
        {primary.label}
      </Link>
    ) : null;

  return (
    <Section
      title="AI 执行指挥台"
      action={<StatusBadge tone={state.tone}>{state.stage}</StatusBadge>}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="text-base font-semibold text-text-primary">
              {state.title}
            </div>
            <p className="text-sm text-text-secondary">{state.summary}</p>
          </div>
          <div className="shrink-0">{primaryButton}</div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2">
          {state.metrics.map((metric) => (
            <Stat
              key={metric.label}
              label={metric.label}
              value={metric.value}
              hint={metric.hint}
              className="p-3"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          {state.evidence.map((item) => (
            <div
              key={item.id}
              className="rounded border border-border-default px-3 py-2 text-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-text-primary">
                      {item.label}
                    </span>
                    <StatusBadge tone={item.tone}>{item.status}</StatusBadge>
                  </div>
                  <p className="mt-1 text-xs text-text-secondary">{item.detail}</p>
                </div>
                {item.href ? (
                  <Link
                    href={item.href}
                    className="shrink-0 rounded border border-border-default px-2 py-1 text-xs hover:bg-bg-surface-2"
                  >
                    打开
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <PlanList title="AI 下一步" rows={state.nextActions} />
      </div>
    </Section>
  );
}

function AIDelegationRunbookPanel({
  state,
  analysis,
  candidate,
  providerGate,
  isWorking,
  pipelineBusy,
  batchBacktestBusy,
  onScan,
  onRunAllBacktests,
  onAcceptPaperCandidate,
}: {
  state: AIDelegationRunbookState;
  analysis: TypeAIGoalAnalysis | null;
  candidate: PaperCandidate | null;
  providerGate?: AIProviderReadinessGateState | null;
  isWorking: boolean;
  pipelineBusy: boolean;
  batchBacktestBusy: boolean;
  onScan: () => void;
  onRunAllBacktests: (analysis: TypeAIGoalAnalysis) => void;
  onAcceptPaperCandidate: (candidate: PaperCandidate) => void;
}) {
  const primary = state.primaryAction;
  const safeHref =
    primary?.href && primary.href.startsWith("/") && !primary.href.startsWith("//")
      ? primary.href
      : undefined;
  const primaryButton =
    providerBlocksAction(providerGate, primary?.kind) ? (
      <ProviderSetupButton providerGate={providerGate} />
    ) : primary?.kind === "scan_today" ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={pipelineBusy || batchBacktestBusy}
        isDisabled={isWorking && !pipelineBusy && !batchBacktestBusy}
        onPress={() => {
          void onScan();
        }}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "run_all_backtests" && analysis ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={batchBacktestBusy}
        isDisabled={isWorking && !batchBacktestBusy}
        onPress={() => onRunAllBacktests(analysis)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "accept_paper_candidate" && candidate ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isDisabled={isWorking}
        onPress={() => onAcceptPaperCandidate(candidate)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "open_link" && safeHref ? (
      <Link
        href={safeHref}
        className="rounded bg-brand-primary px-3 py-2 text-xs text-white hover:opacity-90"
      >
        {primary.label}
      </Link>
    ) : null;

  const renderSteps = (title: string, steps: AIDelegationRunbookStep[]) => (
    <div className="space-y-2">
      <div className="text-sm font-medium text-text-primary">{title}</div>
      <div className="space-y-2">
        {steps.map((step) => (
          <div
            key={`${step.owner}-${step.title}-${step.status}`}
            className="rounded border border-border-default px-3 py-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={step.owner === "AI" ? "primary" : "warning"}>
                {step.owner === "AI" ? "AI" : "你"}
              </StatusBadge>
              <span className="text-sm font-medium text-text-primary">
                {step.title}
              </span>
              <span className="rounded bg-bg-surface-2 px-2 py-0.5 text-[11px] text-text-tertiary">
                {step.status}
              </span>
            </div>
            <p className="mt-1 text-xs text-text-secondary">{step.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <Section
      title="AI 授权执行单"
      action={<StatusBadge tone={state.tone}>{state.stage}</StatusBadge>}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="text-base font-semibold text-text-primary">
              {state.title}
            </div>
            <p className="text-sm text-text-secondary">{state.decision}</p>
          </div>
          <div className="shrink-0">{primaryButton}</div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
          {state.metrics.map((metric) => (
            <Stat
              key={metric.label}
              label={metric.label}
              value={metric.value}
              hint={metric.hint}
              className="p-3"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {renderSteps("AI 可代办", state.aiSteps)}
          {renderSteps("需要你确认", state.humanSteps)}
        </div>
        <PlanList title="不可越过的边界" rows={state.guardrails} />
      </div>
    </Section>
  );
}

function AIOperatorRhythmPanel({
  state,
  analysis,
  candidate,
  providerGate,
  isWorking,
  pipelineBusy,
  batchBacktestBusy,
  onScan,
  onRefreshRun,
  onRunAllBacktests,
  onAcceptPaperCandidate,
}: {
  state: AIOperatorRhythmState;
  analysis: TypeAIGoalAnalysis | null;
  candidate: PaperCandidate | null;
  providerGate?: AIProviderReadinessGateState | null;
  isWorking: boolean;
  pipelineBusy: boolean;
  batchBacktestBusy: boolean;
  onScan: () => void;
  onRefreshRun: (run: Pick<TypeAIGoalRun, "id">) => void;
  onRunAllBacktests: (analysis: TypeAIGoalAnalysis) => void;
  onAcceptPaperCandidate: (candidate: PaperCandidate) => void;
}) {
  const primary = state.primaryAction;
  const primaryButton =
    providerBlocksAction(providerGate, primary?.kind) ? (
      <ProviderSetupButton providerGate={providerGate} />
    ) : primary?.kind === "scan_today" || primary?.kind === "rescan_today" ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={pipelineBusy || batchBacktestBusy}
        isDisabled={isWorking && !pipelineBusy && !batchBacktestBusy}
        onPress={() => {
          void onScan();
        }}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "refresh_run" && primary.runId ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={pipelineBusy || batchBacktestBusy}
        isDisabled={isWorking && !pipelineBusy && !batchBacktestBusy}
        onPress={() => onRefreshRun({ id: primary.runId as string })}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "run_all_backtests" && analysis ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={batchBacktestBusy}
        isDisabled={isWorking && !batchBacktestBusy}
        onPress={() => onRunAllBacktests(analysis)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "accept_paper_candidate" && candidate ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isDisabled={isWorking}
        onPress={() => onAcceptPaperCandidate(candidate)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "open_link" && primary.href ? (
      <Link
        href={primary.href}
        className="rounded bg-brand-primary px-3 py-2 text-xs text-white hover:opacity-90"
      >
        {primary.label}
      </Link>
    ) : null;

  return (
    <Section
      title="AI 操作节奏"
      action={<StatusBadge tone={state.tone}>{state.stage}</StatusBadge>}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold text-text-primary">
                {state.title}
              </span>
              <span className="rounded border border-border-default px-2 py-1 text-xs text-text-secondary">
                {state.cadence}
              </span>
            </div>
            <p className="text-sm text-text-secondary">{state.summary}</p>
          </div>
          <div className="shrink-0">{primaryButton}</div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {state.metrics.map((metric) => (
            <Stat
              key={metric.label}
              label={metric.label}
              value={metric.value}
              hint={metric.hint}
              className="p-3"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <PlanList title="节奏检查" rows={state.checks} />
          <PlanList title="安全边界" rows={state.guardrails} />
        </div>
      </div>
    </Section>
  );
}

function AIMoneyPathPanel({
  state,
  analysis,
  candidate,
  providerGate,
  isWorking,
  pipelineBusy,
  batchBacktestBusy,
  onScan,
  onRunAllBacktests,
  onAcceptPaperCandidate,
}: {
  state: AIMoneyPathState;
  analysis: TypeAIGoalAnalysis | null;
  candidate: PaperCandidate | null;
  providerGate?: AIProviderReadinessGateState | null;
  isWorking: boolean;
  pipelineBusy: boolean;
  batchBacktestBusy: boolean;
  onScan: () => void;
  onRunAllBacktests: (analysis: TypeAIGoalAnalysis) => void;
  onAcceptPaperCandidate: (candidate: PaperCandidate) => void;
}) {
  const primary = state.primaryAction;
  const primaryButton =
    providerBlocksAction(providerGate, primary?.kind) ? (
      <ProviderSetupButton providerGate={providerGate} />
    ) : primary?.kind === "scan_today" ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={pipelineBusy || batchBacktestBusy}
        isDisabled={isWorking && !pipelineBusy && !batchBacktestBusy}
        onPress={() => {
          void onScan();
        }}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "run_all_backtests" && analysis ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={batchBacktestBusy}
        isDisabled={isWorking && !batchBacktestBusy}
        onPress={() => onRunAllBacktests(analysis)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "accept_paper_candidate" && candidate ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isDisabled={isWorking}
        onPress={() => onAcceptPaperCandidate(candidate)}
      >
        {primary.label}
      </Button>
    ) : (primary?.kind === "open_link" || primary?.kind === "sentiment_review") &&
      state.primaryHref ? (
      <Link
        href={state.primaryHref}
        className="rounded bg-brand-primary px-3 py-2 text-xs text-white hover:opacity-90"
      >
        {primary.label}
      </Link>
    ) : null;

  return (
    <Section
      title="AI 赚钱路径"
      action={<StatusBadge tone={state.tone}>{state.stage}</StatusBadge>}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="text-base font-semibold text-text-primary">
              {state.title}
            </div>
            <p className="text-sm text-text-secondary">{state.summary}</p>
          </div>
          <div className="shrink-0">{primaryButton}</div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
          {state.steps.map((step, index) => (
            <div
              key={step.id}
              className={
                step.id === state.currentStepId
                  ? "rounded border border-brand-primary bg-bg-surface-2 px-3 py-3"
                  : "rounded border border-border-default px-3 py-3"
              }
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs text-text-tertiary">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div className="mt-1 text-sm font-medium text-text-primary">
                    {step.label}
                  </div>
                </div>
                <StatusBadge tone={step.tone}>{step.status}</StatusBadge>
              </div>
              <p className="mt-2 text-xs text-text-secondary">{step.detail}</p>
              {step.href ? (
                <Link
                  href={step.href}
                  className="mt-3 inline-flex rounded border border-border-default px-2 py-1 text-xs hover:bg-bg-surface-2"
                >
                  打开
                </Link>
              ) : null}
            </div>
          ))}
        </div>
        <PlanList title="下一步" rows={state.nextActions} />
      </div>
    </Section>
  );
}

function AIMoneyBriefPanel({
  state,
  dailyRadarStatus,
  analysis,
  candidate,
  providerGate,
  isWorking,
  pipelineBusy,
  batchBacktestBusy,
  onScan,
  onOpenRun,
  onRunAllBacktests,
  onAcceptPaperCandidate,
}: {
  state: AIMoneyBriefState;
  dailyRadarStatus: DailyRadarStatus;
  analysis: TypeAIGoalAnalysis | null;
  candidate: PaperCandidate | null;
  providerGate?: AIProviderReadinessGateState | null;
  isWorking: boolean;
  pipelineBusy: boolean;
  batchBacktestBusy: boolean;
  onScan: () => void;
  onOpenRun: (run: TypeAIGoalRun) => void;
  onRunAllBacktests: (analysis: TypeAIGoalAnalysis) => void;
  onAcceptPaperCandidate: (candidate: PaperCandidate) => void;
}) {
  const confidence = Math.max(0, Math.min(100, Number(state.confidence || 0)));
  const primary = state.primaryAction;
  const primaryButton =
    providerBlocksAction(providerGate, primary?.kind) ? (
      <ProviderSetupButton providerGate={providerGate} />
    ) : primary?.kind === "scan_today" || primary?.kind === "rescan_today" ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={pipelineBusy || batchBacktestBusy}
        isDisabled={isWorking && !pipelineBusy && !batchBacktestBusy}
        onPress={() => {
          void onScan();
        }}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "open_today_run" && dailyRadarStatus.run ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        variant="flat"
        isDisabled={isWorking}
        onPress={() => onOpenRun(dailyRadarStatus.run as TypeAIGoalRun)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "run_all_backtests" && analysis ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={batchBacktestBusy}
        isDisabled={isWorking && !batchBacktestBusy}
        onPress={() => onRunAllBacktests(analysis)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "accept_paper_candidate" && candidate ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isDisabled={isWorking}
        onPress={() => onAcceptPaperCandidate(candidate)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "open_link" && state.primaryHref ? (
      <Link
        href={state.primaryHref}
        className="rounded bg-brand-primary px-3 py-2 text-xs text-white hover:opacity-90"
      >
        {primary.label}
      </Link>
    ) : null;

  return (
    <Section
      title="AI 指挥摘要"
      action={<StatusBadge tone={state.tone}>{state.stage}</StatusBadge>}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="text-base font-semibold text-text-primary">
              {state.title}
            </div>
            <p className="text-sm text-text-secondary">{state.summary}</p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <div className="rounded border border-border-default px-3 py-2 text-xs">
              <div className="text-text-tertiary">AI 证据置信度</div>
              <div className="font-medium text-text-primary">{confidence}%</div>
            </div>
            {primaryButton}
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-2 overflow-hidden rounded bg-bg-surface-2">
            <div
              className="h-full rounded bg-brand-primary transition-all"
              style={{ width: `${confidence}%` }}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {state.metrics.map((metric) => (
            <Stat
              key={metric.label}
              label={metric.label}
              value={metric.value}
              hint={metric.hint}
              className="p-3"
            />
          ))}
        </div>
        <div className="rounded border border-border-default px-3 py-3 text-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="font-medium text-text-primary">AI 可信度审计</div>
            <StatusBadge tone={state.audit.tone}>{state.audit.verdict}</StatusBadge>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <PlanList title="已满足" rows={state.audit.ready} />
            <PlanList title="风险提醒" rows={state.audit.warnings} />
            <PlanList title="阻塞项" rows={state.audit.blockers} />
          </div>
        </div>
        <div className="text-sm">
          <PlanList title="AI 检查点" rows={state.checkpoints} />
        </div>
      </div>
    </Section>
  );
}

function AICapitalPlanPanel({
  state,
  analysis,
  candidate,
  isWorking,
  batchBacktestBusy,
  onRunAllBacktests,
  onAcceptPaperCandidate,
}: {
  state: AICapitalPlanState;
  analysis: TypeAIGoalAnalysis | null;
  candidate: PaperCandidate | null;
  isWorking: boolean;
  batchBacktestBusy: boolean;
  onRunAllBacktests: (analysis: TypeAIGoalAnalysis) => void;
  onAcceptPaperCandidate: (candidate: PaperCandidate) => void;
}) {
  const primary = state.primaryAction;
  const primaryButton =
    primary?.kind === "run_all_backtests" && analysis ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={batchBacktestBusy}
        isDisabled={isWorking && !batchBacktestBusy}
        onPress={() => onRunAllBacktests(analysis)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "accept_paper_candidate" && candidate ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isDisabled={isWorking}
        onPress={() => onAcceptPaperCandidate(candidate)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "open_link" && state.primaryHref ? (
      <Link
        href={state.primaryHref}
        className="rounded bg-brand-primary px-3 py-2 text-xs text-white hover:opacity-90"
      >
        {primary.label}
      </Link>
    ) : null;

  return (
    <Section
      title="AI 资金计划"
      action={<StatusBadge tone={state.tone}>{state.stage}</StatusBadge>}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="text-base font-semibold text-text-primary">
              {state.title}
            </div>
            <p className="text-sm text-text-secondary">{state.summary}</p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            {primaryButton}
            {state.primaryHref && primary?.kind !== "open_link" && (
              <Link
                href={state.primaryHref}
                className="rounded border border-border-default px-3 py-2 text-xs hover:bg-bg-surface-2"
              >
                打开预填策略
              </Link>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {state.metrics.map((metric) => (
            <Stat
              key={metric.label}
              label={metric.label}
              value={metric.value}
              hint={metric.hint}
              className="p-3"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <PlanList title="资金规则" rows={state.rules} />
          <PlanList title="下一步" rows={state.actions} />
        </div>
      </div>
    </Section>
  );
}

function AIPaperReviewCoachPanel({
  state,
  candidate,
  isWorking,
  onAcceptPaperCandidate,
  onSaveAndAcceptPaperCandidate,
}: {
  state: AIPaperReviewCoachState;
  candidate: PaperCandidate | null;
  isWorking: boolean;
  onAcceptPaperCandidate: (candidate: PaperCandidate) => void;
  onSaveAndAcceptPaperCandidate: (candidate: PaperCandidate) => void;
}) {
  const primary = paperReviewCoachPrimaryAction(state, {
    hasCandidate: Boolean(candidate),
  }) as { kind: string; label: string; href?: string } | null;
  const primaryButton =
    primary?.kind === "accept_paper_candidate" && candidate ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isDisabled={isWorking}
        onPress={() => onAcceptPaperCandidate(candidate)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "save_and_accept_paper_candidate" && candidate ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isDisabled={isWorking}
        onPress={() => onSaveAndAcceptPaperCandidate(candidate)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "open_link" && primary.href ? (
      <Link
        href={primary.href}
        className="rounded bg-brand-primary px-3 py-2 text-xs text-white hover:opacity-90"
      >
        {primary.label}
      </Link>
    ) : null;

  return (
    <Section
      title="AI paper 复盘助手"
      action={<StatusBadge tone={state.tone}>{state.stage}</StatusBadge>}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="text-base font-semibold text-text-primary">
              {state.title}
            </div>
            <p className="text-sm text-text-secondary">{state.summary}</p>
            <div className="text-xs text-text-tertiary">
              候选：{state.candidateLabel}
            </div>
          </div>
          <div className="shrink-0">{primaryButton}</div>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
          {state.items.map((item) => (
            <article
              key={item.id}
              className="rounded border border-border-default px-3 py-2 text-xs"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="font-medium text-text-primary">{item.label}</div>
                <StatusBadge tone={item.tone}>{item.status}</StatusBadge>
              </div>
              <p className="text-text-secondary">{item.detail}</p>
            </article>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
          <PlanList
            title="缺失证据"
            rows={
              state.missingEvidence.length > 0
                ? state.missingEvidence
                : ["复盘证据已覆盖关键观察面。"]
            }
          />
          <PlanList title="下一步" rows={state.nextActions} />
        </div>

        <div className="rounded bg-bg-surface-2 px-3 py-2 text-xs text-text-secondary">
          <div className="mb-1 font-medium text-text-tertiary">完成复盘时写入</div>
          <p>{state.completionNote}</p>
        </div>
      </div>
    </Section>
  );
}

function AIExecutionReadinessPanel({
  state,
  accountsBusy,
  accountsError,
  analysis,
  candidate,
  providerGate,
  isWorking,
  pipelineBusy,
  batchBacktestBusy,
  onScan,
  onRunAllBacktests,
  onAcceptPaperCandidate,
}: {
  state: AIExecutionReadinessState;
  accountsBusy: boolean;
  accountsError: unknown;
  analysis: TypeAIGoalAnalysis | null;
  candidate: PaperCandidate | null;
  providerGate?: AIProviderReadinessGateState | null;
  isWorking: boolean;
  pipelineBusy: boolean;
  batchBacktestBusy: boolean;
  onScan: () => void;
  onRunAllBacktests: (analysis: TypeAIGoalAnalysis) => void;
  onAcceptPaperCandidate: (candidate: PaperCandidate) => void;
}) {
  const score = Math.max(0, Math.min(100, Number(state.score || 0)));
  const primary = state.primaryAction;
  const primaryButton =
    providerBlocksAction(providerGate, primary?.kind) ? (
      <ProviderSetupButton providerGate={providerGate} />
    ) : primary?.kind === "scan_today" || primary?.kind === "rescan_today" ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={pipelineBusy || batchBacktestBusy}
        isDisabled={isWorking && !pipelineBusy && !batchBacktestBusy}
        onPress={() => {
          void onScan();
        }}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "run_all_backtests" && analysis ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={batchBacktestBusy}
        isDisabled={isWorking && !batchBacktestBusy}
        onPress={() => onRunAllBacktests(analysis)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "accept_paper_candidate" && candidate ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isDisabled={isWorking}
        onPress={() => onAcceptPaperCandidate(candidate)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "open_link" && state.primaryHref ? (
      <Link
        href={state.primaryHref}
        className="rounded bg-brand-primary px-3 py-2 text-xs text-white hover:opacity-90"
      >
        {primary.label}
      </Link>
    ) : null;

  return (
    <Section
      title="AI 执行就绪度"
      action={<StatusBadge tone={state.tone}>{state.stage}</StatusBadge>}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="text-base font-semibold text-text-primary">
              {state.title}
            </div>
            <p className="text-sm text-text-secondary">{state.summary}</p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <div className="rounded border border-border-default px-3 py-2 text-xs">
              <div className="text-text-tertiary">
                {accountsBusy ? "账户检查中" : "执行就绪"}
              </div>
              <div className="font-medium text-text-primary">{score}%</div>
            </div>
            {primaryButton}
          </div>
        </div>
        <div className="h-2 overflow-hidden rounded bg-bg-surface-2">
          <div
            className="h-full rounded bg-brand-primary transition-all"
            style={{ width: `${score}%` }}
          />
        </div>
        {accountsError ? <ApiErrorView error={accountsError} /> : null}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {state.metrics.map((metric) => (
            <Stat
              key={metric.label}
              label={metric.label}
              value={metric.value}
              hint={metric.hint}
              className="p-3"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <PlanList title="已满足" rows={state.ready} />
          <PlanList title="阻塞项" rows={state.blockers} />
        </div>
      </div>
    </Section>
  );
}

function AIExecutionPreviewPanel({
  state,
  analysis,
  candidate,
  providerGate,
  isWorking,
  pipelineBusy,
  batchBacktestBusy,
  onScan,
  onRunAllBacktests,
  onAcceptPaperCandidate,
}: {
  state: AIExecutionPreviewState;
  analysis: TypeAIGoalAnalysis | null;
  candidate: PaperCandidate | null;
  providerGate?: AIProviderReadinessGateState | null;
  isWorking: boolean;
  pipelineBusy: boolean;
  batchBacktestBusy: boolean;
  onScan: () => void;
  onRunAllBacktests: (analysis: TypeAIGoalAnalysis) => void;
  onAcceptPaperCandidate: (candidate: PaperCandidate) => void;
}) {
  const primary = state.primaryAction;
  const primaryButton =
    providerBlocksAction(providerGate, primary?.kind) ? (
      <ProviderSetupButton providerGate={providerGate} />
    ) : primary?.kind === "analyze_and_validate" ||
    primary?.kind === "scan_today" ||
    primary?.kind === "rescan_today" ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={pipelineBusy || batchBacktestBusy}
        isDisabled={isWorking && !pipelineBusy && !batchBacktestBusy}
        onPress={() => {
          void onScan();
        }}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "run_all_backtests" && analysis ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={batchBacktestBusy}
        isDisabled={isWorking && !batchBacktestBusy}
        onPress={() => onRunAllBacktests(analysis)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "accept_paper_candidate" && candidate ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isDisabled={isWorking}
        onPress={() => onAcceptPaperCandidate(candidate)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "open_link" && state.primaryHref ? (
      <Link
        href={state.primaryHref}
        className="rounded bg-brand-primary px-3 py-2 text-xs text-white hover:opacity-90"
      >
        {primary.label}
      </Link>
    ) : null;

  return (
    <Section
      title="AI 执行预演"
      action={<StatusBadge tone={state.tone}>{state.stage}</StatusBadge>}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="text-base font-semibold text-text-primary">
              {state.title}
            </div>
            <p className="text-sm text-text-secondary">{state.summary}</p>
          </div>
          <div className="shrink-0">{primaryButton}</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {state.metrics.map((metric) => (
            <Stat
              key={metric.label}
              label={metric.label}
              value={metric.value}
              hint={metric.hint}
              className="p-3"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <PlanList title="AI 会做" rows={state.wouldDo} />
          <PlanList title="AI 不会做" rows={state.willNotDo} />
          <PlanList title="需要你确认" rows={state.requiredHumanConfirmations} />
        </div>
      </div>
    </Section>
  );
}

function AISentimentCompassPanel({ state }: { state: AISentimentCompassState }) {
  return (
    <Section
      title="AI 风向 / 人性"
      action={<StatusBadge tone={state.tone}>{state.stage}</StatusBadge>}
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <div className="text-base font-semibold text-text-primary">
            {state.title}
          </div>
          <p className="text-sm text-text-secondary">{state.summary}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {state.metrics.map((metric) => (
            <Stat
              key={metric.label}
              label={metric.label}
              value={metric.value}
              hint={metric.hint}
              className="p-3"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <PlanList title="风险压力" rows={state.risks} />
          <PlanList title="机会线索" rows={state.opportunities} />
          <PlanList title="观察动作" rows={state.actions} />
        </div>
      </div>
    </Section>
  );
}

function AIThesisInvalidationPanel({
  state,
  analysis,
  providerGate,
  isWorking,
  pipelineBusy,
  batchBacktestBusy,
  onScan,
  onRunAllBacktests,
}: {
  state: AIThesisInvalidationState;
  analysis: TypeAIGoalAnalysis | null;
  providerGate?: AIProviderReadinessGateState | null;
  isWorking: boolean;
  pipelineBusy: boolean;
  batchBacktestBusy: boolean;
  onScan: () => void;
  onRunAllBacktests: (analysis: TypeAIGoalAnalysis) => void;
}) {
  const primary = state.primaryAction;
  const primaryButton =
    providerBlocksAction(providerGate, primary?.kind) ? (
      <ProviderSetupButton providerGate={providerGate} />
    ) : primary?.kind === "scan_today" || primary?.kind === "rescan_today" ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={pipelineBusy || batchBacktestBusy}
        isDisabled={isWorking && !pipelineBusy && !batchBacktestBusy}
        onPress={() => {
          void onScan();
        }}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "run_all_backtests" && analysis ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={batchBacktestBusy}
        isDisabled={isWorking && !batchBacktestBusy}
        onPress={() => onRunAllBacktests(analysis)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "open_link" && primary.href ? (
      <Link
        href={primary.href}
        className="rounded bg-brand-primary px-3 py-2 text-xs text-white hover:opacity-90"
      >
        {primary.label}
      </Link>
    ) : null;

  return (
    <Section
      title="AI 反证清单"
      action={<StatusBadge tone={state.tone}>{state.stage}</StatusBadge>}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="text-base font-semibold text-text-primary">
              {state.title}
            </div>
            <p className="text-sm text-text-secondary">{state.summary}</p>
          </div>
          <div className="shrink-0">{primaryButton}</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {state.metrics.map((metric) => (
            <Stat
              key={metric.label}
              label={metric.label}
              value={metric.value}
              hint={metric.hint}
              className="p-3"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 text-sm lg:grid-cols-2">
          <PlanList title="可能证明 AI 错了" rows={state.invalidators} />
          <PlanList title="需要持续监控" rows={state.monitors} />
          <PlanList title="停止 / 重做规则" rows={state.stopRules} />
          <PlanList title="安全边界" rows={state.guardrails} />
        </div>
      </div>
    </Section>
  );
}

function watchSignalTone(severity: string): "success" | "warning" | "danger" | "default" {
  if (severity === "high") return "danger";
  if (severity === "medium") return "warning";
  return "default";
}

function AIMarketWatchtowerPanel({
  state,
  analysis,
  candidate,
  providerGate,
  isWorking,
  pipelineBusy,
  batchBacktestBusy,
  onScan,
  onRunAllBacktests,
  onAcceptPaperCandidate,
}: {
  state: AIMarketWatchtowerState;
  analysis: TypeAIGoalAnalysis | null;
  candidate: PaperCandidate | null;
  providerGate?: AIProviderReadinessGateState | null;
  isWorking: boolean;
  pipelineBusy: boolean;
  batchBacktestBusy: boolean;
  onScan: () => void;
  onRunAllBacktests: (analysis: TypeAIGoalAnalysis) => void;
  onAcceptPaperCandidate: (candidate: PaperCandidate) => void;
}) {
  const primary = state.primaryAction;
  const primaryButton =
    providerBlocksAction(providerGate, primary?.kind) ? (
      <ProviderSetupButton providerGate={providerGate} />
    ) : primary?.kind === "scan_today" || primary?.kind === "rescan_today" ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={pipelineBusy || batchBacktestBusy}
        isDisabled={isWorking && !pipelineBusy && !batchBacktestBusy}
        onPress={() => {
          void onScan();
        }}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "run_all_backtests" && analysis ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={batchBacktestBusy}
        isDisabled={isWorking && !batchBacktestBusy}
        onPress={() => onRunAllBacktests(analysis)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "accept_paper_candidate" && candidate ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isDisabled={isWorking}
        onPress={() => onAcceptPaperCandidate(candidate)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "open_link" && state.primaryHref ? (
      <Link
        href={state.primaryHref}
        className="rounded bg-brand-primary px-3 py-2 text-xs text-white hover:opacity-90"
      >
        {primary.label}
      </Link>
    ) : null;

  return (
    <Section
      title="AI 市场观察塔"
      action={<StatusBadge tone={state.tone}>{state.stage}</StatusBadge>}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="text-base font-semibold text-text-primary">{state.title}</div>
            <p className="text-sm text-text-secondary">{state.summary}</p>
          </div>
          <div className="shrink-0">{primaryButton}</div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {state.metrics.map((metric) => (
            <Stat
              key={metric.label}
              label={metric.label}
              value={metric.value}
              hint={metric.hint}
              className="p-3"
            />
          ))}
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium text-text-primary">AI 正在盯的信号</div>
          {state.signals.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {state.signals.map((signal) => (
                <div
                  key={`${signal.id}-${signal.label}`}
                  className="rounded border border-border-default px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-medium text-text-primary">{signal.label}</div>
                    <StatusBadge tone="default">{signal.source}</StatusBadge>
                    <StatusBadge tone={watchSignalTone(signal.severity)}>
                      {signal.severity}
                    </StatusBadge>
                  </div>
                  <p className="mt-1 text-text-secondary">{signal.detail}</p>
                  <p className="mt-2 text-xs text-text-tertiary">{signal.action}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded border border-border-default px-3 py-2 text-sm text-text-secondary">
              暂无明确观察信号，先维持观察，不直接推进执行。
            </p>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
          <PlanList title="暂停规则" rows={state.stopRules} />
          <PlanList title="下一步检查" rows={state.nextChecks} />
        </div>
      </div>
    </Section>
  );
}

function AIDailyMissionPanel({
  mission,
  analysis,
  candidate,
  runs,
  providerGate,
  isWorking,
  runsBusy,
  pipelineBusy,
  batchBacktestBusy,
  actionBusyKey,
  manualAction,
  onAnalyzeAndValidate,
  onScan,
  onRefreshRun,
  onValidateRun,
  onRunAllBacktests,
  onAcceptPaperCandidate,
  onSaveAndAcceptPaperCandidate,
  onUpdateAction,
}: {
  mission: AIDailyMissionState;
  analysis: TypeAIGoalAnalysis | null;
  candidate: PaperCandidate | null;
  runs: TypeAIGoalRun[];
  providerGate?: AIProviderReadinessGateState | null;
  isWorking: boolean;
  runsBusy: boolean;
  pipelineBusy: boolean;
  batchBacktestBusy: boolean;
  actionBusyKey: string | null;
  manualAction?: ActionQueueItem | null;
  onAnalyzeAndValidate: (next?: AIGoalFormState) => void;
  onScan: (next?: AIGoalFormState) => void;
  onRefreshRun: (run: Pick<TypeAIGoalRun, "id">) => void;
  onValidateRun: (run: Pick<TypeAIGoalRun, "id">) => void;
  onRunAllBacktests: (analysis: TypeAIGoalAnalysis) => void;
  onAcceptPaperCandidate: (candidate: PaperCandidate) => void;
  onSaveAndAcceptPaperCandidate: (candidate: PaperCandidate) => void;
  onUpdateAction: (item: ActionQueueItem) => void;
}) {
  const renderTaskAction = (task: AIDailyMissionTask) => {
    const command = dailyMissionTaskCommandFromTask(task) as
      | {
          kind: string;
          label: string;
          href?: string;
          runId?: string;
          actionId?: string;
          proposedFormState?: AIGoalFormState;
        }
      | null;
    if (!command) return null;
    const commandRun =
      command.runId
        ? runs.find((run) => run.id === command.runId) ?? { id: command.runId }
        : null;
    if (providerBlocksAction(providerGate, command.kind)) {
      return <ProviderSetupButton providerGate={providerGate} />;
    }
    if (command.kind === "analyze_and_validate") {
      return (
        <Button
          type="button"
          size="sm"
          color="primary"
          isLoading={pipelineBusy || batchBacktestBusy}
          isDisabled={isWorking && !pipelineBusy && !batchBacktestBusy}
          onPress={() => {
            void onAnalyzeAndValidate(command.proposedFormState);
          }}
        >
          执行
        </Button>
      );
    }
    if (command.kind === "scan_today" || command.kind === "rescan_today") {
      return (
        <Button
          type="button"
          size="sm"
          color="primary"
          isLoading={pipelineBusy || batchBacktestBusy}
          isDisabled={isWorking && !pipelineBusy && !batchBacktestBusy}
          onPress={() => {
            void onScan(command.proposedFormState);
          }}
        >
          执行
        </Button>
      );
    }
    if (command.kind === "validate_run" && commandRun) {
      return (
        <Button
          type="button"
          size="sm"
          color="primary"
          isLoading={runsBusy || batchBacktestBusy}
          isDisabled={isWorking && !runsBusy && !batchBacktestBusy}
          onPress={() => onValidateRun(commandRun)}
        >
          验证
        </Button>
      );
    }
    if (command.kind === "refresh_run" && commandRun) {
      return (
        <Button
          type="button"
          size="sm"
          color="primary"
          isLoading={runsBusy || pipelineBusy || batchBacktestBusy}
          isDisabled={isWorking && !runsBusy && !pipelineBusy && !batchBacktestBusy}
          onPress={() => onRefreshRun(commandRun)}
        >
          重扫
        </Button>
      );
    }
    if (command.kind === "run_all_backtests" && analysis) {
      return (
        <Button
          type="button"
          size="sm"
          color="primary"
          isLoading={batchBacktestBusy}
          isDisabled={isWorking && !batchBacktestBusy}
          onPress={() => onRunAllBacktests(analysis)}
        >
          回测
        </Button>
      );
    }
    if (command.kind === "accept_paper_candidate" && candidate) {
      return (
        <Button
          type="button"
          size="sm"
          color="primary"
          isDisabled={isWorking}
          onPress={() => onAcceptPaperCandidate(candidate)}
        >
          采用
        </Button>
      );
    }
    if (command.kind === "save_and_accept_paper_candidate" && candidate) {
      return (
        <Button
          type="button"
          size="sm"
          color="primary"
          isDisabled={isWorking}
          onPress={() => onSaveAndAcceptPaperCandidate(candidate)}
        >
          保存并采用
        </Button>
      );
    }
    if (command.kind === "complete_manual_action" && manualAction && command.actionId) {
      const matchesManualAction =
        manualAction.id === command.actionId || manualAction.action === command.actionId;
      if (matchesManualAction) {
        return (
          <Button
            type="button"
            size="sm"
            color="primary"
            variant="flat"
            isLoading={actionBusyKey === manualAction.id}
            isDisabled={isWorking && actionBusyKey !== manualAction.id}
            onPress={() => onUpdateAction(manualAction)}
          >
            完成
          </Button>
        );
      }
    }
    const href =
      command.href ||
      (command.runId ? `/ai-money?runId=${encodeURIComponent(command.runId)}` : "");
    if (href) {
      return (
        <Link
          href={href}
          className="rounded border border-border-default px-3 py-2 text-xs hover:bg-bg-surface-2"
        >
          打开
        </Link>
      );
    }
    return null;
  };

  return (
    <Section
      title={mission.title}
      action={<StatusBadge tone={mission.tone}>{mission.focus}</StatusBadge>}
    >
      <div className="space-y-3">
        <p className="text-sm text-text-secondary">{mission.summary}</p>
        <div className="space-y-2">
          {mission.tasks.map((task) => (
            <div
              key={task.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded border border-border-default px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-medium text-text-primary">
                    {task.title}
                  </div>
                  <StatusBadge tone={task.tone}>{task.status}</StatusBadge>
                </div>
                <p className="mt-1 text-sm text-text-secondary">{task.detail}</p>
              </div>
              <div className="self-center">{renderTaskAction(task)}</div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function AIMarketMemoryPanel({ state }: { state: AIMarketMemoryState }) {
  return (
    <Section
      title="AI 市场记忆"
      action={<StatusBadge tone={state.tone}>{state.stage}</StatusBadge>}
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <div className="text-base font-semibold text-text-primary">{state.title}</div>
          <p className="text-sm text-text-secondary">{state.summary}</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {state.metrics.map((metric) => (
            <Stat
              key={metric.label}
              label={metric.label}
              value={metric.value}
              hint={metric.hint}
              className="p-3"
            />
          ))}
        </div>
        {state.items.length > 0 ? (
          <div className="space-y-2">
            {state.items.map((item) => {
              const body = (
                <div className="rounded border border-border-default px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 font-medium text-text-primary">
                      {item.goal || item.id}
                    </div>
                    {item.openActionCount > 0 ? (
                      <StatusBadge tone="warning">
                        {item.openActionCount} 交接
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="success">已归档</StatusBadge>
                    )}
                  </div>
                  {item.marketRead ? (
                    <p className="mt-1 text-text-secondary">{item.marketRead}</p>
                  ) : null}
                  <div className="mt-2 grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
                    <div className="rounded bg-bg-surface-2 px-2 py-2">
                      <div className="font-medium text-text-tertiary">人性 / 舆论</div>
                      <div className="mt-1 text-text-secondary">
                        {item.humanFactors.length > 0
                          ? item.humanFactors.join(" · ")
                          : "暂无额外风险"}
                      </div>
                    </div>
                    <div className="rounded bg-bg-surface-2 px-2 py-2">
                      <div className="font-medium text-text-tertiary">观察信号</div>
                      <div className="mt-1 text-text-secondary">
                        {item.watchSignals.length > 0
                          ? item.watchSignals.join(" · ")
                          : `${item.watchSignalCount || 0} 个信号`}
                      </div>
                    </div>
                  </div>
                </div>
              );
              if (item.href) {
                return (
                  <Link key={item.id} href={item.href} className="block">
                    {body}
                  </Link>
                );
              }
              return <div key={item.id}>{body}</div>;
            })}
          </div>
        ) : (
          <p className="rounded border border-border-default px-3 py-2 text-sm text-text-secondary">
            还没有可复用的历史风向记忆。
          </p>
        )}
        <PlanList title="下一步" rows={state.nextActions} />
      </div>
    </Section>
  );
}

function AIDecisionJournalPanel({ items }: { items: AIDecisionJournalItem[] }) {
  return (
    <Section title="AI 复盘日志">
      <div className="space-y-3">
        {items.map((item, index) => {
          const body = (
            <div className="min-w-0 rounded border border-border-default px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 truncate text-sm font-medium text-text-primary">
                  {item.title}
                </div>
                <StatusBadge tone={item.tone}>{item.kind}</StatusBadge>
              </div>
              <p className="mt-1 text-sm text-text-secondary">{item.detail}</p>
              {item.at && (
                <div className="mt-1 text-xs text-text-tertiary">
                  {new Date(item.at).toLocaleString()}
                </div>
              )}
            </div>
          );
          if (item.href) {
            return (
              <Link key={`${item.kind}-${index}`} href={item.href} className="block">
                {body}
              </Link>
            );
          }
          return <div key={`${item.kind}-${index}`}>{body}</div>;
        })}
      </div>
    </Section>
  );
}

function AIAutopilotPanel({
  state,
  analysis,
  candidate,
  providerGate,
  isWorking,
  pipelineBusy,
  batchBacktestBusy,
  onScan,
  onRunAllBacktests,
  onAcceptPaperCandidate,
}: {
  state: AIAutopilotState;
  analysis: TypeAIGoalAnalysis | null;
  candidate: PaperCandidate | null;
  providerGate?: AIProviderReadinessGateState | null;
  isWorking: boolean;
  pipelineBusy: boolean;
  batchBacktestBusy: boolean;
  onScan: () => void;
  onRunAllBacktests: (analysis: TypeAIGoalAnalysis) => void;
  onAcceptPaperCandidate: (candidate: PaperCandidate) => void;
}) {
  const progress = Math.max(0, Math.min(100, Number(state.progress || 0)));
  const primary = state.primaryAction;
  const primaryButton =
    providerBlocksAction(providerGate, primary?.kind) ? (
      <ProviderSetupButton providerGate={providerGate} />
    ) : primary?.kind === "analyze_and_validate" ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={pipelineBusy || batchBacktestBusy}
        isDisabled={isWorking && !pipelineBusy && !batchBacktestBusy}
        onPress={() => {
          void onScan();
        }}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "run_all_backtests" && analysis ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={batchBacktestBusy}
        isDisabled={isWorking && !batchBacktestBusy}
        onPress={() => onRunAllBacktests(analysis)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "accept_paper_candidate" && candidate ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isDisabled={isWorking}
        onPress={() => onAcceptPaperCandidate(candidate)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "open_link" && state.primaryHref ? (
      <Link
        href={state.primaryHref}
        className="rounded bg-brand-primary px-3 py-2 text-xs text-white hover:opacity-90"
      >
        {primary.label}
      </Link>
    ) : null;
  return (
    <Section
      title="AI 自动驾驶"
      action={<StatusBadge tone={state.tone}>{state.stage}</StatusBadge>}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="text-base font-semibold text-text-primary">
              {state.title}
            </div>
            <p className="text-sm text-text-secondary">{state.summary}</p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <div className="rounded border border-border-default px-3 py-2 text-xs">
              <div className="text-text-tertiary">最高阶段</div>
              <div className="font-medium text-text-primary">
                {state.maxExecutionMode}
              </div>
            </div>
            {primaryButton}
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-text-tertiary">
            <span>推进度</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded bg-bg-surface-2">
            <div
              className="h-full rounded bg-brand-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {state.metrics.map((metric) => (
            <Stat
              key={metric.label}
              label={metric.label}
              value={metric.value}
              hint={metric.hint}
              className="p-3"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <PlanList title="当前阻塞" rows={state.blockers} />
          <PlanList title="安全闸门" rows={state.safetyGates} />
          <PlanList title="下一步" rows={state.nextActions} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <PlanList title="AI 已完成" rows={state.completedSteps} />
          <PlanList title="AI 可自动做" rows={state.aiAvailableSteps} />
          <PlanList title="需要你确认" rows={state.humanRequiredSteps} />
        </div>
      </div>
    </Section>
  );
}

function OpportunityRadar({
  radar,
  analysis,
  candidate,
  providerGate,
  busy,
  pipelineBusy,
  batchBacktestBusy,
  onAnalyzeAndValidate,
  onRunAllBacktests,
  onAcceptPaperCandidate,
}: {
  radar: OpportunityRadarState;
  analysis: TypeAIGoalAnalysis | null;
  candidate: PaperCandidate | null;
  providerGate?: AIProviderReadinessGateState | null;
  busy: boolean;
  pipelineBusy: boolean;
  batchBacktestBusy: boolean;
  onAnalyzeAndValidate: () => void;
  onRunAllBacktests: (analysis: TypeAIGoalAnalysis) => void;
  onAcceptPaperCandidate: (candidate: PaperCandidate) => void;
}) {
  const primary = radar.primaryAction;
  const isWorking = busy || pipelineBusy || batchBacktestBusy;
  const primaryButton =
    providerBlocksAction(providerGate, primary?.kind) ? (
      <ProviderSetupButton providerGate={providerGate} />
    ) : primary?.kind === "analyze_and_validate" ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={pipelineBusy || batchBacktestBusy}
        isDisabled={busy && !pipelineBusy}
        onPress={() => {
          void onAnalyzeAndValidate();
        }}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "run_all_backtests" && analysis ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={batchBacktestBusy}
        isDisabled={isWorking && !batchBacktestBusy}
        onPress={() => onRunAllBacktests(analysis)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "accept_paper_candidate" && candidate ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isDisabled={isWorking}
        onPress={() => onAcceptPaperCandidate(candidate)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "open_link" && radar.primaryHref ? (
      <Link
        href={radar.primaryHref}
        className="rounded bg-brand-primary px-3 py-2 text-xs text-white hover:opacity-90"
      >
        {primary.label}
      </Link>
    ) : null;

  return (
    <Section
      title="AI 机会雷达"
      action={<StatusBadge tone={radar.tone}>{radar.stage}</StatusBadge>}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="text-base font-semibold text-text-primary">
              {radar.title}
            </div>
            <p className="text-sm text-text-secondary">{radar.summary}</p>
          </div>
          <div className="shrink-0">{primaryButton}</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {radar.metrics.map((metric) => (
            <Stat
              key={metric.label}
              label={metric.label}
              value={metric.value}
              hint={metric.hint}
              className="p-3"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <PlanList title="雷达依据" rows={radar.reasons} />
          <PlanList title="下一步" rows={radar.nextActions} />
        </div>
        {radar.primaryHref && primary?.kind !== "open_link" && (
          <Link
            href={radar.primaryHref}
            className="inline-flex rounded border border-border-default px-3 py-2 text-xs hover:bg-bg-surface-2"
          >
            打开相关页面
          </Link>
        )}
      </div>
    </Section>
  );
}

function DailyRadarStatusCard({
  status,
  busy,
  autoEnabled,
  providerNotice,
  onAutoEnabledChange,
  onScan,
  onOpen,
}: {
  status: DailyRadarStatus;
  busy: boolean;
  autoEnabled: boolean;
  providerNotice?: AutoRadarProviderNotice | null;
  onAutoEnabledChange: (enabled: boolean) => void;
  onScan: () => void;
  onOpen: (run: TypeAIGoalRun) => void;
}) {
  const renderAction = (
    action: DailyRadarStatus["primaryAction"] | DailyRadarStatus["secondaryAction"],
    variant: "solid" | "flat",
  ) => {
    if (!action) return null;
    if (action.kind === "open_today_run" && status.run) {
      return (
        <Button
          type="button"
          size="sm"
          color="primary"
          variant={variant}
          isDisabled={busy}
          onPress={() => onOpen(status.run as TypeAIGoalRun)}
        >
          {action.label}
        </Button>
      );
    }
    if (
      providerNotice &&
      (action.kind === "scan_today" || action.kind === "rescan_today")
    ) {
      return (
        <Link
          href={providerNotice.primaryHref}
          className="rounded bg-brand-primary px-3 py-2 text-xs text-white hover:opacity-90"
        >
          {providerNotice.primaryAction.label}
        </Link>
      );
    }
    return (
      <Button
        type="button"
        size="sm"
        color="primary"
        variant={variant}
        isLoading={busy && variant === "solid"}
        isDisabled={busy && variant === "flat"}
        onPress={() => {
          void onScan();
        }}
      >
        {action.label}
      </Button>
    );
  };

  return (
    <Section
      title="今日雷达"
      action={
        <div className="flex items-center gap-2">
          <Switch
            size="sm"
            isSelected={autoEnabled}
            onValueChange={onAutoEnabledChange}
          >
            自动雷达
          </Switch>
          <StatusBadge tone={status.tone}>
            {status.isStale ? "refresh" : status.hasToday ? "done" : "new"}
          </StatusBadge>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <div>
          <div className="font-medium text-text-primary">{status.title}</div>
          <p className="mt-1 text-text-secondary">{status.summary}</p>
        </div>
        {providerNotice ? (
          <div className="rounded border border-border-default bg-bg-surface-2 px-3 py-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-text-primary">
                    {providerNotice.title}
                  </span>
                  <StatusBadge tone={providerNotice.tone}>
                    {providerNotice.stage}
                  </StatusBadge>
                </div>
                <p className="text-xs text-text-secondary">
                  {providerNotice.summary}
                </p>
              </div>
              <Link
                href={providerNotice.primaryHref}
                className="shrink-0 self-start rounded border border-border-default px-2 py-1 text-xs hover:bg-bg-surface"
              >
                {providerNotice.primaryAction.label}
              </Link>
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {renderAction(status.primaryAction, "solid")}
          {renderAction(status.secondaryAction, "flat")}
        </div>
      </div>
    </Section>
  );
}

function followupActionLabel(kind: string) {
  if (kind === "paper_watch") return "paper";
  if (kind === "run_validation") return "回测";
  if (kind === "save_strategy") return "策略";
  if (kind === "refresh_context") return "刷新";
  return "复盘";
}

function AIRunFollowupQueuePanel({
  queue,
  runs,
  busy,
  providerGate,
  onScan,
  onRefreshRun,
  onValidateRun,
  onOpen,
}: {
  queue: AIRunFollowupQueueState;
  runs: TypeAIGoalRun[];
  busy: boolean;
  providerGate?: AIProviderReadinessGateState | null;
  onScan: () => void;
  onRefreshRun: (run: TypeAIGoalRun) => void;
  onValidateRun: (run: TypeAIGoalRun) => void;
  onOpen: (run: TypeAIGoalRun) => void;
}) {
  const primary = buildRunFollowupPrimaryAction(queue);
  const primaryRun =
    primary?.runId
      ? runs.find((run) => run.id === primary.runId)
      : null;
  const primaryButton =
    primary?.kind === "open_link" && primary.href ? (
      <Link
        href={primary.href}
        className="rounded bg-brand-primary px-3 py-2 text-xs text-white hover:opacity-90"
      >
        {primary.label}
      </Link>
    ) : primary?.kind === "open_run" && primaryRun ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isDisabled={busy}
        onPress={() => onOpen(primaryRun)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "refresh_run" && primaryRun ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={busy}
        onPress={() => onRefreshRun(primaryRun)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "validate_run" && primaryRun ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={busy}
        onPress={() => onValidateRun(primaryRun)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "scan_today" && providerGate?.blockAutoRadar ? (
      <Link
        href={providerGate.primaryHref || "/settings/ai"}
        className="rounded bg-brand-primary px-3 py-2 text-xs text-white hover:opacity-90"
      >
        {providerGate.primaryAction?.label || "配置真实 AI"}
      </Link>
    ) : primary?.kind === "scan_today" ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={busy}
        onPress={() => {
          void onScan();
        }}
      >
        {primary.label}
      </Button>
    ) : null;

  return (
    <Section
      title="AI 跟进队列"
      action={<StatusBadge tone={queue.tone}>{queue.stage}</StatusBadge>}
    >
      <div className="space-y-3 text-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="font-medium text-text-primary">{queue.title}</div>
            <p className="mt-1 text-text-secondary">{queue.summary}</p>
          </div>
          <div className="shrink-0">{primaryButton}</div>
        </div>
        {queue.items.length === 0 ? (
          <div className="rounded border border-border-default px-3 py-2 text-text-tertiary">
            还没有历史 AI 运行。先启动今日雷达。
          </div>
        ) : (
          <div className="space-y-2">
            {queue.items.map((item) => {
              const run = runs.find((entry) => entry.id === item.runId);
              const hasExternalHref =
                item.href && !item.href.startsWith("/ai-money?");
              return (
                <div
                  key={item.runId}
                  className="rounded border border-border-default px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-text-primary">
                          {item.title}
                        </span>
                        <StatusBadge tone={item.tone}>
                          {followupActionLabel(item.actionKind)}
                        </StatusBadge>
                      </div>
                      <p className="mt-1 text-text-secondary">{item.detail}</p>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-tertiary">
                        <span>{item.symbols}</span>
                        {item.createdAt && (
                          <span>{new Date(item.createdAt).toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2">
                      {run && (
                        <Button
                          type="button"
                          size="sm"
                          variant="flat"
                          isDisabled={busy}
                          onPress={() => onOpen(run)}
                        >
                          恢复
                        </Button>
                      )}
                      {run && item.actionKind === "refresh_context" && (
                        <Button
                          type="button"
                          size="sm"
                          color="primary"
                          variant="flat"
                          isLoading={busy}
                          onPress={() => onRefreshRun(run)}
                        >
                          重扫
                        </Button>
                      )}
                      {hasExternalHref && (
                        <Link
                          href={item.href as string}
                          className="rounded border border-border-default px-3 py-2 text-center text-xs hover:bg-bg-surface-2"
                        >
                          关联
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {queue.nextActions.length > 0 && (
          <PlanList title="AI 建议跟进" rows={queue.nextActions} />
        )}
      </div>
    </Section>
  );
}

function AIRunRefreshComparisonPanel({
  state,
  runs,
  busy,
  onOpen,
}: {
  state: AIRunRefreshComparisonState;
  runs: TypeAIGoalRun[];
  busy: boolean;
  onOpen: (run: TypeAIGoalRun) => void;
}) {
  return (
    <Section
      title="AI 重扫对比"
      action={<StatusBadge tone={state.tone}>{state.stage}</StatusBadge>}
    >
      <div className="space-y-3 text-sm">
        <div>
          <div className="font-medium text-text-primary">{state.title}</div>
          <p className="mt-1 text-text-secondary">{state.summary}</p>
        </div>
        {state.items.length === 0 ? (
          <div className="rounded border border-border-default px-3 py-2 text-text-tertiary">
            完成旧 run 重扫后，这里会显示新旧判断差异。
          </div>
        ) : (
          <div className="space-y-2">
            {state.items.slice(0, 3).map((item) => {
              const newRun = runs.find((run) => run.id === item.newRunId);
              return (
                <div
                  key={`${item.oldRunId}-${item.newRunId}`}
                  className="rounded border border-border-default px-3 py-2"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="min-w-0">
                        <div className="truncate text-xs text-text-tertiary">
                          {item.oldGoal}
                        </div>
                        <div className="truncate font-medium text-text-primary">
                          {item.newGoal}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {item.highlights.map((highlight) => (
                          <span
                            key={highlight}
                            className="rounded bg-bg-surface-2 px-2 py-1 text-xs text-text-secondary"
                          >
                            {highlight}
                          </span>
                        ))}
                      </div>
                      <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
                        <div className="rounded bg-bg-surface-2 px-2 py-1 text-text-secondary">
                          {item.oldSummary || "旧 run 未返回摘要。"}
                        </div>
                        <div className="rounded bg-bg-surface-2 px-2 py-1 text-text-secondary">
                          {item.newSummary || "新 run 未返回摘要。"}
                        </div>
                      </div>
                      <div className="text-xs text-text-tertiary">
                        人性 / 舆论变化：{item.humanFactorChange}
                      </div>
                      {item.refreshedAt && (
                        <div className="text-xs text-text-tertiary">
                          {new Date(item.refreshedAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0">
                      {newRun ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="flat"
                          isDisabled={busy}
                          onPress={() => onOpen(newRun)}
                        >
                          打开新运行
                        </Button>
                      ) : (
                        <Link
                          href={item.href}
                          className="inline-flex rounded border border-border-default px-3 py-2 text-xs hover:bg-bg-surface-2"
                        >
                          打开新运行
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Section>
  );
}

function GoalRunsPanel({
  runs,
  activeId,
  busy,
  error,
  onRefresh,
  onOpen,
}: {
  runs: TypeAIGoalRun[];
  activeId?: string;
  busy: boolean;
  error: unknown;
  onRefresh: () => void;
  onOpen: (run: TypeAIGoalRun) => void;
}) {
  return (
    <Section
      title="AI 目标运行"
      action={
        <Button type="button" size="sm" variant="flat" isLoading={busy} onPress={onRefresh}>
          刷新
        </Button>
      }
    >
      <div className="space-y-3">
        <ApiErrorView error={error} />
        {runs.length === 0 ? (
          <div className="text-sm text-text-tertiary">
            生成一次目标分析后，这里会保留最近运行，方便复盘和继续执行。
          </div>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => {
              const active = run.id === activeId;
              return (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => onOpen(run)}
                  className={`w-full rounded border px-3 py-2 text-left transition ${
                    active
                      ? "border-brand-primary bg-brand-primary/10"
                      : "border-border-default hover:bg-bg-surface-2"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 truncate text-sm font-medium text-text-primary">
                      {run.goal}
                    </div>
                    <StatusBadge tone={run.aiStatus === "ok" ? "success" : "warning"}>
                      {run.aiStatus}
                    </StatusBadge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-tertiary">
                    <span>{new Date(run.createdAt).toLocaleString()}</span>
                    <span>{run.symbols.join(", ") || "auto"}</span>
                    <span>{run.strategyDraftCount} 个蓝图</span>
                    <span>{run.executionMode}</span>
                    <span>点击恢复输入</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Section>
  );
}

function EmptyResult() {
  return (
    <Section title="AI 输出">
      <EmptyState
        title="尚未生成"
        description="输入目标后，结果会包含市场判断、行为因素、策略蓝图、观察信号和执行检查。"
      />
    </Section>
  );
}

function AnalysisResult({
  analysis,
  persistedActions,
  validationRuns,
  validationBusy,
  validationError,
  backtestBusyKey,
  batchBacktestBusy,
  actionBusyKey,
  strategySaveBusyKey,
  onRunBacktest,
  onRunAllBacktests,
  onAcceptPaperCandidate,
  onSaveStrategyDraft,
  onUpdateAction,
}: {
  analysis: TypeAIGoalAnalysis;
  persistedActions?: TypeAIGoalRunAction[];
  validationRuns: TypeBacktest[];
  validationBusy: boolean;
  validationError: unknown;
  backtestBusyKey: string | null;
  batchBacktestBusy: boolean;
  actionBusyKey: string | null;
  strategySaveBusyKey: string | null;
  onRunBacktest: (draft: TypeAIGoalStrategyDraft) => void;
  onRunAllBacktests: (analysis: TypeAIGoalAnalysis) => void;
  onAcceptPaperCandidate: (candidate: PaperCandidate) => void;
  onSaveStrategyDraft: (draft: TypeAIGoalStrategyDraft) => void;
  onUpdateAction: (item: ActionQueueItem) => void;
}) {
  const aiOk = analysis.ai.status === "ok";
  const providerSetupPrompt = aiProviderSetupPromptFromAnalysis(analysis);
  const decision = nextAIGoalDecision(
    analysis,
    persistedActions,
    validationRuns,
  ) as AIGoalDecision;
  const decisionCandidate = paperCandidateFromValidation(
    analysis,
    validationRuns,
  ) as PaperCandidate | null;
  const buildStrategyShortlist = aiStrategyShortlistFromState as unknown as (input: {
    analysis: TypeAIGoalAnalysis;
    validationRuns: TypeBacktest[];
  }) => AIStrategyShortlistState;
  const strategyShortlist = buildStrategyShortlist({ analysis, validationRuns });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="AI 状态"
          value={aiOk ? "已调用" : "Fallback"}
          hint={analysis.ai.model || analysis.ai.error || "—"}
        />
        <Stat
          label="新闻"
          value={analysis.context.newsCount}
          hint={analysis.context.symbols.join(", ")}
        />
        <Stat
          label="宏观 / 链上"
          value={`${analysis.context.macroCount} / ${analysis.context.onchainCount}`}
          hint="上下文条数"
        />
        <Stat
          label="策略蓝图"
          value={analysis.strategyDrafts.length}
          hint={new Date(analysis.createdAt).toLocaleString()}
        />
      </div>

      {providerSetupPrompt && (
        <Callout variant="warning" title={providerSetupPrompt.title}>
          <div className="space-y-3">
            <p>{providerSetupPrompt.message}</p>
            <Button
              as={Link}
              href={providerSetupPrompt.primaryHref}
              color="warning"
              variant="flat"
              size="sm"
            >
              {providerSetupPrompt.primaryAction.label}
            </Button>
          </div>
        </Callout>
      )}

      {analysis.context.notes.length > 0 && (
        <Callout variant="info" title="上下文缺口">
          <ul className="list-disc ml-5 space-y-1">
            {analysis.context.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Callout>
      )}

      <Section
        title="总览"
        action={
          <StatusBadge tone={analysis.execution.canAutoExecute ? "success" : "warning"}>
            {analysis.execution.mode}
          </StatusBadge>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="text-text-primary">{analysis.summary}</p>
          <div>
            <div className="text-xs font-medium text-text-tertiary mb-1">
              市场判断
            </div>
            <p className="text-text-secondary">{analysis.marketRead}</p>
          </div>
          {analysis.humanFactors.length > 0 && (
            <div>
              <div className="text-xs font-medium text-text-tertiary mb-1">
                人性 / 舆论因素
              </div>
              <ul className="list-disc ml-5 space-y-1 text-text-secondary">
                {analysis.humanFactors.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Section>

      <OperatorConstraintsPanel analysis={analysis} />

      <DecisionCard
        decision={decision}
        analysis={analysis}
        candidate={decisionCandidate}
        batchBacktestBusy={batchBacktestBusy}
        onRunAllBacktests={onRunAllBacktests}
        onAcceptPaperCandidate={onAcceptPaperCandidate}
      />

      <AIStrategyShortlistPanel
        state={strategyShortlist}
        analysis={analysis}
        validationRuns={validationRuns}
        batchBacktestBusy={batchBacktestBusy}
        backtestBusyKey={backtestBusyKey}
        onRunBacktest={onRunBacktest}
        onRunAllBacktests={onRunAllBacktests}
        onAcceptPaperCandidate={onAcceptPaperCandidate}
      />

      <ActionQueue
        analysis={analysis}
        persistedActions={persistedActions}
        backtestBusyKey={backtestBusyKey}
        batchBacktestBusy={batchBacktestBusy}
        actionBusyKey={actionBusyKey}
        strategySaveBusyKey={strategySaveBusyKey}
        onRunBacktest={onRunBacktest}
        onRunAllBacktests={onRunAllBacktests}
        onSaveStrategyDraft={onSaveStrategyDraft}
        onUpdateAction={onUpdateAction}
      />

      <ValidationScoreboard
        analysis={analysis}
        runs={validationRuns}
        busy={validationBusy}
        error={validationError}
        onAcceptPaperCandidate={onAcceptPaperCandidate}
      />

      <Section title="策略蓝图">
        <div className="space-y-4">
          {analysis.strategyDrafts.map((draft, idx) => (
            <DraftBlock
              key={`${draft.name}-${idx}`}
              analysis={analysis}
              draft={draft}
              isBacktesting={backtestBusyKey === `${draft.name}-${draft.symbol}`}
              isSavingStrategy={strategySaveBusyKey === `${draft.name}-${draft.symbol}`}
              onRunBacktest={onRunBacktest}
              onSaveStrategyDraft={onSaveStrategyDraft}
            />
          ))}
        </div>
      </Section>

      <Section title="观察信号">
        {analysis.watchSignals.length === 0 ? (
          <div className="text-sm text-text-tertiary">暂无观察信号。</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {analysis.watchSignals.map((s, idx) => (
              <div
                key={`${s.signal}-${idx}`}
                className="rounded border border-border-default p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-text-primary">{s.signal}</div>
                  <StatusBadge tone="default">{s.source}</StatusBadge>
                </div>
                <p className="mt-2 text-text-secondary">{s.interpretation}</p>
                <p className="mt-2 text-xs text-text-tertiary">{s.action}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="执行检查">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs font-medium text-text-tertiary mb-2">
              下一步
            </div>
            <ol className="list-decimal ml-5 space-y-1 text-text-secondary">
              {analysis.execution.nextSteps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>
          <div>
            <div className="text-xs font-medium text-text-tertiary mb-2">
              安全闸门
            </div>
            <ul className="list-disc ml-5 space-y-1 text-text-secondary">
              {analysis.execution.safetyGates.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        </div>
      </Section>
    </div>
  );
}

function OperatorConstraintsPanel({ analysis }: { analysis: TypeAIGoalAnalysis }) {
  const constraints = analysis.context.operatorConstraints;
  const behavior = (constraints?.behaviorConstraints ?? []).filter(Boolean);
  const narrative = (constraints?.marketNarrativeFocus ?? []).filter(Boolean);
  const avoid = (constraints?.avoidScenarios ?? []).filter(Boolean);
  if (behavior.length + narrative.length + avoid.length === 0) {
    return null;
  }
  return (
    <Section
      title="AI 已纳入的个人约束"
      action={<StatusBadge tone="success">applied</StatusBadge>}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <PlanList title="人性约束" rows={behavior} />
        <PlanList title="风向关注" rows={narrative} />
        <PlanList title="禁止场景" rows={avoid} />
      </div>
    </Section>
  );
}

function DecisionCard({
  decision,
  analysis,
  candidate,
  batchBacktestBusy,
  onRunAllBacktests,
  onAcceptPaperCandidate,
}: {
  decision: AIGoalDecision;
  analysis: TypeAIGoalAnalysis;
  candidate: PaperCandidate | null;
  batchBacktestBusy: boolean;
  onRunAllBacktests: (analysis: TypeAIGoalAnalysis) => void;
  onAcceptPaperCandidate: (candidate: PaperCandidate) => void;
}) {
  const primary = decision.primaryAction;
  const primaryButton =
    primary?.kind === "run_all_backtests" ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={batchBacktestBusy}
        onPress={() => onRunAllBacktests(analysis)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "accept_paper_candidate" && candidate ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        onPress={() => onAcceptPaperCandidate(candidate)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "open_link" && decision.primaryHref ? (
      <Link
        href={decision.primaryHref}
        className="rounded bg-brand-primary px-3 py-2 text-xs text-white hover:opacity-90"
      >
        {primary.label}
      </Link>
    ) : null;
  return (
    <Section
      title="AI 下一步判断"
      action={<StatusBadge tone={decision.tone}>{decision.stage}</StatusBadge>}
    >
      <div className="space-y-3 text-sm">
        <div>
          <div className="font-medium text-text-primary">{decision.title}</div>
          <p className="mt-1 text-text-secondary">{decision.summary}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <PlanList title="判断依据" rows={decision.reasons} />
          <PlanList title="建议动作" rows={decision.nextActions} />
        </div>
        {decision.primaryHref && primary?.kind !== "open_link" && (
          <Link
            href={decision.primaryHref}
            className="inline-flex rounded border border-border-default px-3 py-2 text-xs hover:bg-bg-surface-2"
          >
            打开相关页面
          </Link>
        )}
        {primaryButton}
      </div>
    </Section>
  );
}

function AIStrategyShortlistPanel({
  state,
  analysis,
  validationRuns,
  batchBacktestBusy,
  backtestBusyKey,
  onRunBacktest,
  onRunAllBacktests,
  onAcceptPaperCandidate,
}: {
  state: AIStrategyShortlistState;
  analysis: TypeAIGoalAnalysis;
  validationRuns: TypeBacktest[];
  batchBacktestBusy: boolean;
  backtestBusyKey: string | null;
  onRunBacktest: (draft: TypeAIGoalStrategyDraft) => void;
  onRunAllBacktests: (analysis: TypeAIGoalAnalysis) => void;
  onAcceptPaperCandidate: (candidate: PaperCandidate) => void;
}) {
  const candidate = paperCandidateFromValidation(analysis, validationRuns) as PaperCandidate | null;
  const draftByName = new Map(
    analysis.strategyDrafts.map((draft) => [String(draft.name || draft.symbol || ""), draft]),
  );
  const primary = state.primaryAction;
  const primaryButton =
    primary?.kind === "run_all_backtests" ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={batchBacktestBusy}
        onPress={() => onRunAllBacktests(analysis)}
      >
        {primary.label}
      </Button>
    ) : primary?.kind === "accept_paper_candidate" && candidate ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        onPress={() => onAcceptPaperCandidate(candidate)}
      >
        {primary.label}
      </Button>
    ) : null;

  const renderItemAction = (item: AIStrategyShortlistItem) => {
    const draft = draftByName.get(item.draftName);
    if (item.actionKind === "run_backtest" && draft) {
      return (
        <Button
          type="button"
          size="sm"
          variant="flat"
          isLoading={backtestBusyKey === `${draft.name}-${draft.symbol}`}
          onPress={() => onRunBacktest(draft)}
        >
          {item.actionLabel}
        </Button>
      );
    }
    if (item.actionKind === "accept_paper_candidate" && candidate?.draft?.name === item.draftName) {
      return (
        <Button
          type="button"
          size="sm"
          color="primary"
          onPress={() => onAcceptPaperCandidate(candidate)}
        >
          {item.actionLabel}
        </Button>
      );
    }
    const href = item.href || item.backtestHref || item.strategyHref;
    if (href) {
      return (
        <Link
          href={href}
          className="rounded border border-border-default px-3 py-2 text-xs hover:bg-bg-surface-2"
        >
          {item.actionLabel}
        </Link>
      );
    }
    return null;
  };

  return (
    <Section
      title="AI 策略短名单"
      action={<StatusBadge tone={state.tone}>{state.stage}</StatusBadge>}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="text-base font-semibold text-text-primary">{state.title}</div>
            <p className="mt-1 text-sm text-text-secondary">{state.summary}</p>
          </div>
          <div className="shrink-0">{primaryButton}</div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {state.metrics.map((metric) => (
            <Stat
              key={metric.label}
              label={metric.label}
              value={metric.value}
              hint={metric.hint}
              className="p-3"
            />
          ))}
        </div>
        <div className="space-y-2">
          {state.items.map((item) => (
            <article
              key={`${item.rank}-${item.draftName}-${item.stage}`}
              className="rounded border border-border-default px-3 py-3 text-sm"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-bg-surface-2 px-2 py-1 font-mono text-xs">
                      #{item.rank}
                    </span>
                    <div className="font-medium text-text-primary">{item.draftName}</div>
                    <StatusBadge tone={item.tone}>{item.stage}</StatusBadge>
                    <StatusBadge tone="default">{item.kind}</StatusBadge>
                    <span className="font-mono text-xs text-text-tertiary">{item.symbol}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-text-secondary">
                    <span>AI 建议：{item.recommendation}</span>
                    <span>评分：{item.score === null ? "—" : item.score}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <PlanList title="排序理由" rows={item.reasons} />
                    <PlanList title="阻塞项" rows={item.blockers} />
                  </div>
                </div>
                <div className="shrink-0">{renderItemAction(item)}</div>
              </div>
            </article>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
          <PlanList title="短名单安全边界" rows={state.guardrails} />
          <PlanList title="下一步检查" rows={state.nextChecks} />
        </div>
      </div>
    </Section>
  );
}

function pct(n: number | undefined) {
  if (n === undefined || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

function num(n: number | undefined, digits = 2) {
  if (n === undefined || Number.isNaN(n)) return "—";
  return n.toFixed(digits);
}

function ValidationScoreboard({
  analysis,
  runs,
  busy,
  error,
  onAcceptPaperCandidate,
}: {
  analysis: TypeAIGoalAnalysis;
  runs: TypeBacktest[];
  busy: boolean;
  error: unknown;
  onAcceptPaperCandidate: (candidate: PaperCandidate) => void;
}) {
  const rows = rankBacktestValidation(runs) as ValidationScoreItem[];
  const candidate = paperCandidateFromValidation(analysis, runs) as PaperCandidate | null;
  const paperPlan = paperObservationPlanFromCandidate(
    analysis,
    candidate,
  ) as PaperObservationPlan | null;
  if (!busy && rows.length === 0 && !error) return null;
  return (
    <Section
      title="AI 验证评分"
      action={busy ? <StatusBadge tone="warning">刷新中</StatusBadge> : null}
    >
      <div className="space-y-3">
        <ApiErrorView error={error} />
        {candidate && (
          <Callout
            variant="info"
            title={`推荐 paper 候选：${candidate.draft.name}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <div className="text-text-secondary">
                评分 {candidate.score}，收益 {pct(candidate.totalReturn)}，回撤{" "}
                {pct(candidate.maxDrawdown)}。先进入 paper 观察，再决定是否开启测试网。
              </div>
              <Button
                type="button"
                size="sm"
                color="primary"
                onPress={() => onAcceptPaperCandidate(candidate)}
              >
                采用为 paper 候选
              </Button>
            </div>
          </Callout>
        )}
        {paperPlan && <PaperObservationPlanCard plan={paperPlan} />}
        {rows.length === 0 ? (
          <div className="text-sm text-text-tertiary">
            已发起回测后，这里会按收益、夏普、回撤和交易数给出验证排序。
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {rows.map((row, idx) => (
              <article
                key={row.runId}
                className="rounded border border-border-default p-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-text-primary">
                      #{idx + 1} {row.strategyId}
                    </div>
                    <Link
                      href={`/backtests/${row.runId}`}
                      className="font-mono text-xs text-primary hover:underline"
                    >
                      {row.runId}
                    </Link>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge tone={row.tone}>{row.recommendation}</StatusBadge>
                    <div className="rounded bg-bg-surface-2 px-2 py-1 font-mono text-xs">
                      {row.score === null ? "—" : row.score}
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <Metric label="收益" value={pct(row.totalReturn)} />
                  <Metric label="回撤" value={pct(row.maxDrawdown)} />
                  <Metric label="夏普" value={num(row.sharpe)} />
                  <Metric label="交易" value={num(row.nTrades, 0)} />
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}

function PaperObservationPlanCard({ plan }: { plan: PaperObservationPlan }) {
  return (
    <article className="rounded border border-border-default p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-medium text-text-primary">{plan.title}</div>
          <p className="mt-1 text-text-secondary">{plan.summary}</p>
        </div>
        <StatusBadge tone="warning">{plan.window}</StatusBadge>
      </div>

      <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
        <PlanList title="观察清单" rows={plan.checklist} />
        <PlanList title="停止规则" rows={plan.stopRules} />
      </div>

      {plan.triggers.length > 0 && (
        <div className="mt-3">
          <div className="font-medium text-text-tertiary mb-2">舆情 / 人性触发器</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {plan.triggers.map((trigger, idx) => (
              <div
                key={`${trigger.source}-${trigger.signal}-${idx}`}
                className="rounded bg-bg-surface-2 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-text-primary">{trigger.signal}</div>
                  <StatusBadge tone="default">{trigger.source}</StatusBadge>
                </div>
                {trigger.interpretation && (
                  <p className="mt-1 text-xs text-text-secondary">
                    {trigger.interpretation}
                  </p>
                )}
                <p className="mt-1 text-xs text-text-tertiary">{trigger.action}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {plan.links.map((link) => (
          <Link
            key={`${link.label}-${link.href}`}
            href={link.href}
            className="rounded border border-border-default px-2 py-1 text-xs hover:bg-bg-surface-2"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-bg-surface-2 px-2 py-2">
      <div className="text-text-tertiary">{label}</div>
      <div className="mt-1 font-mono text-text-primary">{value}</div>
    </div>
  );
}

function actionTone(status: string): "success" | "warning" | "danger" | "default" {
  if (status === "done") return "success";
  if (status === "ready") return "success";
  if (status === "manual") return "warning";
  if (status === "blocked") return "danger";
  return "default";
}

function actionText(status: string): string {
  if (status === "done") return "已就绪";
  if (status === "ready") return "可执行";
  if (status === "manual") return "需确认";
  if (status === "blocked") return "受阻";
  return status;
}

function firstRunnableDraft(analysis: TypeAIGoalAnalysis): TypeAIGoalStrategyDraft | null {
  return analysis.strategyDrafts.find((draft) => backtestRequestFromDraft(draft) !== null) ?? null;
}

function ActionQueue({
  analysis,
  persistedActions,
  backtestBusyKey,
  batchBacktestBusy,
  actionBusyKey,
  strategySaveBusyKey,
  onRunBacktest,
  onRunAllBacktests,
  onSaveStrategyDraft,
  onUpdateAction,
}: {
  analysis: TypeAIGoalAnalysis;
  persistedActions?: TypeAIGoalRunAction[];
  backtestBusyKey: string | null;
  batchBacktestBusy: boolean;
  actionBusyKey: string | null;
  strategySaveBusyKey: string | null;
  onRunBacktest: (draft: TypeAIGoalStrategyDraft) => void;
  onRunAllBacktests: (analysis: TypeAIGoalAnalysis) => void;
  onSaveStrategyDraft: (draft: TypeAIGoalStrategyDraft) => void;
  onUpdateAction: (item: ActionQueueItem) => void;
}) {
  const items = actionPlanFromAnalysis(analysis, persistedActions) as ActionQueueItem[];
  const validationPlan = autoValidationPlanFromAnalysis(analysis) as AutoValidationPlan;
  const runnableDraft = firstRunnableDraft(analysis);
  const strategyHref = runnableDraft
    ? `/option?${strategyPresetSearchFromDraft(runnableDraft)}`
    : "/option";
  return (
    <Section
      title="AI 行动队列"
      action={
        <Button
          type="button"
          size="sm"
          variant="flat"
          isDisabled={validationPlan.runnableCount === 0}
          isLoading={batchBacktestBusy}
          onPress={() => onRunAllBacktests(analysis)}
        >
          验证全部
        </Button>
      }
    >
      <div className="space-y-2">
        {(validationPlan.coverage.length > 0 ||
          validationPlan.guardrails.length > 0 ||
          validationPlan.skippedDrafts.length > 0) && (
          <div className="rounded border border-border-default px-3 py-3 text-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium text-text-primary">AI 自动验证计划</div>
              <StatusBadge tone={validationPlan.status === "ready" ? "success" : "warning"}>
                {validationPlan.runnableCount} 个可回测
              </StatusBadge>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <PlanList title="验证覆盖" rows={validationPlan.coverage} />
              <PlanList title="安全边界" rows={validationPlan.guardrails} />
              <PlanList
                title="跳过草案"
                rows={validationPlan.skippedDrafts.map(
                  (draft) =>
                    `${draft.name} · ${draft.kind}${draft.symbol ? ` · ${draft.symbol}` : ""}：${draft.reason}`,
                )}
              />
            </div>
          </div>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded border border-border-default p-3 text-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-medium text-text-primary">{item.title}</div>
                  <StatusBadge tone={actionTone(item.status)}>
                    {item.statusLabel ?? actionText(item.status)}
                  </StatusBadge>
                </div>
                <p className="mt-1 text-xs text-text-secondary">{item.detail}</p>
                {item.note && (
                  <p className="mt-1 text-xs text-text-tertiary">{item.note}</p>
                )}
              </div>
              <ActionButton
                item={item}
                draft={runnableDraft}
                strategyHref={strategyHref}
                isBacktesting={
                  runnableDraft
                    ? backtestBusyKey === `${runnableDraft.name}-${runnableDraft.symbol}`
                    : false
                }
                isActionBusy={actionBusyKey === item.id}
                isSavingStrategy={
                  runnableDraft
                    ? strategySaveBusyKey === `${runnableDraft.name}-${runnableDraft.symbol}`
                    : false
                }
                onRunBacktest={onRunBacktest}
                onSaveStrategyDraft={onSaveStrategyDraft}
                onUpdateAction={onUpdateAction}
              />
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function ActionButton({
  item,
  draft,
  strategyHref,
  isBacktesting,
  isActionBusy,
  isSavingStrategy,
  onRunBacktest,
  onSaveStrategyDraft,
  onUpdateAction,
}: {
  item: ActionQueueItem;
  draft: TypeAIGoalStrategyDraft | null;
  strategyHref: string;
  isBacktesting: boolean;
  isActionBusy: boolean;
  isSavingStrategy: boolean;
  onRunBacktest: (draft: TypeAIGoalStrategyDraft) => void;
  onSaveStrategyDraft: (draft: TypeAIGoalStrategyDraft) => void;
  onUpdateAction: (item: ActionQueueItem) => void;
}) {
  const manualTransition = manualActionTransition(item);
  const manualButton = manualTransition ? (
    <Button
      size="sm"
      variant="flat"
      isLoading={isActionBusy}
      onPress={() => onUpdateAction(item)}
    >
      {manualTransition.label}
    </Button>
  ) : null;
  if (item.href && item.status === "done") {
    return (
      <div className="flex flex-wrap gap-2">
        <Link
          href={item.href}
          className="rounded bg-brand-primary px-2 py-1 text-xs text-white hover:opacity-90"
        >
          {item.hrefLabel ?? "查看结果"}
        </Link>
        {manualButton}
      </div>
    );
  }
  if (item.action === "data") {
    return (
      <div className="flex flex-wrap gap-2">
        <Link
          href="/data-explorer/news"
          className="rounded border border-border-default px-2 py-1 text-xs hover:bg-bg-surface-2"
        >
          看数据
        </Link>
        {manualButton}
      </div>
    );
  }
  if (item.action === "sentiment_review") {
    return (
      <div className="flex flex-wrap gap-2">
        <Link
          href="/data-explorer/news"
          className="rounded border border-border-default px-2 py-1 text-xs hover:bg-bg-surface-2"
        >
          看舆情
        </Link>
        {manualButton}
      </div>
    );
  }
  if (item.action === "backtest") {
    return (
      <Button
        size="sm"
        variant="flat"
        isDisabled={!draft || item.status === "blocked"}
        isLoading={isBacktesting}
        onPress={() => {
          if (draft) onRunBacktest(draft);
        }}
      >
        开始回测
      </Button>
    );
  }
  if (item.action === "strategy") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          color="primary"
          isDisabled={!draft || item.status === "blocked"}
          isLoading={isSavingStrategy}
          onPress={() => {
            if (draft) onSaveStrategyDraft(draft);
          }}
        >
          保存草案
        </Button>
        <Link
          href={strategyHref}
          className={`rounded px-2 py-1 text-xs ${
            item.status === "blocked"
              ? "pointer-events-none border border-border-default text-text-tertiary"
              : "border border-border-default hover:bg-bg-surface-2"
          }`}
        >
          预填策略
        </Link>
      </div>
    );
  }
  if (item.action === "gate") {
    return (
      <div className="flex flex-wrap gap-2">
        <Link
          href="/settings/trading"
          className="rounded border border-border-default px-2 py-1 text-xs hover:bg-bg-surface-2"
        >
          查闸门
        </Link>
        {manualButton}
      </div>
    );
  }
  if (item.action === "paper_watch") {
    return (
      <div className="flex flex-wrap gap-2">
        <Link
          href={item.href || "/backtests"}
          className="rounded border border-border-default px-2 py-1 text-xs hover:bg-bg-surface-2"
        >
          看观察
        </Link>
        {manualButton}
      </div>
    );
  }
  return manualButton;
}

function DraftBlock({
  analysis,
  draft,
  isBacktesting,
  isSavingStrategy,
  onRunBacktest,
  onSaveStrategyDraft,
}: {
  analysis: TypeAIGoalAnalysis;
  draft: TypeAIGoalStrategyDraft;
  isBacktesting: boolean;
  isSavingStrategy: boolean;
  onRunBacktest: (draft: TypeAIGoalStrategyDraft) => void;
  onSaveStrategyDraft: (draft: TypeAIGoalStrategyDraft) => void;
}) {
  const backtestParams = new URLSearchParams({
    symbol: draft.symbol,
    proposed: compactJson(draft.params),
    lookbackDays: "90",
  });
  const strategyPreset = strategyPresetSearchFromDraft(draft);
  const canDirectBacktest = backtestRequestFromDraft(draft) !== null;
  const buildDraftEvidence = aiDraftEvidenceFromAnalysis as (
    analysis: TypeAIGoalAnalysis,
    draft: TypeAIGoalStrategyDraft,
  ) => AIDraftEvidenceState;
  const evidence = buildDraftEvidence(analysis, draft);
  const buildCreationSummary = aiStrategyCreationSummaryFromDraft as unknown as (input: {
    analysis: TypeAIGoalAnalysis;
    draft: TypeAIGoalStrategyDraft;
  }) => AIStrategyCreationSummaryState;
  const creationSummary = buildCreationSummary({ analysis, draft });
  return (
    <article className="rounded border border-border-default p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-text-primary">{draft.name}</h3>
            <StatusBadge tone="default">{draft.kind}</StatusBadge>
            <span className="font-mono text-xs text-text-tertiary">
              {draft.symbol}
            </span>
          </div>
          <p className="mt-1 text-sm text-text-secondary">{draft.thesis}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {canDirectBacktest && (
            <Button
              size="sm"
              variant="flat"
              isLoading={isBacktesting}
              onPress={() => onRunBacktest(draft)}
            >
              一键回测
            </Button>
          )}
          {creationSummary.stage === "ready_to_prefill" && (
            <Button
              size="sm"
              color="primary"
              isLoading={isSavingStrategy}
              onPress={() => onSaveStrategyDraft(draft)}
            >
              保存草案
            </Button>
          )}
          <Link
            href={`/backtests/new?${backtestParams.toString()}`}
            className="rounded border border-border-default px-2 py-1 hover:bg-bg-surface-2"
          >
            回测草案
          </Link>
          <Link
            href={`/option?${strategyPreset}`}
            className="rounded bg-brand-primary px-2 py-1 text-white hover:opacity-90"
          >
            预填策略
          </Link>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
        <div>
          <div className="font-medium text-text-tertiary mb-1">参数</div>
          <pre className="max-h-56 overflow-auto rounded bg-bg-surface-2 p-2 font-mono text-[11px] leading-relaxed">
            {compactJson(draft.params)}
          </pre>
        </div>
        <div className="space-y-3">
          <div>
            <div className="font-medium text-text-tertiary mb-1">风控</div>
            <pre className="rounded bg-bg-surface-2 p-2 font-mono text-[11px] leading-relaxed">
              {compactJson(draft.riskCaps)}
            </pre>
          </div>
          {draft.blockers.length > 0 && (
            <div>
              <div className="font-medium text-text-tertiary mb-1">阻塞项</div>
              <ul className="list-disc ml-5 space-y-1 text-text-secondary">
                {draft.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <PlanList title="验证计划" rows={draft.validationPlan} />
        <PlanList title="执行计划" rows={draft.executionPlan} />
      </div>

      <div className="mt-3 rounded border border-border-default bg-bg-surface px-3 py-3 text-xs">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="font-medium text-text-primary">{evidence.title}</div>
            <p className="mt-1 text-text-secondary">{evidence.summary}</p>
          </div>
          <StatusBadge tone={evidence.tone}>AI 证据</StatusBadge>
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
          {evidence.metrics.map((metric) => (
            <Metric key={metric.label} label={metric.label} value={metric.value} />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
          <PlanList title="市场 / 舆论证据" rows={evidence.evidence} />
          <PlanList title="人性 / 风险" rows={evidence.risks} />
          <PlanList title="执行闸门" rows={evidence.gates} />
          <PlanList title="AI 建议动作" rows={evidence.actions} />
        </div>
      </div>

      <AIStrategyCreationSummaryPanel
        state={creationSummary}
        draft={draft}
        isSavingStrategy={isSavingStrategy}
        onSaveStrategyDraft={onSaveStrategyDraft}
      />
    </article>
  );
}

function AIStrategyCreationSummaryPanel({
  state,
  draft,
  isSavingStrategy,
  onSaveStrategyDraft,
}: {
  state: AIStrategyCreationSummaryState;
  draft: TypeAIGoalStrategyDraft;
  isSavingStrategy: boolean;
  onSaveStrategyDraft: (draft: TypeAIGoalStrategyDraft) => void;
}) {
  const primaryButton =
    state.primaryAction?.kind === "save_strategy_draft" ? (
      <Button
        type="button"
        size="sm"
        color="primary"
        isLoading={isSavingStrategy}
        onPress={() => onSaveStrategyDraft(draft)}
      >
        {state.primaryAction.label}
      </Button>
    ) : state.primaryAction?.kind === "open_strategy_prefill" && state.primaryHref ? (
      <Link
        href={state.primaryHref}
        className="shrink-0 rounded bg-brand-primary px-3 py-2 text-xs text-white hover:opacity-90"
      >
        {state.primaryAction.label}
      </Link>
    ) : null;

  return (
    <div className="mt-3 rounded border border-border-default bg-bg-surface px-3 py-3 text-xs">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium text-text-primary">{state.title}</div>
            <StatusBadge tone={state.tone}>
              {state.stage === "ready_to_prefill" ? "可预填" : "需处理"}
            </StatusBadge>
          </div>
          <p className="mt-1 text-text-secondary">{state.summary}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {primaryButton}
          {state.primaryHref && state.primaryAction?.kind !== "open_strategy_prefill" ? (
            <Link
              href={state.primaryHref}
              className="rounded border border-border-default px-3 py-2 text-xs hover:bg-bg-surface-2"
            >
              打开预填策略
            </Link>
          ) : null}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
        {state.metrics.map((metric) => (
          <Stat
            key={metric.label}
            label={metric.label}
            value={metric.value}
            hint={metric.hint}
            className="p-3"
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-3">
        <PlanList title="AI 已准备" rows={state.aiPrepared} />
        <PlanList title="需要你确认" rows={state.userRequired} />
        <PlanList title="保存阻塞项" rows={state.blockers} />
      </div>
    </div>
  );
}

function PlanList({ title, rows }: { title: string; rows: string[] }) {
  return (
    <div>
      <div className="font-medium text-text-tertiary mb-1">{title}</div>
      {rows.length === 0 ? (
        <div className="text-text-tertiary">—</div>
      ) : (
        <ol className="list-decimal ml-5 space-y-1 text-text-secondary">
          {rows.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

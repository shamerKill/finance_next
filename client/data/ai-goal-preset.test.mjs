import assert from "node:assert/strict";
import test from "node:test";

import {
  actionPlanFromAnalysis,
  AI_DEFAULT_AVOID_TEXT,
  AI_DEFAULT_BEHAVIOR_TEXT,
  AI_DEFAULT_NARRATIVE_TEXT,
  AI_GOAL_EXECUTION_MODE_OPTIONS,
  AI_GOAL_TEMPLATES,
  AI_MONEY_DEFAULT_AUTO_RADAR_ENABLED,
  aiGoalFormPrimaryActions,
  aiGoalRequestFromFormState,
  aiAutopilotStateFromAnalysis,
  aiAutonomousCommandFromState,
  aiCapitalPlanFromState,
  aiCommandCenterFromState,
  aiDelegationRunbookFromState,
  aiDailyMissionFromState,
  aiDecisionJournalFromState,
  aiDraftEvidenceFromAnalysis,
  aiGoalAnalyzeTargetFormState,
  aiGoalComposerFromFormState,
  aiGoalExecutableFormStateFromState,
  aiExecutionPreviewFromState,
  aiExecutionReadinessFromState,
  aiMarketMemoryFromState,
  aiMarketWatchtowerFromState,
  aiMoneyBriefFromState,
  aiMoneyPathFromState,
  aiNowActionFromState,
  aiObservationFocusFromState,
  aiOperatorRhythmFromState,
  aiPaperReviewCoachFromState,
  aiProviderAnalysisAttemptFromGate,
  aiProviderReadinessGateFromStatus,
  aiProviderSetupPromptFromAnalysis,
  aiSettingsReturnPromptFromSearch,
  aiSettingsReturnAutoRunDecision,
  aiInitialRunToOpenFromRuns,
  aiRunRefreshComparisonFromRuns,
  aiRunFollowupQueueFromRuns,
  aiRunFollowupPrimaryActionForQueue,
  aiSavedStrategyHandoffFromState,
  aiSentimentCompassFromAnalysis,
  aiSetupChecklistFromState,
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
  dailyRadarFormStateFromRuns,
  dailyRadarStatusFromRuns,
  dailyMissionTaskCommandFromTask,
  backtestRequestFromDraft,
  defaultAIGoalRunActionsFromAnalysis,
  formStateFromGoalTemplate,
  formStateFromAIGoalRun,
  manualActionTransition,
  nextAIGoalDecision,
  opportunityRadarFromState,
  optionCreateRedirectHref,
  optionPayloadFromStrategyDraft,
  optimisticValidationRunsFromHandles,
  parseStrategyPreset,
  paperCandidateFromValidation,
  paperObservationPlanFromCandidate,
  paperCandidateWithCapitalPlan,
  aiPaperAdoptionPackageFromState,
  paperReviewCoachPrimaryAction,
  paperWatchActionPatchFromCandidate,
  rankBacktestValidation,
  runnableBacktestRequestsFromAnalysis,
  savedStrategyBacktestHrefFromOption,
  savedStrategyBacktestRequestFromOption,
  savedStrategyPaperWatchPatchFromBacktest,
  strategyActionPatchFromOptionPresetCreate,
  strategyActionPatchFromSavedDraft,
  strategyHrefWithAIRunId,
  strategyPresetSearchFromDraft,
  validationRunsNeedPolling,
} from "./ai-goal-preset.mjs";

test("strategyPresetSearchFromDraft encodes a grid DCA AI draft for /option", () => {
  const search = strategyPresetSearchFromDraft({
    name: "btca",
    kind: "grid_dca",
    symbol: "BTC",
    params: {
      positionLevel: 7,
      openPositionStopTime: 45,
      orderGroupMargin: 250,
      stopProfitRate: 0.04,
      stopLossRate: 0.08,
      profitRateAfterAtAddPosition: 0.015,
      createCostOrderInProfit: true,
      createPositions: [
        { marginRate: 0.4, lossAddRate: 0 },
        { marginRate: 0.6, lossAddRate: 0.05 },
      ],
    },
    riskCaps: {
      maxPositionUsd: 350,
      maxLeverage: 10,
      dailyLossCapUsd: 35,
    },
  });
  const hrefWithRun = strategyHrefWithAIRunId(`/option?${search}`, "goal abc");

  const parsed = parseStrategyPreset(new URLSearchParams(hrefWithRun.split("?")[1]));

  assert.equal(parsed.isPreset, true);
  assert.equal(parsed.aiRunId, "goal abc");
  assert.equal(parsed.name, "btca");
  assert.equal(parsed.kind, "grid_dca");
  assert.equal(parsed.execSymbol, "BTCUSDT");
  assert.equal(parsed.positionLevel, 7);
  assert.equal(parsed.openPositionStopTime, 45);
  assert.equal(parsed.orderGroupMargin, 250);
  assert.equal(parsed.stopProfitRate, 0.04);
  assert.equal(parsed.stopLossRate, 0.08);
  assert.equal(parsed.profitRateAfterAtAddPosition, 0.015);
  assert.equal(parsed.createCostOrderInProfit, true);
  assert.deepEqual(parsed.risk, {
    maxPositionUsd: 350,
    maxLeverage: 10,
    dailyLossCapUsd: 35,
  });
  assert.deepEqual(parsed.createPositions, [
    { marginRate: 0.4, lossAddRate: 0 },
    { marginRate: 0.6, lossAddRate: 0.05 },
  ]);
  const params = new URLSearchParams(hrefWithRun.split("?")[1]);
  assert.equal(params.get("name"), "btca");
  assert.equal(params.get("orderGroupMargin"), "250");
  assert.equal(params.get("aiRunId"), "goal abc");
});

test("strategyPresetSearchFromDraft caps leverage by AI risk caps", () => {
  const search = strategyPresetSearchFromDraft({
    name: "btca",
    kind: "grid_dca",
    symbol: "BTC",
    params: {
      positionLevel: 50,
      orderGroupMargin: 999,
    },
    riskCaps: {
      maxPositionUsd: 120,
      maxLeverage: 3,
      dailyLossCapUsd: 20,
    },
  });

  const params = new URLSearchParams(search);
  const parsed = parseStrategyPreset(params);

  assert.equal(params.get("positionLevel"), "3");
  assert.equal(params.get("orderGroupMargin"), "120");
  assert.equal(parsed.positionLevel, 3);
  assert.equal(parsed.orderGroupMargin, 120);
  assert.deepEqual(parsed.risk, {
    maxPositionUsd: 120,
    maxLeverage: 3,
    dailyLossCapUsd: 20,
  });
});

test("optionPayloadFromStrategyDraft builds a credentialless option payload from an AI draft", () => {
  const payload = optionPayloadFromStrategyDraft({
    name: "btca",
    kind: "grid_dca",
    symbol: "BTC",
    params: {
      positionLevel: 9,
      openPositionStopTime: 60,
      orderGroupMargin: 900,
      stopProfitRate: 0.06,
      stopLossRate: 0.09,
      profitRateAfterAtAddPosition: 0.02,
      createCostOrderInProfit: true,
      createPositions: [
        { marginRate: 0.3, lossAddRate: 0 },
        { marginRate: 0.7, lossAddRate: 0.04 },
      ],
    },
    riskCaps: {
      maxPositionUsd: 240,
      maxLeverage: 5,
      dailyLossCapUsd: 18,
    },
  });

  assert.deepEqual(payload, {
    name: "btca",
    positionLevel: 5,
    openPositionStopTime: 60,
    execSymbol: "BTCUSDT",
    orderGroupMargin: 240,
    stopProfitRate: 0.06,
    stopLossRate: 0.09,
    profitRateAfterAtAddPosition: 0.02,
    createCostOrderInProfit: true,
    createPositions: [
      { marginRate: 0.3, lossAddRate: 0 },
      { marginRate: 0.7, lossAddRate: 0.04 },
    ],
    risk: {
      maxPositionUsd: 240,
      maxLeverage: 5,
      dailyLossCapUsd: 18,
    },
  });
});

test("optionPayloadFromStrategyDraft preserves the source AI run id when saving a draft", () => {
  const payload = optionPayloadFromStrategyDraft(
    {
      name: "btca",
      kind: "grid_dca",
      symbol: "BTC",
      params: {
        positionLevel: 5,
        orderGroupMargin: 200,
      },
      riskCaps: {
        maxPositionUsd: 200,
        maxLeverage: 4,
        dailyLossCapUsd: 20,
      },
    },
    { aiRunId: "goal abc" },
  );

  assert.equal(payload?.aiRunId, "goal abc");
});

test("strategyActionPatchFromSavedDraft writes a saved AI strategy handoff into run memory", () => {
  const patch = strategyActionPatchFromSavedDraft({
    analysis: {
      id: "goal abc",
      goal: "用 BTC 低回撤赚钱",
    },
    draft: {
      name: "btca",
      symbol: "BTC",
      kind: "grid_dca",
      hypothesis: "BTC range-bound grid after sentiment cools",
    },
    response: {
      value: {
        id: "opt123",
        name: "btca",
      },
    },
    href: "/strategies/opt123?from=ai-draft&aiRunId=goal+abc",
  });

  assert.equal(patch.status, "done");
  assert.equal(patch.relatedId, "opt123");
  assert.equal(patch.href, "/strategies/opt123?from=ai-draft&aiRunId=goal+abc");
  assert.ok(patch.note.includes("btca"));
  assert.ok(patch.note.includes("goal abc"));
  assert.ok(patch.note.includes("live 仍关闭"));
  assert.ok(patch.note.includes("回测"));
  assert.ok(patch.note.includes("paper"));
  assert.ok(patch.note.includes("市场风向"));
});

test("strategyActionPatchFromOptionPresetCreate records an option preset create as the saved strategy action", () => {
  const handoff = strategyActionPatchFromOptionPresetCreate({
    preset: {
      isPreset: true,
      aiRunId: "goal abc",
      name: "btca",
      kind: "grid_dca",
      execSymbol: "BTCUSDT",
    },
    response: {
      value: {
        id: "opt123",
        name: "btca",
      },
    },
    href: "/strategies/opt123?from=ai-draft&aiRunId=goal+abc",
  });

  assert.deepEqual(handoff, {
    runId: "goal abc",
    actionId: "strategy",
    patch: {
      status: "done",
      relatedId: "opt123",
      href: "/strategies/opt123?from=ai-draft&aiRunId=goal+abc",
      note: handoff?.patch.note,
    },
  });
  assert.ok(handoff?.patch.note.includes("btca"));
  assert.ok(handoff?.patch.note.includes("goal abc"));
  assert.ok(handoff?.patch.note.includes("BTCUSDT"));
  assert.ok(handoff?.patch.note.includes("市场风向"));
  assert.ok(handoff?.patch.note.includes("paper"));
});

test("optionPayloadFromStrategyDraft refuses watch-only AI drafts", () => {
  const payload = optionPayloadFromStrategyDraft({
    name: "watch",
    kind: "watch_only",
    symbol: "BTC",
    params: {},
  });

  assert.equal(payload, null);
});

test("aiSavedStrategyHandoffFromState keeps saved AI drafts stopped until backtest, account, and risk are ready", () => {
  const handoff = aiSavedStrategyHandoffFromState({
    strategy: {
      id: "opt123",
      name: "btca",
      execSymbol: "BTCUSDT",
      positionLevel: 4,
      orderGroupMargin: 300,
      stopProfitRate: 0.04,
      stopLossRate: 0.08,
      profitRateAfterAtAddPosition: 0.01,
      createCostOrderInProfit: true,
      createPositions: [{ marginRate: 1, lossAddRate: 0 }],
      risk: { maxPositionUsd: 300, maxLeverage: 4, dailyLossCapUsd: 25 },
      live: { enabled: false, mode: "testnet" },
    },
    accounts: [],
    backtests: [],
  });

  assert.equal(handoff.stage, "needs_backtest");
  assert.equal(handoff.tone, "warning");
  const backtestUrl = new URL(handoff.primaryHref, "http://local.test");
  assert.equal(backtestUrl.pathname, "/backtests/new");
  assert.equal(backtestUrl.searchParams.get("strategyId"), "opt123");
  assert.equal(backtestUrl.searchParams.get("symbol"), "BTCUSDT");
  assert.equal(backtestUrl.searchParams.get("lookbackDays"), "90");
  assert.ok(backtestUrl.searchParams.get("proposed").includes("positionLevel"));
  assert.deepEqual(handoff.primaryAction, {
    kind: "run_backtest",
    label: "先运行回测",
  });
  assert.ok(handoff.summary.includes("live 保持关闭"));
  assert.ok(handoff.items.some((item) => item.id === "live_off" && item.status === "done"));
  assert.ok(handoff.items.some((item) => item.id === "backtest" && item.status === "current"));
  assert.ok(handoff.items.some((item) => item.id === "safe_account" && item.status === "blocked"));
  assert.ok(handoff.nextActions.some((item) => item.includes("回测")));
});

test("aiSavedStrategyHandoffFromState promotes a saved AI draft to paper review when evidence and gates are ready", () => {
  const handoff = aiSavedStrategyHandoffFromState({
    strategy: {
      id: "opt123",
      name: "btca",
      execSymbol: "BTCUSDT",
      positionLevel: 4,
      orderGroupMargin: 300,
      risk: { maxPositionUsd: 300, maxLeverage: 4, dailyLossCapUsd: 25 },
      live: { enabled: false, mode: "testnet" },
    },
    accounts: [
      {
        id: "acc1",
        permissions: { canTrade: true, canWithdraw: false },
      },
    ],
    backtests: [
      {
        runId: "run1",
        state: 3,
        metrics: { total_return: 0.08, sharpe: 1.3, max_dd: -0.07, n_trades: 24 },
      },
    ],
  });

  assert.equal(handoff.stage, "paper_review");
  assert.equal(handoff.tone, "success");
  assert.equal(handoff.primaryHref, "/backtests/run1");
  assert.deepEqual(handoff.primaryAction, {
    kind: "review_backtest",
    label: "查看回测证据",
  });
  assert.ok(handoff.items.every((item) => item.status !== "blocked"));
  assert.ok(handoff.items.some((item) => item.id === "paper_watch" && item.status === "current"));
  assert.ok(handoff.nextActions.some((item) => item.includes("paper")));
});

test("aiSavedStrategyHandoffFromState blocks paper review when saved AI draft backtest is weak", () => {
  const handoff = aiSavedStrategyHandoffFromState({
    strategy: {
      id: "opt123",
      name: "btca",
      execSymbol: "BTCUSDT",
      positionLevel: 4,
      orderGroupMargin: 300,
      risk: { maxPositionUsd: 300, maxLeverage: 4, dailyLossCapUsd: 25 },
      live: { enabled: false, mode: "testnet" },
      aiRunId: "goal weak",
    },
    accounts: [
      {
        id: "acc1",
        permissions: { canTrade: true, canWithdraw: false },
      },
    ],
    backtests: [
      {
        runId: "run-bad",
        state: 3,
        metrics: { total_return: -0.03, sharpe: 0.2, max_dd: -0.28, n_trades: 18 },
      },
    ],
  });

  assert.equal(handoff.stage, "validation_rejected");
  assert.equal(handoff.tone, "danger");
  assert.equal(handoff.primaryHref, "/backtests/run-bad");
  assert.deepEqual(handoff.primaryAction, {
    kind: "review_backtest",
    label: "查看失败证据",
  });
  assert.ok(handoff.summary.includes("淘汰"));
  assert.ok(handoff.items.some((item) => item.id === "backtest" && item.status === "blocked"));
  assert.ok(handoff.items.some((item) => item.id === "paper_watch" && item.status !== "current"));
  assert.ok(handoff.nextActions.some((item) => item.includes("重新设计")));
  assert.ok(handoff.nextActions.some((item) => item.includes("AI 目标运行")));
});

test("savedStrategyBacktestHrefFromOption builds a prefilled 90 day backtest link", () => {
  const href = savedStrategyBacktestHrefFromOption({
    id: "opt123",
    name: "btca",
    execSymbol: "BTCUSDT",
    positionLevel: 4,
    orderGroupMargin: 300,
    stopProfitRate: 0.04,
    stopLossRate: 0.08,
    profitRateAfterAtAddPosition: 0.01,
    createCostOrderInProfit: true,
    createPositions: [{ marginRate: 1, lossAddRate: 0 }],
  });

  const url = new URL(href, "http://local.test");
  assert.equal(url.pathname, "/backtests/new");
  assert.equal(url.searchParams.get("strategyId"), "opt123");
  assert.equal(url.searchParams.get("symbol"), "BTCUSDT");
  assert.equal(url.searchParams.get("lookbackDays"), "90");
  const proposed = JSON.parse(url.searchParams.get("proposed"));
  assert.equal(proposed.positionLevel, 4);
  assert.equal(proposed.stopProfitRate, 0.04);
  assert.deepEqual(proposed.createPositions, [{ marginRate: 1, lossAddRate: 0 }]);
});

test("savedStrategyBacktestRequestFromOption builds a safe request for a saved AI strategy", () => {
  const request = savedStrategyBacktestRequestFromOption(
    {
      id: "opt123",
      name: "btca",
      execSymbol: "BTCUSDT",
      positionLevel: 4,
      orderGroupMargin: 300,
      stopProfitRate: 0.04,
      stopLossRate: 0.08,
      profitRateAfterAtAddPosition: 0.01,
      createCostOrderInProfit: true,
      createPositions: [{ marginRate: 1, lossAddRate: 0 }],
    },
    new Date("2026-06-02T08:00:00Z"),
  );

  assert.deepEqual(request, {
    strategyId: "opt123",
    kind: "grid_dca",
    params: {
      positionLevel: 4,
      orderGroupMargin: 300,
      stopProfitRate: 0.04,
      stopLossRate: 0.08,
      profitRateAfterAtAddPosition: 0.01,
      createCostOrderInProfit: true,
      createPositions: [{ marginRate: 1, lossAddRate: 0 }],
    },
    symbol: "BTCUSDT",
    exchange: "binance",
    timeframe: "1h",
    start: "2026-03-04T08:00:00.000Z",
    end: "2026-06-02T08:00:00.000Z",
    initialCapital: 10000,
    commissionRate: 0.0004,
    slippageBps: 1,
  });
});

test("aiSavedStrategyHandoffFromState links a saved strategy back to the source AI run", () => {
  const handoff = aiSavedStrategyHandoffFromState({
    strategy: {
      id: "opt123",
      name: "btca",
      execSymbol: "BTCUSDT",
      risk: { maxPositionUsd: 300, maxLeverage: 4, dailyLossCapUsd: 25 },
      live: { enabled: false, mode: "testnet" },
    },
    goalRun: {
      id: "goal abc",
      goal: "寻找 BTC 低回撤 AI 赚钱机会",
      strategyDraftCount: 2,
      aiStatus: "ok",
    },
  });

  const source = handoff.items.find((item) => item.id === "source_run");
  assert.equal(source?.status, "done");
  assert.equal(source?.href, "/ai-money?runId=goal+abc");
  assert.ok(source?.detail.includes("寻找 BTC"));
  assert.ok(handoff.nextActions.some((item) => item.includes("AI 目标运行")));
});

test("aiSavedStrategyHandoffFromState links a saved strategy back to persisted aiRunId", () => {
  const handoff = aiSavedStrategyHandoffFromState({
    strategy: {
      id: "opt123",
      name: "btca",
      execSymbol: "BTCUSDT",
      aiRunId: "goal abc",
      risk: { maxPositionUsd: 300, maxLeverage: 4, dailyLossCapUsd: 25 },
      live: { enabled: false, mode: "testnet" },
    },
  });

  const source = handoff.items.find((item) => item.id === "source_run");
  assert.equal(source?.status, "done");
  assert.equal(source?.href, "/ai-money?runId=goal+abc");
  assert.ok(source?.detail.includes("AI Money"));
});

test("aiStrategyCreationSummaryFromDraft prepares a grid DCA draft for safe strategy creation", () => {
  const draft = {
    name: "btca",
    kind: "grid_dca",
    symbol: "BTC",
    params: {
      positionLevel: 8,
      orderGroupMargin: 500,
      stopProfitRate: 0.04,
      stopLossRate: 0.07,
      createPositions: [
        { marginRate: 0.5, lossAddRate: 0 },
        { marginRate: 0.5, lossAddRate: 0.04 },
      ],
    },
    riskCaps: {
      maxPositionUsd: 300,
      maxLeverage: 4,
      dailyLossCapUsd: 25,
    },
  };

  const summary = aiStrategyCreationSummaryFromDraft({
    analysis: {
      context: { newsCount: 2, macroCount: 1, onchainCount: 1 },
      execution: { mode: "paper" },
    },
    draft,
  });

  assert.equal(summary.stage, "ready_to_prefill");
  assert.equal(summary.tone, "success");
  assert.deepEqual(summary.primaryAction, {
    kind: "save_strategy_draft",
    label: "保存为 AI 策略",
  });
  assert.ok(summary.primaryHref.startsWith("/option?"));
  const parsed = parseStrategyPreset(
    new URLSearchParams(summary.primaryHref.split("?")[1]),
  );
  assert.equal(parsed.execSymbol, "BTCUSDT");
  assert.equal(parsed.positionLevel, 4);
  assert.equal(parsed.orderGroupMargin, 300);
  assert.deepEqual(parsed.risk, {
    maxPositionUsd: 300,
    maxLeverage: 4,
    dailyLossCapUsd: 25,
  });
  assert.ok(summary.aiPrepared.some((item) => item.includes("BTCUSDT")));
  assert.ok(summary.aiPrepared.some((item) => item.includes("最大杠杆 4x")));
  assert.equal(summary.userRequired.some((item) => item.includes("API 密钥")), false);
  assert.ok(summary.userRequired.some((item) => item.includes("稍后绑定")));
  assert.ok(summary.userRequired.some((item) => item.includes("人工复核")));
  assert.deepEqual(summary.blockers, []);
});

test("aiStrategyCreationSummaryFromDraft blocks watch-only drafts from strategy creation", () => {
  const summary = aiStrategyCreationSummaryFromDraft({
    analysis: { execution: { mode: "observe" } },
    draft: {
      name: "watch",
      kind: "watch_only",
      symbol: "BTC",
      params: {},
      riskCaps: {
        maxPositionUsd: 300,
        maxLeverage: 4,
        dailyLossCapUsd: 25,
      },
    },
  });

  assert.equal(summary.stage, "blocked");
  assert.equal(summary.tone, "warning");
  assert.equal(summary.primaryHref, undefined);
  assert.ok(summary.blockers.some((item) => item.includes("只观察")));
  assert.ok(summary.userRequired.some((item) => item.includes("重新生成")));
});

test("optionCreateRedirectHref sends saved AI drafts to the strategy detail page", () => {
  const href = optionCreateRedirectHref({
    isAIPreset: true,
    response: { message: "创建成功", value: { id: "abc/123", name: "btca" } },
  });

  assert.equal(href, "/strategies/abc%2F123?from=ai-draft");
});

test("optionCreateRedirectHref preserves the source AI goal run when saving a draft", () => {
  const href = optionCreateRedirectHref({
    isAIPreset: true,
    runId: "goal abc",
    response: { message: "创建成功", value: { id: "abc/123", name: "btca" } },
  });

  assert.equal(href, "/strategies/abc%2F123?from=ai-draft&aiRunId=goal+abc");
});

test("optionCreateRedirectHref falls back to the strategy list without an AI draft id", () => {
  assert.equal(
    optionCreateRedirectHref({
      isAIPreset: true,
      response: { message: "创建成功", value: { name: "btca" } },
    }),
    "/strategies",
  );
  assert.equal(
    optionCreateRedirectHref({
      isAIPreset: false,
      response: { message: "创建成功", value: { id: "abc123", name: "btca" } },
    }),
    "/strategies",
  );
});

test("parseStrategyPreset caps manually edited values by AI risk caps", () => {
  const parsed = parseStrategyPreset(
    new URLSearchParams({
      source: "ai-goal",
      name: "btca",
      kind: "grid_dca",
      execSymbol: "BTCUSDT",
      positionLevel: "50",
      orderGroupMargin: "999",
      riskMaxPositionUsd: "120",
      riskMaxLeverage: "3",
      riskDailyLossCapUsd: "20",
    }),
  );

  assert.equal(parsed.positionLevel, 3);
  assert.equal(parsed.orderGroupMargin, 120);
  assert.deepEqual(parsed.risk, {
    maxPositionUsd: 120,
    maxLeverage: 3,
    dailyLossCapUsd: 20,
  });
});

test("AI_GOAL_TEMPLATES are safe reusable starting points", () => {
  assert.equal(AI_GOAL_TEMPLATES.length >= 3, true);
  const ids = new Set();
  for (const template of AI_GOAL_TEMPLATES) {
    assert.equal(ids.has(template.id), false);
    ids.add(template.id);
    assert.equal(Boolean(template.goal), true);
    assert.equal(Array.isArray(template.symbols), true);
    assert.equal(template.symbols.length > 0, true);
    assert.equal(["observe", "paper"].includes(template.executionMode), true);
  }
});

test("AI_GOAL_EXECUTION_MODE_OPTIONS only exposes observe and paper for goal input", () => {
  assert.deepEqual(
    AI_GOAL_EXECUTION_MODE_OPTIONS.map((item) => item.key),
    ["observe", "paper"],
  );
  assert.equal(
    AI_GOAL_EXECUTION_MODE_OPTIONS.some((item) => ["testnet", "mainnet"].includes(item.key)),
    false,
  );
});

test("formStateFromGoalTemplate applies a safe template to the current form", () => {
  const template = AI_GOAL_TEMPLATES.find((item) => item.id === "low_drawdown_crypto");
  const next = formStateFromGoalTemplate(template, {
    goal: "current",
    symbolsText: "SOL",
    horizon: "1 day",
    riskPreference: "aggressive",
    executionMode: "mainnet",
  });

  assert.equal(next.goal.includes("低回撤"), true);
  assert.equal(next.symbolsText, "BTC, ETH");
  assert.equal(next.horizon, "1-4 weeks");
  assert.equal(next.riskPreference, "balanced");
  assert.equal(next.executionMode, "paper");
});

test("aiGoalRequestFromFormState builds a clean analysis request from template form state", () => {
  const template = AI_GOAL_TEMPLATES.find((item) => item.id === "sentiment_breakout");
  const form = formStateFromGoalTemplate(template, {
    goal: "current",
    symbolsText: "BTC",
    horizon: "1 day",
    riskPreference: "aggressive",
    executionMode: "mainnet",
  });

  const request = aiGoalRequestFromFormState({
    ...form,
    symbolsText: " btc, ETH，btc SOL ADA DOGE XRP BNB TON AVAX ",
  });

  assert.equal(request.goal.includes("新闻叙事"), true);
  assert.deepEqual(request.symbols, [
    "BTC",
    "ETH",
    "SOL",
    "ADA",
    "DOGE",
    "XRP",
    "BNB",
    "TON",
  ]);
  assert.equal(request.horizon, "3-10 days");
  assert.equal(request.riskPreference, "conservative");
  assert.equal(request.executionMode, "paper");
});

test("aiGoalRequestFromFormState caps unsafe execution modes before AI analysis", () => {
  const mainnetRequest = aiGoalRequestFromFormState({
    goal: "用 AI 找低回撤赚钱机会",
    symbolsText: "BTC, ETH",
    horizon: "1-4 weeks",
    riskPreference: "balanced",
    executionMode: "mainnet",
  });
  const testnetRequest = aiGoalRequestFromFormState({
    goal: "用 AI 找低回撤赚钱机会",
    symbolsText: "BTC, ETH",
    horizon: "1-4 weeks",
    riskPreference: "balanced",
    executionMode: "testnet",
  });
  const observeRequest = aiGoalRequestFromFormState({
    goal: "只观察市场风向",
    symbolsText: "BTC",
    horizon: "24h",
    riskPreference: "conservative",
    executionMode: "observe",
  });

  assert.equal(mainnetRequest.executionMode, "paper");
  assert.equal(testnetRequest.executionMode, "paper");
  assert.equal(observeRequest.executionMode, "observe");
});

test("aiGoalRequestFromFormState normalizes unsafe risk preferences before AI analysis", () => {
  const unknownRequest = aiGoalRequestFromFormState({
    goal: "用 AI 找低回撤赚钱机会",
    symbolsText: "BTC, ETH",
    horizon: "1-4 weeks",
    riskPreference: "all-in",
    executionMode: "paper",
  });
  const blankRequest = aiGoalRequestFromFormState({
    goal: "用 AI 找低回撤赚钱机会",
    symbolsText: "BTC, ETH",
    horizon: "1-4 weeks",
    riskPreference: "",
    executionMode: "paper",
  });
  const knownRequest = aiGoalRequestFromFormState({
    goal: "用 AI 找低回撤赚钱机会",
    symbolsText: "BTC, ETH",
    horizon: "1-4 weeks",
    riskPreference: "aggressive",
    executionMode: "paper",
  });

  assert.equal(unknownRequest.riskPreference, "balanced");
  assert.equal(blankRequest.riskPreference, "balanced");
  assert.equal(knownRequest.riskPreference, "aggressive");
});

test("aiGoalFormPrimaryActions makes analyze and validate the default submit path", () => {
  const actions = aiGoalFormPrimaryActions();

  assert.deepEqual(actions.primary, {
    kind: "analyze_and_validate",
    label: "分析并启动验证",
    submit: true,
  });
  assert.deepEqual(actions.secondary, {
    kind: "analyze_only",
    label: "只生成蓝图",
  });
  assert.equal(actions.goalRequired, false);
  assert.ok(actions.helperText.includes("自动回测"));
  assert.ok(actions.helperText.includes("目标可留空"));
  assert.ok(actions.helperText.includes("不会下单"));
});

test("aiGoalRequestFromFormState parses operator behavior and narrative constraints", () => {
  const request = aiGoalRequestFromFormState({
    goal: "寻找更适合我的 AI 辅助赚钱机会",
    symbolsText: "BTC, ETH",
    horizon: "1-4 weeks",
    riskPreference: "balanced",
    executionMode: "paper",
    behaviorText: "避免 FOMO 追涨\n连续亏损后暂停；避免 FOMO 追涨",
    narrativeText: "ETF 资金流, 监管消息\n社媒拥挤度",
    avoidText: "高杠杆\n数据缺口时执行; 主网自动下单",
  });

  assert.deepEqual(request.behaviorConstraints, ["避免 FOMO 追涨", "连续亏损后暂停"]);
  assert.deepEqual(request.marketNarrativeFocus, ["ETF 资金流", "监管消息", "社媒拥挤度"]);
  assert.deepEqual(request.avoidScenarios, ["高杠杆", "数据缺口时执行", "主网自动下单"]);
});

test("aiGoalRequestFromFormState adds default human and narrative constraints when blank", () => {
  const request = aiGoalRequestFromFormState({
    goal: "寻找更适合我的 AI 辅助赚钱机会",
    symbolsText: "BTC, ETH",
    horizon: "1-4 weeks",
    riskPreference: "balanced",
    executionMode: "paper",
  });

  assert.deepEqual(request.behaviorConstraints, AI_DEFAULT_BEHAVIOR_TEXT.split("\n"));
  assert.deepEqual(request.marketNarrativeFocus, AI_DEFAULT_NARRATIVE_TEXT.split("\n"));
  assert.deepEqual(request.avoidScenarios, AI_DEFAULT_AVOID_TEXT.split("\n"));
});

test("aiGoalComposerFromFormState enriches vague money goals safely", () => {
  const composer = aiGoalComposerFromFormState({
    state: {
      goal: "帮我赚钱",
      symbolsText: "",
      horizon: "",
      riskPreference: "aggressive",
      executionMode: "mainnet",
      behaviorText: "",
      narrativeText: "",
      avoidText: "",
    },
    runs: [{ symbols: ["ETH", "BTC"], goal: "old" }],
    now: new Date("2026-06-02T12:00:00.000Z"),
  });

  assert.equal(composer.stage, "needs_enrichment");
  assert.deepEqual(composer.primaryAction, {
    kind: "analyze_and_validate",
    label: "应用补全并验证",
  });
  assert.ok(composer.summary.includes("补全后直接启动验证"));
  assert.equal(composer.proposedFormState.symbolsText, "ETH, BTC");
  assert.equal(composer.proposedFormState.horizon, "24h-7d");
  assert.equal(composer.proposedFormState.riskPreference, "balanced");
  assert.equal(composer.proposedFormState.executionMode, "paper");
  assert.ok(composer.proposedFormState.goal.includes("市场风向"));
  assert.ok(composer.proposedFormState.goal.includes("人性偏差"));
  assert.ok(composer.proposedFormState.goal.includes("paper 验证"));
  assert.ok(composer.missing.some((item) => item.includes("目标")));
  assert.ok(composer.missing.some((item) => item.includes("周期")));
});

test("aiGoalExecutableFormStateFromState submits enriched vague goals", () => {
  const next = aiGoalExecutableFormStateFromState({
    state: {
      goal: "帮我赚钱",
      symbolsText: "",
      horizon: "",
      riskPreference: "aggressive",
      executionMode: "mainnet",
      behaviorText: "",
      narrativeText: "",
      avoidText: "",
    },
    runs: [{ symbols: ["SOL", "ETH"], goal: "old" }],
    now: new Date("2026-06-03T03:00:00.000Z"),
  });

  assert.equal(next.symbolsText, "SOL, ETH");
  assert.equal(next.horizon, "24h-7d");
  assert.equal(next.riskPreference, "balanced");
  assert.equal(next.executionMode, "paper");
  assert.ok(next.goal.includes("AI 自动补全赚钱目标"));
  assert.ok(next.goal.includes("市场风向"));
  assert.ok(next.goal.includes("新闻舆论"));
  assert.ok(next.goal.includes("人性偏差"));
  assert.ok(next.behaviorText.includes("FOMO"));
  assert.ok(next.narrativeText.includes("ETF"));
  assert.ok(next.avoidText.includes("主网自动下单"));
});

test("aiGoalAnalyzeTargetFormState enriches the current form when no explicit target is passed", () => {
  const next = aiGoalAnalyzeTargetFormState({
    state: {
      goal: "",
      symbolsText: "",
      horizon: "",
      riskPreference: "aggressive",
      executionMode: "mainnet",
      behaviorText: "",
      narrativeText: "",
      avoidText: "",
    },
    runs: [{ symbols: ["SOL"] }],
    now: new Date("2026-06-03T00:00:00.000Z"),
  });

  assert.ok(next.goal.includes("AI 自动补全赚钱目标"));
  assert.equal(next.symbolsText, "SOL");
  assert.equal(next.horizon, "24h-7d");
  assert.equal(next.riskPreference, "balanced");
  assert.equal(next.executionMode, "paper");
});

test("aiGoalAnalyzeTargetFormState preserves explicit panel targets", () => {
  const target = {
    goal: "复核 BTC 新闻风向后生成 paper 草案",
    symbolsText: "BTC",
    horizon: "3-10 days",
    riskPreference: "conservative",
    executionMode: "observe",
    behaviorText: "避免 FOMO",
    narrativeText: "ETF 资金流",
    avoidText: "主网下单",
  };

  assert.equal(
    aiGoalAnalyzeTargetFormState({
      state: { goal: "" },
      target,
      runs: [{ symbols: ["ETH"] }],
    }),
    target,
  );
});

test("aiGoalComposerFromFormState keeps detailed goals ready and caps execution mode", () => {
  const composer = aiGoalComposerFromFormState({
    state: {
      goal:
        "用较低回撤在未来 1-4 周寻找 BTC/ETH 的 AI 辅助机会，同时考虑新闻情绪、市场拥挤、链上变化和执行摩擦。",
      symbolsText: "BTC, ETH",
      horizon: "1-4 weeks",
      riskPreference: "balanced",
      executionMode: "mainnet",
      behaviorText: "",
      narrativeText: "",
      avoidText: "",
    },
  });

  assert.equal(composer.stage, "ready");
  assert.equal(composer.primaryAction.kind, "analyze_and_validate");
  assert.equal(composer.proposedFormState.executionMode, "paper");
  assert.ok(composer.proposedFormState.behaviorText.includes("FOMO"));
  assert.ok(composer.proposedFormState.narrativeText.includes("ETF"));
  assert.ok(composer.proposedFormState.avoidText.includes("主网自动下单"));
  assert.ok(composer.checks.some((item) => item.includes("人性")));
  assert.ok(composer.checks.some((item) => item.includes("风向")));
  assert.ok(composer.checks.some((item) => item.includes("禁止")));
});

test("parseStrategyPreset clamps unsafe values and falls back to usable defaults", () => {
  const parsed = parseStrategyPreset(
    new URLSearchParams({
      source: "ai-goal",
      name: "too-long-ai-name",
      kind: "unknown",
      execSymbol: "eth/usdt",
      positionLevel: "999",
      stopProfitRate: "-1",
      createPositions: JSON.stringify([{ marginRate: 5, lossAddRate: -2 }]),
    }),
  );

  assert.equal(parsed.name.length <= 8, true);
  assert.equal(parsed.kind, "grid_dca");
  assert.equal(parsed.execSymbol, "ETHUSDT");
  assert.equal(parsed.positionLevel, 125);
  assert.equal(parsed.stopProfitRate, 0.05);
  assert.deepEqual(parsed.createPositions, [{ marginRate: 1, lossAddRate: 0 }]);
});

test("backtestRequestFromDraft builds a safe 90 day validation request", () => {
  const request = backtestRequestFromDraft(
    {
      name: "btca",
      kind: "grid_dca",
      symbol: "BTC",
      params: {
        stopProfitRate: 0.04,
        stopLossRate: 0.08,
        createPositions: [{ marginRate: 1, lossAddRate: 0 }],
      },
    },
    new Date("2026-06-02T08:00:00Z"),
  );

  assert.deepEqual(request, {
    strategyId: "btca",
    kind: "grid_dca",
    params: {
      stopProfitRate: 0.04,
      stopLossRate: 0.08,
      createPositions: [{ marginRate: 1, lossAddRate: 0 }],
    },
    symbol: "BTCUSDT",
    exchange: "binance",
    timeframe: "1h",
    start: "2026-03-04T08:00:00.000Z",
    end: "2026-06-02T08:00:00.000Z",
    initialCapital: 10000,
    commissionRate: 0.0004,
    slippageBps: 1,
  });
});

test("backtestRequestFromDraft skips watch-only drafts", () => {
  assert.equal(
    backtestRequestFromDraft({ name: "watch", kind: "watch_only", symbol: "BTC" }),
    null,
  );
});

test("actionPlanFromAnalysis turns an AI result into operator tasks", () => {
  const plan = actionPlanFromAnalysis({
    context: { notes: ["timescale not configured"] },
    execution: {
      mode: "testnet",
      safetyGates: ["backtest", "mainnet token gate"],
    },
    strategyDrafts: [
      { name: "btca", kind: "grid_dca", symbol: "BTCUSDT", params: {} },
      { name: "watch", kind: "watch_only", symbol: "ETHUSDT", params: {} },
    ],
  });

  assert.deepEqual(
    plan.map((item) => [item.id, item.status, item.action]),
    [
      ["review", "manual", "review"],
      ["data", "blocked", "data"],
      ["sentiment_review", "manual", "sentiment_review"],
      ["backtest", "ready", "backtest"],
      ["strategy", "ready", "strategy"],
      ["paper_watch", "blocked", "paper_watch"],
      ["gate", "blocked", "gate"],
    ],
  );
  assert.equal(plan.find((item) => item.id === "backtest").targetDraftName, "btca");
  const paperWatch = plan.find((item) => item.id === "paper_watch");
  assert.equal(paperWatch.relatedId, "btca");
  assert.ok(paperWatch.detail.includes("24-72 小时"));
  assert.ok(paperWatch.detail.includes("舆论"));
  assert.ok(paperWatch.detail.includes("执行摩擦"));
  assert.ok(plan.find((item) => item.id === "gate").detail.includes("paper 复盘证据"));
});

test("actionPlanFromAnalysis marks backtest blocked when only watch drafts exist", () => {
  const plan = actionPlanFromAnalysis({
    context: { notes: [] },
    execution: { mode: "observe", safetyGates: [] },
    strategyDrafts: [{ name: "watch", kind: "watch_only", symbol: "BTCUSDT", params: {} }],
  });

  assert.equal(plan.find((item) => item.id === "data").status, "done");
  assert.equal(plan.find((item) => item.id === "backtest").status, "blocked");
  assert.equal(plan.find((item) => item.id === "strategy").status, "blocked");
  assert.equal(plan.some((item) => item.id === "paper_watch"), false);
  assert.equal(plan.find((item) => item.id === "gate").status, "blocked");
});

test("actionPlanFromAnalysis overlays persisted run action state", () => {
  const plan = actionPlanFromAnalysis(
    {
      context: { notes: [] },
      execution: { mode: "paper", safetyGates: [] },
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTCUSDT", params: {} }],
    },
    [
      {
        id: "backtest",
        status: "done",
        relatedId: "run_backtest_1",
        href: "/backtests/run_backtest_1",
        note: "已发起 AI 草案回测",
      },
    ],
  );

  const backtest = plan.find((item) => item.id === "backtest");
  assert.equal(backtest.status, "done");
  assert.equal(backtest.relatedId, "run_backtest_1");
  assert.equal(backtest.href, "/backtests/run_backtest_1");
  assert.equal(backtest.note, "已发起 AI 草案回测");
});

test("actionPlanFromAnalysis adds persisted paper watch to the operator queue", () => {
  const plan = actionPlanFromAnalysis(
    {
      context: { notes: [] },
      execution: { mode: "paper", safetyGates: [] },
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTCUSDT", params: {} }],
    },
    [
      {
        id: "paper_watch",
        status: "manual",
        relatedId: "btca",
        href: "/backtests/run_backtest_1",
        note: "观察 24-72 小时后再决定测试网。",
      },
    ],
  );

  const paperWatch = plan.find((item) => item.id === "paper_watch");

  assert.equal(plan.filter((item) => item.id === "paper_watch").length, 1);
  assert.equal(paperWatch.title, "Paper 观察与复盘");
  assert.equal(paperWatch.status, "manual");
  assert.equal(paperWatch.action, "paper_watch");
  assert.equal(paperWatch.href, "/backtests/run_backtest_1");
  assert.equal(paperWatch.relatedId, "btca");
});

test("actionPlanFromAnalysis reopens thin completed paper watch evidence", () => {
  const plan = actionPlanFromAnalysis(
    {
      context: { notes: [] },
      execution: { mode: "paper", safetyGates: [] },
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTCUSDT", params: {} }],
    },
    [
      {
        id: "paper_watch",
        status: "done",
        relatedId: "btca",
        href: "/backtests/run_backtest_1",
        note: "Paper 已完成",
      },
    ],
  );

  const paperWatch = plan.find((item) => item.id === "paper_watch");

  assert.equal(paperWatch.status, "manual");
  assert.equal(paperWatch.href, "/backtests/run_backtest_1");
  assert.ok(paperWatch.note.includes("证据不足"));
  assert.ok(paperWatch.note.includes("市场风向"));
  assert.ok(paperWatch.note.includes("执行摩擦"));
});

test("actionPlanFromAnalysis reopens thin completed sentiment review evidence", () => {
  const plan = actionPlanFromAnalysis(
    {
      context: { notes: [] },
      execution: { mode: "paper", safetyGates: [] },
      humanFactors: ["新闻热度过高，FOMO 追涨风险上升。"],
      watchSignals: [{ source: "human", signal: "社媒拥挤" }],
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTCUSDT", params: {} }],
    },
    [
      {
        id: "sentiment_review",
        status: "done",
        href: "/data-explorer/news",
        note: "风向 / 人性复核已完成。",
      },
    ],
  );

  const sentimentReview = plan.find((item) => item.id === "sentiment_review");

  assert.equal(sentimentReview.status, "manual");
  assert.equal(sentimentReview.href, "/data-explorer/news");
  assert.ok(sentimentReview.note.includes("证据不足"));
  assert.ok(sentimentReview.note.includes("市场风向"));
  assert.ok(sentimentReview.note.includes("舆论"));
  assert.ok(sentimentReview.note.includes("人性偏差"));
});

test("actionPlanFromAnalysis turns watch signal interpretation into a concrete review task", () => {
  const plan = actionPlanFromAnalysis({
    context: { notes: [], newsCount: 2, macroCount: 1, onchainCount: 1 },
    execution: { mode: "paper", safetyGates: [] },
    humanFactors: [],
    watchSignals: [
      {
        source: "news",
        signal: "ETF inflows accelerate",
        interpretation: "资金流改善但社媒拥挤",
        action: "只允许 paper 观察，不追涨加仓",
      },
    ],
    strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTCUSDT", params: {} }],
  });

  const sentimentReview = plan.find((item) => item.id === "sentiment_review");

  assert.equal(sentimentReview.status, "manual");
  assert.ok(sentimentReview.detail.includes("ETF inflows accelerate"));
  assert.ok(sentimentReview.detail.includes("资金流改善"));
  assert.ok(sentimentReview.detail.includes("只允许 paper"));
});

test("defaultAIGoalRunActionsFromAnalysis mirrors backend seeded actions", () => {
  const actions = defaultAIGoalRunActionsFromAnalysis(
    {
      context: { notes: ["news empty"], symbols: ["BTC"] },
      humanFactors: ["FOMO 追涨风险"],
      watchSignals: [],
      execution: { mode: "testnet" },
      strategyDrafts: [
        { name: "watch", kind: "watch_only", symbol: "ETHUSDT" },
        { name: "btca", kind: "grid_dca", symbol: "BTCUSDT" },
      ],
    },
    new Date("2026-06-03T02:30:00.000Z"),
  );

  assert.deepEqual(
    actions.map((action) => [action.id, action.status, action.relatedId || ""]),
    [
      ["review", "manual", ""],
      ["data", "blocked", ""],
      ["sentiment_review", "manual", ""],
      ["backtest", "ready", "btca"],
      ["strategy", "ready", "btca"],
      ["paper_watch", "blocked", "btca"],
      ["gate", "blocked", ""],
    ],
  );
  assert.equal(
    actions.every((action) => action.updatedAt === "2026-06-03T02:30:00.000Z"),
    true,
  );
  assert.ok(actions.find((action) => action.id === "data").note.includes("news empty"));
  assert.ok(
    actions.find((action) => action.id === "sentiment_review").note.includes("FOMO"),
  );
  const paperWatch = actions.find((action) => action.id === "paper_watch");
  assert.ok(paperWatch.note.includes("24-72 小时"));
  assert.ok(paperWatch.note.includes("市场风向"));
  assert.ok(paperWatch.note.includes("舆论"));
  assert.ok(paperWatch.note.includes("人性偏差"));
  assert.ok(paperWatch.note.includes("执行摩擦"));
  assert.ok(actions.find((action) => action.id === "gate").note.includes("paper 复盘证据"));
});

test("defaultAIGoalRunActionsFromAnalysis records watch signal interpretation and action", () => {
  const actions = defaultAIGoalRunActionsFromAnalysis(
    {
      context: { notes: [], symbols: ["BTC"] },
      humanFactors: [],
      watchSignals: [
        {
          source: "news",
          signal: "ETF inflows accelerate",
          interpretation: "资金流改善但社媒拥挤",
          action: "只允许 paper 观察，不追涨加仓",
        },
      ],
      execution: { mode: "paper" },
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTCUSDT" }],
    },
    new Date("2026-06-03T02:30:00.000Z"),
  );

  const sentimentReview = actions.find((action) => action.id === "sentiment_review");

  assert.equal(sentimentReview.status, "manual");
  assert.ok(sentimentReview.note.includes("ETF inflows accelerate"));
  assert.ok(sentimentReview.note.includes("资金流改善"));
  assert.ok(sentimentReview.note.includes("只允许 paper"));
});

test("defaultAIGoalRunActionsFromAnalysis blocks execution when only watch drafts exist", () => {
  const actions = defaultAIGoalRunActionsFromAnalysis(
    {
      context: { notes: [] },
      humanFactors: [],
      watchSignals: [],
      execution: { mode: "observe" },
      strategyDrafts: [{ name: "watch", kind: "watch_only", symbol: "BTCUSDT" }],
    },
    new Date("2026-06-03T02:31:00.000Z"),
  );

  assert.equal(actions.find((action) => action.id === "data").status, "done");
  assert.equal(actions.find((action) => action.id === "sentiment_review").status, "done");
  assert.equal(actions.find((action) => action.id === "backtest").status, "blocked");
  assert.equal(actions.find((action) => action.id === "strategy").status, "blocked");
  assert.equal(actions.some((action) => action.id === "paper_watch"), false);
  assert.equal(actions.find((action) => action.id === "gate").status, "blocked");
});

test("runnableBacktestRequestsFromAnalysis returns deduped runnable AI drafts", () => {
  const requests = runnableBacktestRequestsFromAnalysis(
    {
      strategyDrafts: [
        { name: "btca", kind: "grid_dca", symbol: "BTC", params: { stopProfitRate: 0.04 } },
        { name: "watch", kind: "watch_only", symbol: "ETH", params: {} },
        { name: "btca", kind: "grid_dca", symbol: "BTCUSDT", params: { stopProfitRate: 0.05 } },
        { name: "etha", kind: "grid_dca", symbol: "ETH", params: { positionLevel: 2 } },
      ],
    },
    new Date("2026-06-02T08:00:00Z"),
  );

  assert.deepEqual(
    requests.map((item) => [item.draft.name, item.request.strategyId, item.request.symbol]),
    [
      ["btca", "btca", "BTCUSDT"],
      ["etha", "etha", "ETHUSDT"],
    ],
  );
  assert.equal(requests[0].request.start, "2026-03-04T08:00:00.000Z");
  assert.equal(requests[0].request.params.stopProfitRate, 0.04);
});

test("autoValidationPlanFromAnalysis prepares a safe AI validation batch", () => {
  const plan = autoValidationPlanFromAnalysis(
    {
      strategyDrafts: [
        { name: "btca", kind: "grid_dca", symbol: "BTC", params: {} },
        { name: "watch", kind: "watch_only", symbol: "ETH", params: {} },
        { name: "etha", kind: "grid_dca", symbol: "ETHUSDT", params: {} },
      ],
    },
    new Date("2026-06-02T08:00:00Z"),
  );

  assert.equal(plan.status, "ready");
  assert.equal(plan.runnableCount, 2);
  assert.equal(plan.activityLabel, "AI 安全验证 - 2 个草案");
  assert.equal(plan.activityDetail, "BTCUSDT, ETHUSDT");
  assert.equal(plan.actionNote, "待发起 2 个 AI 草案回测：btca、etha");
  assert.ok(plan.coverage.some((item) => item.includes("BTCUSDT") && item.includes("ETHUSDT")));
  assert.ok(plan.coverage.some((item) => item.includes("90 天") && item.includes("1h")));
  assert.ok(plan.guardrails.some((item) => item.includes("不会下单")));
  assert.ok(plan.guardrails.some((item) => item.includes("主网")));
  assert.deepEqual(plan.skippedDrafts, [
    {
      name: "watch",
      kind: "watch_only",
      symbol: "ETH",
      reason: "观察型草案不会进入自动回测。",
    },
  ]);
  assert.deepEqual(
    plan.items.map((item) => [item.draft.name, item.request.symbol]),
    [
      ["btca", "BTCUSDT"],
      ["etha", "ETHUSDT"],
    ],
  );
});

test("backtestActionUpdateFromValidationResult records started validation runs", () => {
  const plan = autoValidationPlanFromAnalysis({
    strategyDrafts: [
      { name: "btca", kind: "grid_dca", symbol: "BTC", params: {} },
      { name: "etha", kind: "grid_dca", symbol: "ETH", params: {} },
    ],
  });

  const update = backtestActionUpdateFromValidationResult(plan, [
    { runId: "run_btc_1" },
    { runId: "run_eth_2" },
  ]);

  assert.deepEqual(update, {
    status: "done",
    relatedId: "run_btc_1,run_eth_2",
    href: "/backtests/run_btc_1",
    note: "已发起 2 个 AI 草案回测：btca、etha",
  });
});

test("actionPlanFromAnalysis presents started backtests as validation progress", () => {
  const items = actionPlanFromAnalysis(
    {
      context: { notes: [], newsCount: 4, macroCount: 1, onchainCount: 1 },
      humanFactors: [],
      watchSignals: [],
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
    },
    [
      {
        id: "backtest",
        status: "done",
        relatedId: "run_btc_1",
        href: "/backtests/run_btc_1",
        note: "已发起 1 个 AI 草案回测：btca",
      },
    ],
  );

  const backtest = items.find((item) => item.id === "backtest");

  assert.equal(backtest.status, "done");
  assert.equal(backtest.statusLabel, "验证中");
  assert.equal(backtest.hrefLabel, "查看进度");
  assert.equal(backtest.href, "/backtests/run_btc_1");
});

test("optimisticValidationRunsFromHandles exposes pending AI validation runs immediately", () => {
  const plan = autoValidationPlanFromAnalysis(
    {
      strategyDrafts: [
        { name: "btca", kind: "grid_dca", symbol: "BTC", params: { stopProfitRate: 0.04 } },
        { name: "etha", kind: "grid_dca", symbol: "ETH", params: { positionLevel: 2 } },
      ],
    },
    new Date("2026-06-03T02:47:00.000Z"),
  );

  const rows = optimisticValidationRunsFromHandles(
    plan,
    [
      { runId: "run_btc_1", enqueuedAt: "2026-06-03T02:48:00.000Z" },
      { runId: "run_eth_2", enqueuedAt: "2026-06-03T02:48:01.000Z" },
    ],
    new Date("2026-06-03T02:49:00.000Z"),
  );

  assert.deepEqual(
    rows.map((row) => [row.runId, row.strategyId, row.state, row.progress, row.request.symbol]),
    [
      ["run_btc_1", "btca", 1, 0, "BTCUSDT"],
      ["run_eth_2", "etha", 1, 0, "ETHUSDT"],
    ],
  );
  assert.equal(rows[0].createdAt, "2026-06-03T02:48:00.000Z");
  assert.deepEqual(rows[0].metrics, {});
  assert.deepEqual(rows[0].trades, []);
});

test("autoValidationPlanFromAnalysis blocks when AI only returns watch drafts", () => {
  const plan = autoValidationPlanFromAnalysis({
    strategyDrafts: [{ name: "watch", kind: "watch_only", symbol: "BTC", params: {} }],
  });

  assert.equal(plan.status, "blocked");
  assert.equal(plan.runnableCount, 0);
  assert.equal(plan.activityDetail, "no runnable drafts");
  assert.equal(
    plan.actionNote,
    "没有可回测的 AI 草案；需要先调整目标或生成新的策略蓝图。",
  );
});

test("aiStrategyShortlistFromState queues runnable drafts before watch-only drafts", () => {
  const shortlist = aiStrategyShortlistFromState({
    analysis: {
      strategyDrafts: [
        { name: "btca", kind: "grid_dca", symbol: "BTC", params: {} },
        { name: "watch", kind: "watch_only", symbol: "ETH", params: {} },
      ],
    },
  });

  assert.equal(shortlist.stage, "validate_ready");
  assert.deepEqual(shortlist.primaryAction, {
    kind: "run_all_backtests",
    label: "验证全部短名单",
  });
  assert.deepEqual(
    shortlist.items.map((item) => [item.draftName, item.stage, item.actionKind]),
    [
      ["btca", "validate_ready", "run_backtest"],
      ["watch", "observe_only", "open_link"],
    ],
  );
  assert.equal(shortlist.items[0].strategyHref.startsWith("/option?source=ai-goal"), true);
  assert.ok(shortlist.guardrails.some((item) => item.includes("不会下单")));
});

test("aiStrategyShortlistFromState promotes the best validated paper candidate", () => {
  const shortlist = aiStrategyShortlistFromState({
    analysis: {
      strategyDrafts: [
        { name: "btca", kind: "grid_dca", symbol: "BTC", params: {} },
        { name: "etha", kind: "grid_dca", symbol: "ETH", params: {} },
      ],
    },
    validationRuns: [
      {
        runId: "run_eth",
        strategyId: "etha",
        state: 3,
        metrics: { total_return: -0.02, sharpe: 0.2, max_dd: -0.2, n_trades: 6 },
      },
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
  });

  assert.equal(shortlist.stage, "paper_candidate");
  assert.equal(shortlist.items[0].draftName, "btca");
  assert.equal(shortlist.items[0].stage, "paper_candidate");
  assert.equal(shortlist.items[0].actionKind, "accept_paper_candidate");
  assert.equal(shortlist.items[0].backtestHref, "/backtests/run_btc");
  assert.equal(shortlist.items[1].draftName, "etha");
  assert.equal(shortlist.items[1].stage, "rejected");
  assert.ok(shortlist.items[1].blockers.some((item) => item.includes("未达到 paper")));
});

test("aiStrategyShortlistFromState marks running validations as validating", () => {
  const shortlist = aiStrategyShortlistFromState({
    analysis: {
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
    },
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 2,
        progress: 0.4,
        metrics: {},
      },
    ],
  });

  assert.equal(shortlist.stage, "validating");
  assert.equal(shortlist.items[0].stage, "validating");
  assert.equal(shortlist.items[0].actionKind, "open_link");
  assert.equal(shortlist.items[0].href, "/backtests/run_btc");
  assert.ok(shortlist.nextChecks.some((item) => item.includes("自动刷新")));
});

test("aiOperatorRhythmFromState asks for a scan when no analysis is active", () => {
  const rhythm = aiOperatorRhythmFromState({
    dailyRadarStatus: {
      stage: "empty",
      primaryAction: { kind: "scan_today", label: "启动今日扫描" },
    },
  });

  assert.equal(rhythm.stage, "scan_due");
  assert.equal(rhythm.primaryAction.kind, "scan_today");
  assert.equal(rhythm.cadence, "先扫描");
  assert.ok(rhythm.summary.includes("市场"));
  assert.ok(rhythm.guardrails.some((item) => item.includes("不会下单")));
});

test("aiOperatorRhythmFromState sends blocked idle provider rhythm to AI settings", () => {
  const providerGate = aiProviderReadinessGateFromStatus({
    status: "blocked",
    providerLabel: "OpenAI",
    keyConfigured: false,
    primaryHref: "/settings/ai",
    primaryAction: { kind: "open_link", label: "配置真实 AI" },
    summary: "当前启用 OpenAI，但 API key 未配置。",
  });
  const rhythm = aiOperatorRhythmFromState({
    dailyRadarStatus: {
      stage: "empty",
      primaryAction: { kind: "scan_today", label: "启动今日扫描" },
    },
    providerGate,
  });

  assert.equal(rhythm.stage, "provider_blocked");
  assert.deepEqual(rhythm.primaryAction, {
    kind: "open_link",
    label: "配置真实 AI",
    href: "/settings/ai",
  });
  assert.equal(rhythm.cadence, "先配置");
  assert.ok(rhythm.summary.includes("OpenAI"));
  assert.ok(rhythm.checks.some((item) => item.includes("provider")));
  assert.ok(rhythm.guardrails.some((item) => item.includes("provider")));
});

test("aiOperatorRhythmFromState waits while idle provider status is loading", () => {
  const providerGate = aiProviderReadinessGateFromStatus(null, { loading: true });
  const rhythm = aiOperatorRhythmFromState({
    dailyRadarStatus: {
      stage: "empty",
      primaryAction: { kind: "scan_today", label: "启动今日扫描" },
    },
    providerGate,
  });

  assert.equal(rhythm.stage, "provider_loading");
  assert.ok(rhythm.title.includes("确认 AI provider"));
  assert.deepEqual(rhythm.primaryAction, {
    kind: "open_link",
    label: "查看 AI 配置",
    href: "/settings/ai",
  });
  assert.equal(rhythm.cadence, "等待 provider");
});

test("aiOperatorRhythmFromState keeps idle scan rhythm when provider is ready", () => {
  const providerGate = aiProviderReadinessGateFromStatus({
    status: "ready",
    providerLabel: "OpenAI",
    keyConfigured: true,
  });
  const rhythm = aiOperatorRhythmFromState({
    dailyRadarStatus: {
      stage: "empty",
      primaryAction: { kind: "scan_today", label: "启动今日扫描" },
    },
    providerGate,
  });

  assert.equal(rhythm.stage, "scan_due");
  assert.equal(rhythm.primaryAction.kind, "scan_today");
  assert.equal(rhythm.cadence, "先扫描");
});

test("aiOperatorRhythmFromState refreshes stale active analysis before reuse", () => {
  const rhythm = aiOperatorRhythmFromState({
    analysis: {
      id: "run_old",
      createdAt: "2026-06-03T00:00:00.000Z",
      context: { newsCount: 2, macroCount: 1, onchainCount: 1, notes: [] },
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
      watchSignals: [],
      humanFactors: [],
      execution: { mode: "paper", safetyGates: [] },
    },
    dailyRadarStatus: { stage: "stale" },
    now: new Date("2026-06-03T08:30:00.000Z"),
  });

  assert.equal(rhythm.stage, "refresh_due");
  assert.deepEqual(rhythm.primaryAction, {
    kind: "refresh_run",
    label: "重新扫描当前运行",
    runId: "run_old",
    href: "/ai-money?runId=run_old",
  });
  assert.ok(rhythm.checks.some((item) => item.includes("8.5 小时")));
});

test("aiOperatorRhythmFromState slows down heated paper candidates before adoption", () => {
  const rhythm = aiOperatorRhythmFromState({
    analysis: {
      id: "run_hot",
      createdAt: "2026-06-03T08:00:00.000Z",
      context: { newsCount: 4, macroCount: 1, onchainCount: 2, notes: [] },
      humanFactors: ["FOMO 追涨风险上升"],
      watchSignals: [{ signal: "社媒热度过热", source: "news", interpretation: "叙事拥挤", action: "降速" }],
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
      execution: { mode: "paper", safetyGates: [] },
    },
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
    now: new Date("2026-06-03T09:00:00.000Z"),
  });

  assert.equal(rhythm.stage, "slow_down");
  assert.equal(rhythm.primaryAction.kind, "open_link");
  assert.equal(rhythm.primaryAction.href, "/data-explorer/news");
  assert.ok(rhythm.summary.includes("人性"));
  assert.ok(rhythm.guardrails.some((item) => item.includes("paper")));
});

test("aiOperatorRhythmFromState keeps thin sentiment review in slow down cadence", () => {
  const rhythm = aiOperatorRhythmFromState({
    analysis: {
      id: "run_hot",
      createdAt: "2026-06-03T08:00:00.000Z",
      context: { newsCount: 4, macroCount: 1, onchainCount: 2, notes: [] },
      humanFactors: ["FOMO 追涨风险上升"],
      watchSignals: [{ signal: "社媒热度过热", source: "news", interpretation: "叙事拥挤", action: "降速" }],
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
      execution: { mode: "paper", safetyGates: [] },
    },
    persistedActions: [{ id: "sentiment_review", status: "done", note: "风向 / 人性复核已完成。" }],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
    now: new Date("2026-06-03T09:00:00.000Z"),
  });

  assert.equal(rhythm.stage, "slow_down");
  assert.equal(rhythm.primaryAction.kind, "open_link");
  assert.equal(rhythm.primaryAction.href, "/data-explorer/news");
  assert.ok(rhythm.summary.includes("人性"));
  assert.ok(rhythm.checks.some((item) => item.includes("FOMO")));
});

test("aiOperatorRhythmFromState keeps adopted paper candidates in observation rhythm", () => {
  const rhythm = aiOperatorRhythmFromState({
    analysis: {
      id: "run_paper",
      createdAt: "2026-06-03T08:00:00.000Z",
      context: { newsCount: 3, macroCount: 1, onchainCount: 1, notes: [] },
      humanFactors: [],
      watchSignals: [],
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
      execution: { mode: "paper", safetyGates: [] },
    },
    persistedActions: [
      {
        id: "paper_watch",
        status: "manual",
        relatedId: "btca",
        href: "/backtests/run_btc",
        note: "按 AI 观察计划跟踪 24-72 小时。",
        updatedAt: "2026-06-03T08:30:00.000Z",
      },
    ],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
    now: new Date("2026-06-03T09:00:00.000Z"),
  });

  assert.equal(rhythm.stage, "paper_watch");
  assert.equal(rhythm.cadence, "观察 24-72h");
  assert.equal(rhythm.primaryAction.kind, "open_link");
  assert.equal(rhythm.primaryAction.href, "/backtests/run_btc");
  assert.ok(rhythm.checks.some((item) => item.includes("记录")));
});

test("aiOperatorRhythmFromState keeps thin completed paper watch in evidence review", () => {
  const rhythm = aiOperatorRhythmFromState({
    analysis: {
      id: "run_paper",
      createdAt: "2026-06-03T08:00:00.000Z",
      context: { newsCount: 3, macroCount: 0, onchainCount: 0, notes: [] },
      humanFactors: [],
      watchSignals: [],
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
      execution: { mode: "testnet", safetyGates: ["paper review evidence"] },
    },
    persistedActions: [
      {
        id: "paper_watch",
        status: "done",
        relatedId: "btca",
        href: "/backtests/run_btc",
        note: "Paper 已完成",
        updatedAt: "2026-06-03T08:30:00.000Z",
      },
    ],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
    now: new Date("2026-06-03T09:00:00.000Z"),
  });

  assert.equal(rhythm.stage, "paper_watch");
  assert.equal(rhythm.tone, "warning");
  assert.ok(rhythm.title.includes("补齐"));
  assert.ok(rhythm.summary.includes("复盘证据不足"));
  assert.ok(rhythm.checks.some((item) => item.includes("市场风向")));
});

test("aiDelegationRunbookFromState starts idle users with an AI-first handoff", () => {
  const runbook = aiDelegationRunbookFromState();

  assert.equal(runbook.stage, "handoff");
  assert.equal(runbook.primaryAction.kind, "scan_today");
  assert.ok(runbook.aiSteps.some((item) => item.title.includes("扫描")));
  assert.ok(runbook.humanSteps.some((item) => item.title.includes("目标")));
  assert.ok(runbook.guardrails.some((item) => item.includes("不会下单")));
});

test("aiDelegationRunbookFromState sends blocked idle provider runbook to AI settings", () => {
  const providerGate = aiProviderReadinessGateFromStatus({
    status: "blocked",
    providerLabel: "OpenAI",
    keyConfigured: false,
    primaryHref: "/settings/ai",
    primaryAction: { kind: "open_link", label: "配置真实 AI" },
    summary: "当前启用 OpenAI，但 API key 未配置。",
  });
  const runbook = aiDelegationRunbookFromState({ providerGate });

  assert.equal(runbook.stage, "provider_blocked");
  assert.deepEqual(runbook.primaryAction, {
    kind: "open_link",
    label: "配置真实 AI",
    href: "/settings/ai",
  });
  assert.ok(runbook.decision.includes("OpenAI"));
  assert.equal(runbook.aiSteps.some((item) => item.title.includes("扫描") && item.status === "ready"), false);
  assert.ok(runbook.humanSteps.some((item) => item.title.includes("配置真实 AI")));
  assert.ok(runbook.guardrails.some((item) => item.includes("provider")));
});

test("aiDelegationRunbookFromState waits while idle provider status is loading", () => {
  const providerGate = aiProviderReadinessGateFromStatus(null, { loading: true });
  const runbook = aiDelegationRunbookFromState({ providerGate });

  assert.equal(runbook.stage, "provider_loading");
  assert.ok(runbook.title.includes("确认 AI provider"));
  assert.deepEqual(runbook.primaryAction, {
    kind: "open_link",
    label: "查看 AI 配置",
    href: "/settings/ai",
  });
  assert.ok(runbook.humanSteps.some((item) => item.title.includes("等待 provider")));
});

test("aiDelegationRunbookFromState keeps idle AI handoff when provider is ready", () => {
  const providerGate = aiProviderReadinessGateFromStatus({
    status: "ready",
    providerLabel: "OpenAI",
    keyConfigured: true,
  });
  const runbook = aiDelegationRunbookFromState({ providerGate });

  assert.equal(runbook.stage, "handoff");
  assert.equal(runbook.primaryAction.kind, "scan_today");
  assert.ok(runbook.aiSteps.some((item) => item.title.includes("扫描")));
});

test("aiDelegationRunbookFromState delegates runnable drafts to AI validation", () => {
  const runbook = aiDelegationRunbookFromState({
    analysis: {
      id: "run_validate",
      context: { notes: [], newsCount: 4, macroCount: 1, onchainCount: 1 },
      strategyDrafts: [
        { name: "btca", kind: "grid_dca", symbol: "BTC", params: {} },
        { name: "watch", kind: "watch_only", symbol: "ETH", params: {} },
      ],
      watchSignals: [],
      humanFactors: [],
      execution: { mode: "paper", safetyGates: [] },
    },
    validationRuns: [],
  });

  assert.equal(runbook.stage, "ai_validate");
  assert.equal(runbook.primaryAction.kind, "run_all_backtests");
  assert.ok(runbook.aiSteps.some((item) => item.detail.includes("1 个")));
  assert.ok(runbook.decision.includes("回测"));
});

test("aiDelegationRunbookFromState keeps hot candidates at human review", () => {
  const runbook = aiDelegationRunbookFromState({
    analysis: {
      id: "run_hot",
      context: { notes: [], newsCount: 4, macroCount: 1, onchainCount: 2 },
      humanFactors: ["FOMO 追涨风险上升"],
      watchSignals: [{ signal: "社媒热度过热", source: "news", interpretation: "叙事拥挤", action: "降速" }],
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
      execution: { mode: "paper", safetyGates: [] },
    },
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
  });

  assert.equal(runbook.stage, "human_review");
  assert.equal(runbook.primaryAction.kind, "open_link");
  assert.ok(runbook.humanSteps.some((item) => item.detail.includes("FOMO")));
  assert.ok(runbook.guardrails.some((item) => item.includes("paper")));
});

test("aiDelegationRunbookFromState keeps thin sentiment review at human review", () => {
  const runbook = aiDelegationRunbookFromState({
    analysis: {
      id: "run_hot",
      context: { notes: [], newsCount: 4, macroCount: 1, onchainCount: 2 },
      humanFactors: ["FOMO 追涨风险上升"],
      watchSignals: [{ signal: "社媒热度过热", source: "news", interpretation: "叙事拥挤", action: "降速" }],
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
      execution: { mode: "paper", safetyGates: [] },
    },
    persistedActions: [{ id: "sentiment_review", status: "done", note: "风向 / 人性复核已完成。" }],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
  });

  assert.equal(runbook.stage, "human_review");
  assert.equal(runbook.primaryAction.kind, "open_link");
  assert.ok(runbook.guardrails.some((item) => item.includes("风向 / 人性复核")));
});

test("aiDelegationRunbookFromState hands clean candidates to paper adoption", () => {
  const runbook = aiDelegationRunbookFromState({
    analysis: {
      id: "run_clean",
      context: { notes: [], newsCount: 4, macroCount: 1, onchainCount: 2 },
      humanFactors: [],
      watchSignals: [],
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
      execution: { mode: "paper", safetyGates: ["组合限额已配置"] },
    },
    persistedActions: [{ id: "sentiment_review", status: "done", updatedAt: "2026-06-03T08:00:00.000Z" }],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
  });

  assert.equal(runbook.stage, "paper_handoff");
  assert.equal(runbook.primaryAction.kind, "accept_paper_candidate");
  assert.ok(runbook.aiSteps.some((item) => item.title.includes("paper")));
  assert.ok(runbook.humanSteps.some((item) => item.title.includes("采用")));
});

test("aiDelegationRunbookFromState keeps thin completed paper watch at review", () => {
  const runbook = aiDelegationRunbookFromState({
    analysis: {
      id: "run_clean",
      context: { notes: [], newsCount: 4, macroCount: 0, onchainCount: 0 },
      humanFactors: [],
      watchSignals: [],
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
      execution: { mode: "testnet", safetyGates: ["paper review evidence"] },
    },
    persistedActions: [
      {
        id: "paper_watch",
        status: "done",
        href: "/backtests/run_btc",
        note: "Paper 已完成",
      },
    ],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
  });

  assert.equal(runbook.stage, "paper_review");
  assert.equal(runbook.tone, "warning");
  assert.equal(runbook.primaryAction.kind, "open_link");
  assert.equal(runbook.primaryAction.href, "/backtests/run_btc");
  assert.ok(runbook.decision.includes("复盘证据不足"));
  assert.ok(runbook.humanSteps.some((item) => item.detail.includes("市场风向")));
});

test("aiThesisInvalidationFromState waits for an AI thesis before trading", () => {
  const invalidation = aiThesisInvalidationFromState();

  assert.equal(invalidation.stage, "needs_thesis");
  assert.deepEqual(invalidation.primaryAction, {
    kind: "scan_today",
    label: "先生成 AI 论点",
  });
  assert.ok(invalidation.guardrails.some((item) => item.includes("不能交易")));
  assert.ok(invalidation.invalidators.some((item) => item.includes("还没有")));
});

test("aiThesisInvalidationFromState treats data gaps as invalidators", () => {
  const invalidation = aiThesisInvalidationFromState({
    analysis: {
      id: "run_gap",
      context: {
        notes: ["缺少最新新闻", "缺少链上数据"],
        newsCount: 0,
        macroCount: 0,
        onchainCount: 0,
      },
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
      watchSignals: [],
      humanFactors: [],
      execution: { mode: "paper", safetyGates: [] },
    },
    validationRuns: [],
  });

  assert.equal(invalidation.stage, "data_gap");
  assert.equal(invalidation.primaryAction.kind, "open_link");
  assert.equal(invalidation.primaryAction.href, "/data-explorer/news");
  assert.ok(invalidation.invalidators.some((item) => item.includes("缺少最新新闻")));
  assert.ok(invalidation.stopRules.some((item) => item.includes("补齐")));
});

test("aiThesisInvalidationFromState rejects weak completed validations", () => {
  const invalidation = aiThesisInvalidationFromState({
    analysis: {
      id: "run_weak",
      context: { notes: [], newsCount: 2, macroCount: 1, onchainCount: 1 },
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
      watchSignals: [],
      humanFactors: [],
      execution: { mode: "paper", safetyGates: [] },
    },
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: -0.03, sharpe: 0.1, max_dd: -0.18, n_trades: 8 },
      },
    ],
  });

  assert.equal(invalidation.stage, "invalidated_by_backtest");
  assert.equal(invalidation.primaryAction.kind, "scan_today");
  assert.ok(invalidation.invalidators.some((item) => item.includes("淘汰")));
  assert.ok(invalidation.stopRules.some((item) => item.includes("不进入 paper")));
});

test("aiThesisInvalidationFromState pressure-tests hot paper candidates", () => {
  const invalidation = aiThesisInvalidationFromState({
    analysis: {
      id: "run_hot",
      context: { notes: [], newsCount: 4, macroCount: 1, onchainCount: 2 },
      humanFactors: ["FOMO 追涨风险上升"],
      watchSignals: [{ signal: "社媒热度过热", source: "news", interpretation: "叙事拥挤", action: "降低推进速度" }],
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
      execution: { mode: "paper", safetyGates: [] },
    },
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
  });

  assert.equal(invalidation.stage, "pressure_test");
  assert.equal(invalidation.primaryAction.kind, "open_link");
  assert.equal(invalidation.primaryAction.href, "/data-explorer/news");
  assert.ok(invalidation.invalidators.some((item) => item.includes("FOMO")));
  assert.ok(invalidation.stopRules.some((item) => item.includes("paper")));
});

test("aiThesisInvalidationFromState keeps thin sentiment review in pressure test", () => {
  const invalidation = aiThesisInvalidationFromState({
    analysis: {
      id: "run_hot",
      context: { notes: [], newsCount: 4, macroCount: 1, onchainCount: 2 },
      humanFactors: ["FOMO 追涨风险上升"],
      watchSignals: [{ signal: "社媒热度过热", source: "news", interpretation: "叙事拥挤", action: "降低推进速度" }],
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
      execution: { mode: "paper", safetyGates: [] },
    },
    persistedActions: [{ id: "sentiment_review", status: "done", note: "风向 / 人性复核已完成。" }],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
  });

  assert.equal(invalidation.stage, "pressure_test");
  assert.equal(invalidation.primaryAction.kind, "open_link");
  assert.equal(invalidation.primaryAction.href, "/data-explorer/news");
  assert.ok(invalidation.stopRules.some((item) => item.includes("paper")));
});

test("aiThesisInvalidationFromState watches a clean paper candidate", () => {
  const invalidation = aiThesisInvalidationFromState({
    analysis: {
      id: "run_clean",
      context: { notes: [], newsCount: 3, macroCount: 1, onchainCount: 1 },
      humanFactors: [],
      watchSignals: [{ signal: "成交量温和放大", source: "market", interpretation: "趋势延续", action: "继续观察" }],
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
      execution: { mode: "paper", safetyGates: ["组合限额已配置"] },
    },
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
    persistedActions: [{ id: "sentiment_review", status: "done", updatedAt: "2026-06-03T08:00:00.000Z" }],
  });

  assert.equal(invalidation.stage, "watch_thesis");
  assert.equal(invalidation.primaryAction.kind, "open_link");
  assert.equal(invalidation.primaryAction.href, "/backtests/run_btc");
  assert.ok(invalidation.monitors.some((item) => item.includes("成交量")));
  assert.ok(invalidation.stopRules.some((item) => item.includes("最大回撤")));
});

test("opportunityRadarFromState starts idle users with a safe AI radar action", () => {
  const radar = opportunityRadarFromState({
    runs: [
      {
        id: "run_old",
        goal: "旧目标",
        createdAt: "2026-06-02T06:00:00.000Z",
        symbols: ["BTC"],
        strategyDraftCount: 2,
      },
    ],
  });

  assert.equal(radar.stage, "idle");
  assert.equal(radar.title, "启动 AI 机会雷达");
  assert.equal(radar.tone, "warning");
  assert.equal(radar.primaryAction.kind, "analyze_and_validate");
  assert.equal(radar.metrics.find((item) => item.label === "最近运行").value, 1);
  assert.equal(radar.summary.includes("最近一次"), true);
});

test("opportunityRadarFromState promotes AI validation as the first visible step", () => {
  const radar = opportunityRadarFromState({
    analysis: {
      context: {
        symbols: ["BTC", "ETH"],
        newsCount: 4,
        macroCount: 1,
        onchainCount: 3,
        notes: [],
      },
      execution: { mode: "paper", safetyGates: [] },
      strategyDrafts: [
        { name: "btca", kind: "grid_dca", symbol: "BTC", params: {} },
        { name: "watch", kind: "watch_only", symbol: "ETH", params: {} },
      ],
    },
    persistedActions: [],
    validationRuns: [],
  });

  assert.equal(radar.stage, "backtest");
  assert.equal(radar.title, "先验证 AI 草案");
  assert.equal(radar.primaryAction.kind, "run_all_backtests");
  assert.deepEqual(
    radar.metrics.map((item) => [item.label, item.value]),
    [
      ["上下文", "4 / 1 / 3"],
      ["验证", "1 待测"],
      ["AI 蓝图", 2],
    ],
  );
  assert.equal(radar.reasons[0], "1 个草案可进入回测");
});

test("dailyRadarFormStateFromRuns creates a safe one-click daily scan goal", () => {
  const form = dailyRadarFormStateFromRuns(
    [
      { symbols: ["DOGE", "BTC"], goal: "旧目标" },
      { symbols: ["SOL", "ETH", "DOGE"] },
    ],
    new Date("2026-06-02T09:30:00+08:00"),
  );

  assert.equal(form.symbolsText, "BTC, ETH, SOL, DOGE");
  assert.equal(form.horizon, "24h-7d");
  assert.equal(form.riskPreference, "balanced");
  assert.equal(form.executionMode, "paper");
  assert.equal(form.goal.includes("2026-06-02"), true);
  assert.equal(form.goal.includes("近 24 小时"), true);
  assert.equal(form.goal.includes("人性偏差"), true);
  assert.equal(form.goal.includes("先回测和 paper 验证"), true);
});

test("dailyRadarStatusFromRuns finds today's saved daily radar run", () => {
  const status = dailyRadarStatusFromRuns(
    [
      {
        id: "run_today",
        goal: "2026-06-02 今日 AI 机会雷达：围绕 BTC/ETH 检查近 24 小时新闻舆论",
        createdAt: "2026-06-02T08:10:00.000Z",
        symbols: ["BTC", "ETH"],
        strategyDraftCount: 2,
        aiStatus: "ok",
      },
      {
        id: "run_old",
        goal: "2026-06-01 今日 AI 机会雷达：旧扫描",
        createdAt: "2026-06-01T03:10:00.000Z",
        symbols: ["SOL"],
        strategyDraftCount: 1,
        aiStatus: "ok",
      },
    ],
    new Date("2026-06-02T12:00:00.000Z"),
  );

  assert.equal(status.hasToday, true);
  assert.equal(status.title, "今日雷达已扫描");
  assert.equal(status.tone, "success");
  assert.equal(status.run.id, "run_today");
  assert.equal(status.primaryAction.kind, "open_today_run");
  assert.equal(status.isStale, false);
  assert.equal(status.summary.includes("BTC, ETH"), true);
});

test("dailyRadarStatusFromRuns marks today's old radar scan stale", () => {
  const status = dailyRadarStatusFromRuns(
    [
      {
        id: "run_stale",
        goal: "2026-06-02 今日 AI 机会雷达：围绕 BTC/ETH 检查近 24 小时新闻舆论",
        createdAt: "2026-06-02T03:00:00.000Z",
        symbols: ["BTC", "ETH"],
        strategyDraftCount: 3,
        aiStatus: "ok",
      },
    ],
    new Date("2026-06-02T12:30:00.000Z"),
  );

  assert.equal(status.hasToday, true);
  assert.equal(status.isStale, true);
  assert.equal(status.title, "今日雷达需刷新");
  assert.equal(status.tone, "warning");
  assert.equal(status.primaryAction.kind, "rescan_today");
  assert.equal(status.summary.includes("9.5 小时"), true);
});

test("dailyRadarStatusFromRuns asks for a scan when today has no radar run", () => {
  const status = dailyRadarStatusFromRuns(
    [
      {
        id: "run_old",
        goal: "2026-06-01 今日 AI 机会雷达：旧扫描",
        createdAt: "2026-06-01T03:10:00.000Z",
        symbols: ["BTC"],
      },
    ],
    new Date("2026-06-02T12:00:00.000Z"),
  );

  assert.equal(status.hasToday, false);
  assert.equal(status.title, "今日雷达未扫描");
  assert.equal(status.tone, "warning");
  assert.equal(status.primaryAction.kind, "scan_today");
  assert.equal(status.summary.includes("今天还没有"), true);
});

test("aiSettingsReturnPromptFromSearch stays hidden without rerun intent", () => {
  const prompt = aiSettingsReturnPromptFromSearch({
    intent: "",
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-02T12:00:00.000Z")),
  });

  assert.equal(prompt, null);
});

test("aiSettingsReturnPromptFromSearch turns settings rerun intent into a scan action", () => {
  const status = dailyRadarStatusFromRuns([], new Date("2026-06-02T12:00:00.000Z"));
  const prompt = aiSettingsReturnPromptFromSearch({
    intent: "rerun_ai",
    dailyRadarStatus: status,
  });

  assert.equal(prompt.title, "AI 已准备重新分析");
  assert.equal(prompt.primaryAction.kind, "scan_today");
  assert.equal(prompt.primaryAction.label, "重新扫描目标");
  assert.ok(prompt.summary.includes("刚从 AI 配置回来"));
  assert.ok(prompt.nextActions.some((item) => item.includes("市场")));
});

test("aiSettingsReturnPromptFromSearch sends blocked provider returns back to AI settings", () => {
  const providerGate = aiProviderReadinessGateFromStatus({
    status: "blocked",
    providerLabel: "OpenAI",
    keyConfigured: false,
    primaryHref: "/settings/ai",
    primaryAction: { kind: "open_link", label: "配置真实 AI" },
    summary: "当前启用 OpenAI，但 API key 未配置。",
  });
  const prompt = aiSettingsReturnPromptFromSearch({
    intent: "rerun_ai",
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-02T12:00:00.000Z")),
    providerGate,
  });

  assert.equal(prompt.title, "AI 配置仍未完成");
  assert.equal(prompt.tone, "warning");
  assert.equal(prompt.primaryHref, "/settings/ai");
  assert.deepEqual(prompt.primaryAction, { kind: "open_link", label: "配置真实 AI" });
  assert.ok(prompt.summary.includes("OpenAI"));
  assert.ok(prompt.nextActions.some((item) => item.includes("API key")));
});

test("aiSettingsReturnPromptFromSearch waits for provider loading after settings return", () => {
  const providerGate = aiProviderReadinessGateFromStatus(null, { loading: true });
  const prompt = aiSettingsReturnPromptFromSearch({
    intent: "rerun_ai",
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-02T12:00:00.000Z")),
    providerGate,
  });

  assert.equal(prompt.title, "正在确认 AI provider");
  assert.equal(prompt.tone, "warning");
  assert.equal(prompt.primaryHref, "/settings/ai");
  assert.deepEqual(prompt.primaryAction, { kind: "open_link", label: "查看 AI 配置" });
  assert.ok(prompt.summary.includes("暂不自动启动今日雷达"));
});

test("aiSettingsReturnPromptFromSearch keeps rerun behavior when provider is ready", () => {
  const providerGate = aiProviderReadinessGateFromStatus({
    status: "ready",
    providerLabel: "OpenAI",
    keyConfigured: true,
    primaryHref: "/ai-money?intent=rerun_ai",
    primaryAction: { kind: "open_link", label: "使用真实 AI 分析" },
  });
  const prompt = aiSettingsReturnPromptFromSearch({
    intent: "rerun_ai",
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-02T12:00:00.000Z")),
    providerGate,
  });

  assert.equal(prompt.title, "AI 已准备重新分析");
  assert.equal(prompt.primaryHref, undefined);
  assert.deepEqual(prompt.primaryAction, { kind: "scan_today", label: "重新扫描目标" });
});

test("aiSettingsReturnAutoRunDecision runs once after AI settings return", () => {
  const decision = aiSettingsReturnAutoRunDecision({
    intent: "rerun_ai",
    busy: false,
    providerBlocked: false,
    providerReady: true,
    lastKey: "",
  });

  assert.deepEqual(decision, {
    shouldRun: true,
    key: "settings_return:rerun_ai",
    reason: "ready",
  });

  assert.deepEqual(
    aiSettingsReturnAutoRunDecision({
      intent: "rerun_ai",
      busy: false,
      providerBlocked: false,
      providerReady: true,
      lastKey: decision.key,
    }),
    {
      shouldRun: false,
      key: decision.key,
      reason: "already_triggered",
    },
  );
});

test("aiSettingsReturnAutoRunDecision waits for safe conditions", () => {
  assert.equal(
    aiSettingsReturnAutoRunDecision({ intent: "", busy: false, providerBlocked: false, providerReady: true }).reason,
    "no_intent",
  );
  assert.equal(
    aiSettingsReturnAutoRunDecision({ intent: "rerun_ai", busy: true, providerBlocked: false, providerReady: true }).reason,
    "busy",
  );
  assert.equal(
    aiSettingsReturnAutoRunDecision({ intent: "rerun_ai", busy: false, providerBlocked: true, providerReady: false }).reason,
    "provider_blocked",
  );
  assert.equal(
    aiSettingsReturnAutoRunDecision({ intent: "rerun_ai", busy: false, providerBlocked: false }).reason,
    "provider_not_ready",
  );
  assert.equal(
    aiSettingsReturnAutoRunDecision({ intent: "rerun_ai", busy: false, providerBlocked: false, providerReady: false }).reason,
    "provider_not_ready",
  );
});

test("autoDailyRadarDecision starts only one enabled safe daily scan", () => {
  const status = dailyRadarStatusFromRuns([], new Date("2026-06-02T12:00:00.000Z"));
  const decision = autoDailyRadarDecision({
    enabled: true,
    busy: false,
    providerReady: true,
    status,
    lastKey: "",
    now: new Date("2026-06-02T12:00:00.000Z"),
  });

  assert.deepEqual(decision, {
    shouldRun: true,
    key: "2026-06-02:scan_today:none",
    reason: "ready",
  });

  assert.equal(
    autoDailyRadarDecision({
      enabled: true,
      busy: false,
      providerReady: true,
      status,
      lastKey: decision.key,
      now: new Date("2026-06-02T12:05:00.000Z"),
    }).shouldRun,
    false,
  );
});

test("autoDailyRadarEnabledFromStorage defaults first use to enabled but preserves opt-out", () => {
  assert.equal(AI_MONEY_DEFAULT_AUTO_RADAR_ENABLED, true);
  assert.equal(autoDailyRadarEnabledFromStorage(null), true);
  assert.equal(autoDailyRadarEnabledFromStorage(""), true);
  assert.equal(autoDailyRadarEnabledFromStorage("true"), true);
  assert.equal(autoDailyRadarEnabledFromStorage("false"), false);
});

test("autoDailyRadarPreferencePersistence skips writes until preference is loaded", () => {
  assert.deepEqual(
    autoDailyRadarPreferencePersistence({ loaded: false, enabled: false }),
    { shouldWrite: false, value: "" },
  );
  assert.deepEqual(
    autoDailyRadarPreferencePersistence({ loaded: true, enabled: true }),
    { shouldWrite: true, value: "true" },
  );
  assert.deepEqual(
    autoDailyRadarPreferencePersistence({ loaded: true, enabled: false }),
    { shouldWrite: true, value: "false" },
  );
});

test("autoDailyRadarDecision does not run when disabled, busy, or already fresh", () => {
  const staleStatus = dailyRadarStatusFromRuns(
    [
      {
        id: "run_stale",
        goal: "2026-06-02 今日 AI 机会雷达：旧扫描",
        createdAt: "2026-06-02T03:00:00.000Z",
      },
    ],
    new Date("2026-06-02T12:30:00.000Z"),
  );
  const freshStatus = dailyRadarStatusFromRuns(
    [
      {
        id: "run_today",
        goal: "2026-06-02 今日 AI 机会雷达：新扫描",
        createdAt: "2026-06-02T11:00:00.000Z",
      },
    ],
    new Date("2026-06-02T12:30:00.000Z"),
  );

  assert.equal(
    autoDailyRadarDecision({
      enabled: false,
      busy: false,
      status: staleStatus,
      lastKey: "",
      now: new Date("2026-06-02T12:30:00.000Z"),
    }).reason,
    "disabled",
  );
  assert.equal(
    autoDailyRadarDecision({
      enabled: true,
      busy: true,
      status: staleStatus,
      lastKey: "",
      now: new Date("2026-06-02T12:30:00.000Z"),
    }).reason,
    "busy",
  );
  assert.equal(
    autoDailyRadarDecision({
      enabled: true,
      busy: false,
      status: staleStatus,
      lastKey: "",
      now: new Date("2026-06-02T12:30:00.000Z"),
    }).reason,
    "provider_not_ready",
  );
  assert.equal(
    autoDailyRadarDecision({
      enabled: true,
      busy: false,
      providerReady: false,
      status: staleStatus,
      lastKey: "",
      now: new Date("2026-06-02T12:30:00.000Z"),
    }).reason,
    "provider_not_ready",
  );
  assert.equal(
    autoDailyRadarDecision({
      enabled: true,
      busy: false,
      providerReady: true,
      status: freshStatus,
      lastKey: "",
      now: new Date("2026-06-02T12:30:00.000Z"),
    }).reason,
    "fresh",
  );
});

test("autoRadarProviderNoticeFromGate explains why enabled auto radar is waiting for real AI", () => {
  assert.equal(
    autoRadarProviderNoticeFromGate({
      autoEnabled: false,
      gate: { stage: "blocked", title: "先配置真实 AI" },
    }),
    null,
  );
  assert.equal(
    autoRadarProviderNoticeFromGate({
      autoEnabled: true,
      gate: { stage: "ready", title: "真实 AI 可用" },
    }),
    null,
  );

  const loading = autoRadarProviderNoticeFromGate({
    autoEnabled: true,
    gate: {
      stage: "loading",
      tone: "warning",
      title: "正在确认 AI provider",
      summary: "等待 AI 配置状态返回前，暂不自动启动今日雷达。",
      primaryHref: "/settings/ai",
      primaryAction: { kind: "open_link", label: "查看 AI 配置" },
    },
  });
  assert.equal(loading.stage, "waiting_provider");
  assert.equal(loading.tone, "warning");
  assert.equal(loading.primaryHref, "/settings/ai");
  assert.equal(loading.primaryAction.label, "查看 AI 配置");
  assert.match(loading.summary, /暂不自动启动今日雷达/);

  const unknown = autoRadarProviderNoticeFromGate({
    autoEnabled: true,
    gate: {
      stage: "unknown",
      tone: "default",
      title: "AI provider 状态未知",
      summary: "",
      primaryHref: "/settings/ai",
      primaryAction: { kind: "open_link", label: "查看 AI 配置" },
    },
  });
  assert.equal(unknown.stage, "waiting_provider");
  assert.equal(unknown.tone, "warning");
  assert.match(unknown.summary, /无法确认真实 AI/);

  const blocked = autoRadarProviderNoticeFromGate({
    autoEnabled: true,
    gate: {
      stage: "blocked",
      tone: "warning",
      title: "先配置真实 AI",
      summary: "OpenAI API key 未配置，AI Money 会退回本地 fallback。",
      primaryHref: "/settings/ai",
      primaryAction: { kind: "open_link", label: "配置真实 AI" },
    },
  });
  assert.equal(blocked.title, "自动雷达等待真实 AI");
  assert.equal(blocked.primaryAction.label, "配置真实 AI");
  assert.match(blocked.summary, /fallback/);
});

test("aiCommandCenterFromState starts idle users with a safe scan command", () => {
  const center = aiCommandCenterFromState({
    runs: [],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-03T04:00:00.000Z")),
  });

  assert.equal(center.stage, "scan");
  assert.equal(center.tone, "warning");
  assert.deepEqual(center.primaryAction, {
    kind: "analyze_and_validate",
    label: "启动 AI 扫描并验证",
  });
  assert.ok(center.summary.includes("市场"));
  assert.ok(center.summary.includes("舆论"));
  assert.equal(center.metrics.find((item) => item.label === "AI 状态").value, "待扫描");
  const handoff = center.metrics.find((item) => item.label === "交接");
  assert.equal(handoff.value, "2 AI / 1 你");
  assert.ok(handoff.hint.includes("AI 可代办"));
  assert.equal(center.evidence.find((item) => item.id === "market_context").status, "current");
});

test("aiCommandCenterFromState sends blocked idle provider command to AI settings", () => {
  const providerGate = aiProviderReadinessGateFromStatus({
    status: "blocked",
    providerLabel: "OpenAI",
    keyConfigured: false,
    primaryHref: "/settings/ai",
    primaryAction: { kind: "open_link", label: "配置真实 AI" },
    summary: "当前启用 OpenAI，但 API key 未配置。",
  });
  const center = aiCommandCenterFromState({
    runs: [],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-03T04:00:00.000Z")),
    providerGate,
  });

  assert.equal(center.stage, "provider_blocked");
  assert.equal(center.tone, "warning");
  assert.deepEqual(center.primaryAction, { kind: "open_link", label: "配置真实 AI" });
  assert.equal(center.primaryHref, "/settings/ai");
  assert.equal(center.evidence.find((item) => item.id === "provider").status, "blocked");
  assert.equal(center.evidence.find((item) => item.id === "market_context").status, "pending");
  assert.notEqual(center.primaryAction.kind, "analyze_and_validate");
});

test("aiCommandCenterFromState waits while idle provider status is loading", () => {
  const providerGate = aiProviderReadinessGateFromStatus(null, { loading: true });
  const center = aiCommandCenterFromState({
    runs: [],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-03T04:00:00.000Z")),
    providerGate,
  });

  assert.equal(center.stage, "provider_loading");
  assert.ok(center.title.includes("确认 AI provider"));
  assert.deepEqual(center.primaryAction, { kind: "open_link", label: "查看 AI 配置" });
  assert.equal(center.primaryHref, "/settings/ai");
  assert.equal(center.evidence.find((item) => item.id === "provider").status, "current");
});

test("aiCommandCenterFromState keeps idle scan command when provider is ready", () => {
  const providerGate = aiProviderReadinessGateFromStatus({
    status: "ready",
    providerLabel: "OpenAI",
    keyConfigured: true,
  });
  const center = aiCommandCenterFromState({
    runs: [],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-03T04:00:00.000Z")),
    providerGate,
  });

  assert.equal(center.stage, "scan");
  assert.deepEqual(center.primaryAction, {
    kind: "analyze_and_validate",
    label: "启动 AI 扫描并验证",
  });
  assert.equal(center.primaryHref, undefined);
});

test("aiCommandCenterFromState surfaces AI and human handoff counts", () => {
  const center = aiCommandCenterFromState({
    analysis: {
      goal: "BTC 自动验证",
      summary: "AI 生成可回测蓝图。",
      context: {
        notes: [],
        newsCount: 2,
        macroCount: 1,
        onchainCount: 1,
        symbols: ["BTC"],
      },
      execution: { mode: "paper", safetyGates: [] },
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
      humanFactors: [],
      watchSignals: [],
    },
    persistedActions: [],
    validationRuns: [],
    dailyRadarStatus: { hasToday: true, isStale: false, summary: "今日已扫描。" },
  });

  const handoff = center.metrics.find((item) => item.label === "交接");
  assert.equal(handoff.value, "1 AI / 1 你");
  assert.ok(handoff.hint.includes("AI 可代办"));
  assert.ok(handoff.hint.includes("你确认"));
});

test("aiCommandCenterFromState promotes a safe validated paper candidate", () => {
  const center = aiCommandCenterFromState({
    analysis: {
      goal: "BTC 低回撤赚钱",
      summary: "BTC 有低回撤 paper 机会",
      context: {
        notes: [],
        newsCount: 5,
        macroCount: 2,
        onchainCount: 2,
        symbols: ["BTC"],
        recentRunCount: 2,
        recentRunSummaries: [
          {
            id: "goal_old",
            goal: "BTC 旧风向",
            summary: "旧判断证据不足，建议重扫。",
            aiStatus: "fallback",
            executionMode: "paper",
            strategyDraftCount: 0,
            contextNewsCount: 0,
            contextMacroCount: 0,
            contextOnchainCount: 0,
            actionCount: 1,
          },
          {
            id: "goal_new",
            goal: "BTC 新风向",
            summary: "ETF 资金和链上证据改善。",
            aiStatus: "ok",
            executionMode: "paper",
            strategyDraftCount: 2,
            contextNewsCount: 4,
            contextMacroCount: 1,
            contextOnchainCount: 2,
            actionCount: 2,
            doneActionCount: 1,
            manualActionCount: 1,
            readyActionCount: 0,
            blockedActionCount: 0,
            openActionCount: 1,
          },
        ],
      },
      execution: { mode: "paper", safetyGates: ["回测完成", "paper 观察", "人工复核"] },
      strategyDrafts: [
        {
          name: "btca",
          kind: "grid_dca",
          symbol: "BTC",
          params: {},
          riskCaps: { maxPositionUsd: 400, maxLeverage: 4, dailyLossCapUsd: 40 },
        },
      ],
      humanFactors: [],
      watchSignals: [],
    },
    persistedActions: [{ id: "sentiment_review", status: "done" }],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        progress: 100,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
    accounts: [
      {
        id: "acc_1",
        exchange: "binance",
        permissions: { canTrade: true, canWithdraw: false },
      },
    ],
    dailyRadarStatus: {
      hasToday: true,
      isStale: false,
      title: "今日雷达已扫描",
      tone: "success",
      summary: "今天已扫描 BTC。",
      run: { id: "run_today" },
      primaryAction: { kind: "open_today_run", label: "打开今日雷达" },
    },
  });

  assert.equal(center.stage, "paper_candidate");
  assert.equal(center.tone, "success");
  assert.deepEqual(center.primaryAction, {
    kind: "save_and_accept_paper_candidate",
    label: "保存并采用 paper",
  });
  assert.equal(center.metrics.find((item) => item.label === "验证").value, "1 完成");
  const memory = center.evidence.find((item) => item.id === "ai_memory");
  assert.equal(memory.status, "done");
  assert.ok(memory.detail.includes("2"));
  assert.ok(memory.detail.includes("BTC 旧风向"));
  assert.ok(memory.detail.includes("未完成 1"));
  assert.equal(center.evidence.find((item) => item.id === "validation").status, "done");
  assert.equal(center.evidence.find((item) => item.id === "human_sentiment").status, "done");
  assert.equal(center.evidence.find((item) => item.id === "safety_gates").status, "done");
  assert.ok(center.nextActions.some((item) => item.includes("paper")));
});

test("aiCommandCenterFromState keeps thin sentiment review evidence current", () => {
  const center = aiCommandCenterFromState({
    analysis: {
      goal: "BTC 低回撤赚钱",
      summary: "BTC 热门叙事 paper 机会",
      context: {
        notes: [],
        newsCount: 5,
        macroCount: 2,
        onchainCount: 2,
        symbols: ["BTC"],
      },
      execution: { mode: "paper", safetyGates: ["回测完成", "paper 观察", "人工复核"] },
      strategyDrafts: [
        {
          name: "btca",
          kind: "grid_dca",
          symbol: "BTC",
          params: {},
          riskCaps: { maxPositionUsd: 400, maxLeverage: 4, dailyLossCapUsd: 40 },
        },
      ],
      humanFactors: ["FOMO 追涨风险"],
      watchSignals: [{ source: "human", signal: "社交媒体 FOMO" }],
    },
    persistedActions: [{ id: "sentiment_review", status: "done", note: "风向 / 人性复核已完成。" }],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        progress: 100,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
    accounts: [
      {
        id: "acc_1",
        exchange: "binance",
        permissions: { canTrade: true, canWithdraw: false },
      },
    ],
    dailyRadarStatus: {
      hasToday: true,
      isStale: false,
      title: "今日雷达已扫描",
      tone: "success",
      summary: "今天已扫描 BTC。",
      run: { id: "run_today" },
      primaryAction: { kind: "open_today_run", label: "打开今日雷达" },
    },
  });
  const sentimentEvidence = center.evidence.find((item) => item.id === "human_sentiment");

  assert.equal(center.stage, "sentiment_review");
  assert.equal(sentimentEvidence.status, "current");
  assert.equal(sentimentEvidence.href, "/data-explorer/news");
});

test("aiAutonomousCommandFromState starts idle users with one AI-managed scan command", () => {
  const command = aiAutonomousCommandFromState({
    analysis: null,
    persistedActions: [],
    validationRuns: [],
    runs: [],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-03T08:00:00.000Z")),
  });

  assert.equal(command.stage, "start");
  assert.equal(command.owner, "AI");
  assert.deepEqual(command.primaryAction, {
    kind: "analyze_and_validate",
    label: "启动 AI 扫描并验证",
  });
  assert.ok(command.summary.includes("市场"));
  assert.ok(command.summary.includes("舆论"));
  assert.ok(command.summary.includes("人性"));
  assert.ok(command.aiWillDo.some((item) => item.includes("策略蓝图")));
  assert.ok(command.aiWillDo.some((item) => item.includes("验证")));
  assert.ok(command.safety.includes("不会下单"));
  assert.ok(command.proposedFormState.goal.includes("AI 自动"));
  assert.ok(command.proposedFormState.goal.includes("市场风向"));
  assert.equal(command.scanFormState.goal, command.proposedFormState.goal);
  assert.equal(command.proposalCard.goal, command.proposedFormState.goal);
});

test("aiAutonomousCommandFromState sends blocked idle provider command to AI settings", () => {
  const providerGate = aiProviderReadinessGateFromStatus({
    status: "blocked",
    providerLabel: "OpenAI",
    keyConfigured: false,
    primaryHref: "/settings/ai",
    primaryAction: { kind: "open_link", label: "配置真实 AI" },
    summary: "当前启用 OpenAI，但 API key 未配置。",
  });
  const command = aiAutonomousCommandFromState({
    analysis: null,
    persistedActions: [],
    validationRuns: [],
    runs: [],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-03T08:00:00.000Z")),
    providerGate,
  });

  assert.equal(command.stage, "provider_blocked");
  assert.equal(command.owner, "你");
  assert.deepEqual(command.primaryAction, { kind: "open_link", label: "配置真实 AI" });
  assert.equal(command.primaryHref, "/settings/ai");
  assert.equal(command.proposedFormState, undefined);
  assert.equal(command.scanFormState, undefined);
  assert.ok(command.safety.includes("不会触发交易"));
});

test("aiAutonomousCommandFromState waits while idle provider status is loading", () => {
  const providerGate = aiProviderReadinessGateFromStatus(null, { loading: true });
  const command = aiAutonomousCommandFromState({
    analysis: null,
    persistedActions: [],
    validationRuns: [],
    runs: [],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-03T08:00:00.000Z")),
    providerGate,
  });

  assert.equal(command.stage, "provider_loading");
  assert.equal(command.owner, "你");
  assert.deepEqual(command.primaryAction, { kind: "open_link", label: "查看 AI 配置" });
  assert.equal(command.primaryHref, "/settings/ai");
  assert.equal(command.proposedFormState, undefined);
  assert.ok(command.title.includes("AI provider"));
});

test("aiAutonomousCommandFromState keeps idle scan command when provider is ready", () => {
  const providerGate = aiProviderReadinessGateFromStatus({
    status: "ready",
    providerLabel: "OpenAI",
    keyConfigured: true,
  });
  const command = aiAutonomousCommandFromState({
    analysis: null,
    persistedActions: [],
    validationRuns: [],
    runs: [],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-03T08:00:00.000Z")),
    providerGate,
  });

  assert.equal(command.stage, "start");
  assert.equal(command.owner, "AI");
  assert.deepEqual(command.primaryAction, {
    kind: "analyze_and_validate",
    label: "启动 AI 扫描并验证",
  });
  assert.ok(command.proposedFormState.goal.includes("AI 自动"));
});

test("aiAutonomousCommandFromState turns runnable drafts into an AI validation command", () => {
  const command = aiAutonomousCommandFromState({
    analysis: {
      context: { notes: [], newsCount: 3, macroCount: 1, onchainCount: 1 },
      execution: { mode: "paper", safetyGates: ["回测完成", "paper 观察"] },
      humanFactors: [],
      watchSignals: [],
      strategyDrafts: [
        {
          name: "btca",
          kind: "grid_dca",
          symbol: "BTC",
          params: {},
          riskCaps: { maxPositionUsd: 100, maxLeverage: 3, dailyLossCapUsd: 20 },
        },
      ],
    },
    persistedActions: [],
    validationRuns: [],
    runs: [],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-03T08:00:00.000Z")),
  });

  assert.equal(command.stage, "ai_validate");
  assert.equal(command.owner, "AI");
  assert.deepEqual(command.primaryAction, {
    kind: "run_all_backtests",
    label: "运行 AI 批量回测",
  });
  assert.ok(command.summary.includes("批量回测"));
  assert.ok(command.safety.includes("不会下单"));
  assert.ok(command.humanMustDo.some((item) => item.includes("不要提前采用")));
});

test("aiAutonomousCommandFromState saves strategy before adopting an unsaved paper candidate", () => {
  const command = aiAutonomousCommandFromState({
    analysis: {
      id: "goal_1",
      context: { notes: [], newsCount: 4, macroCount: 1, onchainCount: 1 },
      execution: { mode: "paper", safetyGates: ["回测完成", "paper 观察"] },
      humanFactors: ["避免 FOMO 追涨"],
      watchSignals: [{ source: "news", signal: "ETF inflows accelerate" }],
      strategyDrafts: [
        {
          name: "btca",
          kind: "grid_dca",
          symbol: "BTC",
          params: {},
          riskCaps: { maxPositionUsd: 100, maxLeverage: 3, dailyLossCapUsd: 20 },
        },
      ],
    },
    persistedActions: [{ id: "sentiment_review", status: "done" }],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
    runs: [],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-03T08:00:00.000Z")),
  });

  assert.equal(command.stage, "paper_candidate");
  assert.equal(command.owner, "AI");
  assert.deepEqual(command.primaryAction, {
    kind: "save_and_accept_paper_candidate",
    label: "保存并采用 paper",
  });
  assert.ok(command.safety.includes("保存"));
  assert.ok(command.aiWillDo.some((item) => item.includes("保存")));
});

test("aiAutonomousCommandFromState prioritizes historical paper candidate follow-up over a new scan", () => {
  const command = aiAutonomousCommandFromState({
    analysis: null,
    persistedActions: [],
    validationRuns: [
      {
        runId: "run_btc_1",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
    runs: [
      {
        id: "goal_started_validation",
        goal: "BTC AI 机会雷达",
        symbols: ["BTC"],
        aiStatus: "ok",
        executionMode: "paper",
        strategyDraftCount: 2,
        contextNewsCount: 4,
        contextMacroCount: 1,
        contextOnchainCount: 1,
        createdAt: "2026-06-03T02:30:00.000Z",
        analysis: {
          goal: "BTC AI 机会雷达",
          context: { symbols: ["BTC"], newsCount: 4, macroCount: 1, onchainCount: 1 },
          execution: { mode: "paper" },
          humanFactors: ["避免 FOMO 追涨"],
          watchSignals: [{ signal: "ETF 资金流增强", action: "提高 paper 观察优先级" }],
          strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
        },
        actions: [
          {
            id: "backtest",
            status: "done",
            relatedId: "run_btc_1",
            href: "/backtests/run_btc_1",
            note: "已发起 1 个 AI 草案回测：btca",
          },
        ],
      },
    ],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-03T08:00:00.000Z")),
    now: new Date("2026-06-03T08:00:00.000Z"),
  });

  assert.equal(command.stage, "followup");
  assert.equal(command.owner, "AI");
  assert.equal(command.title, "AI 下一步：查看 paper 候选证据");
  assert.deepEqual(command.primaryAction, {
    kind: "open_link",
    label: "查看 paper 候选证据",
  });
  assert.equal(command.primaryHref, "/ai-money?runId=goal_started_validation");
  assert.ok(command.summary.includes("优先 paper"));
  assert.ok(command.safety.includes("只打开证据"));
  assert.ok(command.aiWillDo.some((item) => item.includes("paper")));
  assert.ok(command.humanMustDo.some((item) => item.includes("回测证据")));
});

test("aiObservationFocusFromState starts idle users with four watch lanes", () => {
  const focus = aiObservationFocusFromState({
    analysis: null,
    persistedActions: [],
    validationRuns: [],
    runs: [],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-03T08:00:00.000Z")),
  });

  assert.equal(focus.stage, "idle");
  assert.deepEqual(focus.primaryAction, {
    kind: "scan_today",
    label: "运行 AI 扫描",
  });
  assert.ok(focus.summary.includes("市场风向"));
  assert.ok(focus.summary.includes("舆论"));
  assert.ok(focus.summary.includes("人性"));
  assert.deepEqual(
    focus.items.map((item) => item.id),
    ["market", "sentiment", "validation", "execution"],
  );
});

test("aiObservationFocusFromState sends blocked idle provider focus to AI settings", () => {
  const providerGate = aiProviderReadinessGateFromStatus({
    status: "blocked",
    providerLabel: "OpenAI",
    keyConfigured: false,
    primaryHref: "/settings/ai",
    primaryAction: { kind: "open_link", label: "配置真实 AI" },
    summary: "当前启用 OpenAI，但 API key 未配置。",
  });
  const focus = aiObservationFocusFromState({
    analysis: null,
    persistedActions: [],
    validationRuns: [],
    runs: [],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-03T08:00:00.000Z")),
    providerGate,
  });

  assert.equal(focus.stage, "provider_blocked");
  assert.deepEqual(focus.primaryAction, {
    kind: "open_link",
    label: "配置真实 AI",
    href: "/settings/ai",
  });
  assert.ok(focus.summary.includes("OpenAI"));
  assert.ok(focus.nextActions.some((item) => item.includes("provider")));
  assert.ok(focus.items.some((item) => item.id === "provider" && item.href === "/settings/ai"));
});

test("aiObservationFocusFromState summarizes active analysis watch priorities", () => {
  const focus = aiObservationFocusFromState({
    analysis: {
      goal: "BTC 低回撤赚钱",
      context: {
        newsCount: 8,
        macroCount: 2,
        onchainCount: 3,
        symbols: ["BTC"],
        notes: [],
      },
      execution: { mode: "paper", safetyGates: ["回测完成", "paper 观察"] },
      strategyDrafts: [
        {
          name: "btca",
          kind: "grid_dca",
          symbol: "BTC",
          params: {},
          riskCaps: { maxPositionUsd: 300, maxLeverage: 3, dailyLossCapUsd: 30 },
        },
      ],
      humanFactors: ["FOMO 追涨风险", "热门叙事拥挤"],
      watchSignals: [{ source: "news", signal: "BTC ETF 资金流升温" }],
    },
    persistedActions: [],
    validationRuns: [],
    runs: [],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-03T08:00:00.000Z")),
  });
  const market = focus.items.find((item) => item.id === "market");
  const sentiment = focus.items.find((item) => item.id === "sentiment");
  const validation = focus.items.find((item) => item.id === "validation");
  const execution = focus.items.find((item) => item.id === "execution");

  assert.equal(focus.stage, "watching");
  assert.ok(market.detail.includes("8"));
  assert.ok(market.detail.includes("2"));
  assert.ok(market.detail.includes("3"));
  assert.ok(sentiment.detail.includes("FOMO") || sentiment.detail.includes("拥挤"));
  assert.ok(validation.detail.includes("回测"));
  assert.equal(validation.status, "needs_backtest");
  assert.ok(execution.detail.includes("不会") || execution.detail.includes("不进入"));
});

test("aiRunFollowupQueueFromRuns prioritizes manual paper watch over older routine runs", () => {
  const now = new Date("2026-06-03T04:00:00.000Z");
  const queue = aiRunFollowupQueueFromRuns(
    [
      {
        id: "stale",
        goal: "旧 BTC 雷达",
        symbols: ["BTC"],
        aiStatus: "ok",
        executionMode: "paper",
        strategyDraftCount: 2,
        contextNewsCount: 3,
        contextMacroCount: 1,
        contextOnchainCount: 1,
        createdAt: "2026-06-02T00:00:00.000Z",
        actions: [],
      },
      {
        id: "paper",
        goal: "ETH 低回撤机会",
        symbols: ["ETH"],
        aiStatus: "ok",
        executionMode: "paper",
        strategyDraftCount: 1,
        contextNewsCount: 4,
        contextMacroCount: 1,
        contextOnchainCount: 2,
        createdAt: "2026-06-03T03:00:00.000Z",
        actions: [
          {
            id: "paper_watch",
            status: "manual",
            href: "/backtests/run1",
            note: "等待 24-72 小时 paper 观察。",
            updatedAt: "2026-06-03T03:10:00.000Z",
          },
        ],
      },
    ],
    now,
  );

  assert.equal(queue.stage, "needs_attention");
  assert.equal(queue.primaryAction.kind, "open_run");
  assert.equal(queue.primaryAction.runId, "paper");
  assert.equal(queue.items[0].runId, "paper");
  assert.equal(queue.items[0].actionKind, "paper_watch");
  assert.equal(queue.items[0].href, "/backtests/run1");
  assert.ok(queue.summary.includes("paper"));
});

test("aiRunFollowupQueueFromRuns pulls thin completed paper watch back to review", () => {
  const now = new Date("2026-06-03T04:00:00.000Z");
  const queue = aiRunFollowupQueueFromRuns(
    [
      {
        id: "validation",
        goal: "BTC 蓝图等待验证",
        symbols: ["BTC"],
        aiStatus: "ok",
        executionMode: "paper",
        strategyDraftCount: 3,
        contextNewsCount: 3,
        contextMacroCount: 1,
        contextOnchainCount: 1,
        createdAt: "2026-06-03T01:00:00.000Z",
        actions: [],
      },
      {
        id: "thin_paper",
        goal: "ETH paper 候选",
        symbols: ["ETH"],
        aiStatus: "ok",
        executionMode: "paper",
        strategyDraftCount: 1,
        contextNewsCount: 4,
        contextMacroCount: 1,
        contextOnchainCount: 2,
        createdAt: "2026-06-03T03:20:00.000Z",
        actions: [
          {
            id: "paper_watch",
            status: "done",
            href: "/backtests/run_eth",
            note: "Paper 已完成",
            updatedAt: "2026-06-03T03:50:00.000Z",
          },
        ],
      },
    ],
    now,
  );

  assert.equal(queue.stage, "needs_attention");
  assert.equal(queue.primaryAction.runId, "thin_paper");
  assert.equal(queue.items[0].runId, "thin_paper");
  assert.equal(queue.items[0].actionKind, "paper_watch");
  assert.equal(queue.items[0].title, "补齐 paper 复盘证据");
  assert.equal(queue.items[0].href, "/backtests/run_eth");
  assert.ok(queue.items[0].detail.includes("证据不足"));
  assert.ok(queue.items[0].detail.includes("市场风向"));
  assert.ok(queue.items[0].detail.includes("执行摩擦"));
  assert.ok(queue.nextActions[0].includes("继续 paper 观察"));
});

test("aiRunFollowupQueueFromRuns prioritizes saved AI strategies that still need backtest", () => {
  const queue = aiRunFollowupQueueFromRuns(
    [
      {
        id: "goal_saved",
        goal: "BTC 低回撤赚钱路径",
        symbols: ["BTC"],
        aiStatus: "ok",
        executionMode: "paper",
        strategyDraftCount: 2,
        contextNewsCount: 3,
        contextMacroCount: 1,
        contextOnchainCount: 1,
        createdAt: "2026-06-03T02:00:00.000Z",
        actions: [
          {
            id: "strategy",
            status: "done",
            relatedId: "opt123",
            href: "/strategies/opt123?from=ai-draft&aiRunId=goal_saved",
            note: "btca 已保存为 AI 策略配置；live 仍关闭；下一步必须先补回测证据，再进入 paper 观察；paper 中继续记录市场风向。",
          },
        ],
      },
    ],
    new Date("2026-06-03T04:00:00.000Z"),
  );

  assert.equal(queue.stage, "needs_attention");
  assert.equal(queue.primaryAction.kind, "open_link");
  assert.equal(queue.primaryAction.label, "打开已保存策略");
  assert.equal(queue.primaryAction.runId, "goal_saved");
  assert.equal(queue.primaryAction.href, "/strategies/opt123?from=ai-draft&aiRunId=goal_saved");
  assert.equal(queue.items[0].actionKind, "saved_strategy_backtest");
  assert.equal(queue.items[0].href, "/strategies/opt123?from=ai-draft&aiRunId=goal_saved");
  assert.ok(queue.items[0].detail.includes("已保存"));
  assert.ok(queue.items[0].detail.includes("回测"));
  assert.ok(queue.items[0].detail.includes("paper"));
  assert.ok(queue.nextActions[0].includes("已保存策略"));
});

test("aiRunFollowupPrimaryActionForQueue exposes open_link as a header action", () => {
  const queue = aiRunFollowupQueueFromRuns(
    [
      {
        id: "goal_saved",
        goal: "BTC 低回撤赚钱路径",
        symbols: ["BTC"],
        aiStatus: "ok",
        executionMode: "paper",
        strategyDraftCount: 2,
        contextNewsCount: 3,
        contextMacroCount: 1,
        contextOnchainCount: 1,
        createdAt: "2026-06-03T02:00:00.000Z",
        actions: [
          {
            id: "strategy",
            status: "done",
            relatedId: "opt123",
            href: "/strategies/opt123?from=ai-draft&aiRunId=goal_saved",
            note: "btca 已保存为 AI 策略配置；live 仍关闭；下一步必须先补回测证据，再进入 paper 观察。",
          },
        ],
      },
    ],
    new Date("2026-06-03T04:00:00.000Z"),
  );

  assert.deepEqual(aiRunFollowupPrimaryActionForQueue(queue), {
    kind: "open_link",
    label: "打开已保存策略",
    href: "/strategies/opt123?from=ai-draft&aiRunId=goal_saved",
    runId: "goal_saved",
  });
});

test("aiRunFollowupPrimaryActionForQueue keeps scan and run actions usable", () => {
  assert.deepEqual(
    aiRunFollowupPrimaryActionForQueue({
      primaryAction: { kind: "scan_today", label: "启动今日扫描" },
    }),
    { kind: "scan_today", label: "启动今日扫描" },
  );
  assert.deepEqual(
    aiRunFollowupPrimaryActionForQueue({
      primaryAction: {
        kind: "validate_run",
        label: "验证此 AI 运行",
        runId: "goal_blueprint",
        href: "/ai-money?runId=goal_blueprint",
      },
    }),
    {
      kind: "validate_run",
      label: "验证此 AI 运行",
      runId: "goal_blueprint",
      href: "/ai-money?runId=goal_blueprint",
    },
  );
});

test("aiRunFollowupQueueFromRuns makes unvalidated AI blueprints directly validateable", () => {
  const queue = aiRunFollowupQueueFromRuns(
    [
      {
        id: "goal_blueprint",
        goal: "ETH/SOL AI 机会雷达",
        symbols: ["ETH", "SOL"],
        aiStatus: "ok",
        executionMode: "paper",
        strategyDraftCount: 3,
        contextNewsCount: 4,
        contextMacroCount: 1,
        contextOnchainCount: 2,
        createdAt: "2026-06-03T02:30:00.000Z",
        actions: [],
      },
    ],
    new Date("2026-06-03T04:00:00.000Z"),
  );

  assert.equal(queue.stage, "needs_attention");
  assert.equal(queue.items[0].actionKind, "run_validation");
  assert.deepEqual(queue.primaryAction, {
    kind: "validate_run",
    label: "验证此 AI 运行",
    runId: "goal_blueprint",
    href: "/ai-money?runId=goal_blueprint",
  });
});

test("aiRunFollowupQueueFromRuns opens started validation instead of rerunning historical run", () => {
  const queue = aiRunFollowupQueueFromRuns(
    [
      {
        id: "goal_started_validation",
        goal: "BTC AI 机会雷达",
        symbols: ["BTC"],
        aiStatus: "ok",
        executionMode: "paper",
        strategyDraftCount: 2,
        contextNewsCount: 4,
        contextMacroCount: 1,
        contextOnchainCount: 1,
        createdAt: "2026-06-03T02:30:00.000Z",
        actions: [
          {
            id: "backtest",
            status: "done",
            relatedId: "run_btc_1",
            href: "/backtests/run_btc_1",
            note: "已发起 1 个 AI 草案回测：btca",
          },
        ],
      },
    ],
    new Date("2026-06-03T04:00:00.000Z"),
  );

  assert.equal(queue.stage, "needs_attention");
  assert.equal(queue.items[0].actionKind, "validation_progress");
  assert.equal(queue.items[0].href, "/backtests/run_btc_1");
  assert.ok(queue.items[0].detail.includes("已发起"));
  assert.deepEqual(queue.primaryAction, {
    kind: "open_link",
    label: "查看验证进度",
    runId: "goal_started_validation",
    href: "/backtests/run_btc_1",
  });
  assert.ok(queue.nextActions[0].includes("查看验证进度"));
});

test("aiRunFollowupQueueFromRuns turns completed weak validation into AI redesign", () => {
  const queue = aiRunFollowupQueueFromRuns(
    [
      {
        id: "goal_started_validation",
        goal: "BTC AI 机会雷达",
        symbols: ["BTC"],
        aiStatus: "ok",
        executionMode: "paper",
        strategyDraftCount: 2,
        contextNewsCount: 4,
        contextMacroCount: 1,
        contextOnchainCount: 1,
        createdAt: "2026-06-03T02:30:00.000Z",
        analysis: {
          goal: "BTC AI 机会雷达",
          context: { symbols: ["BTC"], newsCount: 4, macroCount: 1, onchainCount: 1 },
          execution: { mode: "paper" },
          humanFactors: ["避免 FOMO 追涨"],
          watchSignals: [{ signal: "ETF 资金流退潮", action: "降低仓位后重做蓝图" }],
          strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
        },
        actions: [
          {
            id: "backtest",
            status: "done",
            relatedId: "run_btc_1",
            href: "/backtests/run_btc_1",
            note: "已发起 1 个 AI 草案回测：btca",
          },
        ],
      },
    ],
    new Date("2026-06-03T04:00:00.000Z"),
    [
      {
        runId: "run_btc_1",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: -0.02, sharpe: 0.2, max_dd: -0.2, n_trades: 6 },
      },
    ],
  );

  assert.equal(queue.stage, "needs_attention");
  assert.equal(queue.items[0].actionKind, "redesign_validation");
  assert.equal(queue.items[0].tone, "danger");
  assert.ok(queue.items[0].detail.includes("淘汰"));
  assert.deepEqual(queue.primaryAction, {
    kind: "analyze_and_validate",
    label: "让 AI 重做此运行",
    runId: "goal_started_validation",
    href: "/ai-money?runId=goal_started_validation",
    proposedFormState: queue.primaryAction.proposedFormState,
  });
  assert.ok(queue.primaryAction.proposedFormState.goal.includes("BTC AI 机会雷达"));
  assert.ok(queue.primaryAction.proposedFormState.goal.includes("btca"));
  assert.ok(queue.primaryAction.proposedFormState.goal.includes("避免 FOMO 追涨"));
  assert.ok(queue.primaryAction.proposedFormState.goal.includes("ETF 资金流退潮"));
  assert.ok(queue.primaryAction.proposedFormState.goal.includes("paper 验证"));
  assert.ok(queue.nextActions[0].includes("重做"));
});

test("aiRunFollowupQueueFromRuns turns completed strong validation into paper evidence follow-up", () => {
  const queue = aiRunFollowupQueueFromRuns(
    [
      {
        id: "goal_started_validation",
        goal: "BTC AI 机会雷达",
        symbols: ["BTC"],
        aiStatus: "ok",
        executionMode: "paper",
        strategyDraftCount: 2,
        contextNewsCount: 4,
        contextMacroCount: 1,
        contextOnchainCount: 1,
        createdAt: "2026-06-03T02:30:00.000Z",
        analysis: {
          goal: "BTC AI 机会雷达",
          context: { symbols: ["BTC"], newsCount: 4, macroCount: 1, onchainCount: 1 },
          execution: { mode: "paper" },
          humanFactors: ["避免 FOMO 追涨"],
          watchSignals: [{ signal: "ETF 资金流增强", action: "提高 paper 观察优先级" }],
          strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
        },
        actions: [
          {
            id: "backtest",
            status: "done",
            relatedId: "run_btc_1",
            href: "/backtests/run_btc_1",
            note: "已发起 1 个 AI 草案回测：btca",
          },
        ],
      },
    ],
    new Date("2026-06-03T04:00:00.000Z"),
    [
      {
        runId: "run_btc_1",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
  );

  assert.equal(queue.stage, "needs_attention");
  assert.equal(queue.items[0].actionKind, "paper_candidate_validation");
  assert.equal(queue.items[0].tone, "success");
  assert.ok(queue.items[0].title.includes("paper"));
  assert.ok(queue.items[0].detail.includes("优先 paper"));
  assert.ok(queue.items[0].detail.includes("评分"));
  assert.equal(queue.items[0].href, "/backtests/run_btc_1");
  assert.deepEqual(queue.primaryAction, {
    kind: "open_link",
    label: "查看 paper 候选证据",
    runId: "goal_started_validation",
    href: "/ai-money?runId=goal_started_validation",
  });
  assert.ok(queue.nextActions[0].includes("paper 候选"));
});

test("aiRunFollowupQueueFromRuns flags stale and thin-context AI runs for refresh", () => {
  const queue = aiRunFollowupQueueFromRuns(
    [
      {
        id: "thin",
        goal: "SOL 风向",
        symbols: ["SOL"],
        aiStatus: "fallback",
        executionMode: "observe",
        strategyDraftCount: 0,
        contextNewsCount: 0,
        contextMacroCount: 0,
        contextOnchainCount: 0,
        createdAt: "2026-06-02T12:00:00.000Z",
        actions: [],
      },
    ],
    new Date("2026-06-03T04:00:00.000Z"),
  );

  assert.equal(queue.stage, "needs_attention");
  assert.equal(queue.primaryAction.kind, "refresh_run");
  assert.equal(queue.primaryAction.runId, "thin");
  assert.equal(queue.items[0].runId, "thin");
  assert.equal(queue.items[0].actionKind, "refresh_context");
  assert.equal(queue.items[0].tone, "warning");
  assert.ok(queue.items[0].detail.includes("上下文"));
  assert.ok(queue.nextActions.some((item) => item.includes("重新扫描")));
});

test("aiRunFollowupQueueFromRuns does not repeatedly refresh a run already linked to a newer scan", () => {
  const queue = aiRunFollowupQueueFromRuns(
    [
      {
        id: "old",
        goal: "BTC 旧风向",
        symbols: ["BTC"],
        aiStatus: "fallback",
        executionMode: "paper",
        strategyDraftCount: 0,
        contextNewsCount: 0,
        contextMacroCount: 0,
        contextOnchainCount: 0,
        createdAt: "2026-06-02T00:00:00.000Z",
        actions: [
          {
            id: "refresh_context",
            status: "done",
            relatedId: "new",
            href: "/ai-money?runId=new",
            note: "已重新扫描为新 AI run。",
            updatedAt: "2026-06-03T04:00:00.000Z",
          },
        ],
      },
    ],
    new Date("2026-06-03T05:00:00.000Z"),
  );

  assert.equal(queue.stage, "steady");
  assert.equal(queue.primaryAction.kind, "open_run");
  assert.equal(queue.items[0].actionKind, "review_run");
  assert.equal(queue.items[0].href, "/ai-money?runId=new");
  assert.ok(queue.items[0].detail.includes("已重新扫描"));
});

test("aiInitialRunToOpenFromRuns chooses the highest-priority follow-up run", () => {
  const selected = aiInitialRunToOpenFromRuns({
    runs: [
      {
        id: "latest",
        goal: "最新普通复盘",
        symbols: ["ETH"],
        aiStatus: "ok",
        executionMode: "paper",
        strategyDraftCount: 0,
        contextNewsCount: 3,
        contextMacroCount: 1,
        contextOnchainCount: 1,
        createdAt: "2026-06-03T04:00:00.000Z",
        actions: [],
      },
      {
        id: "paper",
        goal: "paper 观察待复盘",
        symbols: ["BTC"],
        aiStatus: "ok",
        executionMode: "paper",
        strategyDraftCount: 1,
        contextNewsCount: 4,
        contextMacroCount: 1,
        contextOnchainCount: 1,
        createdAt: "2026-06-03T02:00:00.000Z",
        actions: [{ id: "paper_watch", status: "manual", href: "/backtests/run1" }],
      },
    ],
    now: new Date("2026-06-03T05:00:00.000Z"),
  });

  assert.equal(selected, "paper");
});

test("aiInitialRunToOpenFromRuns respects explicit and repeated open guards", () => {
  const runs = [{ id: "run1", goal: "BTC AI run", createdAt: "2026-06-03T04:00:00.000Z" }];

  assert.equal(aiInitialRunToOpenFromRuns({ runs, requestedRunId: "run1" }), null);
  assert.equal(aiInitialRunToOpenFromRuns({ runs, activeRunId: "run1" }), null);
  assert.equal(aiInitialRunToOpenFromRuns({ runs, alreadyOpenedRunId: "run1" }), null);
  assert.equal(aiInitialRunToOpenFromRuns({ runs: [] }), null);
  assert.equal(aiInitialRunToOpenFromRuns({ runs }), "run1");
});

test("aiRunRefreshComparisonFromRuns summarizes context and blueprint changes after a rescan", () => {
  const comparison = aiRunRefreshComparisonFromRuns([
    {
      id: "old",
      goal: "BTC 旧风向",
      summary: "旧判断：证据不足",
      symbols: ["BTC"],
      aiStatus: "fallback",
      executionMode: "paper",
      strategyDraftCount: 1,
      contextNewsCount: 0,
      contextMacroCount: 0,
      contextOnchainCount: 0,
      createdAt: "2026-06-02T00:00:00.000Z",
      analysis: {
        humanFactors: ["FOMO 风险不明"],
      },
      actions: [
        {
          id: "refresh_context",
          status: "done",
          relatedId: "new",
          href: "/ai-money?runId=new",
          note: "已重新扫描为新 AI run。",
          updatedAt: "2026-06-03T04:00:00.000Z",
        },
      ],
    },
    {
      id: "new",
      goal: "BTC 新风向",
      summary: "新判断：ETF 资金和链上证据改善",
      symbols: ["BTC", "ETH"],
      aiStatus: "ok",
      executionMode: "paper",
      strategyDraftCount: 3,
      contextNewsCount: 4,
      contextMacroCount: 1,
      contextOnchainCount: 2,
      createdAt: "2026-06-03T04:00:00.000Z",
      analysis: {
        humanFactors: ["FOMO 降温", "社媒拥挤度仍需观察"],
      },
    },
  ]);

  assert.equal(comparison.stage, "has_changes");
  assert.equal(comparison.items.length, 1);
  assert.equal(comparison.items[0].oldRunId, "old");
  assert.equal(comparison.items[0].newRunId, "new");
  assert.equal(comparison.items[0].href, "/ai-money?runId=new");
  assert.equal(comparison.items[0].contextDelta, 7);
  assert.equal(comparison.items[0].draftDelta, 2);
  assert.ok(comparison.items[0].highlights.some((item) => item.includes("上下文 +7")));
  assert.ok(comparison.items[0].highlights.some((item) => item.includes("蓝图 +2")));
  assert.ok(comparison.items[0].humanFactorChange.includes("FOMO 降温"));
});

test("aiRunRefreshComparisonFromRuns is empty without linked refresh runs", () => {
  const comparison = aiRunRefreshComparisonFromRuns([
    {
      id: "solo",
      goal: "BTC",
      strategyDraftCount: 1,
      contextNewsCount: 1,
      contextMacroCount: 0,
      contextOnchainCount: 0,
      actions: [],
    },
  ]);

  assert.equal(comparison.stage, "empty");
  assert.deepEqual(comparison.items, []);
});

test("aiMoneyBriefFromState starts idle users with today's scan action", () => {
  const brief = aiMoneyBriefFromState({
    analysis: null,
    runs: [],
    dailyRadarStatus: {
      hasToday: false,
      isStale: true,
      title: "今日雷达未扫描",
      tone: "warning",
      summary: "今天还没有 AI 机会雷达记录。",
      run: null,
      primaryAction: { kind: "scan_today", label: "今日扫描" },
    },
  });

  assert.equal(brief.stage, "idle");
  assert.equal(brief.tone, "warning");
  assert.equal(brief.confidence, 0);
  assert.deepEqual(brief.primaryAction, {
    kind: "scan_today",
    label: "今日扫描",
  });
  assert.ok(brief.summary.includes("扫描"));
  assert.ok(brief.checkpoints.some((item) => item.includes("市场")));
});

test("aiMoneyBriefFromState sends blocked idle provider brief to AI settings", () => {
  const providerGate = aiProviderReadinessGateFromStatus({
    status: "blocked",
    providerLabel: "OpenAI",
    keyConfigured: false,
    primaryHref: "/settings/ai",
    primaryAction: { kind: "open_link", label: "配置真实 AI" },
    summary: "当前启用 OpenAI，但 API key 未配置。",
  });
  const brief = aiMoneyBriefFromState({
    analysis: null,
    runs: [],
    dailyRadarStatus: {
      hasToday: false,
      isStale: true,
      title: "今日雷达未扫描",
      tone: "warning",
      summary: "今天还没有 AI 机会雷达记录。",
      run: null,
      primaryAction: { kind: "scan_today", label: "今日扫描" },
    },
    providerGate,
  });

  assert.equal(brief.stage, "provider_blocked");
  assert.equal(brief.tone, "warning");
  assert.equal(brief.confidence, 0);
  assert.deepEqual(brief.primaryAction, { kind: "open_link", label: "配置真实 AI" });
  assert.equal(brief.primaryHref, "/settings/ai");
  assert.ok(brief.summary.includes("OpenAI"));
  assert.ok(brief.audit.blockers.some((item) => item.includes("provider")));
  assert.ok(brief.checkpoints.some((item) => item.includes("provider")));
  assert.equal(brief.checkpoints.some((item) => item.includes("扫描今日市场")), false);
});

test("aiMoneyBriefFromState waits while idle provider status is loading", () => {
  const providerGate = aiProviderReadinessGateFromStatus(null, { loading: true });
  const brief = aiMoneyBriefFromState({
    analysis: null,
    runs: [],
    dailyRadarStatus: {
      hasToday: false,
      isStale: true,
      title: "今日雷达未扫描",
      tone: "warning",
      summary: "今天还没有 AI 机会雷达记录。",
      run: null,
      primaryAction: { kind: "scan_today", label: "今日扫描" },
    },
    providerGate,
  });

  assert.equal(brief.stage, "provider_loading");
  assert.ok(brief.title.includes("确认 AI provider"));
  assert.deepEqual(brief.primaryAction, { kind: "open_link", label: "查看 AI 配置" });
  assert.equal(brief.primaryHref, "/settings/ai");
  assert.ok(brief.audit.warnings.some((item) => item.includes("provider")));
});

test("aiMoneyBriefFromState keeps idle scan brief when provider is ready", () => {
  const providerGate = aiProviderReadinessGateFromStatus({
    status: "ready",
    providerLabel: "OpenAI",
    keyConfigured: true,
  });
  const brief = aiMoneyBriefFromState({
    analysis: null,
    runs: [],
    dailyRadarStatus: {
      hasToday: false,
      isStale: true,
      title: "今日雷达未扫描",
      tone: "warning",
      summary: "今天还没有 AI 机会雷达记录。",
      run: null,
      primaryAction: { kind: "scan_today", label: "今日扫描" },
    },
    providerGate,
  });

  assert.equal(brief.stage, "idle");
  assert.deepEqual(brief.primaryAction, { kind: "scan_today", label: "今日扫描" });
  assert.equal(brief.primaryHref, undefined);
  assert.ok(brief.summary.includes("扫描"));
});

test("aiMoneyBriefFromState prioritizes stale market context before execution", () => {
  const brief = aiMoneyBriefFromState({
    analysis: {
      goal: "低回撤赚钱",
      context: { notes: [], newsCount: 4, macroCount: 1, onchainCount: 1, symbols: ["BTC"] },
      execution: { mode: "paper", safetyGates: [] },
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
      humanFactors: [],
      watchSignals: [],
    },
    persistedActions: [],
    validationRuns: [],
    dailyRadarStatus: {
      hasToday: true,
      isStale: true,
      title: "今日雷达需刷新",
      tone: "warning",
      summary: "上次扫描已过去 7 小时。",
      run: { id: "run_old" },
      primaryAction: { kind: "rescan_today", label: "重新扫描" },
      secondaryAction: { kind: "open_today_run", label: "打开旧扫描" },
    },
  });

  assert.equal(brief.stage, "stale_context");
  assert.equal(brief.tone, "warning");
  assert.equal(brief.confidence <= 45, true);
  assert.deepEqual(brief.primaryAction, {
    kind: "rescan_today",
    label: "重新扫描",
  });
  assert.ok(brief.title.includes("刷新"));
  assert.ok(brief.checkpoints.some((item) => item.includes("舆论")));
});

test("aiMoneyBriefFromState exposes trust audit blockers for a thin AI plan", () => {
  const brief = aiMoneyBriefFromState({
    analysis: {
      goal: "低回撤赚钱",
      summary: "证据不足",
      createdAt: "2026-06-02T08:00:00.000Z",
      context: {
        notes: ["news unavailable"],
        newsCount: 0,
        macroCount: 0,
        onchainCount: 0,
        symbols: ["BTC"],
        recentRunCount: 0,
        recentRunSummaries: [],
      },
      execution: { mode: "paper", safetyGates: ["回测完成"] },
      strategyDrafts: [],
      humanFactors: [],
      watchSignals: [],
    },
    persistedActions: [],
    validationRuns: [],
    dailyRadarStatus: {
      hasToday: true,
      isStale: false,
      title: "今日雷达已扫描",
      tone: "success",
      summary: "今天已扫描 BTC。",
      run: { id: "run_today" },
      primaryAction: { kind: "open_today_run", label: "打开今日雷达" },
    },
  });

  assert.equal(brief.audit.tone, "danger");
  assert.ok(brief.audit.blockers.some((item) => item.includes("数据")));
  assert.ok(brief.audit.blockers.some((item) => item.includes("策略草案")));
  assert.ok(brief.audit.blockers.some((item) => item.includes("回测")));
  assert.ok(brief.audit.warnings.some((item) => item.includes("历史")));
});

test("aiMoneyBriefFromState summarizes a paper candidate with confidence and safe action", () => {
  const brief = aiMoneyBriefFromState({
    analysis: {
      goal: "低回撤赚钱",
      summary: "BTC 低回撤机会",
      createdAt: "2026-06-02T08:00:00.000Z",
      context: { notes: [], newsCount: 5, macroCount: 2, onchainCount: 2, symbols: ["BTC"] },
      execution: { mode: "paper", safetyGates: ["回测完成", "paper 观察"] },
      strategyDrafts: [
        {
          name: "btca",
          kind: "grid_dca",
          symbol: "BTC",
          params: {},
          riskCaps: {
            maxPositionUsd: 400,
            maxLeverage: 4,
            dailyLossCapUsd: 40,
          },
        },
      ],
      humanFactors: [],
      watchSignals: [],
    },
    persistedActions: [{ id: "sentiment_review", status: "done" }],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        progress: 1,
        metrics: {
          total_return: 0.12,
          sharpe: 1.6,
          max_dd: 0.06,
          n_trades: 36,
        },
      },
    ],
    dailyRadarStatus: {
      hasToday: true,
      isStale: false,
      title: "今日雷达已扫描",
      tone: "success",
      summary: "今天已扫描 BTC。",
      run: { id: "run_today" },
      primaryAction: { kind: "open_today_run", label: "打开今日雷达" },
    },
  });

  assert.equal(brief.stage, "paper_candidate");
  assert.equal(brief.tone, "success");
  assert.equal(brief.confidence >= 70, true);
  assert.deepEqual(brief.primaryAction, {
    kind: "accept_paper_candidate",
    label: "采用为 paper 候选",
  });
  assert.ok(brief.summary.includes("btca"));
  assert.ok(brief.metrics.some((item) => item.label === "资金计划" && String(item.value).includes("$")));
  assert.ok(brief.checkpoints.some((item) => item.includes("paper")));
});

test("aiMoneyBriefFromState keeps thin sentiment review out of ready audit and confidence", () => {
  const brief = aiMoneyBriefFromState({
    analysis: {
      goal: "低回撤赚钱",
      summary: "BTC 热门叙事机会",
      createdAt: "2026-06-02T08:00:00.000Z",
      context: { notes: [], newsCount: 5, macroCount: 2, onchainCount: 2, symbols: ["BTC"] },
      execution: { mode: "paper", safetyGates: ["回测完成", "paper 观察"] },
      strategyDrafts: [
        {
          name: "btca",
          kind: "grid_dca",
          symbol: "BTC",
          params: {},
          riskCaps: {
            maxPositionUsd: 400,
            maxLeverage: 4,
            dailyLossCapUsd: 40,
          },
        },
      ],
      humanFactors: ["FOMO 追涨风险"],
      watchSignals: [{ source: "human", signal: "社交媒体 FOMO" }],
    },
    persistedActions: [{ id: "sentiment_review", status: "done", note: "风向 / 人性复核已完成。" }],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        progress: 1,
        metrics: {
          total_return: 0.12,
          sharpe: 1.6,
          max_dd: 0.06,
          n_trades: 36,
        },
      },
    ],
    dailyRadarStatus: {
      hasToday: true,
      isStale: false,
      title: "今日雷达已扫描",
      tone: "success",
      summary: "今天已扫描 BTC。",
      run: { id: "run_today" },
      primaryAction: { kind: "open_today_run", label: "打开今日雷达" },
    },
  });

  assert.equal(brief.stage, "sentiment_review");
  assert.equal(brief.confidence < 90, true);
  assert.equal(
    brief.audit.ready.some((item) => item.includes("风向 / 人性风险已平衡")),
    false,
  );
  assert.ok(brief.audit.warnings.some((item) => item.includes("风向 / 人性偏差仍需复核")));
});

test("aiMoneyBriefFromState keeps thin completed paper watch out of ready audit and confidence", () => {
  const brief = aiMoneyBriefFromState({
    analysis: {
      goal: "低回撤赚钱",
      summary: "BTC 低回撤机会",
      createdAt: "2026-06-02T08:00:00.000Z",
      context: { notes: [], newsCount: 0, macroCount: 0, onchainCount: 0, symbols: ["BTC"] },
      execution: { mode: "testnet", safetyGates: ["回测完成", "paper review evidence"] },
      strategyDrafts: [
        {
          name: "btca",
          kind: "grid_dca",
          symbol: "BTC",
          params: {},
          riskCaps: {
            maxPositionUsd: 400,
            maxLeverage: 4,
            dailyLossCapUsd: 40,
          },
        },
      ],
      humanFactors: [],
      watchSignals: [],
    },
    persistedActions: [
      { id: "sentiment_review", status: "done" },
      { id: "paper_watch", status: "done", href: "/backtests/run_btc", note: "Paper 已完成" },
    ],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        progress: 1,
        metrics: {
          total_return: 0.12,
          sharpe: 1.6,
          max_dd: 0.06,
          n_trades: 36,
        },
      },
    ],
    dailyRadarStatus: {
      hasToday: true,
      isStale: false,
      title: "今日雷达已扫描",
      tone: "success",
      summary: "今天已扫描 BTC。",
      run: { id: "run_today" },
      primaryAction: { kind: "open_today_run", label: "打开今日雷达" },
    },
  });

  assert.equal(brief.stage, "paper_watch");
  assert.equal(brief.tone, "warning");
  assert.equal(brief.confidence < 95, true);
  assert.equal(
    brief.audit.ready.some((item) => item.includes("paper 观察已完成")),
    false,
  );
  assert.ok(brief.audit.warnings.some((item) => item.includes("paper 复盘证据不足")));
});

test("aiSentimentCompassFromAnalysis summarizes market, human and sentiment pressure", () => {
  const compass = aiSentimentCompassFromAnalysis({
    marketRead: "BTC 突破后波动放大，宏观利率仍有不确定性。",
    humanFactors: ["新闻热度过高，容易 FOMO 追涨。", "散户贪婪升温，拥挤交易风险上升。"],
    watchSignals: [
      {
        source: "news",
        signal: "ETF 新闻热度",
        interpretation: "利好叙事过热但价格跟随不足。",
        action: "等待回踩确认。",
      },
      {
        source: "human",
        signal: "社交媒体 FOMO",
        interpretation: "追涨情绪升温。",
        action: "降低 paper 仓位。",
      },
      {
        source: "onchain",
        signal: "交易所净流入",
        interpretation: "潜在卖压增加。",
        action: "观察 24 小时。",
      },
    ],
    context: {
      newsCount: 5,
      macroCount: 1,
      onchainCount: 2,
      notes: [],
    },
  });

  assert.equal(compass.stage, "heated");
  assert.equal(compass.tone, "warning");
  assert.equal(compass.metrics.find((item) => item.label === "舆论温度").value, "偏热");
  assert.equal(compass.metrics.find((item) => item.label === "人性偏差").value, 2);
  assert.equal(compass.metrics.find((item) => item.label === "市场上下文").value, "5/1/2");
  assert.equal(compass.risks[0].includes("FOMO"), true);
  assert.equal(compass.opportunities[0].includes("ETF 新闻热度"), true);
  assert.equal(compass.actions[0], "等待回踩确认。");
});

test("aiSentimentCompassFromAnalysis warns when evidence is thin", () => {
  const compass = aiSentimentCompassFromAnalysis({
    humanFactors: [],
    watchSignals: [],
    context: {
      newsCount: 0,
      macroCount: 0,
      onchainCount: 0,
      notes: ["timescale not configured"],
    },
  });

  assert.equal(compass.stage, "data_gap");
  assert.equal(compass.tone, "warning");
  assert.equal(compass.summary.includes("上下文不足"), true);
  assert.deepEqual(compass.actions, ["先补齐新闻、宏观或链上数据，再让 AI 重新扫描。"]);
});

test("aiMarketMemoryFromState surfaces recent market and human memory", () => {
  const memory = aiMarketMemoryFromState({
    analysis: {
      context: {
        recentRunSummaries: [
          {
            id: "goal_new",
            goal: "BTC 新风向",
            marketRead: "ETF 资金转暖但社媒拥挤。",
            humanFactors: ["FOMO 追涨", "拥挤交易"],
            watchSignalCount: 2,
            watchSignalHighlights: ["ETF 流入放缓", "资金费率过热"],
            openActionCount: 1,
          },
        ],
      },
    },
  });

  assert.equal(memory.stage, "remembering");
  assert.equal(memory.metrics[0].value, 1);
  assert.equal(memory.metrics[1].value, 2);
  assert.equal(memory.metrics[2].value, 2);
  assert.equal(memory.items[0].marketRead, "ETF 资金转暖但社媒拥挤。");
  assert.deepEqual(memory.items[0].humanFactors, ["FOMO 追涨", "拥挤交易"]);
  assert.deepEqual(memory.items[0].watchSignals, ["ETF 流入放缓", "资金费率过热"]);
  assert.equal(memory.items[0].href, "/ai-money?runId=goal_new");
});

test("aiMarketWatchtowerFromState starts idle users with today's observation lanes", () => {
  const watchtower = aiMarketWatchtowerFromState({
    dailyRadarStatus: {
      summary: "今日雷达尚未运行。",
      primaryAction: { kind: "scan_today", label: "今日扫描" },
    },
  });

  assert.equal(watchtower.stage, "scan");
  assert.equal(watchtower.tone, "warning");
  assert.deepEqual(watchtower.primaryAction, { kind: "scan_today", label: "今日扫描" });
  assert.equal(watchtower.metrics.find((item) => item.label === "观察重点").value, "今日扫描");
  assert.deepEqual(
    watchtower.signals.map((signal) => [signal.source, signal.severity]),
    [
      ["news", "watch"],
      ["macro", "watch"],
      ["onchain", "watch"],
    ],
  );
  assert.ok(watchtower.stopRules.some((rule) => rule.includes("不进入交易")));
});

test("aiMarketWatchtowerFromState blocks on context gaps before AI adoption", () => {
  const watchtower = aiMarketWatchtowerFromState({
    analysis: {
      context: {
        newsCount: 0,
        macroCount: 0,
        onchainCount: 0,
        notes: ["news ingest missing", "onchain source stale"],
      },
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
      watchSignals: [],
      humanFactors: [],
    },
  });

  assert.equal(watchtower.stage, "data_gap");
  assert.equal(watchtower.tone, "warning");
  assert.deepEqual(watchtower.primaryAction, { kind: "rescan_today", label: "刷新 AI 雷达" });
  assert.equal(watchtower.signals[0].severity, "high");
  assert.ok(watchtower.signals[0].detail.includes("news ingest missing"));
  assert.ok(watchtower.nextChecks.some((item) => item.includes("重新扫描")));
});

test("aiMarketWatchtowerFromState prioritizes sentiment review before paper adoption", () => {
  const watchtower = aiMarketWatchtowerFromState({
    analysis: {
      context: { newsCount: 5, macroCount: 1, onchainCount: 1, notes: [] },
      strategyDrafts: [
        {
          name: "btca",
          kind: "grid_dca",
          symbol: "BTC",
          params: {},
          riskCaps: { maxPositionUsd: 400, maxLeverage: 4, dailyLossCapUsd: 40 },
        },
      ],
      humanFactors: ["社媒 FOMO 升温", "连续上涨后容易追单"],
      watchSignals: [
        {
          source: "news",
          signal: "ETF 新闻热度",
          interpretation: "叙事拥挤。",
          action: "采用 paper 前先降仓。",
        },
      ],
      execution: { safetyGates: ["paper 观察", "组合限额"] },
    },
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
  });

  assert.equal(watchtower.stage, "sentiment_review");
  assert.equal(watchtower.tone, "warning");
  assert.equal(watchtower.primaryHref, "/data-explorer/news");
  assert.ok(watchtower.signals.some((signal) => signal.source === "human" && signal.severity === "high"));
  assert.ok(watchtower.signals.some((signal) => signal.label.includes("ETF 新闻热度")));
  assert.ok(watchtower.stopRules.some((rule) => rule.includes("风向")));
});

test("aiMarketWatchtowerFromState keeps thin sentiment review before paper adoption", () => {
  const watchtower = aiMarketWatchtowerFromState({
    analysis: {
      context: { newsCount: 5, macroCount: 1, onchainCount: 1, notes: [] },
      strategyDrafts: [
        {
          name: "btca",
          kind: "grid_dca",
          symbol: "BTC",
          params: {},
          riskCaps: { maxPositionUsd: 400, maxLeverage: 4, dailyLossCapUsd: 40 },
        },
      ],
      humanFactors: ["社媒 FOMO 升温", "连续上涨后容易追单"],
      watchSignals: [
        {
          source: "news",
          signal: "ETF 新闻热度",
          interpretation: "叙事拥挤。",
          action: "采用 paper 前先降仓。",
        },
      ],
      execution: { safetyGates: ["paper 观察", "组合限额"] },
    },
    persistedActions: [{ id: "sentiment_review", status: "done", note: "风向 / 人性复核已完成。" }],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
  });

  assert.equal(watchtower.stage, "sentiment_review");
  assert.equal(watchtower.primaryHref, "/data-explorer/news");
  assert.ok(watchtower.stopRules.some((rule) => rule.includes("风向 / 人性复核")));
});

test("backtestRunIdsFromAction extracts deduped ids from related id and href", () => {
  assert.deepEqual(
    backtestRunIdsFromAction({
      relatedId: " run_a,run_b,run_a ",
      href: "/backtests/run_c",
    }),
    ["run_a", "run_b", "run_c"],
  );
});

test("rankBacktestValidation scores completed runs and keeps non-terminal status visible", () => {
  const ranked = rankBacktestValidation([
    {
      runId: "bad",
      strategyId: "bad",
      state: 3,
      metrics: { total_return: -0.03, sharpe: 0.2, max_dd: -0.2, n_trades: 8 },
    },
    {
      runId: "best",
      strategyId: "best",
      state: 3,
      metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
    },
    {
      runId: "running",
      strategyId: "running",
      state: 2,
      progress: 0.4,
      metrics: {},
    },
  ]);

  assert.equal(ranked[0].runId, "best");
  assert.equal(ranked[0].recommendation, "优先 paper");
  assert.equal(ranked[0].tone, "success");
  assert.equal(ranked[1].runId, "bad");
  assert.equal(ranked[1].recommendation, "淘汰");
  assert.equal(ranked[2].runId, "running");
  assert.equal(ranked[2].recommendation, "验证中");
  assert.equal(ranked[2].score, null);
});

test("validationRunsNeedPolling keeps pending and running backtests live", () => {
  assert.equal(validationRunsNeedPolling([]), false);
  assert.equal(
    validationRunsNeedPolling([
      { runId: "done", state: 3 },
      { runId: "failed", state: 4 },
    ]),
    false,
  );
  assert.equal(validationRunsNeedPolling([{ runId: "pending", state: 1 }]), true);
  assert.equal(validationRunsNeedPolling([{ runId: "running", state: 2 }]), true);
  assert.equal(validationRunsNeedPolling([{ runId: "unknown", state: 9 }]), true);
});

test("paperCandidateFromValidation picks the best paper-ready draft", () => {
  const candidate = paperCandidateFromValidation(
    {
      strategyDrafts: [
        { name: "btca", kind: "grid_dca", symbol: "BTC", params: { stopProfitRate: 0.04 } },
        { name: "etha", kind: "grid_dca", symbol: "ETH", params: { stopProfitRate: 0.03 } },
      ],
    },
    [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
      {
        runId: "run_eth",
        strategyId: "etha",
        state: 3,
        metrics: { total_return: 0.02, sharpe: 0.5, max_dd: -0.12, n_trades: 12 },
      },
    ],
  );

  assert.equal(candidate.draft.name, "btca");
  assert.equal(candidate.runId, "run_btc");
  assert.equal(candidate.backtestHref, "/backtests/run_btc");
  assert.equal(candidate.strategyHref.startsWith("/option?source=ai-goal"), true);
  assert.equal(candidate.recommendation, "优先 paper");
});

test("paperCandidateFromValidation returns null when no run is paper-ready", () => {
  assert.equal(
    paperCandidateFromValidation(
      {
        strategyDrafts: [
          { name: "btca", kind: "grid_dca", symbol: "BTC", params: { stopProfitRate: 0.04 } },
        ],
      },
      [
        {
          runId: "run_btc",
          strategyId: "btca",
          state: 3,
          metrics: { total_return: -0.02, sharpe: 0.2, max_dd: -0.2, n_trades: 6 },
        },
      ],
    ),
    null,
  );
});

test("aiPaperAdoptionPackageFromState stays hidden without a paper candidate", () => {
  assert.equal(
    aiPaperAdoptionPackageFromState({
      analysis: null,
      persistedActions: [],
      validationRuns: [],
    }),
    null,
  );
});

test("aiPaperAdoptionPackageFromState packages a ready paper candidate", () => {
  const pkg = aiPaperAdoptionPackageFromState({
    analysis: {
      id: "goal_1",
      context: { notes: [], newsCount: 3, macroCount: 1, onchainCount: 1 },
      execution: { mode: "paper", safetyGates: ["回测完成", "paper 观察"] },
      humanFactors: ["避免 FOMO 追涨"],
      watchSignals: [{ source: "news", signal: "ETF inflows accelerate" }],
      strategyDrafts: [
        {
          name: "btca",
          kind: "grid_dca",
          symbol: "BTC",
          params: { stopProfitRate: 0.04 },
          riskCaps: { maxPositionUsd: 400, maxLeverage: 4, dailyLossCapUsd: 25 },
        },
      ],
    },
    persistedActions: [{ id: "sentiment_review", status: "done" }],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
    aiRunId: "goal_1",
  });

  assert.equal(pkg.stage, "ready_to_package");
  assert.equal(pkg.candidate.strategyId, "btca");
  assert.equal(pkg.candidate.draft.name, "btca");
  assert.deepEqual(pkg.primaryAction, {
    kind: "save_and_accept_paper_candidate",
    label: "保存并采用 paper",
  });
  assert.deepEqual(pkg.secondaryAction, {
    kind: "save_strategy_draft",
    label: "保存 AI 策略草案",
  });
  assert.ok(pkg.strategyHref.includes("aiRunId=goal_1"));
  assert.ok(pkg.riskSummary.includes("$400"));
  assert.ok(pkg.riskSummary.includes("4x"));
  assert.ok(pkg.riskSummary.includes("$25"));
  assert.ok(pkg.steps.some((step) => step.id === "save_strategy"));
  assert.ok(pkg.steps.some((step) => step.id === "paper_watch"));
  assert.ok(pkg.steps.some((step) => step.id === "execution_boundary"));
  assert.ok(pkg.guardrails.some((item) => item.includes("不会自动下单")));
});

test("aiPaperAdoptionPackageFromState does not resave an already saved paper candidate", () => {
  const pkg = aiPaperAdoptionPackageFromState({
    analysis: {
      id: "goal_1",
      context: { notes: [], newsCount: 3, macroCount: 1, onchainCount: 1 },
      execution: { mode: "paper", safetyGates: ["回测完成", "paper 观察"] },
      humanFactors: ["避免 FOMO 追涨"],
      watchSignals: [{ source: "news", signal: "ETF inflows accelerate" }],
      strategyDrafts: [
        {
          name: "btca",
          kind: "grid_dca",
          symbol: "BTC",
          params: { stopProfitRate: 0.04 },
          riskCaps: { maxPositionUsd: 400, maxLeverage: 4, dailyLossCapUsd: 25 },
        },
      ],
    },
    persistedActions: [
      {
        id: "strategy",
        status: "done",
        href: "/strategies/option_1?from=ai-draft&aiRunId=goal_1",
      },
      { id: "sentiment_review", status: "done" },
    ],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
    aiRunId: "goal_1",
  });

  assert.equal(pkg.stage, "strategy_saved");
  assert.deepEqual(pkg.primaryAction, {
    kind: "accept_paper_candidate",
    label: "采用 paper 观察",
  });
  assert.deepEqual(pkg.secondaryAction, {
    kind: "save_strategy_draft",
    label: "已保存 AI 策略",
  });
});

test("paperObservationPlanFromCandidate returns null without a paper candidate", () => {
  assert.equal(paperObservationPlanFromCandidate({}, null), null);
});

test("paperObservationPlanFromCandidate turns AI context into paper observation gates", () => {
  const plan = paperObservationPlanFromCandidate(
    {
      watchSignals: [
        {
          source: "news",
          signal: "ETF inflows fade",
          interpretation: "拥挤交易可能降温",
          action: "暂停加仓",
        },
      ],
      humanFactors: ["避免 FOMO 追涨"],
      execution: {
        safetyGates: ["回测完成", "mainnet token gate"],
      },
    },
    {
      draft: {
        name: "btca",
        symbol: "BTCUSDT",
        riskCaps: {
          maxPositionUsd: 200,
          maxLeverage: 4,
          dailyLossCapUsd: 18,
        },
      },
      score: 82,
      maxDrawdown: 0.06,
      strategyHref: "/option?source=ai-goal&name=btca",
      backtestHref: "/backtests/run_btc",
    },
  );

  assert.equal(plan.title, "btca paper 观察计划");
  assert.equal(plan.window, "24-72 小时");
  assert.ok(plan.summary.includes("评分 82"));
  assert.ok(plan.stopRules.some((rule) => rule.includes("9.00%")));
  assert.ok(plan.checklist.some((item) => item.includes("$200")));
  assert.ok(plan.checklist.some((item) => item.includes("$18")));
  assert.ok(plan.checklist.some((item) => item.includes("4x")));
  assert.ok(plan.triggers.some((trigger) => trigger.source === "news" && trigger.action === "暂停加仓"));
  assert.ok(plan.triggers.some((trigger) => trigger.source === "human"));
  assert.deepEqual(
    plan.links.map((link) => [link.label, link.href]),
    [
      ["预填策略", "/option?source=ai-goal&name=btca"],
      ["回测详情", "/backtests/run_btc"],
      ["交易闸门", "/settings/trading"],
    ],
  );
});

test("paperWatchActionPatchFromCandidate persists the AI paper observation handoff", () => {
  const patch = paperWatchActionPatchFromCandidate(
    {
      watchSignals: [
        {
          source: "human",
          signal: "社媒 FOMO",
          interpretation: "追涨情绪升温。",
          action: "降低 paper 仓位。",
        },
      ],
      humanFactors: ["拥挤交易风险"],
    },
    {
      strategyId: "btca",
      runId: "run_backtest_1",
      score: 82,
      totalReturn: 0.18,
      maxDrawdown: 0.08,
      sharpe: 1.35,
      backtestHref: "/backtests/run_backtest_1",
      draft: {
        name: "btca",
        riskCaps: {
          maxPositionUsd: 200,
          maxLeverage: 4,
          dailyLossCapUsd: 18,
        },
      },
    },
  );

  assert.equal(patch.status, "manual");
  assert.equal(patch.relatedId, "btca");
  assert.equal(patch.href, "/backtests/run_backtest_1");
  assert.ok(patch.note.includes("AI paper 观察计划"));
  assert.ok(patch.note.includes("24-72 小时"));
  assert.ok(patch.note.includes("社媒 FOMO"));
  assert.ok(patch.note.includes("降低 paper 仓位"));
  assert.ok(patch.note.includes("回撤"));
  assert.ok(patch.note.includes("$200"));
  assert.ok(patch.note.includes("$18"));
  assert.ok(patch.note.includes("4x"));
});

test("savedStrategyPaperWatchPatchFromBacktest persists paper observation for a completed saved strategy backtest", () => {
  const patch = savedStrategyPaperWatchPatchFromBacktest(
    {
      id: "opt123",
      name: "btca",
      execSymbol: "BTCUSDT",
    },
    {
      runId: "run_btc",
      strategyId: "opt123",
      state: 3,
      metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
    },
  );

  assert.equal(patch.status, "manual");
  assert.equal(patch.relatedId, "run_btc");
  assert.equal(patch.href, "/backtests/run_btc");
  assert.ok(patch.note.includes("btca"));
  assert.ok(patch.note.includes("24-72"));
  assert.ok(patch.note.includes("市场风向"));
  assert.ok(patch.note.includes("人性偏差"));
  assert.ok(patch.note.includes("执行摩擦"));
  assert.ok(patch.note.includes("不进入测试网或主网"));
});

test("aiPaperReviewCoachFromState guides an active paper watch with required evidence lanes", () => {
  const coach = aiPaperReviewCoachFromState({
    analysis: {
      context: { notes: [], newsCount: 3, macroCount: 1, onchainCount: 1 },
      execution: { mode: "paper", safetyGates: ["组合限额"] },
      humanFactors: ["FOMO 追涨"],
      watchSignals: [{ source: "news", signal: "ETF inflows accelerate" }],
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
    },
    persistedActions: [{ id: "paper_watch", status: "manual", href: "/backtests/run_btc" }],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
  });

  assert.equal(coach.stage, "observing");
  assert.equal(coach.primaryHref, "/backtests/run_btc");
  assert.ok(coach.items.some((item) => item.id === "market" && item.status === "missing"));
  assert.ok(coach.items.some((item) => item.id === "human" && item.label.includes("人性")));
  assert.ok(coach.completionNote.includes("24-72"));
  assert.ok(coach.completionNote.includes("执行摩擦"));
});

test("aiMarketWatchtowerFromState surfaces market context highlights as observable signals", () => {
  const tower = aiMarketWatchtowerFromState({
    analysis: {
      context: {
        notes: [],
        newsCount: 1,
        macroCount: 1,
        onchainCount: 1,
        marketContextHighlights: [
          {
            id: "news_0",
            source: "news",
            label: "ETF inflows accelerate",
            detail: "cryptopanic sentiment=+0.72 symbols=BTC",
            at: "2026-06-02T08:00:00Z",
          },
          {
            id: "macro_0",
            source: "macro",
            label: "fred.FEDFUNDS",
            detail: "latest value 5.25%",
            at: "2026-06-02T08:00:00Z",
          },
        ],
      },
      execution: { mode: "paper", safetyGates: ["risk caps"] },
      humanFactors: [],
      watchSignals: [],
      strategyDrafts: [],
    },
  });

  assert.ok(
    tower.signals.some(
      (signal) =>
        signal.source === "news" &&
        signal.label.includes("ETF inflows accelerate") &&
        signal.detail.includes("sentiment=+0.72"),
    ),
    `expected news highlight signal, got ${JSON.stringify(tower.signals)}`,
  );
  assert.ok(
    tower.signals.some(
      (signal) => signal.source === "macro" && signal.label.includes("FEDFUNDS"),
    ),
    `expected macro highlight signal, got ${JSON.stringify(tower.signals)}`,
  );
});

test("aiPaperReviewCoachFromState exposes a direct paper adoption action for ready candidates", () => {
  const coach = aiPaperReviewCoachFromState({
    analysis: {
      context: { notes: [], newsCount: 3, macroCount: 1, onchainCount: 1 },
      execution: { mode: "paper", safetyGates: ["组合限额"] },
      humanFactors: ["避免 FOMO 追涨"],
      watchSignals: [{ source: "news", signal: "ETF inflows accelerate" }],
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
    },
    persistedActions: [{ id: "sentiment_review", status: "done" }],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
  });

  assert.equal(coach.stage, "ready_to_adopt");
  assert.deepEqual(coach.primaryAction, {
    kind: "save_and_accept_paper_candidate",
    label: "保存并采用 paper",
  });
  assert.equal(coach.primaryHref, "/backtests/run_btc");
  assert.ok(coach.summary.includes("paper 条件"));
  assert.ok(coach.nextActions.some((item) => item.includes("采用为 paper 候选")));
  assert.ok(coach.nextActions.some((item) => item.includes("观察")));
});

test("paperReviewCoachPrimaryAction maps ready paper review to adoption when a candidate is available", () => {
  const state = {
    stage: "ready_to_adopt",
    primaryHref: "/backtests/run_btc",
    primaryAction: { kind: "save_and_accept_paper_candidate", label: "保存并采用 paper" },
  };

  assert.deepEqual(paperReviewCoachPrimaryAction(state, { hasCandidate: true }), {
    kind: "save_and_accept_paper_candidate",
    label: "保存并采用 paper",
    href: undefined,
  });
  assert.deepEqual(paperReviewCoachPrimaryAction(state, { hasCandidate: false }), {
    kind: "open_link",
    label: "查看观察",
    href: "/backtests/run_btc",
  });
});

test("aiPaperReviewCoachFromState holds completed paper watch when review evidence is thin", () => {
  const coach = aiPaperReviewCoachFromState({
    analysis: {
      context: { notes: [], newsCount: 3, macroCount: 1, onchainCount: 1 },
      execution: { mode: "paper", safetyGates: ["组合限额"] },
      humanFactors: ["FOMO 追涨"],
      watchSignals: [{ source: "news", signal: "ETF inflows accelerate" }],
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
    },
    persistedActions: [
      {
        id: "paper_watch",
        status: "done",
        href: "/backtests/run_btc",
        note: "Paper 已完成",
      },
    ],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
  });

  assert.equal(coach.stage, "evidence_gap");
  assert.equal(coach.tone, "warning");
  assert.ok(coach.summary.includes("复盘证据不足"));
  assert.ok(coach.missingEvidence.some((item) => item.includes("市场风向")));
  assert.ok(coach.missingEvidence.some((item) => item.includes("舆论")));
  assert.ok(coach.missingEvidence.some((item) => item.includes("人性")));
  assert.ok(coach.missingEvidence.some((item) => item.includes("执行摩擦")));
});

test("aiPaperReviewCoachFromState requires drawdown and testnet boundary evidence", () => {
  const coach = aiPaperReviewCoachFromState({
    analysis: {
      context: { notes: [], newsCount: 3, macroCount: 1, onchainCount: 1 },
      execution: { mode: "paper", safetyGates: ["组合限额"] },
      humanFactors: [],
      watchSignals: [],
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
    },
    persistedActions: [
      {
        id: "paper_watch",
        status: "done",
        href: "/backtests/run_btc",
        note:
          "Paper 观察已完成 24-72 小时复盘：已检查市场风向、舆论变化、人性偏差和执行摩擦。",
      },
    ],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
  });

  assert.equal(coach.stage, "evidence_gap");
  assert.equal(coach.tone, "warning");
  assert.ok(coach.missingEvidence.some((item) => item.includes("回撤")));
  assert.ok(coach.missingEvidence.some((item) => item.includes("测试网")));
});

test("aiCapitalPlanFromState waits for a paper candidate before sizing", () => {
  const plan = aiCapitalPlanFromState({
    analysis: {
      context: { notes: [], newsCount: 2, macroCount: 1, onchainCount: 1 },
      execution: { mode: "paper", safetyGates: [] },
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
    },
    candidate: null,
    persistedActions: [],
  });

  assert.equal(plan.stage, "waiting_validation");
  assert.equal(plan.tone, "warning");
  assert.deepEqual(plan.primaryAction, {
    kind: "run_all_backtests",
    label: "运行 AI 批量回测",
  });
  assert.equal(plan.metrics.find((item) => item.label === "建议仓位").value, "—");
  assert.ok(plan.actions.some((item) => item.includes("先完成 AI 回测验证")));
});

test("aiCapitalPlanFromState sizes a heated paper candidate conservatively", () => {
  const plan = aiCapitalPlanFromState({
    analysis: {
      context: { notes: [], newsCount: 5, macroCount: 1, onchainCount: 2 },
      execution: { mode: "paper", safetyGates: [] },
      humanFactors: ["FOMO 追涨风险"],
      watchSignals: [{ source: "human", signal: "社交媒体 FOMO" }],
    },
    candidate: {
      draft: {
        name: "btca",
        riskCaps: {
          maxPositionUsd: 400,
          maxLeverage: 4,
          dailyLossCapUsd: 40,
        },
      },
      score: 82,
      maxDrawdown: 0.06,
      strategyHref: "/option?source=ai-goal&name=btca",
      backtestHref: "/backtests/run_btc",
    },
    persistedActions: [],
  });

  assert.equal(plan.stage, "review_before_sizing");
  assert.equal(plan.tone, "warning");
  assert.equal(plan.recommendedNotionalUsd, 0);
  assert.equal(plan.maxDailyLossUsd, 0);
  assert.equal(plan.riskDiscount, 0);
  assert.equal(plan.primaryHref, "/data-explorer/news");
  assert.deepEqual(plan.primaryAction, {
    kind: "open_link",
    label: "打开风向复核",
  });
  assert.ok(plan.actions.some((item) => item.includes("完成风向 / 人性复核")));
});

test("aiCapitalPlanFromState produces a paper sizing plan after sentiment review", () => {
  const plan = aiCapitalPlanFromState({
    analysis: {
      context: { notes: [], newsCount: 5, macroCount: 1, onchainCount: 2 },
      execution: { mode: "paper", safetyGates: [] },
      humanFactors: ["FOMO 追涨风险"],
      watchSignals: [{ source: "human", signal: "社交媒体 FOMO" }],
    },
    candidate: {
      draft: {
        name: "btca",
        riskCaps: {
          maxPositionUsd: 400,
          maxLeverage: 4,
          dailyLossCapUsd: 40,
        },
      },
      score: 82,
      maxDrawdown: 0.06,
      strategyHref: "/option?source=ai-goal&name=btca",
      backtestHref: "/backtests/run_btc",
    },
    persistedActions: [{ id: "sentiment_review", status: "done" }],
  });

  assert.equal(plan.stage, "paper_sizing");
  assert.equal(plan.tone, "success");
  assert.equal(plan.recommendedNotionalUsd, 200);
  assert.equal(plan.maxDailyLossUsd, 18);
  assert.equal(plan.riskDiscount, 0.5);
  assert.equal(plan.metrics.find((item) => item.label === "建议仓位").value, "$200");
  assert.equal(plan.metrics.find((item) => item.label === "日亏损上限").value, "$18");
  assert.equal(plan.metrics.find((item) => item.label === "风险折扣").value, "50%");
  const primaryParams = new URLSearchParams(plan.primaryHref.split("?")[1]);
  assert.equal(primaryParams.get("orderGroupMargin"), "200");
  assert.equal(primaryParams.get("riskMaxPositionUsd"), "400");
  assert.deepEqual(plan.primaryAction, {
    kind: "accept_paper_candidate",
    label: "采用 paper 计划",
  });
  assert.ok(plan.rules.some((item) => item.includes("4x")));
});

test("paperCandidateWithCapitalPlan applies AI sizing caps to paper adoption candidate", () => {
  const candidate = {
    draft: {
      name: "btca",
      kind: "grid_dca",
      symbol: "BTC",
      params: {
        orderGroupMargin: 400,
      },
      riskCaps: {
        maxPositionUsd: 400,
        maxLeverage: 4,
        dailyLossCapUsd: 40,
      },
    },
    runId: "run_btc",
    strategyId: "btca-BTC",
    score: 82,
    totalReturn: 0.18,
    sharpe: 1.2,
    maxDrawdown: 0.06,
    nTrades: 20,
    recommendation: "优先 paper",
    strategyHref:
      "/option?source=ai-goal&name=btca&riskMaxPositionUsd=400&riskMaxLeverage=4&riskDailyLossCapUsd=40",
    backtestHref: "/backtests/run_btc",
  };

  const sized = paperCandidateWithCapitalPlan(candidate, {
    stage: "paper_sizing",
    recommendedNotionalUsd: 200,
    maxDailyLossUsd: 18,
  });

  assert.notEqual(sized, candidate);
  assert.notEqual(sized.draft, candidate.draft);
  assert.equal(sized.draft.riskCaps.maxPositionUsd, 200);
  assert.equal(sized.draft.riskCaps.maxLeverage, 4);
  assert.equal(sized.draft.riskCaps.dailyLossCapUsd, 18);
  assert.equal(sized.draft.params.orderGroupMargin, 200);
  assert.equal(candidate.draft.riskCaps.maxPositionUsd, 400);
  assert.equal(candidate.draft.riskCaps.dailyLossCapUsd, 40);
  assert.equal(candidate.draft.params.orderGroupMargin, 400);

  const params = new URLSearchParams(sized.strategyHref.split("?")[1]);
  assert.equal(params.get("riskMaxPositionUsd"), "200");
  assert.equal(params.get("riskMaxLeverage"), "4");
  assert.equal(params.get("riskDailyLossCapUsd"), "18");
  assert.equal(params.get("orderGroupMargin"), "200");

  assert.equal(
    paperCandidateWithCapitalPlan(candidate, { stage: "review_before_sizing" }),
    candidate,
  );
});

test("aiCapitalPlanFromState blocks paper sizing when sentiment review evidence is thin", () => {
  const plan = aiCapitalPlanFromState({
    analysis: {
      context: { notes: [], newsCount: 5, macroCount: 1, onchainCount: 2 },
      execution: { mode: "paper", safetyGates: [] },
      humanFactors: ["FOMO 追涨风险"],
      watchSignals: [{ source: "human", signal: "社交媒体 FOMO" }],
    },
    candidate: {
      draft: {
        name: "btca",
        riskCaps: {
          maxPositionUsd: 400,
          maxLeverage: 4,
          dailyLossCapUsd: 40,
        },
      },
      score: 82,
      maxDrawdown: 0.06,
      strategyHref: "/option?source=ai-goal&name=btca",
      backtestHref: "/backtests/run_btc",
    },
    persistedActions: [{ id: "sentiment_review", status: "done", note: "风向 / 人性复核已完成。" }],
  });

  assert.equal(plan.stage, "review_before_sizing");
  assert.equal(plan.recommendedNotionalUsd, 0);
  assert.equal(plan.maxDailyLossUsd, 0);
  assert.equal(plan.riskDiscount, 0);
  assert.deepEqual(plan.primaryAction, {
    kind: "open_link",
    label: "打开风向复核",
  });
});

test("aiSetupChecklistFromState blocks when AI, context, and safe account are missing", () => {
  const checklist = aiSetupChecklistFromState({
    analysis: {
      ai: { status: "fallback", error: "AI provider key not configured" },
      context: {
        newsCount: 0,
        macroCount: 0,
        onchainCount: 0,
        notes: ["timescale not configured; market context limited"],
      },
      execution: { mode: "paper", safetyGates: ["backtest"] },
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
      watchSignals: [],
      humanFactors: [],
    },
    validationRuns: [],
    accounts: [],
  });

  assert.equal(checklist.stage, "blocked");
  assert.equal(checklist.tone, "warning");
  assert.equal(checklist.score < 50, true);
  assert.equal(checklist.primaryHref, "/settings/ai");
  assert.deepEqual(checklist.primaryAction, { kind: "open_link", label: "配置 AI" });
  assert.equal(checklist.items.find((item) => item.id === "provider").status, "blocked");
  assert.equal(checklist.items.find((item) => item.id === "provider").href, "/settings/ai");
  assert.equal(checklist.items.find((item) => item.id === "context").status, "blocked");
  assert.ok(checklist.items.find((item) => item.id === "context").detail.includes("timescale"));
  assert.equal(checklist.items.find((item) => item.id === "safe_account").status, "blocked");
  assert.equal(checklist.items.find((item) => item.id === "safe_account").href, "/accounts/new");
});

test("aiSetupChecklistFromState uses a blocked provider gate before analysis runs", () => {
  const providerGate = aiProviderReadinessGateFromStatus({
    status: "blocked",
    providerLabel: "OpenAI",
    keyConfigured: false,
    primaryHref: "/settings/ai",
    primaryAction: { kind: "open_link", label: "配置真实 AI" },
    summary: "当前启用 OpenAI，但 API key 未配置。",
  });

  const checklist = aiSetupChecklistFromState({
    analysis: null,
    providerGate,
    dailyRadarStatus: {
      primaryAction: { kind: "scan_today", label: "今日扫描" },
    },
  });
  const provider = checklist.items.find((item) => item.id === "provider");

  assert.equal(provider.status, "blocked");
  assert.equal(provider.href, "/settings/ai");
  assert.ok(provider.detail.includes("OpenAI"));
  assert.equal(checklist.primaryHref, "/settings/ai");
  assert.deepEqual(checklist.primaryAction, { kind: "open_link", label: "配置 AI" });
});

test("aiSetupChecklistFromState treats a ready provider gate as ready before analysis runs", () => {
  const providerGate = aiProviderReadinessGateFromStatus({
    status: "ready",
    providerLabel: "OpenAI",
    model: "gpt-5.5",
    keyConfigured: true,
    primaryHref: "/ai-money?intent=rerun_ai",
    primaryAction: { kind: "open_link", label: "使用真实 AI 分析" },
    summary: "OpenAI 已可用于 AI Money。",
  });

  const checklist = aiSetupChecklistFromState({
    analysis: null,
    providerGate,
    dailyRadarStatus: {
      primaryAction: { kind: "scan_today", label: "今日扫描" },
    },
  });
  const provider = checklist.items.find((item) => item.id === "provider");

  assert.equal(provider.status, "ready");
  assert.equal(provider.href, undefined);
  assert.ok(provider.detail.includes("OpenAI"));
  assert.deepEqual(checklist.primaryAction, { kind: "scan_today", label: "今日扫描" });
});

test("aiProviderSetupPromptFromAnalysis turns fallback status into an AI settings action", () => {
  const prompt = aiProviderSetupPromptFromAnalysis({
    ai: { status: "fallback", error: "AI provider key not configured" },
  });

  assert.equal(prompt.title, "AI provider 未完成真实分析");
  assert.equal(prompt.primaryHref, "/settings/ai");
  assert.deepEqual(prompt.primaryAction, {
    kind: "open_link",
    label: "配置并测试 AI",
  });
  assert.ok(prompt.message.includes("AI provider key not configured"));
});

test("aiProviderSetupPromptFromAnalysis stays hidden when provider analysis succeeds", () => {
  assert.equal(
    aiProviderSetupPromptFromAnalysis({
      ai: { status: "ok", model: "claude-sonnet" },
    }),
    null,
  );
});

test("aiProviderReadinessGateFromStatus blocks AI Money when active provider key is missing", () => {
  const gate = aiProviderReadinessGateFromStatus({
    status: "blocked",
    tone: "warning",
    providerLabel: "OpenAI",
    model: "gpt-5.5",
    keyConfigured: false,
    primaryHref: "/settings/ai",
    primaryAction: { kind: "open_link", label: "配置真实 AI" },
    summary: "当前启用 OpenAI，但 API key 未配置。",
    nextActions: ["填写 OpenAI API key。", "测试连接。"],
  });

  assert.equal(gate.stage, "blocked");
  assert.equal(gate.visible, true);
  assert.equal(gate.blockManualAnalysis, true);
  assert.equal(gate.blockAutoRadar, true);
  assert.equal(gate.primaryHref, "/settings/ai");
  assert.deepEqual(gate.primaryAction, { kind: "open_link", label: "配置真实 AI" });
  assert.ok(gate.summary.includes("OpenAI"));
});

test("aiProviderReadinessGateFromStatus blocks only auto radar while provider status is loading", () => {
  const gate = aiProviderReadinessGateFromStatus(null, { loading: true });

  assert.equal(gate.stage, "loading");
  assert.equal(gate.visible, false);
  assert.equal(gate.blockManualAnalysis, false);
  assert.equal(gate.blockAutoRadar, true);
});

test("aiProviderReadinessGateFromStatus does not block existing flow when status is unavailable", () => {
  const gate = aiProviderReadinessGateFromStatus(null, { loading: false });

  assert.equal(gate.stage, "unknown");
  assert.equal(gate.visible, false);
  assert.equal(gate.blockManualAnalysis, false);
  assert.equal(gate.blockAutoRadar, false);
});

test("aiProviderAnalysisAttemptFromGate redirects blocked analysis attempts to AI settings", () => {
  const gate = aiProviderReadinessGateFromStatus({
    status: "blocked",
    providerLabel: "DeepSeek",
    keyConfigured: false,
    primaryHref: "/settings/ai",
    primaryAction: { kind: "open_link", label: "配置真实 AI" },
  });

  assert.deepEqual(aiProviderAnalysisAttemptFromGate(gate), {
    kind: "redirect",
    href: "/settings/ai",
    label: "配置真实 AI",
  });
});

test("aiProviderAnalysisAttemptFromGate allows ready and unknown provider states", () => {
  assert.deepEqual(
    aiProviderAnalysisAttemptFromGate(
      aiProviderReadinessGateFromStatus({
        status: "ready",
        providerLabel: "OpenAI",
        keyConfigured: true,
        primaryHref: "/ai-money?intent=rerun_ai",
        primaryAction: { kind: "open_link", label: "使用真实 AI 分析" },
      }),
    ),
    { kind: "allow" },
  );
  assert.deepEqual(aiProviderAnalysisAttemptFromGate(null), { kind: "allow" });
});

test("aiSetupChecklistFromState is ready when AI, evidence, account, limits, and validation exist", () => {
  const checklist = aiSetupChecklistFromState({
    analysis: {
      ai: { status: "ok", model: "claude-sonnet" },
      context: {
        newsCount: 2,
        macroCount: 1,
        onchainCount: 1,
        notes: [],
        execution: {
          accountCount: 1,
          tradeableAccountCount: 1,
          withdrawalEnabledAccountCount: 0,
          tradingHalted: false,
          portfolioLimits: {
            maxOpenNotionalUsd: 1000,
            maxOpenPositionsCount: 3,
            maxDailyLossUsd: 100,
          },
        },
      },
      execution: { mode: "paper", safetyGates: ["backtest", "人工复核"] },
      strategyDrafts: [
        {
          name: "btca",
          kind: "grid_dca",
          symbol: "BTCUSDT",
          params: {},
          riskCaps: { maxPositionUsd: 200, maxLeverage: 3, dailyLossCapUsd: 20 },
        },
      ],
      watchSignals: [],
      humanFactors: [],
    },
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        progress: 100,
        metrics: { total_return: 0.12, sharpe: 1.5, max_dd: -0.04, n_trades: 30 },
      },
    ],
    accounts: [
      {
        id: "acc_1",
        exchange: "binance",
        permissions: { canTrade: true, canDeposit: false, canWithdraw: false },
      },
    ],
  });

  assert.equal(checklist.stage, "ready");
  assert.equal(checklist.tone, "success");
  assert.equal(checklist.score >= 90, true);
  assert.equal(checklist.items.every((item) => item.status === "ready"), true);
  assert.ok(checklist.nextActions.some((item) => item.includes("AI 下一步")));
});

test("aiExecutionReadinessFromState blocks validated candidates without a tradeable account", () => {
  const readiness = aiExecutionReadinessFromState({
    analysis: {
      context: { newsCount: 1, macroCount: 1, onchainCount: 1, notes: [] },
      execution: { mode: "paper", safetyGates: ["backtest"] },
      watchSignals: [],
      strategyDrafts: [
        {
          name: "btca",
          kind: "grid_dca",
          symbol: "BTCUSDT",
          params: {},
          riskCaps: { maxPositionUsd: 200, maxLeverage: 3, dailyLossCapUsd: 20 },
        },
      ],
    },
    persistedActions: [{ id: "sentiment_review", status: "done" }],
    validationRuns: [
      {
        id: "run_btc",
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        progress: 100,
        metrics: { total_return: 0.12, sharpe: 1.5, max_dd: -0.04, n_trades: 30 },
      },
    ],
    accounts: [],
  });

  assert.equal(readiness.stage, "account_blocked");
  assert.equal(readiness.tone, "warning");
  assert.equal(readiness.primaryHref, "/accounts/new");
  assert.deepEqual(readiness.primaryAction, { kind: "open_link", label: "添加交易账户" });
  assert.ok(readiness.blockers.some((item) => item.includes("账户")));
});

test("aiExecutionReadinessFromState uses backend execution account context before accounts load", () => {
  const readiness = aiExecutionReadinessFromState({
    analysis: {
      context: {
        newsCount: 1,
        macroCount: 1,
        onchainCount: 1,
        notes: [],
        execution: {
          accountCount: 2,
          tradeableAccountCount: 1,
          withdrawalEnabledAccountCount: 1,
          tradingHalted: false,
          portfolioLimits: {
            maxOpenNotionalUsd: 1000,
            maxOpenPositionsCount: 3,
            maxDailyLossUsd: 100,
          },
        },
      },
      execution: { mode: "paper", safetyGates: ["backtest"] },
      watchSignals: [],
      strategyDrafts: [
        {
          name: "btca",
          kind: "grid_dca",
          symbol: "BTCUSDT",
          params: {},
          riskCaps: { maxPositionUsd: 200, maxLeverage: 3, dailyLossCapUsd: 20 },
        },
      ],
    },
    persistedActions: [{ id: "sentiment_review", status: "done" }],
    validationRuns: [
      {
        id: "run_btc",
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        progress: 100,
        metrics: { total_return: 0.12, sharpe: 1.5, max_dd: -0.04, n_trades: 30 },
      },
    ],
  });

  assert.equal(readiness.stage, "paper_ready");
  assert.equal(readiness.metrics.find((item) => item.label === "账户").value, "1/2");
  assert.ok(readiness.ready.some((item) => item.includes("后端执行快照")));
  assert.equal(readiness.blockers.some((item) => item.includes("账户")), false);
});

test("aiExecutionReadinessFromState blocks execution when backend context says trading is halted", () => {
  const readiness = aiExecutionReadinessFromState({
    analysis: {
      context: {
        newsCount: 1,
        macroCount: 1,
        onchainCount: 1,
        notes: [],
        execution: {
          accountCount: 1,
          tradeableAccountCount: 1,
          withdrawalEnabledAccountCount: 0,
          tradingHalted: true,
          haltedReason: "operator pause",
          portfolioLimits: {
            maxOpenNotionalUsd: 1000,
            maxOpenPositionsCount: 3,
            maxDailyLossUsd: 100,
          },
        },
      },
      execution: { mode: "paper", safetyGates: ["backtest"] },
      watchSignals: [],
      strategyDrafts: [
        {
          name: "btca",
          kind: "grid_dca",
          symbol: "BTCUSDT",
          params: {},
          riskCaps: { maxPositionUsd: 200, maxLeverage: 3, dailyLossCapUsd: 20 },
        },
      ],
    },
    persistedActions: [{ id: "sentiment_review", status: "done" }],
    validationRuns: [
      {
        id: "run_btc",
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        progress: 100,
        metrics: { total_return: 0.12, sharpe: 1.5, max_dd: -0.04, n_trades: 30 },
      },
    ],
  });

  assert.equal(readiness.stage, "trading_halted");
  assert.equal(readiness.primaryHref, "/settings/trading");
  assert.deepEqual(readiness.primaryAction, { kind: "open_link", label: "查看交易停机" });
  assert.ok(readiness.blockers.some((item) => item.includes("operator pause")));
});

test("aiExecutionReadinessFromState blocks execution when portfolio limits are unset", () => {
  const readiness = aiExecutionReadinessFromState({
    analysis: {
      context: {
        newsCount: 1,
        macroCount: 1,
        onchainCount: 1,
        notes: [],
        execution: {
          accountCount: 1,
          tradeableAccountCount: 1,
          withdrawalEnabledAccountCount: 0,
          tradingHalted: false,
          portfolioLimits: {
            maxOpenNotionalUsd: 0,
            maxOpenPositionsCount: 0,
            maxDailyLossUsd: 0,
          },
        },
      },
      execution: { mode: "paper", safetyGates: ["backtest"] },
      watchSignals: [],
      strategyDrafts: [
        {
          name: "btca",
          kind: "grid_dca",
          symbol: "BTCUSDT",
          params: {},
          riskCaps: { maxPositionUsd: 200, maxLeverage: 3, dailyLossCapUsd: 20 },
        },
      ],
    },
    persistedActions: [{ id: "sentiment_review", status: "done" }],
    validationRuns: [
      {
        id: "run_btc",
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        progress: 100,
        metrics: { total_return: 0.12, sharpe: 1.5, max_dd: -0.04, n_trades: 30 },
      },
    ],
  });

  assert.equal(readiness.stage, "risk_limits_blocked");
  assert.equal(readiness.primaryHref, "/settings/trading");
  assert.deepEqual(readiness.primaryAction, { kind: "open_link", label: "设置组合限额" });
  assert.ok(readiness.blockers.some((item) => item.includes("组合限额未设置")));
});

test("aiExecutionReadinessFromState promotes completed paper watch to testnet readiness", () => {
  const readiness = aiExecutionReadinessFromState({
    analysis: {
      context: { newsCount: 1, macroCount: 1, onchainCount: 1, notes: [] },
      execution: { mode: "paper", safetyGates: ["backtest", "mainnet token gate"] },
      watchSignals: [],
      strategyDrafts: [
        {
          name: "btca",
          kind: "grid_dca",
          symbol: "BTCUSDT",
          params: {},
          riskCaps: { maxPositionUsd: 200, maxLeverage: 3, dailyLossCapUsd: 20 },
        },
      ],
    },
    persistedActions: [
      { id: "sentiment_review", status: "done" },
      {
        id: "paper_watch",
        status: "done",
        href: "/backtests/run_btc",
        note:
          "Paper 观察已完成 24-72 小时复盘：已检查市场风向、舆论变化、人性偏差、执行摩擦和回撤表现；只允许进入测试网前检查，不进入主网。",
      },
    ],
    validationRuns: [
      {
        id: "run_btc",
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        progress: 100,
        metrics: { total_return: 0.12, sharpe: 1.5, max_dd: -0.04, n_trades: 30 },
      },
    ],
    accounts: [
      {
        id: "acc_1",
        exchange: "binance",
        permissions: { canTrade: true, canDeposit: false, canWithdraw: false },
      },
    ],
  });

  assert.equal(readiness.stage, "testnet_ready");
  assert.equal(readiness.tone, "success");
  assert.equal(readiness.score >= 90, true);
  assert.deepEqual(readiness.primaryAction, { kind: "open_link", label: "打开测试网策略" });
  assert.equal(readiness.primaryHref.includes("/option?"), true);
  assert.ok(readiness.ready.some((item) => item.includes("paper")));
  assert.equal(readiness.blockers.some((item) => item.includes("主网")), true);
});

test("aiExecutionReadinessFromState reuses saved AI-sized strategy href for testnet handoff", () => {
  const readiness = aiExecutionReadinessFromState({
    analysis: {
      context: { newsCount: 1, macroCount: 1, onchainCount: 1, notes: [] },
      execution: { mode: "paper", safetyGates: ["backtest", "mainnet token gate"] },
      watchSignals: [],
      strategyDrafts: [
        {
          name: "btca",
          kind: "grid_dca",
          symbol: "BTCUSDT",
          params: { orderGroupMargin: 400 },
          riskCaps: { maxPositionUsd: 400, maxLeverage: 4, dailyLossCapUsd: 40 },
        },
      ],
    },
    persistedActions: [
      { id: "sentiment_review", status: "done" },
      {
        id: "strategy",
        status: "ready",
        relatedId: "btca",
        href:
          "/option?source=ai-goal&name=btca&orderGroupMargin=200&riskMaxPositionUsd=200&riskMaxLeverage=4&riskDailyLossCapUsd=18",
      },
      {
        id: "paper_watch",
        status: "done",
        href: "/backtests/run_btc",
        note:
          "Paper 观察已完成 24-72 小时复盘：已检查市场风向、舆论变化、人性偏差、执行摩擦和回撤表现；只允许进入测试网前检查，不进入主网。",
      },
    ],
    validationRuns: [
      {
        id: "run_btc",
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        progress: 100,
        metrics: { total_return: 0.12, sharpe: 1.5, max_dd: -0.04, n_trades: 30 },
      },
    ],
    accounts: [
      {
        id: "acc_1",
        exchange: "binance",
        permissions: { canTrade: true, canDeposit: false, canWithdraw: false },
      },
    ],
  });
  const params = new URLSearchParams(readiness.primaryHref.split("?")[1]);

  assert.equal(readiness.stage, "testnet_ready");
  assert.equal(params.get("orderGroupMargin"), "200");
  assert.equal(params.get("riskMaxPositionUsd"), "200");
  assert.equal(readiness.primaryHref.includes("riskMaxPositionUsd=400"), false);
});

test("aiExecutionReadinessFromState blocks paper watch without drawdown and testnet boundary evidence", () => {
  const readiness = aiExecutionReadinessFromState({
    analysis: {
      context: { newsCount: 1, macroCount: 1, onchainCount: 1, notes: [] },
      execution: { mode: "paper", safetyGates: ["backtest", "mainnet token gate"] },
      watchSignals: [],
      strategyDrafts: [
        {
          name: "btca",
          kind: "grid_dca",
          symbol: "BTCUSDT",
          params: {},
          riskCaps: { maxPositionUsd: 200, maxLeverage: 3, dailyLossCapUsd: 20 },
        },
      ],
    },
    persistedActions: [
      { id: "sentiment_review", status: "done" },
      {
        id: "paper_watch",
        status: "done",
        href: "/backtests/run_btc",
        note:
          "Paper 观察已完成 24-72 小时复盘：已检查市场风向、舆论变化、人性偏差和执行摩擦。",
      },
    ],
    validationRuns: [
      {
        id: "run_btc",
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        progress: 100,
        metrics: { total_return: 0.12, sharpe: 1.5, max_dd: -0.04, n_trades: 30 },
      },
    ],
    accounts: [
      {
        id: "acc_1",
        exchange: "binance",
        permissions: { canTrade: true, canDeposit: false, canWithdraw: false },
      },
    ],
  });

  assert.equal(readiness.stage, "paper_watch");
  assert.equal(readiness.tone, "warning");
  assert.ok(readiness.blockers.some((item) => item.includes("复盘证据不足")));
  assert.equal(readiness.primaryHref, "/backtests/run_btc");
  assert.equal(readiness.primaryAction.label, "补齐 paper 复盘");
});

test("aiExecutionReadinessFromState blocks testnet readiness when sentiment review evidence is thin", () => {
  const readiness = aiExecutionReadinessFromState({
    analysis: {
      context: { newsCount: 4, macroCount: 1, onchainCount: 1, notes: [] },
      execution: { mode: "paper", safetyGates: ["backtest", "mainnet token gate"] },
      humanFactors: ["新闻热度过高，FOMO 追涨风险上升。"],
      watchSignals: [
        {
          source: "human",
          signal: "社交媒体 FOMO",
          interpretation: "追涨情绪过热。",
          action: "先确认是否降低 paper 仓位。",
        },
      ],
      strategyDrafts: [
        {
          name: "btca",
          kind: "grid_dca",
          symbol: "BTCUSDT",
          params: {},
          riskCaps: { maxPositionUsd: 200, maxLeverage: 3, dailyLossCapUsd: 20 },
        },
      ],
    },
    persistedActions: [
      { id: "sentiment_review", status: "done", note: "风向 / 人性复核已完成。" },
      {
        id: "paper_watch",
        status: "done",
        href: "/backtests/run_btc",
        note:
          "Paper 观察已完成 24-72 小时复盘：已检查市场风向、舆论变化、人性偏差、执行摩擦和回撤表现；只允许进入测试网前检查，不进入主网。",
      },
    ],
    validationRuns: [
      {
        id: "run_btc",
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        progress: 100,
        metrics: { total_return: 0.12, sharpe: 1.5, max_dd: -0.04, n_trades: 30 },
      },
    ],
    accounts: [
      {
        id: "acc_1",
        exchange: "binance",
        permissions: { canTrade: true, canDeposit: false, canWithdraw: false },
      },
    ],
  });

  assert.equal(readiness.stage, "sentiment_review");
  assert.equal(readiness.primaryHref, "/data-explorer/news");
  assert.deepEqual(readiness.primaryAction, { kind: "open_link", label: "打开风向复核" });
  assert.ok(readiness.blockers.some((item) => item.includes("风向 / 人性风险")));
});

test("aiExecutionReadinessFromState blocks completed paper watch without review evidence", () => {
  const readiness = aiExecutionReadinessFromState({
    analysis: {
      context: { newsCount: 1, macroCount: 1, onchainCount: 1, notes: [] },
      execution: { mode: "paper", safetyGates: ["backtest", "mainnet token gate"] },
      watchSignals: [],
      strategyDrafts: [
        {
          name: "btca",
          kind: "grid_dca",
          symbol: "BTCUSDT",
          params: {},
          riskCaps: { maxPositionUsd: 200, maxLeverage: 3, dailyLossCapUsd: 20 },
        },
      ],
    },
    persistedActions: [
      { id: "sentiment_review", status: "done" },
      {
        id: "paper_watch",
        status: "done",
        href: "/backtests/run_btc",
        note: "Paper 已完成",
      },
    ],
    validationRuns: [
      {
        id: "run_btc",
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        progress: 100,
        metrics: { total_return: 0.12, sharpe: 1.5, max_dd: -0.04, n_trades: 30 },
      },
    ],
    accounts: [
      {
        id: "acc_1",
        exchange: "binance",
        permissions: { canTrade: true, canDeposit: false, canWithdraw: false },
      },
    ],
  });

  assert.equal(readiness.stage, "paper_watch");
  assert.deepEqual(readiness.primaryAction, { kind: "open_link", label: "补齐 paper 复盘" });
  assert.ok(readiness.blockers.some((item) => item.includes("paper 复盘证据不足")));
  assert.equal(readiness.blockers.some((item) => item.includes("主网")), false);
});

test("aiExecutionPreviewFromState shows idle AI dry-run boundaries", () => {
  const preview = aiExecutionPreviewFromState({});

  assert.equal(preview.stage, "idle");
  assert.deepEqual(preview.primaryAction, {
    kind: "analyze_and_validate",
    label: "启动 AI 雷达",
  });
  assert.ok(preview.wouldDo.some((item) => item.includes("扫描")));
  assert.ok(preview.wouldDo.some((item) => item.includes("策略蓝图")));
  assert.ok(preview.willNotDo.some((item) => item.includes("不会下单")));
  assert.ok(preview.requiredHumanConfirmations.some((item) => item.includes("真实交易")));
});

test("aiExecutionPreviewFromState previews paper adoption without mainnet execution", () => {
  const preview = aiExecutionPreviewFromState({
    analysis: {
      context: {
        newsCount: 2,
        macroCount: 1,
        onchainCount: 1,
        notes: [],
        execution: {
          accountCount: 2,
          tradeableAccountCount: 1,
          withdrawalEnabledAccountCount: 1,
          tradingHalted: false,
          portfolioLimits: {
            maxOpenNotionalUsd: 1000,
            maxOpenPositionsCount: 3,
            maxDailyLossUsd: 100,
          },
        },
      },
      execution: {
        mode: "paper",
        safetyGates: ["回测完成", "人工复核", "mainnet token gate"],
      },
      watchSignals: [
        {
          source: "news",
          signal: "ETF inflows accelerate",
          interpretation: "资金流支持趋势，但要观察拥挤度。",
          action: "只进入 paper 观察。",
        },
      ],
      humanFactors: ["避免 FOMO 追涨"],
      strategyDrafts: [
        {
          name: "btca",
          kind: "grid_dca",
          symbol: "BTCUSDT",
          params: {},
          riskCaps: { maxPositionUsd: 200, maxLeverage: 3, dailyLossCapUsd: 20 },
        },
      ],
    },
    persistedActions: [{ id: "sentiment_review", status: "done" }],
    validationRuns: [
      {
        id: "run_btc",
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        progress: 100,
        metrics: { total_return: 0.12, sharpe: 1.5, max_dd: -0.04, n_trades: 30 },
      },
    ],
  });

  assert.equal(preview.stage, "paper_ready");
  assert.deepEqual(preview.primaryAction, {
    kind: "accept_paper_candidate",
    label: "采用为 paper 候选",
  });
  assert.ok(preview.wouldDo.some((item) => item.includes("paper 候选")));
  assert.ok(preview.willNotDo.some((item) => item.includes("主网")));
  assert.ok(preview.requiredHumanConfirmations.some((item) => item.includes("真实交易")));
  assert.ok(preview.requiredHumanConfirmations.some((item) => item.includes("paper 观察")));
});

test("aiMoneyPathFromState starts with a single safe scan step", () => {
  const path = aiMoneyPathFromState({
    analysis: null,
    persistedActions: [],
    validationRuns: [],
    runs: [],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-02T12:00:00.000Z")),
  });

  assert.equal(path.stage, "idle");
  assert.deepEqual(path.primaryAction, { kind: "scan_today", label: "运行 AI 扫描" });
  assert.equal(path.steps[0].id, "scan");
  assert.equal(path.steps[0].status, "current");
  assert.equal(path.steps[0].actionKind, "scan_today");
  assert.equal(
    path.steps.slice(1).every((step) => ["pending", "blocked"].includes(step.status)),
    true,
  );
  assert.ok(path.nextActions.some((item) => item.includes("AI 扫描")));
});

test("aiMoneyPathFromState sends blocked idle provider path to AI settings", () => {
  const providerGate = aiProviderReadinessGateFromStatus({
    status: "blocked",
    providerLabel: "OpenAI",
    keyConfigured: false,
    primaryHref: "/settings/ai",
    primaryAction: { kind: "open_link", label: "配置真实 AI" },
    summary: "当前启用 OpenAI，但 API key 未配置。",
  });
  const path = aiMoneyPathFromState({
    analysis: null,
    persistedActions: [],
    validationRuns: [],
    runs: [],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-02T12:00:00.000Z")),
    providerGate,
  });
  const stepById = Object.fromEntries(path.steps.map((step) => [step.id, step]));

  assert.equal(path.stage, "provider_blocked");
  assert.deepEqual(path.primaryAction, { kind: "open_link", label: "配置真实 AI" });
  assert.equal(path.primaryHref, "/settings/ai");
  assert.equal(path.currentStepId, "provider");
  assert.equal(stepById.provider.status, "blocked");
  assert.equal(stepById.provider.actionKind, "open_link");
  assert.equal(stepById.provider.href, "/settings/ai");
  assert.equal(stepById.scan.status, "pending");
  assert.equal(stepById.scan.actionKind, undefined);
});

test("aiMoneyPathFromState waits while idle provider status is loading", () => {
  const providerGate = aiProviderReadinessGateFromStatus(null, { loading: true });
  const path = aiMoneyPathFromState({
    analysis: null,
    persistedActions: [],
    validationRuns: [],
    runs: [],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-02T12:00:00.000Z")),
    providerGate,
  });
  const stepById = Object.fromEntries(path.steps.map((step) => [step.id, step]));

  assert.equal(path.stage, "provider_loading");
  assert.ok(path.title.includes("确认 AI provider"));
  assert.deepEqual(path.primaryAction, { kind: "open_link", label: "查看 AI 配置" });
  assert.equal(path.primaryHref, "/settings/ai");
  assert.equal(path.currentStepId, "provider");
  assert.equal(stepById.provider.status, "current");
  assert.equal(stepById.scan.status, "pending");
  assert.equal(stepById.scan.actionKind, undefined);
});

test("aiMoneyPathFromState keeps idle scan path when provider is ready", () => {
  const providerGate = aiProviderReadinessGateFromStatus({
    status: "ready",
    providerLabel: "OpenAI",
    keyConfigured: true,
  });
  const path = aiMoneyPathFromState({
    analysis: null,
    persistedActions: [],
    validationRuns: [],
    runs: [],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-02T12:00:00.000Z")),
    providerGate,
  });

  assert.equal(path.stage, "idle");
  assert.deepEqual(path.primaryAction, { kind: "scan_today", label: "运行 AI 扫描" });
  assert.equal(path.steps[0].id, "scan");
  assert.equal(path.steps[0].status, "current");
  assert.equal(path.steps[0].actionKind, "scan_today");
});

test("aiMoneyPathFromState makes paper adoption the current step after validation", () => {
  const path = aiMoneyPathFromState({
    analysis: {
      context: {
        newsCount: 2,
        macroCount: 1,
        onchainCount: 1,
        notes: [],
        execution: {
          accountCount: 2,
          tradeableAccountCount: 1,
          withdrawalEnabledAccountCount: 1,
          tradingHalted: false,
          portfolioLimits: {
            maxOpenNotionalUsd: 1000,
            maxOpenPositionsCount: 3,
            maxDailyLossUsd: 100,
          },
        },
      },
      execution: { mode: "paper", safetyGates: ["回测完成", "人工复核"] },
      watchSignals: [{ source: "news", signal: "ETF inflows accelerate" }],
      humanFactors: ["避免 FOMO 追涨"],
      strategyDrafts: [
        {
          name: "btca",
          kind: "grid_dca",
          symbol: "BTCUSDT",
          params: {},
          riskCaps: { maxPositionUsd: 200, maxLeverage: 3, dailyLossCapUsd: 20 },
        },
      ],
    },
    persistedActions: [{ id: "sentiment_review", status: "done" }],
    validationRuns: [
      {
        id: "run_btc",
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        progress: 100,
        metrics: { total_return: 0.12, sharpe: 1.5, max_dd: -0.04, n_trades: 30 },
      },
    ],
  });
  const stepById = Object.fromEntries(path.steps.map((step) => [step.id, step]));

  assert.equal(path.stage, "paper_ready");
  assert.equal(stepById.scan.status, "done");
  assert.equal(stepById.blueprint.status, "done");
  assert.equal(stepById.validation.status, "done");
  assert.equal(stepById.sentiment.status, "done");
  assert.equal(stepById.paper.status, "current");
  assert.equal(stepById.paper.actionKind, "accept_paper_candidate");
  assert.equal(["pending", "blocked"].includes(stepById.testnet.status), true);
  assert.ok(path.summary.includes("paper"));
  assert.equal(path.summary.includes("主网执行"), false);
});

test("aiMoneyPathFromState keeps thin sentiment review at the sentiment step", () => {
  const path = aiMoneyPathFromState({
    analysis: {
      context: {
        newsCount: 2,
        macroCount: 1,
        onchainCount: 1,
        notes: [],
        execution: {
          accountCount: 2,
          tradeableAccountCount: 1,
          withdrawalEnabledAccountCount: 1,
          tradingHalted: false,
          portfolioLimits: {
            maxOpenNotionalUsd: 1000,
            maxOpenPositionsCount: 3,
            maxDailyLossUsd: 100,
          },
        },
      },
      execution: { mode: "paper", safetyGates: ["回测完成", "人工复核"] },
      watchSignals: [{ source: "news", signal: "ETF inflows accelerate" }],
      humanFactors: ["避免 FOMO 追涨"],
      strategyDrafts: [
        {
          name: "btca",
          kind: "grid_dca",
          symbol: "BTCUSDT",
          params: {},
          riskCaps: { maxPositionUsd: 200, maxLeverage: 3, dailyLossCapUsd: 20 },
        },
      ],
    },
    persistedActions: [{ id: "sentiment_review", status: "done", note: "风向 / 人性复核已完成。" }],
    validationRuns: [
      {
        id: "run_btc",
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        progress: 100,
        metrics: { total_return: 0.12, sharpe: 1.5, max_dd: -0.04, n_trades: 30 },
      },
    ],
  });
  const stepById = Object.fromEntries(path.steps.map((step) => [step.id, step]));

  assert.equal(path.stage, "sentiment_review");
  assert.equal(path.currentStepId, "sentiment");
  assert.equal(stepById.sentiment.status, "current");
  assert.equal(stepById.sentiment.actionKind, "sentiment_review");
  assert.equal(stepById.paper.status, "blocked");
  assert.equal(stepById.paper.actionKind, undefined);
});

test("aiMoneyPathFromState keeps paper current when completion lacks review evidence", () => {
  const path = aiMoneyPathFromState({
    analysis: {
      context: {
        newsCount: 2,
        macroCount: 1,
        onchainCount: 1,
        notes: [],
        execution: {
          accountCount: 1,
          tradeableAccountCount: 1,
          withdrawalEnabledAccountCount: 0,
          tradingHalted: false,
          portfolioLimits: {
            maxOpenNotionalUsd: 1000,
            maxOpenPositionsCount: 3,
            maxDailyLossUsd: 100,
          },
        },
      },
      execution: { mode: "paper", safetyGates: ["回测完成", "人工复核"] },
      watchSignals: [{ source: "news", signal: "ETF inflows accelerate" }],
      humanFactors: ["避免 FOMO 追涨"],
      strategyDrafts: [
        {
          name: "btca",
          kind: "grid_dca",
          symbol: "BTCUSDT",
          params: {},
          riskCaps: { maxPositionUsd: 200, maxLeverage: 3, dailyLossCapUsd: 20 },
        },
      ],
    },
    persistedActions: [
      { id: "sentiment_review", status: "done" },
      { id: "paper_watch", status: "done", href: "/backtests/run_btc", note: "Paper 已完成" },
    ],
    validationRuns: [
      {
        id: "run_btc",
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        progress: 100,
        metrics: { total_return: 0.12, sharpe: 1.5, max_dd: -0.04, n_trades: 30 },
      },
    ],
  });
  const stepById = Object.fromEntries(path.steps.map((step) => [step.id, step]));

  assert.equal(path.stage, "paper_watch");
  assert.equal(path.currentStepId, "paper");
  assert.equal(stepById.paper.status, "current");
  assert.equal(stepById.paper.actionKind, "open_link");
  assert.equal(stepById.paper.href, "/backtests/run_btc");
  assert.ok(stepById.paper.detail.includes("复盘证据不足"));
  assert.equal(stepById.testnet.status, "blocked");
});

test("aiMoneyPathFromState makes testnet handoff explicit", () => {
  const path = aiMoneyPathFromState({
    analysis: {
      context: {
        newsCount: 2,
        macroCount: 1,
        onchainCount: 1,
        notes: [],
        execution: {
          accountCount: 1,
          tradeableAccountCount: 1,
          withdrawalEnabledAccountCount: 0,
          tradingHalted: false,
          portfolioLimits: {
            maxOpenNotionalUsd: 1000,
            maxOpenPositionsCount: 3,
            maxDailyLossUsd: 100,
          },
        },
      },
      execution: { mode: "paper", safetyGates: ["回测完成", "人工复核"] },
      watchSignals: [],
      humanFactors: [],
      strategyDrafts: [
        {
          name: "btca",
          kind: "grid_dca",
          symbol: "BTCUSDT",
          params: {},
          riskCaps: { maxPositionUsd: 200, maxLeverage: 3, dailyLossCapUsd: 20 },
        },
      ],
    },
    persistedActions: [
      { id: "sentiment_review", status: "done" },
      {
        id: "paper_watch",
        status: "done",
        href: "/backtests/run_btc",
        note:
          "Paper 观察已完成 24-72 小时复盘：已检查市场风向、舆论变化、人性偏差、执行摩擦和回撤表现；只允许进入测试网前检查，不进入主网。",
      },
    ],
    validationRuns: [
      {
        id: "run_btc",
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        progress: 100,
        metrics: { total_return: 0.12, sharpe: 1.5, max_dd: -0.04, n_trades: 30 },
      },
    ],
    accounts: [
      {
        id: "acc_1",
        exchange: "binance",
        permissions: { canTrade: true, canDeposit: false, canWithdraw: false },
      },
    ],
  });
  const testnetStep = path.steps.find((step) => step.id === "testnet");

  assert.equal(path.currentStepId, "testnet");
  assert.deepEqual(path.primaryAction, { kind: "open_link", label: "打开测试网前检查" });
  assert.equal(testnetStep.status, "current");
  assert.equal(testnetStep.actionKind, "open_link");
  assert.equal(testnetStep.href.startsWith("/option?"), true);
});

test("aiAutopilotStateFromAnalysis blocks execution when context data is missing", () => {
  const state = aiAutopilotStateFromAnalysis({
    analysis: {
      context: {
        notes: ["timescale not configured; market context limited"],
        newsCount: 0,
        macroCount: 0,
        onchainCount: 0,
      },
      execution: {
        mode: "paper",
        canAutoExecute: false,
        safetyGates: ["回测完成", "人工复核"],
      },
      humanFactors: ["FOMO 追涨风险"],
      watchSignals: [{ source: "news", signal: "ETF inflows fade" }],
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
    },
    persistedActions: [],
    validationRuns: [],
  });

  assert.equal(state.stage, "data_gap");
  assert.equal(state.tone, "warning");
  assert.equal(state.progress, 20);
  assert.equal(state.maxExecutionMode, "observe");
  assert.equal(state.canAutoExecute, false);
  assert.deepEqual(state.primaryAction, {
    kind: "open_link",
    label: "打开数据上下文",
  });
  assert.equal(state.metrics.find((item) => item.label === "上下文").value, "0/0/0");
  assert.ok(state.blockers.some((item) => item.includes("timescale not configured")));
  assert.ok(state.safetyGates.some((item) => item.includes("FOMO")));
});

test("aiAutopilotStateFromAnalysis exposes safe primary actions", () => {
  const idle = aiAutopilotStateFromAnalysis({});
  assert.deepEqual(idle.primaryAction, {
    kind: "analyze_and_validate",
    label: "启动 AI 雷达",
  });

  const backtest = aiAutopilotStateFromAnalysis({
    analysis: {
      context: { notes: [], newsCount: 2, macroCount: 1, onchainCount: 1 },
      execution: { mode: "paper", safetyGates: [] },
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
    },
    persistedActions: [],
    validationRuns: [],
  });

  assert.deepEqual(backtest.primaryAction, {
    kind: "run_all_backtests",
    label: "运行 AI 批量回测",
  });
  assert.ok(backtest.completedSteps.some((item) => item.includes("策略蓝图")));
  assert.ok(backtest.aiAvailableSteps.some((item) => item.includes("批量回测")));
  assert.ok(backtest.humanRequiredSteps.some((item) => item.includes("真实交易")));

  const sentimentReview = aiAutopilotStateFromAnalysis({
    analysis: {
      context: { notes: [], newsCount: 4, macroCount: 1, onchainCount: 1 },
      execution: { mode: "paper", safetyGates: [] },
      humanFactors: ["FOMO 追涨风险"],
      watchSignals: [{ source: "human", signal: "社交媒体 FOMO" }],
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
    },
    persistedActions: [],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
  });

  assert.deepEqual(sentimentReview.primaryAction, {
    kind: "open_link",
    label: "打开数据上下文",
  });
});

test("aiAutopilotStateFromAnalysis promotes only completed paper watch to testnet candidate", () => {
  const state = aiAutopilotStateFromAnalysis({
    analysis: {
      context: {
        notes: [],
        newsCount: 4,
        macroCount: 2,
        onchainCount: 1,
      },
      execution: {
        mode: "mainnet",
        canAutoExecute: true,
        safetyGates: ["mainnet token gate", "组合限额"],
      },
      humanFactors: ["拥挤交易回撤风险"],
      watchSignals: [
        { source: "news", signal: "ETF inflows accelerate" },
        { source: "onchain", signal: "exchange outflow rises" },
      ],
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
    },
    persistedActions: [
      {
        id: "paper_watch",
        status: "done",
        href: "/backtests/run_btc",
        note:
          "Paper 观察已完成 24-72 小时复盘：已检查市场风向、舆论变化、人性偏差、执行摩擦和回撤表现；只允许进入测试网前检查，不进入主网。",
      },
    ],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
  });

  assert.equal(state.stage, "testnet_candidate");
  assert.equal(state.tone, "success");
  assert.equal(state.progress, 85);
  assert.equal(state.maxExecutionMode, "testnet");
  assert.equal(state.canAutoExecute, false);
  assert.deepEqual(state.primaryAction, {
    kind: "open_link",
    label: "打开策略预填",
  });
  assert.equal(state.metrics.find((item) => item.label === "验证").value, "1 完成");
  assert.ok(state.blockers.some((item) => item.includes("主网")));
  assert.ok(state.nextActions.some((item) => item.includes("测试网")));
  assert.ok(state.completedSteps.some((item) => item.includes("paper 观察已完成")));
  assert.ok(state.aiAvailableSteps.some((item) => item.includes("策略预填")));
  assert.ok(state.humanRequiredSteps.some((item) => item.includes("mainnet token gate")));
  assert.ok(state.humanRequiredSteps.some((item) => item.includes("人性")));
});

test("aiDecisionJournalFromState summarizes the latest saved run when no analysis is active", () => {
  const journal = aiDecisionJournalFromState({
    analysis: null,
    persistedActions: [],
    validationRuns: [],
    runs: [
      {
        id: "run_today",
        goal: "2026-06-02 今日 AI 机会雷达",
        createdAt: "2026-06-02T08:10:00.000Z",
        symbols: ["BTC", "ETH"],
        strategyDraftCount: 3,
        aiStatus: "ok",
      },
    ],
  });

  assert.equal(journal.length, 1);
  assert.equal(journal[0].kind, "run");
  assert.equal(journal[0].tone, "default");
  assert.ok(journal[0].title.includes("最近 AI 运行"));
  assert.ok(journal[0].detail.includes("BTC, ETH"));
  assert.equal(journal[0].href, undefined);
});

test("aiDecisionJournalFromState records analysis, validation, paper watch, and gate evidence", () => {
  const journal = aiDecisionJournalFromState({
    analysis: {
      createdAt: "2026-06-02T09:00:00.000Z",
      summary: "AI 认为 BTC 适合低回撤观察。",
      context: {
        notes: [],
        newsCount: 4,
        macroCount: 2,
        onchainCount: 1,
      },
      execution: {
        mode: "mainnet",
        canAutoExecute: true,
        safetyGates: ["mainnet token gate", "组合限额"],
      },
      humanFactors: ["避免 FOMO 追涨"],
      watchSignals: [{ source: "news", signal: "ETF inflows accelerate" }],
      strategyDrafts: [
        { name: "btca", kind: "grid_dca", symbol: "BTC", params: {} },
        { name: "watch", kind: "watch_only", symbol: "ETH", params: {} },
      ],
    },
    persistedActions: [
      {
        id: "paper_watch",
        status: "done",
        note: "paper 观察完成",
        href: "/backtests/run_btc",
        updatedAt: "2026-06-02T10:00:00.000Z",
      },
    ],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
    runs: [],
  });

  assert.deepEqual(
    journal.map((item) => item.kind),
    ["analysis", "context", "validation", "paper_watch", "gate"],
  );
  assert.equal(journal.find((item) => item.kind === "validation").tone, "success");
  assert.ok(journal.find((item) => item.kind === "validation").detail.includes("评分"));
  assert.equal(journal.find((item) => item.kind === "paper_watch").href, "/backtests/run_btc");
  assert.ok(journal.find((item) => item.kind === "gate").detail.includes("主网"));
  assert.equal(journal.find((item) => item.kind === "gate").tone, "warning");
});

test("aiDecisionJournalFromState flags thin completed paper watch as review evidence gap", () => {
  const journal = aiDecisionJournalFromState({
    analysis: {
      createdAt: "2026-06-02T09:00:00.000Z",
      summary: "AI 认为 BTC 适合低回撤观察。",
      context: {
        notes: [],
        newsCount: 4,
        macroCount: 0,
        onchainCount: 0,
      },
      execution: {
        mode: "testnet",
        canAutoExecute: false,
        safetyGates: ["paper review evidence"],
      },
      humanFactors: [],
      watchSignals: [],
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
    },
    persistedActions: [
      {
        id: "paper_watch",
        status: "done",
        note: "Paper 已完成",
        href: "/backtests/run_btc",
        updatedAt: "2026-06-02T10:00:00.000Z",
      },
    ],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
    runs: [],
  });

  const paperEntry = journal.find((item) => item.kind === "paper_watch");
  assert.equal(paperEntry.tone, "warning");
  assert.ok(paperEntry.title.includes("补齐"));
  assert.ok(paperEntry.detail.includes("复盘证据不足"));
  assert.equal(paperEntry.href, "/backtests/run_btc");
});

test("aiDailyMissionFromState starts with today's safe scan when no analysis is active", () => {
  const mission = aiDailyMissionFromState({
    analysis: null,
    persistedActions: [],
    validationRuns: [],
    runs: [],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-02T12:00:00.000Z")),
  });

  assert.equal(mission.tone, "warning");
  assert.equal(mission.focus, "scan_today");
  assert.equal(mission.tasks[0].id, "daily_scan");
  assert.equal(mission.tasks[0].actionKind, "scan_today");
  assert.equal(mission.tasks[0].status, "ready");
  assert.ok(mission.tasks[0].detail.includes("市场"));
});

test("aiDailyMissionFromState sends blocked idle provider task to AI settings", () => {
  const providerGate = aiProviderReadinessGateFromStatus({
    status: "blocked",
    providerLabel: "OpenAI",
    keyConfigured: false,
    primaryHref: "/settings/ai",
    primaryAction: { kind: "open_link", label: "配置真实 AI" },
    summary: "当前启用 OpenAI，但 API key 未配置。",
  });
  const mission = aiDailyMissionFromState({
    analysis: null,
    persistedActions: [],
    validationRuns: [],
    runs: [],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-02T12:00:00.000Z")),
    providerGate,
  });

  assert.equal(mission.focus, "provider_blocked");
  assert.equal(mission.tone, "warning");
  assert.ok(mission.summary.includes("OpenAI"));
  assert.equal(mission.tasks[0].id, "provider_setup");
  assert.equal(mission.tasks[0].status, "blocked");
  assert.equal(mission.tasks[0].actionKind, "open_link");
  assert.equal(mission.tasks[0].href, "/settings/ai");
  assert.equal(mission.tasks[0].proposedFormState, undefined);
});

test("aiDailyMissionFromState waits while idle provider status is loading", () => {
  const providerGate = aiProviderReadinessGateFromStatus(null, { loading: true });
  const mission = aiDailyMissionFromState({
    analysis: null,
    persistedActions: [],
    validationRuns: [],
    runs: [],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-02T12:00:00.000Z")),
    providerGate,
  });

  assert.equal(mission.focus, "provider_loading");
  assert.equal(mission.tasks[0].id, "provider_loading");
  assert.equal(mission.tasks[0].status, "pending");
  assert.equal(mission.tasks[0].actionKind, "open_link");
  assert.equal(mission.tasks[0].href, "/settings/ai");
  assert.ok(mission.tasks[0].title.includes("确认 AI provider"));
});

test("aiDailyMissionFromState keeps idle scan task when provider is ready", () => {
  const providerGate = aiProviderReadinessGateFromStatus({
    status: "ready",
    providerLabel: "OpenAI",
    keyConfigured: true,
  });
  const mission = aiDailyMissionFromState({
    analysis: null,
    persistedActions: [],
    validationRuns: [],
    runs: [],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-02T12:00:00.000Z")),
    providerGate,
  });

  assert.equal(mission.focus, "scan_today");
  assert.equal(mission.tasks[0].id, "daily_scan");
  assert.equal(mission.tasks[0].actionKind, "scan_today");
  assert.equal(mission.tasks[0].status, "ready");
  assert.ok(mission.tasks[0].proposedFormState.goal.includes("AI 自动"));
});

test("aiDailyMissionFromState opens today's existing radar when no analysis is active", () => {
  const dailyRadarStatus = dailyRadarStatusFromRuns(
    [
      {
        id: "run_today",
        goal: "2026-06-03 今日 AI 机会雷达：BTC/ETH",
        symbols: ["BTC", "ETH"],
        createdAt: "2026-06-03T07:00:00.000Z",
        strategyDraftCount: 2,
      },
    ],
    new Date("2026-06-03T08:00:00.000Z"),
  );
  const mission = aiDailyMissionFromState({
    analysis: null,
    persistedActions: [],
    validationRuns: [],
    runs: [],
    dailyRadarStatus,
  });

  assert.equal(mission.focus, "open_today_run");
  assert.equal(mission.tasks[0].id, "daily_scan");
  assert.equal(mission.tasks[0].actionKind, "open_today_run");
  assert.equal(mission.tasks[0].href, "/ai-money?runId=run_today");
});

test("aiDailyMissionFromState prioritizes follow-up validation when no analysis is active", () => {
  const mission = aiDailyMissionFromState({
    analysis: null,
    persistedActions: [],
    validationRuns: [],
    runs: [
      {
        id: "goal_blueprint",
        goal: "ETH/SOL AI 机会雷达",
        symbols: ["ETH", "SOL"],
        aiStatus: "ok",
        executionMode: "paper",
        strategyDraftCount: 3,
        contextNewsCount: 4,
        contextMacroCount: 1,
        contextOnchainCount: 2,
        createdAt: "2026-06-03T02:30:00.000Z",
        actions: [],
      },
    ],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-03T08:00:00.000Z")),
    now: new Date("2026-06-03T08:00:00.000Z"),
  });

  assert.equal(mission.focus, "validate_run");
  assert.equal(mission.tasks[0].id, "followup_goal_blueprint");
  assert.equal(mission.tasks[0].actionKind, "validate_run");
  assert.equal(mission.tasks[0].runId, "goal_blueprint");
  assert.equal(mission.tasks[0].href, "/ai-money?runId=goal_blueprint");
  assert.ok(mission.tasks[0].detail.includes("批量回测"));
});

test("aiDailyMissionFromState opens paper follow-up run when no analysis is active", () => {
  const mission = aiDailyMissionFromState({
    analysis: null,
    persistedActions: [],
    validationRuns: [],
    runs: [
      {
        id: "paper_run",
        goal: "BTC 低回撤 paper 观察",
        symbols: ["BTC"],
        aiStatus: "ok",
        executionMode: "paper",
        strategyDraftCount: 1,
        contextNewsCount: 4,
        contextMacroCount: 1,
        contextOnchainCount: 2,
        createdAt: "2026-06-03T03:00:00.000Z",
        actions: [
          {
            id: "paper_watch",
            status: "manual",
            href: "/backtests/run_btc",
            note: "等待 24-72 小时 paper 观察，继续记录市场风向和人性偏差。",
            updatedAt: "2026-06-03T03:10:00.000Z",
          },
        ],
      },
    ],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-03T08:00:00.000Z")),
    now: new Date("2026-06-03T08:00:00.000Z"),
  });

  assert.equal(mission.focus, "open_run");
  assert.equal(mission.tasks[0].id, "followup_paper_run");
  assert.equal(mission.tasks[0].actionKind, "open_run");
  assert.equal(mission.tasks[0].runId, "paper_run");
  assert.equal(mission.tasks[0].href, "/ai-money?runId=paper_run");
  assert.ok(mission.tasks[0].detail.includes("paper"));
  assert.ok(mission.tasks[0].detail.includes("人性"));
});

test("aiDailyMissionFromState opens saved strategy follow-up link directly", () => {
  const mission = aiDailyMissionFromState({
    analysis: null,
    persistedActions: [],
    validationRuns: [],
    runs: [
      {
        id: "goal_saved",
        goal: "BTC 低回撤赚钱路径",
        symbols: ["BTC"],
        aiStatus: "ok",
        executionMode: "paper",
        strategyDraftCount: 2,
        contextNewsCount: 3,
        contextMacroCount: 1,
        contextOnchainCount: 1,
        createdAt: "2026-06-03T02:00:00.000Z",
        actions: [
          {
            id: "strategy",
            status: "done",
            relatedId: "opt123",
            href: "/strategies/opt123?from=ai-draft&aiRunId=goal_saved",
            note: "btca 已保存为 AI 策略配置；live 仍关闭；下一步必须先补回测证据，再进入 paper 观察。",
          },
        ],
      },
    ],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-03T08:00:00.000Z")),
  });

  assert.equal(mission.focus, "open_link");
  assert.equal(mission.tasks[0].id, "followup_goal_saved");
  assert.equal(mission.tasks[0].actionKind, "open_link");
  assert.equal(mission.tasks[0].runId, "goal_saved");
  assert.equal(mission.tasks[0].href, "/strategies/opt123?from=ai-draft&aiRunId=goal_saved");
  assert.ok(mission.tasks[0].detail.includes("回测"));
});

test("aiDailyMissionFromState makes paper adoption the primary mission after strong validation", () => {
  const mission = aiDailyMissionFromState({
    analysis: {
      context: { notes: [], newsCount: 4, macroCount: 2, onchainCount: 1 },
      execution: { mode: "paper", safetyGates: ["回测完成"] },
      humanFactors: ["避免 FOMO 追涨"],
      watchSignals: [{ source: "news", signal: "ETF inflows accelerate" }],
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
    },
    persistedActions: [{ id: "sentiment_review", status: "done" }],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
    runs: [],
  });

  assert.equal(mission.focus, "paper_candidate");
  assert.equal(mission.tasks[0].id, "save_and_accept_paper_candidate");
  assert.equal(mission.tasks[0].actionKind, "save_and_accept_paper_candidate");
  assert.equal(mission.tasks[0].tone, "success");
  assert.ok(mission.tasks.some((task) => task.id === "watch_signals"));
  assert.ok(mission.tasks[0].detail.includes("收益 12.00%"));
  assert.ok(mission.tasks[0].detail.includes("回撤 6.00%"));
  assert.ok(mission.tasks[0].detail.includes("夏普 1.80"));
  assert.ok(mission.tasks[0].detail.includes("避免 FOMO 追涨"));
  assert.ok(mission.tasks[0].detail.includes("ETF inflows accelerate"));
  assert.ok(mission.summary.includes("采用"));
});

test("aiDailyMissionFromState asks for sentiment review before heated paper adoption", () => {
  const mission = aiDailyMissionFromState({
    analysis: {
      context: { notes: [], newsCount: 4, macroCount: 2, onchainCount: 1 },
      execution: { mode: "paper", safetyGates: ["回测完成"] },
      humanFactors: ["避免 FOMO 追涨"],
      watchSignals: [{ source: "human", signal: "社交媒体 FOMO", action: "降低 paper 仓位" }],
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
    },
    persistedActions: [],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
    runs: [],
  });

  assert.equal(mission.focus, "sentiment_review");
  assert.equal(mission.tasks[0].id, "sentiment_review");
  assert.equal(mission.tasks[0].actionKind, "sentiment_review");
  assert.equal(mission.tasks[0].tone, "warning");
  assert.ok(mission.tasks[0].detail.includes("FOMO"));
});

test("aiDailyMissionFromState makes weak validation redesign an AI primary task", () => {
  const mission = aiDailyMissionFromState({
    analysis: {
      goal: "寻找 BTC 低回撤 AI 赚钱机会",
      context: { notes: [], newsCount: 4, macroCount: 2, onchainCount: 1 },
      execution: { mode: "paper", safetyGates: ["回测完成"] },
      humanFactors: ["避免 FOMO 追涨"],
      watchSignals: [
        {
          source: "news",
          signal: "ETF 资金流退潮",
          interpretation: "资金流转弱会放大追涨回撤。",
          action: "先降低仓位并等待情绪降温。",
        },
      ],
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
    },
    persistedActions: [],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: -0.02, sharpe: 0.2, max_dd: -0.2, n_trades: 6 },
      },
    ],
    runs: [],
  });

  assert.equal(mission.focus, "redesign");
  assert.equal(mission.tasks[0].id, "redesign_blueprint");
  assert.equal(mission.tasks[0].actionKind, "analyze_and_validate");
  assert.equal(mission.tasks[0].status, "ready");
  assert.equal(mission.tasks[0].tone, "danger");
  assert.ok(mission.tasks[0].detail.includes("淘汰"));
  assert.ok(mission.tasks[0].proposedFormState?.goal.includes("重做"));
  assert.ok(mission.tasks[0].proposedFormState?.goal.includes("淘汰"));
  assert.ok(mission.tasks[0].proposedFormState?.goal.includes("回测"));
  assert.ok(mission.tasks[0].proposedFormState?.goal.includes("避免 FOMO 追涨"));
  assert.ok(mission.tasks[0].proposedFormState?.goal.includes("ETF 资金流退潮"));
  assert.ok(mission.tasks[0].proposedFormState?.goal.includes("先降低仓位"));
  assert.ok(mission.tasks[0].proposedFormState?.goal.includes("市场风向"));
  assert.ok(mission.tasks[0].proposedFormState?.goal.includes("人性偏差"));
  assert.ok(mission.tasks[0].proposedFormState?.goal.includes("paper 验证"));
  assert.equal(mission.tasks[0].proposedFormState?.executionMode, "paper");
  assert.equal(mission.tasks[0].proposedFormState?.riskPreference, "conservative");
});

test("dailyMissionTaskCommandFromTask keeps redesign tasks directly executable", () => {
  const proposedFormState = {
    goal: "AI 重做更保守的赚钱策略蓝图",
    symbolsText: "BTC",
    horizon: "24h-7d",
    riskPreference: "conservative",
    executionMode: "paper",
  };

  const command = dailyMissionTaskCommandFromTask({
    id: "redesign_blueprint",
    title: "重做蓝图并验证",
    actionKind: "analyze_and_validate",
    proposedFormState,
  });

  assert.deepEqual(command, {
    kind: "analyze_and_validate",
    label: "重做蓝图并验证",
    proposedFormState,
  });
});

test("dailyMissionTaskCommandFromTask maps follow-up validation and refresh tasks", () => {
  assert.deepEqual(
    dailyMissionTaskCommandFromTask({
      id: "followup_goal_blueprint",
      title: "验证此 AI 运行",
      actionKind: "validate_run",
      runId: "goal_blueprint",
      href: "/ai-money?runId=goal_blueprint",
    }),
    {
      kind: "validate_run",
      label: "验证此 AI 运行",
      runId: "goal_blueprint",
      href: "/ai-money?runId=goal_blueprint",
    },
  );

  assert.deepEqual(
    dailyMissionTaskCommandFromTask({
      id: "followup_goal_old",
      title: "重新扫描此运行",
      actionKind: "refresh_run",
      runId: "goal_old",
      href: "/ai-money?runId=goal_old",
    }),
    {
      kind: "refresh_run",
      label: "重新扫描此运行",
      runId: "goal_old",
      href: "/ai-money?runId=goal_old",
    },
  );
});

test("dailyMissionTaskCommandFromTask maps human review tasks to manual action completion", () => {
  assert.deepEqual(
    dailyMissionTaskCommandFromTask({
      id: "sentiment_review",
      title: "复核风向 / 人性",
      actionKind: "sentiment_review",
      href: "/data-explorer/news",
    }),
    {
      kind: "complete_manual_action",
      label: "复核风向 / 人性",
      actionId: "sentiment_review",
      href: "/data-explorer/news",
    },
  );

  assert.deepEqual(
    dailyMissionTaskCommandFromTask({
      id: "paper_watch",
      title: "完成 paper 复盘",
      actionKind: "paper_watch",
      href: "/backtests/run_btc",
    }),
    {
      kind: "complete_manual_action",
      label: "完成 paper 复盘",
      actionId: "paper_watch",
      href: "/backtests/run_btc",
    },
  );
});

test("aiNowActionFromState starts idle users with one AI scan task", () => {
  const now = aiNowActionFromState({
    analysis: null,
    persistedActions: [],
    validationRuns: [],
    runs: [],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-03T08:00:00.000Z")),
  });

  assert.equal(now.stage, "scan_today");
  assert.equal(now.owner, "AI");
  assert.deepEqual(now.primaryAction, { kind: "scan_today", label: "AI 自动生成目标并验证" });
  assert.equal(now.proposedFormState.symbolsText, "BTC, ETH, SOL");
  assert.equal(now.proposedFormState.executionMode, "paper");
  assert.ok(now.proposedFormState.goal.includes("AI 自动"));
  assert.ok(now.proposedFormState.goal.includes("市场风向"));
  assert.ok(now.proposedFormState.goal.includes("新闻舆论"));
  assert.ok(now.proposedFormState.goal.includes("人性偏差"));
  assert.ok(now.proposedFormState.goal.includes("paper 验证"));
  assert.equal(now.scanFormState.goal, now.proposedFormState.goal);
  assert.equal(now.scanFormState.symbolsText, now.proposedFormState.symbolsText);
  assert.equal(now.scanFormState.executionMode, now.proposedFormState.executionMode);
  assert.equal(now.proposalCard.title, "AI 自动目标草案");
  assert.equal(now.proposalCard.goal, now.proposedFormState.goal);
  assert.deepEqual(
    now.proposalCard.stats.map((item) => item.label),
    ["标的", "周期", "执行"],
  );
  assert.ok(now.proposalCard.checks.some((item) => item.includes("市场风向")));
  assert.ok(now.proposalCard.checks.some((item) => item.includes("新闻舆论")));
  assert.ok(now.proposalCard.checks.some((item) => item.includes("人性偏差")));
  assert.ok(now.proposalCard.checks.some((item) => item.includes("回测")));
  assert.ok(now.proposalCard.checks.some((item) => item.includes("paper")));
  assert.ok(now.summary.includes("市场"));
  assert.ok(now.guardrail.includes("不会"));
});

test("aiNowActionFromState sends blocked idle provider state to AI settings", () => {
  const providerGate = aiProviderReadinessGateFromStatus({
    status: "blocked",
    providerLabel: "OpenAI",
    keyConfigured: false,
    primaryHref: "/settings/ai",
    primaryAction: { kind: "open_link", label: "配置真实 AI" },
    summary: "当前启用 OpenAI，但 API key 未配置。",
  });
  const now = aiNowActionFromState({
    analysis: null,
    persistedActions: [],
    validationRuns: [],
    runs: [],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-03T08:00:00.000Z")),
    providerGate,
  });

  assert.equal(now.stage, "provider_blocked");
  assert.equal(now.owner, "你");
  assert.equal(now.primaryHref, "/settings/ai");
  assert.deepEqual(now.primaryAction, { kind: "open_link", label: "配置真实 AI" });
  assert.ok(now.title.includes("真实 AI"));
  assert.ok(now.summary.includes("OpenAI"));
  assert.ok(now.guardrail.includes("不会启动"));
  assert.equal(now.proposedFormState, undefined);
});

test("aiNowActionFromState waits while idle provider status is loading", () => {
  const providerGate = aiProviderReadinessGateFromStatus(null, { loading: true });
  const now = aiNowActionFromState({
    analysis: null,
    persistedActions: [],
    validationRuns: [],
    runs: [],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-03T08:00:00.000Z")),
    providerGate,
  });

  assert.equal(now.stage, "provider_loading");
  assert.equal(now.primaryHref, "/settings/ai");
  assert.deepEqual(now.primaryAction, { kind: "open_link", label: "查看 AI 配置" });
  assert.ok(now.title.includes("确认 AI provider"));
  assert.ok(now.guardrail.includes("不会启动"));
  assert.equal(now.scanFormState, undefined);
});

test("aiNowActionFromState keeps idle scan action when provider is ready", () => {
  const providerGate = aiProviderReadinessGateFromStatus({
    status: "ready",
    providerLabel: "OpenAI",
    keyConfigured: true,
  });
  const now = aiNowActionFromState({
    analysis: null,
    persistedActions: [],
    validationRuns: [],
    runs: [],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-03T08:00:00.000Z")),
    providerGate,
  });

  assert.equal(now.stage, "scan_today");
  assert.deepEqual(now.primaryAction, { kind: "scan_today", label: "AI 自动生成目标并验证" });
  assert.equal(now.primaryHref, undefined);
  assert.equal(now.proposedFormState.executionMode, "paper");
});

test("aiNowActionFromState builds an autonomous goal from recent run memory", () => {
  const now = aiNowActionFromState({
    analysis: null,
    persistedActions: [],
    validationRuns: [],
    runs: [
      {
        id: "recent",
        goal: "SOL ETH 低回撤观察",
        symbols: ["SOL", "ETH", "BTC", "SOL"],
        aiStatus: "ok",
        executionMode: "paper",
        strategyDraftCount: 0,
        contextNewsCount: 3,
        contextMacroCount: 1,
        contextOnchainCount: 2,
        createdAt: new Date().toISOString(),
      },
    ],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-03T08:00:00.000Z")),
  });

  assert.equal(now.stage, "scan_today");
  assert.equal(now.owner, "AI");
  assert.equal(now.proposedFormState.symbolsText, "BTC, ETH, SOL");
  assert.equal(now.proposedFormState.riskPreference, "balanced");
  assert.equal(now.proposedFormState.executionMode, "paper");
  assert.ok(now.proposedFormState.goal.includes("BTC/ETH/SOL"));
  assert.equal(now.scanFormState.goal, now.proposedFormState.goal);
  assert.equal(now.scanFormState.symbolsText, "BTC, ETH, SOL");
  assert.equal(now.scanFormState.executionMode, "paper");
  assert.equal(now.proposalCard.stats[0].value, "BTC, ETH, SOL");
  assert.equal(now.proposalCard.stats[2].value, "paper");
  assert.ok(now.proposalCard.goal.includes("不直接主网交易"));
  assert.ok(now.nextActions.some((item) => item.includes("回测")));
  assert.ok(now.guardrail.includes("主网"));
});

test("aiNowActionFromState opens follow-up validation instead of rescanning", () => {
  const now = aiNowActionFromState({
    analysis: null,
    persistedActions: [],
    validationRuns: [],
    runs: [
      {
        id: "goal_blueprint",
        goal: "ETH/SOL AI 机会雷达",
        symbols: ["ETH", "SOL"],
        aiStatus: "ok",
        executionMode: "paper",
        strategyDraftCount: 3,
        contextNewsCount: 4,
        contextMacroCount: 1,
        contextOnchainCount: 2,
        createdAt: "2026-06-03T02:30:00.000Z",
        actions: [],
      },
    ],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-03T08:00:00.000Z")),
    now: new Date("2026-06-03T08:00:00.000Z"),
  });

  assert.equal(now.stage, "validate_run");
  assert.equal(now.owner, "AI");
  assert.deepEqual(now.primaryAction, {
    kind: "validate_run",
    label: "验证此 AI 运行",
    runId: "goal_blueprint",
    href: "/ai-money?runId=goal_blueprint",
  });
  assert.equal(now.primaryHref, "/ai-money?runId=goal_blueprint");
  assert.ok(now.summary.includes("蓝图"));
});

test("aiNowActionFromState opens paper follow-up run instead of rescanning", () => {
  const now = aiNowActionFromState({
    analysis: null,
    persistedActions: [],
    validationRuns: [],
    runs: [
      {
        id: "paper_run",
        goal: "BTC 低回撤 paper 观察",
        symbols: ["BTC"],
        aiStatus: "ok",
        executionMode: "paper",
        strategyDraftCount: 1,
        contextNewsCount: 4,
        contextMacroCount: 1,
        contextOnchainCount: 2,
        createdAt: "2026-06-03T03:00:00.000Z",
        actions: [
          {
            id: "paper_watch",
            status: "manual",
            href: "/backtests/run_btc",
            note: "等待 24-72 小时 paper 观察，继续记录市场风向和人性偏差。",
            updatedAt: "2026-06-03T03:10:00.000Z",
          },
        ],
      },
    ],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-03T08:00:00.000Z")),
  });

  assert.equal(now.stage, "open_link");
  assert.equal(now.owner, "AI");
  assert.deepEqual(now.primaryAction, {
    kind: "open_link",
    label: "打开最高优先级运行",
  });
  assert.equal(now.primaryHref, "/ai-money?runId=paper_run");
  assert.ok(now.summary.includes("paper"));
  assert.ok(now.guardrail.includes("不会下单"));
});

test("aiNowActionFromState opens saved strategy follow-up link directly", () => {
  const now = aiNowActionFromState({
    analysis: null,
    persistedActions: [],
    validationRuns: [],
    runs: [
      {
        id: "goal_saved",
        goal: "BTC 低回撤赚钱路径",
        symbols: ["BTC"],
        aiStatus: "ok",
        executionMode: "paper",
        strategyDraftCount: 2,
        contextNewsCount: 3,
        contextMacroCount: 1,
        contextOnchainCount: 1,
        createdAt: "2026-06-03T02:00:00.000Z",
        actions: [
          {
            id: "strategy",
            status: "done",
            relatedId: "opt123",
            href: "/strategies/opt123?from=ai-draft&aiRunId=goal_saved",
            note: "btca 已保存为 AI 策略配置；live 仍关闭；下一步必须先补回测证据，再进入 paper 观察。",
          },
        ],
      },
    ],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-03T08:00:00.000Z")),
  });

  assert.equal(now.stage, "open_link");
  assert.equal(now.owner, "AI");
  assert.deepEqual(now.primaryAction, {
    kind: "open_link",
    label: "打开已保存策略",
  });
  assert.equal(now.primaryHref, "/strategies/opt123?from=ai-draft&aiRunId=goal_saved");
  assert.ok(now.summary.includes("已保存策略"));
  assert.ok(now.guardrail.includes("不会下单"));
});

test("aiNowActionFromState opens started validation instead of rerunning backtests", () => {
  const now = aiNowActionFromState({
    analysis: {
      id: "goal_started_validation",
      context: { notes: [], newsCount: 4, macroCount: 2, onchainCount: 1 },
      execution: { mode: "paper", safetyGates: ["回测完成"] },
      humanFactors: [],
      watchSignals: [],
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
    },
    persistedActions: [
      {
        id: "backtest",
        status: "done",
        relatedId: "run_btc",
        href: "/backtests/run_btc",
        note: "已发起 1 个 AI 草案回测：btca",
      },
    ],
    validationRuns: [],
    runs: [],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-03T08:00:00.000Z")),
  });

  assert.equal(now.stage, "validating");
  assert.deepEqual(now.primaryAction, {
    kind: "open_link",
    label: "打开已启动回测",
  });
  assert.equal(now.primaryHref, "/backtests/run_btc");
  assert.ok(now.summary.includes("已启动"));
  assert.ok(now.guardrail.includes("安全动作"));
  assert.ok(now.guardrail.includes("真实交易"));
});

test("aiNowActionFromState turns historical completed weak validation into AI redesign", () => {
  const now = aiNowActionFromState({
    analysis: null,
    persistedActions: [],
    validationRuns: [
      {
        runId: "run_btc_1",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: -0.02, sharpe: 0.2, max_dd: -0.2, n_trades: 6 },
      },
    ],
    runs: [
      {
        id: "goal_started_validation",
        goal: "BTC AI 机会雷达",
        symbols: ["BTC"],
        aiStatus: "ok",
        executionMode: "paper",
        strategyDraftCount: 2,
        contextNewsCount: 4,
        contextMacroCount: 1,
        contextOnchainCount: 1,
        createdAt: "2026-06-03T02:30:00.000Z",
        analysis: {
          goal: "BTC AI 机会雷达",
          context: { symbols: ["BTC"], newsCount: 4, macroCount: 1, onchainCount: 1 },
          execution: { mode: "paper" },
          humanFactors: ["避免 FOMO 追涨"],
          watchSignals: [{ signal: "ETF 资金流退潮", action: "降低仓位后重做蓝图" }],
          strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
        },
        actions: [
          {
            id: "backtest",
            status: "done",
            relatedId: "run_btc_1",
            href: "/backtests/run_btc_1",
            note: "已发起 1 个 AI 草案回测：btca",
          },
        ],
      },
    ],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-03T08:00:00.000Z")),
  });

  assert.equal(now.stage, "analyze_and_validate");
  assert.equal(now.owner, "AI");
  assert.deepEqual(now.primaryAction, {
    kind: "analyze_and_validate",
    label: "让 AI 重做此运行",
    runId: "goal_started_validation",
    href: "/ai-money?runId=goal_started_validation",
    proposedFormState: now.primaryAction.proposedFormState,
  });
  assert.equal(now.scanFormState.goal, now.primaryAction.proposedFormState.goal);
  assert.ok(now.scanFormState.goal.includes("btca"));
  assert.ok(now.scanFormState.goal.includes("避免 FOMO 追涨"));
  assert.ok(now.scanFormState.goal.includes("ETF 资金流退潮"));
  assert.ok(now.proposalCard.goal.includes("paper 验证"));
});

test("aiNowActionFromState turns historical completed strong validation into paper evidence link", () => {
  const now = aiNowActionFromState({
    analysis: null,
    persistedActions: [],
    validationRuns: [
      {
        runId: "run_btc_1",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
    runs: [
      {
        id: "goal_started_validation",
        goal: "BTC AI 机会雷达",
        symbols: ["BTC"],
        aiStatus: "ok",
        executionMode: "paper",
        strategyDraftCount: 2,
        contextNewsCount: 4,
        contextMacroCount: 1,
        contextOnchainCount: 1,
        createdAt: "2026-06-03T02:30:00.000Z",
        analysis: {
          goal: "BTC AI 机会雷达",
          context: { symbols: ["BTC"], newsCount: 4, macroCount: 1, onchainCount: 1 },
          execution: { mode: "paper" },
          humanFactors: ["避免 FOMO 追涨"],
          watchSignals: [{ signal: "ETF 资金流增强", action: "提高 paper 观察优先级" }],
          strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
        },
        actions: [
          {
            id: "backtest",
            status: "done",
            relatedId: "run_btc_1",
            href: "/backtests/run_btc_1",
            note: "已发起 1 个 AI 草案回测：btca",
          },
        ],
      },
    ],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-03T08:00:00.000Z")),
  });

  assert.equal(now.stage, "open_link");
  assert.equal(now.owner, "AI");
  assert.deepEqual(now.primaryAction, {
    kind: "open_link",
    label: "查看 paper 候选证据",
  });
  assert.equal(now.primaryHref, "/ai-money?runId=goal_started_validation");
  assert.ok(now.summary.includes("paper"));
  assert.ok(now.summary.includes("优先 paper"));
  assert.ok(now.why[0].includes("评分"));
  assert.ok(now.guardrail.includes("不会下单"));
  assert.ok(now.guardrail.includes("不会进入主网"));
});

test("aiNowActionFromState turns weak validation into an AI redesign button", () => {
  const now = aiNowActionFromState({
    analysis: {
      goal: "寻找 BTC 低回撤 AI 赚钱机会",
      context: { notes: [], newsCount: 4, macroCount: 2, onchainCount: 1 },
      execution: { mode: "paper", safetyGates: ["回测完成"] },
      humanFactors: ["避免 FOMO 追涨"],
      watchSignals: [],
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
    },
    persistedActions: [],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: -0.02, sharpe: 0.2, max_dd: -0.2, n_trades: 6 },
      },
    ],
    runs: [],
    dailyRadarStatus: dailyRadarStatusFromRuns([], new Date("2026-06-03T08:00:00.000Z")),
  });

  assert.equal(now.stage, "redesign");
  assert.equal(now.owner, "AI");
  assert.equal(now.primaryAction.kind, "analyze_and_validate");
  assert.equal(now.primaryAction.label, "让 AI 重做蓝图");
  assert.equal(now.primaryAction.proposedFormState?.goal, now.proposedFormState?.goal);
  assert.equal(now.primaryHref, undefined);
  assert.ok(now.summary.includes("淘汰"));
  assert.ok(now.guardrail.includes("安全动作"));
  assert.equal(now.proposedFormState?.goal, now.scanFormState?.goal);
  assert.equal(now.proposalCard?.goal, now.proposedFormState?.goal);
  assert.ok(now.proposedFormState?.goal.includes("btca"));
  assert.ok(now.proposedFormState?.goal.includes("20.00%"));
  assert.ok(now.proposedFormState?.goal.includes("paper 验证"));
});

test("aiNowActionFromState makes strong validation a single paper adoption task", () => {
  const now = aiNowActionFromState({
    analysis: {
      context: { notes: [], newsCount: 4, macroCount: 2, onchainCount: 1 },
      execution: { mode: "paper", safetyGates: ["回测完成"] },
      humanFactors: ["避免 FOMO 追涨"],
      watchSignals: [{ source: "news", signal: "ETF inflows accelerate" }],
      strategyDrafts: [
        {
          name: "btca",
          kind: "grid_dca",
          symbol: "BTC",
          params: {},
          riskCaps: { maxPositionUsd: 100, maxLeverage: 3, dailyLossCapUsd: 20 },
        },
      ],
    },
    persistedActions: [{ id: "sentiment_review", status: "done" }],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
    runs: [],
  });

  assert.equal(now.stage, "paper_candidate");
  assert.equal(now.owner, "AI");
  assert.equal(now.primaryAction.kind, "save_and_accept_paper_candidate");
  assert.equal(now.primaryAction.label, "保存并采用 paper");
  assert.equal(now.primaryHref, "/backtests/run_btc");
  assert.ok(now.summary.includes("收益 12.00%"));
  assert.ok(now.summary.includes("回撤 6.00%"));
  assert.ok(now.summary.includes("夏普 1.80"));
  assert.ok(now.summary.includes("避免 FOMO 追涨"));
  assert.ok(now.summary.includes("ETF inflows accelerate"));
  assert.ok(now.why.some((item) => item.includes("评分")));
  assert.ok(now.guardrail.includes("paper"));
});

test("aiNowActionFromState makes active paper watch the current task", () => {
  const now = aiNowActionFromState({
    analysis: {
      context: { notes: [], newsCount: 4, macroCount: 2, onchainCount: 1 },
      execution: { mode: "paper", safetyGates: ["回测完成"] },
      humanFactors: ["避免 FOMO 追涨"],
      watchSignals: [{ source: "news", signal: "ETF inflows accelerate" }],
      strategyDrafts: [
        {
          name: "btca",
          kind: "grid_dca",
          symbol: "BTC",
          params: {},
          riskCaps: { maxPositionUsd: 100, maxLeverage: 3, dailyLossCapUsd: 20 },
        },
      ],
    },
    persistedActions: [
      { id: "sentiment_review", status: "done" },
      {
        id: "paper_watch",
        status: "manual",
        href: "/backtests/run_btc",
        note: "AI paper 观察计划：btca，观察 24-72 小时。",
      },
    ],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
    runs: [],
  });

  assert.equal(now.stage, "paper_watch");
  assert.equal(now.owner, "你");
  assert.ok(now.title.includes("paper"));
  assert.deepEqual(now.primaryAction, {
    kind: "complete_manual_action",
    label: "完成 paper 复盘",
    actionId: "paper_watch",
  });
  assert.equal(now.primaryHref, "/backtests/run_btc");
  assert.ok(now.guardrail.includes("paper"));
  assert.ok(now.summary.includes("AI paper 观察计划"));
});

test("aiNowActionFromState opens ready paper strategy before paper watch", () => {
  const now = aiNowActionFromState({
    analysis: {
      context: { notes: [], newsCount: 4, macroCount: 2, onchainCount: 1 },
      execution: { mode: "paper", safetyGates: ["回测完成"] },
      humanFactors: ["避免 FOMO 追涨"],
      watchSignals: [{ source: "news", signal: "ETF inflows accelerate" }],
      strategyDrafts: [
        {
          name: "btca",
          kind: "grid_dca",
          symbol: "BTC",
          params: {},
          riskCaps: { maxPositionUsd: 100, maxLeverage: 3, dailyLossCapUsd: 20 },
        },
      ],
    },
    persistedActions: [
      { id: "sentiment_review", status: "done" },
      {
        id: "strategy",
        status: "ready",
        href: "/option?source=ai-goal&draft=btca",
        note: "AI 推荐先保存 btca 为 paper 观察策略。",
      },
      {
        id: "paper_watch",
        status: "manual",
        href: "/backtests/run_btc",
        note: "AI paper 观察计划：btca，观察 24-72 小时。",
      },
    ],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
    runs: [],
  });

  assert.equal(now.stage, "paper_watch");
  assert.ok(now.title.includes("paper 策略"));
  assert.equal(now.primaryAction.kind, "open_link");
  assert.equal(now.primaryHref, "/option?source=ai-goal&draft=btca");
  assert.ok(now.summary.includes("AI 推荐先保存"));
});

test("aiNowActionFromState makes heated sentiment review directly completable", () => {
  const now = aiNowActionFromState({
    analysis: {
      context: { notes: [], newsCount: 4, macroCount: 2, onchainCount: 1 },
      execution: { mode: "paper", safetyGates: ["回测完成"] },
      humanFactors: ["新闻热度过高，FOMO 追涨风险上升。"],
      watchSignals: [{ source: "human", signal: "社媒拥挤", interpretation: "追涨情绪过热。" }],
      strategyDrafts: [
        {
          name: "btca",
          kind: "grid_dca",
          symbol: "BTC",
          params: {},
          riskCaps: { maxPositionUsd: 100, maxLeverage: 3, dailyLossCapUsd: 20 },
        },
      ],
    },
    persistedActions: [],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
    runs: [],
  });

  assert.equal(now.stage, "sentiment_review");
  assert.equal(now.owner, "你");
  assert.deepEqual(now.primaryAction, {
    kind: "complete_manual_action",
    label: "完成风向 / 人性复核",
    actionId: "sentiment_review",
  });
  assert.equal(now.primaryHref, "/data-explorer/news");
  assert.ok(now.guardrail.includes("人工判断"));
});

test("aiNowActionFromState keeps thin completed paper watch as human review task", () => {
  const now = aiNowActionFromState({
    analysis: {
      context: { notes: [], newsCount: 4, macroCount: 2, onchainCount: 1 },
      execution: { mode: "testnet", safetyGates: ["backtest", "paper review evidence"] },
      humanFactors: [],
      watchSignals: [],
      strategyDrafts: [
        {
          name: "btca",
          kind: "grid_dca",
          symbol: "BTC",
          params: {},
          riskCaps: { maxPositionUsd: 100, maxLeverage: 3, dailyLossCapUsd: 20 },
        },
      ],
    },
    persistedActions: [
      { id: "sentiment_review", status: "done" },
      { id: "paper_watch", status: "done", href: "/backtests/run_btc", note: "Paper 已完成" },
    ],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
    runs: [],
  });

  assert.equal(now.stage, "paper_review");
  assert.equal(now.owner, "你");
  assert.deepEqual(now.primaryAction, {
    kind: "complete_manual_action",
    label: "补齐 paper 复盘证据",
    actionId: "paper_watch",
  });
  assert.equal(now.primaryHref, "/backtests/run_btc");
  assert.ok(now.summary.includes("复盘证据不足"));
  assert.ok(now.guardrail.includes("测试网"));
  assert.ok(now.nextActions.some((item) => item.includes("市场风向")));
});

test("nextAIGoalDecision asks for validation before paper or testnet", () => {
  const decision = nextAIGoalDecision(
    {
      context: { notes: [] },
      execution: { mode: "paper", safetyGates: [] },
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTCUSDT", params: {} }],
    },
    [],
    [],
  );

  assert.equal(decision.stage, "backtest");
  assert.equal(decision.tone, "warning");
  assert.equal(decision.title, "先验证 AI 草案");
  assert.ok(decision.nextActions.some((action) => action.includes("批量回测")));
  assert.deepEqual(decision.primaryAction, {
    kind: "run_all_backtests",
    label: "运行 AI 批量回测",
  });
});

test("nextAIGoalDecision opens started validation before rerunning backtests", () => {
  const decision = nextAIGoalDecision(
    {
      id: "goal_started_validation",
      context: { notes: [], newsCount: 4, macroCount: 2, onchainCount: 1 },
      execution: { mode: "paper", safetyGates: ["回测完成"] },
      humanFactors: [],
      watchSignals: [],
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
    },
    [
      {
        id: "backtest",
        status: "done",
        relatedId: "run_btc",
        href: "/backtests/run_btc",
        note: "已发起 1 个 AI 草案回测：btca",
      },
    ],
    [],
  );

  assert.equal(decision.stage, "validating");
  assert.deepEqual(decision.primaryAction, {
    kind: "open_link",
    label: "打开已启动回测",
  });
  assert.equal(decision.primaryHref, "/backtests/run_btc");
  assert.ok(decision.summary.includes("不重复创建"));
});

test("nextAIGoalDecision keeps paper candidate in observation until paper watch is done", () => {
  const decision = nextAIGoalDecision(
    {
      context: { notes: [] },
      execution: { mode: "paper", safetyGates: [] },
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
    },
    [{ id: "paper_watch", status: "manual", href: "/backtests/run_btc" }],
    [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
  );

  assert.equal(decision.stage, "paper_watch");
  assert.equal(decision.title, "继续 paper 观察");
  assert.equal(decision.primaryHref, "/backtests/run_btc");
});

test("nextAIGoalDecision promotes strong completed paper watch only to testnet candidate", () => {
  const decision = nextAIGoalDecision(
    {
      context: { notes: [] },
      execution: { mode: "mainnet", safetyGates: ["mainnet token gate"] },
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
    },
    [
      {
        id: "paper_watch",
        status: "done",
        href: "/backtests/run_btc",
        note:
          "Paper 观察已完成 24-72 小时复盘：已检查市场风向、舆论变化、人性偏差、执行摩擦和回撤表现；只允许进入测试网前检查，不进入主网。",
      },
    ],
    [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
  );

  assert.equal(decision.stage, "testnet_candidate");
  assert.equal(decision.tone, "success");
  assert.equal(decision.title, "可作为测试网候选");
  assert.ok(decision.summary.includes("不建议直接主网"));
  assert.deepEqual(decision.primaryAction, {
    kind: "open_link",
    label: "打开策略预填",
  });
});

test("nextAIGoalDecision keeps completed paper watch in review when evidence is thin", () => {
  const decision = nextAIGoalDecision(
    {
      context: { notes: [] },
      execution: { mode: "mainnet", safetyGates: ["mainnet token gate"] },
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
    },
    [
      {
        id: "paper_watch",
        status: "done",
        href: "/backtests/run_btc",
        note: "Paper 已完成",
      },
    ],
    [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
  );

  assert.equal(decision.stage, "paper_watch");
  assert.equal(decision.tone, "warning");
  assert.ok(decision.summary.includes("复盘证据不足"));
  assert.ok(decision.reasons.some((item) => item.includes("市场风向")));
  assert.equal(decision.primaryHref, "/backtests/run_btc");
});

test("nextAIGoalDecision rejects weak validation and asks for a new blueprint", () => {
  const decision = nextAIGoalDecision(
    {
      context: { notes: [] },
      execution: { mode: "paper", safetyGates: [] },
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
    },
    [],
    [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: -0.02, sharpe: 0.2, max_dd: -0.2, n_trades: 6 },
      },
    ],
  );

  assert.equal(decision.stage, "redesign");
  assert.equal(decision.tone, "danger");
  assert.ok(decision.nextActions.some((action) => action.includes("重新生成")));
  assert.deepEqual(decision.primaryAction, {
    kind: "analyze_and_validate",
    label: "让 AI 重做蓝图",
  });
});

test("nextAIGoalDecision exposes a safe adopt-paper primary action", () => {
  const decision = nextAIGoalDecision(
    {
      context: { notes: [] },
      execution: { mode: "paper", safetyGates: [] },
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
    },
    [],
    [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
  );

  assert.equal(decision.stage, "paper_candidate");
  assert.deepEqual(decision.primaryAction, {
    kind: "accept_paper_candidate",
    label: "采用为 paper 候选",
  });
});

test("nextAIGoalDecision requires sentiment review before adopting a heated paper candidate", () => {
  const analysis = {
    context: { notes: [], newsCount: 6, macroCount: 1, onchainCount: 2 },
    execution: { mode: "paper", safetyGates: [] },
    humanFactors: ["新闻热度过高，FOMO 追涨风险上升。"],
    watchSignals: [
      {
        source: "human",
        signal: "社交媒体 FOMO",
        interpretation: "追涨情绪过热。",
        action: "先确认是否降低 paper 仓位。",
      },
    ],
    strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
  };
  const backtests = [
    {
      runId: "run_btc",
      strategyId: "btca",
      state: 3,
      metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
    },
  ];

  const blocked = nextAIGoalDecision(analysis, [], backtests);

  assert.equal(blocked.stage, "sentiment_review");
  assert.equal(blocked.tone, "warning");
  assert.equal(blocked.title, "先复核风向 / 人性");
  assert.equal(blocked.primaryAction, undefined);
  assert.ok(blocked.reasons.some((reason) => reason.includes("FOMO")));

  const thinReviewed = nextAIGoalDecision(
    analysis,
    [{ id: "sentiment_review", status: "done", note: "风向 / 人性复核已完成。" }],
    backtests,
  );

  assert.equal(thinReviewed.stage, "sentiment_review");
  assert.ok(thinReviewed.reasons.some((reason) => reason.includes("FOMO")));

  const reviewed = nextAIGoalDecision(
    analysis,
    [{ id: "sentiment_review", status: "done" }],
    backtests,
  );

  assert.equal(reviewed.stage, "paper_candidate");
  assert.deepEqual(reviewed.primaryAction, {
    kind: "accept_paper_candidate",
    label: "采用为 paper 候选",
  });
});

test("aiDraftEvidenceFromAnalysis summarizes draft evidence and gates", () => {
  const evidence = aiDraftEvidenceFromAnalysis(
    {
      context: {
        newsCount: 3,
        macroCount: 1,
        onchainCount: 2,
        notes: [],
      },
      humanFactors: ["FOMO 追涨风险", "拥挤交易风险"],
      watchSignals: [
        {
          source: "news",
          signal: "ETF inflows accelerate",
          interpretation: "资金流支持趋势，但可能放大拥挤。",
          action: "降低 paper 仓位。",
        },
      ],
      execution: {
        mode: "paper",
        safetyGates: ["回测完成", "人工复核"],
      },
    },
    {
      name: "btca",
      kind: "grid_dca",
      symbol: "BTCUSDT",
      params: {},
      riskCaps: { maxPositionUsd: 400, maxLeverage: 4, dailyLossCapUsd: 18 },
    },
  );

  assert.equal(evidence.title, "btca 证据摘要");
  assert.equal(evidence.tone, "success");
  assert.equal(evidence.metrics.find((item) => item.label === "上下文").value, "3/1/2");
  assert.ok(evidence.evidence.some((item) => item.includes("新闻 3")));
  assert.ok(evidence.risks.some((item) => item.includes("FOMO")));
  assert.ok(evidence.gates.some((item) => item.includes("人工复核")));
  assert.ok(evidence.actions.some((item) => item.includes("回测")));
  assert.ok(evidence.summary.includes("$400"));
});

test("aiDraftEvidenceFromAnalysis marks watch-only drafts as observation only", () => {
  const evidence = aiDraftEvidenceFromAnalysis(
    {
      context: {
        newsCount: 0,
        macroCount: 0,
        onchainCount: 0,
        notes: ["news source unavailable"],
      },
      humanFactors: [],
      watchSignals: [],
      execution: {
        mode: "observe",
        safetyGates: [],
      },
    },
    {
      name: "watch",
      kind: "watch_only",
      symbol: "BTC",
      params: {},
    },
  );

  assert.equal(evidence.tone, "warning");
  assert.ok(evidence.summary.includes("只观察"));
  assert.ok(evidence.gates.some((item) => item.includes("不能回测")));
  assert.ok(evidence.evidence.some((item) => item.includes("news source unavailable")));
  assert.ok(evidence.actions.some((item) => item.includes("补齐数据")));
});

test("manualActionTransition only allows human checklist actions to advance", () => {
  assert.deepEqual(
    manualActionTransition({
      id: "sentiment_review",
      title: "复核风向 / 人性",
      status: "manual",
    }),
    {
      label: "完成风向 / 人性复核",
      nextStatus: "done",
      note: "已复核市场风向、舆论情绪和人性偏差/拥挤度；确认未出现 FOMO 追涨或单边叙事过热，只允许进入 paper 采用前检查。",
    },
  );
  assert.deepEqual(
    manualActionTransition({ id: "paper_watch", title: "Paper 观察与复盘", status: "manual" }),
    {
      label: "完成 paper 复盘",
      nextStatus: "done",
      note:
        "Paper 观察已完成 24-72 小时复盘：已检查市场风向、舆论变化、人性偏差、执行摩擦和回撤表现；只允许进入测试网前检查，不进入主网。",
    },
  );
  const paperTransition = manualActionTransition({
    id: "paper_watch",
    title: "Paper 观察与复盘",
    status: "manual",
    note: "AI paper 观察计划：btca。资金边界：paper 仓位不超过 $200，杠杆不超过 4x，日亏损上限 $18。",
  });
  assert.equal(paperTransition.nextStatus, "done");
  assert.ok(paperTransition.note.includes("$200"));
  assert.ok(paperTransition.note.includes("$18"));
  assert.ok(paperTransition.note.includes("4x"));
  assert.ok(paperTransition.note.includes("24-72 小时复盘"));
  assert.equal(
    manualActionTransition({ id: "paper_watch", title: "Paper 观察与复盘", status: "blocked" }),
    null,
  );
  assert.equal(
    manualActionTransition({ id: "gate", title: "检查执行闸门", status: "blocked" }),
    null,
  );
  assert.deepEqual(
    manualActionTransition({ id: "gate", title: "检查执行闸门", status: "manual" }),
    {
      label: "完成执行闸门复核",
      nextStatus: "done",
      note: "已确认 kill switch、组合限额、交易闸门和 paper 复盘证据；只允许进入测试网前检查。",
    },
  );
  assert.deepEqual(
    manualActionTransition({ id: "gate", title: "检查执行闸门", status: "done" }),
    {
      label: "重新检查",
      nextStatus: "manual",
      note: "检查执行闸门 需要重新人工检查",
    },
  );
  assert.equal(
    manualActionTransition({ id: "backtest", title: "验证 AI 草案回测", status: "ready" }),
    null,
  );
});

test("formStateFromAIGoalRun restores reusable goal form fields", () => {
  assert.deepEqual(
    formStateFromAIGoalRun(
      {
        goal: "用 AI 观察 BTC 和 ETH 的低回撤机会",
        symbols: ["BTC", "ETHUSDT", ""],
        horizon: "2-6 weeks",
        riskPreference: "conservative",
        executionMode: "paper",
        analysis: {
          context: {
            operatorConstraints: {
              behaviorConstraints: ["避免 FOMO 追涨", "连续亏损后暂停"],
              marketNarrativeFocus: ["ETF 资金流", "社媒拥挤度"],
              avoidScenarios: ["高杠杆", "主网自动下单"],
            },
          },
        },
      },
      {
        goal: "current",
        symbolsText: "SOL",
        horizon: "1-4 weeks",
        riskPreference: "balanced",
        executionMode: "observe",
        behaviorText: "current behavior",
        narrativeText: "current narrative",
        avoidText: "current avoid",
      },
    ),
    {
      goal: "用 AI 观察 BTC 和 ETH 的低回撤机会",
      symbolsText: "BTC, ETHUSDT",
      horizon: "2-6 weeks",
      riskPreference: "conservative",
      executionMode: "paper",
      behaviorText: "避免 FOMO 追涨\n连续亏损后暂停",
      narrativeText: "ETF 资金流\n社媒拥挤度",
      avoidText: "高杠杆\n主网自动下单",
    },
  );
});

test("formStateFromAIGoalRun keeps current fields when run data is missing", () => {
  const current = {
    goal: "current",
    symbolsText: "SOL",
    horizon: "2 weeks",
    riskPreference: "aggressive",
    executionMode: "observe",
  };

  assert.deepEqual(formStateFromAIGoalRun({}, current), current);
});

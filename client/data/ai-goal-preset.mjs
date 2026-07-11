const DEFAULT_PRESET = {
  isPreset: false,
  name: "",
  kind: "grid_dca",
  execSymbol: "BTCUSDT",
  positionLevel: 5,
  openPositionStopTime: 30,
  orderGroupMargin: 100,
  stopProfitRate: 0.05,
  stopLossRate: 0.05,
  profitRateAfterAtAddPosition: 0.02,
  createCostOrderInProfit: false,
  createPositions: [{ marginRate: 1, lossAddRate: 0 }],
  aiRunId: "",
};

export const AI_DEFAULT_BEHAVIOR_TEXT =
  "避免 FOMO 追涨\n连续亏损后暂停加仓\n市场过热时降低仓位";
export const AI_DEFAULT_NARRATIVE_TEXT = "ETF 资金流\n监管消息\n社媒拥挤度";
export const AI_DEFAULT_AVOID_TEXT = "高杠杆\n数据缺口时执行\n主网自动下单";
export const AI_MONEY_DEFAULT_AUTO_RADAR_ENABLED = true;
export const AI_GOAL_EXECUTION_MODE_OPTIONS = Object.freeze([
  { key: "observe", label: "只观察" },
  { key: "paper", label: "Paper" },
]);
const SENTIMENT_REVIEW_COMPLETION_NOTE =
  "已复核市场风向、舆论情绪和人性偏差/拥挤度；确认未出现 FOMO 追涨或单边叙事过热，只允许进入 paper 采用前检查。";
const PAPER_WATCH_COMPLETION_NOTE =
  "Paper 观察已完成 24-72 小时复盘：已检查市场风向、舆论变化、人性偏差、执行摩擦和回撤表现；只允许进入测试网前检查，不进入主网。";

export const AI_GOAL_TEMPLATES = Object.freeze([
  {
    id: "low_drawdown_crypto",
    label: "低回撤加密机会",
    goal:
      "用较低回撤在未来 1-4 周寻找 BTC/ETH 的 AI 辅助赚钱机会，同时考虑新闻情绪、市场拥挤、链上变化和交易执行摩擦。",
    symbols: ["BTC", "ETH"],
    horizon: "1-4 weeks",
    riskPreference: "balanced",
    executionMode: "paper",
  },
  {
    id: "sentiment_breakout",
    label: "舆情趋势跟踪",
    goal:
      "观察主流加密资产的新闻叙事、资金流和价格突破，寻找只适合先回测和 paper 验证的趋势机会。",
    symbols: ["BTC", "ETH", "SOL"],
    horizon: "3-10 days",
    riskPreference: "conservative",
    executionMode: "paper",
  },
  {
    id: "prediction_event_watch",
    label: "事件预测观察",
    goal:
      "围绕高流动性预测市场和宏观事件，寻找可观察但不直接交易的 AI 策略线索，重点检查舆论偏差和拥挤风险。",
    symbols: ["BTC", "ETH"],
    horizon: "1-2 weeks",
    riskPreference: "conservative",
    executionMode: "observe",
  },
]);

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min) return fallback;
  return Math.min(n, max);
}

function clampInt(value, fallback, min, max) {
  return Math.round(clampNumber(value, fallback, min, max));
}

function normalizeName(name, symbol = "ai") {
  const base = String(name || symbol || "ai")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
  const trimmed = base.slice(0, 8);
  if (trimmed.length >= 3) return trimmed;
  return `${trimmed || "ai"}ai`.slice(0, 8);
}

function normalizeSymbol(symbol) {
  const raw = String(symbol || DEFAULT_PRESET.execSymbol)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!raw) return DEFAULT_PRESET.execSymbol;
  if (raw.endsWith("USDT")) return raw;
  return `${raw}USDT`;
}

function cleanSymbolList(values) {
  const seen = new Set();
  const out = [];
  for (const item of values) {
    const symbol = String(item || "").trim().toUpperCase();
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    out.push(symbol);
    if (out.length >= 8) break;
  }
  return out;
}

function symbolsFromText(raw) {
  return cleanSymbolList(String(raw || "").split(/[,\s，、]+/));
}

function cleanOperatorList(raw, limit = 8) {
  const seen = new Set();
  const out = [];
  const values = Array.isArray(raw)
    ? raw
    : String(raw || "").split(/[\n,;，；、]+/);
  for (const item of values) {
    const value = String(item || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value.slice(0, 120));
    if (out.length >= limit) break;
  }
  return out;
}

function cleanOperatorListOrDefault(raw, fallbackText) {
  const values = cleanOperatorList(raw);
  return values.length > 0 ? values : cleanOperatorList(fallbackText);
}

function operatorTextFromList(values) {
  return cleanOperatorList(values).join("\n");
}

function watchSignalReviewText(signal) {
  if (typeof signal === "string") return signal.trim();
  const label = String(signal?.signal || signal?.source || "").trim();
  const interpretation = String(signal?.interpretation || "").trim();
  const action = String(signal?.action || "").trim();
  return [
    label,
    interpretation ? `含义：${interpretation}` : "",
    action ? `建议：${action}` : "",
  ]
    .filter(Boolean)
    .join("；");
}

function sentimentReviewNoteFromEvidence(humanFactors, watchSignals, fallback) {
  const signalNotes = (Array.isArray(watchSignals) ? watchSignals : [])
    .slice(0, 2)
    .map((signal) => watchSignalReviewText(signal));
  const parts = [...safeStringList(humanFactors).slice(0, 2), ...signalNotes].filter(Boolean);
  return parts.length > 0 ? parts.join("；") : fallback;
}

function cleanSymbolsForText(symbols) {
  if (!Array.isArray(symbols)) return "";
  const out = cleanSymbolList(symbols);
  return out.join(", ");
}

function inferredSymbolsFromRuns(runs = []) {
  const seeds = [];
  for (const run of Array.isArray(runs) ? runs : []) {
    if (Array.isArray(run?.symbols)) seeds.push(...run.symbols);
  }
  const fromRuns = cleanSymbolList(seeds).slice(0, 6);
  if (fromRuns.length > 0) return fromRuns;
  return cleanSymbolList(["BTC", "ETH", "SOL"]);
}

function isVagueMoneyGoal(goal) {
  const text = String(goal || "").trim().toLowerCase();
  if (text.length < 12) return true;
  const vagueWords = ["赚钱", "挣钱", "盈利", "make money", "profit"];
  const hasVague = vagueWords.some((word) => text.includes(word));
  const hasContext =
    /btc|eth|sol|usdt|加密|新闻|舆论|情绪|宏观|链上|回测|paper|低回撤|风险|周期/i.test(text);
  return hasVague && !hasContext;
}

function safeExecutionModeForGoal(mode) {
  const value = String(mode || "paper").trim().toLowerCase();
  return value === "observe" ? "observe" : "paper";
}

function safeRiskPreferenceForGoal(riskPreference) {
  const value = String(riskPreference || "balanced").trim().toLowerCase();
  return ["conservative", "balanced", "aggressive"].includes(value) ? value : "balanced";
}

export function autoDailyRadarEnabledFromStorage(
  value,
  fallback = AI_MONEY_DEFAULT_AUTO_RADAR_ENABLED,
) {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "true") return true;
  if (text === "false") return false;
  return Boolean(fallback);
}

export function autoDailyRadarPreferencePersistence({ loaded, enabled } = {}) {
  if (!loaded) return { shouldWrite: false, value: "" };
  return { shouldWrite: true, value: enabled ? "true" : "false" };
}

export function aiGoalComposerFromFormState({
  state = {},
  runs = [],
  now = new Date(),
} = {}) {
  const rawGoal = String(state?.goal || "").trim();
  const vague = isVagueMoneyGoal(rawGoal);
  const symbols = symbolsFromText(state?.symbolsText);
  const inferredSymbols = symbols.length > 0 ? symbols : inferredSymbolsFromRuns(runs);
  const symbolsText = inferredSymbols.join(", ");
  const horizon = String(state?.horizon || "").trim() || (vague ? "24h-7d" : "1-4 weeks");
  const riskPreference = safeRiskPreferenceForGoal(state?.riskPreference);
  const safeRiskPreference = vague && riskPreference === "aggressive" ? "balanced" : riskPreference;
  const executionMode = safeExecutionModeForGoal(state?.executionMode);
  const date = now instanceof Date ? now : new Date(now);
  const day = Number.isNaN(date.getTime())
    ? new Date().toISOString().slice(0, 10)
    : date.toISOString().slice(0, 10);
  const goal = vague
    ? `${day} AI 自动补全赚钱目标：围绕 ${symbolsText} 检查市场风向、新闻舆论、宏观冲击、链上变化、交易拥挤和人性偏差，寻找 ${horizon} 内可先回测和 paper 验证的低回撤机会；不直接主网交易。`
    : rawGoal;
  const behaviorText = String(state?.behaviorText || "").trim() || AI_DEFAULT_BEHAVIOR_TEXT;
  const narrativeText = String(state?.narrativeText || "").trim() || AI_DEFAULT_NARRATIVE_TEXT;
  const avoidText = String(state?.avoidText || "").trim() || AI_DEFAULT_AVOID_TEXT;
  const missing = [];
  const checks = [];

  if (vague) {
    missing.push("目标太粗，已补成包含市场风向、人性偏差和 paper 验证的 AI 目标。");
  }
  if (symbols.length === 0) {
    missing.push("关注标的为空，已从最近运行或安全默认值补齐。");
  }
  if (!String(state?.horizon || "").trim()) {
    missing.push("周期为空，已补齐为可回测观察窗口。");
  }
  if (String(state?.executionMode || "").toLowerCase() !== executionMode) {
    missing.push("执行倾向已降级到 observe/paper，不允许从目标补全直接进入测试网或主网。");
  }

  checks.push(`目标：${vague ? "已自动补全" : "可用于 AI 分析"}`);
  checks.push(`标的：${symbolsText}`);
  checks.push(`周期：${horizon}`);
  checks.push(`人性约束：${cleanOperatorList(behaviorText).length} 条`);
  checks.push(`风向关注：${cleanOperatorList(narrativeText).length} 条`);
  checks.push(`禁止场景：${cleanOperatorList(avoidText).length} 条`);

  const proposedFormState = {
    goal,
    symbolsText,
    horizon,
    riskPreference: safeRiskPreference,
    executionMode,
    behaviorText,
    narrativeText,
    avoidText,
  };
  const ready = !vague && symbols.length > 0 && String(state?.horizon || "").trim();

  return {
    stage: ready ? "ready" : "needs_enrichment",
    tone: ready ? "success" : "warning",
    title: ready ? "目标可交给 AI 分析" : "AI 已补全粗目标",
    summary: ready
      ? "当前目标已包含足够上下文；AI 会继续纳入人性、风向和禁止场景，并先走验证。"
      : "目标过粗或缺少关键字段，已生成一个安全的 AI 分析目标；补全后直接启动验证。",
    proposedFormState,
    checks,
    missing: missing.length > 0 ? missing : ["没有发现关键缺口。"],
    primaryAction: ready
      ? { kind: "analyze_and_validate", label: "用补全目标分析并验证" }
      : { kind: "analyze_and_validate", label: "应用补全并验证" },
  };
}

export function aiGoalExecutableFormStateFromState({
  state = {},
  runs = [],
  now = new Date(),
} = {}) {
  return aiGoalComposerFromFormState({ state, runs, now }).proposedFormState;
}

export function aiGoalAnalyzeTargetFormState({
  state = {},
  target,
  runs = [],
  now = new Date(),
} = {}) {
  if (target) return target;
  return aiGoalExecutableFormStateFromState({ state, runs, now });
}

function normalizeKind(kind) {
  return kind === "polymarket_event" ? "polymarket_event" : "grid_dca";
}

function normalizePositions(value) {
  if (!Array.isArray(value)) return DEFAULT_PRESET.createPositions;
  const out = value
    .map((row) => ({
      marginRate: clampNumber(row?.marginRate, 0, 0, 1),
      lossAddRate: clampNumber(row?.lossAddRate, 0, 0, 1),
    }))
    .filter((row) => row.marginRate > 0)
    .slice(0, 8);
  return out.length > 0 ? out : DEFAULT_PRESET.createPositions;
}

function readPositions(raw) {
  if (!raw) return DEFAULT_PRESET.createPositions;
  try {
    return normalizePositions(JSON.parse(raw));
  } catch {
    return DEFAULT_PRESET.createPositions;
  }
}

function normalizeRiskCaps(value) {
  if (!value || typeof value !== "object") return null;
  const risk = {
    maxPositionUsd: clampNumber(value.maxPositionUsd, 0, 0, 1000000000),
    maxLeverage: clampNumber(value.maxLeverage, 0, 0, 125),
    dailyLossCapUsd: clampNumber(value.dailyLossCapUsd, 0, 0, 1000000000),
  };
  if (risk.maxPositionUsd <= 0 || risk.maxLeverage <= 0 || risk.dailyLossCapUsd <= 0) {
    return null;
  }
  return risk;
}

function riskCapsFromSearchParams(searchParams) {
  return normalizeRiskCaps({
    maxPositionUsd: searchParams.get("riskMaxPositionUsd"),
    maxLeverage: searchParams.get("riskMaxLeverage"),
    dailyLossCapUsd: searchParams.get("riskDailyLossCapUsd"),
  });
}

export function strategyPresetFromDraft(draft) {
  const params = draft?.params && typeof draft.params === "object" ? draft.params : {};
  const risk = normalizeRiskCaps(draft?.riskCaps);
  const maxLeverage = risk ? clampInt(risk.maxLeverage, 3, 1, 125) : 125;
  const leverageFallback = Math.min(3, maxLeverage);
  const maxOrderGroupMargin = risk ? clampInt(risk.maxPositionUsd, 100, 1, 1000000) : 1000000;
  const orderGroupMarginFallback = Math.min(100, maxOrderGroupMargin);
  const out = {
    source: "ai-goal",
    name: normalizeName(draft?.name, draft?.symbol),
    kind: normalizeKind(draft?.kind),
    execSymbol: normalizeSymbol(draft?.symbol),
    positionLevel: String(clampInt(params.positionLevel, leverageFallback, 1, maxLeverage)),
    openPositionStopTime: String(clampInt(params.openPositionStopTime, 30, 0, 1440)),
    orderGroupMargin: String(
      clampInt(params.orderGroupMargin, orderGroupMarginFallback, 0, maxOrderGroupMargin),
    ),
    stopProfitRate: String(clampNumber(params.stopProfitRate, 0.03, 0, 1)),
    stopLossRate: String(clampNumber(params.stopLossRate, 0.05, 0, 1)),
    profitRateAfterAtAddPosition: String(
      clampNumber(params.profitRateAfterAtAddPosition, 0.01, 0, 1),
    ),
    createCostOrderInProfit: String(Boolean(params.createCostOrderInProfit)),
    createPositions: JSON.stringify(normalizePositions(params.createPositions)),
  };
  if (risk) {
    out.riskMaxPositionUsd = String(risk.maxPositionUsd);
    out.riskMaxLeverage = String(risk.maxLeverage);
    out.riskDailyLossCapUsd = String(risk.dailyLossCapUsd);
  }
  return out;
}

export function strategyPresetSearchFromDraft(draft) {
  return new URLSearchParams(strategyPresetFromDraft(draft)).toString();
}

export function strategyHrefWithAIRunId(href, aiRunId) {
  const sourceRunId = String(aiRunId || "").trim();
  if (!sourceRunId) return href;
  const rawHref = String(href || "").trim();
  if (!rawHref) return rawHref;
  try {
    const url = new URL(rawHref, "http://local");
    url.searchParams.set("aiRunId", sourceRunId);
    return `${url.pathname}?${url.searchParams.toString()}`;
  } catch {
    return rawHref;
  }
}

export function optionPayloadFromStrategyDraft(draft, { aiRunId = "" } = {}) {
  if (String(draft?.kind || "") !== "grid_dca") return null;
  const preset = strategyPresetFromDraft(draft);
  const risk = normalizeRiskCaps({
    maxPositionUsd: preset.riskMaxPositionUsd,
    maxLeverage: preset.riskMaxLeverage,
    dailyLossCapUsd: preset.riskDailyLossCapUsd,
  });
  const sourceRunId = String(aiRunId || "").trim();
  return {
    name: preset.name,
    positionLevel: Number(preset.positionLevel),
    openPositionStopTime: Number(preset.openPositionStopTime),
    execSymbol: preset.execSymbol,
    orderGroupMargin: Number(preset.orderGroupMargin),
    stopProfitRate: Number(preset.stopProfitRate),
    stopLossRate: Number(preset.stopLossRate),
    profitRateAfterAtAddPosition: Number(preset.profitRateAfterAtAddPosition),
    createCostOrderInProfit: preset.createCostOrderInProfit === "true",
    createPositions: readPositions(preset.createPositions),
    ...(sourceRunId ? { aiRunId: sourceRunId } : {}),
    ...(risk ? { risk } : {}),
  };
}

export function strategyActionPatchFromSavedDraft({
  analysis = null,
  draft = null,
  response = null,
  href = "",
} = {}) {
  const savedId = String(
    response?.value?.id || response?.value?.name || draft?.name || "",
  ).trim();
  const name = String(response?.value?.name || draft?.name || "AI 策略").trim();
  const runId = String(analysis?.id || "").trim();
  const goal = String(analysis?.goal || "").trim();
  const symbol = String(draft?.symbol || draft?.params?.execSymbol || "").trim();
  const hypothesis = String(draft?.hypothesis || draft?.rationale || "").trim();
  const detailParts = [
    `${name} 已保存为 AI 策略配置`,
    runId ? `来源 AI run ${runId}` : "",
    goal ? `目标：${goal}` : "",
    symbol ? `标的：${symbol}` : "",
    hypothesis ? `假设：${hypothesis}` : "",
    "live 仍关闭",
    "下一步必须先补回测证据，再进入 paper 观察",
    "paper 中继续记录市场风向、舆论变化、人性偏差和真实执行摩擦",
    "未完成安全账户、风控和测试网检查前不进入主网",
  ].filter(Boolean);

  return {
    status: "done",
    relatedId: savedId,
    ...(href ? { href } : {}),
    note: detailParts.join("；"),
  };
}

export function strategyActionPatchFromOptionPresetCreate({
  preset = null,
  response = null,
  href = "",
} = {}) {
  const runId = String(preset?.aiRunId || "").trim();
  if (!Boolean(preset?.isPreset) || !runId) return null;
  const execSymbol = String(
    preset?.execSymbol || preset?.symbol || preset?.params?.execSymbol || "",
  ).trim();
  const draft = {
    name: preset?.name,
    kind: preset?.kind,
    symbol: execSymbol,
    params: {
      execSymbol,
    },
  };

  return {
    runId,
    actionId: "strategy",
    patch: strategyActionPatchFromSavedDraft({
      analysis: { id: runId },
      draft,
      response,
      href,
    }),
  };
}

function strategyHandoffTone(status) {
  if (status === "done") return "success";
  if (status === "current") return "warning";
  if (status === "blocked") return "danger";
  return "default";
}

function strategyHandoffItem({ id, label, status, detail, href }) {
  return {
    id,
    label,
    status,
    tone: strategyHandoffTone(status),
    detail,
    ...(href ? { href } : {}),
  };
}

function isTradeableSafeAccount(account) {
  const permissions = account?.permissions || {};
  return Boolean(permissions.canTrade) && !Boolean(permissions.canWithdraw);
}

function completedBacktests(backtests) {
  if (!Array.isArray(backtests)) return [];
  return backtests.filter((run) => Number(run?.state) === 3);
}

function activeBacktests(backtests) {
  if (!Array.isArray(backtests)) return [];
  return backtests.filter((run) => [1, 2].includes(Number(run?.state)));
}

function savedStrategyBacktestParamsFromOption(strategy) {
  return {
    positionLevel: Number(strategy?.positionLevel || 0),
    orderGroupMargin: Number(strategy?.orderGroupMargin || 0),
    stopProfitRate: Number(strategy?.stopProfitRate || 0),
    stopLossRate: Number(strategy?.stopLossRate || 0),
    profitRateAfterAtAddPosition: Number(
      strategy?.profitRateAfterAtAddPosition || 0,
    ),
    createCostOrderInProfit: Boolean(strategy?.createCostOrderInProfit),
    createPositions: Array.isArray(strategy?.createPositions)
      ? strategy.createPositions
      : [],
  };
}

export function savedStrategyBacktestHrefFromOption(strategy) {
  const id = String(strategy?.id || strategy?.name || "").trim();
  const symbol = String(strategy?.execSymbol || "").trim();
  const qs = new URLSearchParams();
  if (id) qs.set("strategyId", id);
  if (symbol) qs.set("symbol", symbol);
  qs.set(
    "proposed",
    JSON.stringify(savedStrategyBacktestParamsFromOption(strategy)),
  );
  qs.set("lookbackDays", "90");
  const query = qs.toString();
  return query ? `/backtests/new?${query}` : "/backtests/new";
}

export function savedStrategyBacktestRequestFromOption(strategy, now = new Date()) {
  const id = String(strategy?.id || strategy?.name || "").trim();
  const symbol = String(strategy?.execSymbol || "").trim();
  if (!id || !symbol) return null;
  const end = now instanceof Date ? now : new Date(now);
  const start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
  return {
    strategyId: id,
    kind: "grid_dca",
    params: savedStrategyBacktestParamsFromOption(strategy),
    symbol,
    exchange: "binance",
    timeframe: "1h",
    start: start.toISOString(),
    end: end.toISOString(),
    initialCapital: 10000,
    commissionRate: 0.0004,
    slippageBps: 1,
  };
}

export function aiMoneyRunHref(runId) {
  const id = String(runId || "").trim();
  if (!id) return "/ai-money";
  const qs = new URLSearchParams({ runId: id });
  return `/ai-money?${qs.toString()}`;
}

export function aiSavedStrategyHandoffFromState({
  strategy = null,
  accounts = [],
  backtests = [],
  goalRun = null,
} = {}) {
  const id = String(strategy?.id || "").trim();
  const name = String(strategy?.name || "AI 策略").trim();
  const symbol = String(strategy?.execSymbol || "—").trim();
  const risk = strategy?.risk || {};
  const riskReady =
    Number(risk.maxPositionUsd || 0) > 0 &&
    Number(risk.maxLeverage || 0) > 0 &&
    Number(risk.dailyLossCapUsd || 0) > 0;
  const liveOff = !Boolean(strategy?.live?.enabled);
  const safeAccounts = Array.isArray(accounts)
    ? accounts.filter(isTradeableSafeAccount)
    : [];
  const completed = completedBacktests(backtests);
  const active = activeBacktests(backtests);
  const rankedCompleted = rankBacktestValidation(completed);
  const bestValidation = rankedCompleted[0] || null;
  const bestBacktest =
    (bestValidation?.runId
      ? completed.find((run) => String(run?.runId || "") === String(bestValidation.runId))
      : null) ||
    completed[0] ||
    active[0] ||
    null;
  const backtestHref = bestBacktest?.runId
    ? `/backtests/${encodeURIComponent(bestBacktest.runId)}`
    : id
      ? savedStrategyBacktestHrefFromOption(strategy)
      : "/backtests/new";
  const validationRecommendation = String(bestValidation?.recommendation || "").trim();
  const validationPaperReady = validationRecommendation === "优先 paper";
  const validationFailed =
    validationRecommendation === "淘汰" ||
    validationRecommendation === "失败" ||
    bestValidation?.tone === "danger";
  const backtestStatus =
    completed.length > 0
      ? validationPaperReady
        ? "done"
        : validationFailed
          ? "blocked"
          : "current"
      : "current";
  const backtestDetail =
    completed.length > 0 && bestValidation
      ? `${completed.length} 个回测已完成，最佳评分 ${
          bestValidation.score ?? "—"
        }，结论：${validationRecommendation || "继续观察"}。先复核收益、回撤、夏普和交易次数。`
      : completed.length > 0
        ? `${completed.length} 个回测已完成，先复核收益、回撤、夏普和交易次数。`
        : active.length > 0
          ? `${active.length} 个回测仍在运行，等待完成后再进入 paper。`
          : `${name} 还没有回测证据，先验证 ${symbol} 当前参数。`;

  const sourceRunId = String(goalRun?.id || strategy?.aiRunId || "").trim();
  const sourceGoal = String(goalRun?.goal || "").trim();
  const sourceRunItem = sourceRunId
    ? strategyHandoffItem({
        id: "source_run",
        label: "来源 AI 运行",
        status: "done",
        detail: sourceGoal
          ? `来自 AI 目标：${sourceGoal}`
          : "可回到 AI Money 查看原始目标、行动队列和风向判断。",
        href: aiMoneyRunHref(sourceRunId),
      })
    : null;

  const items = [
    ...(sourceRunItem ? [sourceRunItem] : []),
    strategyHandoffItem({
      id: "live_off",
      label: "Live 保持关闭",
      status: liveOff ? "done" : "blocked",
      detail: liveOff
        ? "AI 草案只是策略配置，尚未开启测试网或主网执行。"
        : "该策略已经开启 live，继续前先确认是否符合 AI 草案的安全边界。",
    }),
    strategyHandoffItem({
      id: "backtest",
      label: "回测证据",
      status: backtestStatus,
      detail: backtestDetail,
      href: backtestHref,
    }),
    strategyHandoffItem({
      id: "risk_caps",
      label: "风控上限",
      status: riskReady ? "done" : "blocked",
      detail: riskReady
        ? `最大仓位 $${Number(risk.maxPositionUsd).toFixed(0)}，最大杠杆 ${Number(risk.maxLeverage).toFixed(0)}x，日亏损 $${Number(risk.dailyLossCapUsd).toFixed(0)}。`
        : "最大仓位、最大杠杆和每日亏损上限必须全部大于 0。",
    }),
    strategyHandoffItem({
      id: "safe_account",
      label: "安全账户",
      status: safeAccounts.length > 0 ? "done" : "blocked",
      detail:
        safeAccounts.length > 0
          ? `${safeAccounts.length} 个账户可交易且无提现权限，可用于后续测试网检查。`
          : "缺少可交易且不可提现的账户，AI 不应推进到执行。",
      href: safeAccounts.length > 0 ? undefined : "/accounts/new",
    }),
    strategyHandoffItem({
      id: "paper_watch",
      label: "Paper 观察",
      status: validationPaperReady && liveOff && riskReady ? "current" : "pending",
      detail:
        validationPaperReady
          ? "回测通过后仍需 24-72 小时 paper 观察，记录舆论、人性和真实执行摩擦。"
          : completed.length > 0
            ? "当前回测未达到 paper 标准，先让 AI 重新设计或补充验证。"
            : "等待回测证据后再创建 paper 观察计划。",
    }),
  ];

  let stage = "paper_review";
  let tone = "success";
  let title = "进入 paper 复核";
  let summary = `${name} 已由 AI 草案保存，live 保持关闭。回测、风控和安全账户都具备后，下一步是 paper 观察，不是直接实盘。`;
  let primaryHref = bestBacktest?.runId ? backtestHref : undefined;
  let primaryAction = primaryHref
    ? { kind: "review_backtest", label: "查看回测证据" }
    : undefined;
  let nextActions = [
    "复核回测收益、回撤、夏普和交易频率。",
    "把舆论、人性偏差和市场风向写入 paper 观察。",
    "完成 paper 后再检查测试网，不直接进入主网。",
  ];

  if (!liveOff) {
    stage = "live_enabled";
    tone = "warning";
    title = "先确认 live 状态";
    summary = `${name} 当前 live 已开启，和 AI 草案安全边界不一致。继续前先检查实盘 / 风控配置。`;
    primaryHref = undefined;
    primaryAction = undefined;
    nextActions = ["确认是否需要关闭 live。", "回到 AI Money 重新检查当前目标和风向。"];
  } else if (completed.length === 0) {
    stage = "needs_backtest";
    tone = "warning";
    title = "先补回测证据";
    summary = `${name} 已保存为 AI 策略草案，live 保持关闭。下一步先回测 ${symbol} 参数，再决定是否进入 paper。`;
    primaryHref = backtestHref;
    primaryAction = { kind: "run_backtest", label: "先运行回测" };
    nextActions = [
      "运行当前参数回测。",
      "检查收益、最大回撤、夏普和交易次数。",
      "回测完成后再进入 paper 观察。",
    ];
  } else if (!validationPaperReady) {
    const validationTone = bestValidation?.tone || "warning";
    stage = "validation_rejected";
    tone = validationTone;
    title = validationFailed ? "回测未达 paper 标准" : "回测证据还不够强";
    summary = `${name} 已完成回测，但最佳结论是「${
      validationRecommendation || "继续观察"
    }」：评分 ${bestValidation?.score ?? "—"}，收益 ${formatPercentValue(
      bestValidation?.totalReturn,
    )}，回撤 ${formatPercentValue(bestValidation?.maxDrawdown)}。AI 不应把弱证据推进到 paper。`;
    primaryHref = bestBacktest?.runId ? backtestHref : undefined;
    primaryAction = primaryHref
      ? {
          kind: "review_backtest",
          label: validationFailed ? "查看失败证据" : "查看回测证据",
        }
      : sourceRunId
        ? { kind: "open_ai_run", label: "回到 AI 重新设计" }
        : undefined;
    nextActions = [
      "查看弱回测证据，确认亏损、回撤或交易次数问题。",
      "回到来源 AI 目标运行重新设计参数或换成观察型策略。",
      "重新设计后再跑回测，不直接进入 paper。",
    ];
  } else if (!riskReady) {
    stage = "risk_blocked";
    tone = "warning";
    title = "先补风控上限";
    summary = `${name} 已有回测证据，但风控上限不完整。AI 不能推进执行检查。`;
    primaryHref = undefined;
    primaryAction = undefined;
    nextActions = ["补齐最大仓位、最大杠杆和每日亏损上限。", "保存风控后再进入 paper 观察。"];
  } else if (safeAccounts.length === 0) {
    stage = "account_blocked";
    tone = "warning";
    title = "先添加安全账户";
    summary = `${name} 已有回测证据，但缺少可交易且不可提现的账户。AI 只能停在 paper 前。`;
    primaryHref = "/accounts/new";
    primaryAction = { kind: "add_safe_account", label: "添加安全账户" };
    nextActions = ["添加无提现权限的交易账户。", "继续 paper 观察，不直接启用主网。"];
  }
  if (sourceRunId) {
    nextActions.push("需要重做判断时，回到来源 AI 目标运行继续推进。");
  }

  return {
    stage,
    tone,
    title,
    summary,
    primaryHref,
    primaryAction,
    items,
    nextActions,
  };
}

export function optionCreateRedirectHref({
  isAIPreset = false,
  response = null,
  runId = "",
} = {}) {
  if (!isAIPreset) return "/strategies";
  const id = String(response?.value?.id || "").trim();
  if (!id) return "/strategies";
  const qs = new URLSearchParams({ from: "ai-draft" });
  const sourceRunId = String(runId || "").trim();
  if (sourceRunId) qs.set("aiRunId", sourceRunId);
  return `/strategies/${encodeURIComponent(id)}?${qs.toString()}`;
}

export function formStateFromAIGoalRun(run, current) {
  const goal = String(run?.goal || "").trim();
  const symbolsText = cleanSymbolsForText(run?.symbols);
  const horizon = String(run?.horizon || "").trim();
  const riskPreference = String(run?.riskPreference || "").trim();
  const executionMode = String(run?.executionMode || "").trim();
  const operatorConstraints = run?.analysis?.context?.operatorConstraints || {};
  const behaviorText = operatorTextFromList(operatorConstraints.behaviorConstraints);
  const narrativeText = operatorTextFromList(operatorConstraints.marketNarrativeFocus);
  const avoidText = operatorTextFromList(operatorConstraints.avoidScenarios);
  return {
    ...current,
    ...(goal ? { goal } : {}),
    ...(symbolsText ? { symbolsText } : {}),
    ...(horizon ? { horizon } : {}),
    ...(riskPreference ? { riskPreference } : {}),
    ...(executionMode ? { executionMode } : {}),
    ...(behaviorText ? { behaviorText } : {}),
    ...(narrativeText ? { narrativeText } : {}),
    ...(avoidText ? { avoidText } : {}),
  };
}

export function formStateFromGoalTemplate(template, current) {
  if (!template || typeof template !== "object") return current;
  const symbolsText = cleanSymbolsForText(template.symbols);
  const executionMode = ["observe", "paper"].includes(template.executionMode)
    ? template.executionMode
    : "paper";
  return {
    ...current,
    goal: String(template.goal || current?.goal || ""),
    symbolsText: symbolsText || current?.symbolsText || "",
    horizon: String(template.horizon || current?.horizon || ""),
    riskPreference: String(template.riskPreference || current?.riskPreference || "balanced"),
    executionMode,
  };
}

export function aiGoalRequestFromFormState(state) {
  const goal = String(state?.goal || "").trim();
  const horizon = String(state?.horizon || "").trim();
  const riskPreference = safeRiskPreferenceForGoal(state?.riskPreference);
  const executionMode = safeExecutionModeForGoal(state?.executionMode);
  const request = {
    goal,
    symbols: symbolsFromText(state?.symbolsText),
    horizon,
    riskPreference,
    executionMode,
  };
  const behaviorConstraints = cleanOperatorListOrDefault(
    state?.behaviorText ?? state?.behaviorConstraints,
    AI_DEFAULT_BEHAVIOR_TEXT,
  );
  const marketNarrativeFocus = cleanOperatorListOrDefault(
    state?.narrativeText ?? state?.marketNarrativeFocus,
    AI_DEFAULT_NARRATIVE_TEXT,
  );
  const avoidScenarios = cleanOperatorListOrDefault(
    state?.avoidText ?? state?.avoidScenarios,
    AI_DEFAULT_AVOID_TEXT,
  );
  if (behaviorConstraints.length > 0) {
    request.behaviorConstraints = behaviorConstraints;
  }
  if (marketNarrativeFocus.length > 0) {
    request.marketNarrativeFocus = marketNarrativeFocus;
  }
  if (avoidScenarios.length > 0) {
    request.avoidScenarios = avoidScenarios;
  }
  return request;
}

export function aiGoalFormPrimaryActions() {
  return {
    primary: {
      kind: "analyze_and_validate",
      label: "分析并启动验证",
      submit: true,
    },
    secondary: {
      kind: "analyze_only",
      label: "只生成蓝图",
    },
    goalRequired: false,
    helperText:
      "目标可留空；默认让 AI 先自动补全目标，再分析并自动回测可验证草案；只创建验证任务，不会下单。",
  };
}

export function dailyRadarFormStateFromRuns(runs = [], now = new Date()) {
  const symbolSeeds = ["BTC", "ETH", "SOL"];
  for (const run of Array.isArray(runs) ? runs : []) {
    if (Array.isArray(run?.symbols)) {
      symbolSeeds.push(...run.symbols);
    }
  }
  const symbols = cleanSymbolList(symbolSeeds).slice(0, 6);
  const date = now instanceof Date ? now : new Date(now);
  const day = Number.isNaN(date.getTime())
    ? new Date().toISOString().slice(0, 10)
    : date.toISOString().slice(0, 10);
  return {
    goal:
      `${day} 今日 AI 机会雷达：AI 自动围绕 ${symbols.join("/")} 检查市场风向、近 24 小时新闻舆论、宏观冲击、链上变化、市场拥挤和人性偏差，` +
      "寻找未来 24h-7d 内可先回测和 paper 验证的赚钱机会；优先低回撤、可解释、可观察的策略，不直接主网交易。",
    symbolsText: symbols.join(", "),
    horizon: "24h-7d",
    riskPreference: "balanced",
    executionMode: "paper",
  };
}

export function aiAutonomousGoalProposalFromState({
  runs = [],
  dailyRadarStatus = null,
  now = new Date(),
} = {}) {
  const proposedFormState = dailyRadarFormStateFromRuns(runs, now);
  const actionKind = String(dailyRadarStatus?.primaryAction?.kind || "scan_today");
  const hasFreshRadar = actionKind === "open_today_run";
  return {
    proposedFormState,
    title: "AI 自动生成目标并验证",
    summary: hasFreshRadar
      ? "今天已有 AI 雷达，仍可让 AI 用同一观察面重新生成目标并验证。"
      : "AI 会先自动补全赚钱目标，再读取市场风向、新闻舆论、宏观、链上和人性偏差，生成策略蓝图并启动安全验证。",
    nextActions: [
      "自动补全目标、标的、周期和风险偏好。",
      "读取市场风向、新闻舆论、宏观和链上证据。",
      "生成策略蓝图后先回测，再进入 paper 观察。",
    ],
  };
}

function aiGoalProposalCardFromFormState(formState = {}) {
  return {
    title: "AI 自动目标草案",
    goal: String(formState?.goal || "").trim(),
    stats: [
      {
        label: "标的",
        value: String(formState?.symbolsText || "auto").trim() || "auto",
        hint: "市场/舆论扫描范围",
      },
      {
        label: "周期",
        value: String(formState?.horizon || "auto").trim() || "auto",
        hint: String(formState?.riskPreference || "balanced").trim() || "balanced",
      },
      {
        label: "执行",
        value: String(formState?.executionMode || "paper").trim() || "paper",
        hint: "只允许 observe/paper",
      },
    ],
    checks: [
      "检查市场风向、新闻舆论和宏观冲击。",
      "检查链上变化、市场拥挤和人性偏差。",
      "生成策略蓝图后先回测，再进入 paper 观察。",
      "不会直接主网交易。",
    ],
  };
}

function displaySymbolFromGoalSymbol(symbol) {
  const raw = String(symbol || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!raw) return "";
  if (raw.endsWith("USDT") && raw.length > 4) return raw.slice(0, -4);
  return raw;
}

function redesignSymbolsTextFromAnalysis(analysis) {
  const seeds = [
    ...safeStringList(analysis?.context?.symbols),
    ...(Array.isArray(analysis?.strategyDrafts)
      ? analysis.strategyDrafts.map((draft) => displaySymbolFromGoalSymbol(draft?.symbol))
      : []),
  ];
  const symbols = cleanSymbolList(seeds).slice(0, 6);
  return (symbols.length > 0 ? symbols : cleanSymbolList(["BTC", "ETH", "SOL"])).join(", ");
}

function redesignFormStateFromWeakValidation(analysis, rankedRows = [], decision = {}) {
  const constraints = analysis?.context?.operatorConstraints || {};
  const behaviorText =
    operatorTextFromList(constraints.behaviorConstraints) || AI_DEFAULT_BEHAVIOR_TEXT;
  const narrativeText =
    operatorTextFromList(constraints.marketNarrativeFocus) || AI_DEFAULT_NARRATIVE_TEXT;
  const avoidText = operatorTextFromList(constraints.avoidScenarios) || AI_DEFAULT_AVOID_TEXT;
  const evidence = (Array.isArray(rankedRows) ? rankedRows : [])
    .slice(0, 3)
    .map((row) => {
      const id = String(row?.strategyId || row?.runId || "草案").trim();
      const score = row?.score === null || row?.score === undefined ? "—" : row.score;
      return `${id}: ${row?.recommendation || "淘汰"}，评分 ${score}，收益 ${formatPercentValue(row?.totalReturn)}，回撤 ${formatPercentValue(row?.maxDrawdown)}，夏普 ${formatSharpeValue(row?.sharpe)}`;
    })
    .filter(Boolean);
  const failureSummary =
    evidence.length > 0
      ? evidence.join("；")
      : safeStringList(decision?.reasons).slice(0, 3).join("；") || "上一轮回测没有达到 paper 候选标准";
  const humanEvidence = safeStringList(analysis?.humanFactors).slice(0, 3);
  const watchEvidence = (Array.isArray(analysis?.watchSignals) ? analysis.watchSignals : [])
    .map((signal) => watchSignalReviewText(signal))
    .filter(Boolean)
    .slice(0, 3);
  const contextEvidence = [
    humanEvidence.length > 0 ? `上一轮人性/行为证据：${humanEvidence.join("；")}。` : "",
    watchEvidence.length > 0 ? `上一轮市场/舆论观察信号：${watchEvidence.join("；")}。` : "",
  ].join("");
  const originalGoal = String(analysis?.goal || "").trim();

  return {
    goal:
      `基于上一轮回测被淘汰，AI 重做更保守的赚钱策略蓝图。` +
      (originalGoal ? `原目标：${originalGoal}。` : "") +
      `失败回测证据：${failureSummary}。` +
      contextEvidence +
      "请降低杠杆和仓位暴露，重新检查市场风向、新闻舆论、宏观/链上证据、人性偏差与拥挤风险；只生成可回测、可解释、低回撤的草案，并先做 paper 验证，不直接主网交易。",
    symbolsText: redesignSymbolsTextFromAnalysis(analysis),
    horizon: "24h-7d",
    riskPreference: "conservative",
    executionMode: "paper",
    behaviorText,
    narrativeText,
    avoidText,
  };
}

export function dailyRadarStatusFromRuns(runs = [], now = new Date()) {
  const list = Array.isArray(runs) ? runs : [];
  const date = now instanceof Date ? now : new Date(now);
  const today = Number.isNaN(date.getTime())
    ? new Date().toISOString().slice(0, 10)
    : date.toISOString().slice(0, 10);
  const todayRun =
    list.find((run) => {
      const goal = String(run?.goal || "");
      const created = String(run?.createdAt || "");
      return goal.includes("今日 AI 机会雷达") && (goal.includes(today) || created.startsWith(today));
    }) ?? null;
  if (todayRun) {
    const symbolsText = cleanSymbolsForText(todayRun.symbols);
    const createdAt = new Date(String(todayRun.createdAt || ""));
    const ageMs =
      Number.isNaN(createdAt.getTime()) || Number.isNaN(date.getTime())
        ? 0
        : Math.max(0, date.getTime() - createdAt.getTime());
    const ageHours = ageMs / (60 * 60 * 1000);
    const isStale = ageHours >= 6;
    const ageLabel =
      ageHours >= 1
        ? `${Number(ageHours.toFixed(1))} 小时`
        : `${Math.max(1, Math.round(ageMs / (60 * 1000)))} 分钟`;
    if (isStale) {
      return {
        hasToday: true,
        isStale,
        title: "今日雷达需刷新",
        tone: "warning",
        summary: `上次扫描 ${symbolsText || "auto"} 已过去 ${ageLabel}，日内舆论和链上状态可能已变化。`,
        run: todayRun,
        primaryAction: { kind: "rescan_today", label: "重新扫描" },
        secondaryAction: { kind: "open_today_run", label: "打开旧扫描" },
      };
    }
    return {
      hasToday: true,
      isStale,
      title: "今日雷达已扫描",
      tone: "success",
      summary: `今天已扫描 ${symbolsText || "auto"}，生成 ${Number(todayRun.strategyDraftCount || 0)} 个 AI 蓝图；${ageLabel} 前更新。`,
      run: todayRun,
      primaryAction: { kind: "open_today_run", label: "打开今日雷达" },
      secondaryAction: { kind: "rescan_today", label: "重新扫描" },
    };
  }
  return {
    hasToday: false,
    isStale: true,
    title: "今日雷达未扫描",
    tone: "warning",
    summary: "今天还没有 AI 机会雷达记录。先跑一次今日扫描，让 AI 读取市场、舆论、宏观和链上上下文。",
    run: null,
    primaryAction: { kind: "scan_today", label: "今日扫描" },
  };
}

export function aiSettingsReturnPromptFromSearch({
  intent = "",
  dailyRadarStatus = null,
  providerGate = null,
} = {}) {
  if (String(intent || "").toLowerCase() !== "rerun_ai") {
    return null;
  }
  const providerGateStage = String(providerGate?.stage || "").toLowerCase();
  if (providerGateStage === "blocked" || providerGateStage === "loading") {
    const primaryHref = String(providerGate?.primaryHref || "/settings/ai").trim() || "/settings/ai";
    const primaryLabel =
      String(providerGate?.primaryAction?.label || "").trim() ||
      (providerGateStage === "loading" ? "查看 AI 配置" : "继续配置 AI");
    const summary =
      String(providerGate?.summary || "").trim() ||
      (providerGateStage === "loading"
        ? "刚从 AI 配置回来，正在确认真实 AI provider 状态。确认前不会启动今日雷达。"
        : "刚从 AI 配置回来，但真实 AI provider 仍不可用。先完成 API key 配置和连接测试，再让 AI 重新分析目标。");
    return {
      stage:
        providerGateStage === "loading"
          ? "settings_return_provider_loading"
          : "settings_return_provider_blocked",
      tone: "warning",
      title:
        providerGateStage === "loading"
          ? String(providerGate?.title || "").trim() || "正在确认 AI provider"
          : "AI 配置仍未完成",
      summary,
      primaryHref,
      primaryAction: {
        kind: "open_link",
        label: primaryLabel,
      },
      nextActions:
        providerGateStage === "loading"
          ? [
              "等待 AI provider 配置状态返回。",
              "确认状态为 ready 后再重新扫描目标。",
              "如果长时间未返回，打开 AI 设置页检查 provider 配置。",
            ]
          : [
              "补齐当前 provider 的 API key。",
              "在 AI 设置页完成一次连接测试。",
              "测试通过后返回 AI Money，重新扫描市场、舆论、宏观和链上状态。",
            ],
    };
  }
  const primaryAction = dailyRadarStatus?.primaryAction || {
    kind: "scan_today",
    label: "今日扫描",
  };
  const actionKind = String(primaryAction.kind || "");
  const label =
    actionKind === "open_today_run"
      ? "重新扫描目标"
      : primaryAction.label === "重新扫描"
        ? "重新扫描目标"
        : "重新扫描目标";

  return {
    stage: "settings_return",
    tone: "primary",
    title: "AI 已准备重新分析",
    summary:
      "刚从 AI 配置回来。下一步应让 AI 重新读取市场、舆论、人性偏差和执行约束，替换之前的 fallback 或旧判断。",
    primaryAction: {
      ...primaryAction,
      kind: actionKind === "open_today_run" ? "rescan_today" : actionKind || "scan_today",
      label,
    },
    nextActions: [
      "重新扫描市场、舆论、宏观和链上状态。",
      "让 AI 生成新的策略蓝图和观察信号。",
      "先回测和 paper 观察，再考虑测试网前检查。",
    ],
  };
}

export function aiSettingsReturnAutoRunDecision({
  intent = "",
  busy = false,
  providerBlocked = false,
  providerReady = false,
  lastKey = "",
} = {}) {
  const active = String(intent || "").toLowerCase() === "rerun_ai";
  const key = active ? "settings_return:rerun_ai" : "";
  if (!active) return { shouldRun: false, key, reason: "no_intent" };
  if (busy) return { shouldRun: false, key, reason: "busy" };
  if (providerBlocked) return { shouldRun: false, key, reason: "provider_blocked" };
  if (!providerReady) return { shouldRun: false, key, reason: "provider_not_ready" };
  if (String(lastKey || "") === key) {
    return { shouldRun: false, key, reason: "already_triggered" };
  }
  return { shouldRun: true, key, reason: "ready" };
}

export function autoDailyRadarDecision({
  enabled = false,
  busy = false,
  providerReady = false,
  status = null,
  lastKey = "",
  now = new Date(),
} = {}) {
  if (!enabled) return { shouldRun: false, key: "", reason: "disabled" };
  if (busy) return { shouldRun: false, key: "", reason: "busy" };
  if (!providerReady) return { shouldRun: false, key: "", reason: "provider_not_ready" };
  const actionKind = String(status?.primaryAction?.kind || "");
  if (actionKind !== "scan_today" && actionKind !== "rescan_today") {
    return { shouldRun: false, key: "", reason: "fresh" };
  }
  const date = now instanceof Date ? now : new Date(now);
  const day = Number.isNaN(date.getTime())
    ? new Date().toISOString().slice(0, 10)
    : date.toISOString().slice(0, 10);
  const runID = String(status?.run?.id || "none");
  const key = `${day}:${actionKind}:${runID}`;
  if (lastKey === key) {
    return { shouldRun: false, key, reason: "already_triggered" };
  }
  return { shouldRun: true, key, reason: "ready" };
}

export function autoRadarProviderNoticeFromGate({
  autoEnabled = false,
  gate = null,
} = {}) {
  if (!autoEnabled) return null;
  const stage = String(gate?.stage || "").toLowerCase();
  if (stage === "ready") return null;

  const primaryHref = String(gate?.primaryHref || "/settings/ai").trim() || "/settings/ai";
  const primaryLabel =
    String(gate?.primaryAction?.label || "").trim() ||
    (stage === "blocked" ? "配置真实 AI" : "查看 AI 配置");
  const gateSummary = String(gate?.summary || "").trim();
  const fallbackSummary =
    stage === "loading"
      ? "正在读取 AI provider 配置，确认前不会自动启动今日雷达。"
      : "无法确认真实 AI provider，自动雷达会等待，避免生成本地 fallback 分析。";

  return {
    stage: "waiting_provider",
    tone: stage === "ready" ? "success" : "warning",
    title: "自动雷达等待真实 AI",
    summary: gateSummary || fallbackSummary,
    primaryHref,
    primaryAction: {
      kind: String(gate?.primaryAction?.kind || "open_link"),
      label: primaryLabel,
    },
  };
}

function runAgeHours(run, now) {
  const date = now instanceof Date ? now : new Date(now);
  const createdAt = new Date(String(run?.createdAt || run?.updatedAt || ""));
  if (Number.isNaN(date.getTime()) || Number.isNaN(createdAt.getTime())) return 0;
  return Math.max(0, (date.getTime() - createdAt.getTime()) / (60 * 60 * 1000));
}

function runContextCount(run) {
  return (
    Number(run?.contextNewsCount || 0) +
    Number(run?.contextMacroCount || 0) +
    Number(run?.contextOnchainCount || 0)
  );
}

function activeRunAction(run, id) {
  const action = persistedActionById(run?.actions, id);
  if (!action) return null;
  const status = String(action.status || "").toLowerCase();
  if (status === "done" || status === "blocked") return null;
  return action;
}

function analysisFromGoalRunForRedesign(run) {
  if (run?.analysis && typeof run.analysis === "object") return run.analysis;
  return {
    goal: run?.goal || "AI 目标运行",
    context: {
      symbols: Array.isArray(run?.symbols) ? run.symbols : [],
      newsCount: Number(run?.contextNewsCount || 0),
      macroCount: Number(run?.contextMacroCount || 0),
      onchainCount: Number(run?.contextOnchainCount || 0),
    },
    execution: { mode: run?.executionMode || "paper" },
    humanFactors: [],
    watchSignals: [],
    strategyDrafts: [],
  };
}

function validationRunsMatchingIds(validationRuns, ids) {
  if (!Array.isArray(validationRuns) || !Array.isArray(ids) || ids.length === 0) return [];
  const wanted = new Set(ids.map((id) => String(id || "").trim()).filter(Boolean));
  return validationRuns.filter((run) => wanted.has(String(run?.runId || "").trim()));
}

function completedValidationRows(runs) {
  return (Array.isArray(runs) ? runs : []).filter((run) => {
    const state = Number(run?.state);
    return state === 3 || state === 4;
  });
}

function aiRunFollowupItem(run, now, validationRuns = []) {
  const runId = String(run?.id || "").trim();
  if (!runId) return null;
  const goal = String(run?.goal || "AI 目标运行").trim();
  const symbols = safeStringList(run?.symbols).join(", ") || "auto";
  const ageHours = runAgeHours(run, now);
  const stale = ageHours >= 6;
  const contextCount = runContextCount(run);
  const thinContext = contextCount === 0 || String(run?.aiStatus || "").toLowerCase() === "fallback";
  const refreshed = persistedActionById(run?.actions, "refresh_context");
  const savedPaperWatch = persistedActionById(run?.actions, "paper_watch");
  const savedPaperWatchStatus = String(savedPaperWatch?.status || "").toLowerCase();
  const thinCompletedPaperWatch =
    savedPaperWatchStatus === "done" && !paperWatchCompletionHasEvidence(savedPaperWatch);
  const paperWatch = activeRunAction(run, "paper_watch");
  const backtest = activeRunAction(run, "backtest");
  const savedBacktest = persistedActionById(run?.actions, "backtest");
  const startedBacktestRunIds =
    String(savedBacktest?.status || "").toLowerCase() === "done"
      ? backtestRunIdsFromAction(savedBacktest)
      : [];
  const startedBacktest = startedBacktestRunIds.length > 0 ? savedBacktest : null;
  const completedStartedValidations = completedValidationRows(
    validationRunsMatchingIds(validationRuns, startedBacktestRunIds),
  );
  const rankedStartedValidations = rankBacktestValidation(completedStartedValidations);
  const bestStartedValidation = rankedStartedValidations[0] || null;
  const strategy = activeRunAction(run, "strategy");
  const savedStrategy = persistedActionById(run?.actions, "strategy");
  const savedStrategyDone =
    String(savedStrategy?.status || "").toLowerCase() === "done"
      ? savedStrategy
      : null;
  const draftCount = Number(run?.strategyDraftCount || 0);
  const base = {
    runId,
    goal,
    symbols,
    createdAt: run?.createdAt,
    updatedAt: run?.updatedAt,
  };

  if (paperWatch) {
    return {
      ...base,
      priority: 100,
      tone: "success",
      actionKind: "paper_watch",
      title: "继续 paper 观察",
      detail: paperWatch.note || `${goal} 已进入 paper 观察，继续记录市场风向、人性偏差和执行摩擦。`,
      href: paperWatch.href || aiMoneyRunHref(runId),
    };
  }
  if (thinCompletedPaperWatch) {
    return {
      ...base,
      priority: 104,
      tone: "warning",
      actionKind: "paper_watch",
      title: "补齐 paper 复盘证据",
      detail:
        savedPaperWatch.note && savedPaperWatch.note !== "Paper 已完成"
          ? `${savedPaperWatch.note}；证据不足，补齐市场风向、舆论、人性偏差和执行摩擦后再推进。`
          : `${goal} 的 paper 已标记完成，但证据不足；补齐市场风向、舆论、人性偏差和执行摩擦后再推进。`,
      href: savedPaperWatch.href || aiMoneyRunHref(runId),
    };
  }
  if (backtest) {
    return {
      ...base,
      priority: 90,
      tone: "warning",
      actionKind: "run_validation",
      title: "回测验证待跟进",
      detail: backtest.note || `${goal} 已生成可验证蓝图，先运行或复核回测，不进入交易。`,
      href: backtest.href || aiMoneyRunHref(runId),
    };
  }
  if (startedBacktest) {
    if (
      bestStartedValidation &&
      String(bestStartedValidation.recommendation || "") === "优先 paper"
    ) {
      const score = bestStartedValidation.score === null ? "—" : bestStartedValidation.score;
      const evidenceHref =
        startedBacktest.href ||
        (bestStartedValidation.runId
          ? `/backtests/${encodeURIComponent(bestStartedValidation.runId)}`
          : aiMoneyRunHref(runId));
      return {
        ...base,
        priority: 94,
        tone: bestStartedValidation.tone || "success",
        actionKind: "paper_candidate_validation",
        title: "验证通过，复核 paper 候选",
        detail: `${
          bestStartedValidation.strategyId || bestStartedValidation.runId || goal
        } ${bestStartedValidation.recommendation}，评分 ${score}。先查看回测证据，并继续复核市场风向、舆论、人性偏差和执行摩擦。`,
        href: evidenceHref,
      };
    }
    if (
      bestStartedValidation &&
      String(bestStartedValidation.recommendation || "") !== "优先 paper"
    ) {
      const proposedFormState = redesignFormStateFromWeakValidation(
        analysisFromGoalRunForRedesign(run),
        rankedStartedValidations,
        {
          reasons: rankedStartedValidations.slice(0, 3).map((row) => {
            const score = row.score === null ? "—" : row.score;
            return `${row.strategyId || row.runId}: ${row.recommendation}，评分 ${score}`;
          }),
        },
      );
      return {
        ...base,
        priority: 96,
        tone: bestStartedValidation.tone || "danger",
        actionKind: "redesign_validation",
        title: "验证失败，AI 重做蓝图",
        detail: `${
          bestStartedValidation.strategyId || bestStartedValidation.runId || goal
        } ${bestStartedValidation.recommendation}，评分 ${
          bestStartedValidation.score ?? "—"
        }。不要继续 paper，先让 AI 带着失败证据、人性和市场信号重做。`,
        href: aiMoneyRunHref(runId),
        proposedFormState,
      };
    }
    return {
      ...base,
      priority: 88,
      tone: "warning",
      actionKind: "validation_progress",
      title: "回测验证已启动",
      detail: startedBacktest.note || `${goal} 的 AI 蓝图回测已启动，先查看进度，不重复创建验证。`,
      href:
        startedBacktest.href ||
        (startedBacktestRunIds[0]
          ? `/backtests/${encodeURIComponent(startedBacktestRunIds[0])}`
          : aiMoneyRunHref(runId)),
    };
  }
  if (strategy) {
    return {
      ...base,
      priority: 82,
      tone: "warning",
      actionKind: "save_strategy",
      title: "策略草案待落地",
      detail: strategy.note || `${goal} 有策略草案待保存，保存后仍需回测、paper 和安全闸门。`,
      href: strategy.href || aiMoneyRunHref(runId),
    };
  }
  if (refreshed?.status === "done") {
    return {
      ...base,
      priority: 35,
      tone: "default",
      actionKind: "review_run",
      title: "已刷新运行",
      detail: refreshed.note || `${goal} 已重新扫描，可打开新 AI run 继续跟进。`,
      href: refreshed.href || (refreshed.relatedId ? aiMoneyRunHref(refreshed.relatedId) : aiMoneyRunHref(runId)),
    };
  }
  if (savedStrategyDone) {
    return {
      ...base,
      priority: 78,
      tone: "warning",
      actionKind: "saved_strategy_backtest",
      title: "已保存策略待回测",
      detail:
        savedStrategyDone.note ||
        `${goal} 已保存为策略配置，下一步先补回测证据，再进入 paper 观察和安全闸门。`,
      href: savedStrategyDone.href || aiMoneyRunHref(runId),
    };
  }
  if (stale || thinContext) {
    return {
      ...base,
      priority: stale ? 76 : 72,
      tone: "warning",
      actionKind: "refresh_context",
      title: stale ? "刷新市场风向" : "补齐上下文",
      detail: thinContext
        ? `${goal} 的上下文证据偏薄，先重新扫描新闻、宏观、链上和舆论。`
        : `${goal} 已超过 ${Math.round(ageHours)} 小时，先刷新市场风向和人性偏差。`,
      href: aiMoneyRunHref(runId),
    };
  }
  if (draftCount > 0) {
    return {
      ...base,
      priority: 62,
      tone: "warning",
      actionKind: "run_validation",
      title: "蓝图等待验证",
      detail: `${goal} 有 ${draftCount} 个 AI 蓝图，下一步应批量回测，再筛 paper 候选。`,
      href: aiMoneyRunHref(runId),
    };
  }
  return {
    ...base,
    priority: 30,
    tone: "default",
    actionKind: "review_run",
    title: "可复盘运行",
    detail: `${goal} 暂无明确推进动作，可打开复盘 ${symbols} 的 AI 判断。`,
    href: aiMoneyRunHref(runId),
  };
}

export function aiRunFollowupQueueFromRuns(runs = [], now = new Date(), validationRuns = []) {
  const items = (Array.isArray(runs) ? runs : [])
    .map((run) => aiRunFollowupItem(run, now, validationRuns))
    .filter(Boolean)
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      const at = new Date(String(a.createdAt || 0)).getTime() || 0;
      const bt = new Date(String(b.createdAt || 0)).getTime() || 0;
      return bt - at;
    })
    .slice(0, 5);
  const attention = items.filter((item) => item.priority >= 60);
  const top = items[0] || null;
  const stage = items.length === 0 ? "empty" : attention.length > 0 ? "needs_attention" : "steady";
  const tone = stage === "needs_attention" ? "warning" : stage === "steady" ? "success" : "default";
  const title =
    stage === "needs_attention"
      ? "AI 跟进队列需要处理"
      : stage === "steady"
        ? "AI 运行暂无紧急跟进"
        : "等待 AI 运行";
  const summary =
    stage === "needs_attention"
      ? `最高优先级是 ${top.title}：${top.detail} 先处理这个 AI run，再推进赚钱路径。`
      : stage === "steady"
        ? "最近 AI 运行没有待办阻塞，可打开复盘或重新扫描今日风向。"
        : "还没有历史 AI 运行。先启动今日雷达，让 AI 生成可观察的赚钱路径。";
  const nextActions =
    items.length > 0
      ? items.slice(0, 3).map((item) => {
          if (item.actionKind === "refresh_context") return `重新扫描：${item.goal}`;
          if (item.actionKind === "run_validation") return `运行回测验证：${item.goal}`;
          if (item.actionKind === "validation_progress") return `查看验证进度：${item.goal}`;
          if (item.actionKind === "paper_candidate_validation") return `查看 paper 候选证据：${item.goal}`;
          if (item.actionKind === "redesign_validation") return `重做 AI 蓝图：${item.goal}`;
          if (item.actionKind === "saved_strategy_backtest") return `已保存策略补回测：${item.goal}`;
          if (item.actionKind === "paper_watch") return `继续 paper 观察：${item.goal}`;
          return `${item.title}：${item.goal}`;
        })
      : ["运行今日 AI 雷达", "让 AI 生成策略蓝图", "回测和 paper 后再考虑执行检查"];

  return {
    stage,
    tone,
    title,
    summary,
    items,
    nextActions,
    primaryAction: top
      ? top.actionKind === "run_validation"
        ? {
            kind: "validate_run",
            label: "验证此 AI 运行",
            runId: top.runId,
            href: aiMoneyRunHref(top.runId),
          }
        : top.actionKind === "refresh_context"
        ? {
            kind: "refresh_run",
            label: "重新扫描此运行",
            runId: top.runId,
            href: aiMoneyRunHref(top.runId),
          }
        : top.actionKind === "validation_progress"
        ? {
            kind: "open_link",
            label: "查看验证进度",
            runId: top.runId,
            href: top.href || aiMoneyRunHref(top.runId),
          }
        : top.actionKind === "paper_candidate_validation"
        ? {
            kind: "open_link",
            label: "查看 paper 候选证据",
            runId: top.runId,
            href: aiMoneyRunHref(top.runId),
          }
        : top.actionKind === "redesign_validation"
        ? {
            kind: "analyze_and_validate",
            label: "让 AI 重做此运行",
            runId: top.runId,
            href: aiMoneyRunHref(top.runId),
            proposedFormState: top.proposedFormState,
          }
        : top.actionKind === "saved_strategy_backtest"
        ? {
            kind: "open_link",
            label: "打开已保存策略",
            runId: top.runId,
            href: top.href || aiMoneyRunHref(top.runId),
          }
        : {
            kind: "open_run",
            label: "打开最高优先级运行",
            runId: top.runId,
            href: aiMoneyRunHref(top.runId),
          }
      : { kind: "scan_today", label: "启动今日扫描" },
  };
}

export function aiInitialRunToOpenFromRuns({
  runs = [],
  requestedRunId = "",
  activeRunId = "",
  alreadyOpenedRunId = "",
  now = new Date(),
} = {}) {
  const list = Array.isArray(runs) ? runs : [];
  if (requestedRunId || activeRunId || list.length === 0) return null;
  const queue = aiRunFollowupQueueFromRuns(list, now);
  const runId = String(
    queue?.primaryAction?.runId || list.find((run) => run?.id)?.id || "",
  );
  if (!runId || runId === alreadyOpenedRunId) return null;
  return runId;
}

export function aiRunFollowupPrimaryActionForQueue(queue = {}) {
  const action = queue?.primaryAction;
  const kind = String(action?.kind || "");
  const label = String(action?.label || "").trim();
  if (!kind || !label) return null;
  if (kind === "open_link") {
    const href = String(action?.href || "").trim();
    if (!href) return null;
    return {
      kind,
      label,
      href,
      ...(action.runId ? { runId: action.runId } : {}),
    };
  }
  return {
    kind,
    label,
    ...(action.runId ? { runId: action.runId } : {}),
    ...(action.href ? { href: action.href } : {}),
  };
}

function runHumanFactors(run) {
  return safeStringList(run?.analysis?.humanFactors);
}

function refreshComparisonItem(oldRun, newRun, action) {
  const oldContext = runContextCount(oldRun);
  const newContext = runContextCount(newRun);
  const oldDrafts = Number(oldRun?.strategyDraftCount || 0);
  const newDrafts = Number(newRun?.strategyDraftCount || 0);
  const contextDelta = newContext - oldContext;
  const draftDelta = newDrafts - oldDrafts;
  const oldFactors = runHumanFactors(oldRun);
  const newFactors = runHumanFactors(newRun);
  const addedFactors = newFactors.filter((item) => !oldFactors.includes(item));
  const humanFactorChange =
    addedFactors.length > 0
      ? addedFactors.slice(0, 2).join("；")
      : newFactors.slice(0, 2).join("；") || "暂无新人性 / 舆论变化。";
  const highlights = [
    `上下文 ${contextDelta >= 0 ? "+" : ""}${contextDelta}`,
    `蓝图 ${draftDelta >= 0 ? "+" : ""}${draftDelta}`,
    `AI 状态 ${oldRun?.aiStatus || "unknown"} → ${newRun?.aiStatus || "unknown"}`,
  ];

  return {
    oldRunId: oldRun.id,
    newRunId: newRun.id,
    oldGoal: oldRun.goal || "旧 AI run",
    newGoal: newRun.goal || "新 AI run",
    oldSummary: oldRun.summary || "",
    newSummary: newRun.summary || "",
    href: action.href || aiMoneyRunHref(newRun.id),
    contextDelta,
    draftDelta,
    humanFactorChange,
    highlights,
    refreshedAt: action.updatedAt,
  };
}

export function aiRunRefreshComparisonFromRuns(runs = []) {
  const list = Array.isArray(runs) ? runs : [];
  const byID = new Map(list.map((run) => [String(run?.id || ""), run]));
  const items = [];
  for (const run of list) {
    const action = persistedActionById(run?.actions, "refresh_context");
    if (action?.status !== "done" || !action.relatedId) continue;
    const next = byID.get(String(action.relatedId));
    if (!next) continue;
    items.push(refreshComparisonItem(run, next, action));
  }
  items.sort((a, b) => {
    const at = new Date(String(a.refreshedAt || 0)).getTime() || 0;
    const bt = new Date(String(b.refreshedAt || 0)).getTime() || 0;
    return bt - at;
  });
  const stage = items.length > 0 ? "has_changes" : "empty";
  return {
    stage,
    tone: items.length > 0 ? "success" : "default",
    title: items.length > 0 ? "AI 重扫对比" : "暂无重扫对比",
    summary:
      items.length > 0
        ? "已对比旧判断和新判断，先看上下文、蓝图和人性 / 舆论变化。"
        : "完成旧 run 重扫后，这里会显示新旧判断差异。",
    items,
  };
}

function commandEvidenceItem({ id, label, status, detail, href }) {
  const tone =
    status === "done"
      ? "success"
      : status === "blocked"
        ? "danger"
        : status === "current"
          ? "warning"
          : "default";
  return {
    id,
    label,
    status,
    tone,
    detail,
    ...(href ? { href } : {}),
  };
}

function nonNegativeCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

function recentRunOpenActionCount(summaries) {
  if (!Array.isArray(summaries)) return 0;
  return summaries.reduce((total, run) => {
    const explicit = nonNegativeCount(run?.openActionCount);
    if (explicit > 0) return total + explicit;
    return (
      total +
      nonNegativeCount(run?.manualActionCount) +
      nonNegativeCount(run?.readyActionCount) +
      nonNegativeCount(run?.blockedActionCount)
    );
  }, 0);
}

function handoffCountsFromRunbook(runbook) {
  const countActionable = (steps) =>
    Array.isArray(steps)
      ? steps.filter((step) => step?.status === "ready" || step?.status === "current").length
      : 0;
  return {
    ai: countActionable(runbook?.aiSteps),
    human: countActionable(runbook?.humanSteps),
  };
}

function commandPrimaryAction({ decision, readiness, analysis }) {
  if (!analysis) {
    return { kind: "analyze_and_validate", label: "启动 AI 扫描并验证" };
  }
  if (decision?.primaryAction) return decision.primaryAction;
  if (decision?.primaryHref) {
    return {
      kind: "open_link",
      label:
        decision.stage === "sentiment_review"
          ? "打开风向复核"
          : "打开相关页面",
    };
  }
  if (readiness?.primaryAction) return readiness.primaryAction;
  return undefined;
}

function strategyActionSaved(persistedActions) {
  const strategyAction = persistedActionById(persistedActions, "strategy");
  return String(strategyAction?.status || "").toLowerCase() === "done";
}

function paperCandidatePrimaryActionForState(primaryAction, persistedActions) {
  const kind = String(primaryAction?.kind || "");
  if (kind !== "accept_paper_candidate") return primaryAction;
  if (strategyActionSaved(persistedActions)) return primaryAction;
  return {
    ...primaryAction,
    kind: "save_and_accept_paper_candidate",
    label: "保存并采用 paper",
  };
}

export function aiCommandCenterFromState({
  analysis = null,
  persistedActions = [],
  validationRuns = [],
  runs = [],
  accounts,
  dailyRadarStatus = null,
  providerGate = null,
} = {}) {
  const runQueue = aiRunFollowupQueueFromRuns(runs);
  if (!analysis) {
    const latestRuns = Array.isArray(runs) ? runs.length : 0;
    const providerGateStage = String(providerGate?.stage || "").toLowerCase();
    if (providerGateStage === "blocked" || providerGateStage === "loading") {
      const loading = providerGateStage === "loading";
      const primaryHref = String(providerGate?.primaryHref || "/settings/ai").trim() || "/settings/ai";
      const primaryLabel =
        String(providerGate?.primaryAction?.label || "").trim() ||
        (loading ? "查看 AI 配置" : "配置真实 AI");
      const summary =
        String(providerGate?.summary || "").trim() ||
        (loading
          ? "正在确认真实 AI provider 状态，确认前不会启动 AI 扫描并验证。"
          : "真实 AI provider 还不可用，先完成 API key 配置和连接测试。");

      return {
        stage: loading ? "provider_loading" : "provider_blocked",
        tone: "warning",
        title: loading ? "正在确认 AI provider" : "先配置真实 AI",
        summary,
        primaryAction: { kind: "open_link", label: primaryLabel },
        primaryHref,
        metrics: [
          { label: "AI 状态", value: loading ? "确认中" : "未就绪", hint: "等待真实 provider" },
          { label: "最近运行", value: latestRuns, hint: runQueue.title },
          { label: "交接", value: "0 AI / 1 你", hint: "先由你完成 provider 配置" },
          { label: "执行", value: "已暂停", hint: "不会启动扫描或下单" },
        ],
        evidence: [
          commandEvidenceItem({
            id: "provider",
            label: "真实 AI provider",
            status: loading ? "current" : "blocked",
            detail: summary,
            href: primaryHref,
          }),
          commandEvidenceItem({
            id: "market_context",
            label: "市场 / 舆论上下文",
            status: "pending",
            detail: "等待真实 AI 可用后再扫描新闻、宏观、链上和市场风向。",
          }),
          commandEvidenceItem({
            id: "strategy_drafts",
            label: "策略蓝图",
            status: "pending",
            detail: "等待真实 AI 可用后生成可验证草案。",
          }),
          commandEvidenceItem({
            id: "validation",
            label: "回测验证",
            status: "pending",
            detail: "等待策略草案后再自动批量回测。",
          }),
          commandEvidenceItem({
            id: "safety_gates",
            label: "安全闸门",
            status: "blocked",
            detail: "真实交易前仍需回测、paper 观察、组合限额和人工确认。",
          }),
        ],
        nextActions: loading
          ? [
              "等待 AI provider 状态返回。",
              "如长时间未返回，打开 AI 设置检查配置。",
              "确认 provider ready 后再启动 AI 扫描并验证。",
            ]
          : [
              "配置真实 AI provider。",
              "测试 provider API key 连接。",
              "回到 AI Money 后再启动扫描和验证。",
            ],
      };
    }

    return {
      stage: "scan",
      tone: "warning",
      title: "启动 AI 赚钱目标扫描",
      summary:
        "先让 AI 读取目标、市场、舆论、人性偏差和执行约束，再自动生成策略蓝图与验证路径。",
      primaryAction: { kind: "analyze_and_validate", label: "启动 AI 扫描并验证" },
      metrics: [
        { label: "AI 状态", value: "待扫描", hint: "等待目标分析" },
        { label: "最近运行", value: latestRuns, hint: runQueue.title },
        { label: "交接", value: "2 AI / 1 你", hint: "AI 可代办扫描和蓝图；你确认目标" },
        { label: "执行", value: "观察优先", hint: "不会直接下单" },
      ],
      evidence: [
        commandEvidenceItem({
          id: "market_context",
          label: "市场 / 舆论上下文",
          status: "current",
          detail: dailyRadarStatus?.summary || "等待 AI 扫描新闻、宏观、链上和市场风向。",
        }),
        commandEvidenceItem({
          id: "strategy_drafts",
          label: "策略蓝图",
          status: "pending",
          detail: "等待 AI 生成可验证草案。",
        }),
        commandEvidenceItem({
          id: "validation",
          label: "回测验证",
          status: "pending",
          detail: "等待策略草案后再自动批量回测。",
        }),
        commandEvidenceItem({
          id: "human_sentiment",
          label: "人性 / 舆论",
          status: "pending",
          detail: "等待 AI 识别 FOMO、拥挤、恐慌或叙事偏差。",
        }),
        commandEvidenceItem({
          id: "safety_gates",
          label: "安全闸门",
          status: "blocked",
          detail: "真实交易前仍需回测、paper 观察、组合限额和人工确认。",
        }),
      ],
      nextActions: [
        "输入或应用 AI 补全目标。",
        "启动 AI 扫描并自动进入安全验证。",
        "先观察和 paper，不直接进入测试网或主网。",
      ],
      primaryHref: undefined,
    };
  }

  const decision = nextAIGoalDecision(analysis, persistedActions, validationRuns);
  const readiness = aiExecutionReadinessFromState({
    analysis,
    persistedActions,
    validationRuns,
    accounts,
  });
  const sentiment = aiSentimentCompassFromAnalysis(analysis);
  const ranked = rankBacktestValidation(validationRuns);
  const completedRuns = ranked.filter((row) => row.score !== null);
  const runningRuns = ranked.filter((row) => row.score === null);
  const context = analysis?.context || {};
  const notes = safeStringList(context.notes);
  const recentRunSummaries = Array.isArray(context.recentRunSummaries)
    ? context.recentRunSummaries
    : [];
  const recentRunCount = Math.max(
    Number(context.recentRunCount || 0),
    recentRunSummaries.length,
  );
  const recentRunLabels = recentRunSummaries
    .slice(0, 2)
    .map((run) => {
      const goal = String(run?.goal || run?.id || "历史运行").trim();
      const summary = String(run?.summary || "").trim();
      return summary ? `${goal}：${summary}` : goal;
    })
    .filter(Boolean);
  const openMemoryActionCount = recentRunOpenActionCount(recentRunSummaries);
  const memoryActionSuffix =
    openMemoryActionCount > 0 ? `未完成 ${openMemoryActionCount} 个交接动作。` : "";
  const contextCount =
    Number(context.newsCount || 0) +
    Number(context.macroCount || 0) +
    Number(context.onchainCount || 0);
  const drafts = Array.isArray(analysis?.strategyDrafts) ? analysis.strategyDrafts : [];
  const humanFactors = safeStringList(analysis?.humanFactors);
  const sentimentReview = persistedActionById(persistedActions, "sentiment_review");
  const validationStatus =
    completedRuns.length > 0 ? "done" : runningRuns.length > 0 ? "current" : "pending";
  const sentimentDone = sentiment.stage === "balanced" || sentimentReviewCompleted(sentimentReview);
  const safetyDone = ["paper_ready", "paper_watch", "testnet_ready"].includes(readiness.stage);
  const primaryAction = paperCandidatePrimaryActionForState(
    commandPrimaryAction({ decision, readiness, analysis }),
    persistedActions,
  );
  const primaryHref =
    decision.primaryHref || readiness.primaryHref || primaryAction?.href || undefined;
  const handoffCounts = handoffCountsFromRunbook(
    aiDelegationRunbookFromState({
      analysis,
      persistedActions,
      validationRuns,
      accounts,
      dailyRadarStatus,
    }),
  );

  return {
    stage: decision.stage === "paper_candidate" && readiness.stage === "paper_ready"
      ? "paper_candidate"
      : decision.stage,
    tone: decision.tone,
    title:
      decision.stage === "paper_candidate"
        ? "AI 已筛出 paper 候选"
        : decision.title,
    summary: `${decision.summary} 当前执行就绪度 ${readiness.score ?? 0}%，AI 只推进安全动作。`,
    primaryAction,
    primaryHref,
    metrics: [
      {
        label: "AI 状态",
        value: decision.title,
        hint: analysis?.ai?.status || "已分析",
      },
      {
        label: "上下文",
        value: `${contextCount} 条`,
        hint: `${Number(context.newsCount || 0)} 新闻 / ${Number(context.macroCount || 0)} 宏观 / ${Number(context.onchainCount || 0)} 链上`,
      },
      {
        label: "AI 蓝图",
        value: drafts.length,
        hint: analysis?.execution?.mode || "observe",
      },
      {
        label: "验证",
        value:
          runningRuns.length > 0
            ? `${runningRuns.length} 进行中`
            : `${completedRuns.length} 完成`,
        hint: ranked[0]?.recommendation || "等待回测证据",
      },
      {
        label: "就绪",
        value: `${readiness.score ?? 0}%`,
        hint: readiness.stage,
      },
      {
        label: "交接",
        value: `${handoffCounts.ai} AI / ${handoffCounts.human} 你`,
        hint: `AI 可代办 ${handoffCounts.ai} 项；你确认 ${handoffCounts.human} 项`,
      },
    ],
    evidence: [
      commandEvidenceItem({
        id: "market_context",
        label: "市场 / 舆论上下文",
        status: notes.length > 0 || contextCount === 0 ? "current" : "done",
        detail:
          notes.length > 0
            ? notes.slice(0, 2).join("；")
            : `已纳入 ${contextCount} 条新闻、宏观或链上上下文。`,
        href: notes.length > 0 ? "/data-explorer/news" : undefined,
      }),
      commandEvidenceItem({
        id: "ai_memory",
        label: "AI 历史记忆",
        status: recentRunCount > 0 ? "done" : "pending",
        detail:
          recentRunCount > 0
            ? [
                `AI 已参考 ${recentRunCount} 条历史运行：${recentRunLabels.join("；") || "可在历史跟进中查看"}。`,
                memoryActionSuffix,
              ].filter(Boolean).join(" ")
            : "本次没有可用的历史 AI 运行记忆。",
      }),
      commandEvidenceItem({
        id: "strategy_drafts",
        label: "策略蓝图",
        status: drafts.length > 0 ? "done" : "pending",
        detail:
          drafts.length > 0
            ? `AI 已生成 ${drafts.length} 个草案。`
            : "还没有可验证策略草案。",
      }),
      commandEvidenceItem({
        id: "validation",
        label: "回测验证",
        status: validationStatus,
        detail:
          completedRuns.length > 0
            ? `${completedRuns.length} 个回测完成，最佳建议：${ranked[0]?.recommendation || "复核结果"}。`
            : runningRuns.length > 0
              ? `${runningRuns.length} 个回测仍在运行。`
              : "等待 AI 批量回测。",
        href: ranked[0]?.runId ? `/backtests/${encodeURIComponent(ranked[0].runId)}` : undefined,
      }),
      commandEvidenceItem({
        id: "human_sentiment",
        label: "人性 / 舆论",
        status: sentimentDone ? "done" : "current",
        detail:
          humanFactors.length > 0
            ? humanFactors.slice(0, 2).join("；")
            : sentiment.summary,
        href: sentimentDone ? undefined : "/data-explorer/news",
      }),
      commandEvidenceItem({
        id: "safety_gates",
        label: "安全闸门",
        status: safetyDone ? "done" : "current",
        detail:
          readiness.blockers?.[0] ||
          "回测、paper 观察、组合限额和人工确认仍是执行前闸门。",
        href: readiness.primaryHref,
      }),
      commandEvidenceItem({
        id: "run_queue",
        label: "历史跟进",
        status: runQueue.items.length > 0 ? "current" : "done",
        detail: runQueue.summary,
        href: runQueue.primaryAction?.href,
      }),
    ],
    nextActions:
      decision.nextActions?.length > 0
        ? decision.nextActions
        : readiness.blockers?.length > 0
          ? readiness.blockers
          : ["继续观察 AI 建议，不直接主网交易。"],
  };
}

function autonomousCommandStage(primaryAction, analysis, commandCenter) {
  const kind = String(primaryAction?.kind || "");
  if (!analysis) {
    if (kind === "open_link" || kind === "open_run" || kind === "open_today_run") return "followup";
    if (kind === "validate_run" || kind === "run_all_backtests") return "ai_validate";
    if (kind === "refresh_run" || kind === "rescan_today") return "refresh_context";
    if (kind === "analyze_and_validate" && primaryAction?.proposedFormState) return "redesign";
    return "start";
  }
  if (kind === "run_all_backtests") return "ai_validate";
  if (kind === "accept_paper_candidate" || kind === "save_and_accept_paper_candidate") return "paper_candidate";
  if (kind === "complete_manual_action") return "human_review";
  if (kind === "refresh_run" || kind === "rescan_today") return "refresh_context";
  return commandCenter?.stage || kind || "review";
}

function shouldPrioritizeNoAnalysisFollowup(nowAction) {
  const kind = String(nowAction?.primaryAction?.kind || "");
  if (!kind) return false;
  return !["scan_today", "rescan_today"].includes(kind);
}

function autonomousPrimaryActionForState(primaryAction, persistedActions) {
  return paperCandidatePrimaryActionForState(primaryAction, persistedActions);
}

function autonomousSafetyForAction(primaryAction, nowAction) {
  const kind = String(primaryAction?.kind || "");
  if (kind === "run_all_backtests") {
    return "只创建回测验证任务，不会下单，也不会进入主网。";
  }
  if (kind === "save_and_accept_paper_candidate") {
    return "先保存 AI 策略草案并建立 paper 观察，不开启 live，不进入测试网或主网。";
  }
  if (kind === "accept_paper_candidate") {
    return "只采用为 paper 观察，不进入测试网或主网。";
  }
  if (kind === "complete_manual_action") {
    return nowAction?.guardrail || "需要人工复核后 AI 才能继续推进。";
  }
  if (kind === "open_link") {
    return "只打开证据或配置页面，不会触发交易。";
  }
  return "只分析市场、舆论、人性和验证路径，不会下单，也不会进入主网。";
}

function autonomousAIWillDo(primaryAction, autopilot) {
  const kind = String(primaryAction?.kind || "");
  if (kind === "run_all_backtests") {
    return [
      "批量创建 AI 策略蓝图的回测验证任务。",
      "读取收益、回撤、夏普和交易次数后筛掉弱信号。",
      "验证完成前不采用策略，也不进入 paper。",
    ];
  }
  if (kind === "accept_paper_candidate") {
    return [
      "整理 paper 候选的回测证据和风险上限。",
      "生成 24-72 小时观察重点。",
      "继续跟踪市场风向、舆论、人性偏差和执行摩擦。",
    ];
  }
  if (kind === "save_and_accept_paper_candidate") {
    return [
      "保存 AI 策略草案并保持 live 关闭。",
      "建立 24-72 小时 paper 观察计划。",
      "继续跟踪市场风向、舆论、人性偏差和执行摩擦。",
    ];
  }
  if (kind === "open_link") {
    return [
      "打开 AI 已识别的证据页面。",
      "复核回测、paper 候选或安全配置是否满足下一步。",
      "继续把市场风向、舆论和人性偏差纳入判断。",
    ];
  }
  const available = safeStringList(autopilot?.aiAvailableSteps);
  if (available.length > 0) return available.slice(0, 4);
  return [
    "扫描市场、舆论、宏观、链上和人性偏差。",
    "生成可解释的策略蓝图和观察信号。",
    "把可验证草案送入回测验证。",
  ];
}

function autonomousHumanMustDo(primaryAction, autopilot, nowAction) {
  const kind = String(primaryAction?.kind || "");
  if (kind === "run_all_backtests") {
    return [
      "不要提前采用任何策略。",
      "等待回测评分、回撤和交易次数出来后再让 AI 排序。",
      "真实交易仍需人工确认和交易闸门。",
    ];
  }
  if (kind === "complete_manual_action") {
    return safeStringList(nowAction?.nextActions).slice(0, 4);
  }
  if (kind === "save_and_accept_paper_candidate") {
    return [
      "确认保存后的策略仍处于关闭状态。",
      "只把它纳入 paper 观察，不要跳到测试网或主网。",
      "观察期间记录市场风向、舆论和人性偏差。",
    ];
  }
  if (kind === "open_link") {
    return [
      "先查看回测证据和 AI 判断理由。",
      "确认 paper 候选没有被新增舆论、宏观或人性偏差推翻。",
      "未完成复核前不要进入测试网或主网。",
    ];
  }
  const required = safeStringList(autopilot?.humanRequiredSteps);
  if (required.length > 0) return required.slice(0, 4);
  return [
    "确认赚钱目标、风险偏好和禁止场景。",
    "不要跳过回测、paper 观察和人工闸门。",
  ];
}

export function aiAutonomousCommandFromState({
  analysis = null,
  persistedActions = [],
  validationRuns = [],
  runs = [],
  accounts,
  dailyRadarStatus = null,
  providerGate = null,
} = {}) {
  const commandCenter = aiCommandCenterFromState({
    analysis,
    persistedActions,
    validationRuns,
    runs,
    accounts,
    dailyRadarStatus,
    providerGate,
  });
  const nowAction = aiNowActionFromState({
    analysis,
    persistedActions,
    validationRuns,
    runs,
    dailyRadarStatus,
    providerGate,
  });
  const autopilot = aiAutopilotStateFromAnalysis({
    analysis,
    persistedActions,
    validationRuns,
  });
  const prioritizeFollowup = !analysis && shouldPrioritizeNoAnalysisFollowup(nowAction);
  const rawPrimaryAction = analysis
    ? nowAction.primaryAction || commandCenter.primaryAction || autopilot.primaryAction
    : prioritizeFollowup
      ? nowAction.primaryAction
      : commandCenter.primaryAction || nowAction.primaryAction || autopilot.primaryAction;
  const primaryAction = analysis
    ? autonomousPrimaryActionForState(rawPrimaryAction, persistedActions)
    : rawPrimaryAction;
  const primaryHref =
    nowAction.primaryHref || commandCenter.primaryHref || autopilot.primaryHref || primaryAction?.href;
  const providerCommandStage = String(commandCenter?.stage || "");
  const stage =
    !analysis && (providerCommandStage === "provider_blocked" || providerCommandStage === "provider_loading")
      ? providerCommandStage
      : autonomousCommandStage(primaryAction, analysis, commandCenter);
  const title =
    stage === "provider_blocked" || stage === "provider_loading"
      ? nowAction.title || commandCenter.title
      : stage === "start"
      ? "让 AI 接管下一步"
      : primaryAction?.label
        ? `AI 下一步：${primaryAction.label}`
        : commandCenter.title;
  const summary =
    String(primaryAction?.kind || "") === "run_all_backtests"
      ? `${commandCenter.summary} AI 下一步是批量回测策略蓝图，只生成验证证据。`
      : prioritizeFollowup
        ? nowAction.summary
      : commandCenter.summary || nowAction.summary || autopilot.summary;

  return {
    stage,
    tone: nowAction.tone || commandCenter.tone || autopilot.tone,
    owner: nowAction.owner || nowActionOwner(primaryAction?.kind),
    title,
    summary,
    primaryAction,
    primaryHref,
    confidenceLabel: `${Math.max(0, Math.min(100, Number(autopilot.progress || 0)))}%`,
    proposedFormState: nowAction.proposedFormState,
    scanFormState: nowAction.scanFormState,
    proposalCard: nowAction.proposalCard,
    safety: autonomousSafetyForAction(primaryAction, nowAction),
    why: safeStringList(nowAction.why).length > 0
      ? safeStringList(nowAction.why).slice(0, 4)
      : safeStringList(commandCenter.nextActions).slice(0, 4),
    aiWillDo: autonomousAIWillDo(primaryAction, autopilot),
    humanMustDo: autonomousHumanMustDo(primaryAction, autopilot, nowAction),
  };
}

function observationFocusItem({ id, label, status, tone = "default", detail, href }) {
  return {
    id,
    label,
    status,
    tone,
    detail,
    ...(href ? { href } : {}),
  };
}

export function aiObservationFocusFromState({
  analysis = null,
  persistedActions = [],
  validationRuns = [],
  runs = [],
  dailyRadarStatus = null,
  providerGate = null,
} = {}) {
  const recentRuns = Array.isArray(runs) ? runs : [];
  const scanAction =
    dailyRadarStatus?.hasToday && dailyRadarStatus?.isStale
      ? { kind: "rescan_today", label: "重新扫描" }
      : { kind: "scan_today", label: "运行 AI 扫描" };

  if (!analysis) {
    const providerGateStage = String(providerGate?.stage || "").toLowerCase();
    if (providerGateStage === "blocked" || providerGateStage === "loading") {
      const loading = providerGateStage === "loading";
      const href = String(providerGate?.primaryHref || "/settings/ai").trim() || "/settings/ai";
      const label =
        String(providerGate?.primaryAction?.label || "").trim() ||
        (loading ? "查看 AI 配置" : "配置真实 AI");
      const summary =
        String(providerGate?.summary || "").trim() ||
        (loading
          ? "正在确认真实 AI provider 状态，确认前不会启动扫描。"
          : "真实 AI provider 还不可用，先完成 API key 配置和连接测试。");

      return {
        stage: loading ? "provider_loading" : "provider_blocked",
        tone: "warning",
        title: loading ? "正在确认 AI provider" : "先配置真实 AI",
        summary,
        primaryAction: { kind: "open_link", label, href },
        primaryHref: href,
        items: [
          observationFocusItem({
            id: "provider",
            label: "真实 AI provider",
            status: loading ? "checking" : "blocked",
            tone: "warning",
            detail: summary,
            href,
          }),
          observationFocusItem({
            id: "market",
            label: "市场风向",
            status: "pending",
            tone: "default",
            detail: "provider ready 后再读取新闻、宏观、链上和价格上下文。",
          }),
          observationFocusItem({
            id: "validation",
            label: "策略验证",
            status: "pending",
            tone: "default",
            detail: "等待真实 AI 可用后再生成可回测草案。",
          }),
          observationFocusItem({
            id: "execution",
            label: "执行边界",
            status: "blocked",
            tone: "warning",
            detail: "provider 未就绪时不会扫描、回测、paper 或交易。",
          }),
        ],
        nextActions: [
          loading ? "等待 provider 状态返回。" : "先配置 provider API key。",
          "在 AI 设置页完成一次连接测试。",
          "provider ready 后再启动今日扫描。",
        ],
      };
    }
    return {
      stage: "idle",
      tone: "warning",
      title: "AI 观察焦点",
      summary:
        "先让 AI 扫描市场风向、舆论和人性偏差，再生成策略蓝图与验证路径；当前不会下单。",
      primaryAction: scanAction,
      items: [
        observationFocusItem({
          id: "market",
          label: "市场风向",
          status: "waiting_scan",
          tone: "warning",
          detail: dailyRadarStatus?.summary || "等待 AI 汇总新闻、宏观、链上和价格上下文。",
        }),
        observationFocusItem({
          id: "sentiment",
          label: "舆论 / 人性",
          status: "waiting_scan",
          tone: "warning",
          detail: "等待 AI 识别 FOMO、恐慌、拥挤叙事和操作者偏差。",
          href: "/data-explorer/news",
        }),
        observationFocusItem({
          id: "validation",
          label: "策略验证",
          status: "not_started",
          tone: "default",
          detail: "还没有策略蓝图；扫描后由 AI 生成可回测草案。",
        }),
        observationFocusItem({
          id: "execution",
          label: "执行边界",
          status: "blocked",
          tone: "warning",
          detail: "没有分析、回测和 paper 观察前，不进入测试网或主网。",
        }),
      ],
      nextActions: [
        recentRuns.length > 0 ? "可先恢复最近 AI 运行记忆。" : "运行 AI 扫描建立第一份上下文。",
        "让 AI 同时看市场、舆论、人性和数据证据。",
        "生成蓝图后先回测，再进入 paper 观察。",
      ],
    };
  }

  const context = analysis?.context || {};
  const notes = safeStringList(context.notes);
  const symbols = safeStringList(context.symbols).join(", ") || "auto";
  const newsCount = Number(context.newsCount || 0);
  const macroCount = Number(context.macroCount || 0);
  const onchainCount = Number(context.onchainCount || 0);
  const contextTotal = newsCount + macroCount + onchainCount;
  const sentiment = aiSentimentCompassFromAnalysis(analysis);
  const ranked = rankBacktestValidation(validationRuns);
  const completedRuns = ranked.filter((row) => row.score !== null);
  const runningRuns = ranked.filter((row) => row.score === null);
  const validationPlan = autoValidationPlanFromAnalysis(analysis);
  const readiness = aiExecutionReadinessFromState({
    analysis,
    persistedActions,
    validationRuns,
  });
  const humanFactors = safeStringList(analysis?.humanFactors);
  const watchSignals = Array.isArray(analysis?.watchSignals)
    ? analysis.watchSignals
        .map((item) => String(item?.signal || item?.interpretation || "").trim())
        .filter(Boolean)
    : [];
  const sentimentDetail =
    [...humanFactors, ...watchSignals].filter(Boolean).slice(0, 3).join("；") ||
    sentiment.summary;
  const validationStatus =
    completedRuns.length > 0
      ? "validated"
      : runningRuns.length > 0
        ? "validating"
        : validationPlan.runnableCount > 0
          ? "needs_backtest"
          : "blocked";
  const validationDetail =
    completedRuns.length > 0
      ? `${completedRuns.length} 个回测已完成；最佳建议：${ranked[0]?.recommendation || "等待评分"}。`
      : runningRuns.length > 0
        ? `${runningRuns.length} 个回测仍在运行，先等待验证结果。`
        : validationPlan.runnableCount > 0
          ? `${validationPlan.runnableCount} 个 AI 蓝图需要先回测，不能直接采用。`
          : "没有可回测蓝图，需要让 AI 重新生成策略草案。";
  const executionDetail =
    readiness.stage === "paper_ready"
      ? "最多推进到 paper 采用；不会直接进入测试网或主网。"
      : readiness.stage === "testnet_ready"
        ? "仅达到测试网前检查；主网仍需人工 token gate。"
        : `${readiness.summary || "执行条件未满足"} 不会直接进入交易。`;
  const marketBlocked = notes.length > 0 || contextTotal === 0;
  const primaryAction =
    marketBlocked
      ? scanAction
      : validationStatus === "needs_backtest"
        ? { kind: "run_all_backtests", label: "运行 AI 批量回测" }
        : readiness.primaryAction || scanAction;

  return {
    stage: marketBlocked ? "data_gap" : "watching",
    tone: marketBlocked ? "warning" : sentiment.tone || "default",
    title: marketBlocked ? "先补齐观察数据" : "AI 正在观察这些重点",
    summary: marketBlocked
      ? `${notes[0] || "市场、舆论或链上上下文不足。"}先刷新 AI 雷达。`
      : `AI 已纳入市场风向、舆论 / 人性和验证路径；当前重点是${validationStatus === "needs_backtest" ? "先回测蓝图" : "继续观察证据"}。`,
    primaryAction,
    primaryHref: readiness.primaryHref,
    items: [
      observationFocusItem({
        id: "market",
        label: "市场风向",
        status: marketBlocked ? "data_gap" : "current",
        tone: marketBlocked ? "warning" : "success",
        detail: marketBlocked
          ? notes[0] || "缺少新闻、宏观或链上上下文。"
          : `新闻 ${newsCount} / 宏观 ${macroCount} / 链上 ${onchainCount} 已参与判断；标的 ${symbols}。`,
        href: marketBlocked ? "/data-explorer/news" : undefined,
      }),
      observationFocusItem({
        id: "sentiment",
        label: "舆论 / 人性",
        status: sentiment.stage,
        tone: sentiment.tone,
        detail: sentimentDetail,
        href: sentiment.stage !== "balanced" ? "/data-explorer/news" : undefined,
      }),
      observationFocusItem({
        id: "validation",
        label: "回测验证",
        status: validationStatus,
        tone:
          validationStatus === "validated"
            ? "success"
            : validationStatus === "blocked"
              ? "warning"
              : "primary",
        detail: validationDetail,
        href: ranked[0]?.runId ? `/backtests/${encodeURIComponent(ranked[0].runId)}` : undefined,
      }),
      observationFocusItem({
        id: "execution",
        label: "执行边界",
        status: readiness.stage || "blocked",
        tone: readiness.tone || "warning",
        detail: executionDetail,
        href: readiness.primaryHref,
      }),
    ],
    nextActions: [
      marketBlocked ? "先刷新今日市场、舆论、宏观和链上。" : "",
      validationStatus === "needs_backtest" ? "运行 AI 批量回测，先用数据筛策略。" : "",
      sentiment.stage !== "balanced" ? "复核舆论 / 人性风险，避免追涨和拥挤交易。" : "",
      "未完成回测和 paper 观察前，不进入真实交易。",
    ].filter(Boolean),
  };
}

export function backtestRequestFromDraft(draft, now = new Date()) {
  if (draft?.kind === "watch_only") return null;
  const preset = strategyPresetFromDraft(draft);
  const end = now instanceof Date ? now : new Date(now);
  const start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
  return {
    strategyId: preset.name,
    kind: normalizeKind(draft?.kind),
    params: draft?.params && typeof draft.params === "object" ? draft.params : {},
    symbol: preset.execSymbol,
    exchange: "binance",
    timeframe: "1h",
    start: start.toISOString(),
    end: end.toISOString(),
    initialCapital: 10000,
    commissionRate: 0.0004,
    slippageBps: 1,
  };
}

export function runnableBacktestRequestsFromAnalysis(analysis, now = new Date()) {
  const drafts = Array.isArray(analysis?.strategyDrafts) ? analysis.strategyDrafts : [];
  const seen = new Set();
  const out = [];
  for (const draft of drafts) {
    const request = backtestRequestFromDraft(draft, now);
    if (request === null) continue;
    const key = `${request.strategyId}:${request.symbol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ draft, request });
  }
  return out;
}

export function autoValidationPlanFromAnalysis(analysis, now = new Date()) {
  const items = runnableBacktestRequestsFromAnalysis(analysis, now);
  const drafts = Array.isArray(analysis?.strategyDrafts) ? analysis.strategyDrafts : [];
  const runnableDrafts = new Set(items.map(({ draft }) => draft));
  const skippedDrafts = drafts
    .filter((draft) => !runnableDrafts.has(draft))
    .map((draft) => ({
      name: String(draft?.name || draft?.symbol || "未命名草案"),
      kind: String(draft?.kind || "unknown"),
      symbol: String(draft?.symbol || ""),
      reason:
        draft?.kind === "watch_only"
          ? "观察型草案不会进入自动回测。"
          : "草案缺少可验证交易参数。",
    }));
  const names = items
    .map(({ draft }) => draft?.name || draft?.symbol)
    .filter(Boolean)
    .slice(0, 6)
    .join("、");
  const symbols = [...new Set(items.map(({ request }) => request.symbol).filter(Boolean))];
  const coverage =
    items.length > 0
      ? [
          `覆盖标的：${symbols.join(", ")}`,
          "验证窗口：90 天历史 / 1h K 线",
          `策略草案：${names}`,
        ]
      : ["没有可自动验证的策略草案。"];
  const guardrails = [
    "自动验证只创建回测任务，不会下单。",
    "验证通过后也只允许进入 paper 观察，不会直接开启主网。",
    "所有候选仍需风向 / 人性复核、组合限额和人工确认。",
  ];
  if (items.length === 0) {
    return {
      status: "blocked",
      runnableCount: 0,
      items,
      coverage,
      guardrails,
      skippedDrafts,
      activityLabel: "AI 安全验证",
      activityDetail: "no runnable drafts",
      actionNote: "没有可回测的 AI 草案；需要先调整目标或生成新的策略蓝图。",
    };
  }
  return {
    status: "ready",
    runnableCount: items.length,
    items,
    coverage,
    guardrails,
    skippedDrafts,
    activityLabel: `AI 安全验证 - ${items.length} 个草案`,
    activityDetail: items.map(({ request }) => request.symbol).join(", "),
    actionNote: `待发起 ${items.length} 个 AI 草案回测：${names}`,
  };
}

function shortlistStagePriority(stage) {
  if (stage === "paper_candidate") return 0;
  if (stage === "validating") return 1;
  if (stage === "validate_ready") return 2;
  if (stage === "watch") return 3;
  if (stage === "observe_only") return 4;
  if (stage === "rejected") return 5;
  return 6;
}

function shortlistRowFromDraft(draft, rankedByStrategyId) {
  const request = backtestRequestFromDraft(draft);
  const draftName = String(draft?.name || draft?.symbol || "未命名草案");
  const symbol = String(draft?.symbol || "");
  const kind = String(draft?.kind || "unknown");
  const strategyHref = request ? `/option?${strategyPresetSearchFromDraft(draft)}` : "";
  if (!request) {
    return {
      draftName,
      symbol,
      kind,
      stage: "observe_only",
      tone: "default",
      rank: 0,
      score: null,
      recommendation: "只观察",
      actionKind: "open_link",
      actionLabel: "看观察信号",
      href: "/data-explorer/news",
      backtestHref: "",
      strategyHref: "",
      reasons: ["该草案用于观察市场或舆论，不会进入自动回测。"],
      blockers: ["缺少可回测交易参数。"],
    };
  }

  const ranked = rankedByStrategyId.get(request.strategyId);
  const backtestHref = ranked?.runId ? `/backtests/${encodeURIComponent(ranked.runId)}` : "";
  if (!ranked) {
    return {
      draftName,
      symbol: request.symbol,
      kind,
      stage: "validate_ready",
      tone: "warning",
      rank: 0,
      score: null,
      recommendation: "待验证",
      actionKind: "run_backtest",
      actionLabel: "先回测",
      href: "",
      backtestHref: "",
      strategyHref,
      reasons: ["AI 已生成可回测参数，下一步先跑 90 天验证。"],
      blockers: ["没有完成回测前不能采用为 paper。"],
    };
  }

  if (ranked.score === null) {
    return {
      draftName,
      symbol: request.symbol,
      kind,
      stage: "validating",
      tone: "warning",
      rank: 0,
      score: null,
      recommendation: ranked.recommendation,
      actionKind: "open_link",
      actionLabel: "查看回测",
      href: backtestHref,
      backtestHref,
      strategyHref,
      reasons: [`回测仍在运行，进度 ${Math.round(Number(ranked.progress || 0) * 100)}%。`],
      blockers: ["等待回测终态后再进入 paper 判断。"],
    };
  }

  if (ranked.recommendation === "优先 paper") {
    return {
      draftName,
      symbol: request.symbol,
      kind,
      stage: "paper_candidate",
      tone: "success",
      rank: 0,
      score: ranked.score,
      recommendation: ranked.recommendation,
      actionKind: "accept_paper_candidate",
      actionLabel: "采用 paper",
      href: backtestHref,
      backtestHref,
      strategyHref,
      reasons: [
        `评分 ${ranked.score}，收益 ${formatPercentValue(ranked.totalReturn)}，回撤 ${formatPercentValue(ranked.maxDrawdown)}。`,
        "满足 paper 候选门槛，但仍需观察舆论、人性和执行摩擦。",
      ],
      blockers: ["未完成 paper 观察前不能进入测试网。"],
    };
  }

  const rejected = ranked.recommendation === "淘汰" || ranked.recommendation === "失败";
  return {
    draftName,
    symbol: request.symbol,
    kind,
    stage: rejected ? "rejected" : "watch",
    tone: rejected ? "danger" : "warning",
    rank: 0,
    score: ranked.score,
    recommendation: ranked.recommendation,
    actionKind: "open_link",
    actionLabel: rejected ? "查看原因" : "继续观察",
    href: backtestHref,
    backtestHref,
    strategyHref,
    reasons: [
      `评分 ${ranked.score}，收益 ${formatPercentValue(ranked.totalReturn)}，回撤 ${formatPercentValue(ranked.maxDrawdown)}。`,
    ],
    blockers: rejected
      ? ["未达到 paper 候选标准，先回到策略蓝图。"]
      : ["证据不足以采用为 paper 候选。"],
  };
}

function marketMemoryTextList(value, limit = 4) {
  const seen = new Set();
  const out = [];
  for (const item of safeStringList(value)) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

function marketMemoryItemsFromSummaries(summaries = []) {
  return (Array.isArray(summaries) ? summaries : [])
    .map((run) => {
      const humanFactors = marketMemoryTextList(run?.humanFactors, 4);
      const watchSignals = marketMemoryTextList(run?.watchSignalHighlights, 4);
      const marketRead = String(run?.marketRead || "").trim();
      if (!marketRead && humanFactors.length === 0 && watchSignals.length === 0) {
        return null;
      }
      const id = String(run?.id || "").trim();
      return {
        id: id || `memory_${String(run?.goal || "run").slice(0, 12)}`,
        goal: String(run?.goal || id || "历史 AI 运行").trim(),
        marketRead,
        humanFactors,
        watchSignals,
        watchSignalCount: nonNegativeCount(run?.watchSignalCount || watchSignals.length),
        openActionCount: nonNegativeCount(run?.openActionCount),
        href: id ? `/ai-money?runId=${encodeURIComponent(id)}` : undefined,
      };
    })
    .filter(Boolean)
    .slice(0, 3);
}

function marketMemoryItemsFromRuns(runs = []) {
  return (Array.isArray(runs) ? runs : [])
    .map((run) => {
      const analysis = run?.analysis;
      if (!analysis) return null;
      return {
        id: run?.id || analysis?.id,
        goal: run?.goal || analysis?.goal,
        marketRead: analysis?.marketRead,
        humanFactors: analysis?.humanFactors,
        watchSignalCount: Array.isArray(analysis?.watchSignals)
          ? analysis.watchSignals.length
          : 0,
        watchSignalHighlights: Array.isArray(analysis?.watchSignals)
          ? analysis.watchSignals.map((signal) => signal?.signal)
          : [],
        openActionCount: recentRunOpenActionCount([
          {
            openActionCount: run?.openActionCount,
            manualActionCount: run?.manualActionCount,
            readyActionCount: run?.readyActionCount,
            blockedActionCount: run?.blockedActionCount,
          },
        ]),
      };
    })
    .filter(Boolean);
}

export function aiMarketMemoryFromState({ analysis = null, runs = [] } = {}) {
  const context = analysis?.context || {};
  const summaries = Array.isArray(context.recentRunSummaries)
    ? context.recentRunSummaries
    : marketMemoryItemsFromRuns(runs);
  const items = marketMemoryItemsFromSummaries(summaries);
  const humanCount = items.reduce((total, item) => total + item.humanFactors.length, 0);
  const watchCount = items.reduce(
    (total, item) => total + Math.max(item.watchSignalCount, item.watchSignals.length),
    0,
  );
  const openActionCount = items.reduce((total, item) => total + item.openActionCount, 0);

  if (items.length === 0) {
    return {
      stage: "empty",
      tone: "warning",
      title: "等待 AI 市场记忆",
      summary: "还没有可复用的市场风向、人性偏差或观察信号。先运行今日扫描，让 AI 建立连续判断。",
      metrics: [
        { label: "记忆运行", value: 0, hint: "等待 recent run memory" },
        { label: "人性风险", value: 0, hint: "等待 AI 识别" },
        { label: "观察信号", value: 0, hint: "等待 AI 识别" },
      ],
      items: [],
      nextActions: [
        "运行今日 AI 扫描。",
        "让 AI 记录市场风向和人性偏差。",
        "下一轮分析会复用这些记忆。",
      ],
      primaryAction: { kind: "scan_today", label: "扫描今日市场" },
    };
  }

  const latest = items[0];
  return {
    stage: "remembering",
    tone: openActionCount > 0 ? "warning" : "success",
    title: "AI 正在沿用市场记忆",
    summary: `${latest.goal}：${latest.marketRead || latest.humanFactors[0] || latest.watchSignals[0]}${openActionCount > 0 ? `；仍有 ${openActionCount} 个交接动作未完成。` : "。"} `,
    metrics: [
      { label: "记忆运行", value: items.length, hint: "最近可复用 AI 判断" },
      { label: "人性风险", value: humanCount, hint: "FOMO / 拥挤 / 恐慌等" },
      { label: "观察信号", value: watchCount, hint: "新闻 / 宏观 / 链上 / 价格" },
    ],
    items,
    nextActions: [
      "对比新扫描是否推翻旧风向。",
      "未完成交接动作要先继续、解除或废弃。",
      "人性/舆论风险变化后再决定 paper 仓位。",
    ],
    primaryAction: { kind: "open_memory", label: "查看记忆" },
  };
}

export function aiStrategyShortlistFromState({
  analysis = null,
  validationRuns = [],
} = {}) {
  const drafts = Array.isArray(analysis?.strategyDrafts) ? analysis.strategyDrafts : [];
  if (drafts.length === 0) {
    return {
      stage: "empty",
      tone: "warning",
      title: "等待 AI 策略短名单",
      summary: "还没有 AI 策略草案。先运行目标扫描，让 AI 生成可验证蓝图。",
      primaryAction: { kind: "scan_today", label: "运行 AI 扫描" },
      metrics: [
        { label: "短名单", value: 0, hint: "等待策略草案" },
        { label: "paper 候选", value: 0, hint: "未验证" },
        { label: "待验证", value: 0, hint: "等待草案" },
      ],
      items: [],
      guardrails: ["没有策略草案时，不创建策略也不执行交易。"],
      nextChecks: ["输入目标并运行 AI 扫描。", "让 AI 生成可回测策略蓝图。"],
    };
  }

  const ranked = rankBacktestValidation(validationRuns);
  const rankedByStrategyId = new Map(ranked.map((row) => [row.strategyId, row]));
  const items = drafts
    .map((draft) => shortlistRowFromDraft(draft, rankedByStrategyId))
    .sort((a, b) => {
      const stageDelta = shortlistStagePriority(a.stage) - shortlistStagePriority(b.stage);
      if (stageDelta !== 0) return stageDelta;
      const aScore = a.score === null ? -1 : Number(a.score || 0);
      const bScore = b.score === null ? -1 : Number(b.score || 0);
      return bScore - aScore;
    })
    .map((item, index) => ({ ...item, rank: index + 1 }));

  const paperCount = items.filter((item) => item.stage === "paper_candidate").length;
  const validatingCount = items.filter((item) => item.stage === "validating").length;
  const validateReadyCount = items.filter((item) => item.stage === "validate_ready").length;
  const rejectedCount = items.filter((item) => item.stage === "rejected").length;
  const stage =
    paperCount > 0
      ? "paper_candidate"
      : validatingCount > 0
        ? "validating"
        : validateReadyCount > 0
          ? "validate_ready"
          : rejectedCount === items.length
            ? "redesign"
            : "observe";
  const tone =
    stage === "paper_candidate"
      ? "success"
      : stage === "redesign"
        ? "danger"
        : "warning";
  const primaryAction =
    paperCount > 0
      ? { kind: "accept_paper_candidate", label: "采用最佳 paper" }
      : validateReadyCount > 0
        ? { kind: "run_all_backtests", label: "验证全部短名单" }
        : validatingCount > 0
          ? { kind: "open_link", label: "查看验证进度" }
          : undefined;

  return {
    stage,
    tone,
    title:
      stage === "paper_candidate"
        ? "AI 已排出 paper 候选"
        : stage === "validating"
          ? "AI 策略正在验证"
          : stage === "validate_ready"
            ? "AI 策略短名单待验证"
            : stage === "redesign"
              ? "AI 策略短名单需重做"
              : "AI 策略短名单用于观察",
    summary:
      stage === "paper_candidate"
        ? "短名单已按回测证据排序，先采用第一名进入 paper 观察，不直接进入测试网或主网。"
        : stage === "validate_ready"
          ? "AI 已生成可回测草案，先批量验证，再让 AI 选择 paper 候选。"
          : stage === "validating"
            ? "短名单中仍有回测运行中，等待自动刷新结果。"
            : "当前短名单没有可直接采用的 paper 候选，继续观察或重新生成蓝图。",
    primaryAction,
    metrics: [
      { label: "短名单", value: items.length, hint: `${drafts.length} 个 AI 草案` },
      { label: "paper 候选", value: paperCount, hint: "回测通过且仅进入 paper" },
      { label: "待验证", value: validateReadyCount + validatingCount, hint: "未完成验证" },
    ],
    items,
    guardrails: [
      "短名单只排序和建议，不会下单。",
      "采用 paper 前仍需回测、风向 / 人性复核和人工确认。",
      "淘汰草案不会进入策略保存或测试网路径。",
    ],
    nextChecks:
      stage === "paper_candidate"
        ? ["复核第一名的收益、回撤和交易次数。", "采用为 paper 后观察 24-72 小时。", "触发停止规则时回到策略蓝图。"]
        : stage === "validating"
          ? ["等待回测自动刷新。", "完成后比较短名单排序。"]
          : stage === "validate_ready"
            ? ["运行全部短名单回测。", "比较收益、回撤、夏普和交易次数。"]
            : ["重新生成更保守的策略蓝图。", "检查市场叙事和数据缺口。"],
  };
}

function rhythmAgeLabel(ageHours) {
  const n = Number(ageHours);
  if (!Number.isFinite(n) || n <= 0) return "刚刚";
  if (n < 1) return `${Math.max(1, Math.round(n * 60))} 分钟`;
  return `${Number(n.toFixed(1))} 小时`;
}

function rhythmMetric(label, value, hint) {
  return { label, value, hint };
}

export function aiOperatorRhythmFromState({
  analysis = null,
  persistedActions = [],
  validationRuns = [],
  runs = [],
  dailyRadarStatus = null,
  providerGate = null,
  now = new Date(),
} = {}) {
  const ranked = rankBacktestValidation(validationRuns);
  const running = ranked.filter((row) => row.score === null);
  const completed = ranked.filter((row) => row.score !== null);
  const candidate = paperCandidateFromValidation(analysis, validationRuns);
  const paperWatch = persistedActionById(persistedActions, "paper_watch");
  const paperWatchEvidenceComplete =
    paperWatch?.status === "done" && paperWatchCompletionHasEvidence(paperWatch);
  const sentimentReview = persistedActionById(persistedActions, "sentiment_review");
  const latestRun = Array.isArray(runs) ? runs[0] : null;
  const guardrails = [
    "AI 节奏面板只安排扫描、验证、paper 和复核，不会下单。",
    "进入测试网或主网前仍需人工确认、组合限额和交易闸门。",
  ];

  if (!analysis) {
    const runCount = Array.isArray(runs) ? runs.length : 0;
    const providerGateStage = String(providerGate?.stage || "").toLowerCase();
    if (providerGateStage === "blocked" || providerGateStage === "loading") {
      const loading = providerGateStage === "loading";
      const primaryHref = String(providerGate?.primaryHref || "/settings/ai").trim() || "/settings/ai";
      const primaryLabel =
        String(providerGate?.primaryAction?.label || "").trim() ||
        (loading ? "查看 AI 配置" : "配置真实 AI");
      const summary =
        String(providerGate?.summary || "").trim() ||
        (loading
          ? "正在确认真实 AI provider 状态，确认前不会启动今日扫描。"
          : "真实 AI provider 还不可用，先完成 API key 配置和连接测试。");

      return {
        stage: loading ? "provider_loading" : "provider_blocked",
        tone: "warning",
        title: loading ? "正在确认 AI provider" : "先配置真实 AI",
        cadence: loading ? "等待 provider" : "先配置",
        summary,
        primaryAction: { kind: "open_link", label: primaryLabel, href: primaryHref },
        metrics: [
          rhythmMetric("活跃判断", "无", latestRun ? "可恢复最近运行" : "等待 AI run"),
          rhythmMetric("历史运行", runCount, "最近 AI run 数量"),
          rhythmMetric(
            "节奏",
            loading ? "等待 provider" : "配置 provider",
            "确认真实 AI 前不启动扫描",
          ),
        ],
        guardrails: [
          "确认真实 AI provider 前，不会启动扫描、验证或交易。",
          ...guardrails,
        ],
        checks: [
          loading ? "等待 provider 状态返回。" : "先配置 provider API key。",
          "在 AI 设置页完成连接测试。",
          "provider ready 后再启动今日扫描。",
        ],
      };
    }
    return {
      stage: "scan_due",
      tone: "warning",
      title: "先让 AI 扫描今日机会",
      cadence: "先扫描",
      summary:
        dailyRadarStatus?.summary ||
        "当前没有活跃 AI 判断。先扫描市场、舆论、宏观、链上和人性约束，再让 AI 生成策略蓝图。",
      primaryAction: { kind: "scan_today", label: "启动今日扫描" },
      metrics: [
        rhythmMetric("活跃判断", "无", latestRun ? "可恢复最近运行" : "等待 AI run"),
        rhythmMetric("历史运行", runCount, "最近 AI run 数量"),
        rhythmMetric("节奏", "观察", "不会直接交易"),
      ],
      guardrails,
      checks: [
        "扫描后先看上下文证据是否充足。",
        "只有可回测策略草案才进入验证。",
        "没有回测和 paper 前不推进执行。",
      ],
    };
  }

  const analysisAgeHours = runAgeHours(analysis, now);
  const ageLabel = rhythmAgeLabel(analysisAgeHours);
  const context = analysis?.context || {};
  const contextCount =
    Number(context.newsCount || 0) +
    Number(context.macroCount || 0) +
    Number(context.onchainCount || 0);
  const drafts = Array.isArray(analysis?.strategyDrafts) ? analysis.strategyDrafts : [];
  const runnable = runnableBacktestRequestsFromAnalysis(analysis);
  const sentiment = aiSentimentCompassFromAnalysis(analysis);
  const staleByAge = analysisAgeHours >= 6;
  const staleByRadar =
    Boolean(dailyRadarStatus?.isStale) || String(dailyRadarStatus?.stage || "") === "stale";
  const baseMetrics = [
    rhythmMetric("结论年龄", ageLabel, staleByAge ? "需要刷新" : "仍可参考"),
    rhythmMetric(
      "验证",
      running.length > 0 ? `${running.length} 进行中` : `${completed.length} 完成`,
      candidate ? "已有 paper 候选" : "等待更强证据",
    ),
    rhythmMetric("风向", sentiment.title || "未知", `${contextCount} 条上下文`),
  ];

  if (staleByAge || staleByRadar) {
    return {
      stage: "refresh_due",
      tone: "warning",
      title: "先刷新 AI 判断",
      cadence: "重新扫描",
      summary: `当前 AI 判断已经 ${ageLabel}，市场风向、舆论和链上状态可能变化。先重扫，再决定是否继续验证或 paper。`,
      primaryAction: {
        kind: "refresh_run",
        label: "重新扫描当前运行",
        runId: analysis.id,
        href: aiMoneyRunHref(analysis.id),
      },
      metrics: baseMetrics,
      guardrails,
      checks: [
        `当前结论年龄 ${ageLabel}。`,
        "重扫会生成新的 AI run，并保留旧 run 用于对比。",
        "旧结论不能直接推进到 paper 或执行。",
      ],
    };
  }

  if (sentiment.stage !== "balanced" && !sentimentReviewCompleted(sentimentReview)) {
    return {
      stage: "slow_down",
      tone: "warning",
      title: "先降速复核风向 / 人性",
      cadence: "暂停推进",
      summary:
        "AI 识别到人性、舆论或市场风向压力。即使回测出现 paper 候选，也先复核热度、拥挤、恐慌和禁止场景。",
      primaryAction: {
        kind: "open_link",
        label: "复核风向 / 人性",
        href: "/data-explorer/news",
      },
      metrics: baseMetrics,
      guardrails: [
        ...guardrails,
        "paper 候选在风向复核前只允许观察，不进入测试网。",
      ],
      checks: [
        ...safeStringList(sentiment.risks).slice(0, 3),
        "记录是否存在 FOMO、追涨、恐慌止损或叙事拥挤。",
      ].filter(Boolean),
    };
  }

  if (running.length > 0) {
    return {
      stage: "validating",
      tone: "warning",
      title: "等待 AI 验证跑完",
      cadence: "自动刷新验证",
      summary: `${running.length} 个回测仍在进行。先等验证完成，再让 AI 排 paper 候选。`,
      primaryAction: {
        kind: "open_link",
        label: "查看验证进度",
        href: running[0]?.runId ? `/backtests/${encodeURIComponent(running[0].runId)}` : "/backtests",
      },
      metrics: baseMetrics,
      guardrails,
      checks: [
        "等待 pending / running 回测完成。",
        "回测完成后重新读取评分、收益、回撤和交易次数。",
        "验证中不保存为 live 策略。",
      ],
    };
  }

  if (runnable.length > 0 && ranked.length === 0) {
    return {
      stage: "validate_ready",
      tone: "warning",
      title: "先验证 AI 策略蓝图",
      cadence: "批量回测",
      summary: `AI 已生成 ${drafts.length} 个蓝图，其中 ${runnable.length} 个可回测。先批量验证，再筛 paper 候选。`,
      primaryAction: { kind: "run_all_backtests", label: "批量验证 AI 蓝图" },
      metrics: baseMetrics,
      guardrails,
      checks: [
        "回测窗口使用安全默认参数。",
        "观察型草案不会进入自动回测。",
        "没有验证评分前不进入 paper。",
      ],
    };
  }

  if (candidate && ["manual", "done"].includes(String(paperWatch?.status || "").toLowerCase())) {
    const paperEvidenceMissing = paperWatch?.status === "done" && !paperWatchEvidenceComplete;
    return {
      stage: "paper_watch",
      tone: paperWatchEvidenceComplete ? "success" : "warning",
      title: paperEvidenceMissing
        ? "补齐 paper 复盘证据"
        : paperWatchEvidenceComplete
          ? "Paper 观察可复盘"
          : "继续 paper 观察",
      cadence: "观察 24-72h",
      summary:
        paperEvidenceMissing
          ? `${candidate.strategyId} 已标记 paper 完成，但复盘证据不足；需要补齐市场风向、舆论、人性偏差和执行摩擦。`
          : paperWatch?.note ||
            `${candidate.strategyId} 已进入 paper 节奏，继续记录价格、舆论、人性偏差和执行摩擦。`,
      primaryAction: {
        kind: "open_link",
        label: "打开 paper 证据",
        href: paperWatch?.href || candidate.backtestHref,
      },
      metrics: baseMetrics,
      guardrails,
      checks: [
        paperEvidenceMissing
          ? "补齐市场风向、舆论、人性偏差和执行摩擦证据。"
          : "记录 24-72 小时观察结论。",
        "复盘是否触发降仓、停手或放弃条件。",
        "paper 完成前不进入测试网。",
      ],
    };
  }

  if (candidate) {
    return {
      stage: "paper_candidate",
      tone: "success",
      title: "AI 找到 paper 候选",
      cadence: "采用前确认",
      summary: `${candidate.strategyId} 评分 ${candidate.score}，收益 ${formatPercentValue(candidate.totalReturn)}，回撤 ${formatPercentValue(candidate.maxDrawdown)}。先采用为 paper 观察，不直接交易。`,
      primaryAction: { kind: "accept_paper_candidate", label: "采用为 paper 观察" },
      metrics: baseMetrics,
      guardrails,
      checks: [
        "采用后只进入 paper 观察。",
        "继续记录舆论和人性偏差。",
        "测试网前必须完成 paper 复盘。",
      ],
    };
  }

  return {
    stage: "observe",
    tone: completed.length > 0 ? "warning" : "default",
    title: completed.length > 0 ? "AI 结果需要重新筛选" : "维持观察节奏",
    cadence: "观察 / 重做",
    summary:
      completed.length > 0
        ? "已有回测结果但没有达到 paper 门槛。先观察或让 AI 重做策略蓝图。"
        : "当前没有可推进动作。继续观察市场风向，必要时重新扫描。",
    primaryAction: { kind: "scan_today", label: "重新扫描市场" },
    metrics: baseMetrics,
    guardrails,
    checks: [
      "不为了操作而操作。",
      "弱验证结果不进入 paper。",
      "等待更清晰的市场、舆论或验证证据。",
    ],
  };
}

function delegationStep(owner, title, detail, status = "pending") {
  return { owner, title, detail, status };
}

function delegationMetrics({ context, runnableCount, ranked, candidate, readiness }) {
  const contextCount =
    Number(context?.newsCount || 0) +
    Number(context?.macroCount || 0) +
    Number(context?.onchainCount || 0);
  const runningCount = ranked.filter((row) => row.score === null).length;
  const completedCount = ranked.filter((row) => row.score !== null).length;
  return [
    {
      label: "AI 上下文",
      value: `${contextCount} 条`,
      hint: `${Number(context?.newsCount || 0)} 新闻 / ${Number(context?.macroCount || 0)} 宏观 / ${Number(context?.onchainCount || 0)} 链上`,
    },
    {
      label: "AI 可代办",
      value: runnableCount,
      hint: "可自动回测草案",
    },
    {
      label: "验证状态",
      value: runningCount > 0 ? `${runningCount} 进行中` : `${completedCount} 完成`,
      hint: candidate ? `${candidate.strategyId} 可 paper` : "等待候选",
    },
    {
      label: "执行闸门",
      value: readiness?.stage || "observe",
      hint: readiness?.title || "观察优先",
    },
  ];
}

export function aiDelegationRunbookFromState({
  analysis = null,
  persistedActions = [],
  validationRuns = [],
  accounts,
  dailyRadarStatus = null,
  providerGate = null,
} = {}) {
  const guardrails = [
    "AI 授权执行单只允许扫描、回测、paper 观察和打开证据，不会下单。",
    "测试网前必须完成 paper 复盘；主网仍需 mainnet token gate、kill switch 和人工确认。",
  ];

  if (!analysis) {
    const providerGateStage = String(providerGate?.stage || "").toLowerCase();
    if (providerGateStage === "blocked" || providerGateStage === "loading") {
      const loading = providerGateStage === "loading";
      const primaryHref = String(providerGate?.primaryHref || "/settings/ai").trim() || "/settings/ai";
      const primaryLabel =
        String(providerGate?.primaryAction?.label || "").trim() ||
        (loading ? "查看 AI 配置" : "配置真实 AI");
      const decision =
        String(providerGate?.summary || "").trim() ||
        (loading
          ? "正在确认真实 AI provider 状态，确认前不会把赚钱目标交给 AI 扫描。"
          : "真实 AI provider 还不可用，先完成 API key 配置和连接测试。");

      return {
        stage: loading ? "provider_loading" : "provider_blocked",
        tone: "warning",
        title: loading ? "正在确认 AI provider" : "先配置真实 AI",
        decision,
        primaryAction: { kind: "open_link", label: primaryLabel, href: primaryHref },
        metrics: [
          { label: "AI 上下文", value: 0, hint: "等待真实 provider" },
          { label: "AI 可代办", value: 0, hint: "provider ready 前暂停" },
          { label: "验证状态", value: "未开始", hint: "等待策略草案" },
          { label: "执行闸门", value: "provider", hint: "不会交易" },
        ],
        aiSteps: [
          delegationStep("AI", "等待真实 AI provider", "provider ready 前不扫描、不生成蓝图。"),
          delegationStep("AI", "扫描目标和市场", "provider ready 后再读取市场、舆论、宏观、链上和行为约束。"),
        ],
        humanSteps: [
          delegationStep(
            "human",
            loading ? "等待 provider 状态" : "配置真实 AI provider",
            loading ? "等待 AI 设置状态返回；未确认前不要启动扫描。" : "打开 AI 设置页，配置 API key 并完成连接测试。",
            "current",
          ),
          delegationStep("human", "确认真实交易", "任何真实交易都必须人工确认组合限额和交易闸门。"),
        ],
        guardrails: [
          "确认真实 AI provider 前，不会启动扫描、回测、paper 或交易。",
          ...guardrails,
        ],
      };
    }
    return {
      stage: "handoff",
      tone: "warning",
      title: "先把赚钱目标交给 AI",
      decision: dailyRadarStatus?.summary || "当前没有活跃 AI run。先让 AI 自动扫描目标、市场风向、舆论、人性偏差和安全约束。",
      primaryAction: { kind: "scan_today", label: "启动 AI 扫描" },
      metrics: [
        { label: "AI 上下文", value: 0, hint: "等待扫描" },
        { label: "AI 可代办", value: 2, hint: "扫描 + 生成蓝图" },
        { label: "验证状态", value: "未开始", hint: "等待策略草案" },
        { label: "执行闸门", value: "observe", hint: "不会交易" },
      ],
      aiSteps: [
        delegationStep("AI", "扫描目标和市场", "读取市场、舆论、宏观、链上和行为约束。", "ready"),
        delegationStep("AI", "生成策略蓝图", "输出可回测草案、观察信号和安全验证计划。"),
      ],
      humanSteps: [
        delegationStep("human", "输入赚钱目标", "确认周期、风险偏好、禁止场景和最大可承受亏损。", "current"),
        delegationStep("human", "确认真实交易", "任何真实交易都必须人工确认组合限额和交易闸门。"),
      ],
      guardrails,
    };
  }

  const context = analysis?.context || {};
  const notes = safeStringList(context.notes);
  const ranked = rankBacktestValidation(validationRuns);
  const running = ranked.filter((row) => row.score === null);
  const completed = ranked.filter((row) => row.score !== null);
  const runnable = runnableBacktestRequestsFromAnalysis(analysis);
  const candidate = paperCandidateFromValidation(analysis, validationRuns);
  const readiness = aiExecutionReadinessFromState({
    analysis,
    persistedActions,
    validationRuns,
    accounts,
  });
  const sentiment = aiSentimentCompassFromAnalysis(analysis);
  const sentimentReview = persistedActionById(persistedActions, "sentiment_review");
  const paperWatch = persistedActionById(persistedActions, "paper_watch");
  const paperWatchEvidenceComplete =
    paperWatch?.status === "done" && paperWatchCompletionHasEvidence(paperWatch);
  const humanFactors = safeStringList(analysis?.humanFactors);
  const sentimentRisks = safeStringList(sentiment?.risks);
  const metrics = delegationMetrics({
    context,
    runnableCount: runnable.length,
    ranked,
    candidate,
    readiness,
  });
  const staleRadar =
    Boolean(dailyRadarStatus?.isStale) || String(dailyRadarStatus?.stage || "") === "stale";

  if ((notes.length > 0 && ranked.length === 0) || staleRadar) {
    return {
      stage: "refresh_context",
      tone: "warning",
      title: "先授权 AI 刷新上下文",
      decision: "当前 AI 判断被数据缺口或过期市场风向卡住。先刷新，再决定是否验证策略。",
      primaryAction: staleRadar
        ? { kind: "scan_today", label: "重新扫描" }
        : { kind: "open_link", label: "查看数据缺口", href: "/data-explorer/news" },
      metrics,
      aiSteps: [
        delegationStep("AI", "刷新市场风向", "重新读取新闻、宏观、链上和价格观察线。", "current"),
        delegationStep("AI", "重建策略判断", "用新上下文重新判断是否还值得回测。"),
      ],
      humanSteps: [
        delegationStep("human", "复核数据缺口", notes[0] || "确认今日市场上下文是否足够。", "current"),
      ],
      guardrails,
    };
  }

  if (running.length > 0) {
    const first = running[0];
    return {
      stage: "ai_wait",
      tone: "warning",
      title: "AI 正在等待验证结果",
      decision: `${running.length} 个回测仍在进行。AI 只等待和刷新进度，不提前采用候选。`,
      primaryAction: {
        kind: "open_link",
        label: "查看回测进度",
        href: first?.runId ? `/backtests/${encodeURIComponent(first.runId)}` : "/backtests",
      },
      metrics,
      aiSteps: [
        delegationStep("AI", "轮询验证进度", "读取 pending / running 回测，等待终态评分。", "current"),
        delegationStep("AI", "更新候选排序", "完成后比较收益、回撤、夏普和交易次数。"),
      ],
      humanSteps: [
        delegationStep("human", "等待验证完成", "验证未完成前不要保存 live 策略或扩大仓位。"),
      ],
      guardrails,
    };
  }

  if (runnable.length > 0 && ranked.length === 0) {
    return {
      stage: "ai_validate",
      tone: "warning",
      title: "授权 AI 自动验证蓝图",
      decision: `AI 已生成 ${runnable.length} 个可回测草案。下一步应由 AI 批量回测，而不是人工猜哪个能赚钱。`,
      primaryAction: { kind: "run_all_backtests", label: "运行 AI 批量回测" },
      metrics,
      aiSteps: [
        delegationStep("AI", "批量回测策略", `自动创建 ${runnable.length} 个 90 天 / 1h 回测任务。`, "ready"),
        delegationStep("AI", "筛选 paper 候选", "按收益、回撤、夏普和交易次数过滤弱策略。"),
      ],
      humanSteps: [
        delegationStep("human", "不要提前采用", "没有回测评分前，不进入 paper、测试网或主网。", "current"),
      ],
      guardrails,
    };
  }

  if (candidate && paperWatchEvidenceComplete && readiness.stage === "testnet_ready") {
    return {
      stage: "testnet_handoff",
      tone: "success",
      title: "AI 可移交测试网前检查",
      decision: `${candidate.strategyId} 已完成 paper 观察，AI 最多协助打开预填策略和测试网检查。`,
      primaryAction: {
        kind: "open_link",
        label: "打开策略预填",
        href: candidate.strategyHref,
      },
      metrics,
      aiSteps: [
        delegationStep("AI", "准备测试网检查", "打开预填策略、回测证据和风险上限。", "ready"),
      ],
      humanSteps: [
        delegationStep("human", "确认测试网", "确认账户、组合限额、kill switch 和 paper 复盘后再启用。", "current"),
      ],
      guardrails,
    };
  }

  if (candidate && paperWatch?.status === "done" && !paperWatchEvidenceComplete) {
    return {
      stage: "paper_review",
      tone: "warning",
      title: "先补齐 paper 复盘证据",
      decision: `${candidate.strategyId} 已标记 paper 完成，但复盘证据不足；AI 不应移交测试网或重新采用 paper。`,
      primaryAction: {
        kind: "open_link",
        label: "打开 paper 证据",
        href: paperWatch.href || candidate.backtestHref,
      },
      metrics,
      aiSteps: [
        delegationStep("AI", "暂停测试网移交", "已识别 paper 完成标记缺少风向、人性和执行摩擦证据。", "done"),
      ],
      humanSteps: [
        delegationStep("human", "补齐 paper 复盘", "补齐市场风向、舆论、人性偏差、执行摩擦和回撤表现。", "current"),
      ],
      guardrails: [
        ...guardrails,
        "paper 复盘证据不足时，AI 不进入测试网前检查。",
      ],
    };
  }

  const needsHumanReview =
    candidate &&
    sentiment.stage !== "balanced" &&
    !sentimentReviewCompleted(sentimentReview);
  if (needsHumanReview) {
    const firstRisk = humanFactors[0] || sentimentRisks[0] || "风向 / 人性复核未完成。";
    return {
      stage: "human_review",
      tone: "warning",
      title: "AI 候选先交给你复核",
      decision: `${candidate.strategyId} 达到 paper 候选，但市场风向或人性压力仍可能让 AI 判断失效。`,
      primaryAction: {
        kind: "open_link",
        label: "复核风向 / 人性",
        href: "/data-explorer/news",
      },
      metrics,
      aiSteps: [
        delegationStep("AI", "整理反证信号", "已把舆论、FOMO、拥挤和回测证据交给你复核。", "done"),
      ],
      humanSteps: [
        delegationStep("human", "复核候选风险", firstRisk, "current"),
        delegationStep("human", "决定是否采用 paper", "复核完成前不要采用 paper 候选。"),
      ],
      guardrails: [
        ...guardrails,
        "风向 / 人性复核前，paper 候选只允许观察。",
      ],
    };
  }

  if (candidate) {
    return {
      stage: "paper_handoff",
      tone: "success",
      title: "AI 已准备 paper 移交",
      decision: `${candidate.strategyId} 评分 ${candidate.score}，收益 ${formatPercentValue(candidate.totalReturn)}，回撤 ${formatPercentValue(candidate.maxDrawdown)}。下一步只采用为 paper 观察。`,
      primaryAction: { kind: "accept_paper_candidate", label: "采用为 paper 观察" },
      metrics,
      aiSteps: [
        delegationStep("AI", "准备 paper 观察", "已选出候选、证据链接、风险上限和观察重点。", "done"),
        delegationStep("AI", "继续跟踪风向", "paper 后继续看舆论、人性偏差、回撤和执行摩擦。"),
      ],
      humanSteps: [
        delegationStep("human", "采用 paper 候选", "确认后只进入 paper，不开启测试网或主网。", "current"),
        delegationStep("human", "记录观察结果", "按 24-72 小时观察计划复盘。"),
      ],
      guardrails,
    };
  }

  return {
    stage: completed.length > 0 ? "redesign" : "observe",
    tone: completed.length > 0 ? "danger" : "default",
    title: completed.length > 0 ? "AI 需要重做策略蓝图" : "AI 暂时只观察",
    decision:
      completed.length > 0
        ? "已完成验证没有产生 paper 候选。不要为了执行而执行，先让 AI 重做蓝图。"
        : "当前没有可自动推进的策略证据，维持观察或重新扫描。",
    primaryAction: { kind: "scan_today", label: "重新扫描市场" },
    metrics,
    aiSteps: [
      delegationStep("AI", "重做机会扫描", "重新读取目标、市场风向和策略约束。", "ready"),
    ],
    humanSteps: [
      delegationStep("human", "拒绝弱信号", "弱验证结果不进入 paper，更不进入测试网或主网。", "current"),
    ],
    guardrails,
  };
}

function invalidationMetric(label, value, hint) {
  return { label, value, hint };
}

function watchSignalLines(analysis) {
  return Array.isArray(analysis?.watchSignals)
    ? analysis.watchSignals
        .map((item) => {
          const signal = String(item?.signal || "").trim();
          const interpretation = String(item?.interpretation || "").trim();
          const action = String(item?.action || "").trim();
          if (!signal) return "";
          return [signal, interpretation, action].filter(Boolean).join("：");
        })
        .filter(Boolean)
    : [];
}

export function aiThesisInvalidationFromState({
  analysis = null,
  validationRuns = [],
  persistedActions = [],
} = {}) {
  const guardrails = [
    "AI 反证清单只用于观察和复核，不能交易。",
    "任何策略推进前都必须先看反证、停止规则和安全闸门。",
  ];

  if (!analysis) {
    return {
      stage: "needs_thesis",
      tone: "warning",
      title: "先生成可反证的 AI 论点",
      summary: "还没有 AI 赚钱论点，不能只凭直觉、行情或情绪进入交易。",
      primaryAction: {
        kind: "scan_today",
        label: "先生成 AI 论点",
      },
      metrics: [
        invalidationMetric("AI 论点", "无", "等待目标扫描"),
        invalidationMetric("反证", "未生成", "等待策略蓝图"),
        invalidationMetric("执行", "禁止", "没有论点不能交易"),
      ],
      invalidators: ["还没有 AI 论点、策略蓝图和验证证据。"],
      monitors: ["先扫描市场、舆论、宏观和链上上下文。"],
      stopRules: ["没有 AI 论点和回测证据前，不进入 paper、测试网或主网。"],
      guardrails,
    };
  }

  const context = analysis?.context || {};
  const notes = safeStringList(context.notes);
  const ranked = rankBacktestValidation(validationRuns);
  const completed = ranked.filter((row) => row.score !== null);
  const best = ranked[0] ?? null;
  const candidate = paperCandidateFromValidation(analysis, validationRuns);
  const sentiment = aiSentimentCompassFromAnalysis(analysis);
  const sentimentReview = persistedActionById(persistedActions, "sentiment_review");
  const paperPlan = paperObservationPlanFromCandidate(analysis, candidate);
  const watchLines = watchSignalLines(analysis);
  const humanFactors = safeStringList(analysis?.humanFactors);
  const contextCount =
    Number(context.newsCount || 0) +
    Number(context.macroCount || 0) +
    Number(context.onchainCount || 0);
  const baseMetrics = [
    invalidationMetric(
      "论点证据",
      contextCount,
      `新闻/宏观/链上 ${Number(context.newsCount || 0)}/${Number(context.macroCount || 0)}/${Number(context.onchainCount || 0)}`,
    ),
    invalidationMetric(
      "验证",
      best ? `${best.recommendation}${best.score === null ? "" : ` ${best.score}`}` : "未验证",
      candidate ? "已有 paper 候选" : "等待或未通过",
    ),
    invalidationMetric("风向压力", sentiment.title || "未知", sentiment.stage || "unknown"),
  ];

  if (notes.length > 0 && completed.length === 0) {
    return {
      stage: "data_gap",
      tone: "warning",
      title: "数据缺口正在反证 AI 论点",
      summary: "AI 结论缺少足够上下文支撑。先补齐数据，再验证策略，否则容易把旧消息或单一叙事当成机会。",
      primaryAction: {
        kind: "open_link",
        label: "打开数据缺口",
        href: "/data-explorer/news",
      },
      metrics: baseMetrics,
      invalidators: notes.slice(0, 5),
      monitors: [
        "新增新闻是否改变原市场判断。",
        "宏观或链上数据是否支持当前方向。",
        ...watchLines.slice(0, 2),
      ].filter(Boolean),
      stopRules: [
        "数据缺口补齐前，不采用 paper 候选。",
        "上下文仍不足时，重新生成 AI 蓝图。",
      ],
      guardrails,
    };
  }

  if (!candidate && completed.length > 0) {
    return {
      stage: "invalidated_by_backtest",
      tone: "danger",
      title: "回测已经反证当前论点",
      summary: "已完成的验证没有达到 paper 门槛。不要为了执行而执行，先让 AI 重做策略蓝图。",
      primaryAction: {
        kind: "scan_today",
        label: "重做 AI 蓝图",
      },
      metrics: baseMetrics,
      invalidators: completed
        .slice(0, 4)
        .map((row) => `${row.strategyId || row.runId}: ${row.recommendation}，评分 ${row.score}，收益 ${formatPercentValue(row.totalReturn)}，回撤 ${formatPercentValue(row.maxDrawdown)}`),
      monitors: [
        "是否存在过拟合或交易次数不足。",
        "是否需要更保守的参数和更长回测窗口。",
        "是否应只观察，不进入 paper。",
      ],
      stopRules: [
        "弱验证结果不进入 paper。",
        "收益为负或回撤结构恶化时，回到 AI 策略蓝图。",
      ],
      guardrails,
    };
  }

  if (sentiment.stage !== "balanced" && !sentimentReviewCompleted(sentimentReview)) {
    return {
      stage: "pressure_test",
      tone: "warning",
      title: "先用反证压力测试 AI 论点",
      summary: "当前论点可能被人性偏差、舆论热度或市场拥挤反证。先做风向复核，再决定是否采用 paper。",
      primaryAction: {
        kind: "open_link",
        label: "复核反证信号",
        href: "/data-explorer/news",
      },
      metrics: baseMetrics,
      invalidators: [
        ...humanFactors.slice(0, 3),
        ...watchLines.slice(0, 3),
        ...safeStringList(sentiment.risks).slice(0, 3),
      ].filter(Boolean),
      monitors: [
        "情绪热度是否继续升温或转向恐慌。",
        "价格走势是否与 AI 论点背离。",
        "是否出现追涨、频繁改参数或扩大仓位冲动。",
      ],
      stopRules:
        paperPlan?.stopRules?.length > 0
          ? paperPlan.stopRules
          : ["风向 / 人性复核未完成前，不采用 paper 候选。", "paper 观察前不进入测试网。"],
      guardrails,
    };
  }

  if (candidate) {
    return {
      stage: "watch_thesis",
      tone: "success",
      title: "AI 论点进入可观察反证",
      summary: `${candidate.strategyId} 已达到 paper 候选门槛。继续盯反证信号，而不是只寻找支持上涨或盈利的证据。`,
      primaryAction: {
        kind: "open_link",
        label: "打开回测证据",
        href: candidate.backtestHref,
      },
      metrics: baseMetrics,
      invalidators: [
        `回测收益 ${formatPercentValue(candidate.totalReturn)} 不能代表实盘，需继续验证滑点、频率和回撤。`,
        ...humanFactors.slice(0, 2),
      ].filter(Boolean),
      monitors: [
        ...watchLines.slice(0, 4),
        "paper 期间收益、回撤、交易频率和新增舆论变化。",
      ],
      stopRules:
        paperPlan?.stopRules?.length > 0
          ? paperPlan.stopRules
          : ["paper 观察未完成前，不进入测试网。"],
      guardrails,
    };
  }

  return {
    stage: "observe",
    tone: "default",
    title: "继续收集反证",
    summary: "当前 AI 论点还没有足够证据推进。继续观察市场、舆论、人性偏差和验证结果。",
    primaryAction: {
      kind: "run_all_backtests",
      label: "先验证 AI 蓝图",
    },
    metrics: baseMetrics,
    invalidators: ["尚无 paper 候选。", "缺少足够强的验证证据。"],
    monitors: watchLines.length > 0 ? watchLines.slice(0, 4) : ["等待新增市场、舆论和链上信号。"],
    stopRules: ["没有验证结果前，不进入 paper。", "不为了操作而操作。"],
    guardrails,
  };
}

export function backtestActionUpdateFromValidationResult(plan, handles) {
  const runIds = Array.isArray(handles)
    ? handles.map((handle) => String(handle?.runId || "").trim()).filter(Boolean)
    : [];
  if (runIds.length === 0) {
    return {
      status: "blocked",
      relatedId: "",
      href: "",
      note: plan?.actionNote || "没有可回测的 AI 草案；需要先调整目标或生成新的策略蓝图。",
    };
  }
  const names = Array.isArray(plan?.items)
    ? plan.items
        .map(({ draft }) => draft?.name || draft?.symbol)
        .filter(Boolean)
        .slice(0, 6)
        .join("、")
    : "";
  return {
    status: "done",
    relatedId: runIds.join(",").slice(0, 200),
    href: `/backtests/${runIds[0]}`,
    note: `已发起 ${runIds.length} 个 AI 草案回测${names ? `：${names}` : ""}`,
  };
}

function safeDateISOString(value, fallback = new Date()) {
  const date = value ? new Date(value) : fallback;
  if (Number.isNaN(date.getTime())) return fallback.toISOString();
  return date.toISOString();
}

export function optimisticValidationRunsFromHandles(plan, handles = [], now = new Date()) {
  const items = Array.isArray(plan?.items) ? plan.items : [];
  const fallbackTime = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  return (Array.isArray(handles) ? handles : [])
    .map((handle, index) => {
      const runId = String(handle?.runId || "").trim();
      const item = items[index];
      const request = item?.request || {};
      if (!runId || !item) return null;
      return {
        runId,
        strategyId: String(request.strategyId || item?.draft?.name || runId),
        kind: String(request.kind || item?.draft?.kind || "grid_dca"),
        params: request.params || {},
        request,
        state: 1,
        progress: 0,
        metrics: {},
        trades: [],
        createdAt: safeDateISOString(handle?.enqueuedAt, fallbackTime),
        startedAt: null,
        finishedAt: null,
        error: "",
      };
    })
    .filter(Boolean);
}

export function opportunityRadarFromState({
  analysis = null,
  persistedActions = [],
  validationRuns = [],
  runs = [],
} = {}) {
  const recentRuns = Array.isArray(runs) ? runs : [];
  if (!analysis) {
    const latest = recentRuns[0] ?? null;
    return {
      stage: "idle",
      title: "启动 AI 机会雷达",
      tone: "warning",
      summary: latest
        ? `最近一次 AI 目标是“${latest.goal || "未命名目标"}”。先用当前目标重新扫描，并自动进入安全验证。`
        : "还没有 AI 机会扫描。先输入目标或选择模板，让 AI 同时检查市场、舆论、人性因素并进入安全验证。",
      metrics: [
        {
          label: "最近运行",
          value: recentRuns.length,
          hint: latest?.createdAt ? new Date(latest.createdAt).toLocaleString() : "暂无",
        },
        {
          label: "建议动作",
          value: "分析+验证",
          hint: "不触发交易",
        },
        {
          label: "覆盖范围",
          value: "市场 / 舆论 / 人性",
          hint: "由 AI 目标分析生成",
        },
      ],
      reasons: ["当前没有可展示的 AI 结论"],
      nextActions: ["输入目标或选择模板", "点击分析并启动验证", "等待回测结果后再进入 paper 决策"],
      primaryAction: { kind: "analyze_and_validate", label: "启动 AI 雷达" },
    };
  }

  const decision = nextAIGoalDecision(analysis, persistedActions, validationRuns);
  const validationPlan = autoValidationPlanFromAnalysis(analysis);
  const ranked = rankBacktestValidation(validationRuns);
  const context = analysis?.context || {};
  const drafts = Array.isArray(analysis?.strategyDrafts) ? analysis.strategyDrafts : [];
  const symbols = safeStringList(context.symbols).join(", ") || "auto";
  const validationValue =
    ranked.length > 0
      ? `${ranked.length} 个结果`
      : `${validationPlan.runnableCount} 待测`;
  return {
    stage: decision.stage,
    title: decision.title,
    tone: decision.tone,
    summary: decision.summary,
    metrics: [
      {
        label: "上下文",
        value: `${Number(context.newsCount || 0)} / ${Number(context.macroCount || 0)} / ${Number(context.onchainCount || 0)}`,
        hint: `新闻 / 宏观 / 链上 · ${symbols}`,
      },
      {
        label: "验证",
        value: validationValue,
        hint:
          ranked.length > 0
            ? "已读取回测状态"
            : validationPlan.actionNote,
      },
      {
        label: "AI 蓝图",
        value: drafts.length,
        hint: analysis?.execution?.mode || "observe",
      },
    ],
    reasons: decision.reasons,
    nextActions: decision.nextActions,
    primaryHref: decision.primaryHref,
    primaryAction: decision.primaryAction,
  };
}

function pushUniqueText(list, value) {
  const text = String(value || "").trim();
  if (text && !list.includes(text)) list.push(text);
}

export function aiAutopilotStateFromAnalysis({
  analysis = null,
  persistedActions = [],
  validationRuns = [],
} = {}) {
  if (!analysis) {
    return {
      stage: "idle",
      title: "等待 AI 目标",
      tone: "warning",
      progress: 0,
      maxExecutionMode: "observe",
      canAutoExecute: false,
      summary: "还没有 AI 分析结果。",
      metrics: [
        { label: "上下文", value: "0/0/0", hint: "新闻/宏观/链上" },
        { label: "验证", value: "0 完成", hint: "等待 AI 蓝图" },
        { label: "观察", value: "0 信号", hint: "等待目标" },
      ],
      blockers: ["输入目标并启动 AI 分析"],
      safetyGates: ["真实交易始终需要人工闸门"],
      nextActions: ["启动 AI 雷达"],
      completedSteps: [],
      aiAvailableSteps: [
        "AI 可自动扫描目标、市场、舆论、宏观和链上上下文。",
        "AI 可生成策略蓝图、观察信号和安全验证计划。",
      ],
      humanRequiredSteps: [
        "你需要输入赚钱目标和风险偏好。",
        "真实交易始终需要人工确认和交易闸门。",
      ],
      primaryAction: { kind: "analyze_and_validate", label: "启动 AI 雷达" },
    };
  }

  const decision = nextAIGoalDecision(analysis, persistedActions, validationRuns);
  const validationPlan = autoValidationPlanFromAnalysis(analysis);
  const ranked = rankBacktestValidation(validationRuns);
  const context = analysis?.context || {};
  const notes = safeStringList(context.notes);
  const watchSignals = Array.isArray(analysis?.watchSignals) ? analysis.watchSignals : [];
  const humanFactors = safeStringList(analysis?.humanFactors);
  const execution = analysis?.execution || {};
  const completedRuns = ranked.filter((row) => row.score !== null).length;
  const runningRuns = ranked.filter((row) => row.score === null).length;
  const paperWatch = persistedActionById(persistedActions, "paper_watch");
  const paperWatchEvidenceComplete =
    paperWatch?.status === "done" && paperWatchCompletionHasEvidence(paperWatch);

  const stageProgress = {
    data_gap: 20,
    backtest: 35,
    validating: 50,
    redesign: 25,
    paper_candidate: 60,
    paper_watch: 70,
    continue_paper: 75,
    testnet_candidate: 85,
  };
  const progress = stageProgress[decision.stage] ?? 40;
  const maxExecutionMode = decision.stage === "testnet_candidate" ? "testnet" : "observe";
  const primaryAction =
    decision.primaryAction ??
    (decision.primaryHref
      ? {
          kind: "open_link",
          label:
            decision.stage === "data_gap" || decision.stage === "sentiment_review"
              ? "打开数据上下文"
              : "打开相关页面",
        }
      : undefined);
  const requestedMainnet = String(execution.mode || "").toLowerCase() === "mainnet";
  const blockers = [
    ...safeStringList(decision.reasons),
    ...notes,
    ...(requestedMainnet ? ["主网仍需独立人工确认和 mainnet token gate"] : []),
  ].slice(0, 6);
  const safetyGates = [
    ...safeStringList(execution.safetyGates),
    ...humanFactors.map((item) => `人性/舆论检查：${item}`),
  ].slice(0, 8);
  const completedSteps = [];
  const aiAvailableSteps = [];
  const humanRequiredSteps = [];

  pushUniqueText(completedSteps, "AI 已生成策略蓝图和执行路径。");
  if (Number(context.newsCount || 0) + Number(context.macroCount || 0) + Number(context.onchainCount || 0) > 0) {
    pushUniqueText(completedSteps, "AI 已读取市场、舆论、宏观或链上上下文。");
  }
  if (completedRuns > 0) {
    pushUniqueText(completedSteps, `${completedRuns} 个回测验证已完成。`);
  }
  if (paperWatchEvidenceComplete) {
    pushUniqueText(completedSteps, "paper 观察已完成。");
  } else if (paperWatch?.status === "done") {
    pushUniqueText(completedSteps, "paper 观察已标记完成，但复盘证据仍需补齐。");
  } else if (paperWatch) {
    pushUniqueText(completedSteps, "paper 候选已采用，仍在观察。");
  }

  if (decision.stage === "backtest") {
    pushUniqueText(aiAvailableSteps, `AI 可自动批量回测 ${validationPlan.runnableCount} 个策略草案。`);
  } else if (decision.stage === "validating") {
    pushUniqueText(aiAvailableSteps, "AI 可继续读取回测进度并更新验证评分。");
  } else if (decision.stage === "paper_candidate") {
    pushUniqueText(aiAvailableSteps, "AI 可生成 paper 观察计划和预填策略参数。");
  } else if (decision.stage === "testnet_candidate") {
    pushUniqueText(aiAvailableSteps, "AI 可打开策略预填并准备测试网前检查。");
  } else if (decision.primaryAction?.kind === "open_link" && decision.primaryHref) {
    pushUniqueText(aiAvailableSteps, "AI 可打开相关页面，帮助你复核下一步证据。");
  }
  if (aiAvailableSteps.length === 0) {
    pushUniqueText(aiAvailableSteps, "AI 当前只能继续观察和整理证据，不能推进执行。");
  }

  pushUniqueText(humanRequiredSteps, "真实交易需要人工确认、组合限额和交易闸门。");
  if (humanFactors.length > 0 || decision.stage === "sentiment_review") {
    pushUniqueText(humanRequiredSteps, "人性 / 舆论风险需要人工复核后才能采用 paper 候选。");
  }
  if (notes.length > 0) {
    pushUniqueText(humanRequiredSteps, "数据上下文缺口需要确认或补齐后再验证。");
  }
  if (!paperWatchEvidenceComplete) {
    pushUniqueText(humanRequiredSteps, "paper 观察必须人工复盘完成后才允许进入测试网候选。");
  }
  if (requestedMainnet) {
    pushUniqueText(humanRequiredSteps, "主网 mainnet token gate、kill switch 和组合限额必须人工确认。");
  }

  return {
    stage: decision.stage,
    title: decision.title,
    tone: decision.tone,
    progress,
    maxExecutionMode,
    canAutoExecute: false,
    summary: decision.summary,
    metrics: [
      {
        label: "上下文",
        value: `${Number(context.newsCount || 0)}/${Number(context.macroCount || 0)}/${Number(context.onchainCount || 0)}`,
        hint: "新闻/宏观/链上",
      },
      {
        label: "验证",
        value:
          runningRuns > 0
            ? `${runningRuns} 进行中`
            : `${completedRuns} 完成`,
        hint: ranked[0]?.recommendation || "等待回测",
      },
      {
        label: "观察",
        value: `${watchSignals.length} 信号`,
        hint: humanFactors.length > 0 ? `${humanFactors.length} 个人性因子` : "暂无行为因子",
      },
    ],
    blockers: blockers.length > 0 ? blockers : ["等待下一步人工确认"],
    safetyGates: safetyGates.length > 0 ? safetyGates : ["回测、paper 观察和交易闸门"],
    nextActions: safeStringList(decision.nextActions),
    completedSteps,
    aiAvailableSteps,
    humanRequiredSteps,
    primaryHref: decision.primaryHref,
    primaryAction,
  };
}

function signalItemsBySource(signals, sources) {
  const sourceSet = new Set(sources);
  return Array.isArray(signals)
    ? signals.filter((item) => sourceSet.has(String(item?.source || "").toLowerCase()))
    : [];
}

function sentimentTemperature({ humanFactors, watchSignals, context }) {
  const joined = [...humanFactors, ...watchSignals.map((item) => item?.signal || "")]
    .join(" ")
    .toLowerCase();
  const hotWords = ["fomo", "贪婪", "过热", "拥挤", "追涨", "热度"];
  const coldWords = ["恐慌", "panic", "抛售", "冷却", "低迷"];
  const hot = hotWords.some((word) => joined.includes(word.toLowerCase()));
  const cold = coldWords.some((word) => joined.includes(word.toLowerCase()));
  if (hot) return { label: "偏热", stage: "heated" };
  if (cold) return { label: "偏冷", stage: "fearful" };
  if (Number(context?.newsCount || 0) > 0 || watchSignals.length > 0) {
    return { label: "中性", stage: "balanced" };
  }
  return { label: "未知", stage: "data_gap" };
}

export function aiSentimentCompassFromAnalysis(analysis = null) {
  const context = analysis?.context || {};
  const humanFactors = safeStringList(analysis?.humanFactors);
  const watchSignals = Array.isArray(analysis?.watchSignals) ? analysis.watchSignals : [];
  const notes = safeStringList(context.notes);
  const contextCounts = {
    news: Number(context.newsCount || 0),
    macro: Number(context.macroCount || 0),
    onchain: Number(context.onchainCount || 0),
  };
  const hasContext = contextCounts.news + contextCounts.macro + contextCounts.onchain > 0;
  if (!analysis || (!hasContext && notes.length > 0)) {
    return {
      stage: "data_gap",
      title: "先补齐风向证据",
      tone: "warning",
      summary: "上下文不足，AI 风向判断只能作为弱信号，不能用来推进执行。",
      metrics: [
        { label: "舆论温度", value: "未知", hint: "等待新闻/舆情数据" },
        { label: "人性偏差", value: humanFactors.length, hint: "AI 已识别数量" },
        { label: "市场上下文", value: `${contextCounts.news}/${contextCounts.macro}/${contextCounts.onchain}`, hint: "新闻/宏观/链上" },
      ],
      risks: notes.length > 0 ? notes.slice(0, 3) : ["缺少新闻、宏观或链上上下文"],
      opportunities: ["等待下一次 AI 雷达扫描"],
      actions: ["先补齐新闻、宏观或链上数据，再让 AI 重新扫描。"],
    };
  }

  const temperature = sentimentTemperature({ humanFactors, watchSignals, context });
  const newsSignals = signalItemsBySource(watchSignals, ["news", "human"]);
  const marketSignals = signalItemsBySource(watchSignals, ["macro", "onchain", "price"]);
  const riskRows = [
    ...humanFactors,
    ...marketSignals.map((item) => String(item?.interpretation || item?.signal || "").trim()),
  ].filter(Boolean);
  const opportunityRows = newsSignals
    .map((item) => String(item?.signal || item?.interpretation || "").trim())
    .filter(Boolean);
  const actionRows = watchSignals
    .map((item) => String(item?.action || "").trim())
    .filter(Boolean);
  const stage =
    riskRows.length >= 3 || temperature.stage === "heated"
      ? "heated"
      : temperature.stage === "fearful"
        ? "fearful"
        : "balanced";
  const tone = stage === "balanced" ? "success" : "warning";

  return {
    stage,
    title:
      stage === "heated"
        ? "舆论与人性偏热"
        : stage === "fearful"
          ? "市场情绪偏冷"
          : "风向相对均衡",
    tone,
    summary:
      stage === "heated"
        ? "AI 发现追涨、拥挤或叙事过热迹象，适合先观察和 paper，不适合直接放大执行。"
        : stage === "fearful"
          ? "AI 发现恐慌或卖压信号，机会需要等待确认，先降低仓位假设。"
          : "AI 未发现明显单边情绪压力，继续以回测和 paper 观察验证。",
    metrics: [
      { label: "舆论温度", value: temperature.label, hint: analysis?.marketRead || "AI 市场判断" },
      { label: "人性偏差", value: humanFactors.length, hint: humanFactors[0] || "暂无明显偏差" },
      { label: "市场上下文", value: `${contextCounts.news}/${contextCounts.macro}/${contextCounts.onchain}`, hint: "新闻/宏观/链上" },
    ],
    risks: riskRows.length > 0 ? riskRows.slice(0, 4) : ["未识别到明确人性或市场压力"],
    opportunities:
      opportunityRows.length > 0
        ? opportunityRows.slice(0, 4)
        : ["等待观察信号与价格结构共振"],
    actions:
      actionRows.length > 0
        ? actionRows.slice(0, 4)
        : ["继续观察，不因单一叙事直接推进执行。"],
  };
}

function watchtowerSignal({ id, label, source, severity = "watch", detail, action }) {
  return {
    id,
    label: String(label || source || "观察信号").trim(),
    source: String(source || "market").trim(),
    severity,
    detail: String(detail || "等待 AI 继续观察。").trim(),
    action: String(action || "继续观察，不直接推进执行。").trim(),
  };
}

function watchtowerContextSignalsFromAnalysis(analysis, severity = "watch") {
  const highlights = Array.isArray(analysis?.context?.marketContextHighlights)
    ? analysis.context.marketContextHighlights
    : [];
  return highlights.slice(0, 6).map((highlight, index) =>
    watchtowerSignal({
      id: `context_${highlight?.id || index}`,
      label: highlight?.label || highlight?.source || `上下文证据 ${index + 1}`,
      source: highlight?.source || "context",
      severity,
      detail: highlight?.detail || highlight?.label || "AI 已读取该上下文证据。",
      action: "与价格结构、回测和 paper 表现共同复核，不单独触发执行。",
    }),
  );
}

function watchtowerSignalsFromAnalysis(analysis, severity = "watch") {
  const signals = watchtowerContextSignalsFromAnalysis(analysis, severity);
  const watchSignals = Array.isArray(analysis?.watchSignals) ? analysis.watchSignals : [];
  watchSignals.forEach((signal, index) => {
    const label = String(signal?.signal || signal?.source || `观察信号 ${index + 1}`).trim();
    if (!label) return;
    signals.push(
      watchtowerSignal({
        id: `watch_${index}`,
        label,
        source: signal?.source || "market",
        severity,
        detail: signal?.interpretation || label,
        action: signal?.action || "纳入今日观察，不单独触发执行。",
      }),
    );
  });

  safeStringList(analysis?.humanFactors).forEach((factor, index) => {
    signals.push(
      watchtowerSignal({
        id: `human_${index}`,
        label: factor,
        source: "human",
        severity: severity === "high" ? "high" : "medium",
        detail: factor,
        action: "出现该行为偏差时暂停采用或降低 paper 仓位。",
      }),
    );
  });

  return signals;
}

function watchtowerBaseStopRules() {
  return [
    "没有完成上下文、回测和风向复核前，不进入交易。",
    "任何主网动作都必须等待独立闸门和人工确认。",
  ];
}

function watchtowerMetrics({ context, ranked, candidate, sentiment }) {
  const contextValue = `${Number(context?.newsCount || 0)}/${Number(context?.macroCount || 0)}/${Number(context?.onchainCount || 0)}`;
  return [
    {
      label: "观察重点",
      value: candidate ? "paper 候选" : ranked.some((row) => row.score === null) ? "回测进度" : "今日扫描",
      hint: sentiment?.title || "AI 观察状态",
    },
    {
      label: "上下文",
      value: contextValue,
      hint: "新闻/宏观/链上",
    },
    {
      label: "验证",
      value:
        ranked.length === 0
          ? "未验证"
          : ranked.some((row) => row.score === null)
            ? "进行中"
            : ranked[0]?.recommendation || "已完成",
      hint: ranked[0]?.strategyId || ranked[0]?.runId || "等待证据",
    },
  ];
}

export function aiMarketWatchtowerFromState({
  analysis = null,
  persistedActions = [],
  validationRuns = [],
  dailyRadarStatus = null,
} = {}) {
  if (!analysis) {
    return {
      stage: "scan",
      tone: "warning",
      title: "AI 市场观察塔待启动",
      summary:
        dailyRadarStatus?.summary ||
        "先让 AI 扫描市场、舆论、宏观、链上和人性偏差，形成今日观察清单。",
      primaryAction:
        dailyRadarStatus?.primaryAction || { kind: "scan_today", label: "今日扫描" },
      metrics: [
        { label: "观察重点", value: "今日扫描", hint: "等待 AI 建立观察面" },
        { label: "信号", value: 3, hint: "新闻/宏观/链上" },
        { label: "执行", value: "观察", hint: "不触发交易" },
      ],
      signals: [
        watchtowerSignal({
          id: "idle_news",
          label: "新闻 / 舆论风向",
          source: "news",
          severity: "watch",
          detail: "等待 AI 扫描热点叙事、拥挤度和突发风险。",
          action: "先做今日扫描。",
        }),
        watchtowerSignal({
          id: "idle_macro",
          label: "宏观压力",
          source: "macro",
          severity: "watch",
          detail: "等待 AI 汇总利率、流动性和风险偏好变化。",
          action: "先做今日扫描。",
        }),
        watchtowerSignal({
          id: "idle_onchain",
          label: "链上变化",
          source: "onchain",
          severity: "watch",
          detail: "等待 AI 检查交易所流入、链上活跃度或稳定币变化。",
          action: "先做今日扫描。",
        }),
      ],
      stopRules: watchtowerBaseStopRules(),
      nextChecks: ["输入赚钱目标。", "运行今日 AI 扫描。", "等待 AI 生成策略蓝图和验证计划。"],
    };
  }

  const context = analysis?.context || {};
  const notes = safeStringList(context.notes);
  const contextCount =
    Number(context.newsCount || 0) + Number(context.macroCount || 0) + Number(context.onchainCount || 0);
  const ranked = rankBacktestValidation(validationRuns);
  const candidate = paperCandidateFromValidation(analysis, validationRuns);
  const sentiment = aiSentimentCompassFromAnalysis(analysis);
  const sentimentReview = persistedActionById(persistedActions, "sentiment_review");
  const decision = nextAIGoalDecision(analysis, persistedActions, validationRuns);
  const baseStopRules = watchtowerBaseStopRules();
  const metrics = watchtowerMetrics({ context, ranked, candidate, sentiment });

  if (notes.length > 0 || contextCount === 0) {
    const signals =
      notes.length > 0
        ? notes.slice(0, 5).map((note, index) =>
            watchtowerSignal({
              id: `gap_${index}`,
              label: "数据上下文缺口",
              source: "context",
              severity: "high",
              detail: note,
              action: "刷新 AI 雷达或补齐数据源后再推进。",
            }),
          )
        : [
            watchtowerSignal({
              id: "gap_empty_context",
              label: "缺少市场上下文",
              source: "context",
              severity: "high",
              detail: "新闻、宏观和链上上下文均为空。",
              action: "先刷新 AI 雷达。",
            }),
          ];
    return {
      stage: "data_gap",
      tone: "warning",
      title: "先补齐 AI 观察证据",
      summary: "当前市场 / 舆论 / 链上证据不足，AI 只能观察，不能采用候选或推进执行。",
      primaryAction: { kind: "rescan_today", label: "刷新 AI 雷达" },
      metrics,
      signals,
      stopRules: ["数据缺口未补齐前，不采用任何 paper 候选。", ...baseStopRules],
      nextChecks: ["重新扫描今日市场上下文。", "确认新闻、宏观或链上数据已回填。", "刷新后再比较 AI 蓝图。"],
    };
  }

  const running = ranked.filter((row) => row.score === null);
  if (running.length > 0) {
    return {
      stage: "validating",
      tone: "warning",
      title: "观察回测验证进度",
      summary: `${running.length} 个 AI 草案仍在验证中，先等待结果，不提前采用 paper 候选。`,
      primaryHref: running[0]?.runId ? `/backtests/${encodeURIComponent(running[0].runId)}` : undefined,
      primaryAction: running[0]?.runId ? { kind: "open_link", label: "查看回测" } : undefined,
      metrics,
      signals: [
        watchtowerSignal({
          id: "validation_running",
          label: "回测仍在运行",
          source: "validation",
          severity: "medium",
          detail: running.slice(0, 3).map((row) => row.strategyId || row.runId).join("、"),
          action: "等待回测终态后再判断 paper 候选。",
        }),
        ...watchtowerSignalsFromAnalysis(analysis, "watch"),
      ].slice(0, 6),
      stopRules: ["回测未完成前，不采用 paper 候选。", ...baseStopRules],
      nextChecks: ["等待回测进度自动刷新。", "完成后比较收益、回撤、夏普和交易次数。"],
    };
  }

  const needsSentimentReview =
    candidate && sentiment.stage !== "balanced" && !sentimentReviewCompleted(sentimentReview);
  if (needsSentimentReview) {
    return {
      stage: "sentiment_review",
      tone: "warning",
      title: "先盯紧舆论和人性风险",
      summary: `${candidate.strategyId} 已达到 paper 候选，但 ${sentiment.title}；采用前先复核风向、拥挤度和行为偏差。`,
      primaryHref: "/data-explorer/news",
      primaryAction: { kind: "open_link", label: "打开风向复核" },
      metrics,
      signals: [
        ...watchtowerSignalsFromAnalysis(analysis, "high"),
        ...sentiment.risks.map((risk, index) =>
          watchtowerSignal({
            id: `sentiment_${index}`,
            label: risk,
            source: "sentiment",
            severity: "high",
            detail: risk,
            action: "复核后再决定是否降低 paper 仓位。",
          }),
        ),
      ].slice(0, 6),
      stopRules: ["风向 / 人性复核未完成前，不采用 paper 候选。", ...baseStopRules],
      nextChecks: ["打开新闻和舆情证据。", "确认是否降低 paper 仓位。", "人工标记风向复核完成后再采用。"],
    };
  }

  if (candidate) {
    const safetyGates = safeStringList(analysis?.execution?.safetyGates);
    return {
      stage: "paper_watch",
      tone: "success",
      title: "AI paper 观察塔",
      summary: `${candidate.strategyId} 是当前 paper 候选，继续盯市场信号、回撤、舆论变化和执行摩擦。`,
      primaryHref: candidate.backtestHref,
      primaryAction: { kind: "accept_paper_candidate", label: "采用 paper 候选" },
      metrics,
      signals: watchtowerSignalsFromAnalysis(analysis, "watch").slice(0, 6),
      stopRules: [
        `paper 回撤超过 ${formatPercentValue(paperDrawdownLimit(candidate))} 时暂停观察。`,
        ...safetyGates.slice(0, 3).map((gate) => `安全闸门未满足：${gate}。`),
        ...baseStopRules,
      ].slice(0, 6),
      nextChecks: ["记录 24-72 小时 paper 表现。", "复核新增新闻、宏观、链上和舆情变化。", "未完成观察前不进入测试网。"],
    };
  }

  return {
    stage: decision.stage,
    tone: decision.tone,
    title: "AI 观察路径",
    summary: `${decision.summary} 观察塔会继续把市场、舆论和验证结果作为执行前证据。`,
    primaryHref: decision.primaryHref,
    primaryAction: decision.primaryAction,
    metrics,
    signals: watchtowerSignalsFromAnalysis(analysis, "watch").slice(0, 6),
    stopRules: baseStopRules,
    nextChecks:
      decision.nextActions?.length > 0
        ? decision.nextActions.slice(0, 4)
        : ["继续观察 AI 给出的市场信号。", "补充验证证据后再推进。"],
  };
}

export function aiDecisionJournalFromState({
  analysis = null,
  persistedActions = [],
  validationRuns = [],
  runs = [],
} = {}) {
  const entries = [];
  if (!analysis) {
    const latest = Array.isArray(runs) ? runs[0] : null;
    if (!latest) {
      return [
        {
          kind: "idle",
          tone: "warning",
          title: "等待 AI 运行",
          detail: "还没有可复盘的 AI 目标运行。",
        },
      ];
    }
    return [
      {
        kind: "run",
        tone: "default",
        title: "最近 AI 运行",
        detail: `${latest.goal || "未命名目标"} · ${safeStringList(latest.symbols).join(", ") || "auto"} · ${Number(latest.strategyDraftCount || 0)} 个蓝图`,
        at: latest.createdAt,
      },
    ];
  }

  const context = analysis?.context || {};
  const notes = safeStringList(context.notes);
  const drafts = Array.isArray(analysis?.strategyDrafts) ? analysis.strategyDrafts : [];
  entries.push({
    kind: "analysis",
    tone: analysis?.ai?.status === "fallback" ? "warning" : "success",
    title: "AI 已生成策略蓝图",
    detail: `${String(analysis?.summary || "已完成目标分析").slice(0, 120)} · ${drafts.length} 个蓝图`,
    at: analysis?.createdAt,
  });

  entries.push({
    kind: "context",
    tone: notes.length > 0 ? "warning" : "success",
    title: notes.length > 0 ? "上下文存在缺口" : "上下文已汇总",
    detail:
      notes.length > 0
        ? notes.slice(0, 2).join("；")
        : `新闻/宏观/链上 ${Number(context.newsCount || 0)}/${Number(context.macroCount || 0)}/${Number(context.onchainCount || 0)}`,
  });

  const ranked = rankBacktestValidation(validationRuns);
  if (ranked.length === 0) {
    entries.push({
      kind: "validation",
      tone: "warning",
      title: "等待安全验证",
      detail: "还没有回测证据，不能进入 paper 或测试网。",
    });
  } else {
    const best = ranked[0];
    const score = best.score === null ? "—" : best.score;
    entries.push({
      kind: "validation",
      tone: best.tone,
      title: best.score === null ? "回测验证进行中" : "回测验证已读取",
      detail: `${best.strategyId || best.runId}: ${best.recommendation}，评分 ${score}，收益 ${formatPercentValue(best.totalReturn)}，回撤 ${formatPercentValue(best.maxDrawdown)}`,
      href: best.runId ? `/backtests/${encodeURIComponent(best.runId)}` : undefined,
    });
  }

  const paperWatch = persistedActionById(persistedActions, "paper_watch");
  if (paperWatch) {
    const paperWatchEvidenceComplete =
      paperWatch.status === "done" && paperWatchCompletionHasEvidence(paperWatch);
    const paperWatchMissingEvidence = paperWatch.status === "done" && !paperWatchEvidenceComplete;
    entries.push({
      kind: "paper_watch",
      tone: paperWatchEvidenceComplete ? "success" : "warning",
      title: paperWatchMissingEvidence
        ? "补齐 Paper 复盘证据"
        : paperWatchEvidenceComplete
          ? "Paper 观察已完成"
          : "Paper 观察进行中",
      detail: paperWatchMissingEvidence
        ? "paper 已标记完成，但复盘证据不足；补齐市场风向、舆论、人性偏差和执行摩擦。"
        : paperWatch.note || "按 AI 观察计划跟踪 24-72 小时。",
      href: paperWatch.href || undefined,
      at: paperWatch.updatedAt,
    });
  }

  const requestedMode = String(analysis?.execution?.mode || "observe").toLowerCase();
  const requestedMainnet = requestedMode === "mainnet";
  entries.push({
    kind: "gate",
    tone: requestedMainnet ? "warning" : "default",
    title: requestedMainnet ? "主网被安全闸门拦截" : "执行闸门待确认",
    detail: requestedMainnet
      ? "AI 不能直接推进主网；仍需 mainnet token gate、组合限额和人工确认。"
      : `当前最高按 ${requestedMode || "observe"} 路径推进，真实交易前仍需人工闸门。`,
  });

  return entries.slice(0, 8);
}

export function aiDailyMissionFromState({
  analysis = null,
  persistedActions = [],
  validationRuns = [],
  runs = [],
  dailyRadarStatus = null,
  providerGate = null,
  now = new Date(),
} = {}) {
  if (!analysis) {
    const providerGateStage = String(providerGate?.stage || "").toLowerCase();
    if (providerGateStage === "blocked" || providerGateStage === "loading") {
      const loading = providerGateStage === "loading";
      const href = String(providerGate?.primaryHref || "/settings/ai").trim() || "/settings/ai";
      const label =
        String(providerGate?.primaryAction?.label || "").trim() ||
        (loading ? "查看 AI 配置" : "配置真实 AI");
      const summary =
        String(providerGate?.summary || "").trim() ||
        (loading
          ? "正在确认真实 AI provider 状态，确认前不会启动今日雷达。"
          : "真实 AI provider 还不可用，先完成 API key 配置和连接测试。");

      return {
        focus: loading ? "provider_loading" : "provider_blocked",
        title: "今日 AI 任务",
        tone: "warning",
        summary,
        tasks: [
          {
            id: loading ? "provider_loading" : "provider_setup",
            title: loading ? "确认 AI provider 状态" : label,
            detail: loading
              ? "等待 AI provider 状态返回；如果长时间未返回，打开 AI 设置页检查配置。"
              : summary,
            priority: "high",
            status: loading ? "pending" : "blocked",
            tone: "warning",
            actionKind: "open_link",
            href,
          },
        ],
      };
    }

    const followupQueue = aiRunFollowupQueueFromRuns(runs, now, validationRuns);
    const followupAction =
      followupQueue.stage === "needs_attention" ? followupQueue.primaryAction : null;
    if (followupAction?.runId) {
      const runId = String(followupAction.runId || "").trim();
      const item =
        followupQueue.items.find((entry) => entry.runId === runId) ??
        followupQueue.items[0] ??
        null;
      const actionKind =
        followupAction.kind === "validate_run"
          ? "validate_run"
          : followupAction.kind === "refresh_run"
            ? "refresh_run"
            : followupAction.kind === "open_link"
              ? "open_link"
              : followupAction.kind === "open_run"
                ? "open_run"
                : followupAction.kind === "analyze_and_validate"
                  ? "analyze_and_validate"
                  : "open_today_run";
      return {
        focus: actionKind,
        title: "今日 AI 任务",
        tone: item?.tone || followupQueue.tone || "warning",
        summary: followupQueue.summary,
        tasks: [
          {
            id: `followup_${runId}`,
            title: followupAction.label || item?.title || "打开 AI 运行",
            detail: item?.detail || followupQueue.summary,
            priority: "high",
            status: "ready",
            tone: item?.tone || "warning",
            actionKind,
            runId,
            href: followupAction.href || item?.href || aiMoneyRunHref(runId),
            ...(followupAction.proposedFormState
              ? { proposedFormState: followupAction.proposedFormState }
              : {}),
          },
        ],
      };
    }
    const latest = Array.isArray(runs) ? runs[0] : null;
    const autonomousProposal = aiAutonomousGoalProposalFromState({ runs, dailyRadarStatus });
    const actionKind = String(dailyRadarStatus?.primaryAction?.kind || "scan_today");
    const label =
      actionKind === "scan_today" || actionKind === "rescan_today"
        ? autonomousProposal.title
        : String(dailyRadarStatus?.primaryAction?.label || "今日扫描");
    return {
      focus: actionKind,
      title: "今日 AI 任务",
      tone: "warning",
      summary: latest
        ? autonomousProposal.summary
        : "先让 AI 自动补全赚钱目标，扫描今日市场、舆论、宏观、链上和人性偏差，再进入验证。",
      tasks: [
        {
          id: "daily_scan",
          title: label,
          detail: autonomousProposal.proposedFormState.goal,
          priority: "high",
          status: "ready",
          tone: "warning",
          actionKind: actionKind === "open_today_run" ? "open_today_run" : actionKind,
          proposedFormState: autonomousProposal.proposedFormState,
          href:
            actionKind === "open_today_run" && dailyRadarStatus?.run?.id
              ? aiMoneyRunHref(dailyRadarStatus.run.id)
              : undefined,
        },
      ],
    };
  }

  const decision = nextAIGoalDecision(analysis, persistedActions, validationRuns);
  const candidate = paperCandidateFromValidation(analysis, validationRuns);
  const notes = safeStringList(analysis?.context?.notes);
  const watchSignals = Array.isArray(analysis?.watchSignals) ? analysis.watchSignals : [];
  const strategyAction = persistedActionById(persistedActions, "strategy");
  const tasks = [];

  if (notes.length > 0) {
    tasks.push({
      id: "fix_context",
      title: "补齐数据上下文",
      detail: notes.slice(0, 2).join("；"),
      priority: "high",
      status: "blocked",
      tone: "warning",
      href: "/data-explorer/news",
    });
  }

  if (decision.stage === "sentiment_review") {
    tasks.push({
      id: "sentiment_review",
      title: "复核风向 / 人性",
      detail: safeStringList(decision.reasons).slice(0, 3).join("；") || decision.summary,
      priority: "high",
      status: "manual",
      tone: "warning",
      actionKind: "sentiment_review",
      href: "/data-explorer/news",
    });
  }

  if (decision.primaryAction?.kind === "run_all_backtests") {
    tasks.push({
      id: "run_validation",
      title: decision.primaryAction.label,
      detail: "批量回测 AI 生成的可交易草案，先看收益、回撤、夏普和交易次数。",
      priority: "high",
      status: "ready",
      tone: "warning",
      actionKind: "run_all_backtests",
    });
  } else if (decision.primaryAction?.kind === "accept_paper_candidate" && candidate) {
    const paperAction = paperCandidatePrimaryActionForState(
      decision.primaryAction,
      persistedActions,
    );
    tasks.push({
      id: paperAction.kind,
      title: paperAction.label,
      detail: paperAdoptionDetailFromCandidate(analysis, candidate),
      priority: "high",
      status: "ready",
      tone: "success",
      actionKind: paperAction.kind,
      href: candidate.backtestHref,
    });
  } else if (decision.primaryAction?.kind === "open_link" && decision.primaryHref) {
    tasks.push({
      id: "open_next_link",
      title: decision.primaryAction.label,
      detail: decision.summary,
      priority: "high",
      status: "ready",
      tone: decision.tone,
      actionKind: "open_link",
      href: decision.primaryHref,
    });
  } else if (decision.primaryAction?.kind === "analyze_and_validate") {
    const proposedFormState =
      decision.stage === "redesign"
        ? redesignFormStateFromWeakValidation(
            analysis,
            rankBacktestValidation(validationRuns),
            decision,
          )
        : undefined;
    tasks.push({
      id: "redesign_blueprint",
      title: decision.primaryAction.label,
      detail: safeStringList(decision.reasons).slice(0, 3).join("；") || decision.summary,
      priority: "high",
      status: "ready",
      tone: decision.tone,
      actionKind: "analyze_and_validate",
      ...(proposedFormState ? { proposedFormState } : {}),
    });
  }

  if (decision.stage === "paper_watch") {
    if (
      String(strategyAction?.status || "").toLowerCase() === "ready" &&
      String(strategyAction?.href || "").trim()
    ) {
      tasks.push({
        id: "save_paper_strategy",
        title: "保存 paper 策略草案",
        detail:
          String(strategyAction?.note || "").trim() ||
          "先打开 AI 预填策略，保存为 paper 观察对象。",
        priority: "high",
        status: "ready",
        tone: "success",
        actionKind: "open_link",
        href: strategyAction.href,
      });
    }
    tasks.push({
      id: "paper_watch",
      title: decision.title,
      detail: safeStringList(decision.reasons).slice(0, 2).join("；") || decision.summary,
      priority: "high",
      status: "manual",
      tone: decision.tone,
      actionKind: "paper_watch",
      href: decision.primaryHref,
    });
  }

  if (watchSignals.length > 0) {
    tasks.push({
      id: "watch_signals",
      title: "复核观察信号",
      detail: watchSignals
        .slice(0, 3)
        .map((item) => String(item?.signal || "").trim())
        .filter(Boolean)
        .join("；"),
      priority: "medium",
      status: "manual",
      tone: "default",
      href: "/data-explorer/news",
    });
  }

  tasks.push({
    id: "review_gates",
    title: "复核安全闸门",
    detail: safeStringList(analysis?.execution?.safetyGates).slice(0, 3).join("；") || "回测、paper 观察、组合限额和人工确认。",
    priority: "medium",
    status: "manual",
    tone: "default",
    href: "/settings/trading",
  });

  return {
    focus: decision.stage,
    title: "今日 AI 任务",
    tone: decision.tone,
    summary: decision.summary,
    tasks: tasks.slice(0, 5),
  };
}

function actionableMissionTask(tasks) {
  if (!Array.isArray(tasks)) return null;
  return (
    tasks.find((task) => ["ready", "manual", "blocked"].includes(String(task?.status || ""))) ??
    tasks[0] ??
    null
  );
}

function nowActionOwner(actionKind) {
  switch (String(actionKind || "")) {
    case "analyze_and_validate":
    case "scan_today":
    case "rescan_today":
    case "open_today_run":
    case "open_run":
    case "validate_run":
    case "refresh_run":
    case "run_all_backtests":
    case "accept_paper_candidate":
    case "save_and_accept_paper_candidate":
      return "AI";
    default:
      return "你";
  }
}

function nowActionPrimaryFromTask(task, dailyRadarStatus, candidate) {
  const actionKind = String(task?.actionKind || "");
  const label = String(task?.title || task?.label || "打开下一步");
  if (actionKind === "open_today_run" && dailyRadarStatus?.run?.id) {
    return {
      primaryAction: { kind: "open_link", label },
      primaryHref: aiMoneyRunHref(dailyRadarStatus.run.id),
    };
  }
  if (actionKind === "open_link") {
    return {
      primaryAction: { kind: "open_link", label },
      primaryHref: task?.href,
    };
  }
  if (actionKind === "open_run") {
    return {
      primaryAction: { kind: "open_link", label },
      primaryHref: task?.href || (task?.runId ? aiMoneyRunHref(task.runId) : undefined),
    };
  }
  if (actionKind === "validate_run" || actionKind === "refresh_run") {
    return {
      primaryAction: {
        kind: actionKind,
        label,
        ...(task?.runId ? { runId: task.runId } : {}),
        ...(task?.href ? { href: task.href } : {}),
      },
      primaryHref: task?.href,
    };
  }
  if (actionKind === "sentiment_review") {
    return {
      primaryAction: {
        kind: "complete_manual_action",
        label: "完成风向 / 人性复核",
        actionId: "sentiment_review",
      },
      primaryHref: task?.href || "/data-explorer/news",
    };
  }
  if (actionKind === "paper_watch") {
    return {
      primaryAction: {
        kind: "complete_manual_action",
        label: "完成 paper 复盘",
        actionId: "paper_watch",
      },
      primaryHref: task?.href,
    };
  }
  if (actionKind === "accept_paper_candidate" || actionKind === "save_and_accept_paper_candidate") {
    return {
      primaryAction: { kind: actionKind, label },
      primaryHref: candidate?.backtestHref || task?.href,
    };
  }
  if (actionKind === "run_all_backtests") {
    return {
      primaryAction: { kind: "run_all_backtests", label },
      primaryHref: undefined,
    };
  }
  if (actionKind === "analyze_and_validate") {
    return {
      primaryAction: {
        kind: "analyze_and_validate",
        label,
        ...(task?.runId ? { runId: task.runId } : {}),
        ...(task?.href ? { href: task.href } : {}),
        ...(task?.proposedFormState ? { proposedFormState: task.proposedFormState } : {}),
      },
      primaryHref: task?.href,
    };
  }
  return {
    primaryAction: {
      kind: actionKind === "rescan_today" ? "rescan_today" : "scan_today",
      label,
    },
    primaryHref: undefined,
  };
}

export function dailyMissionTaskCommandFromTask(task) {
  if (!task || typeof task !== "object") return null;
  const actionKind = String(task.actionKind || "").trim();
  const label = String(task.title || task.label || "执行").trim() || "执行";
  const href = String(task.href || "").trim();
  const runId = String(task.runId || "").trim();
  const base = {
    kind: actionKind,
    label,
    ...(runId ? { runId } : {}),
    ...(href ? { href } : {}),
    ...(task.proposedFormState ? { proposedFormState: task.proposedFormState } : {}),
  };

  switch (actionKind) {
    case "scan_today":
    case "rescan_today":
    case "analyze_and_validate":
    case "run_all_backtests":
    case "accept_paper_candidate":
    case "save_and_accept_paper_candidate":
    case "validate_run":
    case "refresh_run":
    case "open_link":
    case "open_run":
    case "open_today_run":
      return base;
    case "sentiment_review":
      return {
        kind: "complete_manual_action",
        label,
        actionId: "sentiment_review",
        ...(href ? { href } : {}),
      };
    case "paper_watch":
      return {
        kind: "complete_manual_action",
        label,
        actionId: "paper_watch",
        ...(href ? { href } : {}),
      };
    default:
      return href ? { kind: "open_link", label, href } : null;
  }
}

export function aiNowActionFromState({
  analysis = null,
  persistedActions = [],
  validationRuns = [],
  runs = [],
  dailyRadarStatus = null,
  providerGate = null,
  now = new Date(),
} = {}) {
  const providerGateStage = String(providerGate?.stage || "").toLowerCase();
  if (!analysis && (providerGateStage === "blocked" || providerGateStage === "loading")) {
    const loading = providerGateStage === "loading";
    const primaryHref = String(providerGate?.primaryHref || "/settings/ai").trim() || "/settings/ai";
    const primaryLabel =
      String(providerGate?.primaryAction?.label || "").trim() ||
      (loading ? "查看 AI 配置" : "配置真实 AI");
    const summary =
      String(providerGate?.summary || "").trim() ||
      (loading
        ? "正在确认真实 AI provider 状态，确认前不会启动今日雷达。"
        : "真实 AI provider 还不可用，先完成 API key 配置和连接测试。");
    return {
      stage: loading ? "provider_loading" : "provider_blocked",
      tone: "warning",
      owner: "你",
      title: loading ? "正在确认 AI provider" : "先配置真实 AI",
      summary,
      primaryHref,
      primaryAction: {
        kind: "open_link",
        label: primaryLabel,
      },
      guardrail: "确认真实 AI provider 前，不会启动 fallback 扫描、自动验证或任何交易动作。",
      why: [
        loading ? "AI provider 状态仍在读取。" : "AI provider 当前不可用。",
        "先确认真实 AI，再让系统读取市场、舆论、宏观和链上状态。",
      ],
      handoff: "你完成 AI provider 配置或等待状态变为 ready 后，AI 才能开始自动生成目标。",
      nextActions: [
        loading ? "等待 provider 状态返回。" : "补齐 provider API key。",
        "在 AI 设置页完成一次连接测试。",
        "回到 AI Money 后重新扫描今日机会。",
      ],
    };
  }
  const mission = aiDailyMissionFromState({
    analysis,
    persistedActions,
    validationRuns,
    runs,
    dailyRadarStatus,
    providerGate,
    now,
  });
  const candidate = paperCandidateFromValidation(analysis, validationRuns);

  if (!analysis) {
    const task = actionableMissionTask(mission.tasks);
    const { primaryAction, primaryHref } = nowActionPrimaryFromTask(task, dailyRadarStatus, candidate);
    return {
      stage: primaryAction?.kind || "scan_today",
      tone: task?.tone || mission.tone || "warning",
      owner: "AI",
      title: "现在让 AI 自动生成目标",
      summary: mission.summary,
      primaryAction,
      primaryHref,
      proposedFormState: task?.proposedFormState,
      scanFormState: task?.proposedFormState,
      proposalCard: task?.proposedFormState
        ? aiGoalProposalCardFromFormState(task.proposedFormState)
        : undefined,
      guardrail: "只分析市场、舆论、人性和验证路径，不会下单，也不会进入主网。",
      why: [task?.detail || "还没有当前 AI 目标分析。"].filter(Boolean),
      handoff: "AI 负责补全目标、扫描证据、生成蓝图并启动验证；你确认风险边界。",
      nextActions: [
        "自动补全赚钱目标和观察标的。",
        "生成策略蓝图后先跑回测。",
        "通过后只进入 paper 观察，不进主网。",
      ],
    };
  }

  const paperWatch = persistedActionById(persistedActions, "paper_watch");
  if (paperWatch?.status === "done" && !paperWatchCompletionHasEvidence(paperWatch)) {
    return {
      stage: "paper_review",
      tone: "warning",
      owner: "你",
      title: "补齐 paper 复盘证据",
      summary: "paper 已标记完成，但复盘证据不足；需要先补齐市场风向、舆论、人性偏差、执行摩擦和回撤表现。",
      primaryAction: {
        kind: "complete_manual_action",
        label: "补齐 paper 复盘证据",
        actionId: "paper_watch",
      },
      primaryHref: paperWatch.href || aiMoneyRunHref(analysis.id),
      guardrail: "复盘证据不足前不会进入测试网或主网。",
      why: [
        "已有 paper_watch 完成标记。",
        "完成备注没有覆盖 24-72 小时复盘证据。",
      ],
      handoff: "你补齐复盘证据后，AI 才能继续判断是否进入测试网候选。",
      nextActions: [
        "记录 24-72 小时 paper 观察窗口。",
        "补齐市场风向、舆论、人性偏差、执行摩擦和回撤表现。",
        "仍不允许直接进入主网。",
      ],
    };
  }

  const decision = nextAIGoalDecision(analysis, persistedActions, validationRuns);
  const task = actionableMissionTask(mission.tasks);
  const { primaryAction, primaryHref } = nowActionPrimaryFromTask(task, dailyRadarStatus, candidate);
  const owner = nowActionOwner(task?.actionKind || primaryAction?.kind);
  const why = [
    task?.detail,
    candidate
      ? `${candidate.strategyId} 评分 ${candidate.score}，收益 ${formatPercentValue(candidate.totalReturn)}，回撤 ${formatPercentValue(candidate.maxDrawdown)}。`
      : "",
    ...safeStringList(decision.reasons).slice(0, 2),
  ].filter(Boolean);
  const guardrail =
    primaryAction?.kind === "save_and_accept_paper_candidate"
      ? "先保存 AI 策略草案并建立 paper 观察，不开启 live，不进入测试网或主网。"
      : primaryAction?.kind === "accept_paper_candidate"
      ? "只采用为 paper 观察，不进入测试网或主网。"
      : primaryAction?.kind === "run_all_backtests"
        ? "只创建回测验证任务，不会下单。"
        : primaryAction?.kind === "complete_manual_action"
          ? "需要人工判断市场风向、舆论和人性偏差；完成后 AI 才继续 paper。"
          : "AI 只推进安全动作；真实交易仍需人工闸门。";

  return {
    stage: decision.stage,
    tone: task?.tone || decision.tone,
    owner,
    title: task?.title || decision.title,
    summary: task?.detail || decision.summary,
    primaryAction,
    primaryHref: primaryHref || decision.primaryHref,
    proposedFormState: task?.proposedFormState,
    scanFormState: task?.proposedFormState,
    proposalCard: task?.proposedFormState
      ? aiGoalProposalCardFromFormState(task.proposedFormState)
      : undefined,
    guardrail,
    why: why.slice(0, 4),
    handoff:
      owner === "AI"
        ? "AI 已准备好执行安全代办；你只需要确认是否继续。"
        : "这一步需要人工判断后，AI 才能继续推进。",
    nextActions:
      decision.nextActions?.length > 0
        ? decision.nextActions.slice(0, 3)
        : mission.tasks.slice(1, 4).map((item) => item.title),
  };
}

export function backtestRunIdsFromAction(action) {
  const ids = [];
  const add = (value) => {
    const id = String(value || "").trim();
    if (id && !ids.includes(id)) ids.push(id);
  };
  String(action?.relatedId || "")
    .split(",")
    .forEach(add);
  const href = String(action?.href || "");
  const match = href.match(/\/backtests\/([^/?#]+)/);
  if (match) add(decodeURIComponent(match[1]));
  return ids;
}

function metric(run, key, fallback = 0) {
  const n = Number(run?.metrics?.[key]);
  return Number.isFinite(n) ? n : fallback;
}

function clampScore(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function rankBacktestValidation(backtests) {
  if (!Array.isArray(backtests)) return [];
  return backtests
    .map((run) => {
      const state = Number(run?.state);
      if (state === 4) {
        return {
          runId: run?.runId || "",
          strategyId: run?.strategyId || "",
          state,
          progress: Number(run?.progress || 0),
          score: 0,
          totalReturn: metric(run, "total_return"),
          sharpe: metric(run, "sharpe"),
          maxDrawdown: Math.abs(metric(run, "max_dd")),
          nTrades: metric(run, "n_trades"),
          recommendation: "失败",
          tone: "danger",
        };
      }
      if (state !== 3) {
        return {
          runId: run?.runId || "",
          strategyId: run?.strategyId || "",
          state,
          progress: Number(run?.progress || 0),
          score: null,
          totalReturn: metric(run, "total_return"),
          sharpe: metric(run, "sharpe"),
          maxDrawdown: Math.abs(metric(run, "max_dd")),
          nTrades: metric(run, "n_trades"),
          recommendation: "验证中",
          tone: "warning",
        };
      }
      const totalReturn = metric(run, "total_return");
      const sharpe = metric(run, "sharpe");
      const maxDrawdown = Math.abs(metric(run, "max_dd"));
      const nTrades = metric(run, "n_trades");
      const tradeConfidence = Math.min(nTrades, 30) / 30;
      const score = clampScore(
        50 + totalReturn * 180 + sharpe * 12 - maxDrawdown * 160 + tradeConfidence * 8,
      );
      let recommendation = "继续观察";
      let tone = "warning";
      if (score >= 70 && totalReturn > 0 && sharpe >= 1 && maxDrawdown <= 0.2) {
        recommendation = "优先 paper";
        tone = "success";
      } else if (score < 50 || totalReturn <= 0) {
        recommendation = "淘汰";
        tone = "danger";
      }
      return {
        runId: run?.runId || "",
        strategyId: run?.strategyId || "",
        state,
        progress: Number(run?.progress || 0),
        score,
        totalReturn,
        sharpe,
        maxDrawdown,
        nTrades,
        recommendation,
        tone,
      };
    })
    .sort((a, b) => {
      if (a.score === null && b.score === null) return 0;
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      return b.score - a.score;
    });
}

export function validationRunsNeedPolling(backtests = []) {
  if (!Array.isArray(backtests) || backtests.length === 0) return false;
  return backtests.some((run) => {
    const state = Number(run?.state);
    if (!Number.isFinite(state)) return Boolean(run?.runId || run?.id);
    return state !== 3 && state !== 4;
  });
}

export function paperCandidateFromValidation(analysis, backtests) {
  const ranked = rankBacktestValidation(backtests);
  const drafts = Array.isArray(analysis?.strategyDrafts) ? analysis.strategyDrafts : [];
  for (const row of ranked) {
    if (row.recommendation !== "优先 paper") continue;
    const draft = drafts.find((d) => backtestRequestFromDraft(d)?.strategyId === row.strategyId);
    if (!draft) continue;
    return {
      draft,
      runId: row.runId,
      strategyId: row.strategyId,
      score: row.score,
      totalReturn: row.totalReturn,
      sharpe: row.sharpe,
      maxDrawdown: row.maxDrawdown,
      nTrades: row.nTrades,
      recommendation: row.recommendation,
      strategyHref: `/option?${strategyPresetSearchFromDraft(draft)}`,
      backtestHref: `/backtests/${encodeURIComponent(row.runId)}`,
    };
  }
  return null;
}

function safeStringList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function formatPercentValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0.00%";
  return `${(n * 100).toFixed(2)}%`;
}

function formatSharpeValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

function paperAdoptionDetailFromCandidate(analysis, candidate) {
  const humanSignals = safeStringList(analysis?.humanFactors).slice(0, 1);
  const watchSignals = Array.isArray(analysis?.watchSignals)
    ? analysis.watchSignals
        .map((item) => String(item?.signal || "").trim())
        .filter(Boolean)
        .slice(0, 1)
    : [];
  const observationSignals = [...new Set([...humanSignals, ...watchSignals])];
  const observation =
    observationSignals.length > 0
      ? observationSignals.join("；")
      : "市场风向、舆论、人性偏差和执行摩擦";

  return `${candidate?.strategyId || "AI 策略"} 评分 ${candidate?.score ?? "—"}，收益 ${formatPercentValue(candidate?.totalReturn)}，回撤 ${formatPercentValue(Math.abs(Number(candidate?.maxDrawdown)))}，夏普 ${formatSharpeValue(candidate?.sharpe)}。观察：${observation}。先进入 paper 观察，不进入实盘。`;
}

function paperDrawdownLimit(candidate) {
  const maxDrawdown = Math.abs(Number(candidate?.maxDrawdown));
  const base = Number.isFinite(maxDrawdown) && maxDrawdown > 0 ? maxDrawdown : 0.05;
  return Math.max(0.03, Math.min(0.25, base * 1.5));
}

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `$${Math.round(n)}`;
}

function candidateRiskCaps(candidate) {
  const caps = candidate?.draft?.riskCaps && typeof candidate.draft.riskCaps === "object"
    ? candidate.draft.riskCaps
    : {};
  const maxPositionUsd = clampNumber(caps.maxPositionUsd, 100, 1, 1000000000);
  const maxLeverage = clampNumber(caps.maxLeverage, 1, 1, 125);
  const dailyLossCapUsd = clampNumber(caps.dailyLossCapUsd, Math.max(10, maxPositionUsd * 0.05), 1, 1000000000);
  return { maxPositionUsd, maxLeverage, dailyLossCapUsd };
}

function candidateScoreDiscount(candidate) {
  const score = Number(candidate?.score || 0);
  if (score >= 80) return 0.75;
  if (score >= 70) return 0.5;
  return 0.25;
}

function sentimentDiscountFromStage(stage) {
  if (stage === "heated" || stage === "fearful") return 0.5;
  if (stage === "data_gap") return 0.25;
  return 1;
}

function capitalPlanStrategyHref(candidate, recommendedNotionalUsd) {
  const draft = candidate?.draft || {};
  const params = draft?.params && typeof draft.params === "object" ? draft.params : {};
  return `/option?${strategyPresetSearchFromDraft({
    ...draft,
    params: {
      ...params,
      orderGroupMargin: recommendedNotionalUsd,
    },
  })}`;
}

export function paperCandidateWithCapitalPlan(candidate = null, capitalPlan = null) {
  if (!candidate) return null;
  if (String(capitalPlan?.stage || "") !== "paper_sizing") return candidate;

  const recommendedNotionalUsd = Number(capitalPlan?.recommendedNotionalUsd);
  const maxDailyLossUsd = Number(capitalPlan?.maxDailyLossUsd);
  const hasNotional = Number.isFinite(recommendedNotionalUsd) && recommendedNotionalUsd > 0;
  const hasDailyLoss = Number.isFinite(maxDailyLossUsd) && maxDailyLossUsd > 0;
  if (!hasNotional && !hasDailyLoss) return candidate;

  const draft = candidate.draft && typeof candidate.draft === "object" ? candidate.draft : {};
  const params = draft.params && typeof draft.params === "object" ? { ...draft.params } : {};
  const riskCaps =
    draft.riskCaps && typeof draft.riskCaps === "object" ? { ...draft.riskCaps } : {};
  if (hasNotional) {
    const notional = Math.round(recommendedNotionalUsd);
    params.orderGroupMargin = notional;
    riskCaps.maxPositionUsd = notional;
  }
  if (hasDailyLoss) {
    riskCaps.dailyLossCapUsd = Math.round(maxDailyLossUsd);
  }

  const sizedDraft = {
    ...draft,
    params,
    riskCaps,
  };
  return {
    ...candidate,
    draft: sizedDraft,
    strategyHref: `/option?${strategyPresetSearchFromDraft(sizedDraft)}`,
  };
}

export function aiPaperAdoptionPackageFromState({
  analysis = null,
  persistedActions = [],
  validationRuns = [],
  capitalPlan = null,
  aiRunId,
} = {}) {
  const baseCandidate = paperCandidateFromValidation(analysis, validationRuns);
  if (!baseCandidate) return null;
  const sizedCandidate = paperCandidateWithCapitalPlan(baseCandidate, capitalPlan);
  const candidate = sizedCandidate || baseCandidate;
  const runId = String(aiRunId || analysis?.id || "").trim();
  const strategyHref = runId
    ? strategyHrefWithAIRunId(candidate.strategyHref, runId)
    : candidate.strategyHref;
  const strategyAction = persistedActionById(persistedActions, "strategy");
  const strategySaved = String(strategyAction?.status || "").toLowerCase() === "done";
  const risk = normalizeRiskCaps(candidate?.draft?.riskCaps);
  const riskSummary = risk
    ? `最大仓位 ${money(risk.maxPositionUsd)}，最大杠杆 ${Number(risk.maxLeverage).toFixed(0)}x，日亏损上限 ${money(risk.dailyLossCapUsd)}。`
    : "缺少完整 riskCaps，保存或采用前必须人工补齐仓位、杠杆和日亏损上限。";
  const score = candidate.score ?? "—";
  const name = String(candidate?.draft?.name || candidate?.strategyId || "AI 策略").trim();

  return {
    stage: strategySaved ? "strategy_saved" : "ready_to_package",
    tone: strategySaved ? "success" : "warning",
    title: `${name} paper 采用包`,
    summary: `${name} 已达到 paper 候选条件，评分 ${score}。先保存策略草案并建立 24-72 小时 paper 观察，不会自动下单。`,
    candidate: {
      ...candidate,
      strategyHref,
    },
    strategyHref,
    backtestHref: candidate.backtestHref,
    riskSummary,
    primaryAction: {
      kind: strategySaved ? "accept_paper_candidate" : "save_and_accept_paper_candidate",
      label: strategySaved ? "采用 paper 观察" : "保存并采用 paper",
    },
    secondaryAction: {
      kind: "save_strategy_draft",
      label: strategySaved ? "已保存 AI 策略" : "保存 AI 策略草案",
    },
    steps: [
      {
        id: "save_strategy",
        label: "保存策略草案",
        status: strategySaved ? "done" : "ready",
        detail: strategySaved
          ? "AI 策略草案已保存，可继续 paper 观察。"
          : "把 AI 生成的参数保存为策略草案；保存不会开启 live，也不会下单。",
        href: strategyHref,
      },
      {
        id: "paper_watch",
        label: "采用 paper 观察",
        status: "ready",
        detail: `关联回测 ${candidate.runId || "—"}，进入 24-72 小时观察，记录市场风向、舆论、人性偏差和执行摩擦。`,
        href: candidate.backtestHref,
      },
      {
        id: "execution_boundary",
        label: "执行边界",
        status: "blocked",
        detail: "paper 观察、复盘证据、组合限额和人工闸门未满足前，不进入测试网或主网。",
        href: "/settings/trading",
      },
    ],
    guardrails: [
      "采用 paper 候选不会自动下单。",
      "保存策略草案不会开启 live。",
      "未完成 24-72 小时 paper 观察和复盘证据前，不进入测试网或主网。",
      riskSummary,
    ],
  };
}

export function aiCapitalPlanFromState({
  analysis = null,
  candidate = null,
  persistedActions = [],
} = {}) {
  if (!candidate) {
    const validationPlan = autoValidationPlanFromAnalysis(analysis);
    const primaryAction =
      validationPlan.runnableCount > 0
        ? { kind: "run_all_backtests", label: "运行 AI 批量回测" }
        : undefined;
    return {
      stage: "waiting_validation",
      title: "等待 AI 验证候选",
      tone: "warning",
      summary: "还没有达到 paper 条件的回测候选，暂不做仓位计划。",
      recommendedNotionalUsd: 0,
      maxDailyLossUsd: 0,
      riskDiscount: 0,
      primaryAction,
      metrics: [
        { label: "建议仓位", value: "—", hint: "等待 paper 候选" },
        { label: "日亏损上限", value: "—", hint: "等待 riskCaps" },
        { label: "风险折扣", value: "—", hint: "等待 AI 验证" },
      ],
      rules: ["没有回测证据前，不分配 paper/testnet 仓位。"],
      actions: ["先完成 AI 回测验证，筛出 paper 候选。"],
    };
  }

  const sentiment = aiSentimentCompassFromAnalysis(analysis);
  const sentimentReview = persistedActionById(persistedActions, "sentiment_review");
  const needsReview = sentiment.stage !== "balanced" && !sentimentReviewCompleted(sentimentReview);
  const caps = candidateRiskCaps(candidate);
  if (needsReview) {
    return {
      stage: "review_before_sizing",
      title: "先复核风向再分配资金",
      tone: "warning",
      summary: `${sentiment.title}，先确认舆论和人性风险，再给 paper 仓位。`,
      recommendedNotionalUsd: 0,
      maxDailyLossUsd: 0,
      riskDiscount: 0,
      primaryHref: "/data-explorer/news",
      primaryAction: { kind: "open_link", label: "打开风向复核" },
      metrics: [
        { label: "建议仓位", value: "—", hint: "等待风向复核" },
        { label: "日亏损上限", value: "—", hint: "等待风向复核" },
        { label: "风险折扣", value: "0%", hint: sentiment.title },
      ],
      rules: ["风向 / 人性复核未完成前，不分配 paper 仓位。"],
      actions: ["完成风向 / 人性复核，再让 AI 生成 paper sizing。"],
    };
  }

  const scoreDiscount = candidateScoreDiscount(candidate);
  const sentimentDiscount = sentimentDiscountFromStage(sentiment.stage);
  const riskDiscount = Math.min(scoreDiscount, sentimentDiscount);
  const recommendedNotionalUsd = Math.round(caps.maxPositionUsd * riskDiscount);
  const drawdownLimit = paperDrawdownLimit(candidate);
  const drawdownLossUsd = Math.round(recommendedNotionalUsd * drawdownLimit);
  const maxDailyLossUsd = Math.min(Math.round(caps.dailyLossCapUsd), drawdownLossUsd);

  return {
    stage: "paper_sizing",
    title: "AI paper 资金计划",
    tone: "success",
    summary: `建议先用 ${money(recommendedNotionalUsd)} paper 仓位观察，日亏损上限 ${money(maxDailyLossUsd)}，未通过观察前不进入真实资金。`,
    recommendedNotionalUsd,
    maxDailyLossUsd,
    riskDiscount,
    primaryHref: capitalPlanStrategyHref(candidate, recommendedNotionalUsd),
    primaryAction: { kind: "accept_paper_candidate", label: "采用 paper 计划" },
    metrics: [
      { label: "建议仓位", value: money(recommendedNotionalUsd), hint: `不超过 AI riskCaps ${money(caps.maxPositionUsd)}` },
      { label: "日亏损上限", value: money(maxDailyLossUsd), hint: `低于 riskCaps ${money(caps.dailyLossCapUsd)}` },
      { label: "风险折扣", value: `${Math.round(riskDiscount * 100)}%`, hint: `${sentiment.title} / 评分 ${candidate.score ?? "—"}` },
    ],
    rules: [
      `最大杠杆不超过 ${Number(caps.maxLeverage).toFixed(0)}x。`,
      `paper 回撤超过 ${formatPercentValue(drawdownLimit)} 或日亏损超过 ${money(maxDailyLossUsd)} 时暂停。`,
      "只用于 paper/testnet 观察，不自动提交真实订单。",
    ],
    actions: [
      "用预填策略复核参数和 riskCaps。",
      "完成 24-72 小时 paper 观察后再考虑测试网。",
    ],
  };
}

export function aiDraftEvidenceFromAnalysis(analysis, draft) {
  const name = String(draft?.name || draft?.symbol || "AI 草案").trim() || "AI 草案";
  const context = analysis?.context || {};
  const notes = safeStringList(context.notes);
  const watchSignals = Array.isArray(analysis?.watchSignals) ? analysis.watchSignals : [];
  const humanFactors = safeStringList(analysis?.humanFactors);
  const gates = safeStringList(analysis?.execution?.safetyGates);
  const risk = normalizeRiskCaps(draft?.riskCaps);
  const backtestRequest = backtestRequestFromDraft(draft);
  const contextValue = `${Number(context.newsCount || 0)}/${Number(context.macroCount || 0)}/${Number(context.onchainCount || 0)}`;
  const evidence = [
    `新闻 ${Number(context.newsCount || 0)} / 宏观 ${Number(context.macroCount || 0)} / 链上 ${Number(context.onchainCount || 0)} 已参与判断。`,
    ...watchSignals.slice(0, 3).map((item) => {
      const source = String(item?.source || "signal").trim();
      const signal = String(item?.signal || "观察信号").trim();
      const action = String(item?.action || "").trim();
      return action ? `${source}: ${signal}，动作：${action}` : `${source}: ${signal}`;
    }),
    ...notes.slice(0, 3).map((item) => `上下文缺口：${item}`),
  ];
  const risks = [
    ...humanFactors.slice(0, 4),
    ...(risk
      ? [
          `riskCaps: 最大仓位 ${money(risk.maxPositionUsd)}，最大杠杆 ${Number(risk.maxLeverage).toFixed(0)}x，日亏损上限 ${money(risk.dailyLossCapUsd)}。`,
        ]
      : ["缺少 AI riskCaps，必须人工补齐仓位、杠杆和日亏损上限。"]),
  ];
  const safetyGates = [
    ...(backtestRequest ? gates : ["只观察草案不能回测，也不能预填交易策略。"]),
    ...(notes.length > 0 ? ["补齐上下文缺口后再推进验证。"] : []),
  ];
  const actions = backtestRequest
    ? [
        "先运行回测验证收益、回撤、夏普和交易数。",
        "通过风向 / 人性复核后，只采用为 paper 候选。",
      ]
    : [
        "补齐数据或重新生成可回测草案。",
        "只用于观察信号，不进入交易执行。",
      ];
  const tone = !backtestRequest || notes.length > 0 || !risk ? "warning" : "success";
  const mode = backtestRequest ? "可回测" : "只观察";
  return {
    title: `${name} 证据摘要`,
    summary: risk
      ? `${mode}；AI riskCaps 将单策略仓位限制在 ${money(risk.maxPositionUsd)}，杠杆不超过 ${Number(risk.maxLeverage).toFixed(0)}x。`
      : `${mode}；缺少完整 riskCaps，不能直接进入执行。`,
    tone,
    metrics: [
      { label: "上下文", value: contextValue, hint: "新闻/宏观/链上" },
      {
        label: "观察信号",
        value: String(watchSignals.length),
        hint: humanFactors.length > 0 ? `${humanFactors.length} 个人性因子` : "暂无人性因子",
      },
      { label: "执行", value: mode, hint: String(analysis?.execution?.mode || "observe") },
    ],
    evidence,
    risks,
    gates: safetyGates,
    actions,
  };
}

export function aiStrategyCreationSummaryFromDraft({
  analysis = null,
  draft = null,
} = {}) {
  const name = String(draft?.name || draft?.symbol || "AI 草案").trim() || "AI 草案";
  const request = backtestRequestFromDraft(draft);
  const risk = normalizeRiskCaps(draft?.riskCaps);
  const executionMode = String(analysis?.execution?.mode || "observe");
  const blockers = [];

  if (!draft) {
    blockers.push("缺少 AI 策略草案，不能创建策略。");
  }
  if (!request) {
    blockers.push("该草案是只观察信号或不可回测草案，需要 AI 重新生成可执行策略。");
  }
  if (!risk) {
    blockers.push("缺少完整 riskCaps，必须先补齐最大仓位、最大杠杆和日亏损上限。");
  }

  const preset = request ? strategyPresetFromDraft(draft) : null;
  const primaryHref =
    blockers.length === 0 ? `/option?${strategyPresetSearchFromDraft(draft)}` : undefined;
  const isReady = blockers.length === 0;
  const maxLeverageText = risk
    ? `${Number(risk.maxLeverage).toFixed(0)}x`
    : "—";
  const riskText = risk
    ? `${money(risk.maxPositionUsd)} / 最大杠杆 ${maxLeverageText} / 日亏损 ${money(risk.dailyLossCapUsd)}`
    : "—";

  return {
    stage: isReady ? "ready_to_prefill" : "blocked",
    title: isReady ? `${name} 可创建为策略草案` : `${name} 暂不能创建策略`,
    tone: isReady ? "success" : "warning",
    summary: isReady
      ? "AI 已把交易参数和 riskCaps 整理成 /option 可预填配置；可以先保存为草案，账户和凭证稍后再绑定。"
      : "这个草案还不能进入策略创建页，先处理阻塞项或重新运行 AI 分析。",
    primaryHref,
    primaryAction: primaryHref
      ? { kind: "save_strategy_draft", label: "保存为 AI 策略" }
      : undefined,
    metrics: [
      {
        label: "交易对",
        value: preset?.execSymbol || "—",
        hint: draft?.kind || "未生成",
      },
      {
        label: "风控",
        value: risk ? money(risk.maxPositionUsd) : "—",
        hint: riskText,
      },
      {
        label: "执行边界",
        value: executionMode,
        hint: "创建策略不会自动下单",
      },
    ],
    aiPrepared: [
      ...(preset
        ? [
            `交易对 ${preset.execSymbol}，策略名 ${preset.name}。`,
            `杠杆 ${preset.positionLevel}x，订单组保证金 ${money(preset.orderGroupMargin)}。`,
            `止盈 ${formatPercentValue(preset.stopProfitRate)}，止损 ${formatPercentValue(preset.stopLossRate)}。`,
          ]
        : ["AI 还没有给出可保存的交易参数。"]),
      ...(risk
        ? [
            `riskCaps: 最大仓位 ${money(risk.maxPositionUsd)}，最大杠杆 ${maxLeverageText}，日亏损上限 ${money(risk.dailyLossCapUsd)}。`,
          ]
        : []),
    ],
    userRequired: isReady
      ? [
          "稍后绑定交易所账户；密钥不会由 AI 自动生成或自动保存。",
          "人工复核交易参数、riskCaps 和分批开仓比例。",
          "创建后先保持 live 关闭，完成 paper/testnet 观察后再考虑开启。",
        ]
      : [
          "让 AI 重新生成可回测、带完整 riskCaps 的策略草案。",
          "不要把只观察信号直接保存成交易策略。",
        ],
    blockers,
  };
}

function tradeableAccountsFromList(accounts) {
  if (!Array.isArray(accounts)) return [];
  return accounts.filter((account) => {
    const permissions = account?.permissions || {};
    return Boolean(permissions.canTrade) && !permissions.canWithdraw;
  });
}

function executionContextFromAnalysis(analysis) {
  const raw = analysis?.context?.execution;
  if (!raw || typeof raw !== "object") return null;
  const limits = raw.portfolioLimits && typeof raw.portfolioLimits === "object" ? raw.portfolioLimits : {};
  return {
    accountCount: clampInt(raw.accountCount, 0, 0, 1000000),
    tradeableAccountCount: clampInt(raw.tradeableAccountCount, 0, 0, 1000000),
    withdrawalEnabledAccountCount: clampInt(raw.withdrawalEnabledAccountCount, 0, 0, 1000000),
    tradingHalted: Boolean(raw.tradingHalted),
    haltedReason: String(raw.haltedReason || "").trim(),
    portfolioLimits: {
      maxOpenNotionalUsd: clampNumber(limits.maxOpenNotionalUsd, 0, 0, 1000000000),
      maxOpenPositionsCount: clampInt(limits.maxOpenPositionsCount, 0, 0, 1000000),
      maxDailyLossUsd: clampNumber(limits.maxDailyLossUsd, 0, 0, 1000000000),
    },
  };
}

function portfolioLimitsReady(executionContext) {
  if (!executionContext) return true;
  const limits = executionContext.portfolioLimits || {};
  return (
    Number(limits.maxOpenNotionalUsd || 0) > 0 &&
    Number(limits.maxOpenPositionsCount || 0) > 0 &&
    Number(limits.maxDailyLossUsd || 0) > 0
  );
}

export function aiExecutionReadinessFromState({
  analysis = null,
  persistedActions = [],
  validationRuns = [],
  accounts,
} = {}) {
  const ready = [];
  const blockers = [];
  const ranked = rankBacktestValidation(validationRuns);
  const candidate = paperCandidateFromValidation(analysis, validationRuns);
  const sentiment = aiSentimentCompassFromAnalysis(analysis);
  const sentimentReview = persistedActionById(persistedActions, "sentiment_review");
  const sentimentReviewEvidenceComplete = sentimentReviewCompleted(sentimentReview);
  const paperWatch = persistedActionById(persistedActions, "paper_watch");
  const strategyHandoffHref = savedStrategyHandoffHref(persistedActions, candidate);
  const paperWatchEvidenceComplete =
    paperWatch?.status === "done" && paperWatchCompletionHasEvidence(paperWatch);
  const accountsLoaded = Array.isArray(accounts);
  const executionContext = executionContextFromAnalysis(analysis);
  const tradeableAccounts = tradeableAccountsFromList(accounts);
  const tradeableAccountCount = accountsLoaded
    ? tradeableAccounts.length
    : executionContext?.tradeableAccountCount || 0;
  const accountCount = accountsLoaded ? accounts.length : executionContext?.accountCount || 0;
  const withdrawalEnabledAccountCount = accountsLoaded
    ? accounts.filter((account) => Boolean(account?.permissions?.canWithdraw)).length
    : executionContext?.withdrawalEnabledAccountCount || 0;
  const completedRuns = ranked.filter((row) => row.score !== null);
  const context = analysis?.context || {};
  const notes = safeStringList(context.notes);
  const contextCount =
    Number(context.newsCount || 0) + Number(context.macroCount || 0) + Number(context.onchainCount || 0);

  if (!analysis) {
    return {
      stage: "not_started",
      tone: "warning",
      score: 0,
      title: "等待 AI 生成执行路径",
      summary: "先让 AI 分析目标并生成草案，暂不具备 paper/testnet 推进条件。",
      primaryAction: { kind: "scan_today", label: "运行 AI 扫描" },
      metrics: [
        { label: "AI 草案", value: "未生成", hint: "先分析目标" },
        { label: "验证", value: "未开始", hint: "等待草案" },
        { label: "账户", value: "未检查", hint: "等待账户读取" },
      ],
      ready,
      blockers: ["缺少 AI 分析结果。"],
    };
  }

  ready.push("AI 已生成目标分析和策略草案。");
  if (notes.length > 0 || contextCount === 0) {
    blockers.push("市场 / 舆论 / 链上上下文不足，先刷新 AI 雷达。");
  } else {
    ready.push("市场、舆论或链上上下文已参与判断。");
  }

  if (completedRuns.length === 0) {
    blockers.push("尚无完成的回测验证。");
  } else {
    ready.push(`${completedRuns.length} 个回测验证已完成。`);
  }

  if (!candidate) {
    blockers.push("还没有达到 paper 条件的候选策略。");
  } else {
    ready.push(`paper 候选 ${candidate.draft.name || candidate.strategyId} 已筛出。`);
  }

  if (sentiment.stage !== "balanced" && !sentimentReviewEvidenceComplete) {
    blockers.push("风向 / 人性风险未复核完成。");
  } else {
    ready.push("风向 / 人性复核已满足。");
  }

  if (executionContext?.tradingHalted) {
    const reason = executionContext.haltedReason ? `：${executionContext.haltedReason}` : "";
    blockers.push(`全局交易已暂停${reason}。`);
  }

  if (!portfolioLimitsReady(executionContext)) {
    blockers.push("组合限额未设置，不能让 AI 推进到执行检查。");
  }

  if (tradeableAccountCount === 0) {
    blockers.push("缺少可交易且无提现权限的账户。");
  } else {
    const source = accountsLoaded ? "账户列表" : "后端执行快照";
    ready.push(`${tradeableAccountCount} 个可交易账户可用于测试网前检查（${source}）。`);
  }
  if (withdrawalEnabledAccountCount > 0) {
    ready.push(`${withdrawalEnabledAccountCount} 个带提现权限账户已排除在安全执行账户之外。`);
  }

  if (!paperWatch) {
    blockers.push("paper 观察尚未采用。");
  } else if (paperWatch.status !== "done") {
    blockers.push("paper 观察尚未标记完成。");
  } else if (!paperWatchEvidenceComplete) {
    blockers.push("paper 复盘证据不足：需要记录市场风向、舆论、人性偏差、执行摩擦、回撤表现和测试网边界。");
  } else {
    ready.push("paper 观察已标记完成，且复盘证据已覆盖风向、人性、执行摩擦、回撤和测试网边界。");
  }

  let stage = "blocked";
  let tone = "warning";
  let title = "AI 执行条件未满足";
  let summary = "AI 已给出方向，但仍有执行前闸门未完成。";
  let primaryHref;
  let primaryAction;

  if (notes.length > 0 || contextCount === 0) {
    stage = "data_gap";
    title = "先刷新市场和舆论证据";
    primaryAction = { kind: "rescan_today", label: "刷新 AI 雷达" };
  } else if (!candidate) {
    const running = ranked.some((row) => row.score === null);
    stage = running ? "validating" : "validation_needed";
    title = running ? "等待回测完成" : "先完成 AI 回测";
    primaryAction = { kind: "run_all_backtests", label: "运行 AI 批量回测" };
  } else if (sentiment.stage !== "balanced" && !sentimentReviewEvidenceComplete) {
    stage = "sentiment_review";
    title = "先复核风向 / 人性";
    primaryHref = "/data-explorer/news";
    primaryAction = { kind: "open_link", label: "打开风向复核" };
  } else if (executionContext?.tradingHalted) {
    stage = "trading_halted";
    title = "全局交易已暂停";
    summary = executionContext.haltedReason
      ? `当前系统处于停机状态：${executionContext.haltedReason}。AI 只能继续观察，不能推进执行。`
      : "当前系统处于停机状态。AI 只能继续观察，不能推进执行。";
    primaryHref = "/settings/trading";
    primaryAction = { kind: "open_link", label: "查看交易停机" };
  } else if (!portfolioLimitsReady(executionContext)) {
    stage = "risk_limits_blocked";
    title = "组合限额未设置";
    summary = "AI 已筛出候选，但组合级最大敞口、持仓数或日亏损上限未设置，不能进入测试网前检查。";
    primaryHref = "/settings/trading";
    primaryAction = { kind: "open_link", label: "设置组合限额" };
  } else if (tradeableAccountCount === 0) {
    stage = "account_blocked";
    title = "缺少安全交易账户";
    summary = "AI 已筛出候选，但没有可交易且不可提现的账户，不能进入测试网前检查。";
    primaryHref = "/accounts/new";
    primaryAction = { kind: "open_link", label: "添加交易账户" };
  } else if (!paperWatch) {
    stage = "paper_ready";
    tone = "success";
    title = "可以采用为 paper 候选";
    summary = "AI 候选已通过验证和风向复核，下一步是采用并进入 24-72 小时 paper 观察。";
    primaryAction = { kind: "accept_paper_candidate", label: "采用 paper 候选" };
  } else if (paperWatch.status !== "done" || !paperWatchEvidenceComplete) {
    stage = "paper_watch";
    title = paperWatch.status === "done" ? "补齐 paper 复盘证据" : "继续 paper 观察";
    summary =
      paperWatch.status === "done"
        ? "paper 观察虽已标记完成，但缺少市场风向、舆论、人性偏差、执行摩擦、回撤表现或测试网边界复盘证据，不应进入测试网。"
        : "paper 候选已采用，但观察尚未完成，不应进入测试网。";
    primaryHref = paperWatch.href || candidate.backtestHref;
    primaryAction = {
      kind: "open_link",
      label: paperWatch.status === "done" ? "补齐 paper 复盘" : "查看 paper 观察",
    };
  } else {
    stage = "testnet_ready";
    tone = "success";
    title = "可进入测试网前检查";
    summary = "AI、回测、风向、账户和 paper 观察均满足；下一步最多进入测试网，主网仍需独立闸门。";
    primaryHref = strategyHandoffHref || candidate.strategyHref;
    primaryAction = { kind: "open_link", label: "打开测试网策略" };
    blockers.push("主网仍需 env + token gate + 人工确认。");
  }

  const score = clampScore(
    (analysis ? 15 : 0) +
      (notes.length === 0 && contextCount > 0 ? 15 : 0) +
      (completedRuns.length > 0 ? 15 : 0) +
      (candidate ? 15 : 0) +
      (sentiment.stage === "balanced" || sentimentReviewEvidenceComplete ? 10 : 0) +
      (tradeableAccountCount > 0 ? 15 : 0) +
      (paperWatchEvidenceComplete ? 15 : 0),
  );

  return {
    stage,
    tone,
    score,
    title,
    summary,
    primaryHref,
    primaryAction,
    metrics: [
      { label: "执行就绪", value: `${score}%`, hint: stage },
      { label: "账户", value: `${tradeableAccountCount}/${accountCount}`, hint: "可交易且不可提现" },
      { label: "回测", value: completedRuns.length > 0 ? `${completedRuns.length} 完成` : "未完成", hint: candidate ? "有 paper 候选" : "等待候选" },
    ],
    ready,
    blockers,
  };
}

function savedStrategyHandoffHref(persistedActions, candidate) {
  const action = persistedActionById(persistedActions, "strategy");
  const href = String(action?.href || "").trim();
  if (!href.startsWith("/option?")) return "";
  const relatedId = String(action?.relatedId || "").trim();
  const candidateIds = new Set(
    [
      candidate?.strategyId,
      candidate?.draft?.name,
      candidate?.draft?.symbol,
    ]
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  );
  if (!relatedId || candidateIds.has(relatedId)) return href;
  return "";
}

export function aiExecutionPreviewFromState({
  analysis = null,
  persistedActions = [],
  validationRuns = [],
  accounts,
} = {}) {
  if (!analysis) {
    return {
      stage: "idle",
      tone: "warning",
      title: "AI 执行预演待启动",
      summary: "先输入目标并启动 AI 雷达，AI 才能预演从分析、验证到 paper 观察的下一步路径。",
      primaryAction: { kind: "analyze_and_validate", label: "启动 AI 雷达" },
      metrics: [
        { label: "预演阶段", value: "未启动", hint: "等待目标" },
        { label: "AI 动作", value: 2, hint: "扫描 + 生成蓝图" },
        { label: "人工闸门", value: 2, hint: "目标 + 真实交易确认" },
      ],
      wouldDo: [
        "AI 会扫描目标、市场、舆论、宏观和链上上下文。",
        "AI 会生成策略蓝图、观察信号和安全验证计划。",
      ],
      willNotDo: [
        "AI 预演不会下单，也不会连接真实交易执行。",
        "AI 不会跳过回测、paper 观察或人工闸门。",
      ],
      requiredHumanConfirmations: [
        "你需要输入赚钱目标、风险偏好和禁止场景。",
        "真实交易始终需要人工确认、组合限额和交易闸门。",
      ],
    };
  }

  const decision = nextAIGoalDecision(analysis, persistedActions, validationRuns);
  const readiness = aiExecutionReadinessFromState({
    analysis,
    persistedActions,
    validationRuns,
    accounts,
  });
  const autopilot = aiAutopilotStateFromAnalysis({
    analysis,
    persistedActions,
    validationRuns,
  });
  const candidate = paperCandidateFromValidation(analysis, validationRuns);
  const paperWatch = persistedActionById(persistedActions, "paper_watch");
  const wouldDo = [];
  const willNotDo = [];
  const requiredHumanConfirmations = [];

  pushUniqueText(wouldDo, "AI 会继续整理市场、舆论、人性和风险证据。");
  if (decision.stage === "data_gap" || readiness.stage === "data_gap") {
    pushUniqueText(wouldDo, "AI 会先刷新数据上下文，再重新判断是否验证策略。");
  }
  if (decision.stage === "backtest" || readiness.stage === "validation_needed") {
    pushUniqueText(wouldDo, "AI 会批量回测可验证的策略草案。");
  }
  if (decision.stage === "validating" || readiness.stage === "validating") {
    pushUniqueText(wouldDo, "AI 会等待并读取回测进度，不提前采用候选。");
  }
  if (readiness.stage === "sentiment_review" || decision.stage === "sentiment_review") {
    pushUniqueText(wouldDo, "AI 会把风向 / 人性复核作为采用 paper 前置条件。");
  }
  if (candidate && readiness.stage === "paper_ready") {
    pushUniqueText(wouldDo, `AI 会把 ${candidate.strategyId} 作为 paper 候选供你采用。`);
  }
  if (candidate && readiness.stage === "paper_watch") {
    pushUniqueText(wouldDo, "AI 会继续跟踪 paper 观察，不推进测试网。");
  }
  if (candidate && readiness.stage === "testnet_ready") {
    pushUniqueText(wouldDo, "AI 会打开策略预填，最多推进到测试网前检查。");
  }
  if (readiness.stage === "account_blocked") {
    pushUniqueText(wouldDo, "AI 会停在账户检查，等待安全交易账户。");
  }
  if (readiness.stage === "risk_limits_blocked") {
    pushUniqueText(wouldDo, "AI 会停在组合限额检查，等待风险上限。");
  }
  if (readiness.stage === "trading_halted") {
    pushUniqueText(wouldDo, "AI 会保持观察，不推进任何执行动作。");
  }

  pushUniqueText(willNotDo, "AI 预演不会下单，也不会创建真实订单。");
  pushUniqueText(willNotDo, "AI 不会绕过回测、paper 观察、组合限额或人工确认。");
  pushUniqueText(willNotDo, "AI 不会进入主网；mainnet 仍需要 env、token gate 和人工确认。");
  if (readiness.blockers?.length > 0) {
    pushUniqueText(willNotDo, `AI 不会越过当前阻塞项：${readiness.blockers[0]}`);
  }

  pushUniqueText(requiredHumanConfirmations, "真实交易需要人工确认、组合限额、kill switch 和交易闸门。");
  if (candidate && (!paperWatch || paperWatch.status !== "done")) {
    pushUniqueText(requiredHumanConfirmations, "paper 观察需要人工采用、记录和复盘完成。");
  }
  if (autopilot.humanRequiredSteps?.length > 0) {
    autopilot.humanRequiredSteps.slice(0, 3).forEach((item) => {
      pushUniqueText(requiredHumanConfirmations, item);
    });
  }

  const stage = readiness.stage === "not_started" ? decision.stage : readiness.stage;
  const decisionPrimaryAction =
    readiness.stage === "paper_ready" || readiness.stage === "testnet_ready"
      ? decision.primaryAction
      : undefined;
  const primaryAction =
    decisionPrimaryAction ??
    readiness.primaryAction ??
    decision.primaryAction ??
    autopilot.primaryAction ??
    (decision.primaryHref ? { kind: "open_link", label: "打开相关页面" } : undefined);
  const primaryHref = readiness.primaryHref ?? decision.primaryHref ?? autopilot.primaryHref;

  return {
    stage,
    tone: readiness.tone || decision.tone || autopilot.tone,
    title: readiness.title || decision.title || autopilot.title,
    summary: readiness.summary || decision.summary || autopilot.summary,
    primaryHref,
    primaryAction,
    metrics: [
      { label: "预演阶段", value: stage, hint: readiness.title || decision.title },
      ...readiness.metrics.slice(0, 2),
    ],
    wouldDo: wouldDo.slice(0, 6),
    willNotDo: willNotDo.slice(0, 6),
    requiredHumanConfirmations: requiredHumanConfirmations.slice(0, 6),
  };
}

function moneyPathTone(status) {
  if (status === "done") return "success";
  if (status === "current") return "warning";
  if (status === "blocked") return "danger";
  return "default";
}

function moneyPathStep({
  id,
  label,
  status,
  detail,
  actionKind,
  href,
}) {
  return {
    id,
    label,
    status,
    tone: moneyPathTone(status),
    detail,
    ...(actionKind ? { actionKind } : {}),
    ...(href ? { href } : {}),
  };
}

export function aiMoneyPathFromState({
  analysis = null,
  persistedActions = [],
  validationRuns = [],
  runs = [],
  accounts,
  dailyRadarStatus = null,
  providerGate = null,
} = {}) {
  const ranked = rankBacktestValidation(validationRuns);
  const completedRuns = ranked.filter((row) => row.score !== null);
  const runningRuns = ranked.filter((row) => row.score === null);
  const candidate = paperCandidateFromValidation(analysis, validationRuns);
  const decision = analysis ? nextAIGoalDecision(analysis, persistedActions, validationRuns) : null;
  const readiness = aiExecutionReadinessFromState({
    analysis,
    persistedActions,
    validationRuns,
    accounts,
  });
  const setup = aiSetupChecklistFromState({
    analysis,
    validationRuns,
    accounts,
    dailyRadarStatus,
    providerGate,
  });
  const context = analysis?.context || {};
  const notes = safeStringList(context.notes);
  const contextCount =
    Number(context.newsCount || 0) + Number(context.macroCount || 0) + Number(context.onchainCount || 0);
  const drafts = Array.isArray(analysis?.strategyDrafts) ? analysis.strategyDrafts : [];
  const runnableDrafts = runnableBacktestRequestsFromAnalysis(analysis);
  const sentiment = aiSentimentCompassFromAnalysis(analysis);
  const sentimentReview = persistedActionById(persistedActions, "sentiment_review");
  const paperWatch = persistedActionById(persistedActions, "paper_watch");
  const paperEvidenceComplete =
    paperWatch?.status === "done" && paperWatchCompletionHasEvidence(paperWatch);
  const recentRuns = Array.isArray(runs) ? runs : [];
  const hasTodayScan = Boolean(dailyRadarStatus?.hasToday);

  if (!analysis) {
    const providerGateStage = String(providerGate?.stage || "").toLowerCase();
    if (providerGateStage === "blocked" || providerGateStage === "loading") {
      const loading = providerGateStage === "loading";
      const href = String(providerGate?.primaryHref || "/settings/ai").trim() || "/settings/ai";
      const label =
        String(providerGate?.primaryAction?.label || "").trim() ||
        (loading ? "查看 AI 配置" : "配置真实 AI");
      const summary =
        String(providerGate?.summary || "").trim() ||
        (loading
          ? "正在确认真实 AI provider 状态，确认前不会启动今日扫描。"
          : "真实 AI provider 还不可用，先完成 API key 配置和连接测试。");
      const steps = [
        moneyPathStep({
          id: "provider",
          label: "真实 AI 配置",
          status: loading ? "current" : "blocked",
          detail: summary,
          actionKind: "open_link",
          href,
        }),
        moneyPathStep({
          id: "scan",
          label: "AI 扫描",
          status: "pending",
          detail: loading
            ? "等待 provider 状态确认后，AI 才能扫描今日市场。"
            : "配置真实 AI provider 后才能启动扫描。",
        }),
        moneyPathStep({
          id: "context",
          label: "风向证据",
          status: "pending",
          detail: "等待真实 AI 可用后汇总新闻、宏观、链上和舆论证据。",
        }),
        moneyPathStep({
          id: "blueprint",
          label: "策略蓝图",
          status: "pending",
          detail: "等待 AI 根据目标生成可验证策略草案。",
        }),
        moneyPathStep({
          id: "validation",
          label: "回测验证",
          status: "pending",
          detail: "等待策略蓝图生成后再批量回测。",
        }),
        moneyPathStep({
          id: "sentiment",
          label: "人性/舆论",
          status: "pending",
          detail: "等待 AI 识别 FOMO、拥挤、恐慌或叙事过热。",
        }),
        moneyPathStep({
          id: "paper",
          label: "Paper 观察",
          status: "pending",
          detail: "只有通过回测和复核的候选才能进入 paper。",
        }),
        moneyPathStep({
          id: "testnet",
          label: "测试网前检查",
          status: "blocked",
          detail: "真实交易不会从这里直接启动；测试网也要等待真实 AI、回测和 paper 复盘。",
        }),
      ];

      return {
        stage: loading ? "provider_loading" : "provider_blocked",
        title: loading ? "正在确认 AI provider" : "先配置真实 AI",
        tone: "warning",
        summary,
        currentStepId: "provider",
        primaryHref: href,
        primaryAction: { kind: "open_link", label },
        steps,
        nextActions: loading
          ? ["等待 AI provider 状态返回", "打开 AI 设置检查配置", "确认后再启动今日扫描"]
          : ["配置真实 AI provider", "测试 API key 连接", "确认后再让 AI 扫描今日市场"],
      };
    }

    const steps = [
      moneyPathStep({
        id: "scan",
        label: "AI 扫描",
        status: "current",
        detail: hasTodayScan
          ? "今日扫描已存在，可打开运行或重新扫描。"
          : "运行 AI 扫描，让系统读取市场、舆论、宏观、链上和人性偏差。",
        actionKind: "scan_today",
      }),
      moneyPathStep({
        id: "context",
        label: "风向证据",
        status: "pending",
        detail: "等待 AI 把新闻、宏观、链上和舆论证据汇总进目标分析。",
      }),
      moneyPathStep({
        id: "blueprint",
        label: "策略蓝图",
        status: "pending",
        detail: "等待 AI 根据目标生成可验证策略草案。",
      }),
      moneyPathStep({
        id: "validation",
        label: "回测验证",
        status: "pending",
        detail: "等待策略蓝图生成后再批量回测。",
      }),
      moneyPathStep({
        id: "sentiment",
        label: "人性/舆论",
        status: "pending",
        detail: "等待 AI 识别 FOMO、拥挤、恐慌或叙事过热。",
      }),
      moneyPathStep({
        id: "paper",
        label: "Paper 观察",
        status: "pending",
        detail: "只有通过回测和复核的候选才能进入 paper。",
      }),
      moneyPathStep({
        id: "testnet",
        label: "测试网前检查",
        status: "blocked",
        detail: "真实交易不会从这里直接启动；测试网也要等待 paper 复盘。",
      }),
    ];
    return {
      stage: "idle",
      title: "从 AI 扫描开始",
      tone: "warning",
      summary:
        recentRuns.length > 0
          ? "先打开或刷新最近的 AI 目标运行，再让 AI 继续走完验证路径。"
          : "还没有 AI 赚钱路径。先让 AI 扫描目标和市场风向，不会触发任何下单。",
      currentStepId: "scan",
      primaryAction: { kind: "scan_today", label: "运行 AI 扫描" },
      steps,
      nextActions: ["运行 AI 扫描", "让 AI 生成策略蓝图", "先回测和 paper，再考虑测试网前检查"],
    };
  }

  const contextBlocked = notes.length > 0 || contextCount === 0;
  const validationStatus =
    completedRuns.length > 0
      ? "done"
      : runningRuns.length > 0
        ? "current"
        : runnableDrafts.length > 0
          ? "current"
          : "blocked";
  const sentimentNeedsReview = sentiment.stage !== "balanced" && !sentimentReviewCompleted(sentimentReview);
  const paperStatus =
    sentimentNeedsReview
      ? "blocked"
      : paperEvidenceComplete
      ? "done"
      : paperWatch || candidate
        ? "current"
        : completedRuns.length > 0
          ? "blocked"
          : "pending";
  const testnetStatus =
    readiness.stage === "testnet_ready"
      ? "current"
      : paperWatch
        ? "blocked"
        : "pending";
  const steps = [
    moneyPathStep({
      id: "scan",
      label: "AI 扫描",
      status: "done",
      detail: "AI 目标分析已启动。",
    }),
    moneyPathStep({
      id: "context",
      label: "风向证据",
      status: contextBlocked ? "blocked" : "done",
      detail: contextBlocked
        ? notes[0] || "市场、舆论、宏观或链上证据不足。"
        : `已纳入新闻 ${Number(context.newsCount || 0)}、宏观 ${Number(context.macroCount || 0)}、链上 ${Number(context.onchainCount || 0)}。`,
      actionKind: contextBlocked ? "scan_today" : undefined,
    }),
    moneyPathStep({
      id: "blueprint",
      label: "策略蓝图",
      status: drafts.length > 0 ? "done" : "blocked",
      detail:
        drafts.length > 0
          ? `${drafts.length} 个 AI 策略蓝图已生成。`
          : "AI 没有生成策略蓝图，需要调整目标后重试。",
    }),
    moneyPathStep({
      id: "validation",
      label: "回测验证",
      status: validationStatus,
      detail:
        completedRuns.length > 0
          ? `${completedRuns.length} 个回测已完成，最佳建议：${ranked[0]?.recommendation || "等待评分"}。`
          : runningRuns.length > 0
            ? `${runningRuns.length} 个回测仍在运行。`
            : runnableDrafts.length > 0
              ? `${runnableDrafts.length} 个草案可进入批量回测。`
              : "没有可回测草案。",
      actionKind:
        completedRuns.length === 0 && runnableDrafts.length > 0 ? "run_all_backtests" : undefined,
      href: ranked[0]?.runId ? `/backtests/${encodeURIComponent(ranked[0].runId)}` : undefined,
    }),
    moneyPathStep({
      id: "sentiment",
      label: "人性/舆论",
      status: sentimentNeedsReview ? "current" : analysis ? "done" : "pending",
      detail: sentimentNeedsReview
        ? `${sentiment.title}，采用 paper 前需要人工复核。`
        : "人性、舆论和市场风向已纳入路径判断。",
      actionKind: sentimentNeedsReview ? "sentiment_review" : undefined,
      href: sentimentNeedsReview ? "/data-explorer/news" : undefined,
    }),
    moneyPathStep({
      id: "paper",
      label: "Paper 观察",
      status: paperStatus,
      detail:
        paperEvidenceComplete
          ? "paper 观察已完成并标记复盘。"
          : paperWatch?.status === "done"
            ? "paper 已标记完成，但复盘证据不足，需补齐风向、人性和执行摩擦。"
          : sentimentNeedsReview
            ? "等待风向 / 人性复核证据完整后，才能采用 paper 候选。"
          : candidate
            ? `${candidate.strategyId} 已达到 paper 候选条件。`
            : "等待回测和风向复核筛出 paper 候选。",
      actionKind: paperWatch && !paperEvidenceComplete
        ? "open_link"
        : candidate && !paperWatch && !sentimentNeedsReview
          ? "accept_paper_candidate"
          : undefined,
      href: paperWatch?.href || candidate?.backtestHref,
    }),
    moneyPathStep({
      id: "testnet",
      label: "测试网前检查",
      status: testnetStatus,
      detail:
        readiness.stage === "testnet_ready"
          ? "最多进入测试网前检查；主网仍需独立闸门。"
          : "等待 paper 观察完成、账户安全和组合限额检查。",
      actionKind: readiness.stage === "testnet_ready" ? "open_link" : undefined,
      href: readiness.stage === "testnet_ready" ? readiness.primaryHref : undefined,
    }),
  ];
  const currentStep =
    steps.find((step) => step.status === "current") ??
    steps.find((step) => step.status === "blocked") ??
    steps[0];
  const actionLabelByKind = {
    scan_today: "运行 AI 扫描",
    run_all_backtests: "运行 AI 批量回测",
    accept_paper_candidate: "采用为 paper 候选",
    open_link: "打开相关页面",
    sentiment_review: "复核风向 / 人性",
  };
  const primaryAction = currentStep?.actionKind
    ? {
        kind: currentStep.actionKind,
        label: moneyPathActionLabel(currentStep, actionLabelByKind),
      }
    : readiness.primaryAction ?? decision?.primaryAction;
  const summary =
    readiness.stage === "paper_ready"
      ? `${candidate?.strategyId || "AI 候选"} 已通过验证，当前只推进到 paper 候选采用，不进入主网。`
      : readiness.stage === "testnet_ready"
        ? "AI 路径已走完 paper 前置步骤，下一步最多进入测试网前检查，主网仍需人工闸门。"
        : readiness.summary || decision?.summary || setup.summary;

  return {
    stage: readiness.stage === "not_started" ? decision?.stage || "idle" : readiness.stage,
    title: currentStep ? `当前：${currentStep.label}` : setup.title,
    tone: currentStep?.tone || readiness.tone || setup.tone,
    summary,
    currentStepId: currentStep?.id,
    primaryHref: currentStep?.href ?? readiness.primaryHref ?? decision?.primaryHref,
    primaryAction,
    steps,
    nextActions: [
      ...(decision?.nextActions || []),
      ...safeStringList(readiness.blockers).slice(0, 2),
    ].slice(0, 5),
  };
}

function setupItemTone(status) {
  if (status === "ready") return "success";
  if (status === "blocked") return "warning";
  return "default";
}

function setupItem(id, label, status, detail, href) {
  return {
    id,
    label,
    status,
    tone: setupItemTone(status),
    detail,
    ...(href ? { href } : {}),
  };
}

function moneyPathActionLabel(step, labelsByKind) {
  if (step?.id === "testnet" && step?.actionKind === "open_link") {
    return "打开测试网前检查";
  }
  return labelsByKind?.[step?.actionKind] || step?.label || "继续";
}

export function aiSetupChecklistFromState({
  analysis = null,
  validationRuns = [],
  accounts,
  dailyRadarStatus = null,
  providerGate = null,
} = {}) {
  const context = analysis?.context || {};
  const notes = safeStringList(context.notes);
  const contextCount =
    Number(context.newsCount || 0) + Number(context.macroCount || 0) + Number(context.onchainCount || 0);
  const drafts = Array.isArray(analysis?.strategyDrafts) ? analysis.strategyDrafts : [];
  const validationPlan = autoValidationPlanFromAnalysis(analysis);
  const ranked = rankBacktestValidation(validationRuns);
  const completedRuns = ranked.filter((row) => row.score !== null);
  const accountsLoaded = Array.isArray(accounts);
  const executionContext = executionContextFromAnalysis(analysis);
  const tradeableAccounts = tradeableAccountsFromList(accounts);
  const tradeableAccountCount = accountsLoaded
    ? tradeableAccounts.length
    : executionContext?.tradeableAccountCount;
  const accountCount = accountsLoaded ? accounts.length : executionContext?.accountCount;
  const requestedMode = String(analysis?.execution?.mode || "observe").toLowerCase();
  const aiStatus = String(analysis?.ai?.status || "").toLowerCase();
  const aiError = String(analysis?.ai?.error || "").trim();
  const hasAnalysis = Boolean(analysis);
  const providerGateStage = String(providerGate?.stage || "").toLowerCase();
  const providerGateSummary = String(providerGate?.summary || "").trim();
  const providerGateHref = String(providerGate?.primaryHref || "/settings/ai").trim() || "/settings/ai";

  let providerStatus;
  let providerDetail;
  let providerHref;
  if (providerGateStage === "ready") {
    providerStatus = "ready";
    providerDetail = providerGateSummary || "真实 AI provider 已可用。";
  } else if (providerGateStage === "blocked") {
    providerStatus = "blocked";
    providerDetail = providerGateSummary || "AI provider key 未配置，先配置真实 AI。";
    providerHref = providerGateHref;
  } else if (providerGateStage === "loading") {
    providerStatus = "warning";
    providerDetail = providerGateSummary || "正在确认 AI provider 配置。";
  } else {
    providerStatus = !hasAnalysis ? "warning" : aiStatus === "ok" ? "ready" : "blocked";
    providerDetail =
      providerStatus === "ready"
        ? `AI provider 可用${analysis?.ai?.model ? `：${analysis.ai.model}` : ""}。`
        : providerStatus === "blocked"
          ? aiError || "AI provider 未返回可用模型，先配置 API key。"
          : "还没有运行 AI 分析，无法确认 provider 状态。";
    providerHref = providerStatus === "blocked" ? "/settings/ai" : undefined;
  }

  const contextStatus = !hasAnalysis
    ? "warning"
    : notes.length > 0 || contextCount === 0
      ? "blocked"
      : "ready";
  const contextDetail =
    contextStatus === "ready"
      ? `已纳入 ${Number(context.newsCount || 0)} 条新闻、${Number(context.macroCount || 0)} 个宏观点、${Number(context.onchainCount || 0)} 个链上点。`
      : notes.length > 0
        ? notes.slice(0, 2).join("；")
        : hasAnalysis
          ? "市场、舆论、宏观或链上证据为空，先刷新 AI 雷达。"
          : "先运行今日扫描，让 AI 把市场风向和舆论纳入判断。";

  const blueprintStatus = !hasAnalysis ? "warning" : drafts.length > 0 ? "ready" : "blocked";
  const blueprintDetail =
    blueprintStatus === "ready"
      ? `${drafts.length} 个 AI 策略蓝图可供验证。`
      : hasAnalysis
        ? "AI 没有生成可用策略蓝图，先调整目标重新分析。"
        : "等待 AI 根据目标生成策略蓝图。";

  const validationStatus =
    completedRuns.length > 0 ? "ready" : validationPlan.runnableCount > 0 ? "warning" : "blocked";
  const validationDetail =
    validationStatus === "ready"
      ? `${completedRuns.length} 个回测已完成，最佳建议：${ranked[0]?.recommendation || "等待评分"}。`
      : validationStatus === "warning"
        ? `${validationPlan.runnableCount} 个蓝图可回测，先运行 AI 批量验证。`
        : "没有可回测草案，先让 AI 生成可验证蓝图。";

  const accountStatus =
    Number(tradeableAccountCount || 0) > 0
      ? "ready"
      : accountsLoaded || executionContext
        ? "blocked"
        : "warning";
  const accountValue =
    accountCount === undefined
      ? "账户读取中"
      : `${Number(tradeableAccountCount || 0)}/${Number(accountCount || 0)}`;
  const accountDetail =
    accountStatus === "ready"
      ? `${accountValue} 个账户可交易且无提现权限。`
      : accountStatus === "blocked"
        ? "缺少可交易且不可提现的账户，不能让 AI 推进到执行检查。"
        : "账户列表还在读取，AI 暂不判断执行账户。";

  const limitsStatus = !executionContext
    ? "warning"
    : portfolioLimitsReady(executionContext)
      ? "ready"
      : "blocked";
  const limits = executionContext?.portfolioLimits || {};
  const limitsDetail =
    limitsStatus === "ready"
      ? `组合限额已设置：最大敞口 ${money(limits.maxOpenNotionalUsd)}，持仓数 ${limits.maxOpenPositionsCount}，日亏损 ${money(limits.maxDailyLossUsd)}。`
      : limitsStatus === "blocked"
        ? "组合最大敞口、持仓数或日亏损上限为 0，先设置交易闸门。"
        : "尚未读取后端执行上下文，先运行 AI 分析或等待系统状态。";

  const gateBlocked = Boolean(executionContext?.tradingHalted) || requestedMode === "mainnet";
  const gateStatus = !hasAnalysis ? "warning" : gateBlocked ? "blocked" : "ready";
  const gateDetail = executionContext?.tradingHalted
    ? `全局交易已暂停${executionContext.haltedReason ? `：${executionContext.haltedReason}` : ""}。`
    : requestedMode === "mainnet"
      ? "主网不能由 AI 自动推进，需要独立 token gate 和人工确认。"
      : hasAnalysis
        ? `当前最多按 ${requestedMode || "observe"} 路径推进，真实交易仍需人工确认。`
        : "先运行 AI 分析，确认执行模式和安全闸门。";

  const items = [
    setupItem("provider", "AI provider", providerStatus, providerDetail, providerHref),
    setupItem("context", "市场 / 舆论证据", contextStatus, contextDetail, contextStatus === "blocked" ? "/data-explorer/news" : undefined),
    setupItem("blueprint", "策略蓝图", blueprintStatus, blueprintDetail),
    setupItem("validation", "回测验证", validationStatus, validationDetail),
    setupItem("safe_account", "安全账户", accountStatus, accountDetail, accountStatus === "blocked" ? "/accounts/new" : undefined),
    setupItem("risk_limits", "组合限额", limitsStatus, limitsDetail, limitsStatus === "blocked" ? "/settings/trading" : undefined),
    setupItem("execution_gate", "执行闸门", gateStatus, gateDetail, gateStatus === "blocked" ? "/settings/trading" : undefined),
  ];

  const readyCount = items.filter((item) => item.status === "ready").length;
  const warningCount = items.filter((item) => item.status === "warning").length;
  const blocked = items.filter((item) => item.status === "blocked");
  const score = clampScore(((readyCount + warningCount * 0.35) / items.length) * 100);
  const stage = blocked.length > 0 ? "blocked" : warningCount > 0 ? "warning" : "ready";
  const tone = stage === "ready" ? "success" : "warning";
  const title =
    stage === "ready"
      ? "AI 工作流已具备使用条件"
      : stage === "blocked"
        ? "AI 工作流还不能安全推进"
        : "AI 工作流仍在准备中";
  const summary =
    stage === "ready"
      ? "AI、证据、策略蓝图、回测、账户和风控闸门都已满足，可以继续让 AI 判断下一步。"
      : blocked.length > 0
        ? `${blocked[0].label} 仍是主要阻塞项，先处理后再让 AI 推进验证或执行检查。`
        : "部分系统状态仍在读取或等待首轮扫描，当前适合先运行 AI 雷达。";

  let primaryHref;
  let primaryAction;
  if (providerStatus === "blocked") {
    primaryHref = "/settings/ai";
    primaryAction = { kind: "open_link", label: "配置 AI" };
  } else if (contextStatus === "blocked") {
    primaryHref = "/data-explorer/news";
    primaryAction = { kind: "open_link", label: "补齐数据" };
  } else if (accountStatus === "blocked") {
    primaryHref = "/accounts/new";
    primaryAction = { kind: "open_link", label: "添加安全账户" };
  } else if (limitsStatus === "blocked" || gateStatus === "blocked") {
    primaryHref = "/settings/trading";
    primaryAction = { kind: "open_link", label: "检查交易闸门" };
  } else if (validationStatus === "warning") {
    primaryAction = { kind: "run_all_backtests", label: "运行 AI 验证" };
  } else if (!hasAnalysis) {
    primaryAction = dailyRadarStatus?.primaryAction || { kind: "scan_today", label: "启动 AI 雷达" };
  } else {
    primaryAction = { kind: "open_link", label: "查看 AI 下一步" };
  }

  const nextActions = blocked.length > 0
    ? blocked.slice(0, 3).map((item) => item.href ? `${item.label}：打开 ${item.href}` : `${item.label}：${item.detail}`)
    : validationStatus !== "ready"
      ? ["运行 AI 批量回测，让系统先用数据验证蓝图。"]
      : ["继续执行 AI 下一步判断，但真实交易仍需人工确认。"];

  return {
    stage,
    tone,
    score,
    title,
    summary,
    primaryHref,
    primaryAction,
    items,
    nextActions,
  };
}

/**
 * @param {{ ai?: { status?: string, error?: string } } | null | undefined} analysis
 */
export function aiProviderSetupPromptFromAnalysis(analysis = null) {
  if (String(analysis?.ai?.status || "").toLowerCase() !== "fallback") {
    return null;
  }
  const message =
    String(analysis?.ai?.error || "").trim() ||
    "使用了本地 fallback。请配置并测试 AI provider 后重新分析目标。";
  return {
    title: "AI provider 未完成真实分析",
    tone: "warning",
    message,
    primaryHref: "/settings/ai",
    primaryAction: {
      kind: "open_link",
      label: "配置并测试 AI",
    },
    nextActions: [
      "打开 AI 设置并填写 provider key。",
      "保存后点击测试连接。",
      "回到 AI Money 重新分析目标。",
    ],
  };
}

export function aiProviderReadinessGateFromStatus(status = null, { loading = false } = {}) {
  if (loading) {
    return {
      stage: "loading",
      visible: false,
      blockManualAnalysis: false,
      blockAutoRadar: true,
      tone: "warning",
      title: "正在确认 AI provider",
      summary: "等待 AI 配置状态返回前，暂不自动启动今日雷达。",
      primaryHref: "/settings/ai",
      primaryAction: { kind: "open_link", label: "查看 AI 配置" },
      nextActions: [],
    };
  }

  if (!status || typeof status !== "object") {
    return {
      stage: "unknown",
      visible: false,
      blockManualAnalysis: false,
      blockAutoRadar: false,
      tone: "default",
      title: "AI provider 状态未知",
      summary: "",
      primaryHref: "/settings/ai",
      primaryAction: { kind: "open_link", label: "查看 AI 配置" },
      nextActions: [],
    };
  }

  const stage = String(status.status || "").toLowerCase();
  const blocked = stage === "blocked" || status.keyConfigured === false;
  const provider = String(status.providerLabel || status.providerFamily || "AI provider").trim();
  const summary =
    String(status.summary || "").trim() ||
    (blocked
      ? `${provider} API key 未配置，AI Money 会退回本地 fallback。`
      : `${provider} 已可用于 AI Money。`);

  return {
    stage: blocked ? "blocked" : "ready",
    visible: blocked,
    blockManualAnalysis: blocked,
    blockAutoRadar: blocked,
    tone: blocked ? "warning" : "success",
    title: blocked ? "先配置真实 AI" : "真实 AI 可用",
    summary,
    primaryHref: String(status.primaryHref || "/settings/ai").trim() || "/settings/ai",
    primaryAction: {
      kind: String(status.primaryAction?.kind || "open_link"),
      label: String(status.primaryAction?.label || (blocked ? "配置真实 AI" : "使用真实 AI 分析")),
    },
    nextActions: safeStringList(status.nextActions),
  };
}

export function aiProviderAnalysisAttemptFromGate(gate = null) {
  if (gate?.blockManualAnalysis) {
    return {
      kind: "redirect",
      href: String(gate.primaryHref || "/settings/ai").trim() || "/settings/ai",
      label: String(gate.primaryAction?.label || "配置真实 AI").trim() || "配置真实 AI",
    };
  }
  return { kind: "allow" };
}

function workflowConfidence({
  analysis,
  ranked,
  candidate,
  sentiment,
  capitalPlan,
  persistedActions,
  dailyRadarStatus,
}) {
  if (!analysis) return 0;
  const context = analysis?.context || {};
  const notes = safeStringList(context.notes);
  const drafts = Array.isArray(analysis?.strategyDrafts) ? analysis.strategyDrafts : [];
  const completedRuns = Array.isArray(ranked)
    ? ranked.filter((row) => row.score !== null).length
    : 0;
  const sentimentReview = persistedActionById(persistedActions, "sentiment_review");
  const paperWatch = persistedActionById(persistedActions, "paper_watch");
  const paperWatchEvidenceComplete =
    paperWatch?.status === "done" && paperWatchCompletionHasEvidence(paperWatch);
  let score = 10;
  if (Number(context.newsCount || 0) > 0) score += 5;
  if (Number(context.macroCount || 0) > 0) score += 5;
  if (Number(context.onchainCount || 0) > 0) score += 5;
  if (notes.length === 0) score += 10;
  if (drafts.length > 0) score += 15;
  if (completedRuns > 0) score += 20;
  if (candidate) score += 15;
  if (sentiment?.stage === "balanced" || sentimentReviewCompleted(sentimentReview)) score += 10;
  if (capitalPlan?.stage === "paper_sizing") score += 10;
  if (paperWatchEvidenceComplete) score += 10;
  const capped = dailyRadarStatus?.isStale ? Math.min(score, 45) : score;
  return Math.max(0, Math.min(95, Math.round(capped)));
}

function aiMoneyBriefAuditFromState({
  analysis = null,
  ranked = [],
  candidate = null,
  sentiment = null,
  capitalPlan = null,
  persistedActions = [],
  dailyRadarStatus = null,
} = {}) {
  const ready = [];
  const warnings = [];
  const blockers = [];

  if (!analysis) {
    pushUniqueText(blockers, "还没有 AI 目标分析，不能生成策略或执行建议。");
    if (dailyRadarStatus?.isStale) {
      pushUniqueText(warnings, "今日市场、舆论、宏观和链上上下文需要扫描。");
    }
    return {
      verdict: "等待 AI 扫描",
      tone: "warning",
      ready,
      warnings,
      blockers,
    };
  }

  const context = analysis?.context || {};
  const notes = safeStringList(context.notes);
  const contextTotal =
    Number(context.newsCount || 0) +
    Number(context.macroCount || 0) +
    Number(context.onchainCount || 0);
  const recentRunSummaries = Array.isArray(context.recentRunSummaries)
    ? context.recentRunSummaries
    : [];
  const recentRunCount = Math.max(
    Number(context.recentRunCount || 0),
    recentRunSummaries.length,
  );
  const drafts = Array.isArray(analysis?.strategyDrafts) ? analysis.strategyDrafts : [];
  const completedRuns = Array.isArray(ranked)
    ? ranked.filter((row) => row.score !== null)
    : [];
  const runningRuns = Array.isArray(ranked)
    ? ranked.filter((row) => row.score === null)
    : [];
  const sentimentReview = persistedActionById(persistedActions, "sentiment_review");
  const paperWatch = persistedActionById(persistedActions, "paper_watch");
  const paperWatchEvidenceComplete =
    paperWatch?.status === "done" && paperWatchCompletionHasEvidence(paperWatch);

  if (dailyRadarStatus?.isStale) {
    pushUniqueText(blockers, "今日市场风向已过期，需要重新扫描后再推进。");
  }
  if (notes.length > 0) {
    pushUniqueText(blockers, `数据上下文存在缺口：${notes[0]}`);
  } else if (contextTotal > 0) {
    pushUniqueText(ready, `已纳入 ${contextTotal} 条新闻、宏观或链上上下文。`);
  } else {
    pushUniqueText(blockers, "缺少新闻、宏观或链上数据上下文。");
  }

  if (recentRunCount > 0) {
    pushUniqueText(ready, `已参考 ${recentRunCount} 条历史 AI 运行记忆。`);
  } else {
    pushUniqueText(warnings, "没有历史 AI 运行记忆，判断只基于本次扫描。");
  }

  if (drafts.length > 0) {
    pushUniqueText(ready, `AI 已生成 ${drafts.length} 个策略草案。`);
  } else {
    pushUniqueText(blockers, "没有可验证策略草案。");
  }

  if (completedRuns.length > 0) {
    pushUniqueText(ready, `${completedRuns.length} 个回测验证已完成。`);
  } else if (runningRuns.length > 0) {
    pushUniqueText(warnings, `${runningRuns.length} 个回测仍在运行，先等待结果。`);
  } else {
    pushUniqueText(blockers, "没有回测验证，不能采用 paper 或测试网候选。");
  }

  if (candidate) {
    pushUniqueText(ready, `${candidate.strategyId} 已达到 paper 候选标准。`);
  } else if (completedRuns.length > 0) {
    pushUniqueText(blockers, "现有回测尚未筛出 paper 候选。");
  }

  if (sentiment?.stage === "balanced" || sentimentReviewCompleted(sentimentReview)) {
    pushUniqueText(ready, "风向 / 人性风险已平衡或已人工复核。");
  } else {
    pushUniqueText(warnings, "风向 / 人性偏差仍需复核，避免 FOMO 或拥挤交易。");
  }

  if (capitalPlan?.stage === "paper_sizing") {
    pushUniqueText(ready, "paper 资金计划已生成。");
  } else {
    pushUniqueText(warnings, "资金计划还不能用于 paper sizing。");
  }

  if (paperWatchEvidenceComplete) {
    pushUniqueText(ready, "paper 观察已完成。");
  } else if (paperWatch?.status === "done") {
    pushUniqueText(warnings, "paper 复盘证据不足，需补齐市场风向、舆论、人性和执行摩擦。");
  } else if (paperWatch) {
    pushUniqueText(warnings, "paper 观察仍在进行，不能进入测试网候选。");
  }

  const tone = blockers.length > 0 ? "danger" : warnings.length > 0 ? "warning" : "success";
  return {
    verdict:
      blockers.length > 0
        ? "存在阻塞"
        : warnings.length > 0
          ? "谨慎推进"
          : "证据充分",
    tone,
    ready,
    warnings,
    blockers,
  };
}

function briefValidationLabel(ranked) {
  if (!Array.isArray(ranked) || ranked.length === 0) return "未验证";
  const running = ranked.filter((row) => row.score === null).length;
  if (running > 0) return `${running} 进行中`;
  return `${ranked.length} 完成`;
}

function briefPrimaryFromDecision(decision) {
  if (decision?.primaryAction) return decision.primaryAction;
  if (decision?.primaryHref) {
    return { kind: "open_link", label: "打开下一步" };
  }
  return undefined;
}

export function aiMoneyBriefFromState({
  analysis = null,
  persistedActions = [],
  validationRuns = [],
  runs = [],
  dailyRadarStatus = null,
  providerGate = null,
} = {}) {
  const recentRuns = Array.isArray(runs) ? runs : [];
  if (!analysis) {
    const providerGateStage = String(providerGate?.stage || "").toLowerCase();
    if (providerGateStage === "blocked" || providerGateStage === "loading") {
      const loading = providerGateStage === "loading";
      const href = String(providerGate?.primaryHref || "/settings/ai").trim() || "/settings/ai";
      const label =
        String(providerGate?.primaryAction?.label || "").trim() ||
        (loading ? "查看 AI 配置" : "配置真实 AI");
      const summary =
        String(providerGate?.summary || "").trim() ||
        (loading
          ? "正在确认真实 AI provider 状态，确认前不会启动今日扫描。"
          : "真实 AI provider 还不可用，先完成 API key 配置和连接测试。");
      const providerMessage = loading
        ? "AI provider 状态仍在读取，确认前不会启动 fallback 扫描。"
        : "AI provider 当前不可用，先补齐真实 AI 配置。";

      return {
        stage: loading ? "provider_loading" : "provider_blocked",
        title: loading ? "正在确认 AI provider" : "先配置真实 AI",
        tone: "warning",
        confidence: 0,
        audit: {
          verdict: loading ? "等待真实 AI 状态" : "真实 AI 尚不可用",
          tone: "warning",
          ready: [],
          warnings: loading ? [providerMessage] : [],
          blockers: loading ? [] : [providerMessage],
        },
        summary,
        primaryHref: href,
        primaryAction: { kind: "open_link", label },
        metrics: [
          { label: "AI 置信度", value: "0%", hint: "等待真实 provider" },
          { label: "最近运行", value: recentRuns.length, hint: "可恢复旧目标" },
          { label: "执行状态", value: "等待配置", hint: "不触发交易" },
        ],
        checkpoints: loading
          ? [
              "等待真实 AI provider 状态返回。",
              "如长时间未返回，打开 provider 设置检查 API key。",
              "确认 provider ready 后再启动 AI 扫描和验证。",
            ]
          : [
              "先配置真实 AI provider。",
              "测试 provider API key 连接。",
              "确认 provider ready 后再让 AI 扫描市场并生成策略。",
            ],
      };
    }

    const primaryAction =
      dailyRadarStatus?.primaryAction || { kind: "scan_today", label: "今日扫描" };
    const audit = aiMoneyBriefAuditFromState({ dailyRadarStatus });
    return {
      stage: "idle",
      title: "让 AI 开始今日赚钱扫描",
      tone: "warning",
      confidence: 0,
      audit,
      summary:
        dailyRadarStatus?.summary
          ? `${dailyRadarStatus.summary} 先执行今日扫描，让 AI 汇总市场、舆论和链上变化。`
          :
        "还没有 AI 目标分析。先让 AI 扫描市场、舆论、宏观、链上和人性偏差，再进入回测验证。",
      primaryAction,
      metrics: [
        { label: "AI 置信度", value: "0%", hint: "等待分析证据" },
        { label: "最近运行", value: recentRuns.length, hint: "可恢复旧目标" },
        { label: "执行状态", value: "未启动", hint: "不触发交易" },
      ],
      checkpoints: [
        "扫描今日市场、舆论、宏观和链上。",
        "让 AI 生成策略蓝图和人性偏差检查。",
        "先回测验证，再考虑 paper 观察。",
      ],
    };
  }

  const ranked = rankBacktestValidation(validationRuns);
  const candidate = paperCandidateFromValidation(analysis, validationRuns);
  const decision = nextAIGoalDecision(analysis, persistedActions, validationRuns);
  const sentiment = aiSentimentCompassFromAnalysis(analysis);
  const capitalPlan = aiCapitalPlanFromState({ analysis, candidate, persistedActions });
  const audit = aiMoneyBriefAuditFromState({
    analysis,
    ranked,
    candidate,
    sentiment,
    capitalPlan,
    persistedActions,
    dailyRadarStatus,
  });
  const confidence = workflowConfidence({
    analysis,
    ranked,
    candidate,
    sentiment,
    capitalPlan,
    persistedActions,
    dailyRadarStatus,
  });
  const context = analysis?.context || {};
  const contextValue = `${Number(context.newsCount || 0)}/${Number(context.macroCount || 0)}/${Number(context.onchainCount || 0)}`;
  const capitalValue =
    capitalPlan.recommendedNotionalUsd > 0
      ? money(capitalPlan.recommendedNotionalUsd)
      : capitalPlan.title;

  if (dailyRadarStatus?.isStale) {
    return {
      stage: "stale_context",
      title: "先刷新今日市场风向",
      tone: "warning",
      confidence,
      audit,
      summary: `${dailyRadarStatus.summary || "今日市场上下文可能已过期。"}刷新后再让 AI 判断是否继续推进当前赚钱路径。`,
      primaryAction:
        dailyRadarStatus.primaryAction || { kind: "rescan_today", label: "重新扫描" },
      metrics: [
        { label: "AI 置信度", value: `${confidence}%`, hint: "已因上下文过期降权" },
        { label: "上下文", value: contextValue, hint: "新闻/宏观/链上" },
        { label: "验证", value: briefValidationLabel(ranked), hint: ranked[0]?.recommendation || "等待验证" },
      ],
      checkpoints: [
        "刷新今日市场、舆论、宏观和链上。",
        "确认人性偏差和拥挤交易是否变化。",
        "刷新后再推进回测、paper 或资金计划。",
      ],
    };
  }

  const primaryAction = briefPrimaryFromDecision(decision);
  return {
    stage: decision.stage,
    title: decision.title,
    tone: decision.tone,
    confidence,
    audit,
    summary: `${decision.summary} 风向：${sentiment.title}；资金：${capitalPlan.summary}`,
    primaryHref: decision.primaryHref,
    primaryAction,
    metrics: [
      { label: "AI 置信度", value: `${confidence}%`, hint: "基于上下文、回测、风向和资金计划" },
      { label: "验证", value: briefValidationLabel(ranked), hint: ranked[0]?.recommendation || "等待回测" },
      { label: "资金计划", value: capitalValue, hint: capitalPlan.stage },
    ],
    checkpoints: [
      ...safeStringList(decision.nextActions).slice(0, 3),
      `风向 / 人性：${sentiment.title}`,
      `paper 资金：${capitalPlan.recommendedNotionalUsd > 0 ? money(capitalPlan.recommendedNotionalUsd) : capitalPlan.stage}`,
    ].slice(0, 5),
  };
}

export function paperObservationPlanFromCandidate(analysis, candidate) {
  if (!candidate) return null;
  const draftName =
    candidate?.draft?.name || candidate?.strategyId || candidate?.draft?.symbol || "AI 策略";
  const safetyGates = safeStringList(analysis?.execution?.safetyGates);
  const humanFactors = safeStringList(analysis?.humanFactors);
  const drawdownLimit = paperDrawdownLimit(candidate);
  const capitalBoundary = paperCandidateCapitalBoundary(candidate);
  const watchTriggers = Array.isArray(analysis?.watchSignals)
    ? analysis.watchSignals
        .map((item) => ({
          source: String(item?.source || "market"),
          signal: String(item?.signal || "").trim(),
          interpretation: String(item?.interpretation || "").trim(),
          action: String(item?.action || "人工复核后再调整 paper 观察。").trim(),
        }))
        .filter((item) => item.signal)
        .slice(0, 5)
    : [];
  const humanTriggers = humanFactors.slice(0, 3).map((factor) => ({
    source: "human",
    signal: factor,
    interpretation: "行为偏差检查",
    action: "出现该行为偏差时暂停加仓或降低观察仓位。",
  }));

  return {
    title: `${draftName} paper 观察计划`,
    window: "24-72 小时",
    summary: `先用 paper 跟踪 ${draftName}，评分 ${candidate.score ?? "—"}，回测回撤 ${formatPercentValue(candidate.maxDrawdown)}，未通过观察前不进入测试网或主网。`,
    checklist: [
      "用预填策略入口复核参数，仅保存为 paper/testnet 观察对象。",
      capitalBoundary,
      "每日复核收益、回撤、交易频率和滑点假设，不只看单日盈亏。",
      "把新增新闻、宏观、链上和舆情信号同步到观察记录。",
      "准备继续推进前，先检查组合限额、kill switch 和交易闸门。",
    ].filter(Boolean),
    stopRules: [
      `paper 期间最大回撤超过 ${formatPercentValue(drawdownLimit)} 时暂停观察并回到策略蓝图。`,
      "验证评分低于 70 或收益/回撤结构恶化时，不进入测试网。",
      ...safetyGates
        .slice(0, 4)
        .map((gate) => `安全闸门未满足：${gate}。`),
    ],
    triggers: [...watchTriggers, ...humanTriggers],
    links: [
      { label: "预填策略", href: candidate.strategyHref || "/option" },
      { label: "回测详情", href: candidate.backtestHref || "/backtests" },
      { label: "交易闸门", href: "/settings/trading" },
    ],
  };
}

function paperCandidateCapitalBoundary(candidate) {
  const risk = normalizeRiskCaps(candidate?.draft?.riskCaps);
  if (!risk) return "";
  return `资金边界：paper 仓位不超过 ${money(risk.maxPositionUsd)}，杠杆不超过 ${Number(risk.maxLeverage).toFixed(0)}x，日亏损上限 ${money(risk.dailyLossCapUsd)}。`;
}

function compactPaperWatchNote(text, limit = 480) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
}

export function paperWatchActionPatchFromCandidate(analysis, candidate) {
  if (!candidate) return null;
  const plan = paperObservationPlanFromCandidate(analysis, candidate);
  const draftName =
    candidate?.draft?.name || candidate?.strategyId || candidate?.draft?.symbol || "AI 策略";
  const firstStopRule = safeStringList(plan?.stopRules)[0] || "";
  const capitalBoundary = paperCandidateCapitalBoundary(candidate);
  const firstTrigger = Array.isArray(plan?.triggers) ? plan.triggers[0] : null;
  const triggerText = firstTrigger
    ? `${firstTrigger.signal}${firstTrigger.action ? ` -> ${firstTrigger.action}` : ""}`
    : "";
  const sharpe = Number(candidate?.sharpe);
  const note = [
    `AI paper 观察计划：${draftName}，评分 ${candidate.score ?? "—"}，关联回测 ${candidate.runId || "—"}。`,
    `窗口：${plan?.window || "24-72 小时"}。`,
    `指标：收益 ${formatPercentValue(candidate.totalReturn)}，回撤 ${formatPercentValue(candidate.maxDrawdown)}，夏普 ${Number.isFinite(sharpe) ? sharpe.toFixed(2) : "—"}。`,
    capitalBoundary,
    firstStopRule ? `停止规则：${firstStopRule}` : "",
    triggerText ? `首个触发器：${triggerText}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    status: "manual",
    relatedId: candidate.strategyId || draftName,
    href: candidate.backtestHref || (candidate.runId ? `/backtests/${candidate.runId}` : undefined),
    note: compactPaperWatchNote(note),
  };
}

export function savedStrategyPaperWatchPatchFromBacktest(strategy, backtest) {
  const runId = String(backtest?.runId || "").trim();
  if (!runId || Number(backtest?.state) !== 3) return null;
  const ranked = rankBacktestValidation([backtest])[0] || {};
  const name = String(strategy?.name || backtest?.strategyId || "AI 策略").trim();
  const symbol = String(strategy?.execSymbol || "").trim();
  const score = ranked.score ?? "—";
  const note = [
    `${name}${symbol ? ` (${symbol})` : ""} 已完成回测；评分 ${score}，收益 ${formatPercentValue(ranked.totalReturn)}，回撤 ${formatPercentValue(ranked.maxDrawdown)}。`,
    "进入 24-72 小时 paper 观察：记录市场风向、舆论变化、人性偏差和真实执行摩擦；未通过观察前不进入测试网或主网。",
  ].join("");
  return {
    status: "manual",
    relatedId: runId,
    href: `/backtests/${encodeURIComponent(runId)}`,
    note: compactPaperWatchNote(note),
  };
}

export function aiPaperReviewCoachFromState({
  analysis = null,
  persistedActions = [],
  validationRuns = [],
} = {}) {
  const paperWatch = persistedActionById(persistedActions, "paper_watch");
  const candidate = paperCandidateFromValidation(analysis, validationRuns);
  const ranked = rankBacktestValidation(validationRuns);
  const best = ranked[0] || null;
  const note = String(paperWatch?.note || "");
  const candidateLabel =
    candidate?.draft?.name || candidate?.strategyId || best?.strategyId || "AI paper 候选";
  const paperPlan = paperObservationPlanFromCandidate(analysis, candidate);
  const primaryHref = paperWatch?.href || candidate?.backtestHref || best?.runId
    ? paperWatch?.href || candidate?.backtestHref || `/backtests/${encodeURIComponent(best.runId)}`
    : undefined;
  const items = [
    paperReviewCoachItem({
      id: "window",
      label: "24-72 小时窗口",
      detail: "确认观察时间足够，不用单日盈亏替代复盘。",
      note,
      keywords: ["24-72", "24h", "72h", "观察"],
    }),
    paperReviewCoachItem({
      id: "market",
      label: "市场风向",
      detail: "记录价格结构、宏观压力、链上变化或资金流方向。",
      note,
      keywords: ["市场风向", "market"],
    }),
    paperReviewCoachItem({
      id: "sentiment",
      label: "舆论 / 情绪",
      detail: "记录新闻叙事、社媒拥挤度、恐慌或过热变化。",
      note,
      keywords: ["舆论", "sentiment", "情绪"],
    }),
    paperReviewCoachItem({
      id: "human",
      label: "人性偏差",
      detail: "记录 FOMO、连续亏损后加仓冲动、追涨或过度自信。",
      note,
      keywords: ["人性偏差", "fomo", "behavior"],
    }),
    paperReviewCoachItem({
      id: "friction",
      label: "执行摩擦",
      detail: "记录滑点、成交频率、手续费、延迟和执行偏差。",
      note,
      keywords: ["执行摩擦", "滑点", "friction"],
    }),
    paperReviewCoachItem({
      id: "drawdown",
      label: "回撤表现",
      detail: "记录 paper 期间回撤、日亏损和是否触发停止规则。",
      note,
      keywords: ["回撤", "drawdown", "日亏损"],
    }),
    paperReviewCoachItem({
      id: "testnet_boundary",
      label: "测试网边界",
      detail: "明确下一步最多进入测试网前检查，不进入主网。",
      note,
      keywords: ["测试网", "不进入主网", "testnet", "mainnet"],
    }),
  ];
  const missingEvidence = items
    .filter((item) => item.status !== "done")
    .map((item) => item.label);

  if (!analysis) {
    return {
      stage: "idle",
      tone: "warning",
      title: "等待 AI 生成 paper 复盘",
      summary: "先启动 AI 目标分析和回测验证，复盘助手会在 paper 候选出现后给出证据清单。",
      candidateLabel,
      items,
      missingEvidence,
      completionNote: PAPER_WATCH_COMPLETION_NOTE,
      nextActions: ["运行 AI 扫描。", "让 AI 生成策略蓝图。", "完成回测后再进入 paper 观察。"],
    };
  }

  if (!candidate) {
    return {
      stage: ranked.length > 0 ? "waiting_candidate" : "waiting_validation",
      tone: "warning",
      title: "等待 paper 候选",
      summary: ranked.length > 0
        ? "已有回测结果，但还没有达到 paper 条件的候选。"
        : "还没有可复盘的 paper 候选，先完成 AI 回测验证。",
      candidateLabel,
      primaryHref,
      primaryAction: ranked.length > 0 ? undefined : { kind: "run_all_backtests", label: "运行 AI 回测" },
      items,
      missingEvidence,
      completionNote: PAPER_WATCH_COMPLETION_NOTE,
      nextActions: ranked.length > 0
        ? ["重做策略蓝图或降低风险参数。", "重新验证后再进入 paper。"]
        : ["运行 AI 批量回测。", "筛出 paper 候选后再复盘。"],
    };
  }

  if (!paperWatch) {
    const primaryAction = paperCandidatePrimaryActionForState(
      { kind: "accept_paper_candidate", label: "采用 paper 候选" },
      persistedActions,
    );
    return {
      stage: "ready_to_adopt",
      tone: "success",
      title: "可以开始 paper 观察",
      summary: `${candidateLabel} 已达到 paper 条件，先采用观察计划，再记录复盘证据。`,
      candidateLabel,
      primaryHref: candidate.backtestHref,
      primaryAction,
      items,
      missingEvidence,
      completionNote: PAPER_WATCH_COMPLETION_NOTE,
      nextActions: [
        "采用为 paper 候选。",
        ...(paperPlan?.checklist || []).slice(0, 2),
        "观察期间不要进入测试网或主网。",
      ].slice(0, 4),
    };
  }

  if (paperWatch.status !== "done") {
    return {
      stage: "observing",
      tone: "warning",
      title: "继续收集 paper 复盘证据",
      summary: `${candidateLabel} 正在 paper 观察中，补齐证据后再标记完成。`,
      candidateLabel,
      primaryHref,
      primaryAction: primaryHref ? { kind: "open_link", label: "查看观察" } : undefined,
      items,
      missingEvidence,
      completionNote: PAPER_WATCH_COMPLETION_NOTE,
      nextActions: [
        "记录 24-72 小时 paper 表现。",
        "补充市场风向、舆论、人性偏差和执行摩擦。",
        "若触发停止规则，回到策略蓝图而不是推进测试网。",
      ],
    };
  }

  const complete = paperWatchCompletionHasEvidence(paperWatch);
  return {
    stage: complete ? "review_complete" : "evidence_gap",
    tone: complete ? "success" : "warning",
    title: complete ? "Paper 复盘证据已齐" : "补齐 paper 复盘证据",
    summary: complete
      ? `${candidateLabel} 的 paper 复盘覆盖了风向、人性和执行摩擦，下一步最多进入测试网前检查。`
      : `${candidateLabel} 已标记完成，但复盘证据不足，不能进入测试网候选。`,
    candidateLabel,
    primaryHref,
    primaryAction: primaryHref ? { kind: "open_link", label: "查看观察" } : undefined,
    items,
    missingEvidence,
    completionNote: PAPER_WATCH_COMPLETION_NOTE,
    nextActions: complete
      ? ["复核组合限额和 kill switch。", "只进入测试网前检查，不进入主网。"]
      : ["补齐缺失证据。", "确认没有触发停止规则。", "再标记 paper 复盘完成。"],
  };
}

export function paperReviewCoachPrimaryAction(state, { hasCandidate = false } = {}) {
  const primary = state?.primaryAction;
  const href = String(state?.primaryHref || "").trim();
  if (
    (primary?.kind === "accept_paper_candidate" ||
      primary?.kind === "save_and_accept_paper_candidate") &&
    hasCandidate
  ) {
    return {
      kind: primary.kind,
      label: primary.label || "采用 paper 候选",
      href: undefined,
    };
  }
  if (primary?.kind === "open_link" && href) {
    return {
      kind: "open_link",
      label: primary.label || "查看观察",
      href,
    };
  }
  if (href) {
    return {
      kind: "open_link",
      label: "查看观察",
      href,
    };
  }
  return null;
}

const ACTION_STATUSES = new Set(["done", "ready", "manual", "blocked"]);
const MANUAL_TRANSITION_ACTION_IDS = new Set([
  "review",
  "data",
  "sentiment_review",
  "paper_watch",
  "gate",
]);

function startedBacktestPresentation(item, saved) {
  if (item?.id !== "backtest") return null;
  if (String(saved?.status || "").toLowerCase() !== "done") return null;
  if (backtestRunIdsFromAction(saved).length === 0) return null;
  return {
    statusLabel: "验证中",
    hrefLabel: "查看进度",
  };
}

function overlayPersistedActions(items, persistedActions) {
  if (!Array.isArray(persistedActions) || persistedActions.length === 0) return items;
  const byId = new Map();
  for (const action of persistedActions) {
    if (!action?.id) continue;
    byId.set(String(action.id), action);
  }
  return items.map((item) => {
    const saved = byId.get(item.id);
    if (!saved) return item;
    const savedStatus = String(saved.status || "");
    const thinDonePaperWatch =
      item.id === "paper_watch" &&
      savedStatus.toLowerCase() === "done" &&
      !paperWatchCompletionHasEvidence(saved);
    const thinDoneSentimentReview =
      item.id === "sentiment_review" &&
      savedStatus.toLowerCase() === "done" &&
      !sentimentReviewCompletionHasEvidence(saved);
    const status = thinDonePaperWatch || thinDoneSentimentReview
      ? "manual"
      : ACTION_STATUSES.has(saved.status)
        ? saved.status
        : item.status;
    const note = thinDonePaperWatch
      ? `${saved.note || "Paper 已标记完成"}；证据不足，补齐市场风向、舆论、人性偏差和执行摩擦后再推进。`
      : thinDoneSentimentReview
        ? `${saved.note || "风向 / 人性复核已标记完成"}；证据不足，补齐市场风向、舆论和人性偏差后再推进。`
        : saved.note || item.note;
    const presentation = startedBacktestPresentation(item, saved);
    return {
      ...item,
      status,
      relatedId: saved.relatedId || item.relatedId,
      href: saved.href || item.href,
      note,
      updatedAt: saved.updatedAt || item.updatedAt,
      ...(presentation || {}),
    };
  });
}

function persistedActionById(persistedActions, id) {
  if (!Array.isArray(persistedActions)) return null;
  return persistedActions.find((action) => action?.id === id) ?? null;
}

function paperWatchCompletionHasEvidence(action) {
  const note = String(action?.note || "").toLowerCase();
  if (!note) return false;
  const groups = [
    ["24-72", "24h", "72h", "观察"],
    ["市场风向", "market"],
    ["舆论", "sentiment", "情绪"],
    ["人性偏差", "fomo", "behavior"],
    ["执行摩擦", "滑点", "friction"],
    ["回撤", "drawdown", "日亏损"],
    ["测试网", "不进入主网", "testnet", "mainnet"],
  ];
  return groups.every((items) =>
    items.some((item) => note.includes(item.toLowerCase())),
  );
}

function sentimentReviewCompletionHasEvidence(action) {
  const note = String(action?.note || "").toLowerCase();
  if (!note) return true;
  const groups = [
    ["市场风向", "market"],
    ["舆论", "sentiment", "情绪"],
    ["人性偏差", "拥挤", "fomo", "behavior", "crowding"],
  ];
  return groups.every((items) =>
    items.some((item) => note.includes(item.toLowerCase())),
  );
}

function sentimentReviewCompleted(action) {
  return action?.status === "done" && sentimentReviewCompletionHasEvidence(action);
}

function paperEvidenceMatched(note, keywords) {
  const value = String(note || "").toLowerCase();
  return keywords.some((item) => value.includes(String(item).toLowerCase()));
}

function paperReviewCoachItem({ id, label, detail, note, keywords }) {
  const matched = paperEvidenceMatched(note, keywords);
  return {
    id,
    label,
    status: matched ? "done" : "missing",
    tone: matched ? "success" : "warning",
    detail,
  };
}

function aiGoalRunActionTimestamp(now) {
  const date = now instanceof Date ? now : new Date(now || Date.now());
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function firstDefaultActionDraft(drafts) {
  if (!Array.isArray(drafts)) return null;
  for (const draft of drafts) {
    const kind = String(draft?.kind || "").trim().toLowerCase();
    if (kind === "watch_only") continue;
    const name = String(draft?.name || "").trim();
    const symbol = String(draft?.symbol || "").trim();
    if (!name && !symbol) continue;
    return { name, symbol };
  }
  return null;
}

export function defaultAIGoalRunActionsFromAnalysis(analysis, now = new Date()) {
  const updatedAt = aiGoalRunActionTimestamp(now);
  const notes = safeStringList(analysis?.context?.notes);
  const humanFactors = safeStringList(analysis?.humanFactors);
  const watchSignals = Array.isArray(analysis?.watchSignals) ? analysis.watchSignals : [];
  const firstDraft = firstDefaultActionDraft(analysis?.strategyDrafts);
  const relatedId = firstDraft ? firstDraft.name || firstDraft.symbol : "";
  const dataBlocked = notes.length > 0;
  const needsSentimentReview = humanFactors.length > 0 || watchSignals.length > 0;
  const sentimentNote = sentimentReviewNoteFromEvidence(
    humanFactors,
    watchSignals,
    "AI 未发现明显额外舆论或人性阻塞。",
  );
  const hasTradableDraft = Boolean(firstDraft);

  const actions = [
    {
      id: "review",
      status: "manual",
      note: "复核市场判断、人性 / 舆情假设和风险上限。",
      updatedAt,
    },
    {
      id: "data",
      status: dataBlocked ? "blocked" : "done",
      note: dataBlocked
        ? notes.slice(0, 2).join("；")
        : "新闻、宏观、链上数据没有明显缺口。",
      updatedAt,
    },
    {
      id: "sentiment_review",
      status: needsSentimentReview ? "manual" : "done",
      note: needsSentimentReview
        ? sentimentNote
        : "AI 未发现明显额外舆论或人性阻塞。",
      updatedAt,
    },
    {
      id: "backtest",
      status: hasTradableDraft ? "ready" : "blocked",
      relatedId,
      note: "运行 AI 草案回测，比较收益、回撤、夏普和交易次数。",
      updatedAt,
    },
    {
      id: "strategy",
      status: hasTradableDraft ? "ready" : "blocked",
      relatedId,
      note: "把 AI 参数带入策略表单，人工复核后再保存。",
      updatedAt,
    },
  ];

  if (hasTradableDraft) {
    actions.push({
      id: "paper_watch",
      status: "blocked",
      relatedId,
      note: "等待回测结果后生成 24-72 小时 paper 观察计划；完成前必须复盘市场风向、舆论、人性偏差、执行摩擦和回撤表现。",
      updatedAt,
    });
  }

  actions.push(
    {
      id: "gate",
      status: "blocked",
      note: "测试网 / 主网前确认 kill switch、组合限额、交易闸门和 paper 复盘证据。",
      updatedAt,
    },
  );

  return actions;
}

export function manualActionTransition(action) {
  const id = String(action?.id || "");
  if (!MANUAL_TRANSITION_ACTION_IDS.has(id)) return null;
  const title = String(action?.title || id || "行动项").trim();
  const status = String(action?.status || "").toLowerCase();
  if (action?.status === "done") {
    return {
      label: "重新检查",
      nextStatus: "manual",
      note: `${title} 需要重新人工检查`,
    };
  }
  if (status === "blocked" && (id === "paper_watch" || id === "gate")) {
    return null;
  }
  if (id === "paper_watch") {
    return {
      label: "完成 paper 复盘",
      nextStatus: "done",
      note: appendTransitionEvidenceNote(action?.note, PAPER_WATCH_COMPLETION_NOTE),
    };
  }
  if (id === "sentiment_review") {
    return {
      label: "完成风向 / 人性复核",
      nextStatus: "done",
      note: SENTIMENT_REVIEW_COMPLETION_NOTE,
    };
  }
  if (id === "gate") {
    return {
      label: "完成执行闸门复核",
      nextStatus: "done",
      note: "已确认 kill switch、组合限额、交易闸门和 paper 复盘证据；只允许进入测试网前检查。",
    };
  }
  return {
    label: "标记完成",
    nextStatus: "done",
    note: `${title} 已人工确认完成`,
  };
}

function appendTransitionEvidenceNote(existingNote, completionNote) {
  const existing = String(existingNote || "").replace(/\s+/g, " ").trim();
  const completion = String(completionNote || "").replace(/\s+/g, " ").trim();
  if (!existing) return completion;
  if (!completion || existing.includes(completion)) return existing;
  return `${existing} ${completion}`;
}

export function nextAIGoalDecision(analysis, persistedActions = [], backtests = []) {
  const notes = safeStringList(analysis?.context?.notes);
  const runnableDrafts = runnableBacktestRequestsFromAnalysis(analysis);
  const ranked = rankBacktestValidation(backtests);
  const candidate = paperCandidateFromValidation(analysis, backtests);
  const backtestAction = persistedActionById(persistedActions, "backtest");
  const backtestActionDone = String(backtestAction?.status || "").toLowerCase() === "done";
  const startedValidationIds = backtestActionDone ? backtestRunIdsFromAction(backtestAction) : [];
  const paperWatch = persistedActionById(persistedActions, "paper_watch");
  const paperWatchEvidenceComplete =
    paperWatch?.status === "done" && paperWatchCompletionHasEvidence(paperWatch);
  const sentimentReview = persistedActionById(persistedActions, "sentiment_review");
  const sentimentReviewEvidenceComplete = sentimentReviewCompleted(sentimentReview);
  const best = ranked[0] ?? null;

  if (notes.length > 0 && ranked.length === 0) {
    return {
      stage: "data_gap",
      title: "先补齐数据上下文",
      tone: "warning",
      summary: "AI 已发现数据源缺口，先补齐新闻、宏观或链上上下文，再进入策略验证。",
      reasons: notes.slice(0, 3),
      nextActions: ["打开数据浏览器检查缺口", "补齐数据后重新生成 AI 蓝图"],
      primaryHref: "/data-explorer/news",
    };
  }

  if (ranked.some((row) => row.score === null)) {
    return {
      stage: "validating",
      title: "等待回测完成",
      tone: "warning",
      summary: "已有 AI 草案在验证中，先等待回测完成再进入 paper 决策。",
      reasons: ranked
        .filter((row) => row.score === null)
        .slice(0, 3)
        .map((row) => `${row.strategyId || row.runId} 仍在验证中`),
      nextActions: ["等待回测进度完成", "完成后刷新 AI 目标运行"],
      primaryHref: best?.runId ? `/backtests/${encodeURIComponent(best.runId)}` : undefined,
    };
  }

  if (ranked.length === 0 && startedValidationIds.length > 0) {
    const firstHref =
      backtestAction?.href || `/backtests/${encodeURIComponent(startedValidationIds[0])}`;
    return {
      stage: "validating",
      title: "读取已启动回测",
      tone: "warning",
      summary: "AI 已启动回测验证，先打开或等待现有结果，不重复创建回测。",
      reasons: startedValidationIds.slice(0, 3).map((id) => `${id} 已启动，等待结果恢复`),
      nextActions: ["打开已启动回测", "等待回测完成后再筛 paper 候选"],
      primaryHref: firstHref,
      primaryAction: { kind: "open_link", label: "打开已启动回测" },
    };
  }

  if (ranked.length === 0) {
    return {
      stage: "backtest",
      title: "先验证 AI 草案",
      tone: "warning",
      summary:
        runnableDrafts.length > 0
          ? "还没有回测证据，先批量回测 AI 生成的可交易草案。"
          : "当前只有观察型草案，先补充可验证策略或继续观察市场。",
      reasons:
        runnableDrafts.length > 0
          ? [`${runnableDrafts.length} 个草案可进入回测`]
          : ["没有可回测草案"],
      nextActions:
        runnableDrafts.length > 0
          ? ["运行 AI 批量回测", "比较收益、回撤、夏普和交易次数"]
          : ["重新生成包含可验证策略的蓝图", "继续观察舆情和市场结构"],
      primaryHref: undefined,
      primaryAction:
        runnableDrafts.length > 0
          ? { kind: "run_all_backtests", label: "运行 AI 批量回测" }
          : undefined,
    };
  }

  if (!candidate) {
    return {
      stage: "redesign",
      title: "暂停推进并重做蓝图",
      tone: "danger",
      summary: "现有回测没有达到 paper 候选标准，不应进入测试网或主网。",
      reasons: ranked.slice(0, 3).map((row) => {
        const score = row.score === null ? "—" : row.score;
        return `${row.strategyId || row.runId}: ${row.recommendation}，评分 ${score}`;
      }),
      nextActions: ["重新生成 AI 蓝图", "降低杠杆或收紧风险上限", "检查是否存在市场叙事或数据缺口"],
      primaryHref: undefined,
      primaryAction: { kind: "analyze_and_validate", label: "让 AI 重做蓝图" },
    };
  }

  const candidateSummary = `${candidate.strategyId} 评分 ${candidate.score}，收益 ${formatPercentValue(candidate.totalReturn)}，回撤 ${formatPercentValue(candidate.maxDrawdown)}，夏普 ${Number(candidate.sharpe).toFixed(2)}`;
  const sentimentCompass = aiSentimentCompassFromAnalysis(analysis);
  const needsSentimentReview =
    sentimentCompass.stage !== "balanced" && !sentimentReviewEvidenceComplete;

  if (!paperWatch && needsSentimentReview) {
    return {
      stage: "sentiment_review",
      title: "先复核风向 / 人性",
      tone: "warning",
      summary: `${candidateSummary}，但 AI 风向判断为 ${sentimentCompass.title}。先确认舆论、人性偏差和降仓条件，再采用 paper 候选。`,
      reasons: sentimentCompass.risks.slice(0, 4),
      nextActions: [
        "复核 AI 风向 / 人性面板",
        "确认是否降低 paper 仓位或暂停观察",
        "标记完成后再采用 paper 候选",
      ],
      primaryHref: "/data-explorer/news",
    };
  }

  if (!paperWatch) {
    return {
      stage: "paper_candidate",
      title: "采用 paper 候选",
      tone: "success",
      summary: `${candidateSummary}。先采用为 paper 候选，进入 24-72 小时观察。`,
      reasons: ["回测满足 paper 候选门槛", "仍需观察舆情、人性因素和真实执行摩擦"],
      nextActions: ["点击采用为 paper 候选", "按观察计划记录触发器变化"],
      primaryHref: candidate.backtestHref,
      primaryAction: { kind: "accept_paper_candidate", label: "采用为 paper 候选" },
    };
  }

  if (paperWatch.status !== "done" || !paperWatchEvidenceComplete) {
    const missingEvidence = paperWatch.status === "done";
    return {
      stage: "paper_watch",
      title: missingEvidence ? "补齐 paper 复盘证据" : "继续 paper 观察",
      tone: "warning",
      summary: missingEvidence
        ? `${candidateSummary}。paper 观察已标记完成，但复盘证据不足，不建议进入测试网。`
        : `${candidateSummary}。paper 观察尚未完成，不建议进入测试网。`,
      reasons: missingEvidence
        ? [
            "需要记录市场风向、舆论、人性偏差和执行摩擦。",
            paperWatch.note || "缺少 paper 复盘记录。",
          ]
        : [
            paperWatch.note || "需要完成 24-72 小时观察",
            "观察期间要复核舆情、拥挤度、滑点和回撤",
          ],
      nextActions: missingEvidence
        ? ["补齐 paper 复盘证据", "确认没有触发停止规则", "再评估是否只进入测试网前检查"]
        : ["继续观察 paper 候选", "若触发停止规则则回到策略蓝图"],
      primaryHref: paperWatch.href || candidate.backtestHref,
    };
  }

  const canTestnet =
    candidate.score >= 75 &&
    candidate.totalReturn > 0 &&
    candidate.sharpe >= 1 &&
    candidate.maxDrawdown <= 0.12;
  if (canTestnet) {
    return {
      stage: "testnet_candidate",
      title: "可作为测试网候选",
      tone: "success",
      summary: `${candidateSummary}，且 paper 观察已标记完成。下一步最多进入测试网，不建议直接主网。`,
      reasons: ["回测评分和回撤结构达标", "paper 观察已完成", "主网仍需独立闸门和人工确认"],
      nextActions: ["打开策略预填并补齐凭证", "先启用测试网或继续小额 paper", "检查 kill switch 和组合限额"],
      primaryHref: candidate.strategyHref,
      primaryAction: { kind: "open_link", label: "打开策略预填" },
    };
  }

  return {
    stage: "continue_paper",
    title: "继续 paper，不进测试网",
    tone: "warning",
    summary: `${candidateSummary}，但仍未达到测试网候选阈值。`,
    reasons: ["评分、夏普或回撤结构未完全达标", "继续观察比提高执行风险更合适"],
    nextActions: ["继续 paper 观察", "重新优化参数或重做蓝图"],
    primaryHref: paperWatch.href || candidate.backtestHref,
  };
}

export function actionPlanFromAnalysis(analysis, persistedActions = []) {
  const drafts = Array.isArray(analysis?.strategyDrafts) ? analysis.strategyDrafts : [];
  const runnableDrafts = drafts.filter((draft) => backtestRequestFromDraft(draft) !== null);
  const firstRunnable = runnableDrafts[0] ?? null;
  const notes = Array.isArray(analysis?.context?.notes) ? analysis.context.notes : [];
  const sentimentCompass = aiSentimentCompassFromAnalysis(analysis);
  const watchSignals = Array.isArray(analysis?.watchSignals) ? analysis.watchSignals : [];
  const needsSentimentReview = sentimentCompass.stage !== "balanced" || watchSignals.length > 0;
  const sentimentReviewDetail = needsSentimentReview
    ? sentimentReviewNoteFromEvidence(analysis?.humanFactors, watchSignals, sentimentCompass.summary)
    : "AI 未发现明显额外舆论或人性阻塞。";
  const relatedId = firstRunnable ? firstRunnable.name || firstRunnable.symbol || "" : "";
  const baseItems = [
    {
      id: "review",
      title: "复核 AI 结论",
      detail: "先确认市场判断、人性/舆情假设和风险上限。",
      status: "manual",
      action: "review",
    },
    {
      id: "data",
      title: notes.length > 0 ? "补齐数据上下文" : "数据上下文已接入",
      detail:
        notes.length > 0
          ? notes.slice(0, 2).join("；")
          : "新闻、宏观、链上数据没有明显缺口。",
      status: notes.length > 0 ? "blocked" : "done",
      action: "data",
    },
    {
      id: "sentiment_review",
      title: "复核风向 / 人性",
      detail: sentimentReviewDetail,
      status: needsSentimentReview ? "manual" : "done",
      action: "sentiment_review",
    },
    {
      id: "backtest",
      title: "验证 AI 草案回测",
      detail:
        firstRunnable !== null
          ? `优先回测 ${firstRunnable.name || firstRunnable.symbol}，看收益/回撤是否匹配目标。`
          : "当前只有观察型草案，不能直接回测。",
      status: firstRunnable !== null ? "ready" : "blocked",
      action: "backtest",
      targetDraftName: firstRunnable?.name,
    },
    {
      id: "strategy",
      title: "预填策略草案",
      detail:
        firstRunnable !== null
          ? "把 AI 参数带入策略表单，人工复核后补齐交易所凭证。"
          : "没有可创建的交易策略草案。",
      status: firstRunnable !== null ? "ready" : "blocked",
      action: "strategy",
      targetDraftName: firstRunnable?.name,
    },
    ...(firstRunnable !== null
      ? [
          {
            id: "paper_watch",
            title: "Paper 观察与复盘",
            detail: "回测通过后创建 24-72 小时 paper 观察；完成前必须记录市场风向、舆论、人性偏差和执行摩擦。",
            status: "blocked",
            action: "paper_watch",
            targetDraftName: firstRunnable?.name,
            relatedId,
          },
        ]
      : []),
    {
      id: "gate",
      title: "检查执行闸门",
      detail: "测试网 / 主网前确认 kill switch、组合限额、交易闸门和 paper 复盘证据。",
      status: "blocked",
      action: "gate",
    },
  ];
  const items = overlayPersistedActions(baseItems, persistedActions);
  const paperWatch = persistedActionById(persistedActions, "paper_watch");
  if (paperWatch && !items.some((item) => item.id === "paper_watch")) {
    return [
      ...items,
      {
        id: "paper_watch",
        title: "Paper 观察与复盘",
        detail: "按 AI 观察计划跟踪 24-72 小时，再决定是否进入测试网。",
        status: ACTION_STATUSES.has(paperWatch.status) ? paperWatch.status : "manual",
        action: "paper_watch",
        relatedId: paperWatch.relatedId,
        href: paperWatch.href,
        note: paperWatch.note,
        updatedAt: paperWatch.updatedAt,
      },
    ];
  }
  return items;
}

export function parseStrategyPreset(searchParams) {
  const source = searchParams.get("source");
  const isPreset = source === "ai-goal";
  const risk = riskCapsFromSearchParams(searchParams);
  const maxLeverage = risk ? clampInt(risk.maxLeverage, DEFAULT_PRESET.positionLevel, 1, 125) : 125;
  const leverageFallback = Math.min(DEFAULT_PRESET.positionLevel, maxLeverage);
  const maxOrderGroupMargin = risk
    ? clampInt(risk.maxPositionUsd, DEFAULT_PRESET.orderGroupMargin, 1, 1000000)
    : 1000000;
  const orderGroupMarginFallback = Math.min(DEFAULT_PRESET.orderGroupMargin, maxOrderGroupMargin);
  return {
    ...DEFAULT_PRESET,
    isPreset,
    name: normalizeName(searchParams.get("name") || DEFAULT_PRESET.name),
    kind: normalizeKind(searchParams.get("kind")),
    execSymbol: normalizeSymbol(searchParams.get("execSymbol")),
    positionLevel: clampInt(
      searchParams.get("positionLevel"),
      leverageFallback,
      1,
      maxLeverage,
    ),
    openPositionStopTime: clampInt(
      searchParams.get("openPositionStopTime"),
      DEFAULT_PRESET.openPositionStopTime,
      0,
      1440,
    ),
    orderGroupMargin: clampInt(
      searchParams.get("orderGroupMargin"),
      orderGroupMarginFallback,
      0,
      maxOrderGroupMargin,
    ),
    stopProfitRate: clampNumber(
      searchParams.get("stopProfitRate"),
      DEFAULT_PRESET.stopProfitRate,
      0,
      1,
    ),
    stopLossRate: clampNumber(
      searchParams.get("stopLossRate"),
      DEFAULT_PRESET.stopLossRate,
      0,
      1,
    ),
    profitRateAfterAtAddPosition: clampNumber(
      searchParams.get("profitRateAfterAtAddPosition"),
      DEFAULT_PRESET.profitRateAfterAtAddPosition,
      0,
      1,
    ),
    createCostOrderInProfit: searchParams.get("createCostOrderInProfit") === "true",
    createPositions: readPositions(searchParams.get("createPositions")),
    aiRunId: String(searchParams.get("aiRunId") || "").trim(),
    risk,
  };
}

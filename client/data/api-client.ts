import {
  TypeAccount,
  TypeApproveRecommendation,
  TypeBacktest,
  TypeBacktestHandle,
  TypeBacktestTrade,
  TypeBalance,
  TypeCreateAccount,
  TypeCreateBacktest,
  TypeEquityPoint,
  TypeExchange,
  TypeExchangeMeta,
  TypeMacroPoint,
  TypeMainnetStatus,
  TypeNewsItem,
  TypeOnchainPoint,
  TypeOptimizationRun,
  TypeOption,
  TypeOrderLog,
  TypePortfolioSummary,
  TypePosition,
  TypeRecommendation,
  TypeRecommendationStatus,
  TypeSetLive,
  TypeDashboardSummary,
  TypeStrategyPerformance,
  TypeStudyHandle,
  TypeSubmitOrder,
} from "./type";

// Base URL is env-driven so the client can talk to the Go gateway in dev
// (default :3001) or to a deployed gateway via NEXT_PUBLIC_API_URL in prod.
const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
const parseUrl = (path: string) => baseUrl + `/${path}`.replace("//", "/");

// R2 multi-tenant: localStorage key the dashboard uses to set a per-browser
// userId for the gateway's `X-User-Id` header. Absent / empty → no header
// → gateway falls back to "default". This is a TRUST-THE-FRONTEND dev
// convention; a future auth provider extracts the verified user and sets
// the header before forwarding to the gateway.
const USER_ID_STORAGE_KEY = "finance_next_user_id";

function userIdHeader(): Record<string, string> {
  if (typeof window === "undefined") return {}; // SSR / server components
  try {
    const v = window.localStorage.getItem(USER_ID_STORAGE_KEY);
    return v ? { "X-User-Id": v } : {};
  } catch {
    return {};
  }
}

// apiFetch is the project-wide fetch wrapper. It merges in the X-User-Id
// header (when localStorage has one) and preserves all other init fields.
// Existing call sites use vanilla fetch — we leave those as-is rather than
// rewriting every line; only the wrapper version is added so callers that
// opt in can pick it up. Server-side rendered code paths (no window) get
// the same fetch with no extra headers, matching the dev fallback.
export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const merged: RequestInit = {
    ...init,
    headers: {
      ...userIdHeader(),
      ...(init.headers ?? {}),
    },
  };
  return fetch(input, merged);
}

// ApiError carries the HTTP status alongside the message so UI components
// can render a friendly Chinese message based on the status (see
// `client/components/api-error.tsx`). Falls back to the raw body when the
// gateway returns a non-JSON error.
export class ApiError extends Error {
  status: number;
  raw?: string;

  constructor(status: number, message: string, raw?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.raw = raw;
  }
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try {
      const parsed = JSON.parse(text);
      // Echo-style {message: "..."} or {error: "..."}.
      if (parsed && typeof parsed === "object") {
        message =
          (parsed as { message?: string; error?: string }).message ??
          (parsed as { message?: string; error?: string }).error ??
          text;
      }
    } catch {
      // Non-JSON body; keep the raw text as the message.
    }
    throw new ApiError(res.status, message, text);
  }
  return (await res.json()) as T;
}

// ---------- Options (legacy strategy resource) ----------

export const getOptions = async () => {
  const res = await apiFetch(parseUrl("v1/option"), { cache: "no-store" });
  return await res.json();
};

export const createOption = async (option: TypeOption) => {
  const res = await apiFetch(parseUrl("v1/option"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(option),
  });
  return await res.json();
};

// ---------- Accounts (phase 1) ----------

export const listAccounts = async (): Promise<TypeAccount[]> => {
  const res = await apiFetch(parseUrl("v1/accounts"), { cache: "no-store" });
  return jsonOrThrow<TypeAccount[]>(res);
};

export const getAccount = async (id: string): Promise<TypeAccount> => {
  const res = await apiFetch(parseUrl(`v1/accounts/${id}`), { cache: "no-store" });
  return jsonOrThrow<TypeAccount>(res);
};

export const createAccount = async (input: TypeCreateAccount): Promise<TypeAccount> => {
  const res = await apiFetch(parseUrl("v1/accounts"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return jsonOrThrow<TypeAccount>(res);
};

export const deleteAccount = async (id: string): Promise<void> => {
  const res = await apiFetch(parseUrl(`v1/accounts/${id}`), { method: "DELETE" });
  await jsonOrThrow<{ success: boolean }>(res);
};

export const getBalances = async (id: string): Promise<TypeBalance[]> => {
  const res = await apiFetch(parseUrl(`v1/accounts/${id}/balances`), { cache: "no-store" });
  return jsonOrThrow<TypeBalance[]>(res);
};

export const getPositions = async (id: string): Promise<TypePosition[]> => {
  const res = await apiFetch(parseUrl(`v1/accounts/${id}/positions`), { cache: "no-store" });
  return jsonOrThrow<TypePosition[]>(res);
};

// ---------- Market data (phase 2) ----------

export type TypeOhlcvBar = {
  exchange: string;
  symbol: string;
  timeframe: string;
  time: string; // RFC3339
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export const getOhlcv = async (
  exchange: string,
  symbol: string,
  timeframe: string,
  start: Date,
  end: Date,
): Promise<TypeOhlcvBar[]> => {
  const params = new URLSearchParams({
    exchange,
    symbol,
    timeframe,
    start: start.toISOString(),
    end: end.toISOString(),
  });
  const res = await apiFetch(parseUrl(`v1/market/ohlcv?${params.toString()}`), {
    cache: "no-store",
  });
  return jsonOrThrow<TypeOhlcvBar[]>(res);
};

// ---------- Backtests (phase 3) ----------

export const listBacktests = async (
  strategyId?: string,
): Promise<TypeBacktest[]> => {
  const qs = strategyId ? `?strategyId=${encodeURIComponent(strategyId)}` : "";
  const res = await apiFetch(parseUrl(`v1/backtests${qs}`), { cache: "no-store" });
  return jsonOrThrow<TypeBacktest[]>(res);
};

export const getBacktest = async (id: string): Promise<TypeBacktest> => {
  const res = await apiFetch(parseUrl(`v1/backtests/${id}`), { cache: "no-store" });
  return jsonOrThrow<TypeBacktest>(res);
};

export const createBacktest = async (
  input: TypeCreateBacktest,
): Promise<TypeBacktestHandle> => {
  const res = await apiFetch(parseUrl("v1/backtests"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return jsonOrThrow<TypeBacktestHandle>(res);
};

export const getEquityCurve = async (
  id: string,
  limit = 50_000,
): Promise<TypeEquityPoint[]> => {
  const res = await apiFetch(
    parseUrl(`v1/backtests/${id}/equity?limit=${limit}`),
    { cache: "no-store" },
  );
  return jsonOrThrow<TypeEquityPoint[]>(res);
};

export const getTrades = async (id: string): Promise<TypeBacktestTrade[]> => {
  const res = await apiFetch(parseUrl(`v1/backtests/${id}/trades`), {
    cache: "no-store",
  });
  return jsonOrThrow<TypeBacktestTrade[]>(res);
};

// ---------- Strategies / live execution (phase 4) ----------

// `getStrategies` is just an alias for the legacy /option list — the
// underlying Mongo collection is the same. Phase 6 will fork the data
// model.
export const getStrategies = async (): Promise<TypeOption[]> => {
  const res = await apiFetch(parseUrl("v1/option"), { cache: "no-store" });
  return jsonOrThrow<TypeOption[]>(res);
};

export const getStrategy = async (id: string): Promise<TypeOption> => {
  const res = await apiFetch(parseUrl(`v1/option/${id}`), { cache: "no-store" });
  return jsonOrThrow<TypeOption>(res);
};

// Wave 2 / Phase C — strategy detail performance aggregate. Single
// gateway call returns KPIs + equity curve + last-10 orders. Designed
// to be invoked from a server component (cache: no-store keeps each
// router.refresh() fresh).
export const getStrategyPerformance = async (
  id: string,
): Promise<TypeStrategyPerformance> => {
  const res = await apiFetch(parseUrl(`v1/strategies/${id}/performance`), {
    cache: "no-store",
  });
  return jsonOrThrow<TypeStrategyPerformance>(res);
};

// DELETE wrapper for the legacy /option resource — drives the "Danger
// zone" button on the strategy detail page. Returns whatever the gateway
// returns (typically `{success:true}` or an Echo error JSON which
// jsonOrThrow surfaces as ApiError).
export const deleteOption = async (id: string): Promise<void> => {
  const res = await apiFetch(parseUrl(`v1/option/${id}`), { method: "DELETE" });
  // The Echo handler returns a small JSON envelope; we don't need its
  // contents but we still want to bubble non-2xx as ApiError.
  await jsonOrThrow<unknown>(res);
};

export const getOrders = async (
  strategyId: string,
  limit = 50,
): Promise<TypeOrderLog[]> => {
  const res = await apiFetch(
    parseUrl(`v1/strategies/${strategyId}/orders?limit=${limit}`),
    { cache: "no-store" },
  );
  return jsonOrThrow<TypeOrderLog[]>(res);
};

export const setLive = async (
  strategyId: string,
  body: TypeSetLive,
): Promise<TypeOption> => {
  const res = await apiFetch(parseUrl(`v1/strategies/${strategyId}/live`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return jsonOrThrow<TypeOption>(res);
};

// Risk caps live on the Option document; the existing PUT /option/:id
// endpoint already supports updating arbitrary fields. We expose a
// dedicated wrapper for clarity.
export const setRisk = async (
  strategyId: string,
  risk: TypeOption["risk"],
): Promise<TypeOption> => {
  const res = await apiFetch(parseUrl(`v1/option/${strategyId}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ risk }),
  });
  return jsonOrThrow<TypeOption>(res);
};

// Partial Option update — used by the strategy-detail params panel
// for inline edits to the core grid_dca fields (stopProfitRate,
// stopLossRate, positionLevel, etc.). Backend DTO is `UpdateOptionDTO`
// with pointer fields, so any subset of TypeOption is accepted.
export const updateOption = async (
  strategyId: string,
  patch: Partial<TypeOption>,
): Promise<TypeOption> => {
  const res = await apiFetch(parseUrl(`v1/option/${strategyId}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return jsonOrThrow<TypeOption>(res);
};

// Admin-only manual order submission. Requires the `X-Admin-Key`
// header — same auth pattern as /market/ingest.
export const submitOrder = async (
  strategyId: string,
  adminKey: string,
  body: TypeSubmitOrder,
): Promise<{ streamId: string }> => {
  const res = await apiFetch(
    parseUrl(`v1/strategies/${strategyId}/live/submit-order`),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Key": adminKey,
      },
      body: JSON.stringify(body),
    },
  );
  return jsonOrThrow<{ streamId: string }>(res);
};

// ---- Mainnet enable flow (admin) -----------------------------------

export const requestMainnetToken = async (
  adminKey: string,
): Promise<{ message: string; tokenHint: string; ttlSec: number }> => {
  const res = await apiFetch(parseUrl("v1/admin/mainnet/request-token"), {
    method: "POST",
    headers: { "X-Admin-Key": adminKey },
  });
  return jsonOrThrow<{ message: string; tokenHint: string; ttlSec: number }>(
    res,
  );
};

export const confirmMainnetToken = async (
  adminKey: string,
  token: string,
): Promise<TypeMainnetStatus> => {
  const res = await apiFetch(parseUrl("v1/admin/mainnet/confirm"), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
    body: JSON.stringify({ token }),
  });
  return jsonOrThrow<TypeMainnetStatus>(res);
};

export const getMainnetStatus = async (
  adminKey: string,
): Promise<TypeMainnetStatus> => {
  const res = await apiFetch(parseUrl("v1/admin/mainnet/status"), {
    headers: { "X-Admin-Key": adminKey },
    cache: "no-store",
  });
  return jsonOrThrow<TypeMainnetStatus>(res);
};

// ---------- Phase 5 — exchange meta + cross-exchange portfolio ----------

export const getExchangeMeta = async (
  exchange?: TypeExchange,
  symbol?: string,
): Promise<TypeExchangeMeta | TypeExchangeMeta[]> => {
  const params = new URLSearchParams();
  if (exchange) params.set("exchange", exchange);
  if (symbol) params.set("symbol", symbol);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const res = await apiFetch(parseUrl(`v1/exchange/meta${qs}`), {
    cache: "no-store",
  });
  return jsonOrThrow<TypeExchangeMeta | TypeExchangeMeta[]>(res);
};

export const getPortfolioSummary = async (): Promise<TypePortfolioSummary> => {
  const res = await apiFetch(parseUrl("v1/portfolio/summary"), {
    cache: "no-store",
  });
  return jsonOrThrow<TypePortfolioSummary>(res);
};

// ---------- Phase 6 — AI recommendations + optimization ----------

export const listRecommendations = async (
  status?: TypeRecommendationStatus,
  strategyId?: string,
): Promise<TypeRecommendation[]> => {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (strategyId) params.set("strategyId", strategyId);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const res = await apiFetch(parseUrl(`v1/recommendations${qs}`), {
    cache: "no-store",
  });
  return jsonOrThrow<TypeRecommendation[]>(res);
};

export const getRecommendation = async (
  id: string,
): Promise<TypeRecommendation> => {
  const res = await apiFetch(parseUrl(`v1/recommendations/${id}`), {
    cache: "no-store",
  });
  return jsonOrThrow<TypeRecommendation>(res);
};

export const approveRecommendation = async (
  id: string,
): Promise<TypeApproveRecommendation> => {
  const res = await apiFetch(parseUrl(`v1/recommendations/${id}/approve`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  return jsonOrThrow<TypeApproveRecommendation>(res);
};

export const rejectRecommendation = async (
  id: string,
): Promise<TypeRecommendation> => {
  const res = await apiFetch(parseUrl(`v1/recommendations/${id}/reject`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  return jsonOrThrow<TypeRecommendation>(res);
};

export const startOptimization = async (
  strategyId: string,
  body?: { force?: boolean; nTrialsOverride?: number },
): Promise<TypeStudyHandle> => {
  const res = await apiFetch(parseUrl(`v1/strategies/${strategyId}/optimize`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return jsonOrThrow<TypeStudyHandle>(res);
};

export const getOptimization = async (
  studyId: string,
): Promise<TypeOptimizationRun> => {
  const res = await apiFetch(parseUrl(`v1/optimizations/${studyId}`), {
    cache: "no-store",
  });
  return jsonOrThrow<TypeOptimizationRun>(res);
};

export const listOptimizations = async (
  strategyId?: string,
): Promise<TypeOptimizationRun[]> => {
  const qs = strategyId ? `?strategyId=${encodeURIComponent(strategyId)}` : "";
  const res = await apiFetch(parseUrl(`v1/optimizations${qs}`), {
    cache: "no-store",
  });
  return jsonOrThrow<TypeOptimizationRun[]>(res);
};

// wsUrl returns the gateway's /ws endpoint, derived from the API base URL by
// swapping http→ws and stripping the /api suffix.
export function wsUrl(): string {
  const u = new URL(baseUrl);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  // Drop "/api" suffix if present; /ws lives at the gateway root.
  u.pathname = u.pathname.replace(/\/api\/?$/, "") + "/ws";
  return u.toString();
}

// ---------- Phase 7 — admin: kill switch, portfolio limits, audit ----------

export interface TypeSystemState {
  id: string;
  tradingHalted: boolean;
  haltedAt?: string;
  haltedReason?: string;
  haltedBy?: string;
}

export interface TypePortfolioLimits {
  userId: string;
  maxOpenNotionalUsd: number;
  maxOpenPositionsCount: number;
  maxDailyLossUsd: number;
}

export interface TypeAuditEntry {
  id: string;
  ts: string;
  actor: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  method: string;
  path: string;
  statusCode: number;
  payload?: unknown;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

const adminHeaders = (key: string) => ({
  "Content-Type": "application/json",
  "X-Admin-Key": key,
});

export const getSystemState = async (
  adminKey: string,
): Promise<TypeSystemState> => {
  const res = await apiFetch(parseUrl("v1/admin/system-state"), {
    cache: "no-store",
    headers: { "X-Admin-Key": adminKey },
  });
  return jsonOrThrow<TypeSystemState>(res);
};

export const haltTrading = async (
  adminKey: string,
  reason: string,
): Promise<TypeSystemState> => {
  const res = await apiFetch(parseUrl("v1/admin/halt"), {
    method: "POST",
    headers: adminHeaders(adminKey),
    body: JSON.stringify({ reason }),
  });
  return jsonOrThrow<TypeSystemState>(res);
};

export const resumeTrading = async (
  adminKey: string,
): Promise<TypeSystemState> => {
  const res = await apiFetch(parseUrl("v1/admin/resume"), {
    method: "POST",
    headers: adminHeaders(adminKey),
  });
  return jsonOrThrow<TypeSystemState>(res);
};

export const getPortfolioLimits = async (
  adminKey: string,
): Promise<TypePortfolioLimits> => {
  const res = await apiFetch(parseUrl("v1/admin/portfolio-limits"), {
    cache: "no-store",
    headers: { "X-Admin-Key": adminKey },
  });
  return jsonOrThrow<TypePortfolioLimits>(res);
};

export const setPortfolioLimits = async (
  adminKey: string,
  limits: Omit<TypePortfolioLimits, "userId">,
): Promise<TypePortfolioLimits> => {
  const res = await apiFetch(parseUrl("v1/admin/portfolio-limits"), {
    method: "PUT",
    headers: adminHeaders(adminKey),
    body: JSON.stringify(limits),
  });
  return jsonOrThrow<TypePortfolioLimits>(res);
};

// ---- Phase D wave 3 — AI configuration + prompts (admin) ----
//
// Two complementary endpoints. /admin/ai/config drives the editable
// knobs (model family, model names, base URLs, budgets, lookback). It
// gets a PUT for partial updates — the gateway merges into the
// persisted document and falls back to env values for unset fields.
// /admin/ai/prompts returns the hard-coded system prompts that the
// quant worker currently has loaded; surface-area for prompt-injection
// guardrails so they're explicitly NOT runtime-editable. The endpoint
// is a quant gRPC proxy and returns 503 when quant is unreachable —
// callers must handle that case (we render a warning callout).
export type TypeAIConfig = {
  modelFamily: "claude" | "openai";
  anthropicPrimaryModel: string;
  anthropicRefineModel: string;
  openaiPrimaryModel: string;
  openaiRefineModel: string;
  anthropicBaseURL: string;
  openaiBaseURL: string;
  budgetUsdPerStudy: number;
  budgetUsdPerDay: number;
  lookbackDays: number;
  updatedAt: string;
  anthropicConfigured: boolean;
  openaiConfigured: boolean;
  source: "mongo" | "env" | "mixed";
};

export type TypeAIPrompts = {
  defineSearchSpace: string;
  refineSearchSpace: string;
  finalRationale: string;
  version: string;
  promptsHash: string;
  modelFamilyActive: string;
  primaryModelActive: string;
  refineModelActive: string;
};

export const getAdminAIConfig = async (
  adminKey: string,
): Promise<TypeAIConfig> => {
  const res = await apiFetch(parseUrl("v1/admin/ai/config"), {
    cache: "no-store",
    headers: { "X-Admin-Key": adminKey },
  });
  return jsonOrThrow<TypeAIConfig>(res);
};

export const updateAdminAIConfig = async (
  adminKey: string,
  patch: Partial<TypeAIConfig>,
): Promise<TypeAIConfig> => {
  const res = await apiFetch(parseUrl("v1/admin/ai/config"), {
    method: "PUT",
    headers: adminHeaders(adminKey),
    body: JSON.stringify(patch),
  });
  return jsonOrThrow<TypeAIConfig>(res);
};

export const getAdminAIPrompts = async (
  adminKey: string,
): Promise<TypeAIPrompts> => {
  const res = await apiFetch(parseUrl("v1/admin/ai/prompts"), {
    cache: "no-store",
    headers: { "X-Admin-Key": adminKey },
  });
  return jsonOrThrow<TypeAIPrompts>(res);
};

export const listAudit = async (
  adminKey: string,
  params: {
    actor?: string;
    resourceType?: string;
    since?: string;
    limit?: number;
  } = {},
): Promise<TypeAuditEntry[]> => {
  const qs = new URLSearchParams();
  if (params.actor) qs.set("actor", params.actor);
  if (params.resourceType) qs.set("resourceType", params.resourceType);
  if (params.since) qs.set("since", params.since);
  if (params.limit) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await apiFetch(parseUrl(`v1/admin/audit${suffix}`), {
    cache: "no-store",
    headers: { "X-Admin-Key": adminKey },
  });
  return jsonOrThrow<TypeAuditEntry[]>(res);
};

// ---------- Phase 8 — extended data sources ----------

export const getEquitiesOhlcv = async (
  exchange: string,
  symbol: string,
  timeframe: string,
  start: Date,
  end: Date,
): Promise<TypeOhlcvBar[]> => {
  const params = new URLSearchParams({
    exchange,
    symbol,
    timeframe,
    start: start.toISOString(),
    end: end.toISOString(),
  });
  const res = await apiFetch(parseUrl(`v1/equities/ohlcv?${params.toString()}`), {
    cache: "no-store",
  });
  return jsonOrThrow<TypeOhlcvBar[]>(res);
};

export const getFuturesOhlcv = async (
  exchange: string,
  contract: string,
  timeframe: string,
  start: Date,
  end: Date,
): Promise<TypeOhlcvBar[]> => {
  const params = new URLSearchParams({
    exchange,
    contract,
    timeframe,
    start: start.toISOString(),
    end: end.toISOString(),
  });
  const res = await apiFetch(parseUrl(`v1/futures/ohlcv?${params.toString()}`), {
    cache: "no-store",
  });
  return jsonOrThrow<TypeOhlcvBar[]>(res);
};

export const getMacroIndicators = async (
  source: string,
  code: string,
  start?: Date,
  end?: Date,
): Promise<TypeMacroPoint[]> => {
  const params = new URLSearchParams({ source, code });
  if (start) params.set("start", start.toISOString());
  if (end) params.set("end", end.toISOString());
  const res = await apiFetch(
    parseUrl(`v1/macro/indicators?${params.toString()}`),
    { cache: "no-store" },
  );
  return jsonOrThrow<TypeMacroPoint[]>(res);
};

export const getOnchainMetrics = async (
  chain: string,
  metric: string,
  start?: Date,
  end?: Date,
): Promise<TypeOnchainPoint[]> => {
  const params = new URLSearchParams({ chain, metric });
  if (start) params.set("start", start.toISOString());
  if (end) params.set("end", end.toISOString());
  const res = await apiFetch(
    parseUrl(`v1/onchain/metrics?${params.toString()}`),
    { cache: "no-store" },
  );
  return jsonOrThrow<TypeOnchainPoint[]>(res);
};

export const getNews = async (
  symbols?: string[],
  since?: Date,
  limit = 100,
): Promise<TypeNewsItem[]> => {
  const params = new URLSearchParams({ limit: String(limit) });
  if (symbols && symbols.length) params.set("symbols", symbols.join(","));
  if (since) params.set("since", since.toISOString());
  const res = await apiFetch(parseUrl(`v1/news?${params.toString()}`), {
    cache: "no-store",
  });
  return jsonOrThrow<TypeNewsItem[]>(res);
};

// ---------- Phase 9 — Polymarket prediction-market vertical ----------

import type {
  TypeCreatePredictionStrategy,
  TypeCreateWallet,
  TypePredictionMarket,
  TypePredictionOrder,
  TypePredictionQuote,
  TypePredictionStrategy,
  TypePredictionTrade,
  TypeWallet,
  TypeWalletBalance,
  TypeWalletPosition,
} from "./type";

export const listWallets = async (): Promise<TypeWallet[]> => {
  const res = await apiFetch(parseUrl("v1/wallets"), { cache: "no-store" });
  return jsonOrThrow<TypeWallet[]>(res);
};

export const getWallet = async (id: string): Promise<TypeWallet> => {
  const res = await apiFetch(parseUrl(`v1/wallets/${id}`), { cache: "no-store" });
  return jsonOrThrow<TypeWallet>(res);
};

export const createWallet = async (
  input: TypeCreateWallet,
): Promise<TypeWallet> => {
  const res = await apiFetch(parseUrl("v1/wallets"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return jsonOrThrow<TypeWallet>(res);
};

export const deleteWallet = async (id: string): Promise<void> => {
  const res = await apiFetch(parseUrl(`v1/wallets/${id}`), { method: "DELETE" });
  await jsonOrThrow<{ success: boolean }>(res);
};

export const getWalletBalance = async (
  id: string,
): Promise<TypeWalletBalance> => {
  const res = await apiFetch(parseUrl(`v1/wallets/${id}/balance`), {
    cache: "no-store",
  });
  return jsonOrThrow<TypeWalletBalance>(res);
};

export const getWalletPositions = async (
  id: string,
): Promise<TypeWalletPosition[]> => {
  const res = await apiFetch(parseUrl(`v1/wallets/${id}/positions`), {
    cache: "no-store",
  });
  return jsonOrThrow<TypeWalletPosition[]>(res);
};

export const approveWallet = async (
  id: string,
  adminKey: string,
  amountUsdc: number,
): Promise<{ txHash: string; amountApproved: number; capUsd: number }> => {
  const res = await apiFetch(parseUrl(`v1/wallets/${id}/approve`), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
    body: JSON.stringify({ amountUsdc }),
  });
  return jsonOrThrow(res);
};

export const listPredictionMarkets = async (params: {
  category?: string;
  active?: boolean;
  limit?: number;
  offset?: number;
} = {}): Promise<TypePredictionMarket[]> => {
  const qs = new URLSearchParams();
  if (params.category) qs.set("category", params.category);
  if (params.active !== undefined) qs.set("active", String(params.active));
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await apiFetch(parseUrl(`v1/prediction/markets${suffix}`), {
    cache: "no-store",
  });
  return jsonOrThrow<TypePredictionMarket[]>(res);
};

export const getPredictionMarket = async (
  id: string,
): Promise<TypePredictionMarket> => {
  const res = await apiFetch(parseUrl(`v1/prediction/markets/${id}`), {
    cache: "no-store",
  });
  return jsonOrThrow<TypePredictionMarket>(res);
};

export const getPredictionQuotes = async (
  tokenId: string,
  start?: Date,
  end?: Date,
): Promise<TypePredictionQuote[]> => {
  const qs = new URLSearchParams({ token_id: tokenId });
  if (start) qs.set("start", start.toISOString());
  if (end) qs.set("end", end.toISOString());
  const res = await apiFetch(parseUrl(`v1/prediction/quotes?${qs.toString()}`), {
    cache: "no-store",
  });
  return jsonOrThrow<TypePredictionQuote[]>(res);
};

export const getPredictionTrades = async (
  marketId: string,
  limit = 100,
): Promise<TypePredictionTrade[]> => {
  const qs = new URLSearchParams({ market_id: marketId, limit: String(limit) });
  const res = await apiFetch(parseUrl(`v1/prediction/trades?${qs.toString()}`), {
    cache: "no-store",
  });
  return jsonOrThrow<TypePredictionTrade[]>(res);
};

export const listPredictionStrategies = async (): Promise<
  TypePredictionStrategy[]
> => {
  const res = await apiFetch(parseUrl("v1/prediction/strategies"), {
    cache: "no-store",
  });
  return jsonOrThrow<TypePredictionStrategy[]>(res);
};

export const getPredictionStrategy = async (
  id: string,
): Promise<TypePredictionStrategy> => {
  const res = await apiFetch(parseUrl(`v1/prediction/strategies/${id}`), {
    cache: "no-store",
  });
  return jsonOrThrow<TypePredictionStrategy>(res);
};

export const createPredictionStrategy = async (
  input: TypeCreatePredictionStrategy,
): Promise<TypePredictionStrategy> => {
  const res = await apiFetch(parseUrl("v1/prediction/strategies"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return jsonOrThrow<TypePredictionStrategy>(res);
};

export const togglePredictionLive = async (
  id: string,
  body: { enabled: boolean; walletId?: string; mode?: string },
): Promise<TypePredictionStrategy> => {
  const res = await apiFetch(parseUrl(`v1/prediction/strategies/${id}/live`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return jsonOrThrow<TypePredictionStrategy>(res);
};

// ---------- Wave 1B — /dashboard/summary aggregation ----------

// Single-call fan-out used by the dashboard landing page. Always returns
// SOMETHING — individual repo failures degrade to zero values for that
// section and a `notes` entry, so consumers don't need to special-case
// "data not loaded yet". `cache: "no-store"` keeps server-component
// renders fresh; the client component drives router.refresh() on a 30s
// interval to repaint.
export const getDashboardSummary = async (): Promise<TypeDashboardSummary> => {
  const res = await apiFetch(parseUrl("v1/dashboard/summary"), {
    cache: "no-store",
  });
  return jsonOrThrow<TypeDashboardSummary>(res);
};

export const listPredictionOrders = async (
  id: string,
  limit = 50,
): Promise<TypePredictionOrder[]> => {
  const res = await apiFetch(
    parseUrl(`v1/prediction/strategies/${id}/orders?limit=${limit}`),
    { cache: "no-store" },
  );
  return jsonOrThrow<TypePredictionOrder[]>(res);
};

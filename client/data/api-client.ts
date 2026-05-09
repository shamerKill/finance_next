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
  TypeMainnetStatus,
  TypeOptimizationRun,
  TypeOption,
  TypeOrderLog,
  TypePortfolioSummary,
  TypePosition,
  TypeRecommendation,
  TypeRecommendationStatus,
  TypeSetLive,
  TypeStudyHandle,
  TypeSubmitOrder,
} from "./type";

// Base URL is env-driven so the client can talk to the Go gateway in dev
// (default :3001) or to a deployed gateway via NEXT_PUBLIC_API_URL in prod.
const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
const parseUrl = (path: string) => baseUrl + `/${path}`.replace("//", "/");

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

// ---------- Options (legacy strategy resource) ----------

export const getOptions = async () => {
  const res = await fetch(parseUrl("v1/option"), { cache: "no-store" });
  return await res.json();
};

export const createOption = async (option: TypeOption) => {
  const res = await fetch(parseUrl("v1/option"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(option),
  });
  return await res.json();
};

// ---------- Accounts (phase 1) ----------

export const listAccounts = async (): Promise<TypeAccount[]> => {
  const res = await fetch(parseUrl("v1/accounts"), { cache: "no-store" });
  return jsonOrThrow<TypeAccount[]>(res);
};

export const getAccount = async (id: string): Promise<TypeAccount> => {
  const res = await fetch(parseUrl(`v1/accounts/${id}`), { cache: "no-store" });
  return jsonOrThrow<TypeAccount>(res);
};

export const createAccount = async (input: TypeCreateAccount): Promise<TypeAccount> => {
  const res = await fetch(parseUrl("v1/accounts"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return jsonOrThrow<TypeAccount>(res);
};

export const deleteAccount = async (id: string): Promise<void> => {
  const res = await fetch(parseUrl(`v1/accounts/${id}`), { method: "DELETE" });
  await jsonOrThrow<{ success: boolean }>(res);
};

export const getBalances = async (id: string): Promise<TypeBalance[]> => {
  const res = await fetch(parseUrl(`v1/accounts/${id}/balances`), { cache: "no-store" });
  return jsonOrThrow<TypeBalance[]>(res);
};

export const getPositions = async (id: string): Promise<TypePosition[]> => {
  const res = await fetch(parseUrl(`v1/accounts/${id}/positions`), { cache: "no-store" });
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
  const res = await fetch(parseUrl(`v1/market/ohlcv?${params.toString()}`), {
    cache: "no-store",
  });
  return jsonOrThrow<TypeOhlcvBar[]>(res);
};

// ---------- Backtests (phase 3) ----------

export const listBacktests = async (
  strategyId?: string,
): Promise<TypeBacktest[]> => {
  const qs = strategyId ? `?strategyId=${encodeURIComponent(strategyId)}` : "";
  const res = await fetch(parseUrl(`v1/backtests${qs}`), { cache: "no-store" });
  return jsonOrThrow<TypeBacktest[]>(res);
};

export const getBacktest = async (id: string): Promise<TypeBacktest> => {
  const res = await fetch(parseUrl(`v1/backtests/${id}`), { cache: "no-store" });
  return jsonOrThrow<TypeBacktest>(res);
};

export const createBacktest = async (
  input: TypeCreateBacktest,
): Promise<TypeBacktestHandle> => {
  const res = await fetch(parseUrl("v1/backtests"), {
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
  const res = await fetch(
    parseUrl(`v1/backtests/${id}/equity?limit=${limit}`),
    { cache: "no-store" },
  );
  return jsonOrThrow<TypeEquityPoint[]>(res);
};

export const getTrades = async (id: string): Promise<TypeBacktestTrade[]> => {
  const res = await fetch(parseUrl(`v1/backtests/${id}/trades`), {
    cache: "no-store",
  });
  return jsonOrThrow<TypeBacktestTrade[]>(res);
};

// ---------- Strategies / live execution (phase 4) ----------

// `getStrategies` is just an alias for the legacy /option list — the
// underlying Mongo collection is the same. Phase 6 will fork the data
// model.
export const getStrategies = async (): Promise<TypeOption[]> => {
  const res = await fetch(parseUrl("v1/option"), { cache: "no-store" });
  return jsonOrThrow<TypeOption[]>(res);
};

export const getStrategy = async (id: string): Promise<TypeOption> => {
  const res = await fetch(parseUrl(`v1/option/${id}`), { cache: "no-store" });
  return jsonOrThrow<TypeOption>(res);
};

export const getOrders = async (
  strategyId: string,
  limit = 50,
): Promise<TypeOrderLog[]> => {
  const res = await fetch(
    parseUrl(`v1/strategies/${strategyId}/orders?limit=${limit}`),
    { cache: "no-store" },
  );
  return jsonOrThrow<TypeOrderLog[]>(res);
};

export const setLive = async (
  strategyId: string,
  body: TypeSetLive,
): Promise<TypeOption> => {
  const res = await fetch(parseUrl(`v1/strategies/${strategyId}/live`), {
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
  const res = await fetch(parseUrl(`v1/option/${strategyId}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ risk }),
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
  const res = await fetch(
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
  const res = await fetch(parseUrl("v1/admin/mainnet/request-token"), {
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
  const res = await fetch(parseUrl("v1/admin/mainnet/confirm"), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
    body: JSON.stringify({ token }),
  });
  return jsonOrThrow<TypeMainnetStatus>(res);
};

export const getMainnetStatus = async (
  adminKey: string,
): Promise<TypeMainnetStatus> => {
  const res = await fetch(parseUrl("v1/admin/mainnet/status"), {
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
  const res = await fetch(parseUrl(`v1/exchange/meta${qs}`), {
    cache: "no-store",
  });
  return jsonOrThrow<TypeExchangeMeta | TypeExchangeMeta[]>(res);
};

export const getPortfolioSummary = async (): Promise<TypePortfolioSummary> => {
  const res = await fetch(parseUrl("v1/portfolio/summary"), {
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
  const res = await fetch(parseUrl(`v1/recommendations${qs}`), {
    cache: "no-store",
  });
  return jsonOrThrow<TypeRecommendation[]>(res);
};

export const getRecommendation = async (
  id: string,
): Promise<TypeRecommendation> => {
  const res = await fetch(parseUrl(`v1/recommendations/${id}`), {
    cache: "no-store",
  });
  return jsonOrThrow<TypeRecommendation>(res);
};

export const approveRecommendation = async (
  id: string,
): Promise<TypeApproveRecommendation> => {
  const res = await fetch(parseUrl(`v1/recommendations/${id}/approve`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  return jsonOrThrow<TypeApproveRecommendation>(res);
};

export const rejectRecommendation = async (
  id: string,
): Promise<TypeRecommendation> => {
  const res = await fetch(parseUrl(`v1/recommendations/${id}/reject`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  return jsonOrThrow<TypeRecommendation>(res);
};

export const startOptimization = async (
  strategyId: string,
  body?: { force?: boolean; nTrialsOverride?: number },
): Promise<TypeStudyHandle> => {
  const res = await fetch(parseUrl(`v1/strategies/${strategyId}/optimize`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return jsonOrThrow<TypeStudyHandle>(res);
};

export const getOptimization = async (
  studyId: string,
): Promise<TypeOptimizationRun> => {
  const res = await fetch(parseUrl(`v1/optimizations/${studyId}`), {
    cache: "no-store",
  });
  return jsonOrThrow<TypeOptimizationRun>(res);
};

export const listOptimizations = async (
  strategyId?: string,
): Promise<TypeOptimizationRun[]> => {
  const qs = strategyId ? `?strategyId=${encodeURIComponent(strategyId)}` : "";
  const res = await fetch(parseUrl(`v1/optimizations${qs}`), {
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

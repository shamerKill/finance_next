import { getAccount, getBalances, getPositions } from "@/data/api-client";
import { TypeAccount, TypeBalance, TypePosition } from "@/data/type";
import AccountStreamPanel from "./stream-panel";
import RefreshButton from "./refresh-button";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

// Tri-state fetch result. `data` may be empty on success (account has no
// non-zero balances) — we deliberately preserve the success/error
// distinction instead of collapsing both to "[]" so the empty-state copy
// can be specific.
type FetchResult<T> =
  | { ok: true; data: T[] }
  | { ok: false; error: string };

async function tryFetch<T>(p: Promise<T[]>): Promise<FetchResult<T>> {
  try {
    return { ok: true, data: await p };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Format the query time. Server-rendered so this is the SSR moment;
// RefreshButton bumps router.refresh() to re-render with a fresh time.
function formatQueryTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Account detail page. Server-side renders the snapshot tables; client
// components below subscribe to /ws for live updates and trigger refreshes.
export default async function AccountDetailPage({ params }: PageProps) {
  const { id } = await params;

  let account: TypeAccount | null = null;
  let accountErr: string | null = null;
  let balancesResult: FetchResult<TypeBalance> = { ok: true, data: [] };
  let positionsResult: FetchResult<TypePosition> = { ok: true, data: [] };

  try {
    [account, balancesResult, positionsResult] = await Promise.all([
      getAccount(id),
      tryFetch(getBalances(id)),
      tryFetch(getPositions(id)),
    ]);
  } catch (e) {
    accountErr = e instanceof Error ? e.message : String(e);
  }

  if (accountErr || !account) {
    return (
      <div>
        <h1 className="text-2xl font-semibold mb-4">账户</h1>
        <div className="rounded border border-danger p-3 text-sm text-danger">
          {accountErr ?? "未找到账户"}
        </div>
      </div>
    );
  }

  const queryTime = formatQueryTime(new Date());
  const balanceCount = balancesResult.ok ? balancesResult.data.length : 0;
  const positionCount = positionsResult.ok ? positionsResult.data.length : 0;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{account.label}</h1>
          <div className="text-sm text-default-500 mt-1">
            {account.exchange} · {account.email}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <RefreshButton />
          <span className="text-xs text-default-400">查询时间 {queryTime}</span>
        </div>
      </div>

      <section className="mb-8">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-medium">余额</h2>
          <span className="text-xs text-default-500">
            {balancesResult.ok
              ? `${balanceCount} 个非零资产`
              : "查询失败"}
          </span>
        </div>
        {!balancesResult.ok ? (
          <div className="rounded border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">
            余额查询失败：{balancesResult.error}
          </div>
        ) : balancesResult.data.length === 0 ? (
          <p className="text-sm text-default-500">
            账户连接成功，当前无非零余额。
            <span className="text-default-400">
              （注：零余额资产已被过滤；现货 + 期货均无可用资金时显示为空。）
            </span>
          </p>
        ) : (
          <table className="w-full text-sm border border-default-200 rounded">
            <thead className="bg-default-100">
              <tr>
                <th className="text-left p-2">资产</th>
                <th className="text-right p-2">可用</th>
                <th className="text-right p-2">冻结</th>
                <th className="text-left p-2">钱包</th>
              </tr>
            </thead>
            <tbody>
              {balancesResult.data.map((b) => (
                <tr key={`${b.wallet}-${b.asset}`} className="border-t border-default-200">
                  <td className="p-2">{b.asset}</td>
                  <td className="p-2 text-right font-mono">{b.free}</td>
                  <td className="p-2 text-right font-mono">{b.locked}</td>
                  <td className="p-2 text-default-500">{b.wallet}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mb-8">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-medium">持仓</h2>
          <span className="text-xs text-default-500">
            {positionsResult.ok
              ? `${positionCount} 个开放持仓`
              : "查询失败"}
          </span>
        </div>
        {!positionsResult.ok ? (
          <div className="rounded border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">
            持仓查询失败：{positionsResult.error}
          </div>
        ) : positionsResult.data.length === 0 ? (
          <p className="text-sm text-default-500">
            USDM 期货当前无开放持仓。
            <span className="text-default-400">
              （仅显示 positionAmt ≠ 0 的合约。）
            </span>
          </p>
        ) : (
          <table className="w-full text-sm border border-default-200 rounded">
            <thead className="bg-default-100">
              <tr>
                <th className="text-left p-2">交易对</th>
                <th className="text-left p-2">方向</th>
                <th className="text-right p-2">数量</th>
                <th className="text-right p-2">开仓价</th>
                <th className="text-right p-2">标记价</th>
                <th className="text-right p-2">盈亏</th>
                <th className="text-right p-2">杠杆</th>
              </tr>
            </thead>
            <tbody>
              {positionsResult.data.map((p) => (
                <tr key={`${p.symbol}-${p.positionSide}`} className="border-t border-default-200">
                  <td className="p-2">{p.symbol}</td>
                  <td className="p-2">{p.positionSide}</td>
                  <td className="p-2 text-right font-mono">{p.positionAmt}</td>
                  <td className="p-2 text-right font-mono">{p.entryPrice}</td>
                  <td className="p-2 text-right font-mono">{p.markPrice}</td>
                  <td className="p-2 text-right font-mono">{p.unrealizedProfit}</td>
                  <td className="p-2 text-right">{p.leverage}x</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">实时事件</h2>
        <AccountStreamPanel accountId={account.id} />
      </section>
    </div>
  );
}

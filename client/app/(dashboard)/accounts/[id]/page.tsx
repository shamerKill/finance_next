import { getAccount, getBalances, getPositions } from "@/data/api-client";
import { TypeAccount, TypeBalance, TypePosition } from "@/data/type";
import AccountStreamPanel from "./stream-panel";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

// Account detail page. Server-side renders the snapshot tables; client
// component below subscribes to /ws for live updates.
export default async function AccountDetailPage({ params }: PageProps) {
  const { id } = await params;

  let account: TypeAccount | null = null;
  let balances: TypeBalance[] = [];
  let positions: TypePosition[] = [];
  let error: string | null = null;
  try {
    [account, balances, positions] = await Promise.all([
      getAccount(id),
      getBalances(id).catch(() => []),
      getPositions(id).catch(() => []),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (error || !account) {
    return (
      <div>
        <h1 className="text-2xl font-semibold mb-4">账户</h1>
        <div className="rounded border border-danger p-3 text-sm text-danger">
          {error ?? "未找到账户"}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{account.label}</h1>
        <div className="text-sm text-default-500 mt-1">
          {account.exchange} · {account.email}
        </div>
      </div>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-3">余额</h2>
        {balances.length === 0 ? (
          <p className="text-sm text-default-500">暂无余额数据。</p>
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
              {balances.map((b) => (
                <tr key={`${b.wallet}-${b.asset}`} className="border-t border-default-200">
                  <td className="p-2">{b.asset}</td>
                  <td className="p-2 text-right">{b.free}</td>
                  <td className="p-2 text-right">{b.locked}</td>
                  <td className="p-2">{b.wallet}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-3">持仓</h2>
        {positions.length === 0 ? (
          <p className="text-sm text-default-500">暂无持仓。</p>
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
              {positions.map((p) => (
                <tr key={`${p.symbol}-${p.positionSide}`} className="border-t border-default-200">
                  <td className="p-2">{p.symbol}</td>
                  <td className="p-2">{p.positionSide}</td>
                  <td className="p-2 text-right">{p.positionAmt}</td>
                  <td className="p-2 text-right">{p.entryPrice}</td>
                  <td className="p-2 text-right">{p.markPrice}</td>
                  <td className="p-2 text-right">{p.unrealizedProfit}</td>
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

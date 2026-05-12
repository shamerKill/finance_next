import Link from "next/link";

import { ApiErrorView } from "@/components/api-error";
import { DataTable, DataTableColumn } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { RecentTracker } from "@/components/recent-tracker";
import { Section } from "@/components/section";
import { StatusBadge } from "@/components/status-badge";
import { Tabs } from "@/components/tabs";
import {
  getAccount,
  getBalances,
  getOptions,
  getPositions,
} from "@/data/api-client";
import {
  TypeAccount,
  TypeBalance,
  TypeOption,
  TypePosition,
} from "@/data/type";

import AccountStreamPanel from "./stream-panel";
import RefreshButton from "./refresh-button";

export const dynamic = "force-dynamic";

export const metadata = { title: "账户详情" };

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
//
// Node 2.C.5.a — body wrapped in <Tabs> (基础信息 / 余额 / 仓位 / 实时事件),
// data tables migrated to <DataTable> so they auto-collapse to cards on
// mobile, palette switched to design-system tokens. Fetch behavior /
// strategy-linkage logic unchanged.
export default async function AccountDetailPage({ params }: PageProps) {
  const { id } = await params;

  let account: TypeAccount | null = null;
  let accountErr: unknown = null;
  let balancesResult: FetchResult<TypeBalance> = { ok: true, data: [] };
  let positionsResult: FetchResult<TypePosition> = { ok: true, data: [] };
  let strategies: TypeOption[] = [];

  try {
    [account, balancesResult, positionsResult] = await Promise.all([
      getAccount(id),
      tryFetch(getBalances(id)),
      tryFetch(getPositions(id)),
    ]);
  } catch (e) {
    accountErr = e;
  }

  // Best-effort: pull the full strategy list and filter by accountId
  // client-side. The list is short (single-digit-to-low-dozens) so
  // server-side joins aren't warranted. A failure here is silent — the
  // strategies section just renders the empty state.
  try {
    strategies = await getOptions();
  } catch {
    strategies = [];
  }

  if (accountErr || !account) {
    return (
      <div className="space-y-4">
        <PageHeader
          breadcrumb={
            <Link href="/accounts" className="hover:underline">
              ← 账户
            </Link>
          }
          title="账户"
        />
        <ApiErrorView error={accountErr ?? "未找到账户"} />
      </div>
    );
  }

  const queryTime = formatQueryTime(new Date());
  const balanceCount = balancesResult.ok ? balancesResult.data.length : 0;
  const positionCount = positionsResult.ok ? positionsResult.data.length : 0;

  // Filter strategies whose live.accountId == this account. We treat a
  // missing accountId as "not associated" so accidental matches against
  // empty-string keys can't slip through.
  const linkedStrategies = strategies.filter(
    (s) => s.id && s.live?.accountId && s.live.accountId === account.id,
  );

  const balanceColumns: DataTableColumn<TypeBalance>[] = [
    { key: "asset", label: "资产", render: (b) => <span>{b.asset}</span> },
    {
      key: "free",
      label: "可用",
      align: "end",
      render: (b) => <span className="font-mono tnum">{b.free}</span>,
    },
    {
      key: "locked",
      label: "冻结",
      align: "end",
      render: (b) => <span className="font-mono tnum">{b.locked}</span>,
    },
    {
      key: "wallet",
      label: "钱包",
      render: (b) => <span className="text-text-tertiary">{b.wallet}</span>,
    },
  ];

  const positionColumns: DataTableColumn<TypePosition>[] = [
    { key: "symbol", label: "交易对" },
    { key: "positionSide", label: "方向" },
    {
      key: "positionAmt",
      label: "数量",
      align: "end",
      render: (p) => <span className="font-mono tnum">{p.positionAmt}</span>,
    },
    {
      key: "entryPrice",
      label: "开仓价",
      align: "end",
      render: (p) => <span className="font-mono tnum">{p.entryPrice}</span>,
    },
    {
      key: "markPrice",
      label: "标记价",
      align: "end",
      render: (p) => <span className="font-mono tnum">{p.markPrice}</span>,
    },
    {
      key: "unrealizedProfit",
      label: "盈亏",
      align: "end",
      render: (p) => {
        const v = Number(p.unrealizedProfit);
        const cls =
          Number.isFinite(v) && v > 0
            ? "text-accent-up"
            : Number.isFinite(v) && v < 0
              ? "text-accent-down"
              : "text-text-secondary";
        return (
          <span className={`font-mono tnum ${cls}`}>{p.unrealizedProfit}</span>
        );
      },
    },
    {
      key: "leverage",
      label: "杠杆",
      align: "end",
      render: (p) => (
        <span className="font-mono tnum">{p.leverage}x</span>
      ),
    },
  ];

  const overviewPanel = (
    <div className="space-y-4">
      <Section title="基础信息">
        <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
          <dt className="text-text-tertiary">标签</dt>
          <dd className="text-text-primary">{account.label}</dd>
          <dt className="text-text-tertiary">交易所</dt>
          <dd className="text-text-primary capitalize">{account.exchange}</dd>
          <dt className="text-text-tertiary">邮箱</dt>
          <dd className="text-text-primary">{account.email}</dd>
          <dt className="text-text-tertiary">权限</dt>
          <dd className="flex gap-2 flex-wrap">
            {account.permissions.canTrade && (
              <StatusBadge tone="success" variant="flat" size="sm">
                交易
              </StatusBadge>
            )}
            {account.permissions.canWithdraw && (
              <StatusBadge tone="danger" variant="flat" size="sm">
                提现
              </StatusBadge>
            )}
            {!account.permissions.canTrade &&
              !account.permissions.canWithdraw && (
                <StatusBadge tone="default" variant="flat" size="sm">
                  只读
                </StatusBadge>
              )}
          </dd>
          {account.lastSnapshotAt && (
            <>
              <dt className="text-text-tertiary">最近快照</dt>
              <dd className="font-mono tnum text-text-secondary text-xs">
                {account.lastSnapshotAt}
              </dd>
            </>
          )}
        </dl>
      </Section>

      <Section title="使用此账户的策略">
        {linkedStrategies.length === 0 ? (
          <EmptyState
            title="无关联策略"
            description="尚无策略将此账户作为实盘下单账户。在策略详情页选择此账户后会出现在这里。"
          />
        ) : (
          <ul className="divide-y divide-border-default">
            {linkedStrategies.map((s) => (
              <li
                key={s.id ?? s.name}
                className="flex items-center justify-between py-2 text-sm"
              >
                <div className="min-w-0">
                  <Link
                    href={`/strategies/${s.id}`}
                    className="text-brand-primary hover:underline"
                  >
                    {s.name}
                  </Link>
                  <span className="ml-2 font-mono tnum text-xs text-text-tertiary">
                    {s.execSymbol}
                  </span>
                </div>
                <div className="text-xs shrink-0">
                  {s.live?.enabled ? (
                    <StatusBadge tone="success" variant="flat" size="sm">
                      实盘 · {s.live.mode}
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone="default" variant="flat" size="sm">
                      关闭
                    </StatusBadge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );

  const balancesPanel = (
    <Section
      title="余额"
      action={
        <span className="text-xs text-text-tertiary">
          {balancesResult.ok ? `${balanceCount} 个非零资产` : "查询失败"}
        </span>
      }
    >
      {!balancesResult.ok ? (
        <ApiErrorView error={balancesResult.error} />
      ) : balancesResult.data.length === 0 ? (
        <EmptyState
          title="无非零余额"
          description="账户连接成功，当前现货 + 期货均无可用资金。零余额资产已被过滤。"
        />
      ) : (
        <DataTable<TypeBalance>
          ariaLabel="账户余额"
          columns={balanceColumns}
          rows={balancesResult.data}
          getRowKey={(b) => `${b.wallet}-${b.asset}`}
        />
      )}
    </Section>
  );

  const positionsPanel = (
    <Section
      title="持仓"
      action={
        <span className="text-xs text-text-tertiary">
          {positionsResult.ok ? `${positionCount} 个开放持仓` : "查询失败"}
        </span>
      }
    >
      {!positionsResult.ok ? (
        <ApiErrorView error={positionsResult.error} />
      ) : positionsResult.data.length === 0 ? (
        <EmptyState
          title="无开放持仓"
          description="USDM 期货当前无开放持仓。仅显示 positionAmt ≠ 0 的合约。"
        />
      ) : (
        <DataTable<TypePosition>
          ariaLabel="账户持仓"
          columns={positionColumns}
          rows={positionsResult.data}
          getRowKey={(p) => `${p.symbol}-${p.positionSide}`}
        />
      )}
    </Section>
  );

  const streamPanel = (
    <Section title="实时事件">
      <AccountStreamPanel accountId={account.id} />
    </Section>
  );

  return (
    <div className="space-y-4">
      <RecentTracker
        id={account.id}
        kind="account"
        label={account.label}
        path={`/accounts/${account.id}`}
      />
      <PageHeader
        breadcrumb={
          <Link href="/accounts" className="hover:underline">
            ← 账户
          </Link>
        }
        title={account.label}
        subtitle={`${account.exchange} · ${account.email}`}
        action={
          <div className="flex flex-col items-end gap-1">
            <RefreshButton />
            <span className="text-xs text-text-tertiary font-mono tnum">
              查询时间 {queryTime}
            </span>
          </div>
        }
      />

      <Tabs
        ariaLabel="账户详情"
        defaultSelectedKey="overview"
        items={[
          { key: "overview", label: "基础信息", content: overviewPanel },
          {
            key: "balances",
            label: `余额${balancesResult.ok ? ` (${balanceCount})` : ""}`,
            content: balancesPanel,
          },
          {
            key: "positions",
            label: `仓位${positionsResult.ok ? ` (${positionCount})` : ""}`,
            content: positionsPanel,
          },
          { key: "stream", label: "实时事件", content: streamPanel },
        ]}
      />
    </div>
  );
}

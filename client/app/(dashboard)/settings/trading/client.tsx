"use client";

// Node 3.E.3 — /settings/trading client panel.
//
// Three sections:
//   1. Mainnet 交易开关 — env flags for the two vertical "mainnet
//      enabled?" booleans. Read-only; UI cannot flip them (they're env
//      vars, intentional gating in the security model).
//   2. Polygon RPC — POLYGON_RPC_URL presence only (we never show the
//      URL itself — public RPCs are fine, but Alchemy/Infura URLs
//      contain an API key in the path).
//   3. Mainnet Token 流程 — interactive admin action card. Shows the
//      current /admin/mainnet/status snapshot (envEnabled,
//      mainnetAllowed, expiresAt, pendingTokenCount), exposes a
//      request-token button (the full token is printed to stderr only;
//      we show the hint), and a confirm input. A two-step
//      ConfirmDialog wraps the request because opening mainnet is a
//      destructive-equivalent action.

import { Button, Input } from "@heroui/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { ApiErrorView } from "@/components/api-error";
import { Callout } from "@/components/callout";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { FormField } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/components/toast";
import {
  ApiError,
  confirmMainnetToken,
  getMainnetStatus,
  requestMainnetToken,
} from "@/data/api-client";
import type { TypeMainnetStatus } from "@/data/type";
import { useActivityCenter, withActivity } from "@/data/use-activity-center";
import { useSystemInfo } from "@/data/use-system-info";

function EnvFlagBadge({ value }: { value: unknown }) {
  if (value === true) {
    return (
      <StatusBadge tone="success" variant="flat" size="sm">
        已启用
      </StatusBadge>
    );
  }
  if (value === false) {
    return (
      <StatusBadge tone="default" variant="flat" size="sm">
        未启用
      </StatusBadge>
    );
  }
  return (
    <StatusBadge tone="default" variant="dot" size="sm">
      状态未知
    </StatusBadge>
  );
}

export function TradingSettingsClient() {
  const activity = useActivityCenter();
  const { data: info, err: infoErr } = useSystemInfo();

  const [status, setStatus] = useState<TypeMainnetStatus | null>(null);
  const [statusErr, setStatusErr] = useState<unknown>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const [tokenInput, setTokenInput] = useState("");
  const [requestedHint, setRequestedHint] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busyRequest, setBusyRequest] = useState(false);
  const [busyConfirm, setBusyConfirm] = useState(false);

  const toast = useToast();

  const refreshStatus = async () => {
    setStatusLoading(true);
    setStatusErr(null);
    try {
      const s = await getMainnetStatus();
      setStatus(s);
    } catch (e) {
      setStatusErr(e);
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshStatus();
  }, []);

  const statusAuthFailed =
    statusErr instanceof ApiError &&
    (statusErr.status === 401 || statusErr.status === 403);

  const handleRequestToken = async () => {
    setBusyRequest(true);
    try {
      const res = await withActivity(
        activity,
        { kind: "other", label: "申请 mainnet token" },
        () => requestMainnetToken(),
      );
      setRequestedHint(res.tokenHint);
      toast.success("已发起 token 申请", {
        description: "完整 token 仅打印到 stderr (关键字 EMAIL CONFIRMATION REQUIRED)；从日志拷贝后填入下方表单确认。",
      });
      await refreshStatus();
    } catch (e) {
      toast.error("申请 token 失败", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusyRequest(false);
      setConfirmOpen(false);
    }
  };

  const handleConfirmToken = async () => {
    if (!tokenInput.trim()) return;
    setBusyConfirm(true);
    try {
      const next = await withActivity(
        activity,
        { kind: "other", label: "确认 mainnet token" },
        () => confirmMainnetToken(tokenInput.trim()),
      );
      setStatus(next);
      setTokenInput("");
      setRequestedHint(null);
      toast.success("已开启 1 小时窗口", {
        description: next.confirmExpiresAt
          ? `失效于 ${new Date(next.confirmExpiresAt).toLocaleString()}`
          : undefined,
      });
    } catch (e) {
      toast.error("confirm 失败", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusyConfirm(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="交易"
        subtitle="主网交易闸 / mainnet token 流程 / Polygon RPC 接入状态。密钥永不在 UI 中显示原值。"
      />

      {infoErr && <ApiErrorView error={infoErr} />}

      <Section title="Mainnet 交易开关">
        <ul className="divide-y divide-border-default">
          <li className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-text-primary">
                Binance / OKX / Bybit 主网
              </div>
              <div className="text-xs text-text-tertiary mt-0.5 font-mono">
                MAINNET_TRADING_ENABLED
              </div>
              <div className="text-xs text-text-tertiary mt-1">
                env 级总开关；未设 = 永远只走 testnet。即便开启，仍需 token
                流程在 1 小时窗口内 confirm 才允许下单。
              </div>
            </div>
            <EnvFlagBadge value={info?.envFlags?.MAINNET_TRADING_ENABLED} />
          </li>
          <li className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-text-primary">
                Polymarket 预测市场
              </div>
              <div className="text-xs text-text-tertiary mt-0.5 font-mono">
                POLYMARKET_TRADING_ENABLED
              </div>
              <div className="text-xs text-text-tertiary mt-1">
                Polymarket 无 testnet；env 未设 = 永远拒绝下单。与
                Binance mainnet 共享同一 TokenStore，一次 confirm 同时打开
                两个 vertical 的窗口。
              </div>
            </div>
            <EnvFlagBadge value={info?.envFlags?.POLYMARKET_TRADING_ENABLED} />
          </li>
        </ul>
      </Section>

      <Section title="Polygon RPC">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-text-primary">
              POLYGON_RPC_URL
            </div>
            <div className="text-xs text-text-tertiary mt-1">
              未配置 = NoopRPC（钱包 balance / approve 端点返回 503）。
              生产环境请切 Alchemy / Infura；公共节点 rate-limited。
              <span className="font-semibold">URL 不在 UI 中显示</span>
              （Alchemy 等节点的 API key 在路径里）。
            </div>
          </div>
          <EnvFlagBadge value={info?.envFlags?.POLYGON_RPC_URL} />
        </div>
      </Section>

      <Section title="Mainnet Token 流程">
        {statusAuthFailed && (
          <EmptyState
            title="无权访问 /admin/mainnet/*"
            description="此面板需要 admin 角色登录。请用 admin 账号重新登录。"
            action={
              <Link
                href="/login"
                className="rounded bg-primary px-4 py-1.5 text-sm text-white hover:opacity-90"
              >
                重新登录 →
              </Link>
            }
          />
        )}

        {!statusAuthFailed && (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-text-secondary">env 已启用</dt>
              <dd className="text-right">
                <EnvFlagBadge value={status?.envEnabled} />
              </dd>
              <dt className="text-text-secondary">mainnet 已许可</dt>
              <dd className="text-right">
                {status?.mainnetAllowed ? (
                  <StatusBadge tone="warning" variant="flat" size="sm">
                    1 小时窗口已打开
                  </StatusBadge>
                ) : (
                  <StatusBadge tone="default" variant="flat" size="sm">
                    未打开
                  </StatusBadge>
                )}
              </dd>
              <dt className="text-text-secondary">失效时间</dt>
              <dd className="text-right font-mono tnum">
                {status?.confirmExpiresAt
                  ? new Date(status.confirmExpiresAt).toLocaleString()
                  : "—"}
              </dd>
              <dt className="text-text-secondary">待 confirm token 数</dt>
              <dd className="text-right font-mono tnum">
                {status?.pendingTokenCount ?? "—"}
              </dd>
            </dl>

            {statusLoading && !status && (
              <div className="text-xs text-text-tertiary">加载状态中…</div>
            )}

            <Callout variant="warning" title="开启主网下单前请确认">
              一旦 confirm，<strong>所有</strong> live=true 且 mode=mainnet 的
              策略可在 1 小时内向交易所 / Polymarket 真实下单。流程：
              <ol className="list-decimal pl-5 mt-1 space-y-0.5">
                <li>点「申请 token」。</li>
                <li>到 gateway 日志中找「EMAIL CONFIRMATION REQUIRED」行拷贝完整 token（HTTP 响应只返回前缀 hint）。</li>
                <li>粘贴到下方输入框，点「Confirm token」。</li>
              </ol>
            </Callout>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <Button
                color="warning"
                onPress={() => setConfirmOpen(true)}
                isLoading={busyRequest}
                isDisabled={busyRequest}
              >
                申请 token
              </Button>
              {requestedHint && (
                <span className="text-xs text-text-secondary">
                  上次申请 token hint:{" "}
                  <span className="font-mono">{requestedHint}…</span>
                </span>
              )}
            </div>

            <FormField
              label="Confirm token"
              hint="从 gateway stderr 日志 'EMAIL CONFIRMATION REQUIRED' 行拷贝完整 token。"
              htmlFor="mainnet-token-input"
            >
              <Input
                id="mainnet-token-input"
                size="sm"
                value={tokenInput}
                onValueChange={setTokenInput}
                placeholder="完整 token"
                spellCheck="false"
                autoComplete="off"
              />
            </FormField>
            <Button
              color="warning"
              onPress={handleConfirmToken}
              isLoading={busyConfirm}
              isDisabled={!tokenInput.trim() || busyConfirm}
            >
              Confirm token
            </Button>
          </div>
        )}
      </Section>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="申请 mainnet token？"
        message={
          <div className="space-y-2">
            <p>
              此操作会生成一次性 token；完整 token 仅打印到 gateway 的
              stderr（关键字 EMAIL CONFIRMATION REQUIRED），不在 HTTP
              响应中返回。
            </p>
            <p>
              你 confirm 之后将在 1 小时内允许所有 live=mainnet 策略
              真实下单。确认继续？
            </p>
          </div>
        }
        confirmLabel="申请"
        confirmColor="warning"
        onConfirm={handleRequestToken}
      />
    </div>
  );
}

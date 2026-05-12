"use client";

import { Button, Input } from "@heroui/react";
import { useState } from "react";

import { Callout } from "@/components/callout";
import { ChartShell } from "@/components/chart-shell";
import { CommandPalette, PaletteItem } from "@/components/command-palette";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable } from "@/components/data-table";
import { Drawer } from "@/components/drawer";
import { EmptyState } from "@/components/empty-state";
import { FormField } from "@/components/form-field";
import { OrderBook } from "@/components/order-book";
import { PageHeader } from "@/components/page-header";
import { RiskMeter } from "@/components/risk-meter";
import { Section } from "@/components/section";
import { Stat } from "@/components/stat";
import { StatusBadge } from "@/components/status-badge";
import { Tabs } from "@/components/tabs";
import { useToast } from "@/components/toast";

// Node 2.C.2 — dev-only component playground.
//
// Not linked from the sidebar; access via /dev/components directly.
// Each new component renders a representative sample so a designer or
// reviewer can eyeball them without spinning up real data.

const sampleBids = [
  { price: 0.42, size: 1200 },
  { price: 0.41, size: 850 },
  { price: 0.4, size: 2300 },
  { price: 0.39, size: 600 },
  { price: 0.38, size: 4500 },
];
const sampleAsks = [
  { price: 0.43, size: 900 },
  { price: 0.44, size: 1100 },
  { price: 0.45, size: 2000 },
  { price: 0.46, size: 1500 },
  { price: 0.47, size: 3200 },
];

const sampleRows = [
  { id: "1", name: "GridDCA BTC", status: "运行", pnl: "+$1,234" },
  { id: "2", name: "Polymarket NFL Wk5", status: "暂停", pnl: "-$45" },
  { id: "3", name: "OKX BTC scalper", status: "运行", pnl: "+$78" },
];

// Synthetic line chart data.
function synthBars(n: number) {
  const out: { time: number; value: number }[] = [];
  let v = 100;
  const now = Math.floor(Date.now() / 1000);
  for (let i = n; i > 0; i--) {
    v += (Math.random() - 0.5) * 4;
    out.push({ time: now - i * 3600, value: Math.max(0, v) });
  }
  return out;
}

export default function DevComponentsPage() {
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("kpi");
  const [tf, setTf] = useState("1h");
  const [chartData] = useState(() => synthBars(50));
  const [name, setName] = useState("");

  const paletteItems: PaletteItem[] = [
    { id: "p1", label: "策略列表", group: "导航", action: () => toast.info("跳转 /strategies") },
    { id: "p2", label: "账户", group: "导航", action: () => toast.info("跳转 /accounts") },
    { id: "p3", label: "Halt trading", group: "管理动作", action: () => toast.warning("触发 halt") },
    { id: "p4", label: "新建回测", group: "高频动作", action: () => toast.success("打开 /backtests/new") },
  ];

  return (
    <div className="space-y-8">
      <Callout variant="warning" title="开发预览页">
        本页仅用于组件展示，生产将隐藏。资源：<code>/dev/components</code>
      </Callout>

      <PageHeader
        title="组件库 Playground"
        subtitle="Node 2.C.2 — 核心组件 + token 体系"
        action={
          <Button color="primary" onPress={() => setPaletteOpen(true)}>
            打开 cmd+k
          </Button>
        }
      />

      <Section title="Stat (KPI 卡)">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="总资产" value="$12,345.67" delta={{ value: "+1.23%", direction: "up" }} />
          <Stat label="24h PnL" value="-$87.40" delta={{ value: "-0.71%", direction: "down" }} />
          <Stat label="未平仓" value="3" hint="跨 2 个交易所" />
          <Stat label="AI 预算余额" value="$42.15" delta={{ value: "持平", direction: "flat" }} />
        </div>
      </Section>

      <Section title="StatusBadge — 三种 variant + 三档 size">
        <div className="flex flex-wrap gap-3 items-center">
          <StatusBadge tone="success">运行</StatusBadge>
          <StatusBadge tone="danger" variant="solid">暂停</StatusBadge>
          <StatusBadge tone="warning" size="lg">需审批</StatusBadge>
          <StatusBadge tone="success" variant="dot">Live</StatusBadge>
          <StatusBadge tone="danger" variant="dot" size="sm">Halted</StatusBadge>
          <StatusBadge tone="default" variant="dot" size="lg">Idle</StatusBadge>
        </div>
      </Section>

      <Section title="RiskMeter">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <RiskMeter value={3} max={10} label="安全档" />
          <RiskMeter value={6.5} max={10} label="警示档" />
          <RiskMeter value={9.2} max={10} label="危险档" showPercent />
        </div>
      </Section>

      <Section title="OrderBook (Polymarket sample)">
        <div className="max-w-md">
          <OrderBook
            bids={sampleBids}
            asks={sampleAsks}
            mid={<span className="font-mono">mid 0.425</span>}
          />
        </div>
      </Section>

      <Section title="ChartShell — line + timeframe tabs">
        <ChartShell
          data={chartData}
          type="line"
          timeframes={["1m", "5m", "15m", "1h", "4h", "1d"]}
          selectedTimeframe={tf}
          onTimeframeChange={setTf}
        />
      </Section>

      <Section title="DataTable (mobile → card)">
        <DataTable
          ariaLabel="strategies sample"
          columns={[
            { key: "name", label: "策略名" },
            { key: "status", label: "状态" },
            { key: "pnl", label: "PnL", align: "end" },
          ]}
          rows={sampleRows}
          getRowKey={(r) => r.id}
        />
      </Section>

      <Section title="FormField">
        <div className="max-w-md space-y-4">
          <FormField label="名称" hint="3-8 个字符，唯一" required>
            <Input value={name} onValueChange={setName} placeholder="GridDCA-BTC" />
          </FormField>
          <FormField
            label="API Key"
            hint="仅在加密前生效"
            error={name === "bad" ? "name 不能为 bad" : undefined}
          >
            <Input placeholder="..." />
          </FormField>
        </div>
      </Section>

      <Section title="Tabs (segmented)">
        <Tabs
          ariaLabel="strategy sub-pages"
          items={[
            { key: "kpi", label: "KPI", content: <div className="p-4 text-sm">KPI content</div> },
            { key: "params", label: "参数", content: <div className="p-4 text-sm">Params content</div> },
            { key: "orders", label: "订单", content: <div className="p-4 text-sm">Orders content</div> },
            { key: "ai", label: "AI", content: <div className="p-4 text-sm">AI content</div> },
          ]}
          selectedKey={activeTab}
          onSelectionChange={setActiveTab}
        />
      </Section>

      <Section title="Modals & overlays">
        <div className="flex flex-wrap gap-2">
          <Button color="danger" onPress={() => setConfirmOpen(true)}>
            打开 ConfirmDialog
          </Button>
          <Button onPress={() => setDrawerOpen(true)}>打开 Drawer</Button>
          <Button onPress={() => toast.success("操作成功", { description: "Toast demo" })}>
            success toast
          </Button>
          <Button color="danger" onPress={() => toast.error("操作失败", { description: "Boom" })}>
            error toast
          </Button>
          <Button color="warning" onPress={() => toast.warning("注意")}>
            warning toast
          </Button>
        </div>
      </Section>

      <Section title="EmptyState (参考)">
        <EmptyState
          title="还没有策略"
          description="创建第一个策略后这里会列出实时状态"
          action={<Button color="primary">前往新建</Button>}
        />
      </Section>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="确认 halt trading？"
        message="所有正在等待提交的订单将被拒绝，已开仓不会被平仓。"
        confirmLabel="halt"
        confirmColor="danger"
        onConfirm={() => {
          toast.success("已 halt");
        }}
      />

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} title="Drawer 示例" side="right">
        <div className="space-y-3 text-sm">
          <p>右侧抽屉常用于详情 / 编辑面板。移动端可改为底部抽屉：</p>
          <Button onPress={() => setDrawerOpen(false)}>关闭</Button>
        </div>
      </Drawer>

      <CommandPalette items={paletteItems} open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

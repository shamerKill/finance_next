"use client";

// Renders an equity curve via the shared <ChartShell> primitive (line
// type). The lightweight-charts lifecycle (createChart, dynamic import,
// resize observer, theme awareness) is owned by ChartShell — we only
// shape the data into its ChartBar interface.

import { ChartShell, type ChartBar } from "@/components/chart-shell";
import { EmptyState } from "@/components/empty-state";
import type { TypeEquityPoint } from "@/data/type";

type Props = {
  points: TypeEquityPoint[];
};

export function EquityChart({ points }: Props) {
  if (points.length === 0) {
    return (
      <EmptyState
        title="暂无资金曲线数据"
        description="回测仍在运行或所选区间无 K 线数据。"
      />
    );
  }

  const data: ChartBar[] = points.map((p) => ({
    time: p.time,
    value: p.equity,
  }));

  return <ChartShell type="line" data={data} />;
}

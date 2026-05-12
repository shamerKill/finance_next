"use client";

// Client island that hosts the design-system <Tabs> for strategy detail.
// Lives separately from page.tsx because the parent is an async server
// component and <Tabs> calls React.createContext internally.

import { ReactNode, useState } from "react";

import { Tabs } from "@/components/tabs";

interface Props {
  overview: ReactNode;
  params: ReactNode;
  risk: ReactNode;
  orders: ReactNode;
  backtests: ReactNode;
  ai: ReactNode;
}

export function StrategyDetailTabs({
  overview,
  params,
  risk,
  orders,
  backtests,
  ai,
}: Props) {
  const [active, setActive] = useState("overview");
  return (
    <Tabs
      ariaLabel="strategy detail sections"
      selectedKey={active}
      onSelectionChange={setActive}
      items={[
        { key: "overview", label: "概览", content: <div className="pt-4">{overview}</div> },
        { key: "params", label: "参数", content: <div className="pt-4">{params}</div> },
        { key: "risk", label: "风控", content: <div className="pt-4">{risk}</div> },
        { key: "orders", label: "订单", content: <div className="pt-4">{orders}</div> },
        { key: "backtests", label: "回测", content: <div className="pt-4">{backtests}</div> },
        { key: "ai", label: "AI 推荐", content: <div className="pt-4">{ai}</div> },
      ]}
    />
  );
}

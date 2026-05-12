import { requireAdmin } from "../require-admin";

import { TradingSettingsClient } from "./client";

// Node 3.E.3 — /settings/trading admin sub-page.
//
// Surfaces the three "mainnet gate" pieces in one view:
//   1. env-level enable flags (MAINNET_TRADING_ENABLED, POLYMARKET_TRADING_ENABLED)
//   2. POLYGON_RPC_URL presence
//   3. interactive admin token request/confirm flow that opens the
//      1-hour mainnet trading window (shared TokenStore across Binance
//      mainnet and Polymarket per the CLAUDE.md security contract).
export default async function SettingsTradingPage() {
  await requireAdmin();
  return <TradingSettingsClient />;
}

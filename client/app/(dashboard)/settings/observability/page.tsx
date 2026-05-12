import { requireAdmin } from "../require-admin";

import { ObservabilitySettingsClient } from "./client";

// Node 3.E.3 — /settings/observability admin sub-page.
//
// Wraps the client component (which polls /settings/system-info every
// 10s to drive the dep dots) behind the admin gate. Server-side: just
// the role check.
export default async function SettingsObservabilityPage() {
  await requireAdmin();
  return <ObservabilitySettingsClient />;
}

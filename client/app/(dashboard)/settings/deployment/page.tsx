import { requireAdmin } from "../require-admin";

import { DeploymentSettingsClient } from "./client";

// Node 3.E.3 — /settings/deployment admin sub-page.
//
// Fully read-only deployment snapshot: build version + time, dep health,
// KEK provider, CORS / auth posture, AI budget caps. Surfaces critical
// security warnings (ALLOW_S2S_HEADER=true) as Callouts.
export default async function SettingsDeploymentPage() {
  await requireAdmin();
  return <DeploymentSettingsClient />;
}

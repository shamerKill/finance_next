import { requireAdmin } from "../require-admin";

import { DataSourcesClient } from "./client";

// Node 3.E.3 — admin sub-page surfacing data-source API-key configuration
// (presence-only booleans), AI context toggle, and per-cron last-success
// timestamps. The server wrapper enforces admin role before the
// (client-side) panel mounts; once mounted, the client component fetches
// /api/v1/settings/system-info to render the readonly status grid.
export default async function SettingsDataSourcesPage() {
  await requireAdmin();
  return <DataSourcesClient />;
}

import { requireAdmin } from "../require-admin";

import { SystemSettingsClient } from "./client";

// /settings/system — kill switch + portfolio limits + admin key /
// user-id local storage knobs. Server wrapper runs the admin gate
// before the (heavily client-side) form mounts.
export default async function SettingsSystemPage() {
  await requireAdmin();
  return <SystemSettingsClient />;
}

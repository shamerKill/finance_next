import { requireAdmin } from "../require-admin";

import { AIConfigClient } from "./client";

export default async function SettingsAIPage() {
  await requireAdmin();
  return <AIConfigClient />;
}

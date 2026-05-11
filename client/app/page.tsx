import { redirect } from "next/navigation";

// First-time visitors land directly inside the dashboard. /accounts is the
// most useful starting view — strategy onboarding flows from there.
export default function Home() {
  redirect("/accounts");
}

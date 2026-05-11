import { redirect } from "next/navigation";

// First-time visitors land on /dashboard — the Wave 2 single-view monitor
// that summarises system halt status, recent PnL, open positions, pending
// recommendations, and the AI budget. From there the operator drills into
// the specific resource pages via the sidebar.
export default function Home() {
  redirect("/dashboard");
}

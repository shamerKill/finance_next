import { redirect } from "next/navigation";
import { ReactNode } from "react";

import { getMeServer } from "@/data/auth-server";

// Auth route-group layout. Deliberately minimal — no sidebar, no
// kill-switch banner, no user menu. Pages inside this group render
// before the user has a session, so any component that hits a
// `/api/v1/*` endpoint on mount would 401 and loop the user back here.
//
// FIX-F: When an already-authenticated user navigates back to /login,
// /register, or /accept-invite, redirect them straight to /dashboard
// rather than showing the form again. Server-side check via
// getMeServer() — runs before any markup is sent so there's no flash.
// getMeServer returns null on 401 (or any failure) so an expired
// cookie still lets the user reach the auth pages.
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const me = await getMeServer();
  if (me) {
    redirect("/dashboard");
  }
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-default-50 px-4 py-8">
      <div className="w-full max-w-md flex flex-col items-center">
        <div className="text-2xl font-semibold mb-6 select-none">
          finance_next
        </div>
        {children}
      </div>
    </div>
  );
}

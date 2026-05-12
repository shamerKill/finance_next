import { ReactNode } from "react";

// Auth route-group layout. Deliberately minimal — no sidebar, no
// kill-switch banner, no user menu. Pages inside this group render
// before the user has a session, so any component that hits a
// `/api/v1/*` endpoint on mount would 401 and loop the user back here.
//
// The visual treatment is a vertically centred column with brand text;
// the actual form lives in the page Cards.
export default function AuthLayout({ children }: { children: ReactNode }) {
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

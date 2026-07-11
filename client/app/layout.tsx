import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { ToastProvider } from "@/components/toast-provider";

export const metadata: Metadata = {
  // Default + template lets individual pages export a short title (e.g.
  // "账户") and Next.js will compose it as "账户 · finance_next".
  title: {
    default: "finance_next",
    template: "%s · finance_next",
  },
  description: "赚钱",
};

// Inline script: read the persisted theme choice from localStorage and
// set <html data-theme=…> *before* React hydrates. Without this, the
// server renders `data-theme="system"` (the SSR default) and the user
// sees a single-frame flash of the wrong theme on dark-mode reloads.
//
// The script is intentionally tiny + try/catch'd so a private-mode
// browser (where localStorage throws) just falls back to the SSR
// default. We can't use `next/script` here because it would defer past
// hydration — needs to run synchronously inline.
const themeBootScript = `(function(){try{var t=localStorage.getItem('finance_next_theme')||'system';document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // lang stays "en" for now; switch to "zh-CN" is a separate Node.
    // `data-theme="system"` is the SSR default; the boot script above
    // overrides it on the client before paint.
    <html lang="en" data-theme="system">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <Providers>
          {/* Node 2.C.2 — mounted once so any client component can call
           * `useToast()` / `toast.success(...)`. HeroUI's ToastProvider
           * renders the portal region; we wrap it for default placement
           * + timeout. */}
          <ToastProvider />
          {children}
        </Providers>
      </body>
    </html>
  );
}

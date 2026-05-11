import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  // Default + template lets individual pages export a short title (e.g.
  // "账户") and Next.js will compose it as "账户 · finance_next".
  title: {
    default: "finance_next",
    template: "%s · finance_next",
  },
  description: "赚钱",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

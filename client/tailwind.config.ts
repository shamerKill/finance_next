import { heroui } from "@heroui/theme";
import type { Config } from "tailwindcss";

// Node 2.C.1 — design tokens.
//
// Semantic color tokens are CSS-variable-backed so the same tailwind class
// (`bg-bg-surface` / `text-text-secondary` / …) works in both light and
// dark themes. The variables themselves are declared in `app/globals.css`
// under `:root` / `[data-theme="dark"]` blocks; this file only exposes
// the tailwind names that resolve to `rgb(var(--*) / <alpha-value>)`.
//
// HeroUI's own palette (primary / default / success / danger / warning /
// secondary) is left untouched: the `heroui()` plugin below registers it,
// and downstream code uses `<Button color="primary">` / `text-default-500`
// freely. The new tokens are pure additions — no overrides.
//
// Spacing scale: tailwind's default 4/8/12/16/24/32/48px values already
// cover the spec's stride (1/2/3/4/6/8/12), so the scale stays untouched.
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Surfaces
        "bg-canvas": "rgb(var(--bg-canvas) / <alpha-value>)",
        "bg-surface": "rgb(var(--bg-surface) / <alpha-value>)",
        "bg-surface-2": "rgb(var(--bg-surface-2) / <alpha-value>)",
        "border-default": "rgb(var(--border-default) / <alpha-value>)",
        // Text
        "text-primary": "rgb(var(--text-primary) / <alpha-value>)",
        "text-secondary": "rgb(var(--text-secondary) / <alpha-value>)",
        "text-tertiary": "rgb(var(--text-tertiary) / <alpha-value>)",
        // Trading accents (BUY/SELL semantics mirror Binance):
        // up = green (#0ECB81), down = red (#F6465D), warning = yellow,
        // info = teal. `brand-primary` is the existing HeroUI primary
        // (#7EE7FC), exposed here just so it's namable in the token
        // language without going through HeroUI's primary scale.
        "accent-up": "rgb(var(--accent-up) / <alpha-value>)",
        "accent-down": "rgb(var(--accent-down) / <alpha-value>)",
        "accent-warning": "rgb(var(--accent-warning) / <alpha-value>)",
        "accent-info": "rgb(var(--accent-info) / <alpha-value>)",
        "brand-primary": "rgb(var(--brand-primary) / <alpha-value>)",
      },
      fontFamily: {
        // Body / heading face. PingFang / YaHei fallbacks ensure CJK
        // renders crisply on macOS and Windows respectively.
        sans: [
          "Inter",
          '"PingFang SC"',
          '"Microsoft YaHei"',
          "system-ui",
          "sans-serif",
        ],
        // Tabular-figure font for prices, IDs, hashes. JetBrains Mono
        // first (bundled in many dev setups), SF Mono / Menlo macOS,
        // generic monospace last.
        mono: [
          '"JetBrains Mono"',
          '"SF Mono"',
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      fontSize: {
        // Trading-platform numeric scale. lineHeight first, letter-spacing
        // tightened on the smallest size where Inter's defaults look airy.
        "mono-sm": ["12px", { lineHeight: "16px", letterSpacing: "0" }],
        "mono-md": ["14px", { lineHeight: "20px" }],
        "mono-lg": ["20px", { lineHeight: "28px" }],
        "mono-xl": ["32px", { lineHeight: "40px" }],
      },
    },
  },
  plugins: [
    heroui({
      themes: {
        light: {
          colors: {
            primary: {
              DEFAULT: "#7EE7FC",
              foreground: "#111111",
            },
          },
        },
      },
    }),
  ],
};

export default config;

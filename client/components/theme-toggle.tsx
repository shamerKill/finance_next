"use client";

import {
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
} from "@heroui/react";

import { ThemeMode, useTheme } from "@/data/use-theme";

// Node 2.C.1 — three-state theme switcher.
//
// Rendered both standalone (e.g. in a future settings page) and as a
// sub-menu in <UserMenu>. The standalone variant is a HeroUI Dropdown
// with a small SVG icon trigger; the sub-menu variant is consumed by
// <UserMenu> via the lower-level `themeMenuItems()` helper so the
// dropdown nesting stays consistent.
//
// We deliberately avoid the cuter `next-themes` library: the spec only
// needs three modes, persistence is one localStorage key, and the
// boot-time inline script in app/layout.tsx already handles SSR
// flashing.

interface ThemeOption {
  key: ThemeMode;
  label: string;
  description: string;
}

const OPTIONS: ThemeOption[] = [
  { key: "light", label: "浅色", description: "始终使用浅色主题" },
  { key: "dark", label: "深色", description: "始终使用深色主题" },
  { key: "system", label: "跟随系统", description: "根据操作系统切换" },
];

function SunMoonIcon({ mode }: { mode: ThemeMode }) {
  // One icon per state so the trigger gives a visual hint of the
  // current mode at a glance. All paths drawn at 18x18 from a stroked
  // grid for visual parity.
  if (mode === "dark") {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    );
  }
  if (mode === "light") {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    );
  }
  // system — half sun / half moon glyph (a circle with a vertical wedge).
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 19l6-6 4 4 8-8" />
    </svg>
  );
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <Dropdown placement="bottom-end">
      <DropdownTrigger>
        <button
          type="button"
          aria-label="切换主题"
          className="rounded p-1.5 hover:bg-default-100 text-default-600 hover:text-default-900"
        >
          <SunMoonIcon mode={theme} />
        </button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label="主题"
        selectionMode="single"
        selectedKeys={new Set([theme])}
        onAction={(key) => setTheme(String(key) as ThemeMode)}
      >
        {OPTIONS.map((opt) => (
          <DropdownItem key={opt.key} description={opt.description}>
            {opt.label}
          </DropdownItem>
        ))}
      </DropdownMenu>
    </Dropdown>
  );
}

// Helpers exposed for <UserMenu> so it can render the theme list inline
// without instantiating a separate Dropdown (HeroUI dropdowns don't
// nest cleanly).
export const THEME_OPTIONS = OPTIONS;

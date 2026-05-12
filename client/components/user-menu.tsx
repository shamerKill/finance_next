"use client";

import {
  Avatar,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownSection,
  DropdownTrigger,
} from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { THEME_OPTIONS } from "@/components/theme-toggle";
import { logout } from "@/data/auth-client";
import type { TypeUser } from "@/data/type";
import { ThemeMode, useTheme } from "@/data/use-theme";

interface UserMenuProps {
  user: TypeUser | null;
}

// Dropdown rendered into the dashboard toolbar. Falls back to a "登录"
// link when `user` is null (which should only happen during a brief
// hydration window because the dashboard layout itself gates on
// authentication; see (dashboard)/layout.tsx).
//
// The visual treatment is intentionally small: an Avatar with the first
// letter of the email, the role badge, and a dropdown carrying account
// settings (placeholder, disabled until 2.A.4 lands), theme toggle
// (placeholder, owned by Wave 2 node 2.C.1), and logout.
// Theme menu keys are prefixed so they don't collide with other top-level
// menu actions (account / logout). Splitting the prefix back out keeps
// the onAction switch readable.
const THEME_KEY_PREFIX = "theme:";

export function UserMenu({ user }: UserMenuProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const { theme, setTheme } = useTheme();

  if (!user) {
    return (
      <a
        href="/login"
        className="text-sm text-default-600 hover:text-default-900"
      >
        登录
      </a>
    );
  }

  const initial = (user.email[0] ?? "?").toUpperCase();
  const roleLabel = user.role === "admin" ? "管理员" : "成员";

  async function onAction(key: string | number) {
    const k = String(key);
    if (k.startsWith(THEME_KEY_PREFIX)) {
      const mode = k.slice(THEME_KEY_PREFIX.length) as ThemeMode;
      setTheme(mode);
      return;
    }
    if (k === "logout") {
      if (busy) return;
      setBusy(true);
      try {
        await logout();
      } catch {
        // logout is best-effort; even if the server hiccupped the
        // cookie was likely cleared, and the redirect will land the
        // user on /login where /auth/me will sort it out.
      } finally {
        setBusy(false);
        router.push("/login");
      }
    }
  }

  return (
    <Dropdown placement="bottom-end">
      <DropdownTrigger>
        <button
          type="button"
          className="flex items-center gap-2 rounded px-2 py-1 hover:bg-default-100"
          aria-label="用户菜单"
        >
          <Avatar
            name={initial}
            size="sm"
            className="text-xs"
            color={user.role === "admin" ? "primary" : "default"}
          />
          <span className="hidden sm:flex flex-col items-start leading-tight">
            <span className="text-sm">{user.email}</span>
            <span className="text-[10px] text-default-500">{roleLabel}</span>
          </span>
        </button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label="用户菜单"
        onAction={onAction}
        closeOnSelect={false}
      >
        <DropdownSection showDivider>
          <DropdownItem
            key="account"
            isDisabled
            description="即将开放"
          >
            账户设置
          </DropdownItem>
        </DropdownSection>
        <DropdownSection title="切换主题" showDivider>
          {/* Three theme rows: light / dark / system. Selected mode
              gets a check via the description suffix; HeroUI's
              `selectionMode` on a single <DropdownMenu> would force
              all items into the selection group (including account /
              logout), so we render the mark manually. */}
          {THEME_OPTIONS.map((opt) => (
            <DropdownItem
              key={`${THEME_KEY_PREFIX}${opt.key}`}
              description={opt.description}
            >
              {opt.label}
              {theme === opt.key ? "  ✓" : ""}
            </DropdownItem>
          ))}
        </DropdownSection>
        <DropdownItem
          key="logout"
          color="danger"
          className="text-danger"
        >
          {busy ? "登出中…" : "登出"}
        </DropdownItem>
      </DropdownMenu>
    </Dropdown>
  );
}

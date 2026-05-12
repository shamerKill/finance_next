"use client";

import {
  Avatar,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
} from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { logout } from "@/data/auth-client";
import type { TypeUser } from "@/data/type";

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
export function UserMenu({ user }: UserMenuProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

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
      <DropdownMenu aria-label="用户菜单" onAction={onAction}>
        <DropdownItem
          key="account"
          isDisabled
          description="即将开放"
        >
          账户设置
        </DropdownItem>
        <DropdownItem
          key="theme"
          isDisabled
          description="即将开放"
        >
          切换主题
        </DropdownItem>
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

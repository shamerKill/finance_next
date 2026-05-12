"use client";

import { Input } from "@heroui/react";
import { ComponentProps, useState } from "react";

// Node 5.D.1 — PasswordInput.
//
// Drop-in replacement for HeroUI <Input type="password"> that adds an
// inline visibility toggle (eye / eye-slash) in the `endContent` slot.
// Touch target is 44×44 (iOS HIG) on mobile via the parent FormField's
// min-h enforcement; the button itself is 32×32 within the input.
//
// Usage:
//   <PasswordInput label="密码" value={pwd} onValueChange={setPwd} />
//
// All HeroUI <Input> props are forwarded except `type` (forced) and
// `endContent` (owned by the toggle). If you need a custom `endContent`,
// drop down to a raw <Input> and build the toggle yourself.

type InputProps = ComponentProps<typeof Input>;

export type PasswordInputProps = Omit<InputProps, "type" | "endContent">;

export function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <Input
      {...props}
      type={visible ? "text" : "password"}
      endContent={
        <button
          type="button"
          tabIndex={-1}
          aria-label={visible ? "隐藏密码" : "显示密码"}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
          className="flex items-center justify-center text-text-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-up rounded p-1"
        >
          {visible ? <EyeSlashIcon /> : <EyeIcon />}
        </button>
      }
    />
  );
}

function EyeIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeSlashIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

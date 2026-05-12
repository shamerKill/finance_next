"use client";

import { addToast } from "@heroui/react";
import { ReactNode } from "react";

// Node 2.C.2 — toast helpers.
//
// Thin façade over HeroUI's imperative `addToast` API. We expose a hook
// (`useToast`) that mirrors the shape of common toast libs (sonner /
// react-hot-toast), so call sites can:
//
//   const toast = useToast();
//   toast.show("保存成功");
//   toast.success("策略已开启", { description: "Live trading active" });
//   toast.error("接口报错", { description: err.message });
//
// HeroUI's <ToastProvider> (mounted in <ToastProvider /> at root layout)
// owns the actual rendering and timeout state — this file is a pure
// dispatcher. No portal / no JSX of our own.

export type ToastKind = "info" | "success" | "warning" | "error";

const KIND_TO_SEVERITY: Record<
  ToastKind,
  "default" | "success" | "warning" | "danger"
> = {
  info: "default",
  success: "success",
  warning: "warning",
  error: "danger",
};

interface ToastOptions {
  description?: ReactNode;
  /** Override the auto-dismiss timeout in ms. */
  timeout?: number;
}

function emit(
  kind: ToastKind,
  title: ReactNode,
  options?: ToastOptions,
) {
  addToast({
    title,
    description: options?.description,
    severity: KIND_TO_SEVERITY[kind],
    color: KIND_TO_SEVERITY[kind],
    timeout: options?.timeout ?? 4000,
  });
}

export interface ToastApi {
  show: (title: ReactNode, options?: ToastOptions) => void;
  info: (title: ReactNode, options?: ToastOptions) => void;
  success: (title: ReactNode, options?: ToastOptions) => void;
  warning: (title: ReactNode, options?: ToastOptions) => void;
  error: (title: ReactNode, options?: ToastOptions) => void;
}

// Module-level singleton — the underlying addToast lives on a module-
// level HeroUI store, so we don't need to wire React state. Returning the
// same object from `useToast` keeps referential equality across renders.
const toastApi: ToastApi = {
  show: (title, opts) => emit("info", title, opts),
  info: (title, opts) => emit("info", title, opts),
  success: (title, opts) => emit("success", title, opts),
  warning: (title, opts) => emit("warning", title, opts),
  error: (title, opts) => emit("error", title, opts),
};

export function useToast(): ToastApi {
  return toastApi;
}

// Direct exports for non-React call sites (e.g. error handlers in
// data/api-client). They behave identically to the hook methods.
export const toast = toastApi;

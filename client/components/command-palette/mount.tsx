"use client";

// Node 2.C.4 — CommandPaletteMount.
//
// dashboard layout 是 server component；这是它能 mount 的薄包装。
// 拿 usePaletteItems() 合成 items + 监听 `commandpalette:open` 自定义
// 事件（toolbar 按钮 / 测试可触发），然后渲染 <CommandPalette>。

import { useCallback, useEffect, useState } from "react";

import { CommandPalette } from "@/components/command-palette";
import { usePaletteItems } from "@/data/use-palette-items";

export function CommandPaletteMount() {
  const items = usePaletteItems();
  const [open, setOpen] = useState(false);

  // 同时监听全局 cmd+k 与自定义 `commandpalette:open` 事件。
  // CommandPalette 内部本来在 controlledOpen===undefined 时自己装 cmd+k；
  // 但我们这里走 controlled 模式（自定义 event 需要外部 open 状态），
  // 所以 cmd+k 由本组件管理。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpenEvent = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("commandpalette:open", onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("commandpalette:open", onOpenEvent);
    };
  }, []);

  const onOpenChange = useCallback((next: boolean) => setOpen(next), []);

  return (
    <CommandPalette items={items} open={open} onOpenChange={onOpenChange} />
  );
}

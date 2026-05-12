"use client";

import {
  Input,
  Kbd,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
} from "@heroui/react";
import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// Node 2.C.2 — CommandPalette.
//
// Global cmd+k / ctrl+k modal. Renders a search input + grouped result
// list. Substring-match only (no fuse.js dependency); good enough for
// O(few hundred) items the dashboard needs to index.
//
// API design:
//   - `items` is the *full* catalog. 2.C.4 will assemble it from page
//     routes + recent resources + admin actions. This component does no
//     lookups of its own.
//   - selected item's `action()` runs synchronously; we close the modal
//     immediately after.
//   - keyboard: ↑/↓ to move selection, Enter to confirm, Esc to close.
//   - the cmd+k listener is global (window scope). Mount this once in
//     the dashboard layout.

export interface PaletteItem {
  id: string;
  label: ReactNode;
  /** Plain-text label used for fuzzy matching. Defaults to `String(label)`. */
  search?: string;
  group: string;
  hint?: ReactNode;
  action: () => void;
}

export interface CommandPaletteProps {
  items: PaletteItem[];
  /** Optionally control the open state externally. If omitted, this
   * component manages its own open state via cmd+k. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function matches(query: string, item: PaletteItem): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  const hay = (item.search ?? String(item.label)).toLowerCase();
  if (hay.includes(needle)) return true;
  if (item.group.toLowerCase().includes(needle)) return true;
  return false;
}

export function CommandPalette({
  items,
  open: controlledOpen,
  onOpenChange,
}: CommandPaletteProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      setInternalOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Global cmd+k / ctrl+k listener. We don't bind when the palette is
  // externally controlled — the parent owns the hotkey in that case.
  useEffect(() => {
    if (controlledOpen !== undefined) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [controlledOpen, setOpen]);

  // Reset query + selection when the modal opens. The setState calls
  // below are exactly the documented exception to the eslint rule —
  // they synchronise React state with an external trigger (the open
  // toggle, conceptually a control input).
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  const filtered = useMemo(() => items.filter((it) => matches(query, it)), [
    items,
    query,
  ]);

  // Group by `group` while preserving the original insertion order.
  const grouped = useMemo(() => {
    const groups = new Map<string, PaletteItem[]>();
    for (const it of filtered) {
      const arr = groups.get(it.group) ?? [];
      arr.push(it);
      groups.set(it.group, arr);
    }
    return Array.from(groups.entries());
  }, [filtered]);

  const handleSelect = useCallback(
    (item: PaletteItem) => {
      setOpen(false);
      // Defer to next tick so the Modal's close animation can start
      // before the action (which may navigate) fires.
      setTimeout(() => item.action(), 0);
    },
    [setOpen],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[activeIndex];
      if (item) handleSelect(item);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onOpenChange={setOpen}
      placement="top"
      size="xl"
      backdrop="blur"
      hideCloseButton
    >
      <ModalContent>
        <ModalHeader className="px-3 py-2 border-b border-border-default">
          <Input
            autoFocus
            aria-label="搜索导航"
            role="combobox"
            aria-expanded={open}
            aria-controls="command-palette-listbox"
            aria-autocomplete="list"
            value={query}
            onValueChange={(v) => {
              setQuery(v);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="搜索页面、动作或最近资源…"
            variant="flat"
            startContent={<span className="text-text-tertiary">⌕</span>}
            endContent={<Kbd keys={["escape"]}>Esc</Kbd>}
          />
        </ModalHeader>
        <ModalBody className="px-0 py-2 max-h-[60vh] overflow-y-auto">
          <div
            ref={listRef}
            id="command-palette-listbox"
            role="listbox"
            aria-label="搜索结果"
          >
            {grouped.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-text-tertiary">
                未找到匹配项
              </div>
            ) : (
              grouped.map(([group, groupItems]) => (
                <div key={group} className="py-1" role="group" aria-label={group}>
                  <div className="px-4 py-1 text-xs uppercase tracking-wide text-text-tertiary">
                    {group}
                  </div>
                  {groupItems.map((item) => {
                    const idx = filtered.indexOf(item);
                    const isActive = idx === activeIndex;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        onClick={() => handleSelect(item)}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={`w-full flex items-center justify-between gap-3 px-4 py-2 text-left text-sm ${
                          isActive
                            ? "bg-bg-surface-2 text-text-primary"
                            : "text-text-secondary hover:bg-bg-surface-2"
                        }`}
                      >
                        <span>{item.label}</span>
                        {item.hint && (
                          <span className="text-xs text-text-tertiary">
                            {item.hint}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

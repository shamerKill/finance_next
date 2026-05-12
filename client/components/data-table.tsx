"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/react";
import { ReactNode } from "react";

import { useIsDesktop } from "@/data/use-media-query";

export interface DataTableColumn<R> {
  key: string;
  label: ReactNode;
  align?: "start" | "center" | "end";
  render?: (row: R) => ReactNode;
  /** Hide this column when the table is in card-list (mobile) mode. */
  hideOnCard?: boolean;
}

// Thin shim over HeroUI's <Table>. Doesn't reinvent sorting / pagination
// — call sites that need either drop down to <Table> directly. The shim
// only exists to deduplicate the boilerplate of mapping a small column
// spec to the HeroUI tree, and to plumb an empty-state slot through.
//
// Node 2.C.2 — added `mobileLayout` prop. On viewports < md (768px):
//   "card"   (default) → each row becomes a vertical card; columns
//                        render as label/value pairs.
//   "scroll"           → current behavior (horizontal scroll).
// `scroll` is preferred for dense data like orderbook depth where the
// row → card transform breaks readability.

export function DataTable<R>({
  columns,
  rows,
  getRowKey,
  emptyState,
  ariaLabel,
  mobileLayout = "card",
}: {
  columns: DataTableColumn<R>[];
  rows: R[];
  getRowKey: (row: R) => string;
  emptyState?: ReactNode;
  ariaLabel?: string;
  mobileLayout?: "card" | "scroll";
}) {
  // Use JS-side media query so we can swap the JSX tree shape rather
  // than try to retrofit a CSS-only "card mode" onto HeroUI's Table.
  // The initial-paint mismatch (SSR returns desktop layout) is acceptable
  // for an authenticated dashboard — there's no SEO to preserve.
  const isDesktop = useIsDesktop();
  const useCards = !isDesktop && mobileLayout === "card";

  if (useCards) {
    if (rows.length === 0) {
      return (
        <div className="text-sm text-text-tertiary py-6 text-center">
          {emptyState ?? "暂无数据"}
        </div>
      );
    }
    const visibleCols = columns.filter((c) => !c.hideOnCard);
    return (
      <div
        aria-label={ariaLabel ?? "data table"}
        role="list"
        className="flex flex-col gap-2"
      >
        {rows.map((row) => (
          <div
            key={getRowKey(row)}
            role="listitem"
            className="rounded-lg border border-border-default bg-bg-surface p-4"
          >
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
              {visibleCols.map((col) => {
                const value = col.render
                  ? col.render(row)
                  : (row as Record<string, ReactNode>)[col.key];
                return (
                  <div key={col.key} className="contents">
                    <dt className="text-text-tertiary text-xs">{col.label}</dt>
                    <dd className="text-text-primary text-right break-words">
                      {value as ReactNode}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        ))}
      </div>
    );
  }

  return (
    <Table aria-label={ariaLabel ?? "data table"} removeWrapper>
      <TableHeader columns={columns}>
        {(col) => (
          <TableColumn key={col.key} align={col.align ?? "start"}>
            {col.label}
          </TableColumn>
        )}
      </TableHeader>
      <TableBody
        items={rows}
        emptyContent={emptyState ?? "暂无数据"}
      >
        {(row) => (
          <TableRow key={getRowKey(row)}>
            {(columnKey) => {
              const col = columns.find((c) => c.key === String(columnKey));
              const value = col?.render
                ? col.render(row)
                : (row as Record<string, ReactNode>)[String(columnKey)];
              return <TableCell>{value as ReactNode}</TableCell>;
            }}
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

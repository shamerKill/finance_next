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

export interface DataTableColumn<R> {
  key: string;
  label: ReactNode;
  align?: "start" | "center" | "end";
  render?: (row: R) => ReactNode;
}

// Thin shim over HeroUI's <Table>. Doesn't reinvent sorting / pagination
// — call sites that need either drop down to <Table> directly. The shim
// only exists to deduplicate the boilerplate of mapping a small column
// spec to the HeroUI tree, and to plumb an empty-state slot through.
export function DataTable<R>({
  columns,
  rows,
  getRowKey,
  emptyState,
  ariaLabel,
}: {
  columns: DataTableColumn<R>[];
  rows: R[];
  getRowKey: (row: R) => string;
  emptyState?: ReactNode;
  ariaLabel?: string;
}) {
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

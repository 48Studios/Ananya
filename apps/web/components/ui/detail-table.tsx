"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The table used for related records inside a section card.
 *
 * Detail pages list the same kind of thing in the same way: the header band,
 * row height, separators, hover state and numeric alignment are fixed here so a
 * supplier's components, a manufacturer's parts and a location's stock all read
 * alike. Column content stays with the caller — this primitive owns the frame,
 * not the data.
 *
 * The table is not wrapped in a card of its own. It is placed inside a
 * `SectionCard` with `contentClassName="p-0"`, because the cells already carry
 * the horizontal inset and a padded wrapper would double it.
 */

export interface DetailTableColumn<Row> {
  /** Stable column identity, also used as the React key. */
  key: string;
  header: string;
  /**
   * Numeric columns align right so magnitudes line up down the table.
   */
  align?: "left" | "right";
  /**
   * Column width, e.g. `"18%"`. Defining a width on any column switches the
   * table to a fixed layout with an explicit `<colgroup>`.
   */
  width?: string;
  /** Cell classes: truncation, wrapping or a `min-w-0` guard for long values. */
  className?: string;
  render: (row: Row) => React.ReactNode;
}

export interface DetailTableProps<Row> {
  columns: Array<DetailTableColumn<Row>>;
  rows: Row[];
  rowKey: (row: Row) => string;
  className?: string;
}

export function DetailTable<Row>({
  columns,
  rows,
  rowKey,
  className,
}: DetailTableProps<Row>) {
  const hasWidths = columns.some((column) => Boolean(column.width));

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table
        className={cn("w-full text-left text-sm", hasWidths && "table-fixed")}
      >
        {hasWidths ? (
          <colgroup>
            {columns.map((column) => (
              <col key={column.key} style={{ width: column.width }} />
            ))}
          </colgroup>
        ) : null}
        <thead className="bg-muted/40 text-muted-foreground font-medium text-xs border-b border-border">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={cn(
                  "px-6 py-2.5 whitespace-nowrap",
                  column.align === "right" && "text-right",
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="hover:bg-muted/20 transition-colors"
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "px-6 py-2.5 align-middle",
                    column.align === "right" && "text-right",
                    column.className,
                  )}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

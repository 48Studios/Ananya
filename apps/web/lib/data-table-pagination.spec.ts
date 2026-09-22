import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  clampPageIndex,
  dataTableQuerySignature,
  pageIndexForResizedPage,
} from "./data-table-pagination";

/**
 * Data table pagination & notice placement.
 *
 * Three reviewer-reported defects are pinned here:
 *  1. add / edit / delete no longer send the reviewer back to page 1;
 *  2. a custom page size survives those actions and never renders a page that
 *     no longer exists;
 *  3. the status notice lives in the sticky toolbar next to the search controls
 *     instead of scrolling the page to the top of the record.
 *
 * The pagination rules are pure functions and are unit-tested directly; the
 * placement and wiring claims are source assertions over the real files (this
 * workspace has no DOM testing library — the same convention as the rest of the
 * web suite).
 */

const webRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
);
const read = (relativePath: string) =>
  fs.readFileSync(path.join(webRoot, relativePath), "utf8");
const readIfPresent = (relativePath: string) =>
  fs.existsSync(path.join(webRoot, relativePath)) ? read(relativePath) : null;

const dataTablePath = "components/ui/entity-data-table.tsx";
const dataTableSource = read(dataTablePath);

function walkTsx(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(path.join(webRoot, dir), {
    withFileTypes: true,
  })) {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) walkTsx(relative, acc);
    else if (entry.name.endsWith(".tsx")) acc.push(relative);
  }
  return acc;
}

const appFiles = walkTsx("app");

/** Pages that own a success/failure status area above their data table. */
const NOTICE_PAGES = [
  "app/attributes/page.tsx",
  "app/boms/page.tsx",
  "app/categories/page.tsx",
  "app/components/page.tsx",
  "app/cycle-counts/page.tsx",
  "app/goods-receipts/page.tsx",
  "app/locations/page.tsx",
  "app/maintenance/page.tsx",
  "app/manufacturers/page.tsx",
  "app/mrp/page.tsx",
  "app/mrp/runs/page.tsx",
  "app/projects/page.tsx",
  "app/purchase-orders/page.tsx",
  "app/reservations/page.tsx",
  "app/stock-adjustments/page.tsx",
  "app/stock-counts/page.tsx",
  "app/suppliers/page.tsx",
  "app/units/page.tsx",
  "app/warehouse-policies/page.tsx",
  "app/warehouse-transfers/page.tsx",
  "app/work-orders/page.tsx",
];

/** Tables whose rows are filtered by page-level controls before they render. */
const PAGE_FILTERED_TABLES = [
  "app/components/page.tsx",
  "app/reports/inventory/page.tsx",
  "app/reports/manufacturing/page.tsx",
  "app/reports/procurement/page.tsx",
  "app/reports/projects/page.tsx",
  "app/reports/transactions/page.tsx",
];

describe("data table pagination rules", () => {
  it("keeps the reviewer on their page when the data changes", () => {
    // Editing a row on page 4 of 10 never moves the page index.
    expect(clampPageIndex(3, 10)).toBe(3);
    expect(clampPageIndex(0, 10)).toBe(0);
  });

  it("falls back to the last page that still has rows", () => {
    // Deleting the single row of the last page (page 3 of 3).
    expect(clampPageIndex(2, 2)).toBe(1);
    // A shrink that skips several pages still lands on the last one.
    expect(clampPageIndex(5, 3)).toBe(2);
  });

  it("never renders an empty page while rows exist", () => {
    for (let pageIndex = 0; pageIndex < 6; pageIndex += 1) {
      const clamped = clampPageIndex(pageIndex, 3);
      expect(clamped).toBeGreaterThanOrEqual(0);
      expect(clamped).toBeLessThanOrEqual(2);
    }
  });

  it("leaves the position alone while the result set is empty", () => {
    // The empty state must not silently rewrite the reviewer's position.
    expect(clampPageIndex(2, 0)).toBe(2);
    expect(clampPageIndex(0, 0)).toBe(0);
  });

  it("never produces a negative page index", () => {
    expect(clampPageIndex(-3, 4)).toBe(0);
  });

  it("keeps the top row visible when the page size changes", () => {
    // Page 4 of 10 rows/page (starts at row 31) -> 50 rows/page = page 1.
    expect(pageIndexForResizedPage(3, 10, 50)).toBe(0);
    // Page 4 with 20 rows/page (starts at row 61) -> 10 rows/page = page 7.
    expect(pageIndexForResizedPage(3, 20, 10)).toBe(6);
    // A wider page size on the first page stays on the first page.
    expect(pageIndexForResizedPage(0, 10, 100)).toBe(0);
  });

  it("guards a non-positive page size", () => {
    expect(pageIndexForResizedPage(2, 10, 0)).toBe(20);
  });

  it("treats an unchanged query as the same query", () => {
    const query = {
      globalFilter: "",
      columnFilters: [{ id: "isActive", value: "true" }],
      sorting: [{ id: "name", desc: false }],
      resetPageKey: "ELEC|{}|false|false",
    };
    expect(dataTableQuerySignature(query)).toBe(
      dataTableQuerySignature({ ...query }),
    );
  });

  it("detects a new query from search, filters, sorting or page-level filters", () => {
    const base = {
      globalFilter: "",
      columnFilters: [],
      sorting: [],
      resetPageKey: "",
    };
    const signature = dataTableQuerySignature(base);

    expect(dataTableQuerySignature({ ...base, globalFilter: "0805" })).not.toBe(
      signature,
    );
    expect(
      dataTableQuerySignature({
        ...base,
        columnFilters: [{ id: "isActive", value: "false" }],
      }),
    ).not.toBe(signature);
    expect(
      dataTableQuerySignature({
        ...base,
        sorting: [{ id: "sku", desc: true }],
      }),
    ).not.toBe(signature);
    expect(
      dataTableQuerySignature({ ...base, resetPageKey: "RES|{}|true|false" }),
    ).not.toBe(signature);
  });
});

describe("EntityDataTable pagination wiring", () => {
  it("disables the data-change page reset", () => {
    expect(dataTableSource).toContain("autoResetPageIndex: false");
  });

  it("applies the pure pagination rules", () => {
    expect(dataTableSource).toContain("dataTableQuerySignature({");
    expect(dataTableSource).toContain(
      "clampPageIndex(currentPageIndex, pageCount)",
    );
    expect(dataTableSource).toContain("pageIndexForResizedPage(");
  });

  it("resets to the first page only for a different query", () => {
    const effect = dataTableSource.slice(
      dataTableSource.indexOf("previousQuerySignature"),
    );
    expect(effect).toContain(
      "if (previousQuerySignature.current === querySignature) return;",
    );
    expect(effect).toContain("table.setPageIndex(0);");
  });

  it("exposes the page-level filter hook", () => {
    expect(dataTableSource).toContain(
      "resetPageKey?: string | number | boolean;",
    );
    expect(dataTableSource).toContain("resetPageKey,");
  });
});

describe("EntityDataTable sticky status toolbar", () => {
  it("pins the toolbar to the top of the scrolling content", () => {
    expect(dataTableSource).toContain("sticky top-0 z-20");
    expect(dataTableSource).toContain("bg-background");
  });

  it("renders the notice inside the sticky toolbar, above the search row", () => {
    const stickyStart = dataTableSource.indexOf("sticky top-0 z-20");
    const noticeSlot = dataTableSource.indexOf("{notice &&");
    const controlsRow = dataTableSource.indexOf(
      "flex flex-col sm:flex-row items-stretch sm:items-center justify-between",
    );

    expect(stickyStart).toBeGreaterThan(-1);
    expect(noticeSlot).toBeGreaterThan(stickyStart);
    expect(controlsRow).toBeGreaterThan(noticeSlot);
  });

  it("documents the notice contract", () => {
    expect(dataTableSource).toContain("notice?: React.ReactNode;");
  });
});

describe("status notices belong to the data table", () => {
  it("never scrolls the reviewer to a notice", () => {
    for (const file of appFiles) {
      expect(read(file), `${file} must not scroll to a notice`).not.toContain(
        "scrollIntoView",
      );
    }
  });

  it("leaves no notice refs behind", () => {
    for (const file of appFiles) {
      expect(read(file), `${file} must not track a notice ref`).not.toContain(
        "noticeRef",
      );
    }
  });

  it("hands every notice page to the table toolbar", () => {
    for (const page of NOTICE_PAGES) {
      const source = readIfPresent(page);
      expect(source, `${page} is missing`).not.toBeNull();
      expect(source, `${page} must pass notice=`).toContain("notice={");
    }
  });

  it("resets the page when page-level filters change the data", () => {
    for (const page of PAGE_FILTERED_TABLES) {
      const source = readIfPresent(page);
      expect(source, `${page} is missing`).not.toBeNull();
      expect(source, `${page} must pass resetPageKey=`).toContain(
        "resetPageKey={",
      );
    }
  });
});

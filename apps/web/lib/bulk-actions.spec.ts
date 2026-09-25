import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  BULK_ACTION_LABELS,
  BULK_ACTION_MAX_IDS,
  LABEL_COPY_MAX,
  LABEL_COPY_MIN,
  bulkActionDetailRows,
  clampLabelCopies,
  dataTableRowId,
  dataTableRowLabel,
  dataTableSelection,
  labelPrintEntityType,
  orderBulkActions,
  summarizeBulkActionResult,
  totalLabelCount,
} from "./bulk-actions";
import type {
  BulkActionResultDto,
  BulkActionType,
} from "./api/import-export-api";

/**
 * Batch selection, batch actions and batch label printing.
 *
 * The rules are pure functions and are unit-tested directly; the wiring claims
 * are source assertions over the real files (this workspace has no DOM testing
 * library — the same convention as the rest of the web suite).
 */

const webRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
);
const read = (relativePath: string) =>
  fs.readFileSync(path.join(webRoot, relativePath), "utf8");

const dataTablePath = "components/ui/entity-data-table.tsx";
const toolbarPath = "components/ui/bulk-action-toolbar.tsx";
const batchDialogPath = "components/barcodes/batch-print-dialog.tsx";

const ALL_ACTIONS: BulkActionType[] = [
  "DELETE",
  "ARCHIVE",
  "UPDATE_STATUS",
  "ASSIGN_CATEGORY",
  "ASSIGN_LOCATION",
  "ASSIGN_MANUFACTURER",
];

function buildResult(
  overrides: Partial<BulkActionResultDto> = {},
): BulkActionResultDto {
  return {
    entityType: "Component",
    action: "ARCHIVE",
    requestedCount: 2,
    appliedCount: 2,
    skippedCount: 0,
    failedCount: 0,
    results: [
      { id: "a", outcome: "APPLIED", reason: null },
      { id: "b", outcome: "APPLIED", reason: null },
    ],
    ...overrides,
  };
}

describe("bulk action vocabulary", () => {
  it("labels every action the API can report", () => {
    for (const action of ALL_ACTIONS) {
      expect(BULK_ACTION_LABELS[action]).toBeTruthy();
    }
  });

  it("orders the destructive action last", () => {
    expect(
      orderBulkActions(["DELETE", "UPDATE_STATUS", "ARCHIVE"]),
    ).toEqual(["ARCHIVE", "UPDATE_STATUS", "DELETE"]);
  });

  it("keeps the request bound in step with the API", () => {
    expect(BULK_ACTION_MAX_IDS).toBe(500);
  });
});

describe("label printing scope", () => {
  it("maps the entity types that own a label", () => {
    expect(labelPrintEntityType("Component")).toBe("COMPONENT");
    expect(labelPrintEntityType("Location")).toBe("LOCATION");
    expect(labelPrintEntityType("WorkOrder")).toBe("WORK_ORDER");
    expect(labelPrintEntityType("PurchaseOrder")).toBe("PURCHASE_ORDER");
    expect(labelPrintEntityType("Project")).toBe("PROJECT");
  });

  it("offers nothing for entities without a label", () => {
    expect(labelPrintEntityType("Supplier")).toBeNull();
    expect(labelPrintEntityType("Unit")).toBeNull();
    expect(labelPrintEntityType(undefined)).toBeNull();
    expect(labelPrintEntityType("")).toBeNull();
  });
});

describe("row identity and labels", () => {
  it("keys a row by its own id, not by its position", () => {
    expect(dataTableRowId({ id: "abc" }, 7)).toBe("abc");
  });

  it("falls back positionally only when a row has no id", () => {
    expect(dataTableRowId({ sku: "CMP-1" }, 3)).toBe("row-3");
    expect(dataTableRowId({ id: "" }, 0)).toBe("row-0");
    expect(dataTableRowId(null, 1)).toBe("row-1");
  });

  it("reports whether the selection can be addressed by record id", () => {
    expect(dataTableSelection([{ id: "a" }, { id: "b" }])).toEqual({
      ids: ["a", "b"],
      hasEveryRecordId: true,
    });
    expect(dataTableSelection([{ id: "a" }, { name: "no id" }])).toEqual({
      ids: ["a", "row-1"],
      hasEveryRecordId: false,
    });
    expect(dataTableSelection([])).toEqual({
      ids: [],
      hasEveryRecordId: true,
    });
  });

  it("names a row by its most specific human field", () => {
    expect(dataTableRowLabel({ name: "Resistor", sku: "CMP-1" })).toBe(
      "Resistor",
    );
    expect(dataTableRowLabel({ sku: "CMP-1" })).toBe("CMP-1");
    expect(dataTableRowLabel({ id: "uuid-1" })).toBe("uuid-1");
    expect(dataTableRowLabel({})).toBe("Record");
    expect(dataTableRowLabel(null)).toBe("Record");
  });
});

describe("batch results", () => {
  it("always states how many records were actually changed", () => {
    expect(summarizeBulkActionResult(buildResult())).toBe(
      "Applied to 2 of 2 record(s)",
    );
  });

  it("names skips and failures", () => {
    expect(
      summarizeBulkActionResult(
        buildResult({ appliedCount: 1, skippedCount: 1 }),
      ),
    ).toBe("Applied to 1 of 2 record(s) · 1 skipped");
    expect(
      summarizeBulkActionResult(
        buildResult({ appliedCount: 0, failedCount: 2 }),
      ),
    ).toBe("Applied to 0 of 2 record(s) · 2 failed");
  });

  it("lists only the records a reviewer must look at again", () => {
    const rows = bulkActionDetailRows(
      buildResult({
        appliedCount: 1,
        skippedCount: 1,
        results: [
          { id: "a", outcome: "APPLIED", reason: null },
          { id: "b", outcome: "SKIPPED", reason: "Only DRAFT BOMs" },
        ],
      }),
    );

    expect(rows).toEqual([
      { id: "b", outcome: "SKIPPED", reason: "Only DRAFT BOMs" },
    ]);
  });
});

describe("label copies", () => {
  it("clamps the copies control to a printable range", () => {
    expect(clampLabelCopies(3)).toBe(3);
    expect(clampLabelCopies(0)).toBe(LABEL_COPY_MIN);
    expect(clampLabelCopies(-5)).toBe(LABEL_COPY_MIN);
    expect(clampLabelCopies(1000)).toBe(LABEL_COPY_MAX);
    expect(clampLabelCopies(2.7)).toBe(2);
    expect(clampLabelCopies(Number.NaN)).toBe(LABEL_COPY_MIN);
  });

  it("counts what the printer will actually emit", () => {
    expect(totalLabelCount(4, 1)).toBe(4);
    expect(totalLabelCount(4, 3)).toBe(12);
    expect(totalLabelCount(0, 5)).toBe(0);
  });
});

describe("data table wiring", () => {
  const dataTableSource = read(dataTablePath);
  const toolbarSource = read(toolbarPath);
  const batchDialogSource = read(batchDialogPath);

  it("renders a built-in selection column keyed by record id", () => {
    expect(dataTableSource).toContain('const SELECTION_COLUMN_ID = "select"');
    expect(dataTableSource).toMatch(/getRowId: \(row, index\) => dataTableRowId\(row, index\)/);
    expect(dataTableSource).toContain("getIsAllPageRowsSelected()");
    expect(dataTableSource).toContain("row.getIsSelected()");
  });

  it("keeps the skeleton and empty rows aligned with the extra column", () => {
    expect(dataTableSource).toContain("table.getVisibleLeafColumns().map(");
    expect(dataTableSource).toContain(
      "colSpan={table.getVisibleLeafColumns().length}",
    );
  });

  it("gives the selection column room for its control", () => {
    // A 16px checkbox needs 14 + 16 + 14 = 44px. The original 40px column left
    // only 12px of content box, so the header control was squeezed and clipped.
    expect(dataTableSource).toMatch(/headerClassName:\s*"w-10 pl-5 pr-3"/);
    expect(dataTableSource).toMatch(/cellClassName:\s*"w-10 pl-5 pr-3"/);
  });

  it("keeps the checkbox out of the truncating column-title wrapper", () => {
    const branchStart = dataTableSource.indexOf(
      "header.isPlaceholder ? null : isSelectionCol ? (",
    );
    expect(branchStart).toBeGreaterThan(-1);

    const titleBranchStart = dataTableSource.indexOf(") : (", branchStart);
    const selectionBranch = dataTableSource.slice(branchStart, titleBranchStart);

    // The title wrapper puts its content in a `truncate` span, whose overflow
    // clip is what cut the header checkbox down to the cell's content box.
    // (Asserted on the class attribute, not the word: the branch's own comment
    // explains the clip and would otherwise satisfy a bare text search.)
    expect(selectionBranch).not.toMatch(/className="[^"]*\btruncate\b/);
    expect(selectionBranch).not.toMatch(/className="[^"]*whitespace-nowrap/);
    expect(selectionBranch).toContain("flexRender(");

    // Every other column still gets the truncating wrapper.
    expect(dataTableSource.slice(titleBranchStart)).toContain("truncate");
  });

  it("mounts the batch bar for every table, not only export-enabled ones", () => {
    const toolbarBlock = dataTableSource.slice(
      dataTableSource.indexOf("{enableSelection && ("),
      dataTableSource.indexOf("{/* Batch label printing"),
    );

    expect(toolbarBlock).toContain("<BulkActionToolbar");
    expect(toolbarBlock).toContain("selectionHasRecordIds={selectionHasRecordIds}");
    expect(toolbarBlock).toContain("labelEntityType={labelEntityType}");
  });

  it("prints the selection through the QR studio batch dialog", () => {
    expect(dataTableSource).toContain("<BatchPrintDialog");
    expect(dataTableSource).toContain("entityIds={printLabelIds}");
    expect(dataTableSource).toMatch(
      /onPrintLabels=\{\s*labelEntityType && selectionHasRecordIds/,
    );
  });

  it("offers only the actions the API reports as supported", () => {
    expect(toolbarSource).toMatch(
      /importExportApi\s*\.getSupportedBulkActions\(/,
    );
    expect(toolbarSource).toContain("orderBulkActions(supportedActions ?? [])");
    expect(toolbarSource).toContain("Print Labels");
  });

  it("reports per-record outcomes instead of a success count", () => {
    expect(toolbarSource).toContain("summarizeBulkActionResult(result)");
    expect(toolbarSource).toContain("bulkActionDetailRows(result)");
    expect(toolbarSource).toContain("rowLabels?.[item.id]");
  });

  it("sizes the bar to its content instead of a fixed width", () => {
    // A fixed 920px bar left a wide dead gap before the close button. `w-max`
    // is required rather than `w-fit`: with a wrapping flex child, fit-content
    // resolves to the widest ITEM, so the bar collapsed and wrapped early.
    expect(toolbarSource).toMatch(/w-max max-w-\[min\(100%,60rem\)\]/);
    expect(toolbarSource).not.toMatch(/w-\[min\(920px/);
  });

  it("centres on the content area, not the viewport", () => {
    // `fixed` stays for the vertical pinning — a `sticky` bar only pinned while
    // below the fold (measured: bottom 900 -> 375 after scrolling 600px) — but
    // `fixed` alone centres on the VIEWPORT, which put the bar left of the
    // content it acts on. The layout publishes the content offset; `md:` scopes
    // it to the breakpoint where the rail and sidebar are actually shown.
    expect(toolbarSource).toMatch(
      /pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center md:pl-\(--content-area-left\)/,
    );
    expect(toolbarSource).not.toContain("-translate-x-1/2");
  });

  it("lets clicks through the fixed bar's empty width", () => {
    // The wrapper spans the viewport, so it must not swallow clicks meant for
    // the rows behind it.
    expect(toolbarSource).toMatch(/pointer-events-none fixed/);
    expect(toolbarSource).toMatch(/pointer-events-auto w-max/);
  });

  it("gives every action the same width", () => {
    expect(toolbarSource).toMatch(
      /const ACTION_BUTTON_CLASS = "min-w-\[7rem\]"/,
    );
    expect(toolbarSource).toContain("className={ACTION_BUTTON_CLASS}");
  });

  it("gives the outcome its own row under the actions", () => {
    // Inline, a long summary stretched the action row and moved the buttons.
    expect(toolbarSource).toMatch(/border-t border-border px-3 py-2/);
    // The trailing "… records" label was noise and is gone; the entity name now
    // lives in the dismiss control's accessible label instead.
    expect(toolbarSource).not.toContain("{displayLabel} records");
    expect(toolbarSource).toMatch(/aria-label=\{dismissLabel\}/);
  });

  it("assigns the three detail columns explicitly", () => {
    // Fixed name column, fixed verdict, reason takes the rest and wraps — the
    // reason is the whole point of the disclosure, so it is never truncated.
    expect(toolbarSource).toMatch(/w-36 shrink-0 truncate font-medium/);
    expect(toolbarSource).toMatch(/max-w-\[32rem\] flex-1/);
  });

  it("keeps the batch bar and the page behind a print dialog out of the sheet", () => {
    // The floating bar is fixed over the page, so it must never print.
    expect(toolbarSource).toContain("print:hidden");
    // A print dialog owns the sheet: the list it was opened from is hidden.
    const globals = read("app/globals.css");
    expect(globals).toMatch(/body:has\(\[data-slot="dialog-content"\]\) main/);
  });

  it("states the printed quantity and repeats the queue for the printer", () => {
    expect(batchDialogSource).toContain("Copies per Label");
    expect(batchDialogSource).toContain("clampLabelCopies(");
    expect(batchDialogSource).toContain("totalLabelCount(labels.length, copies)");
    // Copies are applied by the print document, not by rendering a second,
    // print-only copy of the queue into the live DOM. The old hidden block was
    // a workaround for printing the live DOM, which no longer happens.
    expect(batchDialogSource).not.toContain("hidden print:flex");
    expect(batchDialogSource).toMatch(
      /sources: faces\.map\(\(node\) => \(\{ node, copies \}\)\)/,
    );
    // One organisation lookup feeds every face, however many copies there are.
    expect(batchDialogSource).toContain("organizationName={organizationName}");
  });
});

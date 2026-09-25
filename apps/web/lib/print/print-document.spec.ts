import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  PRINT_ROOT_ATTRIBUTE,
  PRINT_SAFE_MARGIN_MM,
  buildSheetHtml,
  normalizeCopies,
  printSheetCss,
} from "./print-document";

/**
 * The shared label print pipeline.
 *
 * Labels were printed by calling `window.print()` on the live application DOM,
 * which is why printing was template-dependent: the sheet inherited the
 * application's layout clamps. Measured on the batch dialog with 20 SHELF_BIN
 * labels, the dialog body's height was clamped to 679px around 1890px of
 * content, so the first label sat at -339px (-89.8 mm) — above the page — and
 * the sheet printed blank.
 *
 * The fix prints the MAIN window from a root outside every dialog. An earlier
 * attempt printed a separate document in an iframe, which fails silently in real
 * browsers: a frame's own `print()` is unreliable, so no dialog and no output
 * appeared. These tests pin the mechanism, not just the strings, so that
 * regression cannot come back.
 *
 * The sheet CSS and the sheet contents are checked directly (they are strings);
 * the wiring is checked as source assertions over the real files, the convention
 * the rest of this suite uses.
 */

const webRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  "..",
);
const read = (relativePath: string) =>
  fs.readFileSync(path.join(webRoot, relativePath), "utf8");

const PIPELINE = "lib/print/print-document.ts";
const pipelineSource = read(PIPELINE);

describe("print sheet stylesheet", () => {
  const css = printSheetCss(5, 4);

  it("scopes itself to the print root and nothing else", () => {
    // Every rule must be about the sheet: a broad selector here would start
    // overriding the application's own print behaviour.
    expect(css).toContain(`[${PRINT_ROOT_ATTRIBUTE}]`);
    expect(css).not.toMatch(/^\s*(html|body)\s*\{/m);
  });

  it("declares the page margin inside print, so the app's @page cannot win", () => {
    const printBlock = css.slice(css.indexOf("@media print"));
    expect(printBlock).toContain("@page { size: auto; margin: 5mm; }");
    // Never a fixed page size: the label is the thing with a physical size.
    expect(css).not.toMatch(/size:\s*(A4|Letter)\b/i);
  });

  it("gates every page-level rule on the sheet actually being present", () => {
    // The rest of the application prints with `window.print()` as well (reports,
    // purchase orders, work orders …). A bare `body > *` hiding rule would blank
    // those pages out, so the sheet's presence has to be the condition.
    expect(css).toMatch(
      new RegExp(`body:has\\(> \\[${PRINT_ROOT_ATTRIBUTE}\\]\\)`),
    );
    expect(css).not.toMatch(/^\s*body\s*>\s*:not/m);
  });

  it("lets a pre-positioned sheet ask for no margin", () => {
    expect(printSheetCss(0, 0)).toContain("@page { size: auto; margin: 0mm; }");
  });

  it("keeps a printer-safe margin by default", () => {
    // `@page { margin: 0 }` puts content in the printer's dead border, which is
    // what made the smallest faces (8x11 mm) come out blank.
    expect(PRINT_SAFE_MARGIN_MM).toBeGreaterThan(0);
    expect(printSheetCss()).toContain(`margin: ${PRINT_SAFE_MARGIN_MM}mm`);
  });

  it("hides every other body child in print, so the app cannot reach the page", () => {
    const printBlock = css.slice(css.indexOf("@media print"));
    expect(printBlock).toMatch(
      new RegExp(`> :not\\(\\[${PRINT_ROOT_ATTRIBUTE}\\]\\)`),
    );
    expect(printBlock).toContain("display: none !important");
  });

  it("keeps the sheet laid out off-screen instead of display:none on screen", () => {
    // Content that was never laid out has no resolved size, and a print engine
    // forced to build the layout from scratch can emit empty boxes.
    const screenRules = css.slice(0, css.indexOf("@media print"));
    expect(screenRules).toContain("position: fixed");
    expect(screenRules).not.toContain("display: none");
  });

  it("returns the sheet to normal flow in print", () => {
    const printBlock = css.slice(css.indexOf("@media print"));
    expect(printBlock).toContain("position: static !important");
    expect(printBlock).toContain("width: auto !important");
  });

  it("lays the faces out as a wrapping flow that never splits one across pages", () => {
    expect(css).toContain("flex-wrap: wrap");
    expect(css).toContain("gap: 4mm");
    expect(css).toContain("break-inside: avoid");
  });

  it("never scales or clamps a face", () => {
    expect(css).not.toContain("transform");
    expect(css).not.toContain("zoom");

    // Only the root's OWN declaration blocks: `body:has(> [attr])` legitimately
    // resets overflow on the body, which is not the sheet clamping itself.
    const [screenBlock = "", printBlock = ""] = [
      ...css.matchAll(/\[data-label-print-root\]\s*\{([^}]*)\}/g),
    ].map((match) => match[1]!);

    for (const block of [screenBlock, printBlock]) {
      expect(block).toBeTruthy();
      for (const property of ["max-width", "max-height", "overflow"]) {
        expect(block, `the sheet must not set ${property}`).not.toMatch(
          new RegExp(property, "i"),
        );
      }
    }
  });

  it("prints label backgrounds and borders", () => {
    expect(css).toContain("print-color-adjust: exact");
  });
});

describe("sheet contents", () => {
  const face = { outerHTML: '<div class="face">A</div>' } as unknown as HTMLElement;

  it("prints one face per label by default", () => {
    expect(buildSheetHtml([{ node: face }])).toBe('<div class="face">A</div>');
  });

  it("repeats a face once per copy, with the copies adjacent", () => {
    const other = { outerHTML: '<div class="face">B</div>' } as unknown as HTMLElement;
    expect(
      buildSheetHtml([
        { node: face, copies: 2 },
        { node: other, copies: 1 },
      ]),
    ).toBe(
      '<div class="face">A</div><div class="face">A</div><div class="face">B</div>',
    );
  });

  it("never drops a face for a nonsensical copy count", () => {
    expect(buildSheetHtml([])).toBe("");
    for (const copies of [0, -3, Number.NaN, 0.4]) {
      expect(buildSheetHtml([{ node: face, copies }])).toBe(
        '<div class="face">A</div>',
      );
    }
    expect(buildSheetHtml([{ node: face, copies: 2.7 }])).toBe(
      '<div class="face">A</div><div class="face">A</div>',
    );
  });

  it("normalises copies to a whole number of at least one", () => {
    expect(normalizeCopies(undefined)).toBe(1);
    expect(normalizeCopies(3)).toBe(3);
    expect(normalizeCopies(2.9)).toBe(2);
    expect(normalizeCopies(0)).toBe(1);
    expect(normalizeCopies(-1)).toBe(1);
    expect(normalizeCopies(Number.NaN)).toBe(1);
  });
});

describe("print pipeline wiring", () => {
  const printDialog = read("components/barcodes/print-label-dialog.tsx");
  const batchDialog = read("components/barcodes/batch-print-dialog.tsx");
  const studioPage = read("app/barcodes/page.tsx");

  it("prints the main window, not a separate frame or popup", () => {
    // A frame's own print() fails silently in real browsers: no dialog, no
    // output. This is the mechanism that regressed once already, so it is
    // pinned explicitly rather than inferred.
    expect(pipelineSource).not.toContain("createElement(\"iframe\")");
    expect(pipelineSource).not.toContain("contentWindow");
    expect(pipelineSource).not.toContain("window.open");
    expect(pipelineSource).not.toContain("document.write");
    expect(pipelineSource).toContain("window.print()");
  });

  it("puts the sheet outside the dialog, as a direct child of body", () => {
    expect(pipelineSource).toContain("doc.body.appendChild(root)");
    expect(pipelineSource).toContain(PRINT_ROOT_ATTRIBUTE);
  });

  it("waits on real readiness signals instead of a blanket delay", () => {
    expect(pipelineSource).toMatch(/fonts\??\.ready/);
    expect(pipelineSource).toMatch(/image\.addEventListener\("load"/);
    expect(pipelineSource).toMatch(/image\.addEventListener\("error"/);
    // The only timer in the module is the cleanup fallback, never readiness.
    const timers = pipelineSource.match(/setTimeout\([^)]*\)/g) ?? [];
    expect(timers).toHaveLength(1);
    const cleanupStart = pipelineSource.indexOf("schedulePrintRootCleanup");
    expect(pipelineSource.indexOf(timers[0]!)).toBeGreaterThan(cleanupStart);
  });

  it("cleans up after the job and can recover from an interrupted run", () => {
    // The stylesheet must go with the root: its @page margin would otherwise
    // leak into the application's other print flows.
    const cleanupStart = pipelineSource.indexOf("schedulePrintRootCleanup");
    const cleanupBlock = pipelineSource.slice(cleanupStart);
    expect(cleanupBlock).toContain("root.remove()");
    expect(cleanupBlock).toContain("PRINT_STYLE_ID");
  });

  it("puts its stylesheet last in head so its @page wins", () => {
    expect(pipelineSource).toContain("doc.head.appendChild(style)");
  });

  it("is the only print entry point for labels", () => {
    for (const [name, source] of [
      ["print-label-dialog", printDialog],
      ["batch-print-dialog", batchDialog],
      ["barcodes page", studioPage],
    ] as const) {
      expect(source, `${name} must print through the pipeline`).toContain(
        "printLabelDocument(",
      );
      expect(
        source.includes("window.print()"),
        `${name} must not print the live application DOM directly`,
      ).toBe(false);
    }
  });

  it("clones each previewed face rather than re-rendering it", () => {
    // What is printed is what was reviewed: the face nodes come from the refs.
    expect(printDialog).toMatch(/labelSheetRef\.current\?\.firstElementChild/);
    expect(batchDialog).toContain("labelSheetRef.current?.children");
    // The magnifier is an on-screen aid and must not reach the printer.
    expect(studioPage).toMatch(/labelBoxRef\.current\?\.firstElementChild/);
  });

  it("treats copies as a sheet concern so the queue cannot disagree with it", () => {
    expect(batchDialog).toMatch(
      /sources: faces\.map\(\(node\) => \(\{ node, copies \}\)\)/,
    );
    expect(batchDialog).not.toContain("hidden print:flex");
  });

  it("releases the dialog clamps for a raw Ctrl+P print too", () => {
    const globals = read("app/globals.css");
    expect(globals).toMatch(
      /\[data-slot="dialog-content"\],\s*\[data-slot="dialog-body"\]/,
    );
    expect(globals).toContain("max-height: none !important");
    expect(read("components/ui/dialog-shell.tsx")).toContain(
      'data-slot="dialog-body"',
    );
  });
});

/**
 * Shared label print pipeline.
 *
 * WHY THIS EXISTS
 *
 * Labels were printed by calling `window.print()` on the live application DOM
 * with nothing but `@media print` rules to separate the label from the app. The
 * print page therefore inherited the *application's* layout constraints, and
 * that is what made printing template-dependent and sometimes blank. Measured
 * on the batch dialog (20 labels, SHELF_BIN):
 *
 *   [data-slot="dialog-content"]  height clamped to 681px  (max-h-[calc(100dvh-2rem)])
 *   [data-slot="dialog-body"]     clientHeight 679px around scrollHeight 1890px
 *   first label                   top -339px  ->  -89.8 mm, i.e. ABOVE the page
 *
 * The dialog body is a flex item whose height is clamped by its parent, so its
 * content was displaced far outside the page box. Chromium clips to the page,
 * which prints blank — and because the clamp is in `dvh`, how much leaked
 * depended on the template's height and on how many labels were queued. A short
 * template in a single-label dialog fitted inside the clamp and printed fine;
 * that is why only some templates broke.
 *
 * HOW IT PRINTS
 *
 * A dedicated print root is appended to `<body>` — outside every dialog, every
 * scroll container and every height clamp — the label faces are serialised into
 * it, and `window.print()` prints the main window. A sheet stylesheet hides
 * every other body child and lays the labels out as a wrapping flow.
 *
 * Two decisions are deliberate:
 *
 * 1. **The main window is printed, not a separate document.** A print-only
 *    document in an iframe or a popup looks tidier, but printing a frame is the
 *    part browsers disagree about: the OS print dialog is driven by the top
 *    frame, and a frame's own `print()` is unreliable enough that it fails
 *    silently — no dialog, no output. Printing the main window is the path
 *    every engine supports, and it is the path this application already used.
 *
 * 2. **The root is rendered off-screen rather than `display: none` on screen.**
 *    Content that was never laid out has no resolved size, and a print engine
 *    that has to build the layout from scratch at print time can produce empty
 *    boxes. Keeping the faces laid out (off-screen, out of flow) means the print
 *    pass only has to move them onto the page.
 *
 * The sheet does not depend on the application DOM after it is built: the faces
 * are serialised into the root, so the live page can scroll, resize or unmount
 * without changing what was printed.
 *
 * PHYSICAL DIMENSIONS
 *
 * Label faces are authored in `mm` (e.g. `w-[16mm] h-[18mm]`). A `mm` is an
 * absolute unit, so as long as the sheet does not scale, transform or clamp a
 * face, the printed size is the authored size. This module therefore never
 * transforms a face and never sets a page size — only a page MARGIN (see
 * `PRINT_SAFE_MARGIN_MM`). The `@page` rule is emitted with the sheet stylesheet
 * so it wins over the application's own declaration.
 */

/** Marks the print root so a stale one can be found and removed. */
export const PRINT_ROOT_ATTRIBUTE = "data-label-print-root";

/** Id of the injected sheet stylesheet. */
export const PRINT_STYLE_ID = "label-print-sheet-style";

/**
 * `@page` margin for a label sheet, in millimetres.
 *
 * The application's own print stylesheet declares `@page { margin: 0 }`, which
 * puts content at the paper's exact corner. Consumer printers cannot print
 * there — the dead border is typically 4-6 mm — and a label that lands wholly
 * inside it comes out as a blank sheet, which is what the smallest faces
 * (8x11 mm) did. A 5 mm margin keeps the sheet inside the printable area of
 * essentially every printer while leaving the label's own size untouched.
 *
 * Pass `pageMarginMm: 0` for a pre-positioned label sheet that must sit flush.
 */
export const PRINT_SAFE_MARGIN_MM = 5;

/** Space between two labels on a sheet, in millimetres. */
export const PRINT_SHEET_GAP_MM = 4;

export interface LabelPrintSource {
  /** A rendered label face. It is serialised, never moved or mutated. */
  node: HTMLElement;
  /** How many copies of this face to lay on the sheet. Defaults to 1. */
  copies?: number;
}

export interface PrintLabelDocumentOptions {
  sources: LabelPrintSource[];
  /** `@page` margin in millimetres. Defaults to {@link PRINT_SAFE_MARGIN_MM}. */
  pageMarginMm?: number;
  /** Space between labels in millimetres. */
  gapMm?: number;
}

/**
 * The sheet stylesheet.
 *
 * Deliberately small: it sets the page margin, a white baseline and the sheet's
 * own flow, and nothing else. Anything more would start overriding the
 * templates' dimensions, which are the thing that must survive.
 */
export function printSheetCss(
  pageMarginMm: number = PRINT_SAFE_MARGIN_MM,
  gapMm: number = PRINT_SHEET_GAP_MM,
): string {
  // Every rule that could affect the page is gated on the sheet being present.
  // The rest of the application prints with `window.print()` too (reports,
  // purchase orders, work orders …), and a bare `body > *` hiding rule would
  // blank those pages out. `:has()` makes the sheet's presence the condition.
  const withSheet = `body:has(> [${PRINT_ROOT_ATTRIBUTE}])`;

  return `
/* Off-screen while on screen, in flow while printing. See the module comment. */
[${PRINT_ROOT_ATTRIBUTE}] {
  position: fixed;
  left: -100000px;
  top: 0;
  width: 210mm;
  pointer-events: none;
  z-index: -1;
}

@media print {
  @page { size: auto; margin: ${pageMarginMm}mm; }

  ${withSheet} {
    background: #ffffff !important;
    margin: 0 !important;
    padding: 0 !important;
    height: auto !important;
    overflow: visible !important;
  }

  /* The sheet is the only thing on the page. Every other body child — the app,
     the dialogs, their overlays and the dev overlay — is taken out. */
  ${withSheet} > :not([${PRINT_ROOT_ATTRIBUTE}]) {
    display: none !important;
  }

  [${PRINT_ROOT_ATTRIBUTE}] {
    position: static !important;
    left: auto !important;
    top: auto !important;
    width: auto !important;
    z-index: auto !important;
    display: flex !important;
    flex-wrap: wrap;
    align-content: flex-start;
    align-items: flex-start;
    gap: ${gapMm}mm;
    /* Labels are physical objects: their own background and border must survive
       the printer's background-elision default. */
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Never split a label across two pages. */
  [${PRINT_ROOT_ATTRIBUTE}] > * {
    break-inside: avoid;
    page-break-inside: avoid;
  }
}
`.trim();
}

/**
 * One round of markup per copy, copies of a label adjacent so a run of the same
 * label can be cut from the sheet in one piece.
 */
export function buildSheetHtml(sources: LabelPrintSource[]): string {
  return sources
    .map(({ node, copies = 1 }) => {
      const markup = node.outerHTML;
      return markup.repeat(normalizeCopies(copies));
    })
    .join("");
}

/** Copies land on a sheet at least once, whatever the caller asks for. */
export function normalizeCopies(copies: number | undefined): number {
  const value = Math.trunc(copies ?? 1);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/** Any print root left behind by an interrupted run. */
export function removeStalePrintRoots(doc: Document = document): void {
  doc
    .querySelectorAll(`[${PRINT_ROOT_ATTRIBUTE}]`)
    .forEach((root) => root.remove());
}

/**
 * The sheet stylesheet element, created or refreshed on each run.
 *
 * It is appended (which moves an existing element to the end of `<head>`) so
 * the sheet's `@page` is ordered after the application's own, and it is removed
 * with the root — see `schedulePrintRootCleanup`. Left in place, its `@page`
 * margin would change the page setup of every other print in the application.
 */
function ensureSheetStyle(
  pageMarginMm: number,
  gapMm: number,
  doc: Document = document,
): void {
  let style = doc.getElementById(PRINT_STYLE_ID);
  if (!style) {
    style = doc.createElement("style");
    style.id = PRINT_STYLE_ID;
  }
  style.textContent = printSheetCss(pageMarginMm, gapMm);
  doc.head.appendChild(style);
}

/** Build the print root and fill it with the label faces. */
export function createPrintRoot(
  sheetHtml: string,
  doc: Document = document,
): HTMLElement {
  const root = doc.createElement("div");
  root.setAttribute(PRINT_ROOT_ATTRIBUTE, "");
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = sheetHtml;
  doc.body.appendChild(root);
  return root;
}

/**
 * Everything the sheet needs before the printer may be invoked.
 *
 * Each wait is on a real signal — `document.fonts.ready` and image
 * `load`/`error` — so a fast sheet prints immediately and a slow one still
 * prints correctly. There is no blanket delay.
 *
 * The faces come from the live document, so their fonts and images are normally
 * already settled; a clone is still checked because a re-parse can restart an
 * image decode.
 */
export async function waitForPrintResources(
  root: HTMLElement,
  win: Window = window,
): Promise<void> {
  // Text metrics are only final once fonts have settled. A failure here must
  // not block printing.
  try {
    await win.document.fonts?.ready;
  } catch {
    // Best-effort: the sheet prints with fallback metrics.
  }

  // Labels are inline SVG, but a template may legitimately use <img>: a failed
  // image resolves too, so a broken URL cannot hang the dialog.
  await Promise.all(
    Array.from(root.querySelectorAll("img")).map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        }),
    ),
  );

  // Force a synchronous layout so the sheet is committed before printing.
  void root.offsetHeight;
}

/**
 * Take the sheet off the page once the print job has finished.
 *
 * `afterprint` is the event the print engines actually promise, and it fires
 * after the job is done, so it is the primary signal. The focus fallback (with
 * a grace period) covers an engine that never fires it; neither path gates
 * printing, and the sheet always outlives the job — removing it early would
 * print a blank page.
 */
export function schedulePrintRootCleanup(root: HTMLElement): void {
  let removed = false;
  const cleanupPrintRoot = () => {
    if (removed) return;
    removed = true;
    window.removeEventListener("afterprint", cleanupPrintRoot);
    root.remove();
    // The stylesheet goes with the root: its `@page` margin must not leak into
    // the application's other print flows.
    document.getElementById(PRINT_STYLE_ID)?.remove();
  };

  window.addEventListener("afterprint", cleanupPrintRoot, { once: true });

  // Fallback only, and deliberately generous: the dialog can stay open for as
  // long as the operator likes.
  window.addEventListener(
    "focus",
    () => {
      window.setTimeout(cleanupPrintRoot, 3000);
    },
    { once: true },
  );
}

/**
 * Print the given label faces on their own sheet.
 *
 * Callers pass the faces that are already rendered for the on-screen preview,
 * so what is printed is exactly what was previewed.
 */
export async function printLabelDocument({
  sources,
  pageMarginMm,
  gapMm,
}: PrintLabelDocumentOptions): Promise<void> {
  if (typeof document === "undefined") return;

  const printable = sources.filter((source) => source.node);
  if (printable.length === 0) return;

  // A previous run may have been interrupted before cleanup.
  removeStalePrintRoots();

  const margin = pageMarginMm ?? PRINT_SAFE_MARGIN_MM;
  const gap = gapMm ?? PRINT_SHEET_GAP_MM;
  ensureSheetStyle(margin, gap);

  const root = createPrintRoot(buildSheetHtml(printable));
  await waitForPrintResources(root);

  window.print();

  schedulePrintRootCleanup(root);
}

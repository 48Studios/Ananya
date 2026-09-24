import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

/**
 * Label templates are one file per template in `components/barcodes/templates/`,
 * declared by the registry next to them. The registry and the dispatcher are
 * joined by hand, the three surfaces that offer a template picker are joined to
 * the registry by hand, and the 11 mm QR label is a physical object. None of
 * that is checked by the compiler, so it is pinned here.
 *
 * These are source assertions over the real files — the convention the rest of
 * the web suite uses, because this workspace's vitest setup has no `@/` alias
 * and therefore cannot import application modules.
 */

const webRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
);
const read = (relativePath: string) =>
  fs.readFileSync(path.join(webRoot, relativePath), "utf8");
const exists = (relativePath: string) =>
  fs.existsSync(path.join(webRoot, relativePath));

const TEMPLATES_DIR = "components/barcodes/templates";
const REGISTRY = `${TEMPLATES_DIR}/registry.ts`;
const BARREL = `${TEMPLATES_DIR}/index.ts`;
const DISPATCHER = "components/barcodes/label-preview.tsx";
const QR_11MM_TEMPLATE = `${TEMPLATES_DIR}/qr-code-11mm-label.tsx`;
const QR_1_INCH_TEMPLATE = `${TEMPLATES_DIR}/qr-code-1-inch-label.tsx`;

/** Every template, with the file that renders it and its dispatcher branch. */
const TEMPLATES = [
  {
    template: "STANDARD",
    file: "standard-label.tsx",
    component: "StandardLabel",
  },
  { template: "COMPACT", file: "compact-label.tsx", component: "CompactLabel" },
  { template: "DETAILED", file: "detailed-label.tsx", component: "DetailedLabel" },
  { template: "SHELF_BIN",
    file: "shelf-bin-label.tsx",
    component: "ShelfBinLabel",
  },
  {
    template: "QR_CODE_2_INCH",
    file: "qr-code-2-inch-label.tsx",
    component: "QrCode2InchLabel",
  },
  {
    template: "QR_CODE_1_INCH",
    file: "qr-code-1-inch-label.tsx",
    component: "QrCode1InchLabel",
  },
  {
    template: "QR_CODE_11MM",
    file: "qr-code-11mm-label.tsx",
    component: "QrCode11MmLabel",
  },
] as const;

/** Every surface that offers the template picker. */
const TEMPLATE_SURFACES = [
  "app/barcodes/page.tsx",
  "components/barcodes/print-label-dialog.tsx",
  "components/barcodes/batch-print-dialog.tsx",
];

describe("label template folder", () => {
  it("holds one file per template, all declared in the registry", () => {
    const registry = read(REGISTRY);
    const union = registry.match(/export type LabelTemplate =([\s\S]*?);/)?.[1];
    const options = registry.match(
      /TEMPLATE_OPTIONS: Record<LabelTemplate, string> = \{([\s\S]*?)\n\};/,
    )?.[1];

    expect(union).toBeDefined();
    expect(options).toBeDefined();

    for (const { template, file } of TEMPLATES) {
      // Declared in the union, given a picker label, and rendered by a file.
      expect(union, `${template} missing from the LabelTemplate union`).toContain(
        `"${template}"`,
      );
      expect(options, `${template} missing its picker label`).toContain(
        `${template}:`,
      );
      expect(exists(`${TEMPLATES_DIR}/${file}`), `${file} is missing`).toBe(true);
    }
  });

  it("exports every template component from the barrel", () => {
    const barrel = read(BARREL);

    for (const { component } of TEMPLATES) {
      expect(barrel, `${component} is not exported from the barrel`).toContain(
        `export { ${component} }`,
      );
    }
  });

  it("routes every template in the dispatcher", () => {
    const dispatcher = read(DISPATCHER);

    for (const { template, component } of TEMPLATES) {
      expect(dispatcher, `${template} is never dispatched`).toContain(
        `"${template}"`,
      );
      expect(dispatcher, `${component} is never rendered`).toContain(component);
    }
  });

  it("keeps the dispatcher free of template markup", () => {
    const dispatcher = read(DISPATCHER);

    // The dispatcher's job is dispatch: a template face that grows back into it
    // is how this file became 795 lines.
    expect(dispatcher).not.toContain("<QRCodeViewer");
    expect(dispatcher).not.toContain("<BarcodeViewer");
    expect(dispatcher).toContain('from "./templates"');
  });

  it("is used by every picker surface instead of a private template map", () => {
    for (const file of TEMPLATE_SURFACES) {
      const source = read(file);

      expect(source, `${file} does not import the shared TEMPLATE_OPTIONS`).toContain(
        "TEMPLATE_OPTIONS",
      );
      expect(
        source,
        `${file} does not use the shared QR-only predicate`,
      ).toContain("isQrOnlyTemplate(template)");
      // A local `Record<LabelTemplate, string>` here is the duplication the
      // registry exists to remove.
      expect(
        source,
        `${file} re-declares the template label map`,
      ).not.toContain("TEMPLATE_OPTIONS: Record<LabelTemplate, string>");
      expect(source).not.toContain("QR_CODE_11MM:");
      expect(source).not.toContain("QR_CODE_1_INCH:");
    }
  });

  it("names every QR template by its physical size", () => {
    const registry = read(REGISTRY);

    // The picker is the only place an operator learns how big the sticker is.
    expect(registry).toContain('QR_CODE_2_INCH: "QR Code (2 Inch)"');
    expect(registry).toContain('QR_CODE_1_INCH: "QR Code (1 Inch)"');
    expect(registry).toContain('QR_CODE_11MM: "QR Code (11 MM)"');
  });

  it("merged the two 2-inch QR faces into one template", () => {
    const registry = read(REGISTRY);
    const union =
      registry.match(/export type LabelTemplate =([\s\S]*?);/)?.[1] ?? "";

    // `SQUARE` and `QR_ONLY` both displayed "QR Code (2 Inch)", so they were
    // merged rather than left as two identical picker entries. What must not
    // come back is the duplicate: one 2-inch entry, one face file.
    expect(union).not.toContain('"SQUARE"');
    expect(union).not.toContain('"QR_ONLY"');
    expect(exists(`${TEMPLATES_DIR}/square-label.tsx`)).toBe(false);
    expect(exists(`${TEMPLATES_DIR}/qr-only-label.tsx`)).toBe(false);
    expect(registry.match(/QR Code \(2 Inch\)/g) ?? []).toHaveLength(1);
  });

  it("no longer ships the SMD box lid template", () => {
    const sources = [
      read(REGISTRY),
      read(BARREL),
      read(DISPATCHER),
      read(QR_11MM_TEMPLATE),
    ].join("\n");

    // Removed on request; the API fields it read (mpn/packageName/description)
    // went with it, so a re-introduction has to declare them again.
    expect(sources).not.toContain("SMD_BOX");
    expect(sources).not.toContain("SmdBoxLidLabel");
    expect(exists(`${TEMPLATES_DIR}/smd-box-lid-label.tsx`)).toBe(false);
    expect(read("lib/api/barcodes-api.ts")).not.toContain("packageName");
  });
});

describe("QR Code (1 Inch) template", () => {
  /** Read the numeric value of an exported mm constant. */
  const constMm = (source: string, name: string): number =>
    Number(source.match(new RegExp(`${name} = ([\\d.]+);`))?.[1]);

  it("is exactly one inch square", () => {
    const source = read(QR_1_INCH_TEMPLATE);

    // This template exists because the 2-inch face is built from px classes and
    // so prints at the wrong size. The whole point is that this one does not:
    // 1 in = 25.4 mm, and the label is square.
    expect(constMm(source, "QR_CODE_1_INCH_LABEL_MM")).toBe(25.4);
    expect(source).toContain("QR_CODE_1_INCH_LABEL_MM}mm");
  });

  it("fits its header, QR and footer inside the square", () => {
    const source = read(QR_1_INCH_TEMPLATE);
    const label = constMm(source, "QR_CODE_1_INCH_LABEL_MM");
    const padding = constMm(source, "QR_CODE_1_INCH_PADDING_MM");
    const qr = constMm(source, "QR_CODE_1_INCH_QR_SIZE_MM");
    const header = constMm(source, "QR_CODE_1_INCH_HEADER_FONT_MM");
    const code = constMm(source, "QR_CODE_1_INCH_CODE_FONT_MM");
    const gap = constMm(source, "QR_CODE_1_INCH_GAP_MM");
    const badgeX = constMm(source, "QR_CODE_1_INCH_BADGE_PAD_X_MM");
    const badgeY = constMm(source, "QR_CODE_1_INCH_BADGE_PAD_Y_MM");

    // Every dimension must be a real number, or the budget below is meaningless.
    for (const value of [label, padding, qr, header, code, gap, badgeX, badgeY]) {
      expect(Number.isFinite(value) && value > 0).toBe(true);
    }

    // `box-sizing: border-box` puts the 1px border and the padding inside the
    // square, so this is the arithmetic the printed sticker actually gets.
    const borderMm = 1 / 96 * 25.4;
    const available = label - 2 * borderMm - 2 * padding;
    const headerBlock = header * 1.15 + gap + borderMm;
    const badgeBlock =
      code * 1.2 + 2 * badgeY + 2 * borderMm + gap + borderMm;
    const used = headerBlock + qr + badgeBlock;

    expect(used).toBeLessThanOrEqual(available);
    // The QR must not be the thing that gets squeezed to make the budget work.
    expect(qr).toBeGreaterThanOrEqual(16);
  });

  it("declares every dimension in millimetres, interpolated from the constants", () => {
    const source = read(QR_1_INCH_TEMPLATE);

    // Colours, borders and flex come from Tailwind like the 2-inch face; the
    // geometry does not — a bare `"1mm"` would be a second source of truth.
    expect(source.match(/\d(?:\.\d+)?mm/g) ?? []).toEqual([]);
    expect((source.match(/\}mm/g) ?? []).length).toBeGreaterThan(0);
  });

  it("is a border-box with a hidden overflow, so nothing can spill", () => {
    const source = read(QR_1_INCH_TEMPLATE);

    expect(source).toContain('boxSizing: "border-box"');
    expect(source).toContain('overflow: "hidden"');
  });

  it("keeps a long item code inside the sticker", () => {
    const source = read(QR_1_INCH_TEMPLATE);

    // `shrink-0` alone would let the badge run past the edge for a long code;
    // `max-w-full` + `truncate` is what makes it ellipsize instead.
    expect(source).toContain("max-w-full truncate");
    expect(source).toContain("shrink-0");
  });
});

describe("QR Code (11 MM) template", () => {
  it("is a 1.1 cm square with a QR that fits inside it", () => {
    const source = read(QR_11MM_TEMPLATE);
    const labelMm = Number(
      source.match(/QR_CODE_11MM_LABEL_MM = ([\d.]+);/)?.[1],
    );
    const qrMm = Number(
      source.match(/QR_CODE_11MM_QR_SIZE_MM = ([\d.]+);/)?.[1],
    );
    const paddingMm = Number(
      source.match(/QR_CODE_11MM_PADDING_MM = ([\d.]+);/)?.[1],
    );
    const gapMm = Number(
      source.match(/QR_CODE_11MM_GAP_MM = ([\d.]+);/)?.[1],
    );
    const fontMm = Number(
      source.match(/QR_CODE_11MM_CODE_FONT_MM = ([\d.]+);/)?.[1],
    );

    expect(labelMm).toBe(11);

    // The QR, the code line and the chrome must all fit the square: box-sizing
    // is border-box, so the padding is inside it.
    const codeLineMm = fontMm * 1.1;
    expect(qrMm + gapMm + codeLineMm + 2 * paddingMm).toBeLessThanOrEqual(
      labelMm,
    );
    // A QR this small still needs a quiet zone and modules wide enough to
    // print, so it may not be shrunk to make the arithmetic work.
    expect(qrMm).toBeGreaterThanOrEqual(8);
  });

  it("declares every dimension in millimetres, interpolated from the constants", () => {
    const source = read(QR_11MM_TEMPLATE);

    // Every `mm` unit that carries a number must come from an interpolated
    // constant (`${QR_CODE_11MM_...}mm`), never from a bare literal such as
    // `"8mm"` — that would be a second source of truth for the geometry.
    expect(source.match(/\d(?:\.\d+)?mm/g) ?? []).toEqual([]);
    expect((source.match(/\}mm/g) ?? []).length).toBeGreaterThan(0);
  });

  it("is a border-box with a hidden overflow, so nothing can spill", () => {
    const source = read(QR_11MM_TEMPLATE);

    expect(source).toContain('boxSizing: "border-box"');
    expect(source).toContain('overflow: "hidden"');
  });

  it("scans through the studio's existing QR mechanism", () => {
    const source = read(QR_11MM_TEMPLATE);

    expect(source).toContain("<QRCodeViewer");
    expect(source).toContain("value={label.qrPayload}");
  });

  it("omits the code line when there is no code, and keeps the layout", () => {
    const source = read(QR_11MM_TEMPLATE);

    // The QR grows into the space the missing line frees rather than leaving a
    // blank strip, and a missing payload renders no QR at all instead of
    // breaking the box.
    expect(source).toContain(
      "QR_CODE_11MM_LABEL_MM - 2 * QR_CODE_11MM_PADDING_MM",
    );
    expect(source).toContain("label.qrPayload ?");
  });
});

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

/**
 * Label templates are one file per template in `components/barcodes/templates/`,
 * declared by the registry next to them. The registry and the dispatcher are
 * joined by hand, the three surfaces that offer a template picker are joined to
 * the registry by hand, and every measured label is a physical object. None of
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

/** Every template, with the file that renders it and its dispatcher branch. */
const TEMPLATES = [
  {
    template: "STANDARD",
    file: "standard-label.tsx",
    component: "StandardLabel",
  },
  { template: "COMPACT", file: "compact-label.tsx", component: "CompactLabel" },
  {
    template: "COMPACT_HALF_INCH",
    file: "compact-half-inch-label.tsx",
    component: "CompactHalfInchLabel",
  },
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

    // The picker is the only place an operator learns how big the sticker is,
    // so every QR face must state one. Height is listed first for the portrait
    // faces, which is how they read to a person holding the box.
    expect(registry).toMatch(/QR_CODE_2_INCH: "QR Code \([^"]+\)"/);
    expect(registry).toMatch(/QR_CODE_1_INCH: "QR Code \([^"]+\)"/);
    expect(registry).toMatch(/QR_CODE_11MM: "QR Code \([^"]+\)"/);
  });

  it("merged the two 2-inch QR faces into one template", () => {
    const registry = read(REGISTRY);
    const union =
      registry.match(/export type LabelTemplate =([\s\S]*?);/)?.[1] ?? "";

    // `SQUARE` and `QR_ONLY` both displayed the same picker name, so they were
    // merged rather than left as two identical picker entries. What must not
    // come back is the duplicate: one face per entry.
    expect(union).not.toContain('"SQUARE"');
    expect(union).not.toContain('"QR_ONLY"');
    expect(exists(`${TEMPLATES_DIR}/square-label.tsx`)).toBe(false);
    expect(exists(`${TEMPLATES_DIR}/qr-only-label.tsx`)).toBe(false);
  });

  it("no longer ships an SMD box template", () => {
    const sources = [
      read(REGISTRY),
      read(BARREL),
      read(DISPATCHER),
    ].join("\n");

    // Removed on request. An earlier SMD face also read API fields the barcode
    // API never returned (mpn / packageName / description), so a re-introduction
    // has to declare those fields again before it can render.
    expect(sources).not.toContain("SMD_BOX");
    expect(sources).not.toContain("SmdBox");
    expect(exists(`${TEMPLATES_DIR}/smd-box-label.tsx`)).toBe(false);
    expect(exists(`${TEMPLATES_DIR}/smd-box-lid-label.tsx`)).toBe(false);
    expect(read("lib/api/barcodes-api.ts")).not.toContain("packageName");
  });
});

/**
 * Every measured face is a fixed physical sticker, and its picker label is the
 * only place an operator is told how big it is. A label that promises a size the
 * box does not have is the defect these tests exist to catch: the 2-inch QR face
 * was once 32 mm × 59 mm of px classes under a name that said 2 inch, and the
 * compact face was 67.7 mm wide under a name that said 2 inch. The px-built
 * faces (`STANDARD`, `COMPACT`, `DETAILED`, `SHELF_BIN`) are held to the same
 * rule as the QR family, so the picker and the printer cannot drift apart again.
 */
describe("template physical sizes", () => {
  /** Every face whose box is a fixed physical size, with the file that draws it. */
  const MEASURED_FACES = [
    { template: "STANDARD", file: "standard-label.tsx" },
    { template: "COMPACT", file: "compact-label.tsx" },
    { template: "COMPACT_HALF_INCH", file: "compact-half-inch-label.tsx" },
    { template: "DETAILED", file: "detailed-label.tsx" },
    { template: "SHELF_BIN", file: "shelf-bin-label.tsx" },
    { template: "QR_CODE_2_INCH", file: "qr-code-2-inch-label.tsx" },
    { template: "QR_CODE_1_INCH", file: "qr-code-1-inch-label.tsx" },
    { template: "QR_CODE_11MM", file: "qr-code-11mm-label.tsx" },
  ] as const;

  /** Faces that are a QR and nothing else, so the QR-specific rules apply. */
  const QR_FACES = [
    "QR_CODE_2_INCH",
    "QR_CODE_1_INCH",
    "QR_CODE_11MM",
  ] as const;

  /** The `w-[Xmm]` / `h-[Ymm]` the face declares, in millimetres. */
  const declaredBoxMm = (template: string) => {
    const file = MEASURED_FACES.find((face) => face.template === template)!.file;
    const source = read(`${TEMPLATES_DIR}/${file}`);
    const width = Number(source.match(/w-\[([\d.]+)mm\]/)?.[1]);
    const height = Number(source.match(/h-\[([\d.]+)mm\]/)?.[1]);
    expect(Number.isFinite(width), `${file} declares no w-[..mm]`).toBe(true);
    expect(Number.isFinite(height), `${file} declares no h-[..mm]`).toBe(true);
    return { file, width, height, source };
  };

  /**
   * The two measurements in a picker label, converted to millimetres.
   *
   * Both quote styles are read: the inch faces are written with the inch mark
   * inside a single-quoted string (`'Compact (1" x 2")'`), the QR family with
   * the word `Inch` inside a double-quoted one.
   */
  const promisedMm = (template: string): number[] => {
    const registry = read(REGISTRY);
    const label = registry.match(
      new RegExp(`${template}: (['"])([\\s\\S]*?)\\1,`),
    )?.[2];
    expect(label, `${template} has no picker label`).toBeDefined();

    // `N Inch` / `N MM` for the QR family, `N"` for the inch faces. A size word
    // inside a name (`Half-Inch`) has no digit in front of it, so it is not a
    // measurement.
    const numbers = [
      ...label!.matchAll(/([\d.]+)\s*(Inch\b|MM\b|")/gi),
    ].map(([, value, unit]) =>
      // The only millimetre unit in use is `MM`; every other reading is inches,
      // whether it is spelled out or given as an inch mark.
      /^mm$/i.test(unit!) ? Number(value) : Number(value) * 25.4,
    );
    expect(numbers, `${template} picker label states no size`).toHaveLength(2);
    return numbers;
  };

  /**
   * The class string of the label BOX — the root element's template literal,
   * identified by being the one that carries the millimetre width.
   *
   * Scoped to that literal on purpose: a face is allowed to size an inner
   * divider in pixels (`h-[12px]`), and the old defect was not an inner element
   * — it was the box itself being a px size under an inch-shaped name.
   */
  const boxClasses = (source: string, file: string): string => {
    const literal = source.match(/`([^`]*w-\[[\d.]+mm\][^`]*)`/)?.[1];
    expect(literal, `${file} declares no mm-sized box`).toBeDefined();
    return literal!;
  };

  it.each(MEASURED_FACES.map((face) => face.template))(
    "%s declares its box in millimetres, not pixels",
    (template) => {
      const { file, source } = declaredBoxMm(template);
      const box = boxClasses(source, file);

      // Pixels are what made the old 2-inch face print at 59 mm: a px class
      // depends on the screen, a mm class does not.
      expect(box, `${file} sizes its box in px`).not.toMatch(
        /[wh]-\[[\d.]+(?:px|rem|em)\]/,
      );
      expect(box, `${file} must declare both a width and a height`).toMatch(
        /w-\[[\d.]+mm\]/,
      );
      expect(box, `${file} must declare both a width and a height`).toMatch(
        /h-\[[\d.]+mm\]/,
      );
    },
  );

  it.each(MEASURED_FACES.map((face) => face.template))(
    "%s is the size its picker label promises",
    (template) => {
      const { width, height } = declaredBoxMm(template);
      const promised = promisedMm(template).sort((a, b) => a - b);
      const actual = [width, height].sort((a, b) => a - b);

      // Sorted, because a picker label lists height first for the portrait
      // faces. The tolerance is 1.5 mm, which is what the 1-inch QR face needs:
      // its 0.67 inch is really 17.018 mm against a declared 16 mm. Every face
      // converted from px classes lands exactly on its promise. It still fails
      // on the defects this guards — a name claiming 2 inch on a box a whole
      // inch short, or a 67.7 mm wide face under a 2 inch name.
      expect(
        Math.abs(actual[0]! - promised[0]!),
        `${template}: box ${actual[0]}mm vs promised ${promised[0]}mm`,
      ).toBeLessThanOrEqual(1.5);
      expect(
        Math.abs(actual[1]! - promised[1]!),
        `${template}: box ${actual[1]}mm vs promised ${promised[1]}mm`,
      ).toBeLessThanOrEqual(1.5);
    },
  );

  it.each(QR_FACES)(
    "%s renders a QR through the studio's shared viewer",
    (template) => {
      const { source } = declaredBoxMm(template);

      expect(source).toContain("<QRCodeViewer");
      expect(source).toContain("value={label.qrPayload}");
      // The printed quiet zone lives inside the SVG, so a template must not
      // re-encode the payload itself.
      expect(source).not.toContain("qrcode");
    },
  );

  it("sizes the 11 mm QR from its box, so no clip is load-bearing there", () => {
    const { source } = declaredBoxMm("QR_CODE_11MM");

    // The face is 8 mm wide behind a 1 px border, so its inner width is 7.47 mm
    // and the QR has to be exactly that. A fixed `size` cannot say it: 30 px of
    // SVG is 7.94 mm, i.e. 0.23 mm proud on each side, which only looked right
    // on screen because the wrapper clipped it — and print is where that clip is
    // not honoured, so the code printed over the border. The area is now the
    // space the divider leaves, and the viewer's SVG is stretched to it.
    const area = source.match(/"([^"]*flex-1[^"]*)"/)?.[1];
    expect(area, "the QR area does not take the box's leftover space").toBeDefined();
    expect(area).toContain("min-h-0");
    expect(
      area,
      "a percentage height is a shrink-to-fit, not a size",
    ).not.toContain("h-full");
    expect(source).toContain("[&>svg]:w-full");
    expect(source).toContain("[&>svg]:h-full");

    // The divider is a budget, not a free choice: the box is 11 mm tall and the
    // QR needs the 7.47 mm width, so the band (its 1 px top border included) may
    // not exceed ~11.34 px or the QR starts being height-limited instead.
    const divider = source.match(/"([^"]*h-\[[\d.]+px\][^"]*)"/)?.[1];
    expect(divider, "the divider no longer declares its height").toBeDefined();
    expect(divider).toContain("shrink-0");
    const bandPx = Number(divider!.match(/h-\[([\d.]+)px\]/)![1]);
    expect(
      bandPx,
      `a ${bandPx}px divider leaves the QR less than its 7.47 mm width`,
    ).toBeLessThanOrEqual(11.34);
  });
});

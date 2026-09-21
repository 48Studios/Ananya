import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

/**
 * Component Details — card consistency and specification presentation.
 *
 * The page is now a composition of one shared section primitive, so these are
 * source assertions over the real files rather than DOM assertions (this
 * workspace has no DOM testing library — the same convention as the rest of the
 * web suite). They pin the two things the redesign is responsible for: every
 * major section is rendered through `SectionCard`, and Product Specifications
 * present values without clipping them or rebuilding units.
 */

const webRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (relativePath: string) =>
  fs.readFileSync(path.join(webRoot, relativePath), "utf8");

const pagePath = "app/components/[id]/page.tsx";
const sectionCardPath = "components/ui/section-card.tsx";
const documentationPanelPath = "components/documentation/documentation-panel.tsx";

const pageSource = read(pagePath);
const sectionCardSource = read(sectionCardPath);
const documentationPanelSource = read(documentationPanelPath);

/** Every section the page is expected to render through the primitive. */
const SECTION_TITLES = [
  "Basic Information",
  "Product Specifications",
  "Storage & Stock Locations",
  "Inventory Transaction Ledger",
];

/**
 * The Product Specifications content: from the attribute grid up to the empty
 * state that replaces it.
 */
function specificationSection(): string {
  const start = pageSource.indexOf("grid-cols-1 gap-x-8 gap-y-5");
  const end = pageSource.indexOf("No specifications have been added yet");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return pageSource.slice(start, end);
}

describe("Component Details section cards", () => {
  it("renders every major section through the shared primitive", () => {
    expect(pageSource).toContain('from "@/components/ui/section-card"');

    for (const title of SECTION_TITLES) {
      expect(pageSource).toContain(`title="${title}"`);
    }
  });

  it("leaves no one-off section shell behind on the page", () => {
    // The card shell (border, radius, surface) belongs to the primitive only.
    expect(pageSource).not.toContain("rounded-xl");
    expect(pageSource).not.toMatch(/<section\b/);
  });

  it("opens and closes exactly one card per section", () => {
    const opens = pageSource.match(/<SectionCard[\s>]/g) ?? [];
    const closes = pageSource.match(/<\/SectionCard>/g) ?? [];

    expect(opens).toHaveLength(SECTION_TITLES.length);
    expect(closes).toHaveLength(SECTION_TITLES.length);
  });

  it("defines the header structure once, unconditionally", () => {
    // Icon, title, description, actions and the full-width separator live in
    // one element so no section can drop the separator or drift on padding.
    expect(sectionCardSource).toContain(
      '<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-6 py-4">',
    );
    expect(sectionCardSource).toContain(
      '<h3 className="flex items-center gap-2 text-base font-semibold text-foreground">',
    );
    expect(sectionCardSource).toContain(
      '<p className="mt-0.5 text-xs text-muted-foreground">',
    );
    expect(sectionCardSource).toContain(
      '<Icon className="size-4 shrink-0 text-primary" />',
    );
    expect(sectionCardSource).toContain('cn("px-6 py-5", contentClassName)');
  });

  it("never forces a section height", () => {
    for (const source of [sectionCardSource, pageSource]) {
      expect(source).not.toMatch(/min-h-/);
      expect(source).not.toMatch(/\bh-\[/);
    }
  });

  it("keeps the compact KPI strip and full-width sections", () => {
    // Six KPI cards above the sections; no section is nested in a column grid.
    expect((pageSource.match(/<StatCard/g) ?? []).length).toBe(6);
    expect(pageSource).not.toMatch(/col-span[^"]*"[^>]*>\s*<SectionCard/);
  });

  it("renders Documentation through the same primitive", () => {
    expect(documentationPanelSource).toContain('from "@/components/ui/section-card"');
    expect(documentationPanelSource).toContain('title="Documentation"');
    expect(documentationPanelSource).toContain("<SectionCard");
    expect(documentationPanelSource).toContain("</SectionCard>");
  });
});

describe("Product Specifications attribute presentation", () => {
  it("stacks a quiet label above a dominant value", () => {
    const section = specificationSection();

    expect(section.indexOf("<dt")).toBeLessThan(section.indexOf("<dd"));
    expect(section).toContain(
      '<dt className="text-xs font-medium text-muted-foreground">',
    );
    expect(section).toContain('<dd className="mt-1">');
    expect(pageSource).toContain(
      'className="font-mono text-sm font-semibold break-words text-foreground"',
    );
  });

  it("is responsive from one to four columns", () => {
    expect(specificationSection()).toContain(
      "grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
    );
  });

  it("keeps the API's own attribute collection and ordering", () => {
    expect(pageSource).toContain("Object.entries(component.attributes)");
    // Attributes are rendered in the order the API returned them.
    expect(pageSource).not.toMatch(/component\.attributes[^\n]*sort/);
  });

  it("uses the authoritative value rendering instead of rebuilding units", () => {
    expect(pageSource).toContain("attr.displayValue");
    expect(pageSource).not.toContain("attr.unit");
  });

  it("lets long values wrap instead of truncating them", () => {
    const attributeText = pageSource.slice(
      pageSource.indexOf("function AttributeText"),
    );

    expect(attributeText).toContain("break-words");
    expect(attributeText).not.toContain("truncate");
  });

  it("keeps the empty state inside the section, without a second card", () => {
    const section = pageSource.slice(
      pageSource.indexOf('title="Product Specifications"'),
      pageSource.indexOf("</SectionCard>", pageSource.indexOf('title="Product Specifications"')),
    );

    expect(section).toMatch(/<EmptyState[\s\S]{0,60}compact/);
    expect(section).not.toContain("border-dashed");
  });
});

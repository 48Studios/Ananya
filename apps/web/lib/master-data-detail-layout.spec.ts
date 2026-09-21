import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

/**
 * Master-data detail pages — one visual language.
 *
 * Component Details established the shared detail-page vocabulary (section card,
 * field grid, related-records table, compact empty state, record status badge).
 * These are source assertions over the real files — the same convention as the
 * rest of the web suite, which has no DOM testing library — and they pin the
 * rules that make the master-data pages read as one product:
 *
 *   - the card shell, the field pairing and the table frame are defined once,
 *     in the primitives, and never re-typed by a page;
 *   - a page's status flag is the shared badge, so an equivalent status can
 *     never appear at a different size or colour on a different page;
 *   - an empty section keeps its header and separator and states the fact in
 *     one line, rather than filling the card with a placeholder panel.
 */

const webRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (relativePath: string) =>
  fs.readFileSync(path.join(webRoot, relativePath), "utf8");

const componentPage = read("app/components/[id]/page.tsx");
const sectionCard = read("components/ui/section-card.tsx");
const detailField = read("components/ui/detail-field.tsx");
const detailTable = read("components/ui/detail-table.tsx");
const statusBadge = read("components/ui/status-badge.tsx");
const categoryAttributes = read(
  "components/categories/category-attributes-manager.tsx",
);

/** Pages that take the full treatment: sections, tables and field grids. */
const FULL_PAGES: Record<string, string> = {
  Supplier: read("app/suppliers/[id]/page.tsx"),
  Manufacturer: read("app/manufacturers/[id]/page.tsx"),
  Category: read("app/categories/[id]/page.tsx"),
  Location: read("app/locations/[id]/page.tsx"),
};

/**
 * Administration pages that keep their specialist layout (a permission matrix
 * and an audit trail) but still borrow the card, table and empty-state rules.
 */
const PARTIAL_PAGES: Record<string, string> = {
  User: read("app/users/[id]/page.tsx"),
  Role: read("app/roles/[id]/page.tsx"),
};

/** The compact empty copy each page states inside its own section card. */
const EMPTY_COPY: Record<string, string[]> = {
  Supplier: [
    "No contacts are registered for this supplier yet.",
    "No components are mapped to this supplier yet.",
  ],
  Manufacturer: ["No inventory components reference this manufacturer yet."],
  Category: [
    "No child categories exist yet.",
    "No components are assigned to this category yet.",
  ],
  Location: [
    "No components are stored in this location.",
    "No sub-locations are nested under this location yet.",
  ],
};

/** Section titles that must exist on each page, in reading order. */
const SECTION_TITLES: Record<string, string[]> = {
  Supplier: [
    "Supplier Information",
    "Supplier Contacts",
    "Supplied Components & Vendor Pricing",
  ],
  Manufacturer: ["Manufacturer Information", "Associated Components"],
  Category: [
    "Category Information",
    "Category Hierarchy",
    "Associated Inventory Components",
  ],
  Location: [
    "Location Information",
    "Containing Components & Stock",
    "Sub-Locations",
  ],
};

describe("shared detail-page primitives", () => {
  it("defines the field pairing once, as a label above a dominant value", () => {
    expect(detailField).toContain("export function DetailFields");
    expect(detailField).toContain("export function DetailField");
    expect(detailField).toContain(
      '<dt className="text-xs font-medium text-muted-foreground">{label}</dt>',
    );
    expect(detailField).toContain('<dd className="mt-1">{children}</dd>');
    // The field grid is the responsive rule for every record section.
    expect(detailField).toContain(
      "grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
    );
    // Values wrap; a clipped name or description is worse than a taller cell.
    expect(detailField).toContain("break-words");
    expect(detailField).not.toMatch(/className="[^"]*truncate/);
  });

  it("defines the related-records table frame once", () => {
    expect(detailTable).toContain("export function DetailTable");
    // One header band, one row height, one hover state for every related list.
    expect(detailTable).toContain(
      'className="bg-muted/40 text-muted-foreground font-medium text-xs border-b border-border"',
    );
    expect(detailTable).toContain('"px-6 py-2.5 align-middle"');
    expect(detailTable).toContain('"divide-y divide-border"');
    expect(detailTable).toContain('"hover:bg-muted/20 transition-colors"');
    // Numeric columns align right.
    expect(detailTable).toContain('column.align === "right" && "text-right"');
  });

  it("keeps the record footer and timestamps in the card primitive", () => {
    expect(sectionCard).toContain("export function SectionCardFooter");
    expect(sectionCard).toContain(
      '"flex flex-wrap items-center justify-between gap-2 border-t border-border px-6 py-4 text-xs text-muted-foreground"',
    );
    expect(sectionCard).toContain("export function RecordTimestamps");
    expect(sectionCard).toContain("Created: {new Date(createdAt).toLocaleString()}");
  });

  it("defines the record status badge next to the workflow status badge", () => {
    expect(statusBadge).toContain("export function RecordStatusBadge");
    expect(statusBadge).toContain(
      '"bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"',
    );
    expect(statusBadge).toContain(
      '"bg-muted text-muted-foreground border border-border"',
    );
    // The record flag is one size everywhere; no second pill scale.
    expect(statusBadge).toContain(
      '"inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full"',
    );
  });
});

describe("Component Details remains the reference", () => {
  it("renders its sections, fields, tables and status through the primitives", () => {
    expect(componentPage).toContain('from "@/components/ui/section-card"');
    expect(componentPage).toContain('from "@/components/ui/detail-field"');
    expect(componentPage).toContain('from "@/components/ui/detail-table"');
    expect(componentPage).toContain('from "@/components/ui/status-badge"');

    expect(componentPage).toContain("<DetailFields");
    expect(componentPage).toContain("<DetailTable");
    expect(componentPage).toContain("<RecordStatusBadge");
    expect(componentPage).toContain("<SectionCardFooter>");
  });

  it("never hand-rolls a status pill again", () => {
    expect(componentPage).not.toContain('? "Active" : "Inactive"');
    expect(componentPage).not.toContain(
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20",
    );
  });

  it("keeps the four sections and the compact KPI strip", () => {
    expect(componentPage.match(/<SectionCard[\s>]/g) ?? []).toHaveLength(4);
    expect(componentPage.match(/<StatCard/g) ?? []).toHaveLength(6);
    expect(componentPage).toContain('className="p-3.5"');
  });
});

describe.each(Object.entries(FULL_PAGES))(
  "%s Details uses the shared detail-page language",
  (label, source) => {
    it("renders every section through the shared card", () => {
      expect(source).toContain('from "@/components/ui/section-card"');
      for (const title of SECTION_TITLES[label] ?? []) {
        expect(source).toContain(`title="${title}"`);
      }
      expect((source.match(/<SectionCard[\s>]/g) ?? []).length).toBe(
        (source.match(/<\/SectionCard>/g) ?? []).length,
      );
    });

    it("leaves no one-off card shell behind", () => {
      // The surface, radius and shadow belong to the primitive only.
      expect(source).not.toContain("rounded-xl");
      expect(source).not.toContain("bg-card border border-border");
      expect(source).not.toMatch(/<section\b/);
    });

    it("never forces a height and never overflows horizontally", () => {
      expect(source).not.toMatch(/min-h-/);
      expect(source).not.toMatch(/\bh-\[/);
      expect(source).not.toMatch(/\bw-\[/);
    });

    it("presents status and labels through the shared vocabulary", () => {
      expect(source).toContain('from "@/components/ui/detail-field"');
      expect(source).toContain('from "@/components/ui/status-badge"');
      expect(source).toContain("<DetailFields");
      expect(source).toContain("<DetailField");
      expect(source).toContain("<RecordStatusBadge");
      expect(source).toContain("<SectionCardFooter>");
      expect(source).toContain("<RecordTimestamps");
      // The Active/Inactive pill is defined once, in the badge.
      expect(source).not.toContain('? "Active" : "Inactive"');
    });

    it("uses the shared table frame for related records", () => {
      expect(source).toContain('from "@/components/ui/detail-table"');
      expect(source).toContain("<DetailTable");
      // No page re-types the list container the primitive owns.
      expect(source).not.toContain(
        "divide-y divide-border border border-border rounded-lg",
      );
    });

    it("states an empty section in one compact line", () => {
      for (const copy of EMPTY_COPY[label] ?? []) {
        expect(source).toContain(copy);
      }
      // Empty sections keep the card and its separator: no placeholder panel,
      // no dashed box, no oversized medallion.
      expect(source).not.toMatch(/border-dashed/);
      expect(source).not.toMatch(/p-8 text-center/);
      expect(source).not.toMatch(/p-12 text-center/);
    });

    it("keeps the summary strip compact and responsive", () => {
      // Two columns on a phone, up to four on a desktop, compact padding.
      expect(source).toMatch(
        /grid grid-cols-2 sm:grid-cols-3( xl:grid-cols-4)? gap-3/,
      );
      expect(source).toContain('className="p-3.5"');
      // Actions wrap rather than overflowing the header row.
      expect(source).toContain(
        '<div className="flex flex-wrap items-center gap-2">',
      );
    });

    it("does not pass in-page breadcrumbs", () => {
      // Breadcrumbs are owned by TopHeader (docs/INFORMATION_ARCHITECTURE.md).
      expect(source).not.toContain("breadcrumbs={[");
    });
  },
);

describe.each(Object.entries(PARTIAL_PAGES))(
  "%s Details borrows the shared card rules",
  (label, source) => {
    it("renders its panels through the shared card", () => {
      expect(source).toContain('from "@/components/ui/section-card"');
      expect(source).toContain("<SectionCard");
      expect((source.match(/<SectionCard[\s>]/g) ?? []).length).toBe(
        (source.match(/<\/SectionCard>/g) ?? []).length,
      );
      // No panel keeps a private card shell or a private section header.
      expect(source).not.toContain("rounded-xl");
      expect(source).not.toContain("border-b border-border pb-3");
    });

    it("states an empty panel in one compact line", () => {
      expect(source).not.toContain("text-center py-4");
      expect(source).not.toMatch(/border-dashed/);
    });

    it("keeps one summary strip treatment per page", () => {
      expect(source).toMatch(
        /grid grid-cols-2 sm:grid-cols-3( xl:grid-cols-4)? gap-3/,
      );
      expect(source).toContain('className="p-3.5"');
    });

    it("does not pass in-page breadcrumbs", () => {
      expect(source).not.toContain("breadcrumbs={[");
    });
  },
);

describe("Category specifications section", () => {
  it("is a section card like every other section on the page", () => {
    expect(categoryAttributes).toContain('from "@/components/ui/section-card"');
    expect(categoryAttributes).toContain("<SectionCard");
    expect(categoryAttributes).toContain("</SectionCard>");
    expect(categoryAttributes).not.toContain("rounded-xl");
  });

  it("presents attribute definitions as a table of bound definitions", () => {
    // A definition is not a component attribute value: it is listed with its
    // type, scope and requirement, and keeps its management actions.
    expect(categoryAttributes).toContain("<DetailTable");
    for (const header of [
      "Specification",
      "Type",
      "Scope",
      "Requirement",
      "Order",
    ]) {
      expect(categoryAttributes).toContain(`header: "${header}"`);
    }
    expect(categoryAttributes).toContain("Edit");
    expect(categoryAttributes).toContain("Unassign specification");
  });

  it("uses the compact empty state with its next action", () => {
    expect(categoryAttributes).toMatch(/<EmptyState[\s\S]{0,40}compact/);
    expect(categoryAttributes).toContain("Assign First Specification");
    expect(categoryAttributes).not.toMatch(/border-dashed/);
  });
});

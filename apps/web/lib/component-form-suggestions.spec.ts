import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

/**
 * Applying an AI manufacturer/category suggestion to the component form.
 *
 * Two defects are pinned here, both in how a suggestion reaches the form's
 * Category and Manufacturer fields:
 *
 *  1. Editing a suggestion in the review card recorded the typed value as
 *     telemetry and then applied the MODEL's suggestion instead, so a reviewer
 *     who typed a custom manufacturer watched the field keep the old value.
 *  2. A suggestion whose category resolved to the wrong ERP row (the family's
 *     parent group) applied that wrong row, which is fixed on the API side and
 *     covered by `category-suggestion-resolution.spec.ts` and `ml.service.spec.ts`.
 *
 * These are source assertions over the real components: this workspace has no DOM
 * testing library, so the wiring is asserted where it is written.
 */

const webRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (absolutePath: string) => fs.readFileSync(absolutePath, "utf8");

const cardSource = read(
  path.join(webRoot, "components/components/ai-suggestion-review-card.tsx"),
);
const formSource = read(
  path.join(webRoot, "components/components/component-form.tsx"),
);

/** One handler's body, from its declaration to the next `};`. */
function handlerBody(source: string, name: string): string {
  const start = source.indexOf(`const ${name} = `);
  expect(start, `${name} is declared`).toBeGreaterThan(-1);
  const end = source.indexOf("\n  };", start);
  return source.slice(start, end === -1 ? undefined : end);
}

describe("AI suggestion card — edited values reach the caller", () => {
  it("passes the edited category name on apply, not only telemetry", () => {
    const body = handlerBody(cardSource, "handleSaveEditCategory");

    // The typed value is recorded AND handed over.
    expect(body).toContain("categoryInput,");
    expect(body).toContain("onApplyCategory?.(categoryInput.trim()");
    expect(body).not.toContain("onApplyCategory?.();");
  });

  it("passes the edited manufacturer name on apply, not only telemetry", () => {
    const body = handlerBody(cardSource, "handleSaveEditManufacturer");

    expect(body).toContain("manufacturerInput,");
    expect(body).toContain("onApplyManufacturer?.(manufacturerInput.trim()");
    expect(body).not.toContain("onApplyManufacturer?.();");
  });

  it("declares both apply callbacks as accepting the custom name", () => {
    expect(cardSource).toContain("onApplyCategory?: (customName?: string) => void;");
    expect(cardSource).toContain(
      "onApplyManufacturer?: (customName?: string) => void;",
    );
  });

  it("still applies the suggestion unchanged from the apply button", () => {
    // Only the edit path carries a value; a plain accept must not invent one.
    const body = handlerBody(cardSource, "handleAcceptCategory");
    expect(body).toContain("onApplyCategory?.();");
  });
});

describe("Component form — a typed value becomes a pending entity", () => {
  it("holds a typed category as pending and clears the reference", () => {
    const body = handlerBody(formSource, "handleApplyCategory");

    expect(body).toContain("customName?: string");
    expect(body).toContain('setValue("categoryId", null');
    expect(body).toContain("setPendingCategory({");
    expect(body).toContain("name: typed");
    // Created under the suggested family, so it lands in the right place.
    expect(body).toContain("parentId: suggestion.category?.parentCategoryId ?? null");
  });

  it("holds a typed manufacturer as pending and clears the reference", () => {
    const body = handlerBody(formSource, "handleApplyManufacturer");

    expect(body).toContain("customName?: string");
    expect(body).toContain('setValue("manufacturerId", null');
    expect(body).toContain("setPendingManufacturer({ name: typed })");
  });

  it("never borrows the suggestion's code for a typed name", () => {
    // Reusing the suggested code would collide with the category it came from:
    // the pending entity service derives a code from the name instead.
    for (const name of ["handleApplyCategory", "handleApplyManufacturer"]) {
      expect(handlerBody(formSource, name)).not.toContain("code:");
    }
  });

  it("ignores a blank edit and applies the suggestion instead", () => {
    for (const name of ["handleApplyCategory", "handleApplyManufacturer"]) {
      const body = handlerBody(formSource, name);
      expect(body).toContain("if (typed) {");
      expect(body).toContain("applyEntitySuggestions(");
    }
  });

  it("wires the card's callbacks to these handlers", () => {
    expect(formSource).toContain("onApplyCategory={handleApplyCategory}");
    expect(formSource).toContain("onApplyManufacturer={handleApplyManufacturer}");
  });

  it("shows the pending value through the same field the form edits", () => {
    // The EntitySelector renders `pendingOption` in its trigger, which is what
    // makes the field show a value that does not exist in the ERP yet.
    expect(formSource).toContain("pendingOption={pendingCategory ? {");
    expect(formSource).toContain("pendingOption={pendingManufacturer ? {");
    const selector = read(path.join(webRoot, "components/ui/entity-selector.tsx"));
    expect(selector).toContain("pendingOption ? (");
    expect(selector).toContain("{pendingOption.label}");
  });
});

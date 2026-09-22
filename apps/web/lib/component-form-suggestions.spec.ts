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
    expect(body).toContain("onApplyCategory?.(typed || undefined)");
    expect(body).toContain("const typed = categoryInput.trim();");
    expect(body).not.toContain("onApplyCategory?.();");
  });

  it("passes the edited manufacturer name on apply, not only telemetry", () => {
    const body = handlerBody(cardSource, "handleSaveEditManufacturer");

    expect(body).toContain("manufacturerInput,");
    expect(body).toContain("onApplyManufacturer?.(typed || undefined)");
    expect(body).toContain("const typed = manufacturerInput.trim();");
    expect(body).not.toContain("onApplyManufacturer?.();");
  });

  it("shows the value that was actually applied after an edit", () => {
    // The row used to keep rendering the model's suggestion, so a correction
    // looked like it had been reverted.
    expect(cardSource).toContain("setEditedCategory(typed || null)");
    expect(cardSource).toContain("setEditedManufacturer(typed || null)");
    expect(cardSource).toContain("editedCategory ??");
    expect(cardSource).toContain("editedManufacturer ??");
    // The replaced value is only named when the model actually proposed one.
    expect(cardSource).toContain("`Edited · was ${replacedCategoryName}`");
    expect(cardSource).toContain(': "Edited"}');
    // Accepting the suggestion again clears the correction.
    expect(handlerBody(cardSource, "handleAcceptCategory")).toContain(
      "setEditedCategory(null)",
    );
    expect(handlerBody(cardSource, "handleAcceptManufacturer")).toContain(
      "setEditedManufacturer(null)",
    );
  });

  it("invokes every header action with no arguments", () => {
    // `onClick={onApplyClassification}` handed the click event to a handler that
    // accepts an optional value, which then threw on `customName.trim`.
    expect(cardSource).not.toContain("onClick={onApplyClassification}");
    expect(cardSource).not.toContain("onClick={onApplyIdentity}");
    expect(cardSource).not.toContain("onClick={onApplyNameDescription}");
    expect(cardSource).toContain("onClick={() => onApplyClassification()}");
    expect(cardSource).toContain("onClick={() => onApplyIdentity()}");
    expect(cardSource).toContain("onClick={() => onApplyNameDescription()}");
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
    expect(body).not.toContain("onApplyCategory?.(undefined)");
  });
});

describe("Component form — a typed value resolves against the ERP", () => {
  it("selects an existing category instead of proposing a new one", () => {
    const body = handlerBody(formSource, "handleApplyCategory");

    // The reported bug: a name the ERP already holds was always held as a
    // pending entity, so the field showed "NEW" beside an existing record.
    expect(body).toContain("findAssignableEntity({");
    expect(body).toContain("entities: assignableCategories");
    expect(body).toContain("setValue(\"categoryId\", existing?.id ?? null");
    expect(body).toContain(
      "existing ? null : { name: typed, parentId: suggestedParentId }",
    );
  });

  it("selects an existing manufacturer instead of proposing a new one", () => {
    const body = handlerBody(formSource, "handleApplyManufacturer");

    expect(body).toContain("findAssignableEntity({");
    expect(body).toContain("entities: assignableManufacturers");
    expect(body).toContain("setValue(\"manufacturerId\", existing?.id ?? null");
    expect(body).toContain("setPendingManufacturer(existing ? null : { name: typed })");
  });

  it("loads the records a typed name is matched against", () => {
    expect(formSource).toContain("categoriesApi.getAll()");
    expect(formSource).toContain("manufacturersApi.getAll()");
    expect(formSource).toContain("setAssignableCategories(categories)");
    expect(formSource).toContain("setAssignableManufacturers(manufacturers)");
  });

  it("resolves a model candidate the ERP already holds, too", () => {
    // A NEW_CANDIDATE names a record only the model failed to resolve; if the
    // ERP holds that name the field must show the record, not a "NEW" badge.
    const body = handlerBody(formSource, "applyEntitySuggestions");
    expect(body).toContain("findAssignableEntity({");
    expect(body).toContain("typedName: proposedName");
    expect(body).toContain("setPendingCategory(");
    expect(body).toContain("existing");
  });

  it("never borrows the suggestion's code for a typed name", () => {
    // Reusing the suggested code would collide with the category it came from:
    // the pending entity service derives a code from the name instead.
    const categoryBody = handlerBody(formSource, "handleApplyCategory");
    expect(categoryBody).not.toContain("code:");
  });

  it("treats only a string as a typed value", () => {
    // A click handler wired straight to one of these would pass the event.
    for (const name of ["handleApplyCategory", "handleApplyManufacturer"]) {
      expect(handlerBody(formSource, name)).toContain(
        'typeof customName === "string" ? customName.trim() : ""',
      );
    }
  });

  it("ignores a blank edit and applies the suggestion instead", () => {
    for (const name of ["handleApplyCategory", "handleApplyManufacturer"]) {
      const body = handlerBody(formSource, name);
      expect(body).toContain("if (typed) {");
      expect(body).toContain("applyEntitySuggestions(");
    }
  });
});

describe("Component form — an explicit choice survives a bulk apply", () => {
  it("records that the reviewer chose the field", () => {
    expect(formSource).toContain("setCategoryChosenByReviewer(true)");
    expect(formSource).toContain("setManufacturerChosenByReviewer(true)");
  });

  it("releases the choice when the reviewer accepts the suggestion again", () => {
    for (const name of ["handleApplyCategory", "handleApplyManufacturer"]) {
      expect(handlerBody(formSource, name)).toContain(
        "ChosenByReviewer(false)",
      );
    }
  });

  it("makes a bulk apply respect a chosen field", () => {
    const body = handlerBody(formSource, "handleApplyAllSuggestions");
    // `includeReviewerChoices` stays false, so the bulk apply completes the
    // card without reverting a correction the reviewer already made.
    expect(body).toContain("applyEntitySuggestions(suggestion, { overwrite: true })");
    expect(body).not.toContain("includeReviewerChoices: true");
  });

  it("conducts the decision in applyEntitySuggestions", () => {
    const body = handlerBody(formSource, "applyEntitySuggestions");
    expect(body).toContain("includeReviewerChoices || !manufacturerChosenByReviewer");
    expect(body).toContain("includeReviewerChoices || !categoryChosenByReviewer");
  });

  it("treats a direct dropdown pick as the reviewer's choice", () => {
    expect(formSource).toContain("setCategoryChosenByReviewer(true);\n                    field.onChange(val);");
    expect(formSource).toContain("setManufacturerChosenByReviewer(true);\n                    field.onChange(val);");
  });

  it("clears the choices when the suggestion is dismissed", () => {
    const dismissStart = formSource.indexOf("onDismiss={() => {");
    expect(dismissStart).toBeGreaterThan(-1);
    const body = formSource.slice(dismissStart, formSource.indexOf("}}", dismissStart));
    expect(body).toContain("setSuggestion(null)");
    expect(body).toContain("setCategoryChosenByReviewer(false)");
    expect(body).toContain("setManufacturerChosenByReviewer(false)");
  });
});

describe("Component form — suggestion wiring", () => {
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

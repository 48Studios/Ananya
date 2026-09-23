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

const webRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
);
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
    // accepts an optional value, which then threw on `customName.trim`. The
    // grouped actions now route through their own handlers (which also report
    // the applied state), so no callback may be wired straight to `onClick`.
    for (const callback of [
      "onApplyIdentity",
      "onApplyClassification",
      "onApplyNameDescription",
      "onApplySpecifications",
      "onApplyAll",
    ]) {
      expect(cardSource, `${callback} wired to onClick`).not.toContain(
        `onClick={${callback}}`,
      );
      expect(cardSource, `${callback} called from onClick`).not.toContain(
        `onClick={() => ${callback}(`,
      );
    }

    // Each grouped action reaches its callback from inside a handler, with no
    // arguments — the event must never travel with the call.
    expect(cardSource).toContain("onApplyIdentity?.();");
    expect(cardSource).toContain("onApplyClassification?.();");
    expect(cardSource).toContain("onApplyNameDescription?.();");
    expect(cardSource).toContain("onApplySpecifications?.();");
    expect(cardSource).toContain("onApplyAll();");
  });

  it("declares both apply callbacks as accepting the custom name", () => {
    expect(cardSource).toContain(
      "onApplyCategory?: (customName?: string) => void;",
    );
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
    expect(body).toContain('setValue("categoryId", existing?.id ?? null');
    expect(body).toContain(
      "existing ? null : { name: typed, parentId: suggestedParentId }",
    );
  });

  it("selects an existing manufacturer instead of proposing a new one", () => {
    const body = handlerBody(formSource, "handleApplyManufacturer");

    expect(body).toContain("findAssignableEntity({");
    expect(body).toContain("entities: assignableManufacturers");
    expect(body).toContain('setValue("manufacturerId", existing?.id ?? null');
    expect(body).toContain(
      "setPendingManufacturer(existing ? null : { name: typed })",
    );
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
    expect(body).toContain(
      "applyEntitySuggestions(suggestion, { overwrite: true })",
    );
    expect(body).not.toContain("includeReviewerChoices: true");
  });

  it("conducts the decision in applyEntitySuggestions", () => {
    const body = handlerBody(formSource, "applyEntitySuggestions");
    expect(body).toContain(
      "includeReviewerChoices || !manufacturerChosenByReviewer",
    );
    expect(body).toContain(
      "includeReviewerChoices || !categoryChosenByReviewer",
    );
  });

  it("treats a direct dropdown pick as the reviewer's choice", () => {
    expect(formSource).toContain(
      "setCategoryChosenByReviewer(true);\n                    field.onChange(val);",
    );
    expect(formSource).toContain(
      "setManufacturerChosenByReviewer(true);\n                    field.onChange(val);",
    );
  });

  it("clears the choices when the suggestion is dismissed", () => {
    const dismissStart = formSource.indexOf("onDismiss={() => {");
    expect(dismissStart).toBeGreaterThan(-1);
    const body = formSource.slice(
      dismissStart,
      formSource.indexOf("}}", dismissStart),
    );
    expect(body).toContain("setSuggestion(null)");
    expect(body).toContain("setCategoryChosenByReviewer(false)");
    expect(body).toContain("setManufacturerChosenByReviewer(false)");
  });
});

describe("AI suggestion card — every apply action reports what it applied", () => {
  it("renders one shared applied indicator", () => {
    // One definition keeps the applied state identical on the category row, the
    // manufacturer row, the identity block and the specification chips.
    expect(cardSource).toContain("function AppliedIndicator(");
    expect(cardSource).toContain('<Check className="size-3" /> Applied');
    expect(cardSource).toContain("<AppliedIndicator");
  });

  it("derives the applied state from the form instead of remembering a click", () => {
    // The reported defect: applying a category re-runs the analysis, and the
    // card's applied markers were cleared with the suggestion — so a field whose
    // value was still in the form went back to offering Apply. The state is now
    // read from what the form holds, through the form's own derivation.
    expect(cardSource).toContain("appliedFields?: Record<string, boolean>;");
    expect(cardSource).toContain("const isFieldApplied = (field: string) => {");
    expect(cardSource).not.toContain("setAcceptedFields");
    expect(cardSource).not.toContain("markApplied");
    expect(formSource).toContain("appliedFields={appliedSuggestionFields}");
  });

  it("derives the state from the form's live field values", () => {
    const derived = formSource.slice(
      formSource.indexOf("const proposedCategoryName ="),
    );
    const block = derived.slice(0, 2400);

    expect(block).toContain(
      'watch("manufacturerPartNumber") === suggestion.manufacturerPartNumber',
    );
    expect(block).toContain('watch("name") === suggestion.suggestedName');
    expect(block).toContain(
      'watch("description") === suggestion.suggestedDescription',
    );
    expect(block).toContain(
      'watch("categoryId") === suggestion.category?.categoryId',
    );
    expect(block).toContain('watch("manufacturerId") ===');
    // A category or manufacturer carried as a to-be-created entity counts as
    // applied too: that is where the form holds it until save.
    expect(block).toContain("pendingCategory?.name");
    expect(block).toContain("pendingManufacturer?.name");
  });

  it("treats a field the analysis did not propose as nothing to apply", () => {
    // A field with no proposal never shows an applied state and never keeps the
    // card from reporting that everything it *did* propose has landed.
    expect(cardSource).toContain("const proposedFieldKeys = [");
    expect(cardSource).toContain(
      "proposedFieldKeys.every((field) => isFieldApplied(field))",
    );
  });

  it("still records the same feedback for each action", () => {
    const identity = handlerBody(cardSource, "handleApplyIdentity");
    expect(identity).toContain('"manufacturerPartNumber"');
    expect(identity).toContain("onApplyIdentity?.();");

    const classification = handlerBody(cardSource, "handleApplyClassification");
    expect(classification).toContain("setEditedCategory(null)");
    expect(classification).toContain("onApplyClassification?.();");

    const nameDescription = handlerBody(
      cardSource,
      "handleApplyNameDescription",
    );
    expect(nameDescription).toContain("onApplyNameDescription?.();");

    const all = handlerBody(cardSource, "handleAcceptAll");
    expect(all).toContain("onApplyAll();");
  });

  it("delegates the specifications action to the one applier", () => {
    const body = handlerBody(cardSource, "handleApplySpecifications");

    // The card writes no attribute values itself: it hands the work to the
    // caller, which applies the eligible suggestions through the same state an
    // individual Accept uses. A second writer here is exactly the duplication
    // this consolidation removed.
    expect(body).toContain("onApplySpecifications?.();");
    expect(body).not.toContain("onApplyAttributes");
    expect(body).not.toContain("setAttrValues");
  });

  it("replaces an action with its applied state once it has run", () => {
    // The confirmation takes the place of the button that was pressed, exactly
    // like the Category and Manufacturer rows already did.
    expect(cardSource).toContain('isFieldApplied("mpn") ? (');
    expect(cardSource).toContain('isFieldApplied("category") ? (');
    expect(cardSource).toContain('isFieldApplied("manufacturer") ? (');
    expect(cardSource).toContain("allSpecificationsApplied ? (");
    expect(cardSource).toContain("allSuggestionsApplied ? (");
    expect(cardSource).toContain(
      'isFieldApplied("name") && isFieldApplied("description") ? (',
    );
  });

  it("shows the applied state on the identity columns", () => {
    expect(cardSource).toContain('{isFieldApplied("mpn") && (');
    expect(cardSource).toContain('{isFieldApplied("name") && (');
    expect(cardSource).toContain('{isFieldApplied("description") && (');
  });

  it("counts an edited value as applied, because the form holds it", () => {
    // The reviewer's own value is what the form carries after an edit, so the
    // field is settled even though it is no longer the model's suggestion.
    expect(cardSource).toContain("editedCategory !== null");
    expect(cardSource).toContain("editedManufacturer !== null");
  });

  it("does not report a value-less suggestion as applied", () => {
    // The feedback handlers run before the value is known to have landed, so no
    // handler may claim the field itself.
    for (const name of [
      "handleApplyIdentity",
      "handleApplyClassification",
      "handleApplyNameDescription",
    ]) {
      expect(handlerBody(cardSource, name)).not.toContain("isFieldApplied");
    }
  });
});

describe("Component form — suggestion wiring", () => {
  it("wires the card's callbacks to these handlers", () => {
    expect(formSource).toContain("onApplyCategory={handleApplyCategory}");
    expect(formSource).toContain(
      "onApplyManufacturer={handleApplyManufacturer}",
    );
  });

  it("shows the pending value through the same field the form edits", () => {
    // The EntitySelector renders `pendingOption` in its trigger, which is what
    // makes the field show a value that does not exist in the ERP yet.
    expect(formSource).toContain("pendingOption={pendingCategory ? {");
    expect(formSource).toContain("pendingOption={pendingManufacturer ? {");
    const selector = read(
      path.join(webRoot, "components/ui/entity-selector.tsx"),
    );
    expect(selector).toContain("pendingOption ? (");
    expect(selector).toContain("{pendingOption.label}");
  });
});

describe("Component form — a component is never its own duplicate", () => {
  const mlApiSource = read(path.join(webRoot, "lib/api/ml-api.ts"));

  it("carries the edited component's identity on the request", () => {
    // Regression: the request named no component, so editing compared the
    // record against the whole catalog — itself included — and the card
    // reported "Potential Duplicate Component Detected" for its own SKU.
    const body = handlerBody(formSource, "handleFetchAiSuggestions");
    expect(body).toContain("componentId: initialData?.id,");
  });

  it("sends no identity when creating a new component", () => {
    // `initialData` is null on create, so the field is simply absent and every
    // stored component stays a candidate.
    expect(formSource).toContain("componentId: initialData?.id,");
    expect(formSource).not.toContain('componentId: initialData?.id ?? ""');
  });

  it("declares the field on the request contract", () => {
    expect(mlApiSource).toContain("componentId?: string;");
  });
});

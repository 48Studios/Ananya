import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

/**
 * The two reported defects in the Component Add/Edit form's AI apply path.
 *
 *  1. **An AI category apply sometimes selected nothing.** The backend resolves
 *     a prediction against the ERP list it was sent, so it can report a real
 *     category id beside an *uncertain* resolution label (a low-confidence or
 *     ambiguous model verdict). The form branched on the label — EXISTING wrote
 *     the id, NEW_CANDIDATE looked the name up — so an uncertain-but-resolved
 *     category fell through both branches and the click silently did nothing,
 *     while Edit → Save worked because it resolves by name. Fixed by making the
 *     id authoritative and the name the fallback, never the label.
 *
 *  2. **An applied attribute went back to offering Apply.** The applied state
 *     was a flag set on click and cleared by every intelligence response, so
 *     applying a category (which re-runs the analysis) reset it even though the
 *     value was still in the form. Fixed by deriving it from the form state.
 *
 * These are source assertions over the real components: this workspace has no
 * DOM testing library, so the wiring is asserted where it is written.
 */

const webRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
);
const read = (relative: string) =>
  fs.readFileSync(path.join(webRoot, relative), "utf8");

const form = read("components/components/component-form.tsx");
const panel = read("components/components/attribute-suggestions-panel.tsx");
const selector = read("components/ui/entity-selector.tsx");
const card = read("components/components/ai-suggestion-review-card.tsx");

/** One handler's body, from its declaration to the next `\n  };`. */
function handlerBody(source: string, name: string): string {
  const start = source.indexOf(`const ${name} = `);
  expect(start, `${name} is declared`).toBeGreaterThan(-1);
  const end = source.indexOf("\n  };", start);
  return source.slice(start, end === -1 ? undefined : end);
}

describe("an AI category apply selects the category the ERP holds", () => {
  it("selects a resolved id without consulting the resolution label", () => {
    const body = handlerBody(form, "applyEntitySuggestions");

    // The id the backend resolved IS the record. Whether the model called the
    // match confident (EXISTING), uncertain (UNKNOWN) or new (NEW_CANDIDATE)
    // says nothing about whether that row exists.
    expect(body).toContain("if (nextSuggestion.category.categoryId) {");
    expect(body).toContain("setValue(\"categoryId\", nextSuggestion.category.categoryId");
    expect(body).not.toContain("resolution === \"EXISTING\"");
    expect(body).not.toContain("resolution === \"NEW_CANDIDATE\"");
  });

  it("falls back to the name the ERP holds when no id was resolved", () => {
    const body = handlerBody(form, "applyEntitySuggestions");

    // Same rule the reviewer's own typed value goes through, so the two paths
    // cannot disagree about which row a name denotes.
    expect(body).toContain("findAssignableEntity({");
    expect(body).toContain("entities: assignableCategories");
    expect(body).toContain("typedName: proposedName");
    expect(body).toContain('setValue("categoryId", existing?.id ?? null');
  });

  it("holds only a name nothing matches as a new category", () => {
    const body = handlerBody(form, "applyEntitySuggestions");

    expect(body).toContain("setPendingCategory(");
    expect(body).toContain("existing\n            ? null");
  });

  it("leaves the field alone when the model proposed neither id nor name", () => {
    const body = handlerBody(form, "applyEntitySuggestions");

    // An unresolved prediction must not clear a category the reviewer picked.
    expect(body).toContain("else if (proposedName) {");
    expect(body).not.toContain('setValue("categoryId", null');
    expect(body).not.toContain('setValue("manufacturerId", null');
  });

  it("resolves the manufacturer by the same rule", () => {
    const body = handlerBody(form, "applyEntitySuggestions");

    expect(body).toContain("if (manufacturerId) {");
    expect(body).toContain('setValue("manufacturerId", manufacturerId');
    expect(body).toContain("entities: assignableManufacturers");
    expect(body).toContain("manufacturerName");
  });

  it("converges with the typed path and with a manual pick", () => {
    // All three write the same field with an id: AI Apply, Edit → Save, and the
    // dropdown's own onChange. Nothing else may write `categoryId`.
    const writers = form.match(/setValue\("categoryId"/g) ?? [];
    expect(writers.length).toBeGreaterThan(0);

    const typed = handlerBody(form, "handleApplyCategory");
    expect(typed).toContain('setValue("categoryId", existing?.id ?? null');
    expect(typed).toContain("applyEntitySuggestions(");

    // The dropdown is a controlled field over the same form value.
    expect(form).toContain("name=\"categoryId\"");
    expect(form).toContain("field.onChange(val)");
  });

  it("applies the same resolution to the classification action", () => {
    // "Apply Classification" IS the category suggestion, so it must land in the
    // same field through the same handler.
    expect(form).toContain("onApplyClassification={handleApplyCategory}");
  });
});

describe("the dropdown can render a value it did not load", () => {
  it("re-reads its options for a value the list does not hold", () => {
    // Options are loaded once, but a value can arrive from an accepted
    // suggestion or a record created since the form opened. Without the option
    // the trigger could not render a label for the id it holds.
    expect(selector).toContain("hydratedValueRef");
    expect(selector).toContain("if (options.some((option) => option.value === value)) return;");
    expect(selector).toContain("void loadOptions();");
    // Bounded: one re-read per unseen value, so a record that genuinely does
    // not exist cannot become a fetch loop.
    expect(selector).toContain("if (hydratedValueRef.current === value) return;");
  });

  it("labels a selected value from the suggestion that resolved it", () => {
    // Matched on the value, not on the resolution label: an id that equals the
    // selected value IS that record, whatever the model's confidence was.
    const aiSelected = selector.slice(
      selector.indexOf("const aiSelectedOption ="),
    );
    expect(aiSelected.slice(0, 300)).toContain("aiSuggestion.value === value");
    expect(aiSelected.slice(0, 300)).not.toContain('resolution === "EXISTING"');
  });
});

describe("an intelligence refresh never resets what the form holds", () => {
  it("hands the form's own values to the panel", () => {
    expect(form).toContain("currentValues={formAttributeValues}");
    expect(form).toContain("units={unitCatalog}");
    expect(panel).toContain("currentValues");
  });

  it("derives the applied set from those values", () => {
    const derived = form.slice(
      form.indexOf("const appliedSuggestionIds = React.useMemo("),
    );
    expect(derived.slice(0, 700)).toContain("appliedSuggestionDefinitionIds(");
    expect(panel).toContain("appliedSuggestionDefinitionIds(");
  });

  it("clears nothing when the analysis is replaced", () => {
    const body = handlerBody(form, "handleFetchAiSuggestions");
    for (const forbidden of [
      "setAppliedSuggestionIds",
      "setAttrValues",
      "setCategoryAttributes",
      "reset(",
      "setPendingCategory",
      "setPendingManufacturer",
    ]) {
      expect(body, `a refresh must not ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("keeps the values when a category change reconditions the analysis", () => {
    const effect = form.slice(
      form.indexOf("Re-conditions the attribute intelligence"),
      form.indexOf("const handleAttrChange"),
    );
    expect(effect).not.toContain("setAttrValues");
  });

  it("shows the form's value, not the saved one, on a conflict", () => {
    // The recorded value describes what was saved; once the field has a value
    // of its own, that value is the current one.
    expect(panel).toContain("state.currentDisplay");
    expect(panel).toContain("Current:");
  });

  it("writes no applied marker when a value is applied", () => {
    const body = handlerBody(form, "applyAttributeSuggestion");
    expect(body).not.toContain("setAppliedSuggestionIds");
    expect(body).toContain("setAttrValues((prev)");
  });
});

describe("no category or attribute is special-cased", () => {
  it("names no category in the form, the card or the dropdown", () => {
    // `Cables` and `ICs & Semiconductors` were diagnostic evidence, not cases:
    // the rule has to hold for every valid database category.
    for (const source of [form, card, selector]) {
      for (const forbidden of [
        '"Cables"',
        "'Cables'",
        "ICs & Semiconductors",
        "Electronic Components",
        '"Capacitors"',
        "'Resistors'",
      ]) {
        expect(source).not.toContain(forbidden);
      }
    }
  });
});

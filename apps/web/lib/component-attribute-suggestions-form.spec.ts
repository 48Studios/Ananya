import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

/**
 * AI Attribute Suggestions wired into the Component Add/Edit form.
 *
 * The behaviour this pass adds lives in three places: the panel (presentation
 * only), the form (state and eligibility), and the pure rules in
 * `lib/attribute-suggestions.ts` (covered separately). This workspace has no DOM
 * testing library, so the form's wiring is asserted where it is written —
 * including the two properties that are easy to lose in a refactor: an accepted
 * suggestion must go through the *existing* attribute state, and a category
 * change must never delete an attribute the reviewer entered.
 */

const webRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (relative: string) =>
  fs.readFileSync(path.join(webRoot, relative), "utf8");

const form = read("components/components/component-form.tsx");
const panel = read("components/components/attribute-suggestions-panel.tsx");

/** One handler's body, from its declaration to the next `\n  };`. */
function handlerBody(source: string, name: string): string {
  const start = source.indexOf(`const ${name} = `);
  expect(start, `${name} is declared`).toBeGreaterThan(-1);
  const end = source.indexOf("\n  };", start);
  return source.slice(start, end === -1 ? undefined : end);
}

describe("the panel is part of the Component Intelligence surface", () => {
  it("is rendered by the Add/Edit form", () => {
    expect(form).toContain("AttributeSuggestionsPanel");
    expect(form).toContain("suggestions={attributeSuggestions}");
  });

  it("appears for both adding and editing, from one form", () => {
    // Component Add and Component Edit mount the same form, so the panel is
    // present in both by construction.
    const addPage = read("app/components/page.tsx");
    const detailPage = read("app/components/[id]/page.tsx");
    expect(addPage + detailPage).toContain("ComponentForm");
    expect(form).toContain("isEditing");
  });

  it("renders no second intelligence surface of its own", () => {
    // The panel shows the same analysis the review card does; it must not mount
    // a dialog, a page or a duplicate card.
    expect(panel).not.toContain("DialogShell");
    expect(panel).not.toContain("useRouter");
  });
});

describe("accepting writes through the existing attribute state", () => {
  it("uses the same setter the manual editor uses", () => {
    const body = handlerBody(form, "applyAttributeSuggestion");

    expect(body).toContain("setAttrValues((prev)");
    expect(body).toContain("attributeValuePatch(suggestion)");
    // Keyed by the definition code, exactly like the editor's own handlers.
    expect(body).toContain("[suggestion.code]");
  });

  it("does nothing for a suggestion with no canonical value", () => {
    const body = handlerBody(form, "applyAttributeSuggestion");
    expect(body).toContain("if (!patch) return;");
  });

  it("records the decision through the existing feedback endpoint", () => {
    const body = handlerBody(form, "recordAttributeSuggestionFeedback");
    expect(body).toContain("mlApi.recordFeedback(");
    expect(body).toContain('suggestionType: "ATTRIBUTE"');
    // Telemetry must never block the form.
    expect(body).toContain("catch {");
  });

  it("introduces no new persistence path", () => {
    const body = handlerBody(form, "applyAttributeSuggestion");
    for (const forbidden of [
      "componentsApi.create",
      "componentsApi.update",
      "attributesApi.",
      "apiClient",
      "fetch(",
    ]) {
      expect(body).not.toContain(forbidden);
    }
  });

  it("tracks applied rows by definition id so a row cannot be applied twice", () => {
    const body = handlerBody(form, "applyAttributeSuggestion");
    expect(body).toContain("setAppliedSuggestionIds");
    expect(body).toContain("next.add(suggestion.attributeDefinitionId)");
  });
});

describe("edit reuses the existing attribute editor", () => {
  it("writes the value into the editor's state and focuses its field", () => {
    const body = handlerBody(form, "editAttributeSuggestion");

    expect(body).toContain("setAttrValues((prev)");
    expect(body).toContain("`attr-${suggestion.code}`");
    expect(body).toContain("scrollIntoView");
    expect(body).toContain("focus(");
  });

  it("targets the id the editor actually renders", () => {
    // The editor labels its inputs `attr-<definitionCode>`; a different scheme
    // would leave Edit focusing nothing.
    expect(form).toContain("const inputId = `attr-${definitionCode}`;");
    expect(form).toContain("const inputId = `attr-${definitionCode}`;");
  });
});

describe("rejecting changes nothing but the session", () => {
  it("does not touch definitions, bindings or component attributes", () => {
    const body = handlerBody(form, "rejectAttributeSuggestion");

    expect(body).toContain("recordAttributeSuggestionFeedback");
    for (const forbidden of [
      "setAttrValues",
      "attributesApi",
      "componentsApi",
      "delete",
      "POST",
    ]) {
      expect(body).not.toContain(forbidden);
    }
  });

  it("is session-scoped inside the panel", () => {
    // The row disappears locally; nothing is persisted as "rejected forever".
    expect(panel).toContain("setRejected((prev)");
    expect(panel).not.toContain("localStorage");
  });
});

describe("category re-conditioning", () => {
  it("re-runs the analysis on a category change, debounced", () => {
    const effect = form.slice(
      form.indexOf("Re-conditions the attribute intelligence"),
      form.indexOf("const handleAttrChange"),
    );

    expect(effect).toContain("handleFetchAiSuggestions()");
    expect(effect).toContain("CATEGORY_INTELLIGENCE_DEBOUNCE_MS");
    expect(effect).toContain("clearTimeout(timer)");
    expect(effect).toContain("[selectedCategoryId]");
  });

  it("skips a re-run when the suggestions already match the category", () => {
    expect(form).toContain(
      "if (selectedCategoryId === suggestionsCategoryRef.current) return;",
    );
  });

  it("sends the selected category with the request", () => {
    const body = handlerBody(form, "handleFetchAiSuggestions");
    expect(body).toContain("categoryId: selectedCategoryId ?? undefined");
  });

  it("never deletes an attribute because it stopped being relevant", () => {
    const effect = form.slice(
      form.indexOf("Re-conditions the attribute intelligence"),
      form.indexOf("const handleAttrChange"),
    );

    // The effect re-reads suggestions only; the reviewer's values are untouched.
    expect(effect).not.toContain("setAttrValues");
    expect(effect).not.toContain("setCategoryAttributes");
    expect(effect).not.toContain("delete");
  });
});

describe("stale responses", () => {
  it("guards every write with the request generation", () => {
    const body = handlerBody(form, "handleFetchAiSuggestions");

    expect(body).toContain("intelligenceRequestRef.current + 1");
    // The answer is dropped when a newer request has superseded it.
    expect(body).toContain(
      "if (intelligenceRequestRef.current !== generation) return;",
    );
    // Loading and failure states are only cleared by the current request.
    expect(body).toContain(
      "if (intelligenceRequestRef.current === generation) {",
    );
  });
});

describe("loading, error and empty states", () => {
  it("reports loading while keeping the form usable", () => {
    expect(panel).toContain("Analyzing component specifications…");
    expect(panel).toContain("loading &&");
    // No full-surface overlay or disabled form.
    expect(panel).not.toContain("pointer-events-none");
  });

  it("reports an unavailable service without blocking Save", () => {
    expect(panel).toContain("ATTRIBUTE_INTELLIGENCE_UNAVAILABLE");
    expect(panel).toContain("unavailable &&");
    const body = handlerBody(form, "handleFetchAiSuggestions");
    expect(body).toContain("setAttributeIntelligenceUnavailable(true)");
    // The failure path reports the section only: it neither rethrows nor sets
    // the form-level error that would block Save.
    const failurePath = body.slice(body.indexOf("catch (err: unknown)"), body.indexOf("finally"));
    expect(failurePath).not.toContain("setServerError");
    expect(failurePath).not.toContain("throw");
  });

  it("treats an empty result as an empty result, not a failure", () => {
    // An empty result never borrows the unavailable wording: claiming "no
    // suggestions" for a failed analysis states something never established.
    expect(panel).toContain("emptySuggestionsMessage(hasCategory)");
    expect(panel).toContain('"Analysis unavailable"');
    expect(panel).toContain("unavailable\n    ? ");
    const body = handlerBody(form, "handleFetchAiSuggestions");
    expect(body).toContain("setAttributeIntelligenceUnavailable(false)");
  });

  it("does not let a failure masquerade as an empty result", () => {
    const statusLine = panel.slice(
      panel.indexOf("const statusLine ="),
      panel.indexOf("return (", panel.indexOf("const statusLine =")),
    );
    expect(statusLine).toContain("unavailable");
    expect(statusLine).toContain("isEmpty");
    // The empty copy is the LAST branch, so it can only apply when the analysis
    // actually completed.
    expect(statusLine.indexOf("emptySuggestionsMessage")).toBeGreaterThan(
      statusLine.indexOf("unavailable"),
    );
  });
});

describe("confidence and conflicts are shown as words", () => {
  it("states the level beside the number", () => {
    expect(panel).toContain("confidenceText(suggestion)");
  });

  it("says the word Conflict", () => {
    expect(panel).toContain("Conflict");
    expect(panel).toContain("data-suggestion-state");
  });

  it("shows the recorded value beside a conflict", () => {
    expect(panel).toContain("Recorded:");
    expect(panel).toContain("suggestion.existingDisplay");
  });

  it("groups conflicts before the applicable values", () => {
    // One ordered array drives the groups, so the order cannot drift apart.
    const order = panel.slice(panel.indexOf("[") + 1);
    const arrayStart = panel.indexOf('(["conflicts"');
    expect(arrayStart, "the group order is declared once").toBeGreaterThan(-1);
    const declaration = panel.slice(
      arrayStart,
      panel.indexOf("]", arrayStart),
    );
    expect(declaration.indexOf('"conflicts"')).toBeLessThan(
      declaration.indexOf('"suggested"'),
    );
    expect(declaration.indexOf('"suggested"')).toBeLessThan(
      declaration.indexOf('"relevant"'),
    );
    expect(order.length).toBeGreaterThan(0);
  });
});

describe("the panel renders whatever the library holds", () => {
  it("reads the definition metadata rather than a known list", () => {
    // The row's identity comes from the returned definition, and the value from
    // the backend's own rendering of it.
    expect(panel).toContain("suggestion.name");
    expect(panel).toContain("suggestion.code");
    expect(panel).toContain("suggestedValueText(suggestion)");
    expect(panel).toContain("attributeNameLabel(suggestion.name, suggestion.code)");
  });

  it("does not branch on an attribute or a data type", () => {
    for (const forbidden of [
      'suggestion.code === "mounting_type"',
      'suggestion.name === "Gender"',
      'dataType === "SELECT"',
      "switch (suggestion.dataType)",
    ]) {
      expect(panel).not.toContain(forbidden);
    }
  });

  it("checks the definition still exists before applying", () => {
    expect(panel).toContain("definitionIds");
    expect(panel).toContain("isMissingDefinition");
    expect(form).toContain("definitionIds={definitionIds}");
  });
});

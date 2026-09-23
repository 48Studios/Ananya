import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ATTRIBUTE_SUGGESTION_STATES,
  acceptUnavailableReason,
  appliedSuggestionDefinitionIds,
  attributeSuggestionState,
  applyActionLabel,
  attributeValuePatch,
  bulkAcceptUnavailableReason,
  canAcceptSuggestion,
  canApplyIndividually,
  canApplySuggestionInBulk,
  dismissActionLabel,
  confidenceText,
  describeEvidence,
  emptySuggestionsMessage,
  groupAttributeSuggestions,
  groupHeading,
  matchesExistingValue,
  primaryRelevanceReason,
  reconcileAttributeSuggestion,
  suggestedValueText,
  suggestionEvidence,
  suggestionResolvesToDefinition,
  suggestionsForBulkAccept,
  summarizeAttributeSuggestions,
} from "./attribute-suggestions";
import type { AttributeSuggestionDto } from "./api/ml-api";

/**
 * AI attribute suggestions — presentation and eligibility.
 *
 * Every rule here reads the backend's own verdicts (`conflict`,
 * `existingMatches`, `confidenceLevel`, `relevance` order). The tests pin that
 * the frontend never re-derives any of them, because a second opinion in the
 * browser is how two surfaces start disagreeing about one value.
 */

function suggestion(
  overrides: Partial<AttributeSuggestionDto> = {},
): AttributeSuggestionDto {
  return {
    attributeDefinitionId: "def-1",
    code: "mounting_type",
    name: "Mounting Type",
    dataType: "SELECT",
    unitCategory: null,
    defaultUnit: null,
    isRequired: false,
    categoryIds: ["cat-1"],
    consideredCategoryIds: ["cat-1"],
    relevance: [
      {
        type: "category_binding",
        description: "Mounting Type is bound to Connectors",
        source: "category:binding",
        weight: 0.9,
      },
    ],
    valueEvidence: [],
    suggestedValue: {
      value: "SMD",
      optionCode: "SMD",
      optionLabel: "Surface Mount (SMD/SMT)",
      formatted: "SMD",
    },
    confidence: 0.9,
    confidenceLevel: "HIGH",
    existingDisplay: null,
    existingMatches: null,
    conflict: null,
    ...overrides,
  };
}

const relevantOnly = () =>
  suggestion({
    attributeDefinitionId: "def-2",
    code: "current_rating",
    name: "Current Rating",
    suggestedValue: null,
    confidence: null,
    confidenceLevel: null,
  });

const conflicting = () =>
  suggestion({
    existingDisplay: "Through Hole",
    existingMatches: false,
    conflict: { existingDisplay: "Through Hole", suggestedDisplay: "SMD" },
  });

const matching = () =>
  suggestion({ existingDisplay: "SMD", existingMatches: true });

const inconclusive = () =>
  suggestion({ existingDisplay: "470 furlongs", existingMatches: false });

describe("attribute suggestion state", () => {
  it("classifies every case the backend can report", () => {
    expect(attributeSuggestionState(suggestion())).toBe("SUGGESTED");
    expect(attributeSuggestionState(relevantOnly())).toBe("RELEVANT_ONLY");
    expect(attributeSuggestionState(conflicting())).toBe("CONFLICT");
    expect(attributeSuggestionState(matching())).toBe("MATCHES_EXISTING");
    expect(attributeSuggestionState(inconclusive())).toBe(
      "UNVERIFIED_EXISTING",
    );
  });

  it("lets the backend's conflict verdict outrank everything else", () => {
    // A conflict is a positive finding of disagreement, so it is never softened
    // into "already recorded" even though a value is present on both sides.
    expect(attributeSuggestionState(conflicting())).toBe("CONFLICT");
  });

  it("does not present an inconclusive comparison as agreement", () => {
    expect(matchesExistingValue(inconclusive())).toBe(false);
    expect(matchesExistingValue(matching())).toBe(true);
  });

  it("never calls a value-less attribute a match", () => {
    expect(
      attributeSuggestionState({
        ...relevantOnly(),
        existingDisplay: "5 A",
      }),
    ).toBe("RELEVANT_ONLY");
  });
});

describe("grouping", () => {
  const all = [
    suggestion({ attributeDefinitionId: "a" }),
    relevantOnly(),
    conflicting(),
    matching(),
    inconclusive(),
  ];

  it("places every suggestion in exactly one group", () => {
    const groups = groupAttributeSuggestions(all);
    const total =
      groups.suggested.length +
      groups.conflicts.length +
      groups.matches.length +
      groups.unverified.length +
      groups.relevant.length;
    expect(total).toBe(all.length);
  });

  it("hides nothing, including relevant attributes with no value", () => {
    const groups = groupAttributeSuggestions([relevantOnly()]);
    expect(groups.relevant).toHaveLength(1);
  });

  it("keeps the backend's order inside a group", () => {
    const first = suggestion({ attributeDefinitionId: "a", name: "A" });
    const second = suggestion({ attributeDefinitionId: "b", name: "B" });
    const groups = groupAttributeSuggestions([first, second]);
    expect(groups.suggested.map((entry) => entry.name)).toEqual(["A", "B"]);
  });

  it("counts what the summary line claims", () => {
    const summary = summarizeAttributeSuggestions(all);
    expect(summary.total).toBe(5);
    expect(summary.relevant).toBe(1);
    expect(summary.conflicts).toBe(1);
    expect(summary.withValues).toBe(4);
    expect(summary.highConfidence).toBe(4);
  });
});

describe("presentation", () => {
  it("prefers the backend's formatted value so both surfaces agree", () => {
    expect(suggestedValueText(suggestion())).toBe("SMD");
    expect(
      suggestedValueText(
        suggestion({
          suggestedValue: {
            value: 2.5,
            unit: "mm",
            formatted: "2.50 mm",
          },
        }),
      ),
    ).toBe("2.50 mm");
  });

  it("falls back to the raw value only when the backend formatted none", () => {
    expect(
      suggestedValueText(
        suggestion({
          suggestedValue: { value: 2.5, unit: "mm", formatted: "" },
        }),
      ),
    ).toBe("2.5 mm");
  });

  it("renders a multi-select value as a readable list", () => {
    expect(
      suggestedValueText(
        suggestion({
          suggestedValue: { value: ["RoHS", "REACH"], formatted: "" },
        }),
      ),
    ).toBe("RoHS, REACH");
  });

  it("reports no value for a relevant-only suggestion", () => {
    expect(suggestedValueText(relevantOnly())).toBeNull();
  });

  it("states confidence in words, never by colour alone", () => {
    expect(confidenceText(suggestion())).toBe("90% · High confidence");
    expect(
      confidenceText(
        suggestion({ confidence: 0.75, confidenceLevel: "MEDIUM" }),
      ),
    ).toBe("75% · Medium confidence");
    expect(
      confidenceText(suggestion({ confidence: 0.4, confidenceLevel: "LOW" })),
    ).toBe("40% · Low confidence");
  });

  it("uses the backend's level rather than recomputing a band", () => {
    // 0.9 is HIGH by any local rule, but the backend said MEDIUM: the backend
    // wins, because it is the surface the review queue also reads.
    expect(
      confidenceText(
        suggestion({ confidence: 0.9, confidenceLevel: "MEDIUM" }),
      ),
    ).toBe("90% · Medium confidence");
  });

  it("shows no confidence for a value-less suggestion", () => {
    expect(confidenceText(relevantOnly())).toBeNull();
  });

  it("leads with the strongest reason the backend gave", () => {
    expect(primaryRelevanceReason(suggestion())).toBe(
      "Mounting Type is bound to Connectors",
    );
    expect(
      primaryRelevanceReason(
        suggestion({
          relevance: [
            { type: "a", description: "first", weight: 0.9 },
            { type: "b", description: "second", weight: 0.5 },
          ],
        }),
      ),
    ).toBe("first");
  });

  it("labels evidence generically, through the shared helper", () => {
    expect(
      describeEvidence({
        type: "attribute_mention",
        description: 'The supplied text names "Mounting Type"',
        source: "text:mention",
        weight: 0.6,
      }),
    ).toEqual({
      label: "Mention in the supplied text",
      description: 'The supplied text names "Mounting Type"',
    });
  });

  it("falls back to a humanised label for an unknown source", () => {
    expect(
      describeEvidence({
        type: "something_new",
        description: "A new producer",
        source: "new:source",
        weight: 0.5,
      }).label,
    ).toBe("New Source");
  });

  it("lists relevance before value evidence", () => {
    const evidence = suggestionEvidence(
      suggestion({
        relevance: [
          { type: "a", description: "why it matters", weight: 0.9 },
        ],
        valueEvidence: [
          { type: "b", description: "why this value", weight: 0.8 },
        ],
      }),
    );
    expect(evidence.map((entry) => entry.description)).toEqual([
      "why it matters",
      "why this value",
    ]);
  });
});

describe("eligibility", () => {
  it("allows applying a valued suggestion with nothing recorded", () => {
    expect(canAcceptSuggestion(suggestion())).toBe(true);
    expect(acceptUnavailableReason(suggestion())).toBeNull();
  });

  it("refuses to bulk-accept a relevant-only suggestion", () => {
    expect(canAcceptSuggestion(relevantOnly())).toBe(false);
    expect(acceptUnavailableReason(relevantOnly())).toContain(
      "No value was determined",
    );
  });

  it("refuses to bulk-accept a conflicting suggestion", () => {
    expect(canAcceptSuggestion(conflicting())).toBe(false);
  });

  it("refuses to bulk-accept a value that is already recorded", () => {
    expect(canAcceptSuggestion(matching())).toBe(false);
    expect(acceptUnavailableReason(matching())).toContain("already recorded");
  });

  it("shows the backend's own reason when a determined value was withheld", () => {
    // A quantity the backend read but could not record faithfully (an unknown
    // unit, or one of another dimension) is a different statement from "no value
    // was determined", and the reason names the units involved.
    const withheld = suggestion({
      suggestedValue: null,
      valueWithheldReason:
        "mV measures Voltage, but this attribute is a Resistance attribute.",
    });

    expect(canApplyIndividually(withheld)).toBe(false);
    expect(acceptUnavailableReason(withheld)).toContain("mV");
    expect(acceptUnavailableReason(withheld)).not.toContain(
      "No value was determined",
    );
  });

  it("offers a per-row decision where a value exists", () => {
    // The per-row rule is broader than the bulk rule on purpose: one deliberate
    // click is a decision, and a conflict's action is labelled as a review.
    expect(canApplyIndividually(conflicting())).toBe(true);
    expect(canApplyIndividually(inconclusive())).toBe(true);
    expect(canApplyIndividually(suggestion())).toBe(true);
    expect(canApplyIndividually(relevantOnly())).toBe(false);
    expect(canApplyIndividually(matching())).toBe(false);
  });

  it("labels the action by what it actually does", () => {
    expect(applyActionLabel(suggestion())).toBe("Accept");
    expect(applyActionLabel(conflicting())).toBe("Review suggestion");
    expect(applyActionLabel(inconclusive())).toBe("Review suggestion");
    expect(applyActionLabel(relevantOnly())).toBeNull();
    expect(applyActionLabel(matching())).toBeNull();
  });

  it("offers Keep current only where there is a current value to keep", () => {
    expect(dismissActionLabel(conflicting())).toBe("Keep current");
    expect(dismissActionLabel(matching())).toBe("Keep current");
    expect(dismissActionLabel(suggestion())).toBe("Reject");
    expect(dismissActionLabel(relevantOnly())).toBe("Reject");
  });
});

describe("bulk accept", () => {
  const high = suggestion({ attributeDefinitionId: "a" });
  const medium = suggestion({
    attributeDefinitionId: "b",
    confidence: 0.75,
    confidenceLevel: "MEDIUM",
  });
  const low = suggestion({
    attributeDefinitionId: "c",
    confidence: 0.4,
    confidenceLevel: "LOW",
  });

  it("applies only high-confidence suggestions with a value and no conflict", () => {
    const eligible = suggestionsForBulkAccept(
      [high, medium, low, relevantOnly(), conflicting(), matching(), inconclusive()],
      new Set<string>(),
    );
    expect(eligible.map((entry) => entry.attributeDefinitionId)).toEqual(["a"]);
  });

  it("never re-offers a suggestion the reviewer already applied", () => {
    const eligible = suggestionsForBulkAccept(
      [high, medium],
      new Set(["a"]),
    );
    expect(eligible).toEqual([]);
  });

  it("explains why the bulk action is unavailable", () => {
    expect(bulkAcceptUnavailableReason([high], new Set())).toBeNull();
    expect(
      bulkAcceptUnavailableReason([medium, low], new Set()),
    ).toContain("high-confidence");
    expect(bulkAcceptUnavailableReason([conflicting()], new Set())).toContain(
      "need a decision",
    );
    expect(bulkAcceptUnavailableReason([relevantOnly()], new Set())).toContain(
      "value to apply yet",
    );
  });

  it("never sweeps a value the reviewer has already entered", () => {
    // A bulk action must not overwrite a correction: a value the form holds is
    // the reviewer's intent, and one click is not permission to replace it.
    const typed = new Map([["a", { optionCode: "Through Hole" }]]);

    expect(suggestionsForBulkAccept([high], new Set(), typed)).toEqual([]);
    expect(bulkAcceptUnavailableReason([high], new Set(), typed)).toContain(
      "already in the form",
    );
    // …and the same row is eligible while the form holds nothing for it.
    expect(suggestionsForBulkAccept([high], new Set(), new Map())).toHaveLength(
      1,
    );
  });

  it("never sweeps a row the form already holds the suggested value of", () => {
    const applied = new Map([["a", { optionCode: "SMD" }]]);

    expect(suggestionsForBulkAccept([high], new Set(), applied)).toEqual([]);
  });
});

describe("the bulk write rule", () => {
  it("refuses a conflict, a recorded value and a value of the reviewer's own", () => {
    expect(canApplySuggestionInBulk(suggestion(), undefined)).toBe(true);
    expect(canApplySuggestionInBulk(conflicting(), undefined)).toBe(false);
    expect(canApplySuggestionInBulk(matching(), undefined)).toBe(false);
    expect(canApplySuggestionInBulk(relevantOnly(), undefined)).toBe(false);
    expect(
      canApplySuggestionInBulk(suggestion(), { optionCode: "Through Hole" }),
    ).toBe(false);
    // Already in the form is already applied, so there is nothing to write.
    expect(
      canApplySuggestionInBulk(suggestion(), { optionCode: "SMD" }),
    ).toBe(false);
  });

  it("still allows a row the category effect only seeded a unit for", () => {
    // A QUANTITY row starts with its unit and no amount: that is not a value
    // the reviewer entered, so it does not block the sweep.
    expect(canApplySuggestionInBulk(quantity(100, "kΩ"), { unit: "kΩ" }, [KOHM])).toBe(
      true,
    );
  });
});

describe("applying a suggestion", () => {
  it("writes the same shape the manual editor holds", () => {
    const patch = attributeValuePatch(suggestion());
    expect(patch).toEqual({
      attributeDefinitionId: "def-1",
      value: "SMD",
      unit: null,
      optionCode: "SMD",
    });
  });

  it("carries the unit the backend resolved for a quantity", () => {
    expect(
      attributeValuePatch(
        suggestion({
          dataType: "QUANTITY",
          unitCategory: "Length",
          defaultUnit: "mm",
          suggestedValue: { value: 2.5, unit: "mm", formatted: "2.50 mm" },
        }),
      ),
    ).toMatchObject({ value: 2.5, unit: "mm" });
  });

  it("never supplies a unit the backend did not resolve", () => {
    // Deliberate: this used to fall back to the definition's own unit, which
    // re-labels the number (`10` becomes `10 °F` because the attribute says °F).
    // A quantity the backend could not resolve carries no value at all, so a
    // patch built from one must not carry a unit either.
    expect(
      attributeValuePatch(
        suggestion({
          dataType: "QUANTITY",
          unitCategory: "Temperature",
          defaultUnit: "°F",
          suggestedValue: { value: 10, formatted: "10 °C" },
        }),
      ),
    ).toMatchObject({ value: 10, unit: null });
  });

  it("carries every chosen code for a multi-select", () => {
    expect(
      attributeValuePatch(
        suggestion({
          dataType: "MULTI_SELECT",
          suggestedValue: {
            value: ["RoHS"],
            selectedOptionCodes: ["RoHS"],
            formatted: "RoHS",
          },
        }),
      ),
    ).toMatchObject({ selectedOptionCodes: ["RoHS"] });
  });

  it("produces nothing for a suggestion with no value", () => {
    expect(attributeValuePatch(relevantOnly())).toBeNull();
  });

  it("checks the definition still exists before anything is written", () => {
    const current = new Set(["def-1"]);
    expect(suggestionResolvesToDefinition(suggestion(), current)).toBe(true);
    expect(
      suggestionResolvesToDefinition(
        suggestion({ attributeDefinitionId: "def-deleted" }),
        current,
      ),
    ).toBe(false);
  });
});

describe("states vocabulary", () => {
  it("keeps every state renderable", () => {
    expect([...ATTRIBUTE_SUGGESTION_STATES].sort()).toEqual([
      "CONFLICT",
      "MATCHES_EXISTING",
      "RELEVANT_ONLY",
      "SUGGESTED",
      "UNVERIFIED_EXISTING",
    ]);
  });
});

describe("copy", () => {
  it("does not describe an empty result as a failure", () => {
    expect(emptySuggestionsMessage(true)).toContain(
      "No additional attribute suggestions",
    );
    expect(emptySuggestionsMessage(false)).toContain("Select a category");
  });

  it("counts a group in its heading", () => {
    expect(groupHeading("suggested", 3)).toBe("Suggested values (3)");
    expect(groupHeading("relevant", 2)).toBe("Relevant specifications (2)");
    expect(groupHeading("conflicts", 1)).toBe("Needs review (1)");
  });
});

// ---------------------------------------------------------------------------
// Reconciling a suggestion against the form's current state
// ---------------------------------------------------------------------------

const KOHM = {
  id: "unit-kohm",
  name: "kΩ",
  category: "Resistance",
  isBaseUnit: false,
  conversionFactor: 1000,
  conversionOffset: null,
  precision: 2,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const quantity = (value: number, unitName: string) =>
  suggestion({
    dataType: "QUANTITY",
    code: "resistance",
    name: "Resistance",
    unitCategory: "Resistance",
    defaultUnit: "Ω",
    suggestedValue: { value, unit: unitName, formatted: `${value} ${unitName}` },
  });

describe("the form state decides whether a suggestion is applied", () => {
  it("is applied when the form holds the suggested value", () => {
    // The reported bug: an applied row went back to offering Apply as soon as
    // the intelligence re-ran, because the applied state was a flag belonging
    // to the analysis rather than a reading of the form.
    const row = reconcileAttributeSuggestion(suggestion(), {
      optionCode: "SMD",
    });

    expect(row.state).toBe("APPLIED");
    expect(row.applied).toBe(true);
    expect(row.applyLabel).toBeNull();
    expect(row.needsDecision).toBe(false);
  });

  it("is applied when the form holds an equivalent quantity", () => {
    const row = reconcileAttributeSuggestion(
      quantity(100, "kΩ"),
      { value: 100, unit: "kΩ" },
      [KOHM],
    );

    expect(row.state).toBe("APPLIED");
    expect(row.applied).toBe(true);
  });

  it("goes back to offering the value once the reviewer edits it away", () => {
    // The derivation is live, not a latch: a value the reviewer replaces is no
    // longer applied, and the row offers the suggestion again.
    const row = reconcileAttributeSuggestion(suggestion(), {
      optionCode: "Through Hole",
    });

    expect(row.state).toBe("CONFLICT");
    expect(row.applied).toBe(false);
    expect(row.needsDecision).toBe(true);
    expect(row.applyLabel).toBe("Review suggestion");
    expect(row.dismissLabel).toBe("Keep current");
    expect(row.currentDisplay).toBe("Through Hole");
  });

  it("never calls the recorded value a match once the form disagrees", () => {
    // The backend compared against the *saved* value. A reviewer who has just
    // typed a different one is looking at a conflict, not at agreement.
    const row = reconcileAttributeSuggestion(matching(), {
      optionCode: "Through Hole",
    });

    expect(row.state).toBe("CONFLICT");
    expect(row.currentDisplay).toBe("Through Hole");
    expect(row.applied).toBe(false);
  });

  it("keeps the record's own match when the form agrees or is empty", () => {
    expect(reconcileAttributeSuggestion(matching(), { optionCode: "SMD" }).state).toBe(
      "MATCHES_EXISTING",
    );
    expect(reconcileAttributeSuggestion(matching(), undefined).state).toBe(
      "MATCHES_EXISTING",
    );
  });

  it("prefers the form value over a stale recorded conflict", () => {
    // The reviewer has already put the suggested value in the form, so there is
    // nothing left to decide even though the saved record still disagrees.
    const row = reconcileAttributeSuggestion(conflicting(), {
      optionCode: "SMD",
    });

    expect(row.state).toBe("APPLIED");
    expect(row.applied).toBe(true);
  });

  it("leaves the backend's verdict alone when the form holds nothing", () => {
    expect(reconcileAttributeSuggestion(suggestion(), undefined).state).toBe(
      "SUGGESTED",
    );
    expect(reconcileAttributeSuggestion(conflicting(), undefined).state).toBe(
      "CONFLICT",
    );
    expect(reconcileAttributeSuggestion(inconclusive(), undefined).state).toBe(
      "UNVERIFIED_EXISTING",
    );
  });

  it("never treats a value-less suggestion as applied or in conflict", () => {
    const row = reconcileAttributeSuggestion(relevantOnly(), {
      optionCode: "SMD",
    });

    expect(row.state).toBe("RELEVANT_ONLY");
    expect(row.applied).toBe(false);
    expect(row.needsDecision).toBe(false);
    expect(row.applyLabel).toBeNull();
  });

  it("does not read a starting unit as a value", () => {
    // The category effect seeds a QUANTITY row's unit; that is not a value and
    // must not turn the row into a conflict.
    const row = reconcileAttributeSuggestion(quantity(100, "kΩ"), {
      unit: "kΩ",
    });

    expect(row.state).toBe("SUGGESTED");
    expect(row.needsDecision).toBe(false);
  });

  it("collects the applied rows by definition id", () => {
    const other = suggestion({
      attributeDefinitionId: "def-2",
      code: "package",
      name: "Package",
      suggestedValue: { value: "0805", optionCode: "0805", formatted: "0805" },
    });
    const values = new Map([
      ["def-1", { optionCode: "SMD" }],
      ["def-2", { optionCode: "0603" }],
    ]);

    const applied = appliedSuggestionDefinitionIds(
      [suggestion(), other],
      values,
    );

    expect([...applied]).toEqual(["def-1"]);
  });

  it("is empty when nothing the form holds matches", () => {
    expect(
      appliedSuggestionDefinitionIds(
        [suggestion(), quantity(100, "kΩ")],
        new Map(),
      ).size,
    ).toBe(0);
  });

  it("states a form conflict against the value the reviewer sees", () => {
    // `Current:` is the form's own value; the recorded one is only shown while
    // the form holds nothing, because it describes what was saved.
    const row = reconcileAttributeSuggestion(conflicting(), {
      optionCode: "Panel Mount",
    });

    expect(row.currentDisplay).toBe("Panel Mount");
  });
});

// ---------------------------------------------------------------------------
// Static guarantees
// ---------------------------------------------------------------------------

const webRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (relative: string) =>
  fs.readFileSync(path.join(webRoot, relative), "utf8");

describe("the UI is driven by the backend, not by a table of attributes", () => {
  const panel = read("components/components/attribute-suggestions-panel.tsx");
  const lib = read("lib/attribute-suggestions.ts");

  it("names no attribute anywhere in the presentation layer", () => {
    // A definition created in the database must render without a frontend
    // change, which is only true while no attribute is special-cased.
    for (const forbidden of [
      "mounting_type",
      "termination_style",
      "contact_plating",
      "gender",
      "orientation",
      '"resistance"',
      "'resistance'",
      '"capacitance"',
      "'capacitance'",
    ]) {
      expect(lib).not.toContain(forbidden);
      expect(panel).not.toContain(forbidden);
    }
  });

  it("names no category either", () => {
    for (const forbidden of [
      '"Connectors"',
      "'Connectors'",
      '"Resistors"',
      "'Resistors'",
      '"Capacitors"',
      "'Capacitors'",
    ]) {
      expect(lib).not.toContain(forbidden);
      expect(panel).not.toContain(forbidden);
    }
  });

  it("reads the backend's verdicts instead of re-deriving them", () => {
    expect(lib).toContain("suggestion.confidenceLevel");
    expect(lib).toContain("suggestion.conflict");
    expect(lib).toContain("suggestion.existingMatches");
    // No local threshold arithmetic on confidence.
    expect(lib).not.toMatch(/confidence\s*[<>]=?\s*0\./);
  });

  it("offers no second persistence path", () => {
    // Applying writes into the form's attribute state through the caller's
    // callback; the panel performs no request of its own.
    expect(panel).not.toContain("fetch(");
    expect(panel).not.toContain("apiClient");
    expect(panel).not.toContain("apiClient.post");
  });
});

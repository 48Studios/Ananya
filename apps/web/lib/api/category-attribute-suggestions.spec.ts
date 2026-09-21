import { describe, it, expect } from "vitest";
import { normalizeSuggestedCategoryAttributeItem } from "./attributes-api";

/**
 * The ML suggestion service and the attributes panel disagree on field names.
 *
 * A live check against the running API showed the service returns
 * `code` / `name` / `isAlreadyBound`, while the panel reads `attributeCode` /
 * `attributeName` / `isExisting`. Reading the DTO names off the response left
 * every suggestion without a code or a name: the cards rendered nameless, the
 * list could not be keyed, and selecting or dismissing a suggestion acted on
 * `undefined`. These assertions pin the reconciliation.
 */
describe("normalizeSuggestedCategoryAttributeItem", () => {
  it("maps the service's code/name onto the panel's contract", () => {
    const item = normalizeSuggestedCategoryAttributeItem({
      attributeDefinitionId: "def-package",
      code: "package",
      name: "Package / Case",
      dataType: "SELECT",
      confidence: 0.98,
      confidenceLevel: "HIGH",
      isAlreadyBound: false,
      reason: "Specified as a standard expected attribute for 'Resistors'",
      evidence: [
        {
          type: "data_pack_rule",
          description: "Standard expected attribute",
          weight: 0.98,
          source: "datapack:expected_attributes",
        },
      ],
    });

    expect(item.attributeCode).toBe("package");
    expect(item.attributeName).toBe("Package / Case");
    expect(item.isExisting).toBe(false);
    expect(item.confidenceLevel).toBe("HIGH");
    expect(item.evidence).toHaveLength(1);
  });

  it("keeps a payload that already uses the panel's names", () => {
    const item = normalizeSuggestedCategoryAttributeItem({
      attributeCode: "resistance",
      attributeName: "Resistance",
      isExisting: true,
      dataType: "QUANTITY",
      confidence: 0.92,
      confidenceLevel: "MEDIUM",
    });

    expect(item.attributeCode).toBe("resistance");
    expect(item.attributeName).toBe("Resistance");
    expect(item.isExisting).toBe(true);
  });

  it("always yields a usable identity, so a card can be keyed and toggled", () => {
    const item = normalizeSuggestedCategoryAttributeItem({
      attributeDefinitionId: "def-tolerance",
    });

    expect(item.attributeCode).toBe("def-tolerance");
    expect(item.attributeName).toBe("");
    // Defaults keep the render path free of undefined values.
    expect(item.dataType).toBe("TEXT");
    expect(item.confidenceLevel).toBe("LOW");
    expect(item.confidence).toBe(0);
    expect(item.isExisting).toBe(false);
    expect(item.evidence).toEqual([]);
    expect(item.reason).toBe("");
  });
});

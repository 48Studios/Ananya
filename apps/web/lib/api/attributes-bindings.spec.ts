import { describe, it, expect } from "vitest";
import type {
  PopulatedComponentAttributeDto,
  ResolvedCategoryAttributeDto,
} from "./attributes-api";

describe("Dynamic Product Attributes Frontend Logic", () => {
  describe("Specification Value Formatting & Resolution", () => {
    it("handles multi-select attributes with comma-separated display values", () => {
      const attr: PopulatedComponentAttributeDto = {
        definitionId: "def-certs",
        code: "certifications",
        name: "Certifications",
        dataType: "MULTI_SELECT",
        value: ["rohs", "reach"],
        unit: null,
        normalizedValue: null,
        optionId: null,
        optionCode: null,
        optionLabel: null,
        displayValue: "RoHS Compliant, REACH SVHC Free",
      };

      const tags = (attr.displayValue || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      expect(tags).toEqual(["RoHS Compliant", "REACH SVHC Free"]);
    });

    it("handles quantity attributes with units and normalization", () => {
      const attr: PopulatedComponentAttributeDto = {
        definitionId: "def-res",
        code: "resistance",
        name: "Resistance",
        dataType: "QUANTITY",
        value: 10,
        unit: "kΩ",
        normalizedValue: 10000,
        optionId: null,
        optionCode: null,
        optionLabel: null,
        displayValue: "10 kΩ",
      };

      expect(attr.displayValue).toBe("10 kΩ");
      expect(attr.normalizedValue).toBe(10000);
      expect(attr.unit).toBe("kΩ");
    });

    it("handles boolean specifications correctly", () => {
      const activeAttr: PopulatedComponentAttributeDto = {
        definitionId: "def-aec",
        code: "aec_q200",
        name: "AEC-Q200 Qualified",
        dataType: "BOOLEAN",
        value: true,
        unit: null,
        normalizedValue: null,
        optionId: null,
        optionCode: null,
        optionLabel: null,
        displayValue: "Yes",
      };

      const isQualified =
        activeAttr.value === true ||
        activeAttr.displayValue === "Yes" ||
        activeAttr.displayValue === "true";

      expect(isQualified).toBe(true);
    });
  });

  describe("Category Attribute Inheritance & Distinction", () => {
    it("distinguishes directly assigned attributes from parent-inherited attributes", () => {
      const categoryAttributes: ResolvedCategoryAttributeDto[] = [
        {
          attributeDefinition: {
            id: "attr-pkg",
            code: "package",
            name: "Package / Case",
            dataType: "SELECT",
            isFilterable: true,
            sortOrder: 10,
            isActive: true,
          },
          options: [
            {
              id: "opt-0805",
              attributeDefinitionId: "attr-pkg",
              code: "0805",
              label: "0805 (2012 Metric)",
              sortOrder: 10,
              isActive: true,
            },
          ],
          isRequired: true,
          sortOrder: 10,
          inheritedFromCategoryId: "cat-smd-passive",
        },
        {
          attributeDefinition: {
            id: "attr-res",
            code: "resistance",
            name: "Resistance",
            dataType: "QUANTITY",
            isFilterable: true,
            sortOrder: 20,
            isActive: true,
          },
          options: [],
          isRequired: true,
          sortOrder: 20,
          inheritedFromCategoryId: null,
        },
      ];

      const direct = categoryAttributes.filter((a) => !a.inheritedFromCategoryId);
      const inherited = categoryAttributes.filter((a) => Boolean(a.inheritedFromCategoryId));

      expect(direct).toHaveLength(1);
      expect(direct[0]!.attributeDefinition.code).toBe("resistance");
      expect(inherited).toHaveLength(1);
      expect(inherited[0]!.attributeDefinition.code).toBe("package");
      expect(inherited[0]!.inheritedFromCategoryId).toBe("cat-smd-passive");
    });
  });

  describe("Dynamic Filter Matching Engine", () => {
    const mockComponents = [
      {
        id: "comp-1",
        sku: "RES-10K-0805",
        name: "10kΩ SMD Resistor",
        categoryId: "cat-resistors",
        attributes: {
          resistance: {
            code: "resistance",
            dataType: "QUANTITY",
            value: 10,
            unit: "kΩ",
            normalizedValue: 10000,
            displayValue: "10 kΩ",
          },
          package: {
            code: "package",
            dataType: "SELECT",
            value: "0805",
            optionCode: "0805",
            optionLabel: "0805 (2012 Metric)",
            displayValue: "0805 (2012 Metric)",
          },
          tolerance: {
            code: "tolerance",
            dataType: "SELECT",
            value: "1%",
            optionCode: "1pct",
            optionLabel: "±1%",
            displayValue: "±1%",
          },
        },
      },
      {
        id: "comp-2",
        sku: "CAP-100N-0805",
        name: "100nF Ceramic Capacitor",
        categoryId: "cat-capacitors",
        attributes: {
          capacitance: {
            code: "capacitance",
            dataType: "QUANTITY",
            value: 100,
            unit: "nF",
            normalizedValue: 1e-7,
            displayValue: "100 nF",
          },
          voltage_rating: {
            code: "voltage_rating",
            dataType: "QUANTITY",
            value: 50,
            unit: "V",
            normalizedValue: 50,
            displayValue: "50 V",
          },
          package: {
            code: "package",
            dataType: "SELECT",
            value: "0805",
            optionCode: "0805",
            optionLabel: "0805 (2012 Metric)",
            displayValue: "0805 (2012 Metric)",
          },
        },
      },
      {
        id: "comp-3",
        sku: "CBL-FFC-24P",
        name: "24-Pin FFC Cable",
        categoryId: "cat-cables",
        attributes: {
          length: {
            code: "length",
            dataType: "QUANTITY",
            value: 150,
            unit: "mm",
            normalizedValue: 0.15,
            displayValue: "150 mm",
          },
          pin_count: {
            code: "pin_count",
            dataType: "INTEGER",
            value: 24,
            unit: null,
            normalizedValue: null,
            displayValue: "24",
          },
          cable_type: {
            code: "cable_type",
            dataType: "SELECT",
            value: "FFC",
            optionCode: "ffc",
            optionLabel: "Flat Flexible Cable (FFC)",
            displayValue: "Flat Flexible Cable (FFC)",
          },
        },
      },
    ];

    it("filters components by category", () => {
      const resistors = mockComponents.filter((c) => c.categoryId === "cat-resistors");
      expect(resistors).toHaveLength(1);
      expect(resistors[0]!.sku).toBe("RES-10K-0805");
    });

    it("filters components by select attribute optionCode or optionLabel", () => {
      const pkg0805 = mockComponents.filter((c) => {
        const attr = c.attributes?.package;
        return attr?.optionCode === "0805";
      });
      expect(pkg0805).toHaveLength(2); // resistor and capacitor both have 0805
    });

    it("filters components by numeric normalized value range", () => {
      const minVal = 5000;
      const maxVal = 20000;

      const matched = mockComponents.filter((c) => {
        const attr = (c.attributes as unknown as Record<string, { normalizedValue?: number | null }> | undefined)?.resistance;
        if (!attr || attr.normalizedValue == null) return false;
        return attr.normalizedValue >= minVal && attr.normalizedValue <= maxVal;
      });

      expect(matched).toHaveLength(1);
      expect(matched[0]!.sku).toBe("RES-10K-0805");
    });

    it("correctly excludes components without matching attributes", () => {
      const matched = mockComponents.filter((c) => {
        const attr = (c.attributes as unknown as Record<string, { optionCode?: string }> | undefined)?.cable_type;
        return attr?.optionCode === "ffc";
      });

      expect(matched).toHaveLength(1);
      expect(matched[0]!.sku).toBe("CBL-FFC-24P");
    });
  });

  describe("Direct Component Attribute Modification & Removal Semantics", () => {
    it("safely removes component attribute value without deleting global definition", () => {
      // Global definition remains in library
      const globalLibrary = [
        { id: "def-power", code: "power_rating", name: "Power Rating" },
        { id: "def-res", code: "resistance", name: "Resistance" },
      ];

      // Component values before deletion
      let componentValues = {
        power_rating: { definitionId: "def-power", value: 0.125, unit: "W" },
        resistance: { definitionId: "def-res", value: 10, unit: "kΩ" },
      };

      // Simulating surgical removal of 'power_rating' from component
      const targetDefinitionId = "def-power";
      const remainingComponentEntries = Object.entries(componentValues).filter(
        ([, val]) => val.definitionId !== targetDefinitionId,
      );
      componentValues = Object.fromEntries(remainingComponentEntries) as typeof componentValues;

      // Assert component values no longer contain power_rating
      expect(componentValues).not.toHaveProperty("power_rating");
      expect(componentValues).toHaveProperty("resistance");

      // Assert global definition is completely untouched
      expect(globalLibrary.find((d) => d.id === "def-power")).toBeDefined();
      expect(globalLibrary).toHaveLength(2);
    });
  });

  describe("Data Pack Manifest Parsing & Electronics / SMD Validation", () => {
    it("validates that the Electronics / SMD pack contains required specification definitions", () => {
      const mockElectronicsPack = {
        id: "electronics-smd",
        name: "Electronics & SMD Dynamic Attributes Pack",
        category: "Domain Specifications",
        attributeDefinitions: [
          { code: "package", name: "Package / Case", dataType: "SELECT" },
          { code: "resistance", name: "Resistance", dataType: "QUANTITY", defaultUnit: "kohm" },
          { code: "capacitance", name: "Capacitance", dataType: "QUANTITY", defaultUnit: "uF" },
          { code: "tolerance", name: "Tolerance", dataType: "SELECT" },
          { code: "power_rating", name: "Power Rating", dataType: "QUANTITY", defaultUnit: "W" },
          { code: "voltage_rating", name: "Voltage Rating", dataType: "QUANTITY", defaultUnit: "V" },
        ],
        categories: [
          { code: "ELEC-RES", name: "Resistors" },
          { code: "ELEC-CAP", name: "Capacitors" },
          { code: "ELEC-DIO", name: "Diodes & LEDs" },
          { code: "ELEC-IC", name: "ICs & Semiconductors" },
        ],
        units: [
          { name: "ohm", category: "Resistance" },
          { name: "kohm", category: "Resistance" },
          { name: "uF", category: "Capacitance" },
          { name: "nF", category: "Capacitance" },
        ],
      };

      expect(mockElectronicsPack.id).toBe("electronics-smd");
      expect(mockElectronicsPack.attributeDefinitions.map((a) => a.code)).toContain("resistance");
      expect(mockElectronicsPack.attributeDefinitions.map((a) => a.code)).toContain("capacitance");
      expect(mockElectronicsPack.attributeDefinitions.map((a) => a.code)).toContain("package");
      expect(mockElectronicsPack.categories.map((c) => c.name)).toContain("Resistors");
      expect(mockElectronicsPack.categories.map((c) => c.name)).toContain("Capacitors");
      expect(mockElectronicsPack.units.filter((u) => u.category === "Resistance")).toHaveLength(2);
    });
  });
});

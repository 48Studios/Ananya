import { describe, it, expect } from "vitest";
import {
  AttributeDefinition,
  InvalidAttributeCodeError,
  InvalidAttributeNameError,
  InvalidAttributeDataTypeError,
} from "./index";

describe("AttributeDefinition Aggregate", () => {
  it("should create a valid attribute definition with normalized code", () => {
    const def = AttributeDefinition.create({
      code: "Package Case",
      name: "Package / Case",
      dataType: "SELECT",
      isFilterable: true,
      sortOrder: 1,
    });

    expect(def.id).toBeDefined();
    expect(def.code).toBe("package_case");
    expect(def.name).toBe("Package / Case");
    expect(def.dataType).toBe("SELECT");
    expect(def.isFilterable).toBe(true);
    expect(def.sortOrder).toBe(1);
    expect(def.isActive).toBe(true);
  });

  it("should create a QUANTITY attribute definition with unitCategory", () => {
    const def = AttributeDefinition.create({
      code: "resistance",
      name: "Resistance",
      dataType: "QUANTITY",
      unitCategory: "Resistance",
      defaultUnit: "ohm",
    });

    expect(def.dataType).toBe("QUANTITY");
    expect(def.unitCategory).toBe("Resistance");
    expect(def.defaultUnit).toBe("ohm");
  });

  it("should throw error if code is empty", () => {
    expect(() =>
      AttributeDefinition.create({
        code: "   ",
        name: "Test",
        dataType: "TEXT",
      }),
    ).toThrow(InvalidAttributeCodeError);
  });

  it("should throw error if name is empty", () => {
    expect(() =>
      AttributeDefinition.create({
        code: "test_code",
        name: "  ",
        dataType: "TEXT",
      }),
    ).toThrow(InvalidAttributeNameError);
  });

  it("should throw error if dataType is invalid", () => {
    expect(() =>
      AttributeDefinition.create({
        code: "test_code",
        name: "Test",
        // @ts-expect-error testing invalid type
        dataType: "INVALID_TYPE",
      }),
    ).toThrow(InvalidAttributeDataTypeError);
  });

  it("should update properties while maintaining invariants", () => {
    const def = AttributeDefinition.create({
      code: "tolerance",
      name: "Tolerance",
      dataType: "QUANTITY",
      unitCategory: "Percentage",
      defaultUnit: "%",
    });

    const updated = def.update({
      name: "Component Tolerance",
      sortOrder: 5,
    });

    expect(updated.name).toBe("Component Tolerance");
    expect(updated.sortOrder).toBe(5);
    expect(updated.code).toBe("tolerance"); // Code remains immutable
  });
});

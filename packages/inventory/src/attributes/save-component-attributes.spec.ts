import { describe, expect, it, vi } from "vitest";
import { AttributeDefinition } from "./attribute-definition";
import { SaveComponentAttributes } from "./save-component-attributes";

const definition = AttributeDefinition.create({
  code: "resistance",
  name: "Resistance",
  dataType: "QUANTITY",
  unitCategory: "Resistance",
  defaultUnit: "ohm",
});

describe("SaveComponentAttributes", () => {
  it("persists an explicitly supplied attribute without category bindings", async () => {
    const upsertMany = vi.fn(async (values) => values);
    const useCase = new SaveComponentAttributes(
      {
        findById: vi.fn().mockResolvedValue(definition),
        findByCode: vi.fn(),
        findMany: vi.fn(),
        save: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      {
        findById: vi.fn(),
        findByDefinitionId: vi.fn(),
        findByDefinitionIdAndCode: vi.fn(),
        save: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      {
        findById: vi.fn(),
        findByName: vi.fn().mockResolvedValue(null),
        findByCategory: vi.fn(),
        findMany: vi.fn(),
        save: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      {
        findByComponentId: vi.fn(),
        findByComponentIds: vi.fn(),
        upsertMany,
        deleteByComponentId: vi.fn(),
        deleteByComponentAndAttribute: vi.fn(),
      },
    );

    await useCase.execute("component-1", [
      {
        attributeDefinitionId: definition.id,
        value: 27,
        unit: "ohm",
      },
    ]);

    expect(upsertMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          componentId: "component-1",
          attributeDefinitionId: definition.id,
          numberValue: 27,
        }),
      ]),
    );
  });
});

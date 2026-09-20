import { db, type DbExecutor } from '@ananya/database';
import {
  attributeDefinitions,
  attributeOptions,
  categoryAttributes,
  componentAttributeValues,
} from '@ananya/database/schema';
import { eq, inArray, and } from '@ananya/database/query';
import {
  AttributeDefinition as AttributeDefinitionAggregate,
  AttributeOption as AttributeOptionAggregate,
  CategoryAttribute as CategoryAttributeAggregate,
  ComponentAttributeValue as ComponentAttributeValueAggregate,
  type AttributeDefinition,
  type AttributeOption,
  type CategoryAttribute,
  type ComponentAttributeValue,
  type AttributeDefinitionRepository,
  type AttributeOptionRepository,
  type CategoryAttributeRepository,
  type ComponentAttributeRepository,
  type AttributeDataType,
} from '@ananya/inventory';

export class DrizzleAttributeDefinitionRepository implements AttributeDefinitionRepository {
  async findById(id: string): Promise<AttributeDefinition | null> {
    const [row] = await db
      .select()
      .from(attributeDefinitions)
      .where(eq(attributeDefinitions.id, id))
      .limit(1);

    if (!row) return null;
    return AttributeDefinitionAggregate.rehydrate({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      dataType: row.dataType as AttributeDataType,
      unitCategory: row.unitCategory,
      defaultUnit: row.defaultUnit,
      isFilterable: row.isFilterable,
      sortOrder: row.sortOrder,
      validationRules: row.validationRules as Record<string, unknown> | null,
      aliases: (row.aliases as string[]) ?? [],
      groupName: row.groupName ?? null,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  async findByCode(code: string): Promise<AttributeDefinition | null> {
    const [row] = await db
      .select()
      .from(attributeDefinitions)
      .where(eq(attributeDefinitions.code, code))
      .limit(1);

    if (!row) return null;
    return AttributeDefinitionAggregate.rehydrate({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      dataType: row.dataType as AttributeDataType,
      unitCategory: row.unitCategory,
      defaultUnit: row.defaultUnit,
      isFilterable: row.isFilterable,
      sortOrder: row.sortOrder,
      validationRules: row.validationRules as Record<string, unknown> | null,
      aliases: (row.aliases as string[]) ?? [],
      groupName: row.groupName ?? null,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  async findMany(): Promise<AttributeDefinition[]> {
    const rows = await db
      .select()
      .from(attributeDefinitions)
      .orderBy(attributeDefinitions.sortOrder, attributeDefinitions.name);

    return rows.map((row) =>
      AttributeDefinitionAggregate.rehydrate({
        id: row.id,
        code: row.code,
        name: row.name,
        description: row.description,
        dataType: row.dataType as AttributeDataType,
        unitCategory: row.unitCategory,
        defaultUnit: row.defaultUnit,
        isFilterable: row.isFilterable,
        sortOrder: row.sortOrder,
        validationRules: row.validationRules as Record<string, unknown> | null,
        aliases: (row.aliases as string[]) ?? [],
        groupName: row.groupName ?? null,
        isActive: row.isActive,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }),
    );
  }

  async save(def: AttributeDefinition): Promise<AttributeDefinition> {
    const [row] = await db
      .insert(attributeDefinitions)
      .values({
        id: def.id,
        code: def.code,
        name: def.name,
        description: def.description ?? null,
        dataType: def.dataType,
        unitCategory: def.unitCategory ?? null,
        defaultUnit: def.defaultUnit ?? null,
        isFilterable: def.isFilterable,
        sortOrder: def.sortOrder,
        validationRules: def.validationRules ?? null,
        aliases: def.aliases ?? [],
        groupName: def.groupName ?? null,
        isActive: def.isActive,
        createdAt: def.createdAt,
        updatedAt: def.updatedAt,
      })
      .returning();

    if (!row) throw new Error('Failed to create attribute definition');

    return AttributeDefinitionAggregate.rehydrate({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      dataType: row.dataType as AttributeDataType,
      unitCategory: row.unitCategory,
      defaultUnit: row.defaultUnit,
      isFilterable: row.isFilterable,
      sortOrder: row.sortOrder,
      validationRules: row.validationRules as Record<string, unknown> | null,
      aliases: (row.aliases as string[]) ?? [],
      groupName: row.groupName ?? null,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  async update(def: AttributeDefinition): Promise<AttributeDefinition> {
    const [row] = await db
      .update(attributeDefinitions)
      .set({
        name: def.name,
        description: def.description ?? null,
        dataType: def.dataType,
        unitCategory: def.unitCategory ?? null,
        defaultUnit: def.defaultUnit ?? null,
        isFilterable: def.isFilterable,
        sortOrder: def.sortOrder,
        validationRules: def.validationRules ?? null,
        aliases: def.aliases ?? [],
        groupName: def.groupName ?? null,
        isActive: def.isActive,
        updatedAt: def.updatedAt,
      })
      .where(eq(attributeDefinitions.id, def.id))
      .returning();

    if (!row)
      throw new Error(`Failed to update attribute definition: ${def.id}`);

    return AttributeDefinitionAggregate.rehydrate({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      dataType: row.dataType as AttributeDataType,
      unitCategory: row.unitCategory,
      defaultUnit: row.defaultUnit,
      isFilterable: row.isFilterable,
      sortOrder: row.sortOrder,
      validationRules: row.validationRules as Record<string, unknown> | null,
      aliases: (row.aliases as string[]) ?? [],
      groupName: row.groupName ?? null,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  async delete(id: string): Promise<void> {
    await db
      .delete(attributeDefinitions)
      .where(eq(attributeDefinitions.id, id));
  }
}

export class DrizzleAttributeOptionRepository implements AttributeOptionRepository {
  async findById(id: string): Promise<AttributeOption | null> {
    const [row] = await db
      .select()
      .from(attributeOptions)
      .where(eq(attributeOptions.id, id))
      .limit(1);

    if (!row) return null;
    return AttributeOptionAggregate.rehydrate({
      id: row.id,
      attributeDefinitionId: row.attributeDefinitionId,
      code: row.code,
      label: row.label,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  async findByDefinitionId(definitionId: string): Promise<AttributeOption[]> {
    const rows = await db
      .select()
      .from(attributeOptions)
      .where(eq(attributeOptions.attributeDefinitionId, definitionId))
      .orderBy(attributeOptions.sortOrder, attributeOptions.code);

    return rows.map((row) =>
      AttributeOptionAggregate.rehydrate({
        id: row.id,
        attributeDefinitionId: row.attributeDefinitionId,
        code: row.code,
        label: row.label,
        sortOrder: row.sortOrder,
        isActive: row.isActive,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }),
    );
  }

  async findByDefinitionIdAndCode(
    definitionId: string,
    code: string,
  ): Promise<AttributeOption | null> {
    const [row] = await db
      .select()
      .from(attributeOptions)
      .where(
        and(
          eq(attributeOptions.attributeDefinitionId, definitionId),
          eq(attributeOptions.code, code),
        ),
      )
      .limit(1);

    if (!row) return null;
    return AttributeOptionAggregate.rehydrate({
      id: row.id,
      attributeDefinitionId: row.attributeDefinitionId,
      code: row.code,
      label: row.label,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  async save(option: AttributeOption): Promise<AttributeOption> {
    const [row] = await db
      .insert(attributeOptions)
      .values({
        id: option.id,
        attributeDefinitionId: option.attributeDefinitionId,
        code: option.code,
        label: option.label,
        sortOrder: option.sortOrder,
        isActive: option.isActive,
        createdAt: option.createdAt,
        updatedAt: option.updatedAt,
      })
      .returning();

    if (!row) throw new Error('Failed to create attribute option');

    return AttributeOptionAggregate.rehydrate({
      id: row.id,
      attributeDefinitionId: row.attributeDefinitionId,
      code: row.code,
      label: row.label,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  async update(option: AttributeOption): Promise<AttributeOption> {
    const [row] = await db
      .update(attributeOptions)
      .set({
        label: option.label,
        sortOrder: option.sortOrder,
        isActive: option.isActive,
        updatedAt: option.updatedAt,
      })
      .where(eq(attributeOptions.id, option.id))
      .returning();

    if (!row)
      throw new Error(`Failed to update attribute option: ${option.id}`);

    return AttributeOptionAggregate.rehydrate({
      id: row.id,
      attributeDefinitionId: row.attributeDefinitionId,
      code: row.code,
      label: row.label,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  async delete(id: string): Promise<void> {
    await db.delete(attributeOptions).where(eq(attributeOptions.id, id));
  }
}

export class DrizzleCategoryAttributeRepository implements CategoryAttributeRepository {
  async findByCategoryId(categoryId: string): Promise<CategoryAttribute[]> {
    const rows = await db
      .select()
      .from(categoryAttributes)
      .where(eq(categoryAttributes.categoryId, categoryId))
      .orderBy(categoryAttributes.sortOrder);

    return rows.map((row) =>
      CategoryAttributeAggregate.rehydrate({
        id: row.id,
        categoryId: row.categoryId,
        attributeDefinitionId: row.attributeDefinitionId,
        isRequired: row.isRequired,
        sortOrder: row.sortOrder,
        defaultValue: row.defaultValue as Record<string, unknown> | null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }),
    );
  }

  async findByCategoryIds(categoryIds: string[]): Promise<CategoryAttribute[]> {
    if (categoryIds.length === 0) return [];
    const rows = await db
      .select()
      .from(categoryAttributes)
      .where(inArray(categoryAttributes.categoryId, categoryIds))
      .orderBy(categoryAttributes.sortOrder);

    return rows.map((row) =>
      CategoryAttributeAggregate.rehydrate({
        id: row.id,
        categoryId: row.categoryId,
        attributeDefinitionId: row.attributeDefinitionId,
        isRequired: row.isRequired,
        sortOrder: row.sortOrder,
        defaultValue: row.defaultValue as Record<string, unknown> | null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }),
    );
  }

  async findByAttributeDefinitionId(
    attributeDefinitionId: string,
  ): Promise<CategoryAttribute[]> {
    const rows = await db
      .select()
      .from(categoryAttributes)
      .where(
        eq(categoryAttributes.attributeDefinitionId, attributeDefinitionId),
      )
      .orderBy(categoryAttributes.sortOrder);

    return rows.map((row) =>
      CategoryAttributeAggregate.rehydrate({
        id: row.id,
        categoryId: row.categoryId,
        attributeDefinitionId: row.attributeDefinitionId,
        isRequired: row.isRequired,
        sortOrder: row.sortOrder,
        defaultValue: row.defaultValue as Record<string, unknown> | null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }),
    );
  }

  async findMany(): Promise<CategoryAttribute[]> {
    const rows = await db
      .select()
      .from(categoryAttributes)
      .orderBy(categoryAttributes.sortOrder);

    return rows.map((row) =>
      CategoryAttributeAggregate.rehydrate({
        id: row.id,
        categoryId: row.categoryId,
        attributeDefinitionId: row.attributeDefinitionId,
        isRequired: row.isRequired,
        sortOrder: row.sortOrder,
        defaultValue: row.defaultValue as Record<string, unknown> | null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }),
    );
  }

  async save(catAttr: CategoryAttribute): Promise<CategoryAttribute> {
    const [row] = await db
      .insert(categoryAttributes)
      .values({
        id: catAttr.id,
        categoryId: catAttr.categoryId,
        attributeDefinitionId: catAttr.attributeDefinitionId,
        isRequired: catAttr.isRequired,
        sortOrder: catAttr.sortOrder,
        defaultValue: catAttr.defaultValue ?? null,
        createdAt: catAttr.createdAt,
        updatedAt: catAttr.updatedAt,
      })
      .onConflictDoUpdate({
        target: [
          categoryAttributes.categoryId,
          categoryAttributes.attributeDefinitionId,
        ],
        set: {
          isRequired: catAttr.isRequired,
          sortOrder: catAttr.sortOrder,
          defaultValue: catAttr.defaultValue ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!row) throw new Error('Failed to bind attribute to category');

    return CategoryAttributeAggregate.rehydrate({
      id: row.id,
      categoryId: row.categoryId,
      attributeDefinitionId: row.attributeDefinitionId,
      isRequired: row.isRequired,
      sortOrder: row.sortOrder,
      defaultValue: row.defaultValue as Record<string, unknown> | null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  async delete(
    categoryId: string,
    attributeDefinitionId: string,
  ): Promise<void> {
    await db
      .delete(categoryAttributes)
      .where(
        and(
          eq(categoryAttributes.categoryId, categoryId),
          eq(categoryAttributes.attributeDefinitionId, attributeDefinitionId),
        ),
      );
  }
}

export class DrizzleComponentAttributeRepository implements ComponentAttributeRepository {
  constructor(private readonly client: DbExecutor = db) {}

  async findByComponentId(
    componentId: string,
  ): Promise<ComponentAttributeValue[]> {
    const rows = await this.client
      .select()
      .from(componentAttributeValues)
      .where(eq(componentAttributeValues.componentId, componentId));

    return rows.map((row) =>
      ComponentAttributeValueAggregate.rehydrate({
        id: row.id,
        componentId: row.componentId,
        attributeDefinitionId: row.attributeDefinitionId,
        textValue: row.textValue,
        numberValue: row.numberValue !== null ? Number(row.numberValue) : null,
        normalizedNumberValue:
          row.normalizedNumberValue !== null
            ? Number(row.normalizedNumberValue)
            : null,
        booleanValue: row.booleanValue,
        dateValue: row.dateValue,
        unit: row.unit,
        optionId: row.optionId,
        selectedOptionIds: row.selectedOptionIds as string[] | null,
        jsonValue: row.jsonValue as Record<string, unknown> | null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }),
    );
  }

  async findByComponentIds(
    componentIds: string[],
  ): Promise<Record<string, ComponentAttributeValue[]>> {
    if (componentIds.length === 0) return {};
    const rows = await this.client
      .select()
      .from(componentAttributeValues)
      .where(inArray(componentAttributeValues.componentId, componentIds));

    const result: Record<string, ComponentAttributeValue[]> = {};
    for (const id of componentIds) {
      result[id] = [];
    }

    for (const row of rows) {
      const entity = ComponentAttributeValueAggregate.rehydrate({
        id: row.id,
        componentId: row.componentId,
        attributeDefinitionId: row.attributeDefinitionId,
        textValue: row.textValue,
        numberValue: row.numberValue !== null ? Number(row.numberValue) : null,
        normalizedNumberValue:
          row.normalizedNumberValue !== null
            ? Number(row.normalizedNumberValue)
            : null,
        booleanValue: row.booleanValue,
        dateValue: row.dateValue,
        unit: row.unit,
        optionId: row.optionId,
        selectedOptionIds: row.selectedOptionIds as string[] | null,
        jsonValue: row.jsonValue as Record<string, unknown> | null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
      result[row.componentId]?.push(entity);
    }

    return result;
  }

  async upsertMany(
    values: ComponentAttributeValue[],
  ): Promise<ComponentAttributeValue[]> {
    if (values.length === 0) return [];

    const results: ComponentAttributeValue[] = [];

    for (const v of values) {
      const [row] = await this.client
        .insert(componentAttributeValues)
        .values({
          id: v.id,
          componentId: v.componentId,
          attributeDefinitionId: v.attributeDefinitionId,
          textValue: v.textValue ?? null,
          numberValue:
            v.numberValue !== null && v.numberValue !== undefined
              ? String(v.numberValue)
              : null,
          normalizedNumberValue:
            v.normalizedNumberValue !== null &&
            v.normalizedNumberValue !== undefined
              ? String(v.normalizedNumberValue)
              : null,
          booleanValue: v.booleanValue ?? null,
          dateValue: v.dateValue ?? null,
          unit: v.unit ?? null,
          optionId: v.optionId ?? null,
          selectedOptionIds: v.selectedOptionIds ?? null,
          jsonValue: v.jsonValue ?? null,
          createdAt: v.createdAt,
          updatedAt: v.updatedAt,
        })
        .onConflictDoUpdate({
          target: [
            componentAttributeValues.componentId,
            componentAttributeValues.attributeDefinitionId,
          ],
          set: {
            textValue: v.textValue ?? null,
            numberValue:
              v.numberValue !== null && v.numberValue !== undefined
                ? String(v.numberValue)
                : null,
            normalizedNumberValue:
              v.normalizedNumberValue !== null &&
              v.normalizedNumberValue !== undefined
                ? String(v.normalizedNumberValue)
                : null,
            booleanValue: v.booleanValue ?? null,
            dateValue: v.dateValue ?? null,
            unit: v.unit ?? null,
            optionId: v.optionId ?? null,
            selectedOptionIds: v.selectedOptionIds ?? null,
            jsonValue: v.jsonValue ?? null,
            updatedAt: new Date(),
          },
        })
        .returning();

      if (row) {
        results.push(
          ComponentAttributeValueAggregate.rehydrate({
            id: row.id,
            componentId: row.componentId,
            attributeDefinitionId: row.attributeDefinitionId,
            textValue: row.textValue,
            numberValue:
              row.numberValue !== null ? Number(row.numberValue) : null,
            normalizedNumberValue:
              row.normalizedNumberValue !== null
                ? Number(row.normalizedNumberValue)
                : null,
            booleanValue: row.booleanValue,
            dateValue: row.dateValue,
            unit: row.unit,
            optionId: row.optionId,
            selectedOptionIds: row.selectedOptionIds as string[] | null,
            jsonValue: row.jsonValue as Record<string, unknown> | null,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          }),
        );
      }
    }

    return results;
  }

  async deleteByComponentId(componentId: string): Promise<void> {
    await this.client
      .delete(componentAttributeValues)
      .where(eq(componentAttributeValues.componentId, componentId));
  }

  async deleteByComponentAndAttribute(
    componentId: string,
    attributeDefinitionId: string,
  ): Promise<void> {
    await this.client
      .delete(componentAttributeValues)
      .where(
        and(
          eq(componentAttributeValues.componentId, componentId),
          eq(
            componentAttributeValues.attributeDefinitionId,
            attributeDefinitionId,
          ),
        ),
      );
  }
}

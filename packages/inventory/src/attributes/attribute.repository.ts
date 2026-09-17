import type { AttributeDefinition } from "./attribute-definition";
import type { AttributeOption } from "./attribute-option";
import type { CategoryAttribute } from "./category-attribute";
import type { ComponentAttributeValue } from "./component-attribute-value";

export interface AttributeDefinitionRepository {
  findById(id: string): Promise<AttributeDefinition | null>;
  findByCode(code: string): Promise<AttributeDefinition | null>;
  findMany(): Promise<AttributeDefinition[]>;
  save(definition: AttributeDefinition): Promise<AttributeDefinition>;
  update(definition: AttributeDefinition): Promise<AttributeDefinition>;
  delete(id: string): Promise<void>;
}

export interface AttributeOptionRepository {
  findById(id: string): Promise<AttributeOption | null>;
  findByDefinitionId(definitionId: string): Promise<AttributeOption[]>;
  findByDefinitionIdAndCode(
    definitionId: string,
    code: string,
  ): Promise<AttributeOption | null>;
  save(option: AttributeOption): Promise<AttributeOption>;
  update(option: AttributeOption): Promise<AttributeOption>;
  delete(id: string): Promise<void>;
}

export interface CategoryAttributeRepository {
  findByCategoryId(categoryId: string): Promise<CategoryAttribute[]>;
  findByCategoryIds(categoryIds: string[]): Promise<CategoryAttribute[]>;
  findByAttributeDefinitionId(
    attributeDefinitionId: string,
  ): Promise<CategoryAttribute[]>;
  findMany(): Promise<CategoryAttribute[]>;
  save(categoryAttribute: CategoryAttribute): Promise<CategoryAttribute>;
  delete(categoryId: string, attributeDefinitionId: string): Promise<void>;
}

export interface ComponentAttributeRepository {
  findByComponentId(componentId: string): Promise<ComponentAttributeValue[]>;
  findByComponentIds(
    componentIds: string[],
  ): Promise<Record<string, ComponentAttributeValue[]>>;
  upsertMany(
    values: ComponentAttributeValue[],
  ): Promise<ComponentAttributeValue[]>;
  deleteByComponentId(componentId: string): Promise<void>;
  deleteByComponentAndAttribute(
    componentId: string,
    attributeDefinitionId: string,
  ): Promise<void>;
}

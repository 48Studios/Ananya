import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  AttributeDefinition,
  AttributeOption,
  CategoryAttribute,
  GetCategoryAttributes,
  SaveComponentAttributes,
  type AttributeDefinitionRepository,
  type AttributeOptionRepository,
  type CategoryAttributeRepository,
  type ComponentAttributeRepository,
  type CategoryRepository,
  type UnitRepository,
  type ComponentAttributeValue,
} from '@ananya/inventory';
import {
  ATTRIBUTE_DEFINITION_REPOSITORY,
  ATTRIBUTE_OPTION_REPOSITORY,
  CATEGORY_ATTRIBUTE_REPOSITORY,
  COMPONENT_ATTRIBUTE_REPOSITORY,
} from './attribute.tokens';
import { CATEGORY_REPOSITORY } from '../categories/category.tokens';
import { UNIT_REPOSITORY } from '../units/unit.tokens';
import { CreateAttributeDefinitionDto } from './dtos/create-attribute-definition.dto';
import { UpdateAttributeDefinitionDto } from './dtos/update-attribute-definition.dto';
import { CreateAttributeOptionDto } from './dtos/create-attribute-option.dto';
import { AssignCategoryAttributeDto } from './dtos/assign-category-attribute.dto';
import { ComponentAttributeInput } from '@ananya/inventory';

export interface PopulatedComponentAttribute {
  definitionId: string;
  code: string;
  name: string;
  dataType: string;
  value: unknown;
  unit: string | null;
  normalizedValue: number | null;
  optionId: string | null;
  optionCode: string | null;
  optionLabel: string | null;
  displayValue: string;
}

@Injectable()
export class AttributesService {
  private readonly getCategoryAttributesUseCase: GetCategoryAttributes;
  private readonly saveComponentAttributesUseCase: SaveComponentAttributes;

  constructor(
    @Inject(ATTRIBUTE_DEFINITION_REPOSITORY)
    private readonly attrDefRepo: AttributeDefinitionRepository,
    @Inject(ATTRIBUTE_OPTION_REPOSITORY)
    private readonly attrOptionRepo: AttributeOptionRepository,
    @Inject(CATEGORY_ATTRIBUTE_REPOSITORY)
    private readonly categoryAttrRepo: CategoryAttributeRepository,
    @Inject(COMPONENT_ATTRIBUTE_REPOSITORY)
    private readonly componentAttrRepo: ComponentAttributeRepository,
    @Inject(CATEGORY_REPOSITORY)
    private readonly categoryRepo: CategoryRepository,
    @Inject(UNIT_REPOSITORY)
    private readonly unitRepo: UnitRepository,
  ) {
    this.getCategoryAttributesUseCase = new GetCategoryAttributes(
      this.categoryRepo,
      this.categoryAttrRepo,
      this.attrDefRepo,
      this.attrOptionRepo,
    );
    this.saveComponentAttributesUseCase = new SaveComponentAttributes(
      this.attrDefRepo,
      this.attrOptionRepo,
      this.unitRepo,
      this.componentAttrRepo,
    );
  }

  async getAllDefinitions(): Promise<
    (AttributeDefinition & { options: AttributeOption[] })[]
  > {
    const defs = await this.attrDefRepo.findMany();
    const result: (AttributeDefinition & { options: AttributeOption[] })[] = [];

    for (const def of defs) {
      const options =
        def.dataType === 'SELECT' || def.dataType === 'MULTI_SELECT'
          ? await this.attrOptionRepo.findByDefinitionId(def.id)
          : [];
      result.push(Object.assign(def, { options }));
    }

    return result;
  }

  async getDefinitionById(
    id: string,
  ): Promise<AttributeDefinition & { options: AttributeOption[] }> {
    const def = await this.attrDefRepo.findById(id);
    if (!def) {
      throw new NotFoundException(`Attribute definition '${id}' not found`);
    }

    const options =
      def.dataType === 'SELECT' || def.dataType === 'MULTI_SELECT'
        ? await this.attrOptionRepo.findByDefinitionId(def.id)
        : [];

    return Object.assign(def, { options });
  }

  async createDefinition(
    dto: CreateAttributeDefinitionDto,
  ): Promise<AttributeDefinition & { options: AttributeOption[] }> {
    const def = AttributeDefinition.create({
      code: dto.code,
      name: dto.name,
      description: dto.description ?? null,
      dataType: dto.dataType,
      unitCategory: dto.unitCategory ?? null,
      defaultUnit: dto.defaultUnit ?? null,
      isFilterable: dto.isFilterable ?? true,
      sortOrder: dto.sortOrder ?? 0,
      validationRules: dto.validationRules ?? null,
    });

    const saved = await this.attrDefRepo.save(def);
    const createdOptions: AttributeOption[] = [];

    if (dto.options && dto.options.length > 0) {
      for (const optInput of dto.options) {
        const option = AttributeOption.create({
          attributeDefinitionId: saved.id,
          code: optInput.code,
          label: optInput.label,
          sortOrder: optInput.sortOrder ?? 0,
        });
        const savedOpt = await this.attrOptionRepo.save(option);
        createdOptions.push(savedOpt);
      }
    }

    return Object.assign(saved, { options: createdOptions });
  }

  async updateDefinition(
    id: string,
    dto: UpdateAttributeDefinitionDto,
  ): Promise<AttributeDefinition> {
    const existing = await this.attrDefRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Attribute definition '${id}' not found`);
    }

    const updated = existing.update({
      name: dto.name,
      description: dto.description,
      dataType: dto.dataType,
      unitCategory: dto.unitCategory,
      defaultUnit: dto.defaultUnit,
      isFilterable: dto.isFilterable,
      sortOrder: dto.sortOrder,
      validationRules: dto.validationRules,
      isActive: dto.isActive,
    });

    return this.attrDefRepo.update(updated);
  }

  async deleteDefinition(id: string): Promise<void> {
    await this.attrDefRepo.delete(id);
  }

  async addOption(
    definitionId: string,
    dto: CreateAttributeOptionDto,
  ): Promise<AttributeOption> {
    const def = await this.attrDefRepo.findById(definitionId);
    if (!def) {
      throw new NotFoundException(
        `Attribute definition '${definitionId}' not found`,
      );
    }

    const opt = AttributeOption.create({
      attributeDefinitionId: definitionId,
      code: dto.code,
      label: dto.label,
      sortOrder: dto.sortOrder ?? 0,
    });

    return this.attrOptionRepo.save(opt);
  }

  async deleteOption(optionId: string): Promise<void> {
    await this.attrOptionRepo.delete(optionId);
  }

  async getCategoryAttributes(categoryId: string) {
    return this.getCategoryAttributesUseCase.execute(categoryId);
  }

  async assignCategoryAttribute(
    categoryId: string,
    dto: AssignCategoryAttributeDto,
  ): Promise<CategoryAttribute> {
    const catAttr = CategoryAttribute.create({
      categoryId,
      attributeDefinitionId: dto.attributeDefinitionId,
      isRequired: dto.isRequired ?? false,
      sortOrder: dto.sortOrder ?? 0,
      defaultValue: dto.defaultValue ?? null,
    });

    return this.categoryAttrRepo.save(catAttr);
  }

  async unassignCategoryAttribute(
    categoryId: string,
    attributeDefinitionId: string,
  ): Promise<void> {
    await this.categoryAttrRepo.delete(categoryId, attributeDefinitionId);
  }

  async getComponentAttributes(
    componentId: string,
  ): Promise<Record<string, PopulatedComponentAttribute>> {
    const values = await this.componentAttrRepo.findByComponentId(componentId);
    if (values.length === 0) return {};

    const result: Record<string, PopulatedComponentAttribute> = {};

    for (const val of values) {
      const def = await this.attrDefRepo.findById(val.attributeDefinitionId);
      if (!def) continue;

      let value: unknown = null;
      let displayValue = '';
      let optionCode: string | null = null;
      let optionLabel: string | null = null;

      switch (def.dataType) {
        case 'TEXT':
          value = val.textValue;
          displayValue = val.textValue ?? '';
          break;
        case 'NUMBER':
        case 'INTEGER':
          value = val.numberValue;
          displayValue =
            val.numberValue !== null ? String(val.numberValue) : '';
          break;
        case 'BOOLEAN':
          value = val.booleanValue;
          displayValue = val.booleanValue ? 'Yes' : 'No';
          break;
        case 'QUANTITY':
          value = val.numberValue;
          displayValue =
            val.numberValue !== null
              ? `${val.numberValue}${val.unit ? ' ' + val.unit : ''}`
              : '';
          break;
        case 'DATE':
          value = val.dateValue;
          displayValue = val.dateValue
            ? new Date(val.dateValue).toLocaleDateString()
            : '';
          break;
        case 'SELECT':
          if (val.optionId) {
            const opt = await this.attrOptionRepo.findById(val.optionId);
            if (opt) {
              optionCode = opt.code;
              optionLabel = opt.label;
              value = opt.code;
              displayValue = opt.label;
            }
          }
          break;
        case 'MULTI_SELECT':
          value = val.selectedOptionIds;
          if (
            Array.isArray(val.selectedOptionIds) &&
            val.selectedOptionIds.length > 0
          ) {
            const labels: string[] = [];
            for (const optId of val.selectedOptionIds) {
              const opt = await this.attrOptionRepo.findById(optId);
              if (opt) labels.push(opt.label);
            }
            displayValue =
              labels.length > 0
                ? labels.join(', ')
                : val.selectedOptionIds.join(', ');
          }
          break;
      }

      result[def.code] = {
        definitionId: def.id,
        code: def.code,
        name: def.name,
        dataType: def.dataType,
        value,
        unit: val.unit ?? null,
        normalizedValue: val.normalizedNumberValue ?? null,
        optionId: val.optionId ?? null,
        optionCode,
        optionLabel,
        displayValue,
      };
    }

    return result;
  }

  async getComponentsAttributes(
    componentIds: string[],
  ): Promise<Record<string, Record<string, PopulatedComponentAttribute>>> {
    if (componentIds.length === 0) return {};
    const valuesByComp =
      await this.componentAttrRepo.findByComponentIds(componentIds);
    const defs = await this.attrDefRepo.findMany();
    const defMap = new Map<string, AttributeDefinition>(
      defs.map((d) => [d.id, d]),
    );

    const result: Record<
      string,
      Record<string, PopulatedComponentAttribute>
    > = {};

    for (const compId of componentIds) {
      result[compId] = {};
      const compVals = valuesByComp[compId] ?? [];
      for (const val of compVals) {
        const def = defMap.get(val.attributeDefinitionId);
        if (!def) continue;

        let value: unknown = null;
        let displayValue = '';
        let optionCode: string | null = null;
        let optionLabel: string | null = null;

        switch (def.dataType) {
          case 'TEXT':
            value = val.textValue;
            displayValue = val.textValue ?? '';
            break;
          case 'NUMBER':
          case 'INTEGER':
            value = val.numberValue;
            displayValue =
              val.numberValue !== null ? String(val.numberValue) : '';
            break;
          case 'BOOLEAN':
            value = val.booleanValue;
            displayValue = val.booleanValue ? 'Yes' : 'No';
            break;
          case 'QUANTITY':
            value = val.numberValue;
            displayValue =
              val.numberValue !== null
                ? `${val.numberValue}${val.unit ? ' ' + val.unit : ''}`
                : '';
            break;
          case 'DATE':
            value = val.dateValue;
            displayValue = val.dateValue
              ? new Date(val.dateValue).toLocaleDateString()
              : '';
            break;
          case 'SELECT':
            if (val.optionId) {
              const opt = await this.attrOptionRepo.findById(val.optionId);
              if (opt) {
                optionCode = opt.code;
                optionLabel = opt.label;
                value = opt.code;
                displayValue = opt.label;
              }
            }
            break;
          case 'MULTI_SELECT':
            value = val.selectedOptionIds;
            if (
              Array.isArray(val.selectedOptionIds) &&
              val.selectedOptionIds.length > 0
            ) {
              const labels: string[] = [];
              for (const optId of val.selectedOptionIds) {
                const opt = await this.attrOptionRepo.findById(optId);
                if (opt) labels.push(opt.label);
              }
              displayValue =
                labels.length > 0
                  ? labels.join(', ')
                  : val.selectedOptionIds.join(', ');
            }
            break;
        }

        result[compId][def.code] = {
          definitionId: def.id,
          code: def.code,
          name: def.name,
          dataType: def.dataType,
          value,
          unit: val.unit ?? null,
          normalizedValue: val.normalizedNumberValue ?? null,
          optionId: val.optionId ?? null,
          optionCode,
          optionLabel,
          displayValue,
        };
      }
    }

    return result;
  }

  async saveComponentAttributes(
    componentId: string,
    inputs: ComponentAttributeInput[],
  ): Promise<ComponentAttributeValue[]> {
    return this.saveComponentAttributesUseCase.execute(componentId, inputs);
  }

  async removeComponentAttribute(
    componentId: string,
    attributeDefinitionId: string,
  ): Promise<void> {
    await this.componentAttrRepo.deleteByComponentAndAttribute(
      componentId,
      attributeDefinitionId,
    );
  }
}

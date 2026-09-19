import { Inject, Injectable } from '@nestjs/common';
import {
  CreateComponent,
  UpdateComponent,
  DeleteComponent,
  type CreateComponentInput,
  type UpdateComponentInput,
  type Component,
  type ComponentRepository,
  ComponentNotFoundError,
  type ComponentAttributeInput,
} from '@ananya/inventory';
import { COMPONENT_REPOSITORY } from './component.tokens';
import { AttributesService } from '../attributes/attributes.service';
import { ComponentSkuService } from './component-sku.service';
import {
  PendingComponentEntityService,
  type PendingCategoryInput,
  type PendingManufacturerInput,
} from './pending-component-entity.service';

interface RawAttributeObject {
  attributeDefinitionId?: string;
  code?: string;
  value?: unknown;
  numberValue?: unknown;
  textValue?: unknown;
  unit?: string;
  optionId?: string;
  optionCode?: string;
  selectedOptionIds?: string[];
  selectedOptionCodes?: string[];
}

function normalizeAttributeInputs(
  rawAttributes?: Record<string, unknown> | unknown[],
): ComponentAttributeInput[] {
  if (!rawAttributes) return [];
  if (Array.isArray(rawAttributes)) {
    return rawAttributes.map((entry) => {
      const item = (
        typeof entry === 'object' && entry !== null ? entry : {}
      ) as RawAttributeObject;
      return {
        attributeDefinitionId: item.attributeDefinitionId,
        code: item.code,
        value: item.value ?? item.numberValue ?? item.textValue,
        unit: item.unit,
        optionId: item.optionId,
        optionCode:
          item.optionCode ??
          (typeof item.value === 'string' ? item.value : undefined),
        selectedOptionIds: item.selectedOptionIds,
        selectedOptionCodes: item.selectedOptionCodes,
      };
    });
  }

  const result: ComponentAttributeInput[] = [];
  for (const [code, val] of Object.entries(rawAttributes)) {
    if (val === undefined || val === null) continue;
    if (typeof val === 'object' && !Array.isArray(val)) {
      const obj = val as RawAttributeObject;
      result.push({
        code,
        attributeDefinitionId: obj.attributeDefinitionId,
        value: obj.value ?? obj.numberValue ?? obj.textValue,
        unit: obj.unit,
        optionId: obj.optionId,
        optionCode:
          obj.optionCode ??
          obj.code ??
          (typeof obj.value === 'string' ? obj.value : undefined),
        selectedOptionIds: obj.selectedOptionIds,
        selectedOptionCodes: obj.selectedOptionCodes,
      });
    } else {
      result.push({
        code,
        value: val,
      });
    }
  }
  return result;
}

@Injectable()
export class ComponentsService {
  private readonly createComponentUseCase: CreateComponent;
  private readonly updateComponentUseCase: UpdateComponent;
  private readonly deleteComponentUseCase: DeleteComponent;

  constructor(
    @Inject(COMPONENT_REPOSITORY)
    private readonly repository: ComponentRepository,
    private readonly attributesService: AttributesService,
    private readonly componentSkuService: ComponentSkuService,
    private readonly pendingEntityService: PendingComponentEntityService,
  ) {
    this.createComponentUseCase = new CreateComponent(
      repository,
      componentSkuService,
    );
    this.updateComponentUseCase = new UpdateComponent(repository);
    this.deleteComponentUseCase = new DeleteComponent(repository);
  }

  async create(
    input: CreateComponentInput & {
      attributes?: Record<string, any> | Array<any>;
      pendingManufacturer?: PendingManufacturerInput;
      pendingCategory?: PendingCategoryInput;
    },
  ): Promise<Component & { attributes?: Record<string, any> }> {
    const resolvedInput = {
      ...input,
      manufacturerId: await this.pendingEntityService.resolveManufacturer(
        input.manufacturerId,
        input.pendingManufacturer,
      ),
      categoryId: await this.pendingEntityService.resolveCategory(
        input.categoryId,
        input.pendingCategory,
      ),
    };
    const component = await this.createComponentUseCase.execute(resolvedInput);

    if (input.attributes) {
      const formatted = normalizeAttributeInputs(input.attributes);
      if (formatted.length > 0) {
        await this.attributesService.saveComponentAttributes(
          component.id,
          formatted,
        );
      }
    }

    const attributes = await this.attributesService.getComponentAttributes(
      component.id,
    );
    return Object.assign(component, { attributes });
  }

  async update(
    id: string,
    input: UpdateComponentInput & {
      attributes?: Record<string, any> | Array<any>;
      pendingManufacturer?: PendingManufacturerInput;
      pendingCategory?: PendingCategoryInput;
    },
  ): Promise<Component & { attributes?: Record<string, any> }> {
    const resolvedInput = {
      ...input,
      manufacturerId: await this.pendingEntityService.resolveManufacturer(
        input.manufacturerId,
        input.pendingManufacturer,
      ),
      categoryId: await this.pendingEntityService.resolveCategory(
        input.categoryId,
        input.pendingCategory,
      ),
    };
    const component = await this.updateComponentUseCase.execute(
      id,
      resolvedInput,
    );

    if (input.attributes) {
      const formatted = normalizeAttributeInputs(input.attributes);
      if (formatted.length > 0) {
        await this.attributesService.saveComponentAttributes(id, formatted);
      }
    }

    const attributes = await this.attributesService.getComponentAttributes(id);
    return Object.assign(component, { attributes });
  }

  async delete(id: string): Promise<void> {
    return this.deleteComponentUseCase.execute(id);
  }

  async getAllComponents(): Promise<
    (Component & { attributes: Record<string, any> })[]
  > {
    const comps = await this.repository.findMany();
    if (comps.length === 0) return [];
    const compIds = comps.map((c) => c.id);
    const attrMap =
      await this.attributesService.getComponentsAttributes(compIds);
    return comps.map((c) =>
      Object.assign(c, { attributes: attrMap[c.id] ?? {} }),
    );
  }

  async getComponent(
    id: string,
  ): Promise<Component & { attributes: Record<string, any> }> {
    const component = await this.repository.findById(id);
    if (!component) {
      throw new ComponentNotFoundError(id);
    }
    const attributes = await this.attributesService.getComponentAttributes(id);
    return Object.assign(component, { attributes });
  }
}

import type { UnitRepository } from "../units/unit.repository";
import type {
  AttributeDefinitionRepository,
  AttributeOptionRepository,
  ComponentAttributeRepository,
} from "./attribute.repository";
import { ComponentAttributeValue } from "./component-attribute-value";
import {
  AttributeDefinitionNotFoundError,
  AttributeValueValidationError,
} from "./attribute.errors";

export interface ComponentAttributeInput {
  attributeDefinitionId?: string;
  code?: string;
  value?: unknown;
  unit?: string | null;
  optionId?: string | null;
  optionCode?: string | null;
  selectedOptionIds?: string[] | null;
  selectedOptionCodes?: string[] | null;
}

export class SaveComponentAttributes {
  constructor(
    private readonly attrDefRepo: AttributeDefinitionRepository,
    private readonly attrOptionRepo: AttributeOptionRepository,
    private readonly unitRepo: UnitRepository,
    private readonly componentAttrRepo: ComponentAttributeRepository,
  ) {}

  public async execute(
    componentId: string,
    inputs: ComponentAttributeInput[],
  ): Promise<ComponentAttributeValue[]> {
    const valuesToUpsert: ComponentAttributeValue[] = [];

    for (const input of inputs) {
      // 1. Resolve attribute definition
      let def = input.attributeDefinitionId
        ? await this.attrDefRepo.findById(input.attributeDefinitionId)
        : null;

      if (!def && input.code) {
        def = await this.attrDefRepo.findByCode(input.code);
      }

      if (!def) {
        throw new AttributeDefinitionNotFoundError(
          input.attributeDefinitionId || input.code || "unknown",
        );
      }

      let textValue: string | null = null;
      let numberValue: number | null = null;
      let normalizedNumberValue: number | null = null;
      let booleanValue: boolean | null = null;
      let dateValue: Date | null = null;
      let unitValue: string | null = input.unit ?? def.defaultUnit ?? null;
      let optionId: string | null = input.optionId ?? null;
      let selectedOptionIds: string[] | null =
        input.selectedOptionIds ?? null;

      // 2. Process according to dataType
      switch (def.dataType) {
        case "TEXT": {
          if (input.value !== undefined && input.value !== null) {
            textValue = String(input.value).trim();
          }
          break;
        }

        case "NUMBER": {
          if (input.value !== undefined && input.value !== null && input.value !== "") {
            const num = Number(input.value);
            if (Number.isNaN(num)) {
              throw new AttributeValueValidationError(
                def.code,
                `Expected numeric value, received '${input.value}'`,
              );
            }
            numberValue = num;
            normalizedNumberValue = num;
          }
          break;
        }

        case "INTEGER": {
          if (input.value !== undefined && input.value !== null && input.value !== "") {
            const num = parseInt(String(input.value), 10);
            if (Number.isNaN(num)) {
              throw new AttributeValueValidationError(
                def.code,
                `Expected integer value, received '${input.value}'`,
              );
            }
            numberValue = num;
            normalizedNumberValue = num;
          }
          break;
        }

        case "BOOLEAN": {
          if (input.value !== undefined && input.value !== null) {
            booleanValue =
              input.value === true ||
              input.value === "true" ||
              input.value === 1 ||
              input.value === "1";
          }
          break;
        }

        case "SELECT": {
          if (!optionId && input.optionCode) {
            const opt = await this.attrOptionRepo.findByDefinitionIdAndCode(
              def.id,
              input.optionCode,
            );
            optionId = opt?.id ?? null;
          } else if (!optionId && typeof input.value === "string" && input.value) {
            const opt = await this.attrOptionRepo.findByDefinitionIdAndCode(
              def.id,
              input.value,
            );
            optionId = opt?.id ?? null;
          }
          break;
        }

        case "MULTI_SELECT": {
          if (
            (!selectedOptionIds || selectedOptionIds.length === 0) &&
            input.selectedOptionCodes &&
            input.selectedOptionCodes.length > 0
          ) {
            const resolved: string[] = [];
            for (const code of input.selectedOptionCodes) {
              const opt = await this.attrOptionRepo.findByDefinitionIdAndCode(
                def.id,
                code,
              );
              if (opt) resolved.push(opt.id);
            }
            selectedOptionIds = resolved;
          } else if (
            (!selectedOptionIds || selectedOptionIds.length === 0) &&
            Array.isArray(input.value)
          ) {
            const resolved: string[] = [];
            for (const item of input.value) {
              const opt = await this.attrOptionRepo.findByDefinitionIdAndCode(
                def.id,
                String(item),
              );
              if (opt) resolved.push(opt.id);
            }
            selectedOptionIds = resolved;
          }
          break;
        }

        case "QUANTITY": {
          if (input.value !== undefined && input.value !== null && input.value !== "") {
            const num = Number(input.value);
            if (Number.isNaN(num)) {
              throw new AttributeValueValidationError(
                def.code,
                `Expected numeric quantity, received '${input.value}'`,
              );
            }
            numberValue = num;

            // Unit conversion to base unit for normalizedNumberValue
            if (unitValue) {
              const unitEntity = await this.unitRepo.findByName(unitValue);
              if (unitEntity) {
                normalizedNumberValue = unitEntity.convertToBase(num);
              } else {
                normalizedNumberValue = num;
              }
            } else {
              normalizedNumberValue = num;
            }
          }
          break;
        }

        case "DATE": {
          if (input.value) {
            const date = new Date(input.value as string);
            if (Number.isNaN(date.getTime())) {
              throw new AttributeValueValidationError(
                def.code,
                `Invalid date format '${input.value}'`,
              );
            }
            dateValue = date;
          }
          break;
        }
      }

      // Check if value is provided before saving
      const hasValue =
        textValue !== null ||
        numberValue !== null ||
        booleanValue !== null ||
        dateValue !== null ||
        optionId !== null ||
        (selectedOptionIds && selectedOptionIds.length > 0);

      if (hasValue) {
        valuesToUpsert.push(
          ComponentAttributeValue.create({
            componentId,
            attributeDefinitionId: def.id,
            textValue,
            numberValue,
            normalizedNumberValue,
            booleanValue,
            dateValue,
            unit: unitValue,
            optionId,
            selectedOptionIds,
          }),
        );
      }
    }

    if (valuesToUpsert.length === 0) {
      return [];
    }

    return this.componentAttrRepo.upsertMany(valuesToUpsert);
  }
}

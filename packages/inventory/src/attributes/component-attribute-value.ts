import { ObjectId } from "@ananya/core";

export interface ComponentAttributeValueProps {
  id: string;
  componentId: string;
  attributeDefinitionId: string;
  textValue?: string | null;
  numberValue?: number | null;
  normalizedNumberValue?: number | null;
  booleanValue?: boolean | null;
  dateValue?: Date | null;
  unit?: string | null;
  optionId?: string | null;
  selectedOptionIds?: string[] | null;
  jsonValue?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateComponentAttributeValueInput {
  componentId: string;
  attributeDefinitionId: string;
  textValue?: string | null;
  numberValue?: number | null;
  normalizedNumberValue?: number | null;
  booleanValue?: boolean | null;
  dateValue?: Date | null;
  unit?: string | null;
  optionId?: string | null;
  selectedOptionIds?: string[] | null;
  jsonValue?: Record<string, unknown> | null;
}

export class ComponentAttributeValue {
  public readonly id: string;
  public readonly componentId: string;
  public readonly attributeDefinitionId: string;
  public readonly textValue?: string | null;
  public readonly numberValue?: number | null;
  public readonly normalizedNumberValue?: number | null;
  public readonly booleanValue?: boolean | null;
  public readonly dateValue?: Date | null;
  public readonly unit?: string | null;
  public readonly optionId?: string | null;
  public readonly selectedOptionIds?: string[] | null;
  public readonly jsonValue?: Record<string, unknown> | null;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  private constructor(props: ComponentAttributeValueProps) {
    this.id = props.id;
    this.componentId = props.componentId;
    this.attributeDefinitionId = props.attributeDefinitionId;
    this.textValue = props.textValue ?? null;
    this.numberValue = props.numberValue ?? null;
    this.normalizedNumberValue = props.normalizedNumberValue ?? null;
    this.booleanValue = props.booleanValue ?? null;
    this.dateValue = props.dateValue ?? null;
    this.unit = props.unit ?? null;
    this.optionId = props.optionId ?? null;
    this.selectedOptionIds = props.selectedOptionIds ?? null;
    this.jsonValue = props.jsonValue ?? null;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(
    input: CreateComponentAttributeValueInput,
  ): ComponentAttributeValue {
    const id = ObjectId.generate().value;
    const createdAt = new Date();
    const updatedAt = createdAt;

    return new ComponentAttributeValue({
      id,
      componentId: input.componentId,
      attributeDefinitionId: input.attributeDefinitionId,
      textValue: input.textValue,
      numberValue: input.numberValue,
      normalizedNumberValue: input.normalizedNumberValue,
      booleanValue: input.booleanValue,
      dateValue: input.dateValue,
      unit: input.unit,
      optionId: input.optionId,
      selectedOptionIds: input.selectedOptionIds,
      jsonValue: input.jsonValue,
      createdAt,
      updatedAt,
    });
  }

  public static rehydrate(
    props: ComponentAttributeValueProps,
  ): ComponentAttributeValue {
    return new ComponentAttributeValue(props);
  }
}

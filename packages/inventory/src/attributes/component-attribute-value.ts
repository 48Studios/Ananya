import { ObjectId } from "@ananya/core";

/**
 * Provenance of a value that was not typed by a human.
 *
 * Documentation Intelligence records where a value came from so the component
 * can always answer "why is this value here, and which evidence produced it?".
 * The shape is intentionally plain JSON: the attribute model does not need a
 * typed provenance hierarchy, and the fields are consumed by the UI and audit
 * trail rather than by domain rules.
 */
export interface ComponentAttributeProvenance {
  source: string;
  documentId?: string;
  documentVersion?: number;
  contentHash?: string;
  page?: number | null;
  evidenceExcerpt?: string | null;
  extractionMethod?: string;
  intelligenceVersion?: string;
  findingId?: string;
  reviewerId?: string | null;
  reviewerEmail?: string | null;
  appliedAt?: string;
  /**
   * Every other document that stated the same value.
   *
   * A value corroborated by several documents records the one it was applied
   * from as the primary source and the rest here, so "which documents said this,
   * and which one was it applied from" stays answerable after the fact. Absent
   * for a single-source value, which is the common case.
   */
  supportingDocuments?: Array<{
    documentId: string;
    documentVersion: number;
    contentHash: string;
    documentFileName: string | null;
    documentType: string | null;
    page: number | null;
  }>;
}

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
  provenance?: Record<string, unknown> | null;
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
  provenance?: Record<string, unknown> | null;
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
  public readonly provenance?: Record<string, unknown> | null;
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
    this.provenance = props.provenance ?? null;
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
      provenance: input.provenance,
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

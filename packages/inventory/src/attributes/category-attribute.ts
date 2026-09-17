import { ObjectId } from "@ananya/core";

export interface CategoryAttributeProps {
  id: string;
  categoryId: string;
  attributeDefinitionId: string;
  isRequired: boolean;
  sortOrder: number;
  defaultValue?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCategoryAttributeInput {
  categoryId: string;
  attributeDefinitionId: string;
  isRequired?: boolean;
  sortOrder?: number;
  defaultValue?: Record<string, unknown> | null;
}

export interface UpdateCategoryAttributeInput {
  isRequired?: boolean;
  sortOrder?: number;
  defaultValue?: Record<string, unknown> | null;
}

export class CategoryAttribute {
  public readonly id: string;
  public readonly categoryId: string;
  public readonly attributeDefinitionId: string;
  public readonly isRequired: boolean;
  public readonly sortOrder: number;
  public readonly defaultValue?: Record<string, unknown> | null;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  private constructor(props: CategoryAttributeProps) {
    this.id = props.id;
    this.categoryId = props.categoryId;
    this.attributeDefinitionId = props.attributeDefinitionId;
    this.isRequired = props.isRequired;
    this.sortOrder = props.sortOrder;
    this.defaultValue = props.defaultValue;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(
    input: CreateCategoryAttributeInput,
  ): CategoryAttribute {
    if (!input.categoryId) {
      throw new Error("Category ID is required");
    }
    if (!input.attributeDefinitionId) {
      throw new Error("Attribute definition ID is required");
    }

    const id = ObjectId.generate().value;
    const createdAt = new Date();
    const updatedAt = createdAt;

    return new CategoryAttribute({
      id,
      categoryId: input.categoryId,
      attributeDefinitionId: input.attributeDefinitionId,
      isRequired: input.isRequired ?? false,
      sortOrder: input.sortOrder ?? 0,
      defaultValue: input.defaultValue ?? null,
      createdAt,
      updatedAt,
    });
  }

  public update(input: UpdateCategoryAttributeInput): CategoryAttribute {
    return new CategoryAttribute({
      id: this.id,
      categoryId: this.categoryId,
      attributeDefinitionId: this.attributeDefinitionId,
      isRequired:
        input.isRequired !== undefined ? input.isRequired : this.isRequired,
      sortOrder:
        input.sortOrder !== undefined ? input.sortOrder : this.sortOrder,
      defaultValue:
        input.defaultValue !== undefined
          ? input.defaultValue
          : this.defaultValue,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  public static rehydrate(props: CategoryAttributeProps): CategoryAttribute {
    return new CategoryAttribute(props);
  }
}

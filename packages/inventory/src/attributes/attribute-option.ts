import { ObjectId } from "@ananya/core";

export interface AttributeOptionProps {
  id: string;
  attributeDefinitionId: string;
  code: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAttributeOptionInput {
  attributeDefinitionId: string;
  code: string;
  label: string;
  sortOrder?: number;
}

export interface UpdateAttributeOptionInput {
  label?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export class AttributeOption {
  public readonly id: string;
  public readonly attributeDefinitionId: string;
  public readonly code: string;
  public readonly label: string;
  public readonly sortOrder: number;
  public readonly isActive: boolean;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  private constructor(props: AttributeOptionProps) {
    this.id = props.id;
    this.attributeDefinitionId = props.attributeDefinitionId;
    this.code = props.code;
    this.label = props.label;
    this.sortOrder = props.sortOrder;
    this.isActive = props.isActive;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(input: CreateAttributeOptionInput): AttributeOption {
    const code = input.code.trim();
    const label = input.label.trim();

    if (!code) {
      throw new Error("Option code is required");
    }
    if (!label) {
      throw new Error("Option label is required");
    }

    const id = ObjectId.generate().value;
    const createdAt = new Date();
    const updatedAt = createdAt;

    return new AttributeOption({
      id,
      attributeDefinitionId: input.attributeDefinitionId,
      code,
      label,
      sortOrder: input.sortOrder ?? 0,
      isActive: true,
      createdAt,
      updatedAt,
    });
  }

  public update(input: UpdateAttributeOptionInput): AttributeOption {
    return new AttributeOption({
      id: this.id,
      attributeDefinitionId: this.attributeDefinitionId,
      code: this.code,
      label: input.label !== undefined ? input.label.trim() : this.label,
      sortOrder:
        input.sortOrder !== undefined ? input.sortOrder : this.sortOrder,
      isActive: input.isActive !== undefined ? input.isActive : this.isActive,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  public static rehydrate(props: AttributeOptionProps): AttributeOption {
    return new AttributeOption(props);
  }
}

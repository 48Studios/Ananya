import { ObjectId } from "@ananya/core";
import {
  InvalidAttributeCodeError,
  InvalidAttributeNameError,
  InvalidAttributeDataTypeError,
} from "./attribute.errors";

export type AttributeDataType =
  | "TEXT"
  | "NUMBER"
  | "INTEGER"
  | "BOOLEAN"
  | "SELECT"
  | "MULTI_SELECT"
  | "QUANTITY"
  | "DATE";

export const VALID_ATTRIBUTE_DATA_TYPES: AttributeDataType[] = [
  "TEXT",
  "NUMBER",
  "INTEGER",
  "BOOLEAN",
  "SELECT",
  "MULTI_SELECT",
  "QUANTITY",
  "DATE",
];

export interface AttributeDefinitionProps {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  dataType: AttributeDataType;
  unitCategory?: string | null;
  defaultUnit?: string | null;
  isFilterable: boolean;
  sortOrder: number;
  validationRules?: Record<string, unknown> | null;
  aliases?: string[];
  groupName?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAttributeDefinitionInput {
  code: string;
  name: string;
  description?: string | null;
  dataType: AttributeDataType;
  unitCategory?: string | null;
  defaultUnit?: string | null;
  isFilterable?: boolean;
  sortOrder?: number;
  validationRules?: Record<string, unknown> | null;
  aliases?: string[];
  groupName?: string | null;
}

export interface UpdateAttributeDefinitionInput {
  name?: string;
  description?: string | null;
  dataType?: AttributeDataType;
  unitCategory?: string | null;
  defaultUnit?: string | null;
  isFilterable?: boolean;
  sortOrder?: number;
  validationRules?: Record<string, unknown> | null;
  aliases?: string[];
  groupName?: string | null;
  isActive?: boolean;
}

export class AttributeDefinition {
  public readonly id: string;
  public readonly code: string;
  public readonly name: string;
  public readonly description?: string | null;
  public readonly dataType: AttributeDataType;
  public readonly unitCategory?: string | null;
  public readonly defaultUnit?: string | null;
  public readonly isFilterable: boolean;
  public readonly sortOrder: number;
  public readonly validationRules?: Record<string, unknown> | null;
  public readonly aliases: string[];
  public readonly groupName?: string | null;
  public readonly isActive: boolean;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  private constructor(props: AttributeDefinitionProps) {
    this.id = props.id;
    this.code = props.code;
    this.name = props.name;
    this.description = props.description;
    this.dataType = props.dataType;
    this.unitCategory = props.unitCategory;
    this.defaultUnit = props.defaultUnit;
    this.isFilterable = props.isFilterable;
    this.sortOrder = props.sortOrder;
    this.validationRules = props.validationRules;
    this.aliases = props.aliases ?? [];
    this.groupName = props.groupName ?? null;
    this.isActive = props.isActive;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(
    input: CreateAttributeDefinitionInput,
  ): AttributeDefinition {
    const code = input.code.trim().toLowerCase().replace(/[\s-]+/g, "_");
    const name = input.name.trim();

    if (!code) {
      throw new InvalidAttributeCodeError("Attribute code is required");
    }

    if (!name) {
      throw new InvalidAttributeNameError("Attribute name is required");
    }

    if (!VALID_ATTRIBUTE_DATA_TYPES.includes(input.dataType)) {
      throw new InvalidAttributeDataTypeError(
        `Invalid data type '${input.dataType}'. Valid types: ${VALID_ATTRIBUTE_DATA_TYPES.join(", ")}`,
      );
    }

    const id = ObjectId.generate().value;
    const createdAt = new Date();
    const updatedAt = createdAt;

    return new AttributeDefinition({
      id,
      code,
      name,
      description: input.description?.trim() ?? null,
      dataType: input.dataType,
      unitCategory: input.unitCategory?.trim() ?? null,
      defaultUnit: input.defaultUnit?.trim() ?? null,
      isFilterable: input.isFilterable ?? true,
      sortOrder: input.sortOrder ?? 0,
      validationRules: input.validationRules ?? null,
      aliases: input.aliases ?? [],
      groupName: input.groupName?.trim() ?? null,
      isActive: true,
      createdAt,
      updatedAt,
    });
  }

  public update(input: UpdateAttributeDefinitionInput): AttributeDefinition {
    const name = input.name !== undefined ? input.name.trim() : this.name;
    if (!name) {
      throw new InvalidAttributeNameError("Attribute name is required");
    }

    const dataType = input.dataType ?? this.dataType;
    if (!VALID_ATTRIBUTE_DATA_TYPES.includes(dataType)) {
      throw new InvalidAttributeDataTypeError(
        `Invalid data type '${dataType}'. Valid types: ${VALID_ATTRIBUTE_DATA_TYPES.join(", ")}`,
      );
    }

    return new AttributeDefinition({
      id: this.id,
      code: this.code,
      name,
      description:
        input.description !== undefined
          ? (input.description?.trim() ?? null)
          : this.description,
      dataType,
      unitCategory:
        input.unitCategory !== undefined
          ? (input.unitCategory?.trim() ?? null)
          : this.unitCategory,
      defaultUnit:
        input.defaultUnit !== undefined
          ? (input.defaultUnit?.trim() ?? null)
          : this.defaultUnit,
      isFilterable:
        input.isFilterable !== undefined
          ? input.isFilterable
          : this.isFilterable,
      sortOrder:
        input.sortOrder !== undefined ? input.sortOrder : this.sortOrder,
      validationRules:
        input.validationRules !== undefined
          ? input.validationRules
          : this.validationRules,
      aliases:
        input.aliases !== undefined
          ? input.aliases
          : this.aliases,
      groupName:
        input.groupName !== undefined
          ? (input.groupName?.trim() ?? null)
          : this.groupName,
      isActive: input.isActive !== undefined ? input.isActive : this.isActive,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  public static rehydrate(props: AttributeDefinitionProps): AttributeDefinition {
    return new AttributeDefinition(props);
  }
}

import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  VALID_ATTRIBUTE_DATA_TYPES,
  type AttributeDataType,
} from '@ananya/inventory';

export class AttributeOptionInputDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  label!: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class CreateAttributeDefinitionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(VALID_ATTRIBUTE_DATA_TYPES)
  dataType!: AttributeDataType;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  unitCategory?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  defaultUnit?: string;

  @IsOptional()
  @IsBoolean()
  isFilterable?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  validationRules?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  aliases?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  groupName?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttributeOptionInputDto)
  options?: AttributeOptionInputDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryBindingInputDto)
  categoryBindings?: CategoryBindingInputDto[];
}

export class CategoryBindingInputDto {
  @IsString()
  @IsNotEmpty()
  categoryId!: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  defaultValue?: Record<string, unknown>;
}

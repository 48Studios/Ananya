import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  VALID_ATTRIBUTE_DATA_TYPES,
  type AttributeDataType,
} from '@ananya/inventory';

export class UpdateAttributeDefinitionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn(VALID_ATTRIBUTE_DATA_TYPES)
  dataType?: AttributeDataType;

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
  @IsBoolean()
  isActive?: boolean;
}

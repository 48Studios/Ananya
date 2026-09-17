import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class AssignCategoryAttributeDto {
  @IsUUID()
  @IsNotEmpty()
  attributeDefinitionId!: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  defaultValue?: Record<string, unknown>;
}

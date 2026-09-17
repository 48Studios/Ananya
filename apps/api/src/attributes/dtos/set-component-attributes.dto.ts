import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ComponentAttributeValueItemDto {
  @IsOptional()
  @IsUUID()
  attributeDefinitionId?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  value?: unknown;

  @IsOptional()
  @IsString()
  unit?: string | null;

  @IsOptional()
  @IsUUID()
  optionId?: string | null;

  @IsOptional()
  @IsString()
  optionCode?: string | null;

  @IsOptional()
  @IsArray()
  selectedOptionIds?: string[] | null;

  @IsOptional()
  @IsArray()
  selectedOptionCodes?: string[] | null;
}

export class SetComponentAttributesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComponentAttributeValueItemDto)
  attributes!: ComponentAttributeValueItemDto[];
}

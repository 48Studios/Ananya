import {
  IsArray,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SpatialLayoutMappingItemDto } from './spatial-layout-mapping-item.dto';

export class CreateSpatialLayoutDto {
  @IsUUID()
  @IsNotEmpty()
  parentLocationId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  templateType!: string;

  @IsString()
  @IsOptional()
  @MaxLength(32)
  engineVersion?: string;

  @IsObject()
  @IsNotEmpty()
  config!: Record<string, unknown>;

  @IsString()
  @IsOptional()
  @MaxLength(32)
  status?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SpatialLayoutMappingItemDto)
  @IsOptional()
  mappings?: SpatialLayoutMappingItemDto[];

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

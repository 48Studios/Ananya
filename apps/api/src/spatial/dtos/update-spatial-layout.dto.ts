import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SpatialLayoutMappingItemDto } from './spatial-layout-mapping-item.dto';

export class UpdateSpatialLayoutDto {
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  expectedRevision!: number;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  templateType?: string;

  @IsObject()
  @IsOptional()
  config?: Record<string, unknown>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SpatialLayoutMappingItemDto)
  @IsOptional()
  mappings?: SpatialLayoutMappingItemDto[];

  @IsString()
  @IsOptional()
  changeDescription?: string;

  @IsBoolean()
  @IsOptional()
  overwriteManualSpatialNodes?: boolean;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

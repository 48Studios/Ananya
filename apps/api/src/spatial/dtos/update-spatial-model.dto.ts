import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateSpatialModelDto {
  @IsString()
  @IsOptional()
  @MaxLength(64)
  code?: string;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(32)
  format?: string;

  @IsString()
  @IsOptional()
  @MaxLength(512)
  assetUri?: string;

  @IsString()
  @IsOptional()
  @MaxLength(512)
  thumbnailUri?: string;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  widthMm?: number;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  heightMm?: number;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  depthMm?: number;

  @IsOptional()
  metadata?: Record<string, unknown>;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

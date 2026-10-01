import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateSpatialModelDto {
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
  widthMm!: number;

  @IsNumber()
  @IsPositive()
  heightMm!: number;

  @IsNumber()
  @IsPositive()
  depthMm!: number;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

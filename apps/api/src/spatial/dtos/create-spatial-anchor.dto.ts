import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateSpatialAnchorDto {
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
  @MaxLength(32)
  anchorType?: string;

  @IsNumber()
  @IsOptional()
  localPositionX?: number;

  @IsNumber()
  @IsOptional()
  localPositionY?: number;

  @IsNumber()
  @IsOptional()
  localPositionZ?: number;

  @IsNumber()
  @IsOptional()
  localRotationX?: number;

  @IsNumber()
  @IsOptional()
  localRotationY?: number;

  @IsNumber()
  @IsOptional()
  localRotationZ?: number;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  boundingWidthMm?: number;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  boundingHeightMm?: number;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  boundingDepthMm?: number;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

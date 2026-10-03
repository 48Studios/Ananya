import { IsBoolean, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export class UpdateSpatialNodeDto {
  @IsUUID()
  @IsOptional()
  modelId?: string | null;

  @IsUUID()
  @IsOptional()
  parentSpatialNodeId?: string | null;

  @IsUUID()
  @IsOptional()
  anchorId?: string | null;

  @IsNumber()
  @IsOptional()
  positionX?: number;

  @IsNumber()
  @IsOptional()
  positionY?: number;

  @IsNumber()
  @IsOptional()
  positionZ?: number;

  @IsNumber()
  @IsOptional()
  rotationX?: number;

  @IsNumber()
  @IsOptional()
  rotationY?: number;

  @IsNumber()
  @IsOptional()
  rotationZ?: number;

  @IsNumber()
  @Min(0.0001)
  @IsOptional()
  scaleX?: number;

  @IsNumber()
  @Min(0.0001)
  @IsOptional()
  scaleY?: number;

  @IsNumber()
  @Min(0.0001)
  @IsOptional()
  scaleZ?: number;

  @IsBoolean()
  @IsOptional()
  isVisible?: boolean;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

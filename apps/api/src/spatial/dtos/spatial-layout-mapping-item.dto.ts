import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class SpatialLayoutMappingItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  slotId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  slotCode!: string;

  @IsUUID()
  @IsNotEmpty()
  locationId!: string;

  @IsInt()
  @IsOptional()
  logicalRow?: number;

  @IsInt()
  @IsOptional()
  logicalCol?: number;

  @IsBoolean()
  @IsOptional()
  isStale?: boolean;

  @IsString()
  @IsOptional()
  staleReason?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  acknowledgedChangeSignature?: string;
}

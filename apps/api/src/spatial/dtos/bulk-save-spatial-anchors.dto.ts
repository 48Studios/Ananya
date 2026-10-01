import { Type } from 'class-transformer';
import {
  IsArray,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { CreateSpatialAnchorDto } from './create-spatial-anchor.dto';
import { UpdateSpatialAnchorDto } from './update-spatial-anchor.dto';

export class UpdateSpatialAnchorItemDto extends UpdateSpatialAnchorDto {
  @IsUUID('4')
  @IsNotEmpty()
  id!: string;

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}

export class BulkSaveSpatialAnchorsDto {
  @IsOptional()
  @IsISO8601()
  expectedModelUpdatedAt?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSpatialAnchorDto)
  @IsOptional()
  creates?: CreateSpatialAnchorDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateSpatialAnchorItemDto)
  @IsOptional()
  updates?: UpdateSpatialAnchorItemDto[];

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  deleteIds?: string[];
}

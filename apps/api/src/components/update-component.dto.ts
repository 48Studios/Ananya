import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class PendingManufacturerUpdateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  code?: string;
}

class PendingCategoryUpdateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  code?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;
}

export class UpdateComponentDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => PendingManufacturerUpdateDto)
  pendingManufacturer?: PendingManufacturerUpdateDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PendingCategoryUpdateDto)
  pendingCategory?: PendingCategoryUpdateDto;

  @IsOptional()
  @IsString()
  manufacturerPartNumber?: string | null;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  manufacturerId?: string | null;

  @IsOptional()
  @IsString()
  categoryId?: string | null;

  @IsOptional()
  @IsString()
  defaultLocationId?: string | null;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  attributes?: Record<string, any> | Array<any>;
}

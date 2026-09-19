import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class PendingManufacturerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  code?: string;
}

class PendingCategoryDto {
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

export class CreateComponentDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  manufacturerPartNumber?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsUUID()
  manufacturerId?: string | undefined;

  @IsOptional()
  @IsUUID()
  categoryId?: string | undefined;

  @IsOptional()
  @ValidateNested()
  @Type(() => PendingManufacturerDto)
  pendingManufacturer?: PendingManufacturerDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PendingCategoryDto)
  pendingCategory?: PendingCategoryDto;

  @IsOptional()
  @IsUUID()
  defaultLocationId?: string | undefined;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  unit!: string;

  @IsOptional()
  attributes?: Record<string, any> | Array<any>;
}

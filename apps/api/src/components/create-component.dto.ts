import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  IsUUID,
} from 'class-validator';

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
  @IsUUID()
  defaultLocationId?: string | undefined;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  unit!: string;

  @IsOptional()
  attributes?: Record<string, any> | Array<any>;
}

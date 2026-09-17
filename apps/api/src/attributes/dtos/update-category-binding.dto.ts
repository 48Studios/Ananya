import { IsBoolean, IsInt, IsOptional } from 'class-validator';

export class UpdateCategoryBindingDto {
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  defaultValue?: Record<string, unknown>;
}

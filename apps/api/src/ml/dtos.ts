import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SuggestComponentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  query!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  partNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  datasheetText?: string;

  @IsOptional()
  @IsString()
  datasheetPdfBase64?: string;
}

export class CategorySuggestionDto {
  categoryId?: string | null;
  categoryCode?: string;
  categoryName!: string;
  subcategoryId?: string | null;
  subcategoryCode?: string;
  subcategoryName?: string | null;
  confidence!: number;
}

export class ManufacturerSuggestionDto {
  manufacturerId?: string | null;
  manufacturerCode?: string;
  manufacturerName!: string;
  confidence!: number;
  matchType!: string;
}

export class DuplicateWarningDto {
  id!: string;
  sku!: string;
  name?: string;
  similarity!: number;
  matchType!: string;
  reason!: string;
}

export class ExtractedAttributeDto {
  code!: string;
  attributeDefinitionId?: string | null;
  value!: string | number | boolean | null;
  unit?: string | null;
  formatted!: string;
  confidence!: number;
}

export class ComponentSuggestionResponseDto {
  query!: string;
  suggestedName?: string;
  suggestedSku?: string;
  suggestedUnit?: string;
  category?: CategorySuggestionDto | null;
  alternativeCategories!: CategorySuggestionDto[];
  manufacturer?: ManufacturerSuggestionDto | null;
  isDuplicate!: boolean;
  duplicateWarnings!: DuplicateWarningDto[];
  attributes!: Record<string, ExtractedAttributeDto>;
  isMlActive!: boolean;
  executionTimeMs!: number;
}

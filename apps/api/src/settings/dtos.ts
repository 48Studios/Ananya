import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsInt,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateOrganizationProfileDto {
  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsString()
  primaryTimezone?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;
}

/**
 * Reorder thresholds used by inventory alerting. `minStockLevel` is the
 * company-wide reorder point; 0 disables low-stock alerts.
 */
export class ReorderDefaultsDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000000)
  minStockLevel?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000000)
  reorderQuantity?: number;
}

export class UpdateSystemSettingsDto {
  @IsOptional()
  @IsString()
  baseCurrency?: string;

  @IsOptional()
  @IsArray()
  supportedCurrencies?: string[];

  @IsOptional()
  @IsString()
  defaultWarehouseId?: string;

  @IsOptional()
  @IsInt()
  fiscalYearStartMonth?: number;

  @IsOptional()
  @IsString()
  dateFormat?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ReorderDefaultsDto)
  reorderDefaultsJson?: ReorderDefaultsDto;
}

export class UpdateNumberingSeriesDto {
  @IsString()
  entityType!: string;

  @IsString()
  prefix!: string;

  @IsOptional()
  @IsString()
  dateFormat?: string;

  @IsOptional()
  @IsInt()
  nextSequenceNumber?: number;

  @IsOptional()
  @IsInt()
  zeroPadLength?: number;
}

export class ToggleFeatureFlagDto {
  @IsString()
  key!: string;

  @IsBoolean()
  isEnabled!: boolean;
}

export class ResetOrganizationDto {
  @IsString()
  confirmText!: string;

  @IsString()
  passwordConfirm!: string;
}

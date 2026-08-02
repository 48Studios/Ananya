import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsInt,
} from 'class-validator';

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

import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsObject,
} from 'class-validator';

export class UpdateDashboardLayoutDto {
  @IsArray()
  widgetsJson!: Array<{
    id: string;
    title: string;
    enabled: boolean;
    width: 'full' | 'half';
  }>;
}

export class CreateSavedViewDto {
  @IsString()
  module!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsObject()
  filtersJson?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  sortJson?: { field: string; direction: 'asc' | 'desc' };

  @IsOptional()
  @IsArray()
  columnsJson?: string[];

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class CreateFavoriteDto {
  @IsString()
  entityType!: string;

  @IsString()
  entityId!: string;

  @IsString()
  title!: string;

  @IsString()
  href!: string;
}

export class UpdateWorkspacePreferenceDto {
  @IsOptional()
  @IsString()
  defaultLandingPage?: string;

  @IsOptional()
  @IsString()
  tableDensity?: string;

  @IsOptional()
  @IsString()
  themePreference?: string;
}

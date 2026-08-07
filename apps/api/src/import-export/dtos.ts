import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsObject,
} from 'class-validator';

export interface UploadedFileObj {
  originalname: string;
  buffer: Buffer;
  size: number;
  mimetype?: string;
}

export enum ExportFormat {
  CSV = 'CSV',
  EXCEL = 'EXCEL',
  JSON = 'JSON',
}

export enum BulkActionType {
  DELETE = 'DELETE',
  ARCHIVE = 'ARCHIVE',
  UPDATE_STATUS = 'UPDATE_STATUS',
  ASSIGN_CATEGORY = 'ASSIGN_CATEGORY',
  ASSIGN_LOCATION = 'ASSIGN_LOCATION',
  ASSIGN_MANUFACTURER = 'ASSIGN_MANUFACTURER',
}

export class ExportRequestDto {
  @IsString()
  entityType!: string;

  @IsEnum(ExportFormat)
  format!: ExportFormat;

  @IsOptional()
  @IsArray()
  selectedIds?: string[];

  @IsOptional()
  @IsArray()
  columns?: string[];

  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;
}

export class ImportPreviewDto {
  @IsString()
  entityType!: string;

  @IsString()
  fileContent!: string; // Base64 or raw CSV text

  @IsOptional()
  @IsString()
  fileName?: string;
}

export class ExecuteImportDto {
  @IsString()
  entityType!: string;

  @IsObject()
  columnMapping!: Record<string, string>;

  @IsArray()
  rows!: Record<string, unknown>[];
}

export class BulkActionDto {
  @IsString()
  entityType!: string;

  @IsEnum(BulkActionType)
  action!: BulkActionType;

  @IsArray()
  ids!: string[];

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

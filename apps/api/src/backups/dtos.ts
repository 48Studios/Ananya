import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  Matches,
} from 'class-validator';

export const BACKUP_FORMAT_VERSION = '1';
export const BACKUP_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
export const CONFLICT_POLICIES = ['SKIP', 'UPDATE', 'ABORT'] as const;

export class BackupScopeDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tables?: string[];

  @IsOptional()
  @IsBoolean()
  includeDatabase?: boolean;

  @IsOptional()
  @IsBoolean()
  includeFiles?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  components?: string[];
}

export class CreateBackupDto {
  @IsString()
  @Matches(/^[\w .-]{1,255}$/)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['FULL', 'SELECTIVE'])
  type?: 'FULL' | 'SELECTIVE';

  @IsOptional()
  scope?: BackupScopeDto;

  @IsOptional()
  @IsBoolean()
  encrypted?: boolean;

  @IsOptional()
  @IsString()
  passphrase?: string;
}

export class CreateBackupJobDto {
  @IsString()
  @Matches(/^[\w .-]{1,255}$/)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(BACKUP_FREQUENCIES)
  frequency!: (typeof BACKUP_FREQUENCIES)[number];

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  timeOfDay!: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  scope?: BackupScopeDto;

  @IsOptional()
  @IsBoolean()
  encrypted?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  retentionMaxCount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  retentionMaxAgeDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  retryLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(86_400)
  retryInitialDelaySeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(86_400)
  retryMaxDelaySeconds?: number;

  @IsOptional()
  @IsBoolean()
  notifyOnSuccess?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOnFailure?: boolean;
}

export class PreviewRestoreDto {
  @IsOptional()
  @IsString()
  passphrase?: string;

  @IsOptional()
  scope?: BackupScopeDto;

  @IsOptional()
  @IsIn(CONFLICT_POLICIES)
  conflictPolicy?: (typeof CONFLICT_POLICIES)[number];
}

export class RestoreDto {
  @IsString()
  operationId!: string;

  @IsString()
  planHash!: string;

  @IsBoolean()
  confirmDestructive!: boolean;

  @IsOptional()
  @IsString()
  passphrase?: string;
}

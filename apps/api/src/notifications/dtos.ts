import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsObject,
} from 'class-validator';

export class CreateNotificationDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsString()
  module!: string;

  @IsString()
  type!: string; // 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'APPROVAL_REQUIRED' | 'LOW_STOCK'

  @IsString()
  title!: string;

  @IsString()
  message!: string;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsString()
  priority?: string; // 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
}

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsObject()
  categoriesJson?: Record<string, boolean>;

  @IsOptional()
  @IsString()
  priorityThreshold?: string;

  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  desktopEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  quietHoursEnabled?: boolean;

  @IsOptional()
  @IsString()
  quietHoursStart?: string;

  @IsOptional()
  @IsString()
  quietHoursEnd?: string;
}

export class CreateWorkflowDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  triggerType!: string;

  @IsArray()
  conditionsJson!: Array<{ field: string; operator: string; value: unknown }>;

  @IsArray()
  actionsJson!: Array<{ actionType: string; payload: Record<string, unknown> }>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class EvaluateWorkflowDto {
  @IsString()
  triggerType!: string;

  @IsObject()
  contextData!: Record<string, unknown>;
}

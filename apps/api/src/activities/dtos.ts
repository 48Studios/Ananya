import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
} from 'class-validator';
import { ActivityType } from '@ananya/crm';

export class CreateActivityDto {
  @IsString()
  @IsNotEmpty()
  type!: ActivityType;

  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsDateString()
  @IsNotEmpty()
  dueDate!: string;

  @IsString()
  @IsNotEmpty()
  owner!: string;

  @IsString()
  @IsOptional()
  relatedLeadId?: string;

  @IsString()
  @IsOptional()
  relatedAccountId?: string;

  @IsString()
  @IsOptional()
  relatedOpportunityId?: string;
}

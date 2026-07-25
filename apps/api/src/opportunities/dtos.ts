import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsDateString,
  Min,
} from 'class-validator';
import { OpportunityStage } from '@ananya/crm';

export class CreateOpportunityDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  leadId?: string;

  @IsString()
  @IsNotEmpty()
  crmAccountId!: string;

  @IsNumber()
  @Min(0)
  estimatedValue!: number;

  @IsDateString()
  @IsNotEmpty()
  expectedCloseDate!: string;

  @IsNumber()
  @IsOptional()
  probability?: number;
}

export class AdvanceOpportunityStageDto {
  @IsString()
  @IsNotEmpty()
  stage!: OpportunityStage;
}

export class CloseOpportunityLostDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { LeadSource } from '@ananya/crm';

export class CreateLeadDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  company!: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  source?: LeadSource;

  @IsString()
  @IsOptional()
  industry?: string;

  @IsString()
  @IsNotEmpty()
  owner!: string;
}

export class AssignLeadDto {
  @IsString()
  @IsNotEmpty()
  owner!: string;
}

export class DisqualifyLeadDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

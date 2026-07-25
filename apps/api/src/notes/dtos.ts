import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateNoteDto {
  @IsString()
  @IsNotEmpty()
  author!: string;

  @IsString()
  @IsNotEmpty()
  body!: string;

  @IsString()
  @IsOptional()
  leadId?: string;

  @IsString()
  @IsOptional()
  crmAccountId?: string;

  @IsString()
  @IsOptional()
  opportunityId?: string;

  @IsString()
  @IsOptional()
  activityId?: string;
}

import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateServiceNoteDto {
  @IsString()
  @IsOptional()
  serviceRequestId?: string;

  @IsString()
  @IsOptional()
  workOrderId?: string;

  @IsString()
  @IsOptional()
  warrantyClaimId?: string;

  @IsString()
  @IsNotEmpty()
  author!: string;

  @IsString()
  @IsNotEmpty()
  body!: string;
}

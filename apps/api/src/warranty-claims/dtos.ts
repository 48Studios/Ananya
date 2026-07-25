import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
} from 'class-validator';

export class CreateWarrantyClaimDto {
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsString()
  @IsOptional()
  serialNumber?: string;

  @IsDateString()
  @IsNotEmpty()
  purchaseDate!: string;

  @IsDateString()
  @IsNotEmpty()
  expiryDate!: string;

  @IsString()
  @IsNotEmpty()
  claimReason!: string;
}

export class DecisionNotesDto {
  @IsString()
  @IsOptional()
  notes?: string;
}

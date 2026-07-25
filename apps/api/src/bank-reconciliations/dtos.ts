import { IsString, IsNotEmpty, IsNumber, IsDateString } from 'class-validator';

export class CreateBankReconciliationDto {
  @IsString()
  @IsNotEmpty()
  bankAccountId!: string;

  @IsDateString()
  @IsNotEmpty()
  statementDate!: string;

  @IsNumber()
  openingBalance!: number;

  @IsNumber()
  closingBalance!: number;
}

export class AddBankTransactionDto {
  @IsDateString()
  @IsNotEmpty()
  transactionDate!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsNumber()
  amount!: number;
}

export class MatchTransactionDto {
  @IsString()
  @IsNotEmpty()
  transactionId!: string;

  @IsString()
  @IsNotEmpty()
  paymentId!: string;
}

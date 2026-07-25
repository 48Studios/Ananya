import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';
import { AccountType } from '@ananya/finance';

export class CreateAccountDto {
  @IsString()
  @IsNotEmpty()
  accountNumber!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  accountType!: AccountType;

  @IsString()
  @IsOptional()
  parentAccountId?: string;

  @IsString()
  @IsOptional()
  currency?: string;
}

export class UpdateAccountDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

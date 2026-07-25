import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';
import { ContactRole } from '@ananya/crm';

export class CreateCrmAccountDto {
  @IsString()
  @IsNotEmpty()
  companyName!: string;

  @IsString()
  @IsOptional()
  industry?: string;

  @IsString()
  @IsOptional()
  website?: string;

  @IsString()
  @IsOptional()
  billingAddress?: string;

  @IsString()
  @IsOptional()
  shippingAddress?: string;
}

export class AddContactDto {
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @IsString()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  role?: ContactRole;

  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;
}

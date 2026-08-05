import { IsString, IsEmail, IsOptional, IsBoolean } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  newPassword!: string;
}

export class ResetPasswordRequestDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  newPassword!: string;
}

export class CreateInvitationDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  roleId?: string;

  @IsOptional()
  @IsString()
  department?: string;
}

export class AcceptInvitationDto {
  @IsString()
  token!: string;

  @IsString()
  password!: string;

  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;
}

export class SetupOrganizationDto {
  @IsString()
  companyName!: string;

  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsEmail()
  adminEmail!: string;

  @IsString()
  adminPassword!: string;

  @IsString()
  adminFirstName!: string;

  @IsString()
  adminLastName!: string;

  @IsOptional()
  @IsString()
  supportPhone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  baseCurrency?: string;

  @IsOptional()
  @IsString()
  primaryTimezone?: string;
}

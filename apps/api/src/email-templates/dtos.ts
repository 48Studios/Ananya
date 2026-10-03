import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_BODY_LENGTH, MAX_SUBJECT_LENGTH } from './template-renderer';

export class EmailTemplateContentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_SUBJECT_LENGTH)
  subject!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_BODY_LENGTH)
  bodyHtml!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_BODY_LENGTH)
  bodyText!: string;
}

export class UpdateEmailTemplateDto extends EmailTemplateContentDto {
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  /**
   * Optimistic concurrency: the version the editor loaded. A mismatch means
   * another administrator saved in the meantime.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

export class PreviewEmailTemplateDto extends EmailTemplateContentDto {}

export class TestSendEmailTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SUBJECT_LENGTH)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_BODY_LENGTH)
  bodyHtml?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_BODY_LENGTH)
  bodyText?: string;
}

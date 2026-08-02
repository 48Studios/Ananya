import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsInt,
} from 'class-validator';

export class UploadDocumentDto {
  @IsString()
  entityType!: string;

  @IsString()
  entityId!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  fileName!: string;

  @IsString()
  fileContent!: string; // Base64 encoded or text payload

  @IsString()
  mimeType!: string;

  @IsInt()
  sizeBytes!: number;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isConfidential?: boolean;
}

export class CreateDocumentVersionDto {
  @IsString()
  fileName!: string;

  @IsString()
  fileContent!: string;

  @IsString()
  mimeType!: string;

  @IsInt()
  sizeBytes!: number;

  @IsOptional()
  @IsString()
  changelog?: string;
}

export class UpdateDocumentMetadataDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isConfidential?: boolean;
}

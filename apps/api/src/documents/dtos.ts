import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { DOCUMENT_TYPES } from './document-types';
import { SUPPORTED_DOCUMENT_ENTITY_TYPES } from './document-entities';
import { MAX_EXTERNAL_URL_LENGTH } from './document-url';
import { MAX_DOCUMENT_TAG_LENGTH } from './document-metadata';

/** Upper bound for free-text fields, aligned with the schema column widths. */
export const MAX_TITLE_LENGTH = 255;
export const MAX_DESCRIPTION_LENGTH = 2000;

/**
 * Uploaded file shape produced by `FileInterceptor` (multipart/form-data).
 *
 * Mirrors the interface the import/export module uses for the same purpose, so
 * both upload paths describe multer's in-memory file identically. Nothing here
 * is trusted: size and type are re-validated against
 * `document-file.ts` before anything is stored.
 */
export interface UploadedDocumentFile {
  originalname: string;
  buffer: Buffer;
  size: number;
  mimetype?: string;
}

/**
 * Multipart body of `POST /documents/upload`.
 *
 * File metadata (`file_name`, `mime_type`, `size_bytes`) is deliberately absent:
 * it is derived from the uploaded file rather than accepted from the client.
 * `tags` and `isConfidential` arrive as strings because multipart has no types;
 * the service normalises them with `document-metadata.ts`.
 */
export class UploadDocumentDto {
  @IsIn(SUPPORTED_DOCUMENT_ENTITY_TYPES)
  entityType!: string;

  @IsUUID()
  entityId!: string;

  @IsIn(DOCUMENT_TYPES)
  documentType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TITLE_LENGTH)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_DESCRIPTION_LENGTH)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  tags?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  isConfidential?: string;
}

/** JSON body of `POST /documents/external-url`. */
export class CreateExternalUrlDocumentDto {
  @IsIn(SUPPORTED_DOCUMENT_ENTITY_TYPES)
  entityType!: string;

  @IsUUID()
  entityId!: string;

  @IsIn(DOCUMENT_TYPES)
  documentType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TITLE_LENGTH)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_DESCRIPTION_LENGTH)
  description?: string;

  /**
   * Validated semantically by `validateExternalUrl` in the service, which also
   * reports *why* a URL was rejected. The DTO only enforces shape here.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_EXTERNAL_URL_LENGTH)
  url!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isConfidential?: boolean;
}

/**
 * JSON body of `PATCH /documents/:id`.
 *
 * Every field is optional; omitted fields keep their current value. The source
 * type is intentionally not editable: converting between an uploaded file and
 * an external reference is a different record, not a metadata edit.
 */
export class UpdateDocumentMetadataDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TITLE_LENGTH)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_DESCRIPTION_LENGTH)
  description?: string;

  @IsOptional()
  @IsIn(DOCUMENT_TYPES)
  documentType?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isConfidential?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_DOCUMENT_TAG_LENGTH * 50)
  externalUrl?: string;
}

/** Multipart body of `POST /documents/:id/version`. */
export class CreateDocumentVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_DESCRIPTION_LENGTH)
  changelog?: string;
}

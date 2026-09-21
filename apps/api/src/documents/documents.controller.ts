import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/permission.guard';
import { DocumentsService, type DocumentActor } from './documents.service';
import { DocumentFileInterceptor } from './document-upload.interceptor';
import { DocumentReadGuard, DocumentWriteGuard } from './document-permissions';
import {
  CreateDocumentVersionDto,
  CreateExternalUrlDocumentDto,
  UpdateDocumentMetadataDto,
  UploadDocumentDto,
  type UploadedDocumentFile,
} from './dtos';
import { buildContentDispositionHeader } from './document-file';

/**
 * Component documentation API.
 *
 * Every route requires an authenticated session (the repository's existing
 * header-token + permission mechanism, bound to the inventory permission
 * vocabulary):
 *  - reads need `Inventory.Read`
 *  - writes need `Inventory.Update`
 *
 * Actor identity always comes from the authenticated principal, never from the
 * request body. Stored files are served through the authenticated
 * `:id/download` and `:id/preview` routes rather than being exposed as a public
 * directory, so access is checked per request and filesystem paths are never
 * disclosed.
 */
@Controller('documents')
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  @Post('upload')
  @UseGuards(DocumentWriteGuard)
  @UseInterceptors(DocumentFileInterceptor)
  uploadDocument(
    @UploadedFile() file: UploadedDocumentFile | undefined,
    @Body() dto: UploadDocumentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.uploadDocument(dto, file, actorFrom(req));
  }

  @Post('external-url')
  @UseGuards(DocumentWriteGuard)
  createExternalUrlDocument(
    @Body() dto: CreateExternalUrlDocumentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.createExternalUrlDocument(dto, actorFrom(req));
  }

  @Get('entity/:entityType/:entityId')
  @UseGuards(DocumentReadGuard)
  getEntityDocuments(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.service.getEntityDocuments(entityType, entityId);
  }

  @Get(':id')
  @UseGuards(DocumentReadGuard)
  getDocument(@Param('id') id: string) {
    return this.service.getDocument(id);
  }

  @Get(':id/versions')
  @UseGuards(DocumentReadGuard)
  getDocumentVersions(@Param('id') id: string) {
    return this.service.getDocumentVersions(id);
  }

  /**
   * Downloads the stored file (or a specific revision).
   *
   * Rejected for external references: those have no bytes here and must be
   * opened at their own URL.
   */
  @Get(':id/download')
  @UseGuards(DocumentReadGuard)
  async downloadDocument(
    @Param('id') id: string,
    @Query('version') version: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.service.resolveFileContent(
      id,
      parseVersionQuery(version),
    );
    return sendFile(res, file, 'attachment');
  }

  /** Same bytes as download, presented inline for in-app preview. */
  @Get(':id/preview')
  @UseGuards(DocumentReadGuard)
  async previewDocument(
    @Param('id') id: string,
    @Query('version') version: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.service.resolveFileContent(
      id,
      parseVersionQuery(version),
    );
    return sendFile(res, file, 'inline');
  }

  @Patch(':id')
  @UseGuards(DocumentWriteGuard)
  updateMetadata(
    @Param('id') id: string,
    @Body() dto: UpdateDocumentMetadataDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.updateMetadata(id, dto, actorFrom(req));
  }

  @Post(':id/version')
  @UseGuards(DocumentWriteGuard)
  @UseInterceptors(DocumentFileInterceptor)
  createVersion(
    @Param('id') id: string,
    @Body() dto: CreateDocumentVersionDto,
    @UploadedFile() file: UploadedDocumentFile | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.createVersion(id, dto, file, actorFrom(req));
  }

  @Delete(':id')
  @UseGuards(DocumentWriteGuard)
  deleteDocument(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.service.deleteDocument(id, actorFrom(req));
  }
}

function actorFrom(req: AuthenticatedRequest): DocumentActor {
  return { id: req.user?.id, email: req.user?.email };
}

/**
 * `version` selects a historical revision. A malformed value is a client error
 * rather than a silent fallback to the current file, which could otherwise hand
 * back the wrong document.
 */
function parseVersionQuery(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new BadRequestException(
      'version must be a positive integer revision number.',
    );
  }
  return value;
}

function sendFile(
  res: Response,
  file: {
    buffer: Buffer;
    fileName: string;
    mimeType: string;
  },
  disposition: 'inline' | 'attachment',
): StreamableFile {
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Length', String(file.buffer.length));
  res.setHeader(
    'Content-Disposition',
    buildContentDispositionHeader(disposition, file.fileName),
  );
  // The resolved type is authoritative; never let a browser sniff something else.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  return new StreamableFile(file.buffer);
}

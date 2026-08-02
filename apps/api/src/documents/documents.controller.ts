import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { DocumentsService } from './documents.service';
import {
  UploadDocumentDto,
  CreateDocumentVersionDto,
  UpdateDocumentMetadataDto,
} from './dtos';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  @Post('upload')
  uploadDocument(@Body() dto: UploadDocumentDto) {
    return this.service.uploadDocument(dto);
  }

  @Get('entity/:entityType/:entityId')
  getEntityDocuments(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.service.getEntityDocuments(entityType, entityId);
  }

  @Get(':id')
  getDocument(@Param('id') id: string) {
    return this.service.getDocument(id);
  }

  @Post(':id/version')
  createVersion(
    @Param('id') id: string,
    @Body() dto: CreateDocumentVersionDto,
  ) {
    return this.service.createVersion(id, dto);
  }

  @Get(':id/versions')
  getDocumentVersions(@Param('id') id: string) {
    return this.service.getDocumentVersions(id);
  }

  @Patch(':id')
  updateMetadata(
    @Param('id') id: string,
    @Body() dto: UpdateDocumentMetadataDto,
  ) {
    return this.service.updateMetadata(id, dto);
  }

  @Delete(':id')
  deleteDocument(@Param('id') id: string) {
    return this.service.deleteDocument(id);
  }
}

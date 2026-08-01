import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ImportExportService } from './import-export.service';
import {
  ExportRequestDto,
  ImportPreviewDto,
  ExecuteImportDto,
  BulkActionDto,
} from './dtos';

@Controller('import-export')
export class ImportExportController {
  constructor(private readonly service: ImportExportService) {}

  @Get('template/:entityType')
  getTemplate(@Param('entityType') entityType: string) {
    return this.service.getTemplate(entityType);
  }

  @Post('import/preview')
  previewImport(@Body() dto: ImportPreviewDto) {
    return this.service.previewImport(dto);
  }

  @Post('import/execute')
  async executeImport(@Body() dto: ExecuteImportDto) {
    return this.service.executeImport(dto);
  }

  @Post('export')
  async executeExport(@Body() dto: ExportRequestDto) {
    return this.service.executeExport(dto);
  }

  @Get('jobs')
  async getJobs(@Query('userId') userId?: string) {
    return this.service.getJobs(userId);
  }

  @Post('bulk-action')
  async executeBulkAction(@Body() dto: BulkActionDto) {
    return this.service.executeBulkAction(dto);
  }
}

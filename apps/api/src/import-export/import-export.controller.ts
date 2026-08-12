import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportExportService } from './import-export.service';
import { ExportRequestDto, BulkActionDto, UploadedFileObj } from './dtos';

@Controller('import-export')
export class ImportExportController {
  private readonly logger = new Logger(ImportExportController.name);

  constructor(private readonly service: ImportExportService) {}

  @Get('template/:entityType')
  getTemplate(@Param('entityType') entityType: string) {
    return this.service.getTemplate(entityType);
  }

  @Get('template/:entityType/csv')
  getTemplateCsv(@Param('entityType') entityType: string, @Req() req: Request) {
    const csv = this.service.getTemplateCsv(entityType);
    if (req.res) {
      req.res.setHeader('Content-Type', 'text/csv');
      req.res.setHeader(
        'Content-Disposition',
        `attachment; filename="${entityType.toLowerCase()}_template.csv"`,
      );
    }
    return csv;
  }

  @Get('template/:entityType/xlsx')
  getTemplateXlsx(
    @Param('entityType') entityType: string,
    @Req() req: Request,
  ) {
    const xlsxContent = this.service.getTemplateXlsx(entityType);
    if (req.res) {
      req.res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      req.res.setHeader(
        'Content-Disposition',
        `attachment; filename="${entityType.toLowerCase()}_template.xlsx"`,
      );
    }
    return xlsxContent;
  }

  @Post('import/preview')
  @UseInterceptors(FileInterceptor('file'))
  previewImport(
    @UploadedFile() file: UploadedFileObj,
    @Body('entityType') entityType: string,
  ) {
    this.logger.log(
      `[IMPORT PREVIEW REQUEST] Received file: "${file?.originalname}", size: ${file?.size} bytes, mimetype: "${file?.mimetype}", entityType: "${entityType}"`,
    );

    if (!file || !file.buffer || file.size === 0) {
      throw new BadRequestException('No file uploaded or file is empty');
    }

    if (!entityType) {
      throw new BadRequestException('Missing required parameter: entityType');
    }

    return this.service.previewImport(file, entityType);
  }

  @Post('import/execute')
  @UseInterceptors(FileInterceptor('file'))
  async executeImport(
    @UploadedFile() file: UploadedFileObj,
    @Body('entityType') entityType: string,
    @Body('columnMapping') columnMappingStr: string,
    @Body('userId') bodyUserId?: string,
    @Req() req?: Request,
  ) {
    const headerUserId = req?.headers?.['x-user-id'];
    const userId =
      bodyUserId ||
      (typeof headerUserId === 'string' ? headerUserId : undefined);

    this.logger.log(
      `[IMPORT EXECUTE REQUEST] Received file: "${file?.originalname}", size: ${file?.size} bytes, entityType: "${entityType}", userId: "${userId || 'NONE'}"`,
    );

    if (!file || !file.buffer || file.size === 0) {
      throw new BadRequestException('No file uploaded or file is empty');
    }

    if (!entityType) {
      throw new BadRequestException('Missing required parameter: entityType');
    }

    let columnMapping: Record<string, string> = {};
    if (columnMappingStr) {
      try {
        columnMapping = JSON.parse(columnMappingStr) as Record<string, string>;
      } catch {
        this.logger.warn(
          `Failed to parse column mapping string: ${columnMappingStr}`,
        );
      }
    }

    return this.service.executeImport(file, entityType, columnMapping, userId);
  }

  @Post('export')
  async executeExport(@Body() dto: ExportRequestDto) {
    return await this.service.executeExport(dto);
  }

  @Get('jobs')
  async getJobs(@Query('userId') userId?: string) {
    return await this.service.getJobs(userId);
  }

  @Post('bulk-action')
  async executeBulkAction(@Body() dto: BulkActionDto) {
    return await this.service.executeBulkAction(dto);
  }
}

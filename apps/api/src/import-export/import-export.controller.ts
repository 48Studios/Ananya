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
  UnauthorizedException,
  UseGuards,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportExportService } from './import-export.service';
import { ExportRequestDto, ExportResponseDto, UploadedFileObj } from './dtos';
import {
  createPermissionGuard,
  type AuthenticatedRequest,
} from '../auth/permission.guard';

@Controller('import-export')
export class ImportExportController {
  private readonly logger = new Logger(ImportExportController.name);

  constructor(private readonly service: ImportExportService) {}

  @Get('template/:entityType')
  @UseGuards(
    createPermissionGuard('Inventory.Read', 'download import template'),
  )
  getTemplate(@Param('entityType') entityType: string) {
    return this.service.getTemplate(entityType);
  }

  @Get('template/:entityType/csv')
  @UseGuards(
    createPermissionGuard('Inventory.Read', 'download import template'),
  )
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
  @UseGuards(
    createPermissionGuard('Inventory.Read', 'download import template'),
  )
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
  @UseGuards(createPermissionGuard('Inventory.Update', 'preview import data'))
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
  @UseGuards(createPermissionGuard('Inventory.Update', 'execute data import'))
  @UseInterceptors(FileInterceptor('file'))
  async executeImport(
    @UploadedFile() file: UploadedFileObj,
    @Body('entityType') entityType: string,
    @Body('columnMapping') columnMappingStr: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Authentication is required.');
    }

    this.logger.log(
      `[IMPORT EXECUTE REQUEST] Received file: "${file?.originalname}", size: ${file?.size} bytes, entityType: "${entityType}", userId: "${userId}"`,
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
  @UseGuards(createPermissionGuard('Reports.Export', 'export system data'))
  async executeExport(
    @Body() dto: ExportRequestDto,
  ): Promise<ExportResponseDto> {
    return await this.service.executeExport(dto);
  }

  @Get('jobs')
  @UseGuards(createPermissionGuard('Inventory.Read', 'view import/export jobs'))
  async getJobs(@Query('userId') userId?: string) {
    return await this.service.getJobs(userId);
  }

  @Get('jobs/:id')
  @UseGuards(createPermissionGuard('Inventory.Read', 'view import/export jobs'))
  async getJob(@Param('id') id: string) {
    return await this.service.getJob(id);
  }

  @Post('jobs/:id/reverse')
  @UseGuards(createPermissionGuard('Inventory.Update', 'reverse import job'))
  async reverseImport(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Authentication is required.');
    }
    return await this.service.reverseImport(id, userId);
  }
}

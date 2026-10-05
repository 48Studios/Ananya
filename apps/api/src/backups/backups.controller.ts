import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/permission.guard';
import { createPermissionGuard } from '../auth/permission.guard';
import { BackupsService } from './backups.service';
import {
  CreateBackupDto,
  CreateBackupJobDto,
  PreviewRestoreDto,
  RestoreDto,
} from './dtos';

const BackupGuard = createPermissionGuard(
  'Administration.Settings',
  'manage backups',
);

@Controller('backups')
@UseGuards(BackupGuard)
export class BackupsController {
  constructor(private readonly service: BackupsService) {}

  @Get('artifacts')
  listArtifacts() {
    return this.service.listArtifacts();
  }

  @Post('artifacts')
  create(@Body() dto: CreateBackupDto, @Req() req: AuthenticatedRequest) {
    return this.service.createBackup(dto, req.user!.id);
  }

  @Get('artifacts/:id/download')
  async download(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const result = await this.service.download(id, req.user!.id);
    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.artifact.name.replace(/[^a-zA-Z0-9._-]/g, '_')}.archive"`,
    );
    return new StreamableFile(result.content);
  }

  @Delete('artifacts/:id')
  delete(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.service.delete(id, req.user!.id);
  }

  @Get('jobs')
  listJobs() {
    return this.service.listJobs();
  }

  @Post('jobs')
  createJob(@Body() dto: CreateBackupJobDto, @Req() req: AuthenticatedRequest) {
    return this.service.createJob(dto, req.user!.id);
  }

  @Put('jobs/:id')
  updateJob(
    @Param('id') id: string,
    @Body() dto: Partial<CreateBackupJobDto>,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.updateJob(id, dto, req.user!.id);
  }

  @Delete('jobs/:id')
  deleteJob(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.service.deleteJob(id, req.user!.id);
  }

  @Post('jobs/:id/pause')
  setJobEnabled(
    @Param('id') id: string,
    @Body('enabled') enabled: boolean,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.setJobEnabled(id, enabled, req.user!.id);
  }

  @Post('jobs/:id/run')
  runJob(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.service.runJob(id, req.user!.id);
  }

  @Get('jobs/:id/runs')
  getJobRuns(@Param('id') id: string) {
    return this.service.getJobRuns(id);
  }

  @Get('jobs/:id/details')
  getJobDetails(@Param('id') id: string) {
    return this.service.getJobDetails(id);
  }

  @Get('restores')
  listRestores() {
    return this.service.listRestoreOperations();
  }

  @Get('restores/:id')
  getRestore(@Param('id') id: string) {
    return this.service.getRestoreOperation(id);
  }

  @Post('restore/preview')
  @UseInterceptors(FileInterceptor('file'))
  preview(
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Body() dto: PreviewRestoreDto,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!file) throw new Error('An archive file is required.');
    return this.service.previewRestore(file.buffer, dto, req.user!.id);
  }

  @Post('restore/preview/:id')
  async previewArtifact(
    @Param('id') id: string,
    @Body() dto: PreviewRestoreDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const { content } = await this.service.download(id);
    return this.service.previewRestore(content, dto, req.user!.id);
  }

  @Post('restore')
  @UseInterceptors(FileInterceptor('file'))
  restore(
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Body() dto: RestoreDto,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!file) throw new Error('An archive file is required.');
    return this.service.restore(file.buffer, dto, req.user!.id);
  }

  @Post('restore/artifact/:id')
  async restoreArtifact(
    @Param('id') id: string,
    @Body() dto: RestoreDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const { content } = await this.service.download(id);
    return this.service.restore(content, dto, req.user!.id);
  }
}

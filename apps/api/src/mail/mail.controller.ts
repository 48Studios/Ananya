import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { MailService, type EmailStatus } from './mail.service';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('mail')
@UseGuards(createPermissionGuard('Administration.Settings'))
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Get('status')
  getStatus() {
    return this.mailService.getStatus();
  }

  @Post('verify')
  verify() {
    return this.mailService.verify();
  }

  @Get('outbox')
  listOutbox(
    @Query('status') status?: EmailStatus,
    @Query('limit') limit?: string,
  ) {
    return this.mailService.listOutbox({
      status,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
    });
  }

  @Get('outbox/counts')
  getOutboxCounts() {
    return this.mailService.getOutboxCounts();
  }

  @Post('outbox/process')
  processOutbox() {
    return this.mailService.processQueue();
  }
}

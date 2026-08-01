import { Controller, Get, Query } from '@nestjs/common';
import { SecurityAuditService } from './security-audit.service';

@Controller('security')
export class SecurityAuditController {
  constructor(private readonly auditService: SecurityAuditService) {}

  @Get('audit')
  getAuditLogs(
    @Query('category') category?: string,
    @Query('userId') userId?: string,
  ) {
    return this.auditService.getLogs(category, userId);
  }
}

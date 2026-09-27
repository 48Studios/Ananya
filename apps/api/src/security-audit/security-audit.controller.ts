import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SecurityAuditService } from './security-audit.service';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('security')
@UseGuards(
  createPermissionGuard('Administration.Security', 'view security audit logs'),
)
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

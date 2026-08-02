import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { WorkflowEngineService } from './workflow-engine.service';
import { NotificationsController } from './notifications.controller';
import { ActivityModule } from '../activity/activity.module';
import { SecurityAuditModule } from '../security-audit/security-audit.module';

@Module({
  imports: [ActivityModule, SecurityAuditModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, WorkflowEngineService],
  exports: [NotificationsService, WorkflowEngineService],
})
export class NotificationsModule {}

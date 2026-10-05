import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { SecurityAuditModule } from '../security-audit/security-audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailModule } from '../mail/mail.module';
import { BackupsController } from './backups.controller';
import { BackupsService } from './backups.service';
import { BackupsScheduler } from './backups.scheduler';
import { BackupsMetricsService } from './backups-metrics.service';

@Module({
  imports: [
    DocumentsModule,
    SecurityAuditModule,
    NotificationsModule,
    MailModule,
  ],
  controllers: [BackupsController],
  providers: [BackupsService, BackupsScheduler, BackupsMetricsService],
  exports: [BackupsService, BackupsMetricsService],
})
export class BackupsModule {}

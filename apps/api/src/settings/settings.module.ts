import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { OrganizationResetService } from './organization-reset.service';
import { SettingsController } from './settings.controller';
import { ActivityModule } from '../activity/activity.module';
import { SecurityAuditModule } from '../security-audit/security-audit.module';

@Module({
  imports: [ActivityModule, SecurityAuditModule],
  controllers: [SettingsController],
  providers: [SettingsService, OrganizationResetService],
  exports: [SettingsService, OrganizationResetService],
})
export class SettingsModule {}

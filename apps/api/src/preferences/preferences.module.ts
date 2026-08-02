import { Module } from '@nestjs/common';
import { PreferencesService } from './preferences.service';
import { PreferencesController } from './preferences.controller';
import { ActivityModule } from '../activity/activity.module';
import { SecurityAuditModule } from '../security-audit/security-audit.module';

@Module({
  imports: [ActivityModule, SecurityAuditModule],
  controllers: [PreferencesController],
  providers: [PreferencesService],
  exports: [PreferencesService],
})
export class PreferencesModule {}

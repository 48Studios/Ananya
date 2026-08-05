import { Module } from '@nestjs/common';
import { DataPacksService } from './data-packs.service';
import { DataPacksController } from './data-packs.controller';
import { ImportExportModule } from '../import-export/import-export.module';
import { SecurityAuditModule } from '../security-audit/security-audit.module';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [ImportExportModule, SecurityAuditModule, ActivityModule],
  controllers: [DataPacksController],
  providers: [DataPacksService],
  exports: [DataPacksService],
})
export class DataPacksModule {}

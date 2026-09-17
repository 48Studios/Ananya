import { Module } from '@nestjs/common';
import { DataPacksService } from './data-packs.service';
import { DataPacksController } from './data-packs.controller';
import { ImportExportModule } from '../import-export/import-export.module';
import { SecurityAuditModule } from '../security-audit/security-audit.module';
import { ActivityModule } from '../activity/activity.module';

import { AttributesModule } from '../attributes/attributes.module';
import { ComponentsModule } from '../components/components.module';

@Module({
  imports: [
    ImportExportModule,
    SecurityAuditModule,
    ActivityModule,
    AttributesModule,
    ComponentsModule,
  ],
  controllers: [DataPacksController],
  providers: [DataPacksService],
  exports: [DataPacksService],
})
export class DataPacksModule {}

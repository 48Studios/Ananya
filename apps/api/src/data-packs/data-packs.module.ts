import { forwardRef, Module } from '@nestjs/common';
import { DataPacksService } from './data-packs.service';
import { DataPacksController } from './data-packs.controller';
import { ImportExportModule } from '../import-export/import-export.module';
import { SecurityAuditModule } from '../security-audit/security-audit.module';
import { ActivityModule } from '../activity/activity.module';

import { AttributesModule } from '../attributes/attributes.module';

@Module({
  imports: [
    // Deferred edge of the Components -> Ml -> DataPacks -> ImportExport ->
    // Components cycle; see import-export.module.ts.
    forwardRef(() => ImportExportModule),
    SecurityAuditModule,
    ActivityModule,
    AttributesModule,
  ],
  controllers: [DataPacksController],
  providers: [DataPacksService],
  exports: [DataPacksService],
})
export class DataPacksModule {}

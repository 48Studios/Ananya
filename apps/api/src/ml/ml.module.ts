import { Module } from '@nestjs/common';
import { MlClientService } from './ml-client.service';
import { MlService } from './ml.service';
import { MlController } from './ml.controller';
import { ComponentReviewQueueController } from './component-review-queue.controller';
import { ComponentReviewQueueService } from './component-review-queue.service';
import { ComponentReviewAnalyzer } from './component-review-analyzer';
import { ComponentReviewApplyService } from './component-review-apply.service';

import { DataPacksModule } from '../data-packs/data-packs.module';
import { SecurityAuditModule } from '../security-audit/security-audit.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { ComponentWriteGuard } from '../auth/component-write.guard';

@Module({
  imports: [
    DataPacksModule,
    SecurityAuditModule,
    AuthModule,
    PermissionsModule,
  ],
  controllers: [MlController, ComponentReviewQueueController],
  providers: [
    MlClientService,
    MlService,
    ComponentReviewQueueService,
    ComponentReviewAnalyzer,
    ComponentReviewApplyService,
    ComponentWriteGuard,
  ],
  exports: [MlService, MlClientService, ComponentReviewQueueService],
})
export class MlModule {}

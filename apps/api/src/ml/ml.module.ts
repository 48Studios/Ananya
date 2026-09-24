import { forwardRef, Module } from '@nestjs/common';
import { MlClientService } from './ml-client.service';
import { MlService } from './ml.service';
import { MlController } from './ml.controller';
import { ComponentReviewQueueController } from './component-review-queue.controller';
import { ComponentReviewQueueService } from './component-review-queue.service';
import { ComponentReviewAnalyzer } from './component-review-analyzer';
import { ComponentReviewApplyService } from './component-review-apply.service';
import { ComponentConsolidationPreviewService } from './component-consolidation-preview.service';
import { ComponentConsolidationService } from './component-consolidation/component-consolidation.service';
import { ConsolidationLockService } from './component-consolidation/consolidation-lock.service';
import { ConsolidationRepository } from './component-consolidation/component-consolidation.repository';

import { DataPacksModule } from '../data-packs/data-packs.module';
import { SecurityAuditModule } from '../security-audit/security-audit.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { ComponentWriteGuard } from '../auth/component-write.guard';
import {
  AttributeReadGuard,
  AttributeWriteGuard,
} from '../auth/attribute-permissions';
import { DocumentsModule } from '../documents/documents.module';
import { ActivityModule } from '../activity/activity.module';
import { DocumentationAnalysisService } from './documentation-analysis.service';
import { DocumentationIntelligenceController } from './documentation-intelligence.controller';
import { ComponentSpecificationIntelligenceService } from './component-specification-intelligence.service';
import { ComponentSpecificationIntelligenceController } from './component-specification-intelligence.controller';
import { AttributeFindingRepository } from './attribute-findings/attribute-finding.repository';
import { AttributeIntelligenceFindingsService } from './attribute-findings/attribute-finding.service';
import { AttributeIntelligenceAuditService } from './attribute-findings/attribute-intelligence-audit.service';
import { AttributeReviewQueueService } from './attribute-findings/attribute-review-queue.service';
import { AttributeReviewQueueController } from './attribute-findings/attribute-review-queue.controller';
import { AttributeReviewApplyService } from './attribute-findings/attribute-review-apply.service';
import { MlAdminGuard } from '../auth/ml-permissions';
import { MlOpsController } from './ops/ml-ops.controller';
import { MlOpsService } from './ops/ml-ops.service';
import { MlOpsRepository } from './ops/ml-ops.repository';

@Module({
  imports: [
    // Deferred edge of the Components -> Ml -> DataPacks -> ImportExport ->
    // Components cycle; see import-export.module.ts.
    forwardRef(() => DataPacksModule),
    SecurityAuditModule,
    // Documentation Intelligence reads document bytes through the existing
    // storage abstraction and reuses the documentation permission guards, so
    // the dependency points at the documents module (which has no ML import).
    DocumentsModule,
    AuthModule,
    PermissionsModule,
    ActivityModule,
  ],
  controllers: [
    MlController,
    ComponentReviewQueueController,
    DocumentationIntelligenceController,
    ComponentSpecificationIntelligenceController,
    AttributeReviewQueueController,
    MlOpsController,
  ],
  providers: [
    MlClientService,
    MlService,
    ComponentReviewQueueService,
    ComponentReviewAnalyzer,
    ComponentReviewApplyService,
    ComponentConsolidationPreviewService,
    ComponentConsolidationService,
    ConsolidationLockService,
    ConsolidationRepository,
    ComponentWriteGuard,
    DocumentationAnalysisService,
    ComponentSpecificationIntelligenceService,
    // Attribute Intelligence findings substrate (Pass 1) and the persisted
    // review queue built on it (Pass 2 analyzer + Pass 3 secured API).
    AttributeFindingRepository,
    AttributeIntelligenceFindingsService,
    AttributeIntelligenceAuditService,
    AttributeReviewQueueService,
    AttributeReviewApplyService,
    AttributeReadGuard,
    AttributeWriteGuard,
    // ML Operations control plane: training runs, model versions and deployments.
    MlOpsRepository,
    MlOpsService,
    MlAdminGuard,
  ],
  exports: [
    MlService,
    MlClientService,
    ComponentReviewQueueService,
    ComponentConsolidationPreviewService,
    ComponentConsolidationService,
    ComponentSpecificationIntelligenceService,
    AttributeIntelligenceFindingsService,
    AttributeIntelligenceAuditService,
    AttributeReviewQueueService,
    AttributeReviewApplyService,
    MlOpsService,
  ],
})
export class MlModule {}

import { Module } from '@nestjs/common';
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
import { DocumentsModule } from '../documents/documents.module';
import { ActivityModule } from '../activity/activity.module';
import { DocumentationAnalysisService } from './documentation-analysis.service';
import { DocumentationIntelligenceController } from './documentation-intelligence.controller';
import { ComponentSpecificationIntelligenceService } from './component-specification-intelligence.service';
import { ComponentSpecificationIntelligenceController } from './component-specification-intelligence.controller';
import { AttributeFindingRepository } from './attribute-findings/attribute-finding.repository';
import { AttributeIntelligenceFindingsService } from './attribute-findings/attribute-finding.service';

@Module({
  imports: [
    DataPacksModule,
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
    // Attribute Intelligence findings substrate (Pass 1). No controller is
    // registered for it: the persisted-findings foundation is internal until a
    // guarded review route is added in a later pass.
    AttributeFindingRepository,
    AttributeIntelligenceFindingsService,
  ],
  exports: [
    MlService,
    MlClientService,
    ComponentReviewQueueService,
    ComponentConsolidationPreviewService,
    ComponentConsolidationService,
    ComponentSpecificationIntelligenceService,
    AttributeIntelligenceFindingsService,
  ],
})
export class MlModule {}

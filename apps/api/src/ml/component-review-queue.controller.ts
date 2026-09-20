import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ComponentReviewQueueService } from './component-review-queue.service';
import { ComponentReviewAnalyzer } from './component-review-analyzer';
import { ComponentReviewApplyService } from './component-review-apply.service';
import { ComponentConsolidationPreviewService } from './component-consolidation-preview.service';
import { ComponentConsolidationService } from './component-consolidation/component-consolidation.service';
import {
  ComponentWriteGuard,
  type AuthenticatedRequest,
} from '../auth/component-write.guard';
import {
  ListComponentFindingsQueryDto,
  MarkComponentFindingsStaleDto,
  PersistComponentFindingsDto,
  RecordComponentFindingDecisionDto,
  RunComponentAuditDto,
} from './component-review-queue.dtos';
import { ApplyComponentFindingDto } from './component-review-apply.dtos';
import { ConsolidationPreviewRequestDto } from './component-consolidation.dtos';
import { ConsolidationExecutionRequestDto } from './component-consolidation/component-consolidation.execution.dtos';

/**
 * Component Intelligence Review Queue.
 *
 * The queue is a persisted review workflow, so every route that changes
 * persisted state is protected by {@link ComponentWriteGuard} (authenticated
 * session + `Inventory.Update`). The two `GET` routes stay open, matching the
 * rest of the API's read endpoints.
 *
 * Reviewer identity always comes from the authenticated principal
 * (`request.user`), never from the request body.
 */
@Controller('ml/components/review-queue')
export class ComponentReviewQueueController {
  constructor(
    private readonly reviewQueueService: ComponentReviewQueueService,
    private readonly analyzer: ComponentReviewAnalyzer,
    private readonly applyService: ComponentReviewApplyService,
    private readonly consolidationPreview: ComponentConsolidationPreviewService,
    private readonly consolidationService: ComponentConsolidationService,
  ) {}

  @Get()
  listFindings(@Query() query: ListComponentFindingsQueryDto) {
    return this.reviewQueueService.listFindings(query);
  }

  /**
   * Runs a manual component audit, which creates, refreshes, and stales
   * persisted intelligence findings.
   */
  @Post('audit')
  @UseGuards(ComponentWriteGuard)
  runAudit(@Body() dto: RunComponentAuditDto) {
    return this.analyzer.runAudit(dto);
  }

  @Post('findings')
  @UseGuards(ComponentWriteGuard)
  persistFindings(@Body() dto: PersistComponentFindingsDto) {
    return this.reviewQueueService.persistFindings(dto.findings);
  }

  @Post('mark-stale')
  @UseGuards(ComponentWriteGuard)
  markFindingsStale(@Body() dto: MarkComponentFindingsStaleDto) {
    return this.reviewQueueService.markFindingsStale(dto);
  }

  @Get(':id')
  getFinding(@Param('id') id: string) {
    return this.reviewQueueService.getFinding(id);
  }

  /**
   * Builds a consolidation preview for a duplicate finding.
   *
   * The preview analyses every registered component dependency, computes
   * conflicts, and reports exactly what would change and what still blocks.
   * It is READ-ONLY: it never mutates component data, inventory, references or
   * findings. Supplying the resolutions the reviewer has already made lets it
   * recompute whether anything is still undecided.
   *
   * Protected by the same write permission as component edits and audit runs,
   * because the endpoint analyses data that only component-editing roles should
   * be able to inspect in this depth.
   */
  @Post(':id/consolidation-preview')
  @UseGuards(ComponentWriteGuard)
  buildConsolidationPreview(
    @Param('id') id: string,
    @Body() dto: ConsolidationPreviewRequestDto,
  ) {
    return this.consolidationPreview.buildPreview(
      id,
      dto.canonicalComponentId,
      undefined,
      {
        attributeResolutions: (dto.attributeResolutions ?? []).map(
          (resolution) => ({
            attributeDefinitionId: resolution.attributeDefinitionId,
            strategy: resolution.strategy,
          }),
        ),
        bomResolutions: (dto.bomResolutions ?? []).map((resolution) => ({
          bomId: resolution.bomId,
        })),
      },
    );
  }

  /**
   * Executes a consolidation.
   *
   * The backend recomputes the preview inside the consolidation transaction,
   * verifies the fingerprint the reviewer approved, and then retires the source
   * component(s) into the canonical one. Everything — component lifecycle, the
   * inventory ledger and projections, reservations, batches, serials, BOMs,
   * attributes, supplier mappings, polymorphic references, findings and the
   * consolidation record — commits together or not at all.
   *
   * Requires `Inventory.Update` and an explicit `confirmation: true`. Reviewer
   * identity comes from the authenticated principal, never the body.
   */
  @Post(':id/consolidate')
  @UseGuards(ComponentWriteGuard)
  consolidate(
    @Param('id') id: string,
    @Body() dto: ConsolidationExecutionRequestDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.consolidationService.consolidate(id, dto, req.user);
  }

  /**
   * Records a review lifecycle decision (ACCEPTED / REJECTED / DISMISSED).
   *
   * This is a decision only: it does not apply the suggestion to the component.
   * The reviewer is taken from the authenticated session.
   */
  @Post(':id/decision')
  @UseGuards(ComponentWriteGuard)
  recordDecision(
    @Param('id') id: string,
    @Body() dto: RecordComponentFindingDecisionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reviewQueueService.recordDecision(id, dto, req.user);
  }

  /**
   * Applies an accepted suggestion to the component, then marks the finding
   * ACCEPTED. Only the six supported identity/classification finding types are
   * applicable; duplicate findings are review-only and are refused here.
   *
   * Requires an authenticated session holding `Inventory.Update`, the same
   * permission that gates component master-data edits. Reviewer identity is
   * taken from the authenticated principal; request-body identity is ignored.
   */
  @Post(':id/apply')
  @UseGuards(ComponentWriteGuard)
  applyFinding(
    @Param('id') id: string,
    @Body() dto: ApplyComponentFindingDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.applyService.applyFinding(id, dto, req.user);
  }
}

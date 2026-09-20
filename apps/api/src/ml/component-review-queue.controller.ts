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

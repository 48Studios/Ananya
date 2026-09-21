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
import {
  AttributeReadGuard,
  AttributeWriteGuard,
} from '../../auth/attribute-permissions';
import type { AuthenticatedRequest } from '../../auth/permission.guard';
import { AttributeReviewQueueService } from './attribute-review-queue.service';
import {
  ListAttributeFindingsQueryDto,
  MarkAttributeFindingsStaleDto,
  RecordAttributeFindingDecisionDto,
  RunAttributeAuditDto,
  type AttributeReviewQueuePageDto,
} from './attribute-review-queue.dtos';
import type { AttributeFindingDto } from './attribute-finding.dtos';

/**
 * Attribute Intelligence Review Queue.
 *
 * The authoritative review surface for attribute-library findings. The existing
 * intelligence producer still decides *what* is worth reviewing; this controller
 * exposes the findings that were persisted from it, so opening the queue is a read
 * rather than a re-analysis.
 *
 * Authorization:
 *
 *  - reads (queue page, finding detail) need `Inventory.Read` and are guarded, so
 *    the review data is not readable by an unauthenticated caller
 *  - writes (audit, decision, mark-stale) need `Inventory.Update`, matching
 *    component edits, documentation writes and the component review queue
 *
 * Reviewer identity always comes from the authenticated principal
 * (`request.user`). No request DTO has a reviewer field, and the global
 * validation pipe rejects unknown properties, so a body cannot assert an
 * identity.
 *
 * Nothing here mutates attribute data. `ACCEPTED` records that a human approved a
 * finding; applying a finding is a later pass.
 */
@Controller('ml/attributes/review-queue')
export class AttributeReviewQueueController {
  constructor(private readonly reviewQueue: AttributeReviewQueueService) {}

  /**
   * Reads a page of persisted findings.
   *
   * This is a pure read: it never runs the producer, never creates findings and
   * never reconciles. Filters, pagination and counts all come from
   * `attribute_intelligence_findings`.
   */
  @Get()
  @UseGuards(AttributeReadGuard)
  listFindings(
    @Query() query: ListAttributeFindingsQueryDto,
  ): Promise<AttributeReviewQueuePageDto> {
    return this.reviewQueue.listFindings({
      status: query.status,
      issueType: query.issueType,
      issueCategory: query.issueCategory,
      confidenceLevel: query.confidenceLevel,
      attributeDefinitionId: query.attributeDefinitionId,
      categoryId: query.categoryId,
      relatedAttributeDefinitionId: query.relatedAttributeDefinitionId,
      source: query.source,
      search: query.search,
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
    });
  }

  /**
   * Runs the existing attribute-library audit and persists its findings.
   *
   * The audit is the ONLY route that invokes intelligence. It requires
   * `Inventory.Update` because it creates and stales persisted review state that
   * other reviewers see. A second concurrent audit is refused with 409.
   *
   * The body must be empty: the audit is whole-library, and the empty DTO is what
   * rejects a caller who passes a scope field in the belief that it scopes the run.
   */
  @Post('audit')
  @UseGuards(AttributeWriteGuard)
  runAudit(@Body() dto: RunAttributeAuditDto) {
    return this.reviewQueue.runAudit(dto);
  }

  /**
   * Marks findings stale.
   *
   * Narrow lifecycle maintenance, not a re-analysis: it does not run the producer.
   * Terminal decisions are never touched.
   */
  @Post('mark-stale')
  @UseGuards(AttributeWriteGuard)
  markFindingsStale(@Body() dto: MarkAttributeFindingsStaleDto) {
    return this.reviewQueue.markFindingsStale({
      ids: dto.ids,
      attributeDefinitionId: dto.attributeDefinitionId,
      categoryId: dto.categoryId,
      reason: dto.reason,
    });
  }

  /** Reads one persisted finding with its evidence and expected state. */
  @Get(':id')
  @UseGuards(AttributeReadGuard)
  getFinding(@Param('id') id: string): Promise<AttributeFindingDto> {
    return this.reviewQueue.getFinding(id);
  }

  /**
   * Records a review decision (ACCEPTED / REJECTED / DISMISSED).
   *
   * A decision only. It does NOT create or remove a binding, create an option,
   * rename an attribute, or touch a component value — applying a finding is a
   * later pass. The reviewer is taken from the authenticated session.
   */
  @Post(':id/decision')
  @UseGuards(AttributeWriteGuard)
  recordDecision(
    @Param('id') id: string,
    @Body() dto: RecordAttributeFindingDecisionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<AttributeFindingDto> {
    return this.reviewQueue.recordDecision(
      id,
      {
        decision: dto.decision,
        decisionNotes: dto.decisionNotes,
        expectedFingerprint: dto.expectedFingerprint,
        finalValue: dto.finalValue,
      },
      req.user,
    );
  }
}

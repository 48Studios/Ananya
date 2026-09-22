import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  DEFAULT_ATTRIBUTE_QUEUE_PAGE_SIZE,
  MAX_ATTRIBUTE_QUEUE_PAGE_SIZE,
  type AttributeFindingDto,
  type AttributeFindingListQuery,
  type AttributeFindingQueuePage,
  type AttributeFindingReviewer,
  type RecordAttributeFindingDecisionInput,
} from './attribute-finding.dtos';
import { AttributeIntelligenceFindingsService } from './attribute-finding.service';
import { AttributeIntelligenceAuditService } from './attribute-intelligence-audit.service';
import type { AttributeAuditPersistenceResult } from './attribute-audit.dtos';
import type {
  AttributeReviewQueueCounts,
  AttributeReviewQueuePageDto,
  RunAttributeAuditDto,
} from './attribute-review-queue.dtos';

/**
 * HTTP-facing service for the Attribute Intelligence review queue.
 *
 * Two responsibilities, both of which belong at the transport boundary rather
 * than in the findings substrate:
 *
 *  1. **Projection.** The API returns a page with `items`/`page`/`pageSize`/
 *     `total`/`totalPages`/`counts`; the findings service returns a filtered page
 *     plus a summary. Mapping one onto the other here keeps the substrate free of
 *     HTTP naming decisions.
 *  2. **Concurrency policy for audit runs.** An audit is a whole-library sweep;
 *     letting two run at once duplicates work and lets their reconciliations race
 *     over the same rows.
 *
 * It contains no intelligence and no persistence of its own: every read and write
 * is delegated to the Pass 1/2 services, so there is exactly one implementation
 * of the workflow, the staleness rules and the audit.
 *
 * Reads never run the producer. `listFindings`/`getFinding` touch only
 * `attribute_intelligence_findings`; the producer runs only from
 * {@link runAudit}, which is an explicit, guarded action.
 */
@Injectable()
export class AttributeReviewQueueService {
  private readonly logger = new Logger(AttributeReviewQueueService.name);

  /**
   * In-flight audit guard.
   *
   * Mirrors `DocumentationAnalysisService`'s per-document guard: an in-process
   * set is enough for a single-node deployment, and the alternative (distributed
   * locking) is explicitly out of scope. A second concurrent whole-library audit
   * is refused with 409 rather than queued, because the reviewer can simply wait
   * and the run is fast.
   */
  private auditInFlight = false;

  constructor(
    private readonly findingsService: AttributeIntelligenceFindingsService,
    private readonly auditService: AttributeIntelligenceAuditService,
  ) {}

  /**
   * Reads a page of persisted findings.
   *
   * A pure read: no audit, no producer, no finding creation. Opening the queue
   * therefore costs one indexed query (plus the two count queries), independent of
   * how expensive the intelligence is.
   */
  async listFindings(
    query: AttributeFindingListQuery = {},
  ): Promise<AttributeReviewQueuePageDto> {
    const page: AttributeFindingQueuePage =
      await this.findingsService.listFindings(query);

    // The page's own summary already ignores the status filter (so tab counts show
    // true totals while the list shows one status), so the counts are projected
    // from it rather than re-queried.
    const byIssueType = await this.findingsService.countByIssueType(query);

    const counts: AttributeReviewQueueCounts = {
      total: page.summary.total,
      pending: page.summary.pending,
      accepted: page.summary.accepted,
      rejected: page.summary.rejected,
      dismissed: page.summary.dismissed,
      stale: page.summary.stale,
      byCategory: page.summary.byCategory,
      byIssueType,
      applicationResults: {
        NOT_APPLIED: page.summary.applicationResults.NOT_APPLIED ?? 0,
        APPLIED: page.summary.applicationResults.APPLIED ?? 0,
      },
      readyToApply: page.summary.readyToApply,
    };

    return {
      items: page.items,
      page: page.page,
      pageSize: page.pageSize,
      total: page.total,
      // Guarded because an unbounded read reports the rows it returned: a queue
      // with no findings would otherwise divide by zero.
      totalPages:
        page.pageSize > 0
          ? Math.max(1, Math.ceil(page.total / page.pageSize))
          : 1,
      counts,
    };
  }

  /** Reads one persisted finding, or 404s. */
  getFinding(id: string): Promise<AttributeFindingDto> {
    return this.findingsService.getFinding(id);
  }

  /**
   * Records a review decision.
   *
   * This is a decision only. `ACCEPTED` means a human approved the finding; it
   * does not create a binding, remove one, rename an attribute, create an option,
   * or touch a component value. Applying a finding is a later pass with its own
   * guards.
   *
   * The reviewer comes from the authenticated principal, never the body, and the
   * staleness/transition rules stay in the findings service so the controller
   * cannot drift from them.
   */
  recordDecision(
    id: string,
    input: RecordAttributeFindingDecisionInput,
    reviewer?: AttributeFindingReviewer,
  ): Promise<AttributeFindingDto> {
    return this.findingsService.recordDecision(id, input, reviewer);
  }

  /**
   * Marks findings stale.
   *
   * Narrowly scoped lifecycle maintenance for a subject a caller knows changed, as
   * opposed to a re-analysis: it does not run the producer and does not reconcile
   * by scope. Terminal decisions are never touched (the substrate enforces that).
   */
  markFindingsStale(input: {
    ids?: string[];
    attributeDefinitionId?: string;
    categoryId?: string;
    reason?: string;
  }): Promise<{ staledCount: number }> {
    return this.findingsService.markFindingsStale(input);
  }

  /**
   * Runs the existing audit and persists its findings.
   *
   * Delegates entirely to the Pass 2 analyzer, which runs the already-selected
   * producer, normalizes its output and reconciles the scope. This method adds two
   * things: the in-flight guard, and a refusal to accept parameters the audit does
   * not honour.
   *
   * The request is validated by the route's DTO (so an unknown HTTP field is a 400
   * before reaching here); this check exists so a direct service caller cannot
   * silently believe it scoped a run that is in fact whole-library.
   */
  async runAudit(
    request: RunAttributeAuditDto = {},
  ): Promise<AttributeAuditPersistenceResult> {
    const supplied = Object.keys(request);
    if (supplied.length > 0) {
      throw new BadRequestException(
        `The attribute library audit takes no parameters; received: ${supplied.join(', ')}.`,
      );
    }

    if (this.auditInFlight) {
      throw new ConflictException(
        'An attribute library audit is already running. Wait for it to finish before starting another.',
      );
    }

    this.auditInFlight = true;
    try {
      return await this.auditService.runAudit();
    } finally {
      this.auditInFlight = false;
    }
  }

  /** Whether an audit is currently running, for diagnostics and tests. */
  isAuditRunning(): boolean {
    return this.auditInFlight;
  }
}

/**
 * Clamp helper mirroring the repository's own page bounds.
 *
 * Exported so the controller and the tests agree on the ceiling without either
 * one repeating the number.
 */
export function clampAttributeQueuePageSize(pageSize?: number): number {
  return Math.min(
    MAX_ATTRIBUTE_QUEUE_PAGE_SIZE,
    Math.max(1, pageSize ?? DEFAULT_ATTRIBUTE_QUEUE_PAGE_SIZE),
  );
}

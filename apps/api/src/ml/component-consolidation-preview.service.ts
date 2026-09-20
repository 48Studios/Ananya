import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { db, type DbExecutor } from '@ananya/database';
import {
  aiSuggestionFeedback,
  categories,
  componentIntelligenceFindings,
  components,
  inventoryProjections,
  inventoryTransactions,
  manufacturers,
} from '@ananya/database/schema';
import { inArray, or, sql } from '@ananya/database/query';
import {
  analyzeComponentDependencies,
  type DependencyAnalysis,
} from './component-consolidation-dependencies';
import {
  compareCategoryRelation,
  compareManufacturerIdentity,
  manufacturerIdentityName,
  resolveManufacturerIdentity,
  buildManufacturerIdentityIndex,
  type ManufacturerIdentityIndex,
} from './component-duplicate-intelligence';
import {
  compareComponentAttributes,
  loadAllAttributeValues,
  type AttributeComparisonEntry,
} from './component-attribute-values.loader';
import {
  ComponentReviewQueueService,
  stableStringify,
  type ComponentReviewFindingDto,
} from './component-review-queue.service';
import { COMPONENT_REVIEW_INTELLIGENCE_VERSION } from './component-review-analyzer';
import { DataPacksService } from '../data-packs/data-packs.service';
import type { ManufacturerHintTerm } from './component-duplicate-intelligence';
import {
  CONSOLIDATION_PREVIEW_VERSION,
  type ConsolidationAttributesDto,
  type ConsolidationAttributeEntryDto,
  type ConsolidationBomImpactDto,
  type ConsolidationCanonicalCandidateDto,
  type ConsolidationCategoryDto,
  type ConsolidationComponentSummaryDto,
  type ConsolidationConflictCode,
  type ConsolidationConflictDto,
  type ConsolidationDependencyDto,
  type ConsolidationEligibilityReason,
  type ConsolidationHistoryDto,
  type ConsolidationInventoryDto,
  type ConsolidationManufacturerDto,
  type ConsolidationPolymorphicReferenceDto,
  type ConsolidationPreviewDto,
  type ConsolidationProposedChangeDto,
  type ConsolidationReferenceSummaryDto,
  type ConsolidationResolutionContext,
  type ConsolidationRetirementDto,
  type ConsolidationSeverity,
} from './component-consolidation.dtos';
import { POLYMORPHIC_REFERENCE_POLICIES } from './component-consolidation/polymorphic-references';

/**
 * Consolidation preview service (Pass 6A).
 *
 * READ-ONLY BY CONTRACT. This service answers:
 *
 *   "Given this duplicate finding, what would consolidation affect, what
 *    conflicts exist, and exactly why is execution currently blocked?"
 *
 * It performs `SELECT`s only. There is no execute endpoint, no update, no
 * delete, and no inventory or ledger mutation anywhere in this module. The
 * `executable` field of every response is the literal `false`.
 *
 * Execution is blocked by design in this pass: Phase 0 established that BOM
 * duplicate-line semantics, cross-subsystem atomicity, polymorphic reference
 * semantics and component retirement semantics are all unresolved (§35 stop
 * conditions). Those blockers are reported as BLOCKING conflicts rather than
 * being hidden behind a UI that looks complete.
 */

const CONFLICT_SEVERITIES: Record<
  ConsolidationConflictCode,
  ConsolidationSeverity
> = {
  FINDING_NOT_ELIGIBLE: 'BLOCKING',
  MANUFACTURER_CONFLICT: 'BLOCKING',
  CATEGORY_INCOMPATIBLE: 'BLOCKING',
  ATTRIBUTE_VALUE_DIFFERENCE: 'BLOCKING',
  ATTRIBUTE_SOURCE_ONLY_VALUE: 'BLOCKING',
  // Related categories do not require a decision: the surviving record keeps its
  // own category and consolidation never moves it.
  CATEGORY_HIERARCHY_RECONCILIATION: 'INFORMATIONAL',
  CATEGORY_UNASSIGNED: 'INFORMATIONAL',
  EXISTING_CANONICAL_ATTRIBUTES: 'INFORMATIONAL',
  SUPPLIER_REFERENCE_DUPLICATION: 'BLOCKING',
  // The ledger move is a supported operation; this is reported, not blocking.
  INVENTORY_PRESENT: 'WARNING',
  // Opening balances recorded as `InitialStock` are invisible to
  // `CalculateInventoryProjection`, which is the calculator behind the
  // projections that reservations, MRP and consolidation itself read. The
  // quantity therefore cannot be moved, so this blocks.
  INITIAL_STOCK_UNSUPPORTED: 'BLOCKING',
  BATCH_COLLISION: 'BLOCKING',
  SERIAL_COLLISION: 'BLOCKING',
  // Open reservations are repointed; the adapter proves the availability
  // invariant holds, so this needs no policy decision.
  ACTIVE_RESERVATION_REQUIRES_POLICY: 'WARNING',
  OPEN_PROCUREMENT_REFERENCE: 'BLOCKING',
  BOM_COLLISION: 'BLOCKING',
  BOM_REFERENCE_REQUIRES_POLICY: 'WARNING',
  ATOMICITY_UNAVAILABLE: 'BLOCKING',
  UNSUPPORTED_RETIREMENT_STATE: 'BLOCKING',
  UNSUPPORTED_POLYMORPHIC_REFERENCE: 'BLOCKING',
  UNSUPPORTED_DEPENDENCY: 'BLOCKING',
  DEPENDENCY_REGISTRY_DRIFT: 'BLOCKING',
  HISTORICAL_REFERENCE: 'INFORMATIONAL',
  EXISTING_CANONICAL_DATA: 'INFORMATIONAL',
  FINDING_HISTORY: 'INFORMATIONAL',
  FEEDBACK_HISTORY: 'INFORMATIONAL',
};

/**
 * Conflict codes that remain unresolvable by any reviewer decision.
 *
 * Pass 6B removed the four Pass 6A blockers:
 *
 *  - `ATOMICITY_UNAVAILABLE`      → every participating repository now accepts
 *    one shared transaction executor,
 *  - `UNSUPPORTED_RETIREMENT_STATE` → the ACTIVE/CONSOLIDATED lifecycle exists,
 *  - `UNSUPPORTED_POLYMORPHIC_REFERENCE` → each of the four tables has defined
 *    semantics,
 *  - `BOM_COLLISION` / `BOM_REFERENCE_REQUIRES_POLICY` → the BOM policy is
 *    explicit (repoint, or combine with a stated scrap factor).
 *
 * What is left here genuinely must not be resolved by the reviewer, because
 * there is no decision a reviewer could make that would make the action safe:
 * a batch/serial identity collision needs the *underlying data* fixed first, a
 * manufacturer conflict needs the part's identity established, unrelated
 * categories need a taxonomy decision, and unregistered dependencies or open
 * commercial documents need a separate business action.
 */
const UNRESOLVED_CONFLICT_CODES: ReadonlySet<ConsolidationConflictCode> =
  new Set([
    'UNSUPPORTED_DEPENDENCY',
    'DEPENDENCY_REGISTRY_DRIFT',
    'BATCH_COLLISION',
    'SERIAL_COLLISION',
    'MANUFACTURER_CONFLICT',
    'CATEGORY_INCOMPATIBLE',
    'SUPPLIER_REFERENCE_DUPLICATION',
    // No reviewer decision can make this safe: the underlying inventory model
    // would have to change first, which is an ERP-wide decision.
    'INITIAL_STOCK_UNSUPPORTED',
  ]);

/**
 * Conflicts the reviewer CAN resolve, and which therefore stop blocking once a
 * matching resolution is supplied.
 */
const RESOLVABLE_CONFLICT_CODES: ReadonlySet<ConsolidationConflictCode> =
  new Set([
    'ATTRIBUTE_VALUE_DIFFERENCE',
    'ATTRIBUTE_SOURCE_ONLY_VALUE',
    'BOM_COLLISION',
  ]);

/**
 * Finding statuses that may enter consolidation analysis.
 *
 * `ACCEPTED` is included deliberately. The duplicate review workflow is:
 *
 *   duplicate detected -> investigate -> acknowledge/accept the duplicate
 *                      -> review consolidation -> confirm -> consolidate
 *
 * Accepting a finding records that the duplication is real; it does not merge
 * anything. Consolidation is the separate action that performs the merge, so an
 * accepted duplicate must remain consolidatable. `REJECTED` and `DISMISSED` mean
 * the duplication was denied, and `STALE` means the analysis no longer describes
 * the records — all three stay ineligible.
 */
const CONSOLIDATABLE_FINDING_STATUSES: ReadonlySet<string> = new Set([
  'PENDING',
  'ACCEPTED',
]);

/** Match types that may enter consolidation analysis. */
const CONSOLIDATABLE_MATCH_TYPES: ReadonlySet<string> = new Set([
  'EXACT_MPN',
  'PACKAGING_VARIANT',
  'NAME_ATTRIBUTE_IDENTITY',
  // Semantic candidates are allowed only above the strong-evidence threshold.
  'SEMANTIC_NAME_SIMILARITY',
]);

/** Minimum confidence for a semantic candidate to be consolidatable. */
export const CONSOLIDATION_MIN_SEMANTIC_CONFIDENCE = 0.8;

/** Minimum confidence for any potential duplicate to be consolidatable. */
export const CONSOLIDATION_MIN_CONFIDENCE = 0.8;

interface LoadedComponent {
  id: string;
  sku: string;
  name: string;
  manufacturerId: string | null;
  manufacturerPartNumber: string | null;
  categoryId: string | null;
  unit: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface BomLineRow {
  id: string;
  bomId: string;
  componentId: string;
  quantityPerUnit: string;
  scrapFactorPercent: string;
  notes: string | null;
  revision: string;
  status: string;
}

interface InventoryLocationRow {
  locationId: string;
  quantity: number;
  unitOfMeasure: string;
}

@Injectable()
export class ComponentConsolidationPreviewService {
  private readonly logger = new Logger(
    ComponentConsolidationPreviewService.name,
  );

  constructor(
    private readonly reviewQueue: ComponentReviewQueueService,
    @Optional() private readonly dataPacksService?: DataPacksService,
  ) {}

  /**
   * Builds a consolidation preview for a duplicate finding.
   *
   * Never mutates anything. When the finding is not a usable duplicate the
   * preview is still returned, with `eligibility.eligible = false` and the
   * reasons, so the UI can explain rather than fail opaquely.
   *
   * `executor` defaults to the global client. Execution passes its transaction
   * handle so the preview it validates the fingerprint against is computed from
   * the same locked snapshot the mutations will run in, rather than from
   * possibly-stale committed state.
   */
  async buildPreview(
    findingId: string,
    requestedCanonicalId?: string,
    executor: DbExecutor = db,
    resolutions?: ConsolidationResolutionContext,
  ): Promise<ConsolidationPreviewDto> {
    const resolutionContext: ConsolidationResolutionContext = resolutions ?? {
      attributeResolutions: [],
      bomResolutions: [],
    };
    // Read the finding through the SAME executor as everything else in this
    // preview. Execution calls this method with its transaction handle, so the
    // finding state the fingerprint hashes is the transaction's snapshot rather
    // than whatever happens to be committed — otherwise the two reads could
    // disagree and the fingerprint comparison would be meaningless.
    const finding = await this.reviewQueue.getFinding(findingId, executor);

    const reasonCodes: ConsolidationEligibilityReason[] = [];
    const explanations: string[] = [];
    const addReason = (
      code: ConsolidationEligibilityReason,
      explanation: string,
    ) => {
      reasonCodes.push(code);
      explanations.push(explanation);
    };

    // --- 1/2. Duplicate relationship validity ------------------------------
    if (finding.issueCategory !== 'DUPLICATE') {
      addReason(
        'NOT_A_DUPLICATE_FINDING',
        'This finding is not a duplicate finding, so consolidation does not apply.',
      );
    }
    if (
      !finding.relatedComponentId ||
      !finding.component ||
      !finding.relatedComponent
    ) {
      addReason(
        'RELATED_COMPONENT_MISSING',
        'The finding does not reference two components that both still exist.',
      );
    }
    if (
      finding.componentId &&
      finding.relatedComponentId &&
      finding.componentId === finding.relatedComponentId
    ) {
      addReason(
        'SELF_MATCH',
        'The finding points at the same component twice.',
      );
    }

    if (!CONSOLIDATABLE_FINDING_STATUSES.has(finding.status)) {
      addReason(
        'FINDING_STATUS_NOT_CONSOLIDATABLE',
        `Findings in ${finding.status} status are not analysed for consolidation. Only PENDING and ACCEPTED duplicate findings can be consolidated: accepting a duplicate acknowledges it, and consolidating is the separate action that merges the records.`,
      );
    }

    const matchType = this.resolveMatchType(finding);
    if (!matchType || !CONSOLIDATABLE_MATCH_TYPES.has(matchType)) {
      addReason(
        'MATCH_TYPE_NOT_CONSOLIDATABLE',
        matchType === 'MPN_MANUFACTURER_CONFLICT'
          ? 'The two records claim different manufacturers for the same part number. This must be resolved as a data question before consolidation is considered.'
          : `Match rule "${matchType ?? 'unknown'}" is not eligible for consolidation.`,
      );
    }

    const confidence = finding.confidence ?? 0;
    if (confidence < CONSOLIDATION_MIN_CONFIDENCE) {
      addReason(
        'INSUFFICIENT_CONFIDENCE',
        `Confidence ${confidence.toFixed(2)} is below the ${CONSOLIDATION_MIN_CONFIDENCE} threshold for consolidation analysis.`,
      );
    }

    if (
      finding.componentId === finding.relatedComponentId &&
      finding.relatedComponentId !== null
    ) {
      addReason(
        'SELF_MATCH',
        'A component cannot be consolidated into itself.',
      );
    }

    // --- 5. Authoritative current state ------------------------------------
    const pairIds = [finding.componentId, finding.relatedComponentId].filter(
      (id): id is string => Boolean(id),
    );
    const loaded = await this.loadComponents(pairIds, executor);

    if (loaded.missingIds.length > 0) {
      addReason(
        'COMPONENT_NOT_FOUND',
        `Component(s) ${loaded.missingIds.join(', ')} no longer exist.`,
      );
    }

    for (const component of loaded.byId.values()) {
      if (!component.isActive) {
        addReason(
          'COMPONENT_INACTIVE',
          `Component ${component.sku} is inactive. Retirement semantics for consolidation are not defined.`,
        );
      }
    }

    // Resolve canonical/source orientation before anything else needs it.
    const candidates = this.buildCanonicalCandidates(
      loaded.byId,
      loaded.inventoryByComponentId,
    );
    const requested = requestedCanonicalId
      ? loaded.byId.get(requestedCanonicalId)
      : undefined;
    if (requestedCanonicalId && !requested) {
      throw new BadRequestException(
        'canonicalComponentId must be one of the two components in this finding.',
      );
    }
    const canonicalId = requested?.id ?? candidates[0]?.componentId ?? null;
    const sourceId = pairIds.find((id) => id !== canonicalId) ?? null;

    if (requestedCanonicalId && !pairIds.includes(requestedCanonicalId)) {
      addReason(
        'PREVIEW_CANONICAL_NOT_IN_PAIR',
        'The requested canonical component is not part of this finding.',
      );
    }

    const canonicalComponent = canonicalId
      ? loaded.byId.get(canonicalId)
      : undefined;
    const sourceComponent = sourceId ? loaded.byId.get(sourceId) : undefined;

    if (!canonicalComponent || !sourceComponent) {
      // Without two authoritative records nothing further can be analysed
      // safely. Return an explicit, empty-but-honest preview.
      return this.buildUnanalyzablePreview({
        finding,
        reasonCodes,
        explanations,
        previewVersion: CONSOLIDATION_PREVIEW_VERSION,
      });
    }

    // --- 3/5. Everything else, from authoritative state --------------------
    const identity = await this.loadManufacturerIdentity(executor);
    const [
      dependencyResult,
      dependencies,
      inventory,
      attributes,
      category,
      bom,
      history,
    ] = await Promise.all([
      analyzeComponentDependencies(canonicalComponent.id, executor),
      analyzeComponentDependencies(sourceComponent.id, executor),
      this.buildInventory(canonicalComponent, sourceComponent, executor),
      this.buildAttributes(canonicalComponent, sourceComponent, executor),
      this.buildCategory(canonicalComponent, sourceComponent, executor),
      this.buildBomImpact(canonicalComponent, sourceComponent, executor),
      this.buildHistory(finding, executor),
    ]);

    // Manufacturer identity comparison is synchronous: it resolves ids through
    // the already-loaded identity index.
    const manufacturer = this.buildManufacturer(
      canonicalComponent,
      sourceComponent,
      identity,
    );

    const mergedDependencies = this.mergeDependencies(
      dependencyResult.analyses,
      dependencies.analyses,
    );

    const conflicts: ConsolidationConflictDto[] = [];
    const push = (conflict: ConsolidationConflictDto) =>
      conflicts.push(conflict);

    if (reasonCodes.length > 0) {
      push(
        this.conflict({
          code: 'FINDING_NOT_ELIGIBLE',
          title: 'Finding is not eligible for consolidation analysis',
          description: explanations.join(' '),
          entityType: 'component_intelligence_findings',
          entityIds: [finding.id],
          canonicalComponentId: canonicalComponent.id,
          sourceComponentId: sourceComponent.id,
          affectedCount: 1,
        }),
      );
    }

    // ---------------------------------------------------------------------
    // Blocker status after Pass 6B.
    //
    // The four Pass 6A blockers are resolved in the domain, so they are no
    // longer emitted as conflicts at all. What replaced them is stated where it
    // belongs: atomicity is provided by the shared transaction executor
    // (`@ananya/database`), retirement by the ACTIVE/CONSOLIDATED lifecycle,
    // polymorphic semantics by `POLYMORPHIC_REFERENCE_POLICIES`, and BOM
    // semantics by the explicit repoint-or-combine policy below.
    // ---------------------------------------------------------------------

    // Dependency-derived conflicts.
    this.appendDependencyConflicts(push, mergedDependencies, {
      canonicalComponent,
      sourceComponent,
    });

    // Identity conflicts.
    if (manufacturer.relation === 'CONFLICT') {
      push(
        this.conflict({
          code: 'MANUFACTURER_CONFLICT',
          title: 'The two records claim different manufacturers',
          description: `Canonical resolves to "${manufacturer.canonicalManufacturerName ?? 'unresolved'}" and source to "${manufacturer.sourceManufacturerName ?? 'unresolved'}". Consolidating would silently pick a manufacturer, so this must be resolved as a data question first.`,
          entityType: 'components',
          entityIds: [canonicalComponent.id, sourceComponent.id],
          canonicalComponentId: canonicalComponent.id,
          sourceComponentId: sourceComponent.id,
          affectedCount: 2,
        }),
      );
    }
    if (category.relation === 'INCOMPATIBLE') {
      push(
        this.conflict({
          code: 'CATEGORY_INCOMPATIBLE',
          title: 'The two records are classified under unrelated categories',
          description: `Canonical is "${category.canonicalCategoryName ?? 'unassigned'}" and source is "${category.sourceCategoryName ?? 'unassigned'}". There is no automatic category reassignment rule.`,
          entityType: 'components',
          entityIds: [canonicalComponent.id, sourceComponent.id],
          canonicalComponentId: canonicalComponent.id,
          sourceComponentId: sourceComponent.id,
          affectedCount: 2,
        }),
      );
    }
    if (category.relation === 'RELATED') {
      push(
        this.conflict({
          code: 'CATEGORY_HIERARCHY_RECONCILIATION',
          title: 'Categories are related but not identical',
          description: `Canonical is "${category.canonicalCategoryName ?? 'unassigned'}" and source is "${category.sourceCategoryName ?? 'unassigned'}". The surviving record keeps its own category; the reviewer must confirm that is intended.`,
          entityType: 'components',
          entityIds: [canonicalComponent.id, sourceComponent.id],
          canonicalComponentId: canonicalComponent.id,
          sourceComponentId: sourceComponent.id,
          affectedCount: 2,
        }),
      );
    }
    if (category.relation === 'UNKNOWN') {
      push(
        this.conflict({
          code: 'CATEGORY_UNASSIGNED',
          title: 'At least one record has no category',
          description:
            'Missing classification is informational only: the surviving record keeps whatever category it already has.',
          entityType: 'components',
          entityIds: [canonicalComponent.id, sourceComponent.id],
          canonicalComponentId: canonicalComponent.id,
          sourceComponentId: sourceComponent.id,
        }),
      );
    }

    // Attribute conflicts.
    const resolvedAttributeIds = new Set(
      resolutionContext.attributeResolutions.map(
        (resolution) => resolution.attributeDefinitionId,
      ),
    );
    for (const entry of attributes.entries) {
      if (entry.classification === 'CONFLICTING') {
        push(
          this.conflict({
            code: 'ATTRIBUTE_VALUE_DIFFERENCE',
            title: `Conflicting ${entry.label}`,
            description: `Canonical records "${entry.canonicalValue ?? '—'}" and source records "${entry.sourceValue ?? '—'}". Choose KEEP_CANONICAL_VALUE, KEEP_SOURCE_VALUE or EXPLICIT_VALUE.`,
            entityType: 'component_attribute_values',
            canonicalComponentId: canonicalComponent.id,
            sourceComponentId: sourceComponent.id,
            affectedCount: 2,
            resolved: this.attributeResolved(
              entry.attributeDefinitionId,
              resolvedAttributeIds,
            ),
          }),
        );
      } else if (entry.classification === 'SOURCE_ONLY') {
        push(
          this.conflict({
            code: 'ATTRIBUTE_SOURCE_ONLY_VALUE',
            title: `${entry.label} exists only on the retired record`,
            description: `Canonical has no value; source records "${entry.sourceValue ?? '—'}". Choose KEEP_SOURCE_VALUE, DISCARD_SOURCE_VALUE or EXPLICIT_VALUE.`,
            entityType: 'component_attribute_values',
            canonicalComponentId: canonicalComponent.id,
            sourceComponentId: sourceComponent.id,
            affectedCount: 1,
            resolved: this.attributeResolved(
              entry.attributeDefinitionId,
              resolvedAttributeIds,
            ),
          }),
        );
      }
    }
    if (attributes.canonicalOnlyCount > 0) {
      push(
        this.conflict({
          code: 'EXISTING_CANONICAL_ATTRIBUTES',
          title: `${attributes.canonicalOnlyCount} attribute(s) exist only on the surviving record`,
          description:
            'These values are unaffected: the surviving record keeps them.',
          entityType: 'component_attribute_values',
          canonicalComponentId: canonicalComponent.id,
          sourceComponentId: sourceComponent.id,
          affectedCount: attributes.canonicalOnlyCount,
        }),
      );
    }

    // Inventory presence.
    if (
      inventory.combinedTotalQuantity > 0 ||
      inventory.proposedReconciliation.length > 0
    ) {
      push(
        this.conflict({
          code: 'INVENTORY_PRESENT',
          title: 'Inventory balances would have to be reconciled',
          description: `Canonical holds ${inventory.canonical.totalQuantity} and source holds ${inventory.source.totalQuantity} across ${inventory.byLocation.length} location(s). Rebalancing needs compensating ledger entries and a projection rebuild.`,
          entityType: 'inventory_projections',
          canonicalComponentId: canonicalComponent.id,
          sourceComponentId: sourceComponent.id,
          affectedCount: inventory.byLocation.length,
        }),
      );
    }

    // Opening balances recorded as `InitialStock`.
    //
    // `CalculateInventoryProjection` has no `InitialStock` case, so such entries
    // are permanently invisible to `inventory_projections` — the read model that
    // reservations, MRP and consolidation itself use. A rebuild does not help.
    // Consolidation reads source balances from projections, so it would post
    // nothing and strand the quantity on a retired component.
    //
    // This is not something a reviewer can decide around, so it blocks.
    const initialStock = await this.findInitialStockRows(
      [canonicalComponent.id, sourceComponent.id],
      executor,
    );
    if (initialStock.total > 0) {
      const side =
        initialStock.canonicalCount > 0 && initialStock.sourceCount > 0
          ? 'both records'
          : initialStock.sourceCount > 0
            ? 'the record being retired'
            : 'the surviving record';
      push(
        this.conflict({
          code: 'INITIAL_STOCK_UNSUPPORTED',
          title: 'Opening balances recorded as InitialStock cannot be moved',
          description: `${initialStock.total} InitialStock ledger entr${initialStock.total === 1 ? 'y' : 'ies'} exist on ${side}, holding ${initialStock.quantity} unit(s) in total. The projection calculator behind inventory_projections has no InitialStock case, so those quantities are invisible to the stock model that reservations, MRP and consolidation read — and a rebuild cannot recover them. Consolidating would retire the component while its opening balance stayed behind, so execution is refused until the opening balance is represented as a ledger movement the projection model understands.`,
          entityType: 'inventory_transactions',
          entityIds: initialStock.sampleIds,
          canonicalComponentId: canonicalComponent.id,
          sourceComponentId: sourceComponent.id,
          affectedCount: initialStock.total,
        }),
      );
    }

    // BOM-specific conflicts.
    const resolvedBomIds = new Set(
      resolutionContext.bomResolutions.map((resolution) => resolution.bomId),
    );
    for (const collision of bom.collisions) {
      push(
        this.conflict({
          code: 'BOM_COLLISION',
          title: 'Both components appear in the same bill of materials',
          description: `BOM ${collision.bomId} lists both records (canonical ${collision.canonicalQuantityPerUnit}/unit, source ${collision.sourceQuantityPerUnit}/unit). The BOM aggregate forbids two lines for the same component, so the lines must be combined: the result is the sum of the two quantities and an explicitly chosen scrap factor.`,
          entityType: 'bill_of_material_lines',
          entityIds: [collision.canonicalLineId, collision.sourceLineId],
          canonicalComponentId: canonicalComponent.id,
          sourceComponentId: sourceComponent.id,
          affectedCount: 2,
          resolved: resolvedBomIds.has(collision.bomId),
        }),
      );
    }
    if (bom.sourceOnlyCount > 0 || bom.canonicalOnlyCount > 0) {
      push(
        this.conflict({
          code: 'BOM_REFERENCE_REQUIRES_POLICY',
          title: 'BOM references will be repointed',
          description: `${bom.sourceOnlyCount} BOM line(s) reference the retired record only and will be repointed onto the surviving component, keeping their line id, quantity and scrap factor. ${bom.canonicalOnlyCount} line(s) already reference the surviving record and are unchanged. Only DRAFT BOMs can be amended; a released or obsolete BOM that mentions a retired component blocks the operation.`,
          entityType: 'bill_of_material_lines',
          canonicalComponentId: canonicalComponent.id,
          sourceComponentId: sourceComponent.id,
          affectedCount: bom.sourceOnlyCount + bom.canonicalOnlyCount,
        }),
      );
    }

    // Reservations.
    const reservationsSummary = this.toReferenceSummary(mergedDependencies, [
      'inventory_reservation_lines',
    ]);
    if ((reservationsSummary.openCount ?? 0) > 0) {
      push(
        this.conflict({
          code: 'ACTIVE_RESERVATION_REQUIRES_POLICY',
          title:
            'Active reservations would have to be preserved or transferred',
          description: `${reservationsSummary.openCount} active reservation line(s) reference these components. They will be repointed onto the surviving component, preserving line ids and quantities. Consolidation refuses to run if repointing would reserve more stock than the surviving component holds at that location.`,
          entityType: 'inventory_reservation_lines',
          canonicalComponentId: canonicalComponent.id,
          sourceComponentId: sourceComponent.id,
          affectedCount: reservationsSummary.openCount,
        }),
      );
    }

    // Batch / serial collisions.
    const batchCollisions = await this.detectCodeCollisions(
      'batches',
      'batch_number',
      sourceComponent.id,
      canonicalComponent.id,
      executor,
    );
    if (batchCollisions.length > 0) {
      push(
        this.conflict({
          code: 'BATCH_COLLISION',
          title: 'Duplicate batch numbers between the two records',
          description: `Both records use batch code(s) ${batchCollisions.join(', ')}. Batch codes are unique per component, so repointing would collide.`,
          entityType: 'batches',
          entityIds: batchCollisions,
          canonicalComponentId: canonicalComponent.id,
          sourceComponentId: sourceComponent.id,
          affectedCount: batchCollisions.length,
        }),
      );
    }

    const serialCollisions = await this.detectCodeCollisions(
      'serials',
      'serial_number',
      sourceComponent.id,
      canonicalComponent.id,
      executor,
    );
    if (serialCollisions.length > 0) {
      push(
        this.conflict({
          code: 'SERIAL_COLLISION',
          title: 'Duplicate serial numbers between the two records',
          description: `Both records use serial number(s) ${serialCollisions.join(', ')}. Serial identity is a physical fact and repointing would collide.`,
          entityType: 'serials',
          entityIds: serialCollisions,
          canonicalComponentId: canonicalComponent.id,
          sourceComponentId: sourceComponent.id,
          affectedCount: serialCollisions.length,
        }),
      );
    }

    // Open procurement.
    //
    // Open purchase *order* lines are handled generically by the dependency
    // conflicts above (`MUST_NOT_CHANGE` with a live row count). Pending
    // purchase *recommendations* are repointed, so they are reported as an
    // informational note rather than a blocker.
    const openRecommendations = this.sumOpenCounts(mergedDependencies, [
      'purchase_recommendations',
    ]);
    if (openRecommendations > 0) {
      push(
        this.conflict({
          code: 'OPEN_PROCUREMENT_REFERENCE',
          title: 'Open purchase recommendations will be repointed',
          description: `${openRecommendations} pending planning recommendation(s) reference these components and will follow the surviving component, so a buyer cannot be told to order a record that no longer exists.`,
          entityType: 'purchase_recommendations',
          canonicalComponentId: canonicalComponent.id,
          sourceComponentId: sourceComponent.id,
          affectedCount: openRecommendations,
        }),
      );
    }

    // Supplier duplication.
    const supplierCounts = this.findDependencyCounts(mergedDependencies, [
      'supplier_components',
    ]);
    if (supplierCounts.canonicalCount > 0 && supplierCounts.sourceCount > 0) {
      push(
        this.conflict({
          code: 'SUPPLIER_REFERENCE_DUPLICATION',
          title: 'Both records have supplier part relationships',
          description:
            'Both records have supplier part relationships. Supplier mappings are repointed onto the surviving component, but if the same supplier is already mapped to it the two vendor part numbers, lead times and prices would contradict each other. Consolidation refuses to choose between them.',
          entityType: 'supplier_components',
          canonicalComponentId: canonicalComponent.id,
          sourceComponentId: sourceComponent.id,
          affectedCount:
            supplierCounts.canonicalCount + supplierCounts.sourceCount,
        }),
      );
    }

    // History: informational only, but reported so nothing is hidden.
    if (history.relatedFindingCount > 0) {
      push(
        this.conflict({
          code: 'FINDING_HISTORY',
          title: `${history.relatedFindingCount} other finding(s) involve these components`,
          description:
            'Findings about or against the retired record would have to be reconciled so no active finding points at a consolidated component.',
          entityType: 'component_intelligence_findings',
          entityIds: history.relatedFindings
            .map((entry) => entry.id)
            .slice(0, 5),
          canonicalComponentId: canonicalComponent.id,
          sourceComponentId: sourceComponent.id,
          affectedCount: history.relatedFindingCount,
        }),
      );
    }
    if (history.feedbackCount > 0) {
      push(
        this.conflict({
          code: 'FEEDBACK_HISTORY',
          title: `${history.feedbackCount} AI feedback record(s) reference these components`,
          description:
            'Review feedback is an append-only evidence trail. It is never rewritten or moved.',
          entityType: 'ai_suggestion_feedback',
          canonicalComponentId: canonicalComponent.id,
          sourceComponentId: sourceComponent.id,
          affectedCount: history.feedbackCount,
        }),
      );
    }

    const historicalSummary = this.toReferenceSummary(mergedDependencies, [
      'inventory_transactions',
      'material_consumption_lines',
      'production_orders',
      'material_requirements',
      'manufacturing_traceability',
      'finished_goods_receipt_lines',
      'purchase_invoice_lines',
      'goods_receipt_lines',
      'supplier_return_lines',
      'quotation_lines',
      'sales_order_lines',
      'fulfillment_request_lines',
      'customer_return_lines',
      'warehouse_transfer_lines',
      'stock_adjustment_lines',
      'stock_count_lines',
      'cycle_count_lines',
      'project_materials',
    ]);
    if (historicalSummary.historicalCount > 0) {
      push(
        this.conflict({
          code: 'HISTORICAL_REFERENCE',
          title: `${historicalSummary.historicalCount} historical record(s) reference these components`,
          description:
            'Historical documents, movements and traceability keep their original component identity. Consolidation changes component identity, not history.',
          entityType: 'multiple',
          canonicalComponentId: canonicalComponent.id,
          sourceComponentId: sourceComponent.id,
          affectedCount: historicalSummary.historicalCount,
        }),
      );
    }

    const polymorphicReferences =
      this.buildPolymorphicReferences(mergedDependencies);
    for (const reference of polymorphicReferences) {
      if (reference.canonicalCount + reference.sourceCount === 0) continue;
      const policy = POLYMORPHIC_REFERENCE_POLICIES.find(
        (entry) => entry.table === reference.id,
      );

      if (!policy) {
        // Fail closed: a polymorphic reference this pass has not classified
        // stays blocking rather than being assumed safe.
        push(
          this.conflict({
            code: 'UNSUPPORTED_POLYMORPHIC_REFERENCE',
            title: `Unclassified polymorphic references in ${reference.label}`,
            description: `${reference.canonicalCount + reference.sourceCount} row(s) reference these components through entity_type/entity_id, and consolidation has no defined semantics for this table.`,
            entityType: reference.entity,
            entityIds: reference.sampleIds,
            canonicalComponentId: canonicalComponent.id,
            sourceComponentId: sourceComponent.id,
            affectedCount: reference.canonicalCount + reference.sourceCount,
          }),
        );
        continue;
      }

      push(
        this.conflict({
          code: 'UNSUPPORTED_POLYMORPHIC_REFERENCE',
          title:
            policy.semantics === 'HISTORICAL_PRESERVE'
              ? `${reference.label} are preserved as history`
              : `${reference.label} will follow the surviving component`,
          description: policy.rationale,
          entityType: reference.entity,
          entityIds: reference.sampleIds,
          canonicalComponentId: canonicalComponent.id,
          sourceComponentId: sourceComponent.id,
          affectedCount: reference.canonicalCount + reference.sourceCount,
          // The semantic question this conflict used to represent is answered
          // for this table, so it is reported rather than blocking.
          resolved: true,
        }),
      );
    }

    // Registry drift is a hard blocker: an unregistered reference could hide
    // an unknown dependency.
    if (!dependencyResult.coverage.ok) {
      push(
        this.conflict({
          code: 'DEPENDENCY_REGISTRY_DRIFT',
          title: 'Component dependency registry does not match the database',
          description: `Unregistered references: ${
            dependencyResult.coverage.unregistered
              .map((reference) => `${reference.table}.${reference.column}`)
              .join(', ') || 'none'
          }. Stale entries: ${
            dependencyResult.coverage.stale
              .map((reference) => `${reference.table}.${reference.column}`)
              .join(', ') || 'none'
          }. Unknown dependencies always block execution.`,
          entityType: 'platform',
          canonicalComponentId: canonicalComponent.id,
          sourceComponentId: sourceComponent.id,
        }),
      );
    }

    const proposedChanges = this.buildProposedChanges(
      mergedDependencies,
      inventory,
      bom,
    );

    const executionBlockedReasons = conflicts
      .filter((conflict) => conflict.blocksExecution)
      .map((conflict) => ({
        code: conflict.code,
        title: conflict.title,
        description: conflict.description,
      }));

    const preview: Omit<ConsolidationPreviewDto, 'previewFingerprint'> = {
      findingId: finding.id,
      // Executability is derived from the conflicts that remain undecided; it is
      // never asserted by the client and never set unconditionally.
      executable:
        executionBlockedReasons.length === 0 && reasonCodes.length === 0,
      executionBlockedReasons,
      canonical: this.toComponentSummary(canonicalComponent),
      sources: [this.toComponentSummary(sourceComponent)],
      canonicalCandidates: candidates,
      eligibility: {
        eligible: reasonCodes.length === 0,
        reasonCodes,
        explanations,
      },
      conflicts,
      dependencies: mergedDependencies,
      inventory,
      attributes,
      category,
      manufacturer,
      bom,
      procurement: this.toReferenceSummary(mergedDependencies, [
        'purchase_order_lines',
        'purchase_invoice_lines',
        'goods_receipt_lines',
        'supplier_return_lines',
        'purchase_recommendations',
        'supplier_components',
      ]),
      reservations: reservationsSummary,
      batches: this.toReferenceSummary(mergedDependencies, ['batches']),
      serials: this.toReferenceSummary(mergedDependencies, ['serials']),
      historicalReferences: historicalSummary,
      polymorphicReferences,
      retirement: this.buildRetirement(canonicalComponent, sourceComponent),
      history,
      proposedChanges,
      dependencyCoverage: {
        ok: dependencyResult.coverage.ok,
        databaseReferenceCount: dependencyResult.coverage.dbReferences.length,
        registeredReferenceCount:
          dependencyResult.coverage.registeredReferences.length,
        unregisteredReferences: dependencyResult.coverage.unregistered.map(
          (reference) => `${reference.table}.${reference.column}`,
        ),
      },
      previewVersion: CONSOLIDATION_PREVIEW_VERSION,
      intelligenceVersion: COMPONENT_REVIEW_INTELLIGENCE_VERSION,
      computedAt: new Date().toISOString(),
    };

    return {
      ...preview,
      previewFingerprint: this.buildPreviewFingerprint(preview),
    };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * The match type the backend recorded, read from the finding's own payload.
   * The preview never re-derives the rule, so it cannot disagree with the queue.
   */
  private resolveMatchType(finding: ComponentReviewFindingDto): string | null {
    const candidates = [
      finding.suggestedValue?.primaryMatchType,
      finding.suggestedValue?.matchType,
      finding.metadata?.primaryMatchType,
      finding.metadata?.matchType,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate) return candidate;
    }
    return finding.issueType === 'EXACT_DUPLICATE' ? 'EXACT_MPN' : null;
  }

  private async loadComponents(
    ids: string[],
    executor: DbExecutor,
  ): Promise<{
    byId: Map<string, LoadedComponent>;
    missingIds: string[];
    inventoryByComponentId: Map<string, number>;
  }> {
    if (ids.length === 0) {
      return {
        byId: new Map(),
        missingIds: [],
        inventoryByComponentId: new Map(),
      };
    }

    const rows = await executor
      .select({
        id: components.id,
        sku: components.sku,
        name: components.name,
        manufacturerId: components.manufacturerId,
        manufacturerPartNumber: components.manufacturerPartNumber,
        categoryId: components.categoryId,
        unit: components.unit,
        isActive: components.isActive,
        createdAt: components.createdAt,
        updatedAt: components.updatedAt,
      })
      .from(components)
      .where(inArray(components.id, ids));

    const byId = new Map(rows.map((row) => [row.id, row]));
    const missingIds = ids.filter((id) => !byId.has(id));
    const inventoryByComponentId = await this.loadInventoryTotals(
      ids,
      executor,
    );

    return { byId, missingIds, inventoryByComponentId };
  }

  private async loadInventoryTotals(
    componentIds: string[],
    executor: DbExecutor,
  ): Promise<Map<string, number>> {
    if (componentIds.length === 0) return new Map();

    const rows = await executor.execute<{
      component_id: string;
      total: string;
    }>(
      sql`select component_id, coalesce(sum(quantity), 0) as total from inventory_projections where ${inArray(inventoryProjections.componentId, componentIds)} group by component_id`,
    );

    return new Map(
      rows.rows.map((row) => [row.component_id, Number(row.total ?? 0)]),
    );
  }

  /**
   * Deterministic canonical suggestion: active records first, then records that
   * already hold inventory, then the oldest record, then id.
   *
   * Deliberately not a vague "best match" score: these are the same
   * deterministic signals the pass allows, and the reviewer must confirm.
   */
  private buildCanonicalCandidates(
    byId: Map<string, LoadedComponent>,
    inventoryByComponentId: Map<string, number>,
  ): ConsolidationCanonicalCandidateDto[] {
    const entries = [...byId.values()].map((component) => ({
      componentId: component.id,
      isActive: component.isActive,
      hasInventory: (inventoryByComponentId.get(component.id) ?? 0) > 0,
      createdAt: component.createdAt.toISOString(),
    }));

    return entries
      .sort((left, right) => {
        if (left.isActive !== right.isActive) return left.isActive ? -1 : 1;
        if (left.hasInventory !== right.hasInventory) {
          return left.hasInventory ? -1 : 1;
        }
        const created = left.createdAt.localeCompare(right.createdAt);
        if (created !== 0) return created;
        return left.componentId.localeCompare(right.componentId);
      })
      .map((entry) => ({
        ...entry,
        reason: [
          entry.isActive ? 'active' : 'inactive',
          entry.hasInventory ? 'holds inventory' : 'no inventory',
          'oldest record wins ties',
        ].join(' · '),
      }));
  }

  private async loadManufacturerIdentity(
    executor: DbExecutor,
  ): Promise<ManufacturerIdentityIndex> {
    const rows = await executor
      .select({
        id: manufacturers.id,
        code: manufacturers.code,
        name: manufacturers.name,
      })
      .from(manufacturers);

    return buildManufacturerIdentityIndex({
      manufacturers: rows,
      hints: await this.loadManufacturerHints(),
    });
  }

  /**
   * Manufacturer alias hints from the installed Data Packs.
   *
   * The same source the duplicate analyzer uses, so the preview can never
   * disagree with the engine about whether two manufacturer records are the same
   * identity.
   */
  private async loadManufacturerHints(): Promise<ManufacturerHintTerm[]> {
    if (!this.dataPacksService) return [];
    try {
      const hints = await this.dataPacksService.getActiveIntelligenceHints();
      return hints.flatMap((hint) => hint.manufacturerHints ?? []);
    } catch {
      return [];
    }
  }

  private toComponentSummary(
    component: LoadedComponent,
  ): ConsolidationComponentSummaryDto {
    return {
      id: component.id,
      sku: component.sku,
      name: component.name,
      manufacturerId: component.manufacturerId,
      manufacturerPartNumber: component.manufacturerPartNumber,
      categoryId: component.categoryId,
      unit: component.unit,
      isActive: component.isActive,
      createdAt: component.createdAt.toISOString(),
      updatedAt: component.updatedAt.toISOString(),
    };
  }

  private async buildInventory(
    canonical: LoadedComponent,
    source: LoadedComponent,
    executor: DbExecutor,
  ): Promise<ConsolidationInventoryDto> {
    const [canonicalLocations, sourceLocations, canonicalLedger, sourceLedger] =
      await Promise.all([
        this.loadInventoryLocations(canonical.id, executor),
        this.loadInventoryLocations(source.id, executor),
        this.countLedger(canonical.id, executor),
        this.countLedger(source.id, executor),
      ]);

    const locationIds = new Set([
      ...canonicalLocations.map((row) => row.locationId),
      ...sourceLocations.map((row) => row.locationId),
    ]);
    const canonicalByLocation = new Map(
      canonicalLocations.map((row) => [row.locationId, row]),
    );
    const sourceByLocation = new Map(
      sourceLocations.map((row) => [row.locationId, row]),
    );

    const byLocation = [...locationIds].sort().map((locationId) => {
      const canonicalRow = canonicalByLocation.get(locationId);
      const sourceRow = sourceByLocation.get(locationId);
      const canonicalQuantity = canonicalRow?.quantity ?? 0;
      const sourceQuantity = sourceRow?.quantity ?? 0;
      return {
        locationId,
        canonicalQuantity,
        sourceQuantity,
        combinedQuantity: canonicalQuantity + sourceQuantity,
        unitOfMeasure:
          canonicalRow?.unitOfMeasure ??
          sourceRow?.unitOfMeasure ??
          canonical.unit,
      };
    });

    // A future reconciliation expressed in the existing ledger vocabulary:
    // an Issue from the retired record and a Receipt on the surviving one, per
    // location. This is a DESCRIPTION, never an executed operation.
    const proposedReconciliation = byLocation.flatMap((row) =>
      row.sourceQuantity === 0
        ? []
        : [
            {
              action: 'ISSUE_SOURCE' as const,
              locationId: row.locationId,
              quantity: row.sourceQuantity,
              unitOfMeasure: row.unitOfMeasure,
            },
            {
              action: 'RECEIPT_CANONICAL' as const,
              locationId: row.locationId,
              quantity: row.sourceQuantity,
              unitOfMeasure: row.unitOfMeasure,
            },
          ],
    );

    return {
      canonical: {
        componentId: canonical.id,
        totalQuantity: canonicalLocations.reduce(
          (total, row) => total + row.quantity,
          0,
        ),
        locations: canonicalLocations,
        ledgerTransactionCount: canonicalLedger,
      },
      source: {
        componentId: source.id,
        totalQuantity: sourceLocations.reduce(
          (total, row) => total + row.quantity,
          0,
        ),
        locations: sourceLocations,
        ledgerTransactionCount: sourceLedger,
      },
      byLocation,
      combinedTotalQuantity: byLocation.reduce(
        (total, row) => total + row.combinedQuantity,
        0,
      ),
      proposedReconciliation,
      executionSupport: 'SUPPORTED',
      note: 'Balances are read from inventory projections, which are derived from the append-only ledger. Consolidation posts an Issue against the retired component and a matching Receipt against the surviving one for every location with a non-zero balance, then recalculates both projections from their own complete ledgers. Historical transactions are never rewritten, and no ledger entry is posted for a zero balance.',
    };
  }

  private async loadInventoryLocations(
    componentId: string,
    executor: DbExecutor,
  ): Promise<Array<InventoryLocationRow & { unitOfMeasure: string }>> {
    const rows = await executor.execute<{
      location_id: string;
      quantity: string;
      unit_of_measure: string;
    }>(
      sql`select location_id, quantity, unit_of_measure from inventory_projections where component_id = ${componentId} order by location_id`,
    );

    return rows.rows.map((row) => ({
      locationId: row.location_id,
      quantity: Number(row.quantity ?? 0),
      unitOfMeasure: row.unit_of_measure,
    }));
  }

  private async countLedger(
    componentId: string,
    executor: DbExecutor,
  ): Promise<number> {
    const rows = await executor.execute<{ total: number }>(
      sql`select count(*)::int as total from inventory_transactions where component_id = ${componentId}`,
    );
    return Number(rows.rows[0]?.total ?? 0);
  }

  /**
   * Finds `InitialStock` ledger entries for either component.
   *
   * Why this exists: `CalculateInventoryProjection` has no `InitialStock` case,
   * so such entries never reach `inventory_projections`. That table is the stock
   * read model for `ReservationsService.getAvailableQuantity`, the MRP planner
   * and this consolidation feature. Consolidation reads source balances from
   * projections, so an opening balance recorded this way would be silently
   * stranded on the retired component. Detecting it lets execution refuse
   * instead.
   *
   * Deliberately reads the ledger rather than projections, because projections
   * are exactly what cannot see these rows.
   */
  private async findInitialStockRows(
    componentIds: string[],
    executor: DbExecutor,
  ): Promise<{
    total: number;
    quantity: number;
    canonicalCount: number;
    sourceCount: number;
    sampleIds: string[];
  }> {
    const unique = [...new Set(componentIds.filter((id) => Boolean(id)))];
    if (unique.length === 0) {
      return {
        total: 0,
        quantity: 0,
        canonicalCount: 0,
        sourceCount: 0,
        sampleIds: [],
      };
    }

    const rows = await executor.execute<{
      component_id: string;
      id: string;
      quantity: string;
    }>(
      sql`select id, component_id, quantity from inventory_transactions where transaction_type = 'InitialStock' and ${inArray(inventoryTransactions.componentId, unique)} order by id`,
    );

    const [canonicalId] = unique;
    const canonicalCount = rows.rows.filter(
      (row) => row.component_id === canonicalId,
    ).length;

    return {
      total: rows.rows.length,
      quantity: rows.rows.reduce(
        (total, row) => total + Number(row.quantity ?? 0),
        0,
      ),
      canonicalCount,
      sourceCount: rows.rows.length - canonicalCount,
      sampleIds: rows.rows.slice(0, 5).map((row) => row.id),
    };
  }

  private async buildAttributes(
    canonical: LoadedComponent,
    source: LoadedComponent,
    executor: DbExecutor,
  ): Promise<ConsolidationAttributesDto> {
    const values = await loadAllAttributeValues(
      [canonical.id, source.id],
      executor,
    );
    const entries = compareComponentAttributes({
      canonicalAttributes: values.get(canonical.id),
      sourceAttributes: values.get(source.id),
    });

    const toDto = (
      entry: AttributeComparisonEntry,
    ): ConsolidationAttributeEntryDto => ({
      attributeDefinitionId: entry.attributeDefinitionId,
      code: entry.code,
      label: entry.label,
      dataType: entry.dataType,
      canonicalValue: entry.canonicalValue,
      sourceValue: entry.sourceValue,
      classification: entry.classification,
      resolutionRequired:
        entry.classification === 'CONFLICTING' ||
        entry.classification === 'SOURCE_ONLY',
      // Every differing attribute has a defined resolution mechanism in this
      // pass; the value itself is validated at execution time.
      resolutionSupported: true,
    });

    return {
      entries: entries.map(toDto),
      identicalCount: entries.filter(
        (entry) => entry.classification === 'IDENTICAL',
      ).length,
      canonicalOnlyCount: entries.filter(
        (entry) => entry.classification === 'CANONICAL_ONLY',
      ).length,
      sourceOnlyCount: entries.filter(
        (entry) => entry.classification === 'SOURCE_ONLY',
      ).length,
      conflictingCount: entries.filter(
        (entry) => entry.classification === 'CONFLICTING',
      ).length,
    };
  }

  private async buildCategory(
    canonical: LoadedComponent,
    source: LoadedComponent,
    executor: DbExecutor,
  ): Promise<ConsolidationCategoryDto> {
    const categoryIds = [canonical.categoryId, source.categoryId].filter(
      (id): id is string => Boolean(id),
    );
    const rows =
      categoryIds.length > 0
        ? await executor
            .select({
              id: categories.id,
              code: categories.code,
              name: categories.name,
              parentId: categories.parentId,
            })
            .from(categories)
            .where(inArray(categories.id, categoryIds))
        : [];
    const categoryById = new Map(rows.map((row) => [row.id, row]));

    // Classifying requires the whole hierarchy, not just the two rows, so load
    // it the same way the analyzer does.
    const allCategories = await executor
      .select({
        id: categories.id,
        code: categories.code,
        name: categories.name,
        parentId: categories.parentId,
      })
      .from(categories);
    const hierarchy = new Map(allCategories.map((row) => [row.id, row]));

    const relation = compareCategoryRelation(
      canonical.categoryId,
      source.categoryId,
      hierarchy,
    );

    return {
      canonicalCategoryId: canonical.categoryId,
      canonicalCategoryName: canonical.categoryId
        ? (categoryById.get(canonical.categoryId)?.name ?? 'Assigned')
        : null,
      sourceCategoryId: source.categoryId,
      sourceCategoryName: source.categoryId
        ? (categoryById.get(source.categoryId)?.name ?? 'Assigned')
        : null,
      relation,
      note:
        relation === 'SAME'
          ? 'Both records share the same category.'
          : relation === 'RELATED'
            ? 'One category is an ancestor/descendant of the other.'
            : relation === 'INCOMPATIBLE'
              ? 'The categories are unrelated in the taxonomy.'
              : 'At least one record has no category, or the hierarchy is unavailable.',
    };
  }

  /**
   * Reports whether the reviewer has already decided this attribute.
   *
   * Matched by attribute definition id, which is the identity execution uses, so
   * the preview and the executor can never disagree about which decision belongs
   * to which attribute.
   */
  private attributeResolved(
    attributeDefinitionId: string,
    resolvedAttributeIds: ReadonlySet<string>,
  ): boolean {
    return resolvedAttributeIds.has(attributeDefinitionId);
  }

  private buildManufacturer(
    canonical: LoadedComponent,
    source: LoadedComponent,
    identity: ManufacturerIdentityIndex,
  ): ConsolidationManufacturerDto {
    const relation = compareManufacturerIdentity(
      canonical.manufacturerId,
      source.manufacturerId,
      identity,
    );
    const canonicalIdentity = resolveManufacturerIdentity(
      canonical.manufacturerId,
      identity,
    );

    return {
      canonicalManufacturerId: canonical.manufacturerId,
      canonicalManufacturerName: manufacturerIdentityName(
        canonicalIdentity,
        identity,
      ),
      sourceManufacturerId: source.manufacturerId,
      sourceManufacturerName: manufacturerIdentityName(
        resolveManufacturerIdentity(source.manufacturerId, identity),
        identity,
      ),
      relation,
      aliasResolved:
        canonicalIdentity !== null &&
        identity.aliasMergedIdentities.has(canonicalIdentity),
      note:
        relation === 'SAME'
          ? 'Both records resolve to the same manufacturer identity through the ERP model.'
          : relation === 'CONFLICT'
            ? 'Different manufacturer identities. Manufacturer records are never merged as part of component consolidation.'
            : 'At least one record has no manufacturer. Missing data is reported as informational, not as a conflict.',
    };
  }

  private async buildBomImpact(
    canonical: LoadedComponent,
    source: LoadedComponent,
    executor: DbExecutor,
  ): Promise<ConsolidationBomImpactDto> {
    const rows = await executor.execute<{
      id: string;
      bom_id: string;
      component_id: string;
      quantity_per_unit: string;
      scrap_factor_percent: string;
      notes: string | null;
      revision: string;
      status: string;
    }>(
      sql`select l.id, l.bom_id, l.component_id, l.quantity_per_unit, l.scrap_factor_percent, l.notes, b.revision, b.status from bill_of_material_lines l join bill_of_materials b on b.id = l.bom_id where l.component_id = ${canonical.id} or l.component_id = ${source.id} order by l.bom_id, l.id`,
    );

    const lines: BomLineRow[] = rows.rows.map((row) => ({
      id: row.id,
      bomId: row.bom_id,
      componentId: row.component_id,
      quantityPerUnit: row.quantity_per_unit,
      scrapFactorPercent: row.scrap_factor_percent,
      notes: row.notes,
      revision: row.revision,
      status: row.status,
    }));

    const canonicalLines = lines.filter(
      (line) => line.componentId === canonical.id,
    );
    const sourceLines = lines.filter((line) => line.componentId === source.id);
    const canonicalByBom = new Map(
      canonicalLines.map((line) => [line.bomId, line]),
    );
    const sourceByBom = new Map(sourceLines.map((line) => [line.bomId, line]));

    // The BOM aggregate forbids two lines for the same component in one BOM, so
    // any BOM listing both records is a hard collision.
    const collisions = [...sourceByBom.keys()]
      .filter((bomId) => canonicalByBom.has(bomId))
      .sort()
      .map((bomId) => {
        const canonicalLine = canonicalByBom.get(bomId)!;
        const sourceLine = sourceByBom.get(bomId)!;
        const combinedQuantity =
          Number(sourceLine.quantityPerUnit) +
          Number(canonicalLine.quantityPerUnit);
        return {
          bomId,
          canonicalLineId: canonicalLine.id,
          sourceLineId: sourceLine.id,
          canonicalQuantityPerUnit: canonicalLine.quantityPerUnit,
          sourceQuantityPerUnit: sourceLine.quantityPerUnit,
          canonicalScrapFactorPercent: canonicalLine.scrapFactorPercent,
          sourceScrapFactorPercent: sourceLine.scrapFactorPercent,
          combinedQuantityPerUnit: String(combinedQuantity),
          scrapFactorDecisionRequired:
            Number(canonicalLine.scrapFactorPercent) !==
            Number(sourceLine.scrapFactorPercent),
        };
      });

    const toDto = (line: BomLineRow) => ({
      bomId: line.bomId,
      bomRevision: line.revision,
      bomStatus: line.status,
      quantityPerUnit: line.quantityPerUnit,
      scrapFactorPercent: line.scrapFactorPercent,
      notes: line.notes,
    });

    return {
      canonicalLines: canonicalLines.map(toDto),
      sourceLines: sourceLines.map(toDto),
      collisions,
      collisionCount: collisions.length,
      canonicalOnlyCount: canonicalLines.filter(
        (line) => !sourceByBom.has(line.bomId),
      ).length,
      sourceOnlyCount: sourceLines.filter(
        (line) => !canonicalByBom.has(line.bomId),
      ).length,
      executionSupport: 'SUPPORTED',
      note: 'A source-only line is repointed onto the surviving component, keeping its id, quantity and scrap factor. A collision requires an explicit COMBINE resolution: the combined quantity is the sum of both lines and the scrap factor must be chosen. Released and obsolete BOMs cannot be amended and block the operation.',
    };
  }

  private async buildHistory(
    finding: ComponentReviewFindingDto,
    executor: DbExecutor,
  ): Promise<ConsolidationHistoryDto> {
    const componentIds = [
      finding.componentId,
      finding.relatedComponentId,
    ].filter((id): id is string => Boolean(id));

    const rows = await executor.execute<{
      id: string;
      component_id: string;
      related_component_id: string | null;
      issue_type: string;
      issue_category: string;
      status: string;
      suggested_value: Record<string, unknown> | null;
      metadata: Record<string, unknown> | null;
    }>(
      sql`select id, component_id, related_component_id, issue_type, issue_category, status, suggested_value, metadata from component_intelligence_findings where issue_category = 'DUPLICATE' and ${or(
        inArray(componentIntelligenceFindings.componentId, componentIds),
        inArray(componentIntelligenceFindings.relatedComponentId, componentIds),
      )} order by id`,
    );

    const relatedFindings = rows.rows
      .filter((row) => row.id !== finding.id)
      .map((row) => ({
        id: row.id,
        componentId: row.component_id,
        relatedComponentId: row.related_component_id,
        issueType: row.issue_type,
        status: row.status,
        matchType: this.readStoredMatchType(row.suggested_value, row.metadata),
      }));

    const feedback = await executor.execute<{ total: number }>(
      sql`select count(*)::int as total from ai_suggestion_feedback where ${inArray(aiSuggestionFeedback.componentId, componentIds)}`,
    );

    return {
      findingId: finding.id,
      findingIssueType: finding.issueType,
      findingMatchType: this.resolveMatchType(finding),
      findingStatus: finding.status,
      findingFingerprint: finding.fingerprint,
      relatedFindings,
      relatedFindingCount: relatedFindings.length,
      feedbackCount: Number(feedback.rows[0]?.total ?? 0),
      intelligenceVersion: COMPONENT_REVIEW_INTELLIGENCE_VERSION,
    };
  }

  private readStoredMatchType(
    suggestedValue: Record<string, unknown> | null,
    metadata: Record<string, unknown> | null,
  ): string | null {
    const candidates = [
      suggestedValue?.primaryMatchType,
      suggestedValue?.matchType,
      metadata?.primaryMatchType,
      metadata?.matchType,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate) return candidate;
    }
    return null;
  }

  /** Detects identical code values (batch/serial) across the two components. */
  private async detectCodeCollisions(
    table: 'batches' | 'serials',
    column: 'batch_number' | 'serial_number',
    sourceComponentId: string,
    canonicalComponentId: string,
    executor: DbExecutor,
  ): Promise<string[]> {
    const rows = await executor.execute<{ code: string }>(
      sql`select s.${sql.identifier(column)} as code from ${sql.identifier(table)} s join ${sql.identifier(table)} c on c.${sql.identifier(column)} = s.${sql.identifier(column)} and c.component_id = ${canonicalComponentId} where s.component_id = ${sourceComponentId} order by code limit 10`,
    );
    return rows.rows.map((row) => row.code);
  }

  private mergeDependencies(
    canonicalAnalyses: DependencyAnalysis[],
    sourceAnalyses: DependencyAnalysis[],
  ): ConsolidationDependencyDto[] {
    const sourceById = new Map(
      sourceAnalyses.map((entry) => [entry.id, entry]),
    );

    return canonicalAnalyses
      .map((entry) => {
        const sourceEntry = sourceById.get(entry.id);
        const canonicalCount = entry.count;
        const sourceCount = sourceEntry?.count ?? 0;
        const openCount =
          (entry.openCount ?? 0) + (sourceEntry?.openCount ?? 0);
        const historicalCount =
          (entry.historicalCount ?? 0) + (sourceEntry?.historicalCount ?? 0);
        const blocking =
          entry.classification === 'UNKNOWN' ||
          entry.executionSupport === 'UNSUPPORTED';

        return {
          id: entry.id,
          label: entry.label,
          entity: entry.entity,
          referenceKind: entry.referenceKind,
          classification: entry.classification,
          executionSupport: entry.executionSupport,
          temporality: entry.temporality,
          count: canonicalCount + sourceCount,
          openCount:
            entry.openCount === null && sourceEntry?.openCount === null
              ? null
              : openCount,
          historicalCount:
            entry.historicalCount === null &&
            sourceEntry?.historicalCount === null
              ? null
              : historicalCount,
          sampleIds: [
            ...entry.sampleIds,
            ...(sourceEntry?.sampleIds ?? []),
          ].slice(0, 5),
          supportNote: entry.supportNote,
          canonicalCount,
          sourceCount,
          blocking,
        };
      })
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  private appendDependencyConflicts(
    push: (conflict: ConsolidationConflictDto) => void,
    dependencies: ConsolidationDependencyDto[],
    context: {
      canonicalComponent: LoadedComponent;
      sourceComponent: LoadedComponent;
    },
  ): void {
    for (const dependency of dependencies) {
      if (dependency.referenceKind === 'POLYMORPHIC') continue; // reported separately

      // `MUST_NOT_CHANGE` means "consolidation must not touch these rows, and
      // their presence blocks the operation while they are still live". The
      // open/current count is used when the adapter can tell the difference, so
      // a closed purchase order or an already-actioned recommendation does not
      // block while an open one does.
      const currentCount = dependency.openCount ?? dependency.count;
      if (dependency.classification === 'MUST_NOT_CHANGE') {
        if (currentCount === 0) continue;
        push(
          this.conflict({
            code: 'UNSUPPORTED_DEPENDENCY',
            title: `${dependency.label} must not be changed`,
            description: `${currentCount} row(s) reference these components. ${dependency.supportNote}`,
            entityType: dependency.entity,
            entityIds: dependency.sampleIds,
            canonicalComponentId: context.canonicalComponent.id,
            sourceComponentId: context.sourceComponent.id,
            affectedCount: currentCount,
          }),
        );
        continue;
      }

      // Only report dependencies that actually reference something, plus the
      // structural blockers that apply regardless.
      const isStructuralBlocker =
        dependency.classification === 'UNKNOWN' ||
        dependency.executionSupport === 'UNSUPPORTED';

      if (dependency.count === 0 && !isStructuralBlocker) continue;

      if (dependency.classification === 'UNKNOWN') {
        push(
          this.conflict({
            code: 'UNSUPPORTED_DEPENDENCY',
            title: `Undefined consolidation semantics for ${dependency.label}`,
            description: `The ${dependency.entity} relationship is classified UNKNOWN. ${
              dependency.supportNote
            } Unknown dependencies always block execution.`,
            entityType: dependency.entity,
            entityIds: dependency.sampleIds,
            canonicalComponentId: context.canonicalComponent.id,
            sourceComponentId: context.sourceComponent.id,
            affectedCount: dependency.count,
          }),
        );
        continue;
      }
    }
  }

  private buildPolymorphicReferences(
    dependencies: ConsolidationDependencyDto[],
  ): ConsolidationPolymorphicReferenceDto[] {
    return dependencies
      .filter((dependency) => dependency.referenceKind === 'POLYMORPHIC')
      .map((dependency) => {
        const policy = POLYMORPHIC_REFERENCE_POLICIES.find(
          (entry) => entry.table === dependency.id,
        );
        return {
          id: dependency.id,
          label: dependency.label,
          entity: dependency.entity,
          canonicalCount: dependency.canonicalCount,
          sourceCount: dependency.sourceCount,
          sampleIds: dependency.sampleIds,
          // Fail closed: a table with no policy is still reported as
          // unsupported, so an unclassified reference blocks rather than being
          // silently ignored.
          supported: policy ? true : false,
          semantics: policy?.semantics ?? 'UNCLASSIFIED',
          note: policy?.rationale ?? dependency.supportNote,
        };
      });
  }

  private buildRetirement(
    canonical: LoadedComponent,
    source: LoadedComponent,
  ): ConsolidationRetirementDto {
    return {
      canonicalIsActive: canonical.isActive,
      sourceIsActive: source.isActive,
      supportedMechanism:
        'Consolidation retires the source through the ACTIVE/CONSOLIDATED lifecycle: isActive becomes false, consolidatedIntoComponentId points at the surviving component, and consolidationId/consolidatedAt record which operation did it. The source is never deleted and stays historically identifiable.',
      missingSemantics: [],
      executionSupport: 'SUPPORTED',
      note: 'The surviving component stays active. A consolidated component is excluded from selectable-active queries, may not receive new inventory transactions, and may not have its master data edited or be hard deleted.',
    };
  }

  private buildProposedChanges(
    dependencies: ConsolidationDependencyDto[],
    inventory: ConsolidationInventoryDto,
    bom: ConsolidationBomImpactDto,
  ): ConsolidationProposedChangeDto[] {
    const changes: ConsolidationProposedChangeDto[] = [];
    const byClassification = (classification: string) =>
      dependencies.filter(
        (dependency) => dependency.classification === classification,
      );

    const repoint = byClassification('MUST_REPOINT');
    if (repoint.length > 0) {
      changes.push({
        entity: repoint.map((entry) => entry.entity).join(', '),
        action: 'REPOINT',
        recordCount: repoint.reduce((total, entry) => total + entry.count, 0),
        executionSupport: 'UNSUPPORTED',
        note: 'Current references would move to the surviving record. No repointing is implemented.',
      });
    }

    const reconcile = byClassification('MUST_RECONCILE');
    if (reconcile.length > 0) {
      changes.push({
        entity: reconcile.map((entry) => entry.entity).join(', '),
        action: 'RECONCILE',
        recordCount: reconcile.reduce((total, entry) => total + entry.count, 0),
        executionSupport: 'UNSUPPORTED',
        note: 'These records need a decision rather than a simple repoint (collisions, values, or balances).',
      });
    }

    const preserve = [
      ...byClassification('MUST_PRESERVE'),
      ...byClassification('UNKNOWN'),
    ];
    if (preserve.length > 0) {
      changes.push({
        entity: preserve.map((entry) => entry.entity).join(', '),
        action: 'PRESERVE',
        recordCount: preserve.reduce((total, entry) => total + entry.count, 0),
        executionSupport: 'NOT_APPLICABLE',
        note: 'Historical records keep their original component identity. Consolidation changes identity, not history.',
      });
    }

    if (inventory.proposedReconciliation.length > 0) {
      changes.push({
        entity: 'inventory_transactions',
        action: 'POST_LEDGER_ENTRY',
        recordCount: inventory.proposedReconciliation.length,
        executionSupport: 'UNSUPPORTED',
        note: 'A future implementation could post compensating Issue/Receipt pairs per location. Nothing is posted today.',
      });
    }

    if (bom.collisions.length > 0) {
      changes.push({
        entity: 'bill_of_material_lines',
        action: 'MANUAL_DECISION',
        recordCount: bom.collisions.length * 2,
        executionSupport: 'UNSUPPORTED',
        note: 'BOM collisions must be resolved by a human before any execution is possible.',
      });
    }

    changes.push({
      entity: 'components',
      action: 'RETIRE',
      recordCount: 1,
      executionSupport: 'UNSUPPORTED',
      note: 'The retired record would need a lifecycle the domain does not currently define.',
    });

    return changes;
  }

  private toReferenceSummary(
    dependencies: ConsolidationDependencyDto[],
    ids: string[],
  ): ConsolidationReferenceSummaryDto {
    const selected = dependencies.filter((dependency) =>
      ids.includes(dependency.id),
    );

    return {
      historicalCount: selected.reduce(
        (total, dependency) =>
          total +
          (dependency.historicalCount ??
            (dependency.classification === 'MUST_PRESERVE'
              ? dependency.count
              : 0)),
        0,
      ),
      openCount: selected.reduce(
        (total, dependency) => total + (dependency.openCount ?? 0),
        0,
      ),
      repointCount: selected
        .filter((dependency) => dependency.classification === 'MUST_REPOINT')
        .reduce((total, dependency) => total + dependency.count, 0),
      reconcileCount: selected
        .filter((dependency) => dependency.classification === 'MUST_RECONCILE')
        .reduce((total, dependency) => total + dependency.count, 0),
      unknownCount: selected
        .filter((dependency) => dependency.classification === 'UNKNOWN')
        .reduce((total, dependency) => total + dependency.count, 0),
      // Every referencing row, so the UI can show a total without adding up
      // overlapping categories.
      count: selected.reduce(
        (total, dependency) => total + dependency.count,
        0,
      ),
    };
  }

  private sumOpenCounts(
    dependencies: ConsolidationDependencyDto[],
    ids: string[],
  ): number {
    return dependencies
      .filter((dependency) => ids.includes(dependency.id))
      .reduce((total, dependency) => total + (dependency.openCount ?? 0), 0);
  }

  private findDependencyCounts(
    dependencies: ConsolidationDependencyDto[],
    ids: string[],
  ): { canonicalCount: number; sourceCount: number } {
    return dependencies
      .filter((dependency) => ids.includes(dependency.id))
      .reduce(
        (total, dependency) => ({
          canonicalCount: total.canonicalCount + dependency.canonicalCount,
          sourceCount: total.sourceCount + dependency.sourceCount,
        }),
        { canonicalCount: 0, sourceCount: 0 },
      );
  }

  private conflict(input: {
    code: ConsolidationConflictCode;
    title: string;
    description: string;
    entityType: string;
    entityIds?: string[];
    canonicalComponentId: string | null;
    sourceComponentId: string | null;
    affectedCount?: number | null;
    /**
     * True when the reviewer has already supplied the decision this conflict
     * needs, so it no longer blocks.
     */
    resolved?: boolean;
  }): ConsolidationConflictDto {
    const severity = CONFLICT_SEVERITIES[input.code];
    const resolvable = RESOLVABLE_CONFLICT_CODES.has(input.code);
    const resolved = input.resolved === true;
    const resolutionRequired =
      (severity === 'BLOCKING' && resolvable) ||
      UNRESOLVED_CONFLICT_CODES.has(input.code);

    return {
      code: input.code,
      severity,
      title: input.title,
      description: input.description,
      entityType: input.entityType,
      entityIds: input.entityIds ?? [],
      affectedCount: input.affectedCount ?? null,
      sourceComponentId: input.sourceComponentId,
      canonicalComponentId: input.canonicalComponentId,
      resolutionRequired,
      // Only a still-undecided blocking conflict prevents execution. A resolved
      // one, or one no reviewer decision can fix, is reported but does not
      // gate: the unresolvable codes are surfaced as BLOCKING severity and are
      // therefore never silently ignored.
      blocksExecution: severity === 'BLOCKING' && !resolved,
      resolutionSupported:
        resolvable && !UNRESOLVED_CONFLICT_CODES.has(input.code),
    };
  }

  /**
   * Deterministic fingerprint over the full preview basis.
   *
   * Any change to either component, the finding, or an affected reference
   * invalidates it. No timestamps participate, so re-running a preview on
   * unchanged data always produces the same value.
   */
  private buildPreviewFingerprint(
    preview: Omit<ConsolidationPreviewDto, 'previewFingerprint'>,
  ): string {
    return crypto
      .createHash('sha256')
      .update(stableStringify(this.buildPreviewFingerprintPayload(preview)))
      .digest('hex');
  }

  /**
   * The exact object the fingerprint hashes.
   *
   * Extracted so the contract is inspectable: when a preview is refused as
   * stale, the difference between the two inputs can be diffed field by field
   * instead of guessed at. It is also what the determinism test compares.
   *
   * Deliberately EXCLUDED, because none of them describe authoritative state:
   *
   *  - `computedAt` (and every other timestamp that is not persisted),
   *  - the human-readable `title`/`description`/`note` prose on conflicts,
   *    dependencies and proposed changes,
   *  - `canonicalCandidates` ranking metadata,
   *  - `history.relatedFindings`, which is evidence rather than state,
   *  - anything derived from the executor or the transaction.
   */
  buildPreviewFingerprintPayload(
    preview: Omit<ConsolidationPreviewDto, 'previewFingerprint'>,
  ): Record<string, unknown> {
    const payload = {
      previewVersion: preview.previewVersion,
      intelligenceVersion: preview.intelligenceVersion,
      findingId: preview.findingId,
      findingFingerprint: preview.history.findingFingerprint,
      findingStatus: preview.history.findingStatus,
      canonical: {
        id: preview.canonical.id,
        updatedAt: preview.canonical.updatedAt,
        sku: preview.canonical.sku,
        manufacturerId: preview.canonical.manufacturerId,
        manufacturerPartNumber: preview.canonical.manufacturerPartNumber,
        categoryId: preview.canonical.categoryId,
        unit: preview.canonical.unit,
        isActive: preview.canonical.isActive,
      },
      sources: preview.sources.map((source) => ({
        id: source.id,
        updatedAt: source.updatedAt,
        sku: source.sku,
        manufacturerId: source.manufacturerId,
        manufacturerPartNumber: source.manufacturerPartNumber,
        categoryId: source.categoryId,
        unit: source.unit,
        isActive: source.isActive,
      })),
      eligibility: {
        eligible: preview.eligibility.eligible,
        reasonCodes: [...preview.eligibility.reasonCodes].sort(),
      },
      dependencies: preview.dependencies.map((dependency) => ({
        id: dependency.id,
        classification: dependency.classification,
        executionSupport: dependency.executionSupport,
        count: dependency.count,
        canonicalCount: dependency.canonicalCount,
        sourceCount: dependency.sourceCount,
        openCount: dependency.openCount,
        historicalCount: dependency.historicalCount,
      })),
      inventory: {
        canonicalTotal: preview.inventory.canonical.totalQuantity,
        sourceTotal: preview.inventory.source.totalQuantity,
        byLocation: preview.inventory.byLocation.map((row) => ({
          locationId: row.locationId,
          canonicalQuantity: row.canonicalQuantity,
          sourceQuantity: row.sourceQuantity,
        })),
      },
      attributes: preview.attributes.entries.map((entry) => ({
        code: entry.code,
        classification: entry.classification,
        canonicalValue: entry.canonicalValue,
        sourceValue: entry.sourceValue,
      })),
      category: {
        canonicalCategoryId: preview.category.canonicalCategoryId,
        sourceCategoryId: preview.category.sourceCategoryId,
        relation: preview.category.relation,
      },
      manufacturer: {
        canonicalManufacturerId: preview.manufacturer.canonicalManufacturerId,
        sourceManufacturerId: preview.manufacturer.sourceManufacturerId,
        relation: preview.manufacturer.relation,
      },
      bom: {
        collisions: preview.bom.collisions.map((collision) => ({
          bomId: collision.bomId,
          canonicalLineId: collision.canonicalLineId,
          sourceLineId: collision.sourceLineId,
        })),
        canonicalOnlyCount: preview.bom.canonicalOnlyCount,
        sourceOnlyCount: preview.bom.sourceOnlyCount,
      },
      conflicts: preview.conflicts.map((conflict) => ({
        code: conflict.code,
        severity: conflict.severity,
        entityType: conflict.entityType,
        affectedCount: conflict.affectedCount,
      })),
      dependencyCoverage: preview.dependencyCoverage,
    };

    return payload;
  }

  /**
   * Preview for findings that cannot be analysed at all (missing component,
   * non-duplicate, self-match). Returns an explicit, honest empty shape rather
   * than pretending to compute an impact.
   */
  private buildUnanalyzablePreview(input: {
    finding: ComponentReviewFindingDto;
    reasonCodes: ConsolidationEligibilityReason[];
    explanations: string[];
    previewVersion: string;
  }): ConsolidationPreviewDto {
    const emptySummary: ConsolidationReferenceSummaryDto = {
      historicalCount: 0,
      openCount: 0,
      repointCount: 0,
      reconcileCount: 0,
      unknownCount: 0,
      count: 0,
    };
    const placeholderComponent: ConsolidationComponentSummaryDto = {
      id: input.finding.componentId,
      sku: input.finding.component?.sku ?? 'unknown',
      name: input.finding.component?.name ?? 'unknown',
      manufacturerId: input.finding.component?.manufacturerId ?? null,
      manufacturerPartNumber:
        input.finding.component?.manufacturerPartNumber ?? null,
      categoryId: input.finding.component?.categoryId ?? null,
      unit: input.finding.component?.unit ?? 'pcs',
      isActive: input.finding.component?.isActive ?? false,
      createdAt: input.finding.createdAt,
      updatedAt: input.finding.updatedAt,
    };

    const conflicts: ConsolidationConflictDto[] = [
      this.conflict({
        code: 'FINDING_NOT_ELIGIBLE',
        title: 'This finding cannot be analysed for consolidation',
        description: input.explanations.join(' '),
        entityType: 'component_intelligence_findings',
        entityIds: [input.finding.id],
        canonicalComponentId: null,
        sourceComponentId: null,
        affectedCount: 1,
      }),
      this.conflict({
        code: 'ATOMICITY_UNAVAILABLE',
        title: 'Cross-subsystem atomic transaction boundary unavailable',
        description:
          'Consolidation execution is blocked by design in this pass regardless of finding eligibility.',
        entityType: 'platform',
        canonicalComponentId: null,
        sourceComponentId: null,
      }),
      this.conflict({
        code: 'UNSUPPORTED_RETIREMENT_STATE',
        title: 'Component retirement semantics are not defined',
        description:
          'There is no supported lifecycle for retiring a component after consolidation.',
        entityType: 'components',
        canonicalComponentId: null,
        sourceComponentId: null,
      }),
    ];

    const preview: Omit<ConsolidationPreviewDto, 'previewFingerprint'> = {
      findingId: input.finding.id,
      executable: false,
      executionBlockedReasons: conflicts.map((conflict) => ({
        code: conflict.code,
        title: conflict.title,
        description: conflict.description,
      })),
      canonical: placeholderComponent,
      sources: [],
      canonicalCandidates: [],
      eligibility: {
        eligible: false,
        reasonCodes: input.reasonCodes,
        explanations: input.explanations,
      },
      conflicts,
      dependencies: [],
      inventory: {
        canonical: {
          componentId: placeholderComponent.id,
          totalQuantity: 0,
          locations: [],
          ledgerTransactionCount: 0,
        },
        source: {
          componentId: '',
          totalQuantity: 0,
          locations: [],
          ledgerTransactionCount: 0,
        },
        byLocation: [],
        combinedTotalQuantity: 0,
        proposedReconciliation: [],
        executionSupport: 'UNSUPPORTED',
        note: 'Not analysed: the finding could not be resolved to two existing components.',
      },
      attributes: {
        entries: [],
        identicalCount: 0,
        canonicalOnlyCount: 0,
        sourceOnlyCount: 0,
        conflictingCount: 0,
      },
      category: {
        canonicalCategoryId: null,
        canonicalCategoryName: null,
        sourceCategoryId: null,
        sourceCategoryName: null,
        relation: 'UNKNOWN',
        note: 'Not analysed.',
      },
      manufacturer: {
        canonicalManufacturerId: null,
        canonicalManufacturerName: null,
        sourceManufacturerId: null,
        sourceManufacturerName: null,
        relation: 'INDETERMINATE',
        aliasResolved: false,
        note: 'Not analysed.',
      },
      bom: {
        canonicalLines: [],
        sourceLines: [],
        collisions: [],
        collisionCount: 0,
        canonicalOnlyCount: 0,
        sourceOnlyCount: 0,
        executionSupport: 'UNSUPPORTED',
        note: 'Not analysed.',
      },
      procurement: emptySummary,
      reservations: emptySummary,
      batches: emptySummary,
      serials: emptySummary,
      historicalReferences: emptySummary,
      polymorphicReferences: [],
      retirement: {
        canonicalIsActive: placeholderComponent.isActive,
        sourceIsActive: false,
        supportedMechanism: 'Not analysed.',
        missingSemantics: [],
        executionSupport: 'UNSUPPORTED',
        note: 'Not analysed.',
      },
      history: {
        findingId: input.finding.id,
        findingIssueType: input.finding.issueType,
        findingMatchType: this.resolveMatchType(input.finding),
        findingStatus: input.finding.status,
        findingFingerprint: input.finding.fingerprint,
        relatedFindings: [],
        relatedFindingCount: 0,
        feedbackCount: 0,
        intelligenceVersion: COMPONENT_REVIEW_INTELLIGENCE_VERSION,
      },
      proposedChanges: [],
      dependencyCoverage: {
        ok: true,
        databaseReferenceCount: 0,
        registeredReferenceCount: 0,
        unregisteredReferences: [],
      },
      previewVersion: input.previewVersion,
      intelligenceVersion: COMPONENT_REVIEW_INTELLIGENCE_VERSION,
      computedAt: new Date().toISOString(),
    };

    this.logger.warn(
      `Consolidation preview for finding ${input.finding.id} is not analyzable: ${input.reasonCodes.join(', ')}`,
    );

    return {
      ...preview,
      previewFingerprint: this.buildPreviewFingerprint(preview),
    };
  }
}

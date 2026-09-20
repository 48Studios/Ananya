import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type {
  DependencyClassification,
  ExecutionSupport,
} from './component-consolidation-dependencies';

/**
 * Consolidation preview contracts (Pass 6A).
 *
 * This pass is READ-ONLY: the preview describes what consolidation would affect
 * and why it is currently blocked. There is no execution contract here, by
 * design.
 */

/** Bumped when preview semantics change, so fingerprints are re-evaluated. */
export const CONSOLIDATION_PREVIEW_VERSION = 'consolidation-preview-v2';

/** Severity classes. Exactly three, per the pass contract. */
export const CONSOLIDATION_SEVERITIES = [
  'BLOCKING',
  'WARNING',
  'INFORMATIONAL',
] as const;

export type ConsolidationSeverity = (typeof CONSOLIDATION_SEVERITIES)[number];

/**
 * Why a duplicate finding cannot enter consolidation analysis.
 *
 * Note there is no "finding is not pending" reason: an ACCEPTED duplicate is a
 * valid starting point for consolidation. Accepting acknowledges that the
 * duplication is real; consolidating is the separate action that merges the two
 * records. Requiring PENDING would force the reviewer to skip the acknowledgement
 * step entirely.
 */
export type ConsolidationEligibilityReason =
  | 'NOT_A_DUPLICATE_FINDING'
  | 'RELATED_COMPONENT_MISSING'
  | 'SELF_MATCH'
  | 'FINDING_STATUS_NOT_CONSOLIDATABLE'
  | 'FINDING_STALE'
  | 'MATCH_TYPE_NOT_CONSOLIDATABLE'
  | 'INSUFFICIENT_CONFIDENCE'
  | 'MANUFACTURER_CONFLICT_UNRESOLVED'
  | 'COMPONENT_NOT_FOUND'
  | 'COMPONENT_INACTIVE'
  | 'COMPONENT_ALREADY_CONSOLIDATED'
  | 'PREVIEW_CANONICAL_NOT_IN_PAIR';

/** Conflict codes emitted by the preview. Severity is chosen per code. */
export type ConsolidationConflictCode =
  // Eligibility / lifecycle
  | 'FINDING_NOT_ELIGIBLE'
  // Identity
  | 'MANUFACTURER_CONFLICT'
  | 'CATEGORY_INCOMPATIBLE'
  // Data reconciliation
  | 'ATTRIBUTE_VALUE_DIFFERENCE'
  | 'ATTRIBUTE_SOURCE_ONLY_VALUE'
  | 'CATEGORY_HIERARCHY_RECONCILIATION'
  | 'CATEGORY_UNASSIGNED'
  | 'EXISTING_CANONICAL_ATTRIBUTES'
  | 'SUPPLIER_REFERENCE_DUPLICATION'
  // Inventory and operations
  | 'INVENTORY_PRESENT'
  | 'INITIAL_STOCK_UNSUPPORTED'
  | 'BATCH_COLLISION'
  | 'SERIAL_COLLISION'
  | 'ACTIVE_RESERVATION_REQUIRES_POLICY'
  | 'OPEN_PROCUREMENT_REFERENCE'
  // Structure
  | 'BOM_COLLISION'
  | 'BOM_REFERENCE_REQUIRES_POLICY'
  // Cross-cutting blockers
  | 'ATOMICITY_UNAVAILABLE'
  | 'UNSUPPORTED_RETIREMENT_STATE'
  | 'UNSUPPORTED_POLYMORPHIC_REFERENCE'
  | 'UNSUPPORTED_DEPENDENCY'
  | 'DEPENDENCY_REGISTRY_DRIFT'
  // Informational
  | 'HISTORICAL_REFERENCE'
  | 'EXISTING_CANONICAL_DATA'
  | 'FINDING_HISTORY'
  | 'FEEDBACK_HISTORY';

export interface ConsolidationConflictDto {
  /** Stable machine code. */
  code: ConsolidationConflictCode;
  severity: ConsolidationSeverity;
  title: string;
  description: string;
  /** Logical entity/table this conflict concerns (e.g. `bill_of_material_lines`). */
  entityType: string;
  /** Representative affected record ids, bounded. */
  entityIds: string[];
  /** Count of affected records, when the conflict is count-based. */
  affectedCount: number | null;
  /** The component that would be retired. */
  sourceComponentId: string | null;
  /** The surviving component. */
  canonicalComponentId: string | null;
  /** True when a human decision is required before execution. */
  resolutionRequired: boolean;
  /**
   * True when this conflict prevents execution *today*. Derived from severity
   * plus `resolutionRequired`, because this pass implements no resolution
   * mechanism: anything needing a human decision therefore still blocks.
   */
  blocksExecution: boolean;
  /** Whether the specific decision this conflict needs exists yet. */
  resolutionSupported: boolean;
}

export interface ConsolidationComponentSummaryDto {
  id: string;
  sku: string;
  name: string;
  manufacturerId: string | null;
  manufacturerPartNumber: string | null;
  categoryId: string | null;
  unit: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConsolidationCanonicalCandidateDto {
  componentId: string;
  isActive: boolean;
  hasInventory: boolean;
  createdAt: string;
  /** Deterministic reason this component is suggested as canonical. */
  reason: string;
}

export interface ConsolidationEligibilityDto {
  eligible: boolean;
  reasonCodes: ConsolidationEligibilityReason[];
  /** Human explanation for each reason code. */
  explanations: string[];
}

export interface ConsolidationDependencyDto {
  id: string;
  label: string;
  entity: string;
  referenceKind: 'FK' | 'POLYMORPHIC';
  classification: DependencyClassification;
  executionSupport: ExecutionSupport;
  temporality: string;
  count: number;
  openCount: number | null;
  historicalCount: number | null;
  sampleIds: string[];
  supportNote: string;
  /** Counts for each side of the pair, so the UI can show the split. */
  canonicalCount: number;
  sourceCount: number;
  blocking: boolean;
}

export interface ConsolidationInventoryLocationDto {
  locationId: string;
  quantity: number;
  unitOfMeasure: string;
}

export interface ConsolidationInventorySideDto {
  componentId: string;
  totalQuantity: number;
  locations: ConsolidationInventoryLocationDto[];
  ledgerTransactionCount: number;
}

export interface ConsolidationInventoryLocationImpactDto {
  locationId: string;
  canonicalQuantity: number;
  sourceQuantity: number;
  combinedQuantity: number;
  unitOfMeasure: string;
}

export interface ConsolidationProposedLedgerEntryDto {
  action: 'ISSUE_SOURCE' | 'RECEIPT_CANONICAL';
  locationId: string;
  quantity: number;
  unitOfMeasure: string;
}

export interface ConsolidationInventoryDto {
  canonical: ConsolidationInventorySideDto;
  source: ConsolidationInventorySideDto;
  byLocation: ConsolidationInventoryLocationImpactDto[];
  combinedTotalQuantity: number;
  /**
   * What a future reconciliation *could* look like through the existing ledger.
   * Explicitly not an executed or approved operation.
   */
  proposedReconciliation: ConsolidationProposedLedgerEntryDto[];
  executionSupport: ExecutionSupport;
  note: string;
}

export interface ConsolidationAttributeEntryDto {
  /** The attribute definition id, used to submit a resolution for this entry. */
  attributeDefinitionId: string;
  code: string;
  label: string;
  dataType: string;
  canonicalValue: string | null;
  sourceValue: string | null;
  classification:
    'IDENTICAL' | 'CANONICAL_ONLY' | 'SOURCE_ONLY' | 'CONFLICTING';
  /** Whether the reviewer would have to decide something. */
  resolutionRequired: boolean;
  /** Whether a resolution mechanism exists for this entry. */
  resolutionSupported: boolean;
}

export interface ConsolidationAttributesDto {
  entries: ConsolidationAttributeEntryDto[];
  identicalCount: number;
  canonicalOnlyCount: number;
  sourceOnlyCount: number;
  conflictingCount: number;
}

export interface ConsolidationCategoryDto {
  canonicalCategoryId: string | null;
  canonicalCategoryName: string | null;
  sourceCategoryId: string | null;
  sourceCategoryName: string | null;
  /** `SAME` | `RELATED` | `INCOMPATIBLE` | `UNKNOWN`. */
  relation: 'SAME' | 'RELATED' | 'INCOMPATIBLE' | 'UNKNOWN';
  note: string;
}

export interface ConsolidationManufacturerDto {
  canonicalManufacturerId: string | null;
  canonicalManufacturerName: string | null;
  sourceManufacturerId: string | null;
  sourceManufacturerName: string | null;
  /** `SAME` | `CONFLICT` | `INDETERMINATE`, from the identity resolver. */
  relation: 'SAME' | 'CONFLICT' | 'INDETERMINATE';
  aliasResolved: boolean;
  note: string;
}

export interface ConsolidationBomLineDto {
  bomId: string;
  bomRevision: string;
  bomStatus: string;
  quantityPerUnit: string;
  scrapFactorPercent: string;
  notes: string | null;
}

export interface ConsolidationBomImpactDto {
  canonicalLines: ConsolidationBomLineDto[];
  sourceLines: ConsolidationBomLineDto[];
  /** BOMs containing lines for BOTH components: the case the domain forbids. */
  collisions: Array<{
    bomId: string;
    canonicalLineId: string;
    sourceLineId: string;
    canonicalQuantityPerUnit: string;
    sourceQuantityPerUnit: string;
    canonicalScrapFactorPercent: string;
    sourceScrapFactorPercent: string;
    /** `source + canonical`, the quantity a COMBINE resolution produces. */
    combinedQuantityPerUnit: string;
    /** True when the two scrap factors differ and require an explicit choice. */
    scrapFactorDecisionRequired: boolean;
  }>;
  collisionCount: number;
  canonicalOnlyCount: number;
  sourceOnlyCount: number;
  executionSupport: ExecutionSupport;
  note: string;
}

export interface ConsolidationReferenceSummaryDto {
  /** Total rows that would have to keep their current component identity. */
  historicalCount: number;
  /** Total rows that are still open/current. */
  openCount: number;
  /** Total rows that would need repointing. */
  repointCount: number;
  /** Total rows needing reconciliation rather than a simple repoint. */
  reconcileCount: number;
  /** Dependencies whose semantics are undefined. */
  unknownCount: number;
  /** Total rows across every classification, for display. */
  count: number;
}

export interface ConsolidationPolymorphicReferenceDto {
  id: string;
  label: string;
  entity: string;
  canonicalCount: number;
  sourceCount: number;
  sampleIds: string[];
  /** True when consolidation has defined semantics for this table. */
  supported: boolean;
  /** The defined semantics, or `UNCLASSIFIED` when none exist. */
  semantics: string;
  note: string;
}

export interface ConsolidationRetirementDto {
  canonicalIsActive: boolean;
  sourceIsActive: boolean;
  /** The lifecycle the domain actually supports today. */
  supportedMechanism: string;
  missingSemantics: string[];
  executionSupport: ExecutionSupport;
  note: string;
}

export interface ConsolidationHistoryDto {
  findingId: string;
  findingIssueType: string;
  findingMatchType: string | null;
  findingStatus: string;
  findingFingerprint: string;
  /** Other duplicate findings involving either component. */
  relatedFindings: Array<{
    id: string;
    componentId: string;
    relatedComponentId: string | null;
    issueType: string;
    status: string;
    matchType: string | null;
  }>;
  relatedFindingCount: number;
  feedbackCount: number;
  intelligenceVersion: string;
}

/** A description of something consolidation *would* change, never executed. */
export interface ConsolidationProposedChangeDto {
  entity: string;
  action:
    | 'REPOINT'
    | 'RECONCILE'
    | 'PRESERVE'
    | 'RETIRE'
    | 'POST_LEDGER_ENTRY'
    | 'MANUAL_DECISION';
  recordCount: number;
  executionSupport: ExecutionSupport;
  note: string;
}

export interface ConsolidationPreviewDto {
  findingId: string;
  /**
   * True when nothing blocks this consolidation any more: the reviewer may
   * execute. Computed from the blocking conflicts after applying whatever
   * resolutions were supplied, never set by the client.
   */
  executable: boolean;
  executionBlockedReasons: Array<{
    code: ConsolidationConflictCode;
    title: string;
    description: string;
  }>;
  canonical: ConsolidationComponentSummaryDto;
  sources: ConsolidationComponentSummaryDto[];
  canonicalCandidates: ConsolidationCanonicalCandidateDto[];
  eligibility: ConsolidationEligibilityDto;
  conflicts: ConsolidationConflictDto[];
  dependencies: ConsolidationDependencyDto[];
  inventory: ConsolidationInventoryDto;
  attributes: ConsolidationAttributesDto;
  category: ConsolidationCategoryDto;
  manufacturer: ConsolidationManufacturerDto;
  bom: ConsolidationBomImpactDto;
  procurement: ConsolidationReferenceSummaryDto;
  reservations: ConsolidationReferenceSummaryDto;
  batches: ConsolidationReferenceSummaryDto;
  serials: ConsolidationReferenceSummaryDto;
  historicalReferences: ConsolidationReferenceSummaryDto;
  polymorphicReferences: ConsolidationPolymorphicReferenceDto[];
  retirement: ConsolidationRetirementDto;
  history: ConsolidationHistoryDto;
  proposedChanges: ConsolidationProposedChangeDto[];
  dependencyCoverage: {
    ok: boolean;
    databaseReferenceCount: number;
    registeredReferenceCount: number;
    unregisteredReferences: string[];
  };
  previewFingerprint: string;
  previewVersion: string;
  intelligenceVersion: string;
  /** ISO timestamp of when this preview was computed (not part of the fingerprint). */
  computedAt: string;
}

/**
 * Decisions the reviewer has already made, supplied back to the preview so it
 * can recompute `executable` on the *post-resolution* state.
 *
 * Only the identity of each decision is needed here, not the value: the preview
 * answers "is anything still undecided?", and execution validates the values
 * themselves inside the transaction.
 */
export interface ConsolidationResolutionContext {
  attributeResolutions: Array<{
    attributeDefinitionId: string;
    strategy: string;
  }>;
  bomResolutions: Array<{ bomId: string }>;
}

/** An attribute decision supplied to the preview. */
export class ConsolidationAttributeResolutionDto {
  @IsUUID()
  attributeDefinitionId!: string;

  /** One of the four attribute resolution strategies. */
  @IsString()
  @MaxLength(32)
  strategy!: string;
}

/** A BOM collision decision supplied to the preview. */
export class ConsolidationBomResolutionDto {
  @IsUUID()
  bomId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  resolution?: string;
}

/** Optional request body: lets the reviewer preview a specific direction. */
export class ConsolidationPreviewRequestDto {
  /**
   * The component that would survive. Omit to preview the deterministic
   * suggestion. Must be one of the two components in the finding.
   */
  @IsOptional()
  @IsUUID()
  canonicalComponentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  previewVersion?: string;

  /** Attribute decisions the reviewer has already made. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConsolidationAttributeResolutionDto)
  attributeResolutions?: ConsolidationAttributeResolutionDto[];

  /** BOM collision decisions the reviewer has already made. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConsolidationBomResolutionDto)
  bomResolutions?: ConsolidationBomResolutionDto[];
}

import type { DbExecutor } from '@ananya/database';
import type { Component } from '@ananya/inventory';

/**
 * Component consolidation execution vocabulary (Pass 6B).
 *
 * These types describe the *plan* a reviewer submits and the *context* every
 * adapter receives. They are deliberately free of persistence concerns so the
 * adapters stay testable without a database.
 */

/** Operation status of a persisted consolidation record. */
export type ConsolidationStatus = 'COMPLETED' | 'FAILED';

/**
 * How a reviewer resolved one attribute that differs between the two records.
 *
 * `KEEP_SOURCE_VALUE` is only meaningful for `SOURCE_ONLY` attributes (there is
 * no canonical value to keep) and for `CONFLICTING` ones; the validator rejects
 * a strategy that does not apply to the attribute's classification.
 */
export type AttributeResolutionStrategy =
  | 'KEEP_CANONICAL_VALUE'
  | 'KEEP_SOURCE_VALUE'
  | 'DISCARD_SOURCE_VALUE'
  | 'EXPLICIT_VALUE';

export interface AttributeResolution {
  attributeDefinitionId: string;
  strategy: AttributeResolutionStrategy;
  /**
   * Required for `EXPLICIT_VALUE`. Interpreted as the raw value for the
   * attribute's data type (text/number/boolean).
   */
  value?: string | number | boolean | null;
}

/** How a reviewer resolved a conflicting scrap factor on a combined BOM line. */
export type BomScrapFactorStrategy =
  'USE_CANONICAL' | 'USE_SOURCE' | 'EXPLICIT';

export interface BomScrapFactorResolution {
  strategy: BomScrapFactorStrategy;
  /** Required for `EXPLICIT`. */
  value?: number;
}

/**
 * How a reviewer resolved a BOM that contains both components.
 *
 * `COMBINE` is the only supported resolution: the two lines become one line
 * whose quantity is `source + canonical`, with an explicitly chosen scrap
 * factor. The domain never sums quantities or picks a scrap factor on its own.
 */
export interface BomLineResolution {
  bomId: string;
  resolution: 'COMBINE';
  scrapFactorResolution: BomScrapFactorResolution;
}

/** Who is performing the consolidation. Never taken from the request body. */
export interface ConsolidationActor {
  id?: string | null;
  email?: string | null;
}

/** The validated plan for one consolidation operation. */
export interface ConsolidationPlan {
  findingId: string;
  canonicalComponentId: string;
  sourceComponentIds: string[];
  attributeResolutions: AttributeResolution[];
  bomResolutions: BomLineResolution[];
  decisionNotes?: string | null;
}

/** Everything an adapter needs, all bound to one transaction. */
export interface ConsolidationContext {
  /** The single transaction handle every adapter must use. */
  executor: DbExecutor;
  consolidationId: string;
  /** The surviving component. */
  canonical: Component;
  /** The components being retired. Never empty. */
  sources: Component[];
  plan: ConsolidationPlan;
  actor: ConsolidationActor;
  /** The preview fingerprint the reviewer approved. */
  previewFingerprint: string;
}

/** What an adapter did, recorded in the consolidation record. */
export type ConsolidationAction =
  | 'REPOINT'
  | 'RECONCILE'
  | 'PRESERVE'
  | 'RETIRE'
  | 'POST_LEDGER_ENTRY'
  | 'NONE';

export interface ConsolidationAdapterOutcome {
  /** Logical entity the adapter owns (mirrors the preview's `entityType`). */
  entity: string;
  action: ConsolidationAction;
  /** Rows that changed. Zero for preserve/no-op adapters. */
  migratedCount: number;
  /** Structured facts recorded in the consolidation record. */
  details: Record<string, unknown>;
  /** Non-blocking notes the reviewer should see afterwards. */
  warnings: string[];
}

/**
 * A consolidation adapter owns exactly one domain.
 *
 * Adapters run in a deterministic `order` and all receive the SAME transaction
 * executor, which is what makes the operation all-or-nothing.
 */
export interface ConsolidationAdapter {
  id: string;
  label: string;
  /** Deterministic execution order; ties broken by id. */
  order: number;
  apply: (
    context: ConsolidationContext,
  ) => Promise<ConsolidationAdapterOutcome>;
}

/** Per-source pre/post state stored on `consolidation_sources`. */
export interface ConsolidationSourceState {
  componentId: string;
  sku: string;
  name: string;
  isActive: boolean;
  unit: string;
  manufacturerId: string | null;
  categoryId: string | null;
  inventoryByLocation: Array<{
    locationId: string;
    quantity: number;
    unitOfMeasure: string;
  }>;
  ledgerTransactionCount: number;
  attributeValueCount: number;
  batchCount: number;
  serialCount: number;
  reservationLineCount: number;
  bomLineCount: number;
  documentCount: number;
  favoriteCount: number;
  supplierMappingCount: number;
}

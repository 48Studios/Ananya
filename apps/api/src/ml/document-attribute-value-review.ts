import {
  buildFindingFingerprint,
  type PersistComponentFindingInput,
} from './component-review-queue.service';
import type { AttributeCandidateDto } from './documentation-intelligence.dtos';
import { DATASHEET_INTELLIGENCE_VERSION } from './documentation-intelligence.dtos';
import type { ComponentAttributeProvenance } from '@ananya/inventory';

/**
 * Attribute Value Review (Pass 3) — review model.
 *
 * Documentation Intelligence Pass 2 produced *candidates*: an extracted
 * specification with evidence, but no review workflow. This module turns the
 * candidates that are genuinely actionable into findings on the EXISTING
 * component review queue.
 *
 * Resolution and validation live in `documentation-intelligence.ts`
 * (`evaluateAttributeCandidate`, `coerceAttributeValue`, `isValueAlreadyCurrent`)
 * and are re-exported here, so there is exactly one implementation of "can this
 * specification be applied?" rather than a second copy in the review layer.
 *
 * Two rules are absolute in the finding construction below:
 *  1. Nothing is applied here. Applying a value is a separate authenticated
 *     operation that goes through the existing component-attribute use case.
 *  2. Nothing is invented. Only candidates the authoritative attribute
 *     definition can represent become findings; no definition is ever created
 *     from a datasheet.
 */

// Re-exported so consumers of the review model import from one place.
export {
  evaluateAttributeCandidate,
  isValueAlreadyCurrent,
  matchAllExtractedAttributeDefinitions,
} from './documentation-intelligence';

export {
  ATTRIBUTE_INAPPLICABLE_REASONS,
  ATTRIBUTE_RESOLUTION_STATES,
  ATTRIBUTE_VALIDATION_REASONS,
  ATTRIBUTE_VALIDATION_STATES,
  type AttributeCandidateReviewState,
  type AttributeInapplicableReason,
  type AttributeResolutionState,
  type AttributeValidationReason,
  type AttributeValidationState,
} from './documentation-intelligence.dtos';

/** Producer tag for attribute-value findings derived from a datasheet. */
export const DOCUMENT_ATTRIBUTE_SOURCE = 'document:datasheet-attribute';

/** Issue type used for attribute-value suggestions on the existing queue. */
export const ATTRIBUTE_VALUE_ISSUE_TYPE = 'ATTRIBUTE_VALUE_SUGGESTION';

/** Issue category the attribute-value suggestions belong to. */
export const ATTRIBUTE_VALUE_ISSUE_CATEGORY = 'ATTRIBUTE_VALUE';

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

export interface AttributeFindingComponent {
  id: string;
  sku: string;
  name: string;
}

export interface BuildAttributeFindingsInput {
  component: AttributeFindingComponent;
  /** Candidates already resolved and validated for this analysis. */
  candidates: AttributeCandidateDto[];
  document: {
    documentId: string;
    documentVersion: number;
    documentFileName: string | null;
    contentHash: string;
    documentTitle: string;
  };
}

export interface AttributeFindingPlan {
  findings: PersistComponentFindingInput[];
  /**
   * Fingerprint per attribute definition id, so a persisted finding can be
   * matched back to the candidate row that produced it.
   */
  fingerprintByAttributeDefinitionId: Map<string, string>;
}

/** The `field` every attribute-value finding records, e.g. `attributes.resistance`. */
export function attributeFindingField(attributeCode: string): string {
  return `attributes.${attributeCode}`;
}

/**
 * Whether a formatted extraction already shows its unit.
 *
 * The extractor renders the unit whenever it recognized one (`330Ω`, `1%`,
 * `25 °C/W`, `10 mm`), so a letter, a percent sign, or a unit symbol after the
 * number means the value is complete; only a bare number (`330`) needs the
 * definition's unit appended.
 */
function formattedCarriesUnit(formatted: string): boolean {
  return /[a-z%°Ωµμ]/i.test(formatted);
}

/** Display form of the suggested value, used in the finding and its fingerprint. */
export function suggestedAttributeDisplay(
  candidate: AttributeCandidateDto,
): string {
  const formatted = candidate.formatted.trim();
  const unit = candidate.unit?.trim();
  // Appending the unit to a value that already shows one would read
  // "330Ω ohm" in the queue and in the reviewer's evidence.
  if (!unit || formattedCarriesUnit(formatted)) return formatted;
  return `${formatted} ${unit}`;
}

/**
 * Builds reviewable findings for the candidates that are genuinely actionable.
 *
 * Only applicable candidates become findings (per the pass contract: ambiguous,
 * unresolved, invalid and already-current properties stay informational). The
 * document identity is folded into `suggestedValue`, which means the queue's
 * existing fingerprint function already makes each finding specific to this
 * document revision without any new fingerprint code:
 *
 *  - re-analysing identical bytes with unchanged component state reproduces the
 *    same fingerprint, so the queue refreshes the existing row (idempotent);
 *  - a new document revision or a changed attribute value produces a different
 *    fingerprint, so old evidence is never silently reused.
 */
export function buildDocumentAttributeFindings(
  input: BuildAttributeFindingsInput,
): AttributeFindingPlan {
  const findings: PersistComponentFindingInput[] = [];
  const fingerprintByAttributeDefinitionId = new Map<string, string>();

  const documentRef = {
    documentId: input.document.documentId,
    documentVersion: input.document.documentVersion,
    documentFileName: input.document.documentFileName,
    documentContentHash: input.document.contentHash,
    extractionSource: DOCUMENT_ATTRIBUTE_SOURCE,
  };

  for (const candidate of input.candidates) {
    if (!candidate.applicable) continue;
    if (!candidate.attributeDefinitionId || !candidate.attributeCode) continue;

    const display = suggestedAttributeDisplay(candidate);
    const field = attributeFindingField(candidate.attributeCode);
    const previous = candidate.currentValue;

    const currentValue: Record<string, unknown> = {
      attributeDefinitionId: candidate.attributeDefinitionId,
      attributeCode: candidate.attributeCode,
      value: previous,
    };

    const suggestedValue: Record<string, unknown> = {
      attributeDefinitionId: candidate.attributeDefinitionId,
      attributeCode: candidate.attributeCode,
      attributeName: candidate.attributeName,
      dataType: candidate.dataType,
      display,
      unit: candidate.unit,
      optionCode: candidate.optionCode,
      /** Endpoint-shaped value handed to the existing attribute use case. */
      value: candidate.normalizedValue,
      /** Extraction facts, so the apply path can re-validate if needed. */
      rawValue: candidate.rawValue,
      document: documentRef,
    };

    const fingerprint = buildFindingFingerprint({
      componentId: input.component.id,
      issueType: ATTRIBUTE_VALUE_ISSUE_TYPE,
      field,
      currentValue,
      suggestedValue,
      intelligenceVersion: DATASHEET_INTELLIGENCE_VERSION,
    });

    fingerprintByAttributeDefinitionId.set(
      candidate.attributeDefinitionId,
      fingerprint,
    );

    findings.push({
      componentId: input.component.id,
      issueType: ATTRIBUTE_VALUE_ISSUE_TYPE,
      issueCategory: ATTRIBUTE_VALUE_ISSUE_CATEGORY,
      field,
      title: previous
        ? `${candidate.attributeName ?? candidate.extractedCode} differs from the datasheet`
        : `${candidate.attributeName ?? candidate.extractedCode} specified in the datasheet`,
      description: previous
        ? `The datasheet "${input.document.documentTitle}" specifies ${display} for ${candidate.attributeName ?? candidate.attributeCode}, but this component records "${previous}".`
        : `The datasheet "${input.document.documentTitle}" specifies ${display} for ${candidate.attributeName ?? candidate.attributeCode}, which this component does not record.`,
      currentValue,
      suggestedValue,
      confidence: candidate.confidence,
      confidenceLevel: candidate.confidenceLevel,
      evidence: candidate.evidence as unknown as Array<Record<string, unknown>>,
      source: DOCUMENT_ATTRIBUTE_SOURCE,
      intelligenceVersion: DATASHEET_INTELLIGENCE_VERSION,
      metadata: {
        rule: ATTRIBUTE_VALUE_ISSUE_TYPE,
        origin: 'DATASHEET',
        /**
         * Stored in metadata because the findings table has no `field` column:
         * this is the convention the queue reads `field` from, and it is what
         * the feedback ledger records as the attribute a reviewer acted on.
         */
        field,
        attributeDefinitionId: candidate.attributeDefinitionId,
        attributeCode: candidate.attributeCode,
        dataType: candidate.dataType,
        validationState: candidate.validationState,
        resolutionState: candidate.resolutionState,
        /** Read by the queue's list filter, which cannot evaluate semantics. */
        actionable: true,
        conflict: candidate.conflict,
        document: documentRef,
      },
    });
  }

  return { findings, fingerprintByAttributeDefinitionId };
}

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

/**
 * Minimum evidence shape provenance needs.
 *
 * Deliberately structural rather than the full `DocumentEvidenceDto`: the
 * apply path reads stored finding evidence out of jsonb, and narrowing to the
 * three fields it actually records keeps the provenance builder usable from both
 * a fresh analysis and a persisted finding without casts.
 */
export interface ProvenanceEvidenceItem {
  page?: number | null;
  text?: string | null;
  extractionMethod?: string;
}

export interface BuildProvenanceInput {
  findingId: string;
  /**
   * Where the value came from.
   *
   * Defaults to the datasheet pipeline, which is what this builder was written
   * for. The attribute-relevance producer passes its own source, because a value
   * derived from a category binding or a package classification did not come
   * from a document and must not say that it did.
   */
  source?: string;
  document: {
    documentId: string;
    documentVersion: number;
    contentHash: string;
  };
  evidence: ProvenanceEvidenceItem[];
  /**
   * Other documents that stated the same value. Recorded alongside the primary
   * source so a corroborated value keeps the full list of who said what.
   */
  supportingDocuments?: Array<{
    documentId: string;
    documentVersion: number;
    contentHash: string;
    documentFileName?: string | null;
    documentType?: string | null;
    page?: number | null;
  }>;
  reviewer?: { id?: string | null; email?: string | null } | null;
  appliedAt?: Date;
}

/**
 * Provenance recorded on an applied attribute value.
 *
 * Prefers the evidence item that actually located the value in the document
 * (page + excerpt); when the extractor could not locate it, the page and excerpt
 * are `null` rather than the first evidence item's page, which would point at
 * the wrong place.
 *
 * When the value was corroborated by other documents, they are recorded as
 * supporting sources. The primary document stays the one the value was applied
 * from, so the provenance can always answer both "where did this come from" and
 * "what else said so".
 */
export function buildAttributeValueProvenance(
  input: BuildProvenanceInput,
): ComponentAttributeProvenance {
  const located = input.evidence.find(
    (item) => item.page !== null && item.page !== undefined,
  );
  const quoted = input.evidence.find(
    (item) => (item.text ?? '').trim().length > 0,
  );
  // Prefer the item that actually located the value; fall back to one that only
  // quotes it, so a page and an excerpt can come from the same honest source.
  const source = located ?? quoted ?? input.evidence[0] ?? null;

  const supportingDocuments = (input.supportingDocuments ?? [])
    .filter(
      (document) =>
        document.documentId &&
        document.documentId !== input.document.documentId,
    )
    .map((document) => ({
      documentId: document.documentId,
      documentVersion: document.documentVersion,
      contentHash: document.contentHash,
      documentFileName: document.documentFileName ?? null,
      documentType: document.documentType ?? null,
      page: document.page ?? null,
    }));

  // A value with no document behind it records no document fields at all.
  // Empty strings would read as "a document exists and its id is empty", which
  // is a claim the evidence cannot support.
  const hasDocument = input.document.documentId.trim().length > 0;

  return {
    source: input.source ?? DOCUMENT_ATTRIBUTE_SOURCE,
    ...(hasDocument
      ? {
          documentId: input.document.documentId,
          documentVersion: input.document.documentVersion,
          contentHash: input.document.contentHash,
          page: source?.page ?? null,
          evidenceExcerpt:
            (source?.text ?? '').trim().length > 0 ? source!.text! : null,
          extractionMethod: source?.extractionMethod,
        }
      : {}),
    intelligenceVersion: DATASHEET_INTELLIGENCE_VERSION,
    findingId: input.findingId,
    reviewerId: input.reviewer?.id ?? null,
    reviewerEmail: input.reviewer?.email ?? null,
    appliedAt: (input.appliedAt ?? new Date()).toISOString(),
    ...(supportingDocuments.length > 0 ? { supportingDocuments } : {}),
  };
}

/** Reads provenance out of a stored attribute value, defensively. */
export function readAttributeProvenance(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value;
}

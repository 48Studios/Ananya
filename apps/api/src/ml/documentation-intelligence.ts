import {
  buildFindingFingerprint,
  type PersistComponentFindingInput,
} from './component-review-queue.service';
import { normalizeName } from './component-duplicate-intelligence';
import {
  documentFileExtension,
  DOCUMENT_MIME_TYPE_BY_EXTENSION,
} from '../documents/document-file';
import {
  // The canonical extracted-code → attribute-definition resolver already lives
  // in the ML service (it owns the ATTRIBUTE_CODE_ALIASES vocabulary). It is
  // reused rather than reimplemented, so document extraction and component
  // creation can never disagree about which attribute a property maps to.
  resolveAttributeDefinition as resolveErpAttributeDefinition,
} from './ml.service';
import type { MlDatasheetExtractionResponse } from './ml-client.service';
import type { ComponentSuggestionResponseDto } from './dtos';
import {
  classifyEvidenceRole,
  isDatasheetSection,
  type DatasheetSection,
} from './specification-evidence';
import {
  resolveAttributeTerm,
  type AttributeResolutionContext,
  type ResolvableAttributeDefinition,
} from './attribute-resolution';
import {
  compareAttributeValues,
  findUnit,
  toComparableValue,
  type UnitRef,
} from './attribute-value-semantics';
import {
  ANALYZABLE_DOCUMENT_TYPES,
  ANALYZABLE_MIME_TYPE,
  DATASHEET_INTELLIGENCE_VERSION,
  DOCUMENT_ANALYSIS_SOURCE,
  MAX_ANALYZABLE_DOCUMENT_BYTES,
  type AnalysisEligibility,
  type AttributeCandidateDto,
  type AttributeCandidateResolution,
  type AttributeCandidateReviewState,
  type AttributeResolutionCandidateDto,
  type AttributeValidationReason,
  type DocumentAnalysisSummaryDto,
  type DocumentEvidenceDto,
  type DocumentIdentityDto,
} from './documentation-intelligence.dtos';

/**
 * Pure Documentation Intelligence mapping.
 *
 * Everything here is deterministic and dependency-free (no database, no HTTP,
 * no clock) so the mapping from an extraction to reviewable candidates,
 * evidence and findings can be unit tested exhaustively.
 *
 * Two rules are absolute in this module:
 *  1. Nothing mutates component data. The only outputs are evidence, candidate
 *     values and `PersistComponentFindingInput` records for the EXISTING review
 *     queue.
 *  2. Nothing is invented. A page number or excerpt is copied from the extractor
 *     or omitted; a value with no matching attribute definition is reported as
 *     unresolved rather than coerced.
 */

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

export interface AnalysisEligibilityInput {
  sourceType: string;
  documentType: string | null;
  mimeType: string | null;
  fileName: string | null;
  sizeBytes: number | null;
  storageKey: string | null;
  /** Result of asking the storage abstraction whether the object exists. */
  storageObjectExists: boolean;
}

/**
 * Decides whether a documentation record can be analyzed.
 *
 * Every condition is verified server-side from persisted state; no client claim
 * participates. The MIME type is a hint, not proof: the extension is checked
 * too, so a mislabelled upload cannot be handed to the PDF reader.
 */
export function evaluateAnalysisEligibility(
  input: AnalysisEligibilityInput,
): AnalysisEligibility {
  if (input.sourceType !== 'UPLOADED_FILE') {
    return {
      available: false,
      reason: 'EXTERNAL_REFERENCE',
      message:
        'External links are not downloaded or analyzed. Upload the datasheet as a file to analyze it.',
    };
  }

  if (
    !input.documentType ||
    !(ANALYZABLE_DOCUMENT_TYPES as readonly string[]).includes(
      input.documentType,
    )
  ) {
    return {
      available: false,
      reason: 'NOT_A_DATASHEET',
      message:
        'This document type is not analyzed for specifications. Change the document type if this file states component specifications.',
    };
  }

  const mimeType = (input.mimeType ?? '').toLowerCase();
  const extension = documentFileExtension(input.fileName);

  // The stored MIME type is authoritative (the upload pipeline derives it from
  // the extension), but it is not trusted alone: an extension that names a
  // different format contradicts it and is refused, so a mislabelled row can
  // never be handed to the PDF reader.
  const extensionContradictsPdf =
    extension !== null &&
    extension !== 'pdf' &&
    DOCUMENT_MIME_TYPE_BY_EXTENSION[extension] !== ANALYZABLE_MIME_TYPE;
  if (mimeType !== ANALYZABLE_MIME_TYPE && extension !== 'pdf') {
    return {
      available: false,
      reason: 'NOT_A_PDF',
      message:
        'Datasheet analysis supports PDF files. This file is a different format, so it can still be previewed and downloaded.',
    };
  }
  if (extensionContradictsPdf) {
    return {
      available: false,
      reason: 'NOT_A_PDF',
      message:
        'Datasheet analysis supports PDF files. This file is a different format, so it can still be previewed and downloaded.',
    };
  }

  if (!input.storageKey || !input.storageObjectExists) {
    return {
      available: false,
      reason: 'MISSING_STORAGE_OBJECT',
      message:
        'The stored file for this document is no longer available on the server, so it cannot be analyzed.',
    };
  }

  if (
    typeof input.sizeBytes === 'number' &&
    input.sizeBytes > MAX_ANALYZABLE_DOCUMENT_BYTES
  ) {
    return {
      available: false,
      reason: 'TOO_LARGE',
      message: 'Document is too large for datasheet analysis.',
    };
  }

  return { available: true };
}

// ---------------------------------------------------------------------------
// Extraction normalization
// ---------------------------------------------------------------------------

export interface NormalizedExtractionAttribute {
  code: string;
  value: string | number | boolean | null;
  unit: string | null;
  formatted: string;
  confidence: number;
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  evidence: Array<{
    type: string;
    description: string;
    weight: number;
    source?: string;
    page: number | null;
    text: string | null;
    /** Datasheet section the extractor matched, when it could identify one. */
    section: DatasheetSection | null;
  }>;
}

export interface NormalizedExtraction {
  attributes: NormalizedExtractionAttribute[];
  extractedText: string | null;
  extractedTextPreview: string | null;
  pageCount: number | null;
  pagesAnalyzed: number | null;
  extractorVersion: string | null;
}

function asConfidenceLevel(value: unknown): 'HIGH' | 'MEDIUM' | 'LOW' {
  return value === 'HIGH' || value === 'MEDIUM' || value === 'LOW'
    ? value
    : 'MEDIUM';
}

/**
 * Converts the raw ML payload into the internal shape.
 *
 * Field-by-field and defensive: an unexpected value is dropped or defaulted, so
 * a malformed ML response degrades into fewer candidates rather than corrupting
 * persisted evidence. A missing `page`/`text` stays `null` — it is never
 * synthesized.
 */
export function normalizeExtraction(
  response: MlDatasheetExtractionResponse,
): NormalizedExtraction {
  const attributes: NormalizedExtractionAttribute[] = [];

  for (const [code, raw] of Object.entries(response.attributes ?? {})) {
    if (!raw || typeof raw !== 'object') continue;
    const attribute = raw as unknown as Record<string, unknown>;
    const extractedCode =
      typeof attribute.code === 'string' && attribute.code.trim().length > 0
        ? attribute.code.trim()
        : code;
    if (!extractedCode) continue;

    // A display value must be printable: a structured or absent value falls back
    // to an empty string rather than JavaScript's `[object Object]`.
    const rawValue = attribute.value;
    const printableValue =
      typeof rawValue === 'string' ||
      typeof rawValue === 'number' ||
      typeof rawValue === 'boolean'
        ? String(rawValue)
        : '';
    const formatted =
      typeof attribute.formatted === 'string' && attribute.formatted.length > 0
        ? attribute.formatted
        : printableValue;

    const evidence = Array.isArray(attribute.evidence)
      ? attribute.evidence
          .filter(
            (item): item is Record<string, unknown> =>
              Boolean(item) && typeof item === 'object',
          )
          .map((item) => ({
            type: typeof item.type === 'string' ? item.type : 'datasheet_param',
            description:
              typeof item.description === 'string' ? item.description : '',
            weight: typeof item.weight === 'number' ? item.weight : 1,
            ...(typeof item.source === 'string' && item.source.length > 0
              ? { source: item.source }
              : {}),
            // Only a real page integer is accepted; anything else is "unknown".
            page:
              typeof item.page === 'number' && Number.isInteger(item.page)
                ? item.page
                : null,
            text:
              typeof item.text === 'string' && item.text.trim().length > 0
                ? item.text
                : null,
            // A section the extractor did not identify stays null rather than
            // being guessed, which is what keeps the evidence role honest.
            section: isDatasheetSection(
              typeof item.section === 'string' ? item.section : null,
            )
              ? (item.section as DatasheetSection)
              : null,
          }))
      : [];

    attributes.push({
      code: extractedCode,
      value:
        typeof attribute.value === 'string' ||
        typeof attribute.value === 'number' ||
        typeof attribute.value === 'boolean'
          ? attribute.value
          : null,
      unit: typeof attribute.unit === 'string' ? attribute.unit : null,
      formatted,
      confidence:
        typeof attribute.confidence === 'number' ? attribute.confidence : 0,
      confidenceLevel: asConfidenceLevel(attribute.confidence_level),
      evidence,
    });
  }

  // Deterministic order so identical documents produce identical payloads.
  attributes.sort((left, right) => left.code.localeCompare(right.code));

  return {
    attributes,
    extractedText:
      typeof response.extracted_text === 'string'
        ? response.extracted_text
        : null,
    extractedTextPreview:
      typeof response.extracted_text_preview === 'string'
        ? response.extracted_text_preview
        : null,
    pageCount:
      typeof response.page_count === 'number' ? response.page_count : null,
    pagesAnalyzed:
      typeof response.pages_analyzed === 'number'
        ? response.pages_analyzed
        : null,
    extractorVersion:
      typeof response.extractor_version === 'string'
        ? response.extractor_version
        : null,
  };
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export interface DocumentEvidenceContext {
  documentId: string;
  documentVersion: number;
  documentFileName: string | null;
  contentHash: string;
}

/**
 * Builds evidence that identifies the exact document revision.
 *
 * The submitted `EvidenceItemDto` convention (type/description/weight/source) is
 * preserved and extended with document identity, page and excerpt, so existing
 * evidence UI keeps working while the reviewer can see precisely where a value
 * came from.
 */
export function buildDocumentEvidence(
  items: NormalizedExtractionAttribute['evidence'],
  context: DocumentEvidenceContext,
): DocumentEvidenceDto[] {
  return items.map((item) => ({
    type: item.type,
    description: item.description,
    weight: item.weight,
    ...(item.source ? { source: item.source } : {}),
    extractionMethod: item.source ?? item.type,
    documentId: context.documentId,
    documentVersion: context.documentVersion,
    documentFileName: context.documentFileName,
    documentContentHash: context.contentHash,
    page: item.page,
    text: item.text,
    // The role follows the section the extractor actually matched. Evidence that
    // carries no location (Data Pack corroboration) is contextual by definition.
    role: classifyEvidenceRole({
      section: item.section,
      fromDocument: item.page !== null || Boolean(item.text),
    }),
    section: item.section,
  }));
}

/** Evidence describing the identity candidates for a document. */
export function buildIdentityEvidence(
  suggestion: ComponentSuggestionResponseDto | null,
  context: DocumentEvidenceContext,
  pageCount: number | null,
): DocumentEvidenceDto[] {
  const items: DocumentEvidenceDto[] = [];

  for (const item of suggestion?.manufacturer?.evidence ?? []) {
    items.push({
      type: item.type,
      description: item.description,
      weight: item.weight,
      ...(item.source ? { source: item.source } : {}),
      extractionMethod: item.source ?? 'manufacturer_resolution',
      documentId: context.documentId,
      documentVersion: context.documentVersion,
      documentFileName: context.documentFileName,
      documentContentHash: context.contentHash,
      // Identity resolution reads the whole document, so it is located at the
      // document (page unknown) rather than claiming a page it cannot prove.
      page: null,
      text: null,
      // No section was matched, so the role stays contextual.
      role: 'CONTEXTUAL',
      section: null,
    });
  }

  if (items.length === 0) {
    items.push({
      type: 'datasheet_document',
      description: `Derived from ${context.documentFileName ?? 'the datasheet'}${
        pageCount ? ` (${pageCount} page document)` : ''
      }`,
      weight: 0.5,
      extractionMethod: 'document_analysis',
      documentId: context.documentId,
      documentVersion: context.documentVersion,
      documentFileName: context.documentFileName,
      documentContentHash: context.contentHash,
      page: null,
      text: null,
      role: 'CONTEXTUAL',
      section: null,
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Attribute candidate resolution
// ---------------------------------------------------------------------------

export interface AttributeDefinitionRef {
  id: string;
  code: string;
  name: string;
  dataType: string;
  /**
   * Declared dimension, e.g. `Resistance`. Used by the semantic comparison and
   * scoring layers to judge whether an extracted unit is the right *kind* of
   * unit, not merely a known one.
   */
  unitCategory: string | null;
  defaultUnit: string | null;
  aliases: string[];
  /** Existing option codes/labels, for SELECT and MULTI_SELECT coercion. */
  options: Array<{ code: string; label: string }>;
  /**
   * Deactivated definitions are not offered for application: an inactive
   * attribute is retired configuration, and writing to it would resurrect it.
   */
  isActive: boolean;
}

export interface CurrentAttributeValue {
  attributeDefinitionId: string;
  display: string;
}

export interface ResolveAttributeCandidatesInput {
  extraction: NormalizedExtraction;
  definitions: AttributeDefinitionRef[];
  currentValues: Map<string, CurrentAttributeValue>;
  context: DocumentEvidenceContext;
  /**
   * Pass 4 resolution context: the authoritative unit catalog, the codes the
   * component's category expects, and the Data Pack's attribute aliases. All
   * optional, and all treated as *corroboration*: without them resolution still
   * works, it just reports less evidence for its decision.
   */
  resolution?: AttributeResolutionContext;
}

/**
 * Finds the existing attribute definition for an extracted property code.
 *
 * Delegates to the ML service's resolver, which owns the canonical code-alias
 * vocabulary, and adds one narrowly-scoped fallback for the wording datasheets
 * actually use (`resistance_value`, `rated_voltage`). Resolution only: this
 * never creates a definition, so a datasheet property that has no definition is
 * reported as an unresolved candidate instead of inventing ERP schema.
 */
export function matchExtractedAttributeDefinition(
  extractedCode: string,
  definitions: AttributeDefinitionRef[],
): AttributeDefinitionRef | null {
  const code = extractedCode.trim();
  if (!code) return null;

  // The shared resolver returns its own definition shape; map the hit back to
  // the caller's reference (which also carries the SELECT options).
  const byId = (id: string): AttributeDefinitionRef | null =>
    definitions.find((definition) => definition.id === id) ?? null;

  const direct = resolveErpAttributeDefinition(code, definitions);
  if (direct) return byId(direct.id);

  // Datasheet wording is normalized on the *raw, separated* code (not on the
  // punctuation-stripped comparison key) so `resistance_value` and
  // `rated_voltage` reduce to `resistance` / `voltage`.
  const words = code
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_');
  const variants = [
    words.replace(/_(value|rating|nominal|typical|max|min)$/, ''),
    words.replace(/^(rated|nominal|typical|max|min)_/, ''),
  ];
  for (const variant of variants) {
    if (!variant || variant === words) continue;
    const match = resolveErpAttributeDefinition(variant, definitions);
    if (match) return byId(match.id);
  }

  return null;
}

interface CoercedValue {
  ok: true;
  /** Shape accepted by the existing component attribute endpoint. */
  value: Record<string, unknown>;
  /** Short human-readable form of what would be stored. */
  display: string;
}

interface CoercionFailure {
  ok: false;
  detail: string;
  /**
   * Machine-readable cause, consumed by the Pass 3 review model so a value's
   * executability is decided from the refusal itself rather than re-derived.
   */
  reason: AttributeValidationReason;
}

type CoercionResult = CoercedValue | CoercionFailure;

function numericText(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const match = raw.replace(',', '.').match(/-?\d+(?:\.\d+)?/);
    if (match) {
      const value = Number(match[0]);
      if (Number.isFinite(value)) return value;
    }
  }
  return null;
}

/**
 * Converts an extracted value into the representation the existing attribute
 * domain expects for the definition's data type.
 *
 * This mirrors `SaveComponentAttributes` but is NOT a second validator: the
 * domain re-validates on apply and remains authoritative. A value that cannot be
 * represented is reported as unresolved with the raw extraction preserved as
 * evidence, never written as free text into a typed attribute.
 */
export function coerceAttributeValue(
  definition: AttributeDefinitionRef,
  attribute: NormalizedExtractionAttribute,
): CoercionResult {
  const unit = attribute.unit ?? definition.defaultUnit ?? null;

  switch (definition.dataType) {
    case 'TEXT': {
      const text =
        attribute.formatted?.trim() ||
        (typeof attribute.value === 'string' ||
        typeof attribute.value === 'number' ||
        typeof attribute.value === 'boolean'
          ? String(attribute.value)
          : '');
      if (!text) {
        return {
          ok: false,
          reason: 'INVALID_NUMBER',
          detail: 'No text value was extracted.',
        };
      }
      return {
        ok: true,
        value: { value: text.slice(0, 1000) },
        display: text,
      };
    }

    case 'NUMBER':
    case 'INTEGER': {
      const number = numericText(attribute.value);
      if (number === null) {
        return {
          ok: false,
          reason:
            definition.dataType === 'INTEGER'
              ? 'INVALID_INTEGER'
              : 'INVALID_NUMBER',
          detail: `Expected a number for this attribute, extracted "${attribute.formatted}".`,
        };
      }
      if (definition.dataType === 'INTEGER' && !Number.isInteger(number)) {
        return {
          ok: false,
          reason: 'INVALID_INTEGER',
          detail: `Expected an integer for this attribute, extracted "${attribute.formatted}".`,
        };
      }
      return {
        ok: true,
        value: { value: number },
        display: String(number),
      };
    }

    case 'QUANTITY': {
      const number = numericText(attribute.value);
      if (number === null) {
        return {
          ok: false,
          reason: 'INVALID_QUANTITY',
          detail: `Expected a numeric quantity for this attribute, extracted "${attribute.formatted}".`,
        };
      }
      if (!unit) {
        return {
          ok: false,
          reason: 'UNIT_MISMATCH',
          detail:
            'A numeric quantity needs a unit, and neither the extraction nor the attribute definition provided one.',
        };
      }
      return {
        ok: true,
        value: { value: number, unit },
        display: `${number} ${unit}`,
      };
    }

    case 'BOOLEAN': {
      if (typeof attribute.value === 'boolean') {
        return {
          ok: true,
          value: { value: attribute.value },
          display: attribute.value ? 'Yes' : 'No',
        };
      }
      return {
        ok: false,
        reason: 'INVALID_BOOLEAN',
        detail: `Expected a yes/no value for this attribute, extracted "${attribute.formatted}".`,
      };
    }

    case 'DATE': {
      const text = attribute.formatted?.trim() ?? '';
      const parsed = new Date(text);
      if (!text || Number.isNaN(parsed.getTime())) {
        return {
          ok: false,
          reason: 'INVALID_DATE',
          detail: `Expected a date for this attribute, extracted "${attribute.formatted}".`,
        };
      }
      return {
        ok: true,
        value: { value: parsed.toISOString().slice(0, 10) },
        display: parsed.toISOString().slice(0, 10),
      };
    }

    case 'SELECT':
    case 'MULTI_SELECT': {
      const extractedCodes = Array.isArray(attribute.value)
        ? attribute.value.map((item) => String(item))
        : [attribute.formatted];
      const matched: string[] = [];
      for (const raw of extractedCodes) {
        const key = normalizeName(raw);
        const option = definition.options.find(
          (candidate) =>
            normalizeName(candidate.code) === key ||
            normalizeName(candidate.label) === key,
        );
        if (option) matched.push(option.code);
      }
      if (matched.length === 0) {
        return {
          ok: false,
          reason:
            definition.dataType === 'MULTI_SELECT'
              ? 'INVALID_MULTI_SELECT_OPTION'
              : 'INVALID_SELECT_OPTION',
          detail: `"${attribute.formatted}" is not one of this attribute's configured options.`,
        };
      }
      if (definition.dataType === 'SELECT') {
        return {
          ok: true,
          value: { value: matched[0], optionCode: matched[0] },
          display: matched[0]!,
        };
      }
      return {
        ok: true,
        value: { value: matched, selectedOptionCodes: matched },
        display: matched.join(', '),
      };
    }

    default:
      return {
        ok: false,
        reason: 'ATTRIBUTE_TYPE_MISMATCH',
        detail: `Attribute type "${definition.dataType}" is not supported for extracted datasheet values.`,
      };
  }
}

/**
 * Every definition an extracted property matches.
 *
 * `matchExtractedAttributeDefinition` returns one definition (first match wins,
 * which is what Pass 2 displays). This returns all of them so genuine ambiguity
 * can be detected instead of silently resolved: two definitions that both claim
 * the same extracted term mean a human has to decide, not the extractor.
 */
export function matchAllExtractedAttributeDefinitions(
  extractedCode: string,
  definitions: AttributeDefinitionRef[],
): AttributeDefinitionRef[] {
  const code = extractedCode.trim();
  if (!code) return [];

  const matches = new Map<string, AttributeDefinitionRef>();
  const normalizedCode = normalizeName(code);

  for (const definition of definitions) {
    const terms = [definition.code, definition.name, ...definition.aliases].map(
      (term) => normalizeName(term),
    );
    if (terms.includes(normalizedCode)) {
      matches.set(definition.id, definition);
    }
  }

  // The canonical matcher also understands datasheet wording (`rated_voltage`),
  // which a raw term comparison would miss.
  const resolved = matchExtractedAttributeDefinition(code, definitions);
  if (resolved) matches.set(resolved.id, resolved);

  return Array.from(matches.values());
}

/**
 * Whether the component already records this exact value.
 *
 * Compared on the display form the reviewer sees, so `300Ω` and `300 ohm` are
 * the same recorded value rather than a conflict to resolve by hand.
 */
export function isValueAlreadyCurrent(input: {
  currentDisplay: string | null;
  suggestedDisplay: string;
}): boolean {
  if (input.currentDisplay === null) return false;
  return (
    normalizeName(input.currentDisplay) ===
    normalizeName(input.suggestedDisplay)
  );
}

/**
 * Decides how a candidate is resolved, validated, and whether it is actionable.
 *
 * The coercion reason is supplied by the caller because the coercion already ran
 * above; this function only interprets the outcome, so one implementation
 * decides what is representable and nothing is re-derived here.
 */
export function evaluateAttributeCandidate(input: {
  definition: AttributeDefinitionRef | null;
  ambiguousDefinitionIds: string[];
  coercionFailedReason: AttributeValidationReason | null;
  conflict: boolean;
  valueAlreadyCurrent: boolean;
}): AttributeCandidateReviewState {
  if (input.ambiguousDefinitionIds.length > 1) {
    return {
      resolutionState: 'AMBIGUOUS',
      validationState: 'REQUIRES_REVIEW',
      validationReason: null,
      applicable: false,
      inapplicableReason: 'AMBIGUOUS_ATTRIBUTE',
    };
  }

  const definition = input.definition;
  if (!definition) {
    return {
      resolutionState: 'UNRESOLVED',
      validationState: 'INVALID',
      validationReason: null,
      applicable: false,
      inapplicableReason: 'ATTRIBUTE_NOT_FOUND',
    };
  }

  if (!definition.isActive) {
    return {
      resolutionState: 'RESOLVED',
      validationState: 'INVALID',
      validationReason: null,
      applicable: false,
      inapplicableReason: 'ATTRIBUTE_NOT_ACTIVE',
    };
  }

  if (input.coercionFailedReason) {
    return {
      resolutionState: 'RESOLVED',
      validationState: 'INVALID',
      validationReason: input.coercionFailedReason,
      applicable: false,
      inapplicableReason: 'INVALID_VALUE',
    };
  }

  if (input.valueAlreadyCurrent) {
    return {
      resolutionState: 'RESOLVED',
      validationState: 'VALID',
      validationReason: null,
      applicable: false,
      inapplicableReason: 'VALUE_ALREADY_CURRENT',
    };
  }

  return {
    resolutionState: 'RESOLVED',
    validationState: input.conflict ? 'REQUIRES_REVIEW' : 'VALID',
    validationReason: null,
    applicable: true,
    inapplicableReason: null,
  };
}

/**
 * Turns extracted properties into reviewable candidates.
 *
 * Every extracted specification produces exactly one candidate, including the
 * ones that cannot be applied — an unresolved property is information a human
 * needs, not something to discard.
 */
export function resolveAttributeCandidates(
  input: ResolveAttributeCandidatesInput,
): AttributeCandidateDto[] {
  const { extraction, definitions, currentValues, context } = input;
  const units = input.resolution?.units ?? [];

  return extraction.attributes.map((attribute) => {
    const evidence = buildDocumentEvidence(attribute.evidence, context);

    // Pass 4 scoring: the shared canonical vocabulary decides whether the
    // property is a known synonym, and the scorer ranks and explains every
    // definition that claims the term. Two claims stay ambiguous — the scorer
    // never picks a winner between them.
    const canonical = resolveErpAttributeDefinition(
      attribute.code,
      definitions,
    );
    const resolution = resolveAttributeTerm({
      extractedCode: attribute.code,
      definitions: definitions.map(toResolvableDefinition),
      canonicalCode: canonical?.code ?? null,
      context: {
        ...input.resolution,
        units,
        extractedUnit: attribute.unit,
        extractedValue: attribute.value,
      },
    });

    const ranked: AttributeResolutionCandidateDto[] = resolution.ranked.map(
      (entry) => ({
        attributeDefinitionId: entry.definitionId,
        attributeCode: entry.code,
        attributeName: entry.name,
        score: entry.score,
        reasons: entry.reasons,
      }),
    );

    const definition = resolution.definition
      ? (definitions.find(
          (candidate) => candidate.id === resolution.definition?.id,
        ) ?? null)
      : null;

    const base = {
      extractedCode: attribute.code,
      formatted: attribute.formatted,
      unit: attribute.unit,
      rawValue: attribute.value,
      confidence: attribute.confidence,
      confidenceLevel: attribute.confidenceLevel,
      evidence,
      attributeDefinitionId: null as string | null,
      attributeCode: null as string | null,
      attributeName: null as string | null,
      dataType: null as string | null,
      normalizedValue: null as unknown,
      optionCode: null as string | null,
      currentValue: null as string | null,
      conflict: false,
      review: null,
      validationDetail: null as string | null,
      resolutionConfidence: resolution.confidence,
      resolutionReasons: resolution.reasons,
      resolutionCandidates: ranked,
    };

    if (!definition) {
      const ambiguous = resolution.state === 'AMBIGUOUS';
      return {
        ...base,
        resolution: 'NO_DEFINITION' as AttributeCandidateResolution,
        resolutionDetail: ambiguous
          ? `${resolution.ranked.length} attribute definitions match this property, and the document does not distinguish them.`
          : 'Attribute definition not found. No existing attribute definition matches this extracted property.',
        ...evaluateAttributeCandidate({
          definition: null,
          ambiguousDefinitionIds: ambiguous
            ? resolution.ranked.map((entry) => entry.definitionId)
            : [],
          coercionFailedReason: null,
          conflict: false,
          valueAlreadyCurrent: false,
        }),
      };
    }

    const current = currentValues.get(definition.id) ?? null;
    const coerced = coerceAttributeValue(definition, attribute);

    // Pass 4: the extracted unit must measure the dimension the attribute
    // declares. A known-but-wrong unit (a `mV` reading on a resistance
    // attribute) is refused here rather than stored under the wrong dimension.
    const unitMismatch = describeUnitCategoryMismatch({
      definition,
      extractedUnit: attribute.unit,
      units,
    });

    if (unitMismatch) {
      return {
        ...base,
        resolution: 'UNRESOLVED_VALUE' as AttributeCandidateResolution,
        resolutionDetail: unitMismatch,
        attributeDefinitionId: definition.id,
        attributeCode: definition.code,
        attributeName: definition.name,
        dataType: definition.dataType,
        currentValue: current?.display ?? null,
        validationDetail: unitMismatch,
        ...evaluateAttributeCandidate({
          definition,
          ambiguousDefinitionIds: [],
          coercionFailedReason: 'UNIT_CATEGORY_MISMATCH',
          conflict: false,
          valueAlreadyCurrent: false,
        }),
      };
    }

    if (!coerced.ok) {
      return {
        ...base,
        resolution: 'UNRESOLVED_VALUE' as AttributeCandidateResolution,
        resolutionDetail: coerced.detail,
        attributeDefinitionId: definition.id,
        attributeCode: definition.code,
        attributeName: definition.name,
        dataType: definition.dataType,
        currentValue: current?.display ?? null,
        validationDetail: coerced.detail,
        ...evaluateAttributeCandidate({
          definition,
          ambiguousDefinitionIds: [],
          coercionFailedReason: coerced.reason,
          conflict: false,
          valueAlreadyCurrent: false,
        }),
      };
    }

    // Pass 4: "already current" and "conflict" are decided by the semantic
    // comparison layer, so an equivalent value written in another unit
    // (`1000 Ω` versus `1 kΩ`) is recognised instead of reported as a change.
    const comparison = compareCurrentValue({
      definition,
      coercedDisplay: coerced.display,
      coercedValue: coerced.value,
      currentDisplay: current?.display ?? null,
      units,
    });

    const valueAlreadyCurrent = comparison.equivalent;
    const conflict = current !== null && !comparison.equivalent;

    return {
      ...base,
      resolution: 'DEFINITION_MATCHED' as AttributeCandidateResolution,
      resolutionDetail: null,
      attributeDefinitionId: definition.id,
      attributeCode: definition.code,
      attributeName: definition.name,
      dataType: definition.dataType,
      normalizedValue: coerced.value,
      optionCode:
        typeof coerced.value.optionCode === 'string'
          ? coerced.value.optionCode
          : null,
      currentValue: current?.display ?? null,
      conflict,
      ...evaluateAttributeCandidate({
        definition,
        ambiguousDefinitionIds: [],
        coercionFailedReason: null,
        conflict,
        valueAlreadyCurrent,
      }),
    };
  });
}

/** Projects a definition reference into the shape the scorer reads. */
function toResolvableDefinition(
  definition: AttributeDefinitionRef,
): ResolvableAttributeDefinition {
  return {
    id: definition.id,
    code: definition.code,
    name: definition.name,
    dataType: definition.dataType,
    unitCategory: definition.unitCategory,
    defaultUnit: definition.defaultUnit,
    aliases: definition.aliases,
    isActive: definition.isActive,
  };
}

/**
 * Explains a unit that measures the wrong dimension, or null when it is fine.
 *
 * Only fires for a QUANTITY attribute with a declared dimension whose extracted
 * unit is a real catalog unit in a different dimension. An unknown unit or a
 * definition without a declared dimension is left to the coercion, so this
 * check never invents a refusal it cannot justify.
 */
function describeUnitCategoryMismatch(input: {
  definition: AttributeDefinitionRef;
  extractedUnit: string | null;
  units: readonly UnitRef[];
}): string | null {
  const { definition, extractedUnit, units } = input;
  if (definition.dataType.toUpperCase() !== 'QUANTITY') return null;
  if (units.length === 0 || !extractedUnit) return null;

  const declared = definition.unitCategory?.trim();
  if (!declared) return null;

  const unit = findUnit(units, extractedUnit);
  if (!unit || unit.category === declared) return null;

  return `The unit "${unit.name}" measures ${unit.category}, but "${definition.name}" is a ${declared} attribute. The value was not converted, because converting between dimensions is not supported.`;
}

/**
 * Compares an extracted value with what the component already records.
 *
 * Reads both sides through the shared value mapping, so a value the reviewer sees
 * as `470 ohm` is compared as an amount and a unit rather than as a string.
 */
function compareCurrentValue(input: {
  definition: AttributeDefinitionRef;
  coercedDisplay: string;
  coercedValue: Record<string, unknown>;
  currentDisplay: string | null;
  units: readonly UnitRef[];
}): { equivalent: boolean; detail: string | null } {
  if (input.currentDisplay === null) {
    return { equivalent: false, detail: null };
  }

  const suggested = toComparableValue({
    dataType: input.definition.dataType,
    coerced: input.coercedValue,
    display: input.coercedDisplay,
  });
  const current = toComparableValue({
    dataType: input.definition.dataType,
    display: input.currentDisplay,
  });

  const comparison = compareAttributeValues({
    dataType: input.definition.dataType,
    unitCategory: input.definition.unitCategory,
    units: input.units,
    first: current,
    second: suggested,
  });

  if (comparison.equivalent) return { equivalent: true, detail: null };

  // An incomparable pair is not proof of a difference, but it is also not
  // agreement: the candidate is reported as a conflict for a human to judge, with
  // the comparison's own explanation.
  return { equivalent: false, detail: comparison.detail };
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export interface BuildIdentityInput {
  suggestion: ComponentSuggestionResponseDto | null;
  manufacturerPartNumber: string | null;
  manufacturerPartNumberSource: string | null;
  context: DocumentEvidenceContext;
  pageCount: number | null;
}

/**
 * Maps the existing component intelligence result into identity candidates.
 *
 * The values are the intelligence layer's own resolution (including the ERP
 * `manufacturerId` it matched); this function only reshapes them and attaches
 * document evidence. It performs no matching of its own.
 */
export function buildDocumentIdentity(
  input: BuildIdentityInput,
): DocumentIdentityDto {
  const { suggestion, context } = input;
  const manufacturer = suggestion?.manufacturer ?? null;

  return {
    manufacturerName: manufacturer?.manufacturerName?.trim() || null,
    manufacturerId: manufacturer?.manufacturerId ?? null,
    manufacturerCode: manufacturer?.manufacturerCode ?? null,
    manufacturerResolution: manufacturer?.resolution ?? null,
    manufacturerMatchType: manufacturer?.matchType ?? null,
    manufacturerConfidence: manufacturer?.confidence ?? null,
    manufacturerConfidenceLevel: manufacturer?.confidenceLevel ?? null,
    manufacturerPartNumber: input.manufacturerPartNumber,
    manufacturerPartNumberSource: input.manufacturerPartNumberSource,
    manufacturerPartNumberConfidence: input.manufacturerPartNumber
      ? suggestion?.confidenceLevel === 'HIGH'
        ? 0.9
        : 0.7
      : null,
    categoryName: suggestion?.category?.categoryName ?? null,
    categoryId: suggestion?.category?.categoryId ?? null,
    evidence: buildIdentityEvidence(suggestion, context, input.pageCount),
  };
}

// ---------------------------------------------------------------------------
// Findings (existing Component Review Queue)
// ---------------------------------------------------------------------------

export interface BuildIdentityFindingsInput {
  component: {
    id: string;
    manufacturerId: string | null;
    manufacturerPartNumber: string | null;
    updatedAt: Date | string | null;
  };
  identity: DocumentIdentityDto;
  context: DocumentEvidenceContext;
  documentTitle: string;
}

/**
 * Builds Component Review Queue findings for document-derived identity
 * candidates, using the queue's EXISTING issue types.
 *
 * Only high-confidence, contradicting-or-filling cases become findings, matching
 * the review queue's own admission rule. The document identity is folded into
 * `suggestedValue`, which means the existing fingerprint function
 * ({@link buildFindingFingerprint}) already makes the finding specific to this
 * document revision: re-analyzing the same bytes produces the same fingerprint
 * (idempotent), while a new upload produces a new one. No fingerprint code is
 * duplicated or forked.
 */
export function buildDocumentIdentityFindings(
  input: BuildIdentityFindingsInput,
): PersistComponentFindingInput[] {
  const { component, identity, context, documentTitle } = input;
  const findings: PersistComponentFindingInput[] = [];

  const isHighConfidence = (
    level: string | null,
    confidence: number | null,
  ): boolean => level === 'HIGH' && (confidence ?? 0) >= 0.85;

  const documentRef = {
    documentId: context.documentId,
    documentVersion: context.documentVersion,
    documentFileName: context.documentFileName,
    documentContentHash: context.contentHash,
    extractionSource: DOCUMENT_ANALYSIS_SOURCE,
  };

  const evidence = identity.evidence as unknown as Array<
    Record<string, unknown>
  >;

  // ---- Manufacturer -------------------------------------------------------
  if (
    identity.manufacturerName &&
    identity.manufacturerResolution !== 'UNKNOWN' &&
    isHighConfidence(
      identity.manufacturerConfidenceLevel,
      identity.manufacturerConfidence,
    )
  ) {
    const suggestedManufacturer = {
      manufacturerId: identity.manufacturerId,
      manufacturerName: identity.manufacturerName,
      manufacturerCode: identity.manufacturerCode,
      resolution: identity.manufacturerResolution,
      matchType: identity.manufacturerMatchType,
      document: documentRef,
    };

    if (!component.manufacturerId) {
      findings.push({
        componentId: component.id,
        issueType: 'MANUFACTURER_UNRESOLVED',
        issueCategory: 'IDENTITY',
        field: 'manufacturer',
        title: 'Manufacturer not assigned',
        description: `No manufacturer is recorded for this component. The datasheet "${documentTitle}" resolves "${identity.manufacturerName}" (${identity.manufacturerMatchType ?? 'datasheet analysis'}).`,
        currentValue: { manufacturerId: null, manufacturerName: null },
        suggestedValue: suggestedManufacturer,
        confidence: identity.manufacturerConfidence,
        confidenceLevel: 'HIGH',
        evidence,
        source: DOCUMENT_ANALYSIS_SOURCE,
        intelligenceVersion: DATASHEET_INTELLIGENCE_VERSION,
        componentUpdatedAt: component.updatedAt,
        metadata: {
          rule: 'MANUFACTURER_UNRESOLVED',
          origin: 'DATASHEET',
          document: documentRef,
        },
      });
    } else if (
      identity.manufacturerId &&
      identity.manufacturerId !== component.manufacturerId
    ) {
      findings.push({
        componentId: component.id,
        issueType: 'MANUFACTURER_CONFLICT',
        issueCategory: 'IDENTITY',
        field: 'manufacturer',
        title: 'Manufacturer may be incorrect',
        description: `The datasheet "${documentTitle}" resolves manufacturer "${identity.manufacturerName}", which differs from the manufacturer recorded on this component.`,
        currentValue: { manufacturerId: component.manufacturerId },
        suggestedValue: suggestedManufacturer,
        confidence: identity.manufacturerConfidence,
        confidenceLevel: 'HIGH',
        evidence,
        source: DOCUMENT_ANALYSIS_SOURCE,
        intelligenceVersion: DATASHEET_INTELLIGENCE_VERSION,
        componentUpdatedAt: component.updatedAt,
        metadata: {
          rule: 'MANUFACTURER_CONFLICT',
          origin: 'DATASHEET',
          document: documentRef,
        },
      });
    }
  }

  // ---- Manufacturer part number ------------------------------------------
  const extractedMpn = identity.manufacturerPartNumber?.trim() ?? '';
  if (extractedMpn.length > 0) {
    const storedMpn = component.manufacturerPartNumber?.trim() ?? '';
    const suggestedMpn = {
      manufacturerPartNumber: extractedMpn,
      source: identity.manufacturerPartNumberSource,
      document: documentRef,
    };
    // Confidence is a property of the extraction, not of a person's judgement:
    // only a high-confidence extraction is offered as a reviewable suggestion.
    const mpnConfidence = identity.manufacturerPartNumberConfidence ?? 0;

    if (storedMpn.length === 0) {
      findings.push({
        componentId: component.id,
        issueType: 'MPN_MISSING',
        issueCategory: 'IDENTITY',
        field: 'manufacturerPartNumber',
        title: 'Manufacturer part number not recorded',
        description: `The datasheet "${documentTitle}" identifies part number "${extractedMpn}".`,
        currentValue: { manufacturerPartNumber: null },
        suggestedValue: suggestedMpn,
        confidence: mpnConfidence,
        confidenceLevel: 'HIGH',
        evidence,
        source: DOCUMENT_ANALYSIS_SOURCE,
        intelligenceVersion: DATASHEET_INTELLIGENCE_VERSION,
        componentUpdatedAt: component.updatedAt,
        metadata: {
          rule: 'MPN_MISSING',
          origin: 'DATASHEET',
          document: documentRef,
        },
      });
    } else if (normalizeName(storedMpn) !== normalizeName(extractedMpn)) {
      findings.push({
        componentId: component.id,
        issueType: 'MPN_CONFLICT',
        issueCategory: 'IDENTITY',
        field: 'manufacturerPartNumber',
        title: 'Manufacturer part number may be incorrect',
        description: `The datasheet "${documentTitle}" identifies part number "${extractedMpn}", but this component records "${storedMpn}".`,
        currentValue: { manufacturerPartNumber: storedMpn },
        suggestedValue: suggestedMpn,
        confidence: mpnConfidence,
        confidenceLevel: 'HIGH',
        evidence,
        source: DOCUMENT_ANALYSIS_SOURCE,
        intelligenceVersion: DATASHEET_INTELLIGENCE_VERSION,
        componentUpdatedAt: component.updatedAt,
        metadata: {
          rule: 'MPN_CONFLICT',
          origin: 'DATASHEET',
          document: documentRef,
        },
      });
    }
  }

  return findings;
}

/**
 * Fingerprints for a set of findings, computed with the review queue's own
 * function so analysis and audit can never disagree about identity.
 */
export function buildDocumentFindingFingerprints(
  findings: PersistComponentFindingInput[],
): string[] {
  return findings.map((finding) =>
    buildFindingFingerprint({
      componentId: finding.componentId,
      relatedComponentId: finding.relatedComponentId,
      issueType: finding.issueType,
      field: finding.field,
      currentValue: finding.currentValue,
      suggestedValue: finding.suggestedValue,
      intelligenceVersion: finding.intelligenceVersion,
    }),
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export interface SummarizeAnalysisInput {
  attributes: AttributeCandidateDto[];
  identity: DocumentIdentityDto;
  evidence: DocumentEvidenceDto[];
  findingsCreated: number;
  findingsPending: number;
}

/** Counts are derived from the actual results; nothing is estimated. */
export function summarizeDocumentAnalysis(
  input: SummarizeAnalysisInput,
): DocumentAnalysisSummaryDto {
  const { attributes } = input;

  return {
    extractedSpecifications: attributes.length,
    matchedDefinitions: attributes.filter(
      (candidate) => candidate.resolution === 'DEFINITION_MATCHED',
    ).length,
    unresolvedDefinitions: attributes.filter(
      (candidate) => candidate.resolution === 'NO_DEFINITION',
    ).length,
    unresolvedValues: attributes.filter(
      (candidate) => candidate.resolution === 'UNRESOLVED_VALUE',
    ).length,
    conflicts: attributes.filter((candidate) => candidate.conflict).length,
    evidenceCount: input.evidence.length,
    findingsCreated: input.findingsCreated,
    findingsPending: input.findingsPending,
  };
}

/** Collects every evidence item an analysis exposes, for the summary count. */
export function collectAnalysisEvidence(
  attributes: AttributeCandidateDto[],
  identity: DocumentIdentityDto,
): DocumentEvidenceDto[] {
  return [
    ...attributes.flatMap((candidate) => candidate.evidence),
    ...identity.evidence,
  ];
}

/** MPN candidates discovered in a document, most trustworthy first. */
export function selectManufacturerPartNumberCandidate(
  candidates: Array<{ value: string | null; source: string }>,
): { value: string | null; source: string | null } {
  for (const candidate of candidates) {
    const value = candidate.value?.trim();
    if (value && value.length >= 3) {
      return { value, source: candidate.source };
    }
  }
  return { value: null, source: null };
}

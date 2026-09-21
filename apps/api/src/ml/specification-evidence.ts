/**
 * Datasheet evidence quality: roles, deduplication and deterministic ordering.
 *
 * Pass 3 attached evidence to a candidate but treated every item the same, and
 * the extractor returned only the first match per property. A specification that
 * appears in the electrical characteristics table, again in the ordering
 * information and once more in a summary is therefore presented as a single
 * quotation from one page, which is both less useful and, for a reviewer judging
 * whether to write a value into the ERP, less honest.
 *
 * This module is the presentation-independent half of that fix: it decides what
 * role an evidence item plays, collapses items that say the same thing, and puts
 * them in an order that is stable across runs so a fingerprint over them never
 * moves for a cosmetic reason.
 *
 * The role vocabulary is a *classification of the section the extractor actually
 * found*, never a guess: an item whose section the extractor could not identify
 * is CONTEXTUAL, not promoted.
 */

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

/**
 * What an evidence item contributes.
 *
 *  - PRIMARY    a specification section states the value (electrical
 *               characteristics, absolute maximum ratings)
 *  - SUPPORTING the value appears in a secondary but still authoritative
 *               location (ordering information, mechanical/package data)
 *  - CONTEXTUAL the value only appears in prose or a summary
 */
export const EVIDENCE_ROLES = ['PRIMARY', 'SUPPORTING', 'CONTEXTUAL'] as const;

export type EvidenceRole = (typeof EVIDENCE_ROLES)[number];

export const EVIDENCE_ROLE_LABELS: Record<EvidenceRole, string> = {
  PRIMARY: 'Specification table',
  SUPPORTING: 'Supporting section',
  CONTEXTUAL: 'Contextual mention',
};

/** Ordering weight: strongest first. */
const ROLE_RANK: Record<EvidenceRole, number> = {
  PRIMARY: 0,
  SUPPORTING: 1,
  CONTEXTUAL: 2,
};

/**
 * Datasheet sections the extractor can identify, and the role each contributes.
 *
 * Kept as a closed vocabulary so the API and the ML service cannot drift: the
 * extractor emits one of these strings, or nothing.
 */
export const DATASHEET_SECTIONS = [
  'ELECTRICAL_CHARACTERISTICS',
  'ABSOLUTE_MAXIMUM_RATINGS',
  'ORDERING_INFORMATION',
  'MECHANICAL',
  'GENERAL',
] as const;

export type DatasheetSection = (typeof DATASHEET_SECTIONS)[number];

export const DATASHEET_SECTION_LABELS: Record<DatasheetSection, string> = {
  ELECTRICAL_CHARACTERISTICS: 'Electrical characteristics',
  ABSOLUTE_MAXIMUM_RATINGS: 'Absolute maximum ratings',
  ORDERING_INFORMATION: 'Ordering information',
  MECHANICAL: 'Mechanical data',
  GENERAL: 'General information',
};

const SECTION_ROLES: Record<DatasheetSection, EvidenceRole> = {
  ELECTRICAL_CHARACTERISTICS: 'PRIMARY',
  ABSOLUTE_MAXIMUM_RATINGS: 'PRIMARY',
  ORDERING_INFORMATION: 'SUPPORTING',
  MECHANICAL: 'SUPPORTING',
  GENERAL: 'CONTEXTUAL',
};

/** Whether a string is a section this contract defines. */
export function isDatasheetSection(
  value: string | null | undefined,
): value is DatasheetSection {
  return Boolean(
    value && (DATASHEET_SECTIONS as readonly string[]).includes(value),
  );
}

/**
 * The role an evidence item plays.
 *
 * An unidentified section is CONTEXTUAL: the extractor could not justify a
 * stronger claim, so none is made.
 */
export function classifyEvidenceRole(input: {
  section?: string | null;
  /** Data Pack / configuration corroboration carries no document location. */
  fromDocument?: boolean;
}): EvidenceRole {
  if (input.fromDocument === false) return 'CONTEXTUAL';
  if (!isDatasheetSection(input.section)) return 'CONTEXTUAL';
  return SECTION_ROLES[input.section];
}

/** The strongest role in a set, or null for an empty set. */
export function strongestEvidenceRole(
  items: readonly { role: EvidenceRole }[],
): EvidenceRole | null {
  let best: EvidenceRole | null = null;
  for (const item of items) {
    if (!best || ROLE_RANK[item.role] < ROLE_RANK[best]) best = item.role;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Evidence items
// ---------------------------------------------------------------------------

/** One piece of evidence for one specification, located in one document. */
export interface SpecificationEvidenceItem {
  role: EvidenceRole;
  documentId: string;
  documentVersion: number;
  documentContentHash: string;
  documentFileName: string | null;
  documentType: string | null;
  /** 1-based page, only when the extractor located the value. */
  page: number | null;
  text: string | null;
  extractionMethod: string;
  /** Machine-ish tag the extractor used, preserved for diagnostics. */
  source: string | null;
  weight: number;
  description: string;
  section: DatasheetSection | null;
}

/**
 * Stable identity of one evidence item.
 *
 * Deliberately excludes weight, description and role: the same quotation from
 * the same page of the same document revision is the same evidence, whatever
 * punctuation the extractor put around it. `text` is compared after whitespace
 * and case folding so a re-serialised PDF page does not multiply the evidence.
 */
export function evidenceIdentity(
  item: Pick<
    SpecificationEvidenceItem,
    'documentId' | 'documentVersion' | 'documentContentHash' | 'page' | 'text'
  >,
): string {
  const text = (item.text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  return [
    item.documentId,
    String(item.documentVersion),
    item.documentContentHash,
    item.page === null ? '-' : String(item.page),
    text,
  ].join('|');
}

/**
 * Collapses duplicate evidence, keeping the strongest contribution.
 *
 * Two items are the same evidence when they quote the same text from the same
 * page of the same document revision. The survivor keeps the strongest role and
 * the highest weight, so a section identification is never lost to a weaker
 * duplicate of the same line.
 */
export function deduplicateEvidence(
  items: readonly SpecificationEvidenceItem[],
): SpecificationEvidenceItem[] {
  const byIdentity = new Map<string, SpecificationEvidenceItem>();

  for (const item of items) {
    const key = evidenceIdentity(item);
    const existing = byIdentity.get(key);
    if (!existing) {
      byIdentity.set(key, item);
      continue;
    }

    const preferred =
      ROLE_RANK[item.role] < ROLE_RANK[existing.role] ? item : existing;
    const other = preferred === item ? existing : item;
    byIdentity.set(key, {
      ...preferred,
      weight: Math.max(preferred.weight, other.weight),
      section: preferred.section ?? other.section,
      extractionMethod: preferred.extractionMethod || other.extractionMethod,
    });
  }

  return [...byIdentity.values()];
}

/**
 * Deterministic evidence order.
 *
 * Strongest role first, then document identity, then page, then text. Every
 * component of the key is stable across runs, so a caller may safely include the
 * ordered list in a fingerprint: the order can only change when the evidence
 * itself changes.
 */
export function orderEvidence(
  items: readonly SpecificationEvidenceItem[],
): SpecificationEvidenceItem[] {
  return [...items].sort((first, second) => {
    const byRole = ROLE_RANK[first.role] - ROLE_RANK[second.role];
    if (byRole !== 0) return byRole;

    const byVersion = first.documentVersion - second.documentVersion;
    if (byVersion !== 0) return byVersion;

    const byDocument = first.documentId.localeCompare(second.documentId);
    if (byDocument !== 0) return byDocument;

    const firstPage = first.page ?? Number.MAX_SAFE_INTEGER;
    const secondPage = second.page ?? Number.MAX_SAFE_INTEGER;
    if (firstPage !== secondPage) return firstPage - secondPage;

    return (first.text ?? '').localeCompare(second.text ?? '');
  });
}

/** Deduplicate then order, which is what every consumer actually wants. */
export function normalizeEvidence(
  items: readonly SpecificationEvidenceItem[],
): SpecificationEvidenceItem[] {
  return orderEvidence(deduplicateEvidence(items));
}

/**
 * Distinct documents that contributed evidence.
 *
 * Counted by document, not by version, so three revisions of one datasheet
 * count as one source — the number a reviewer reads as "how many independent
 * places say this".
 */
export function countEvidenceDocuments(
  items: readonly SpecificationEvidenceItem[],
): number {
  return new Set(items.map((item) => item.documentId)).size;
}

/** Pages, by document, that carry a specification section at all. */
export function hasPrimaryEvidence(
  items: readonly SpecificationEvidenceItem[],
): boolean {
  return items.some((item) => item.role === 'PRIMARY');
}

/**
 * A bounded, deterministic summary line for a set of evidence.
 *
 * Reads as "Electrical characteristics, page 3 (Datasheet.pdf)" so a reviewer can
 * tell where a value came from without opening the file.
 */
export function describeEvidenceSummary(
  items: readonly SpecificationEvidenceItem[],
  max = 3,
): string[] {
  return orderEvidence(items)
    .slice(0, max)
    .map((item) => {
      const where = item.page === null ? 'unlocated' : `page ${item.page}`;
      const section = item.section
        ? DATASHEET_SECTION_LABELS[item.section]
        : 'unclassified section';
      const file = item.documentFileName ?? item.documentType ?? 'document';
      return `${section}, ${where} (${file})`;
    });
}

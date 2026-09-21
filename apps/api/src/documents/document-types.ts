/**
 * Canonical document type vocabulary.
 *
 * This is the single source of truth for the API. The web client mirrors the
 * labels in `apps/web/lib/component-documentation.ts` (it cannot import from
 * this package), and a web test asserts the two vocabularies stay identical.
 *
 * Adding a type is an additive change: append to {@link DOCUMENT_TYPES} and add
 * its label. Values are stored as plain varchars, matching the repository
 * convention of avoiding PostgreSQL enums for status/type columns.
 */
export const DOCUMENT_TYPES = [
  'DATASHEET',
  'PRODUCT_PAGE',
  'APPLICATION_NOTE',
  'TECHNICAL_MANUAL',
  'REFERENCE_DESIGN',
  'CAD_DRAWING',
  'THREE_D_MODEL',
  'FOOTPRINT',
  'SYMBOL',
  'SAFETY_DOCUMENT',
  'CERTIFICATE',
  'COMPLIANCE_DOCUMENT',
  'TEST_REPORT',
  'INSTALLATION_GUIDE',
  'USER_MANUAL',
  'PHOTOGRAPH',
  'OTHER',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  DATASHEET: 'Datasheet',
  PRODUCT_PAGE: 'Product Page',
  APPLICATION_NOTE: 'Application Note',
  TECHNICAL_MANUAL: 'Technical Manual',
  REFERENCE_DESIGN: 'Reference Design',
  CAD_DRAWING: 'CAD Drawing',
  THREE_D_MODEL: '3D Model',
  FOOTPRINT: 'Footprint',
  SYMBOL: 'Symbol',
  SAFETY_DOCUMENT: 'Safety Document',
  CERTIFICATE: 'Certificate',
  COMPLIANCE_DOCUMENT: 'Compliance Document',
  TEST_REPORT: 'Test Report',
  INSTALLATION_GUIDE: 'Installation Guide',
  USER_MANUAL: 'User Manual',
  PHOTOGRAPH: 'Photograph',
  OTHER: 'Other',
};

/**
 * Fallback used when a record predates the document-type column. Rows created
 * by the API always carry an explicit, validated type.
 */
export const DEFAULT_DOCUMENT_TYPE: DocumentType = 'OTHER';

/** Source kinds a documentation record can have. */
export const DOCUMENT_SOURCE_TYPES = ['UPLOADED_FILE', 'EXTERNAL_URL'] as const;

export type DocumentSourceType = (typeof DOCUMENT_SOURCE_TYPES)[number];

export const DOCUMENT_SOURCE_TYPE_LABELS: Record<DocumentSourceType, string> = {
  UPLOADED_FILE: 'Uploaded file',
  EXTERNAL_URL: 'External link',
};

export const DEFAULT_DOCUMENT_SOURCE_TYPE: DocumentSourceType = 'UPLOADED_FILE';

export function isDocumentType(value: unknown): value is DocumentType {
  return (
    typeof value === 'string' &&
    (DOCUMENT_TYPES as readonly string[]).includes(value)
  );
}

export function isDocumentSourceType(
  value: unknown,
): value is DocumentSourceType {
  return (
    typeof value === 'string' &&
    (DOCUMENT_SOURCE_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Normalises untrusted input (request bodies, query parameters) into a
 * vocabulary value, or `null` when it is not a valid type. Case and
 * surrounding whitespace are tolerated so callers do not have to be exact.
 */
export function normalizeDocumentType(value: unknown): DocumentType | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim().toUpperCase();
  return isDocumentType(candidate) ? candidate : null;
}

/**
 * Reads a stored type. Used for rows written before the column existed, where
 * the value is NULL and must not be presented as an unknown/blank type.
 */
export function readDocumentType(value: unknown): DocumentType {
  return normalizeDocumentType(value) ?? DEFAULT_DOCUMENT_TYPE;
}

export function readDocumentSourceType(value: unknown): DocumentSourceType {
  if (typeof value !== 'string') return DEFAULT_DOCUMENT_SOURCE_TYPE;
  const candidate = value.trim().toUpperCase();
  return isDocumentSourceType(candidate)
    ? candidate
    : DEFAULT_DOCUMENT_SOURCE_TYPE;
}

export function documentTypeLabel(value: unknown): string {
  return DOCUMENT_TYPE_LABELS[readDocumentType(value)];
}

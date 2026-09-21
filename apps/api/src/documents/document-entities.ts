/**
 * Entity types documentation can currently be filed against.
 *
 * The `documents` table is polymorphic and stays generic, but the API only
 * accepts types it can validate: for every supported value the service also
 * verifies the referenced record exists, which is what prevents orphaned
 * documentation. Pass 1 supports components; extending this list is the
 * intended way to document another entity type.
 */
export const SUPPORTED_DOCUMENT_ENTITY_TYPES = ['Component'] as const;

export type SupportedDocumentEntityType =
  (typeof SUPPORTED_DOCUMENT_ENTITY_TYPES)[number];

/** Entity type used for component documentation. */
export const COMPONENT_DOCUMENT_ENTITY_TYPE: SupportedDocumentEntityType =
  'Component';

export function isSupportedDocumentEntityType(
  value: unknown,
): value is SupportedDocumentEntityType {
  return (
    typeof value === 'string' &&
    (SUPPORTED_DOCUMENT_ENTITY_TYPES as readonly string[]).includes(value)
  );
}

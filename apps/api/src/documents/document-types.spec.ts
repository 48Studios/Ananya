import {
  DEFAULT_DOCUMENT_TYPE,
  DOCUMENT_SOURCE_TYPES,
  DOCUMENT_SOURCE_TYPE_LABELS,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  documentTypeLabel,
  isDocumentSourceType,
  isDocumentType,
  normalizeDocumentType,
  readDocumentType,
  readDocumentSourceType,
} from './document-types';

describe('document types', () => {
  it('exposes the approved vocabulary and nothing else', () => {
    expect(DOCUMENT_TYPES).toHaveLength(17);
    expect(new Set(DOCUMENT_TYPES).size).toBe(DOCUMENT_TYPES.length);
    expect(DOCUMENT_TYPES).toContain('DATASHEET');
    expect(DOCUMENT_TYPES).toContain('THREE_D_MODEL');
    expect(DOCUMENT_TYPES).toContain('OTHER');
    // Free-form values are not part of the vocabulary.
    expect(isDocumentType('SPEC_SHEET')).toBe(false);
    expect(isDocumentType('datasheet')).toBe(false);
    expect(isDocumentType(undefined)).toBe(false);
    expect(isDocumentType(42)).toBe(false);
  });

  it('labels every type in the vocabulary', () => {
    for (const type of DOCUMENT_TYPES) {
      expect(DOCUMENT_TYPE_LABELS[type]).toBeTruthy();
    }
    expect(documentTypeLabel('DATASHEET')).toBe('Datasheet');
    expect(documentTypeLabel('THREE_D_MODEL')).toBe('3D Model');
  });

  it('normalises case and whitespace', () => {
    expect(normalizeDocumentType(' datasheet ')).toBe('DATASHEET');
    expect(normalizeDocumentType('Other')).toBe('OTHER');
    expect(normalizeDocumentType('not-a-type')).toBeNull();
    expect(normalizeDocumentType(null)).toBeNull();
  });

  it('reads legacy rows that predate the column as OTHER', () => {
    expect(readDocumentType(null)).toBe(DEFAULT_DOCUMENT_TYPE);
    expect(readDocumentType(undefined)).toBe('OTHER');
    expect(readDocumentType('')).toBe('OTHER');
    expect(readDocumentType('CERTIFICATE')).toBe('CERTIFICATE');
  });

  it('exposes exactly two source kinds', () => {
    expect(DOCUMENT_SOURCE_TYPES).toEqual(['UPLOADED_FILE', 'EXTERNAL_URL']);
    expect(isDocumentSourceType('UPLOADED_FILE')).toBe(true);
    expect(isDocumentSourceType('EXTERNAL_URL')).toBe(true);
    expect(isDocumentSourceType('LINK')).toBe(false);
    for (const source of DOCUMENT_SOURCE_TYPES) {
      expect(DOCUMENT_SOURCE_TYPE_LABELS[source]).toBeTruthy();
    }
  });

  it('defaults an unknown stored source kind to UPLOADED_FILE', () => {
    expect(readDocumentSourceType(null)).toBe('UPLOADED_FILE');
    expect(readDocumentSourceType('garbage')).toBe('UPLOADED_FILE');
    expect(readDocumentSourceType('external_url')).toBe('EXTERNAL_URL');
  });
});

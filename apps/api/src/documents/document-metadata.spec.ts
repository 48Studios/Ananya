import {
  MAX_DOCUMENT_TAGS,
  MAX_DOCUMENT_TAG_LENGTH,
  parseBooleanInput,
  parseDocumentTags,
  parseOptionalText,
} from './document-metadata';

describe('document metadata coercion', () => {
  describe('tags', () => {
    it('accepts an array', () => {
      expect(parseDocumentTags(['power', 'smd'])).toEqual(['power', 'smd']);
    });

    it('accepts a JSON array string (multipart)', () => {
      expect(parseDocumentTags('["power","smd"]')).toEqual(['power', 'smd']);
    });

    it('accepts a comma separated string', () => {
      expect(parseDocumentTags('power, smd ,  ')).toEqual(['power', 'smd']);
    });

    it('de-duplicates case-insensitively, keeping the first spelling', () => {
      expect(parseDocumentTags(['Power', 'power', 'POWER'])).toEqual(['Power']);
    });

    it('drops unusable entries and caps count and length', () => {
      expect(parseDocumentTags([1, null, '', '  ok  '])).toEqual(['ok']);
      expect(parseDocumentTags(undefined)).toEqual([]);
      expect(parseDocumentTags('{not json')).toEqual(['{not json']);

      const many = Array.from({ length: 40 }, (_, i) => `tag-${i}`);
      expect(parseDocumentTags(many)).toHaveLength(MAX_DOCUMENT_TAGS);

      const long = parseDocumentTags(['x'.repeat(200)]);
      expect(long[0]).toHaveLength(MAX_DOCUMENT_TAG_LENGTH);
    });
  });

  describe('booleans', () => {
    it('reads booleans and their multipart string forms', () => {
      expect(parseBooleanInput(true)).toBe(true);
      expect(parseBooleanInput('true')).toBe(true);
      expect(parseBooleanInput('TRUE')).toBe(true);
      expect(parseBooleanInput('1')).toBe(true);
      expect(parseBooleanInput(false)).toBe(false);
      expect(parseBooleanInput('false')).toBe(false);
      expect(parseBooleanInput('0')).toBe(false);
    });

    it('returns undefined for anything else rather than guessing', () => {
      expect(parseBooleanInput('yes')).toBeUndefined();
      expect(parseBooleanInput('')).toBeUndefined();
      expect(parseBooleanInput(undefined)).toBeUndefined();
      expect(parseBooleanInput(2)).toBeUndefined();
    });
  });

  describe('optional text', () => {
    it('trims and treats blanks as absent', () => {
      expect(parseOptionalText('  hello ')).toBe('hello');
      expect(parseOptionalText('   ')).toBeUndefined();
      expect(parseOptionalText(undefined)).toBeUndefined();
      expect(parseOptionalText(7)).toBeUndefined();
    });
  });
});

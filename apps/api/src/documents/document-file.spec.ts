import {
  ALLOWED_DOCUMENT_EXTENSIONS,
  buildContentDispositionHeader,
  buildDocumentStorageKey,
  DOCUMENT_MIME_TYPE_BY_EXTENSION,
  documentFileExtension,
  formatDocumentBytes,
  isOpaqueMimeType,
  isPathInsideDirectory,
  MAX_DOCUMENT_UPLOAD_BYTES,
  resolveDocumentMimeType,
  sanitizeDocumentFileName,
} from './document-file';

describe('document file rules', () => {
  it('keeps the existing 50 MB upload contract', () => {
    expect(MAX_DOCUMENT_UPLOAD_BYTES).toBe(50 * 1024 * 1024);
  });

  it('reads extensions, ignoring directories and hidden files', () => {
    expect(documentFileExtension('datasheet.pdf')).toBe('pdf');
    expect(documentFileExtension('PART.STEP')).toBe('step');
    expect(documentFileExtension('../../etc/passwd')).toBeNull();
    expect(documentFileExtension('.env')).toBeNull();
    expect(documentFileExtension('noextension')).toBeNull();
    expect(documentFileExtension(undefined)).toBeNull();
  });

  describe('mime resolution', () => {
    it('prefers the extension for engineering formats browsers cannot type', () => {
      const step = resolveDocumentMimeType('bracket.step', '');
      expect(step.ok).toBe(true);
      if (!step.ok) return;
      expect(step.mimeType).toBe('model/step');

      const dwg = resolveDocumentMimeType(
        'layout.dwg',
        'application/octet-stream',
      );
      expect(dwg.ok).toBe(true);
      if (!dwg.ok) return;
      expect(dwg.mimeType).toBe('image/vnd.dwg');
    });

    it('accepts a specific allow-listed type when the extension is unknown', () => {
      const result = resolveDocumentMimeType('scan', 'image/png');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.mimeType).toBe('image/png');
    });

    it('refuses an opaque type with an unknown extension', () => {
      const result = resolveDocumentMimeType(
        'payload.bin',
        'application/octet-stream',
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.message).toContain('Unsupported file format');
    });

    it('refuses a clearly unsupported type', () => {
      const result = resolveDocumentMimeType(
        'installer.exe',
        'application/x-msdownload',
      );
      expect(result.ok).toBe(false);
    });

    it('strips parameters from the reported type', () => {
      const result = resolveDocumentMimeType(
        'table',
        'text/csv; charset=utf-8',
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.mimeType).toBe('text/csv');
    });

    it('publishes a sorted extension allow-list', () => {
      expect(ALLOWED_DOCUMENT_EXTENSIONS).toEqual(
        [...ALLOWED_DOCUMENT_EXTENSIONS].sort(),
      );
      expect(ALLOWED_DOCUMENT_EXTENSIONS).toContain('pdf');
      expect(Object.keys(DOCUMENT_MIME_TYPE_BY_EXTENSION)).toHaveLength(
        ALLOWED_DOCUMENT_EXTENSIONS.length,
      );
    });

    it('classifies opaque types', () => {
      expect(isOpaqueMimeType('application/octet-stream')).toBe(true);
      expect(isOpaqueMimeType('')).toBe(true);
      expect(isOpaqueMimeType(undefined)).toBe(true);
      expect(isOpaqueMimeType('application/pdf')).toBe(false);
    });
  });

  describe('file name sanitisation', () => {
    it('strips traversal and path separators', () => {
      expect(sanitizeDocumentFileName('../../etc/passwd')).toBe('passwd');
      expect(sanitizeDocumentFileName('..\\..\\windows\\system32\\cfg')).toBe(
        'cfg',
      );
      expect(sanitizeDocumentFileName('/absolute/path/file.pdf')).toBe(
        'file.pdf',
      );
    });

    it('keeps readable names and replaces unsafe characters', () => {
      expect(sanitizeDocumentFileName('RC0805FR-0710KL datasheet.pdf')).toBe(
        'RC0805FR-0710KL datasheet.pdf',
      );
      expect(sanitizeDocumentFileName('why?.pdf')).toBe('why_.pdf');

      expect(sanitizeDocumentFileName('bad\u0000name.pdf')).toBe('badname.pdf');
    });

    it('never returns an empty or hidden name', () => {
      expect(sanitizeDocumentFileName('....')).toBe('document');
      expect(sanitizeDocumentFileName('')).toBe('document');
      expect(sanitizeDocumentFileName(undefined)).toBe('document');
      // A leading dot is stripped, so the name can never be hidden.
      expect(sanitizeDocumentFileName('.hidden')).toBe('hidden');
    });

    it('caps the length while preserving the extension', () => {
      const name = `${'a'.repeat(500)}.pdf`;
      const sanitized = sanitizeDocumentFileName(name);
      expect(sanitized.length).toBeLessThanOrEqual(200);
      expect(sanitized.endsWith('.pdf')).toBe(true);
    });
  });

  describe('storage keys', () => {
    it('is deterministic apart from the unique suffix and never contains path segments', () => {
      const key = buildDocumentStorageKey({
        entityType: 'Component',
        entityId: '00000000-0000-0000-0000-000000000001',
        uniqueSuffix: 'abc',
        fileName: '../../evil name.pdf',
      });
      expect(key).toBe(
        'Component_00000000-0000-0000-0000-000000000001_abc_evil name.pdf',
      );
      expect(key).not.toContain('/');
      expect(key).not.toContain('..');
    });

    it('sanitises hostile entity identifiers', () => {
      const key = buildDocumentStorageKey({
        entityType: '../Component',
        entityId: 'a/b',
        uniqueSuffix: 'x',
        fileName: 'f.pdf',
      });
      // Leading dots and separators cannot survive into the key.
      expect(key).toBe('_Component_a_b_x_f.pdf');
    });
  });

  describe('path containment', () => {
    it('accepts children and rejects escapes', () => {
      expect(isPathInsideDirectory('/srv/uploads', '/srv/uploads/a.pdf')).toBe(
        true,
      );
      expect(isPathInsideDirectory('/srv/uploads', '/srv/uploads')).toBe(false);
      expect(isPathInsideDirectory('/srv/uploads', '/srv/other/a.pdf')).toBe(
        false,
      );
      expect(
        isPathInsideDirectory('/srv/uploads', '/srv/uploads/../a.pdf'),
      ).toBe(false);
    });
  });

  describe('content disposition', () => {
    it('builds a quoted attachment header', () => {
      const header = buildContentDispositionHeader('attachment', 'part.pdf');
      expect(header).toContain('attachment;');
      expect(header).toContain('filename="part.pdf"');
      expect(header).toContain("filename*=UTF-8''part.pdf");
    });

    it('encodes non-ascii names and strips header-injection characters', () => {
      const header = buildContentDispositionHeader(
        'inline',
        'résumé\r\nX-Evil: 1.pdf',
      );
      expect(header.startsWith('inline;')).toBe(true);
      // No CR/LF can reach the header, which is what prevents injection.
      expect(header).not.toContain('\r');
      expect(header).not.toContain('\n');
      expect(header).toContain('%C3%A9');
      expect(header.split('\n')).toHaveLength(1);
    });

    it('falls back when the name sanitises to nothing', () => {
      const header = buildContentDispositionHeader('attachment', '\n\n');
      expect(header).toContain('filename="document"');
    });
  });

  it('formats byte sizes for messages', () => {
    expect(formatDocumentBytes(50 * 1024 * 1024)).toBe('50 MB');
    expect(formatDocumentBytes(2048)).toBe('2 KB');
    expect(formatDocumentBytes(512)).toBe('512 bytes');
  });
});

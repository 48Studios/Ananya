import {
  externalUrlHost,
  MAX_EXTERNAL_URL_LENGTH,
  validateExternalUrl,
} from './document-url';

describe('external URL validation', () => {
  it('accepts https and http URLs and keeps them verbatim', () => {
    const https = validateExternalUrl(
      'https://www.vishay.com/docs/88746/ss32.pdf',
    );
    expect(https.ok).toBe(true);
    if (!https.ok) return;
    expect(https.value.url).toBe('https://www.vishay.com/docs/88746/ss32.pdf');
    expect(https.value.host).toBe('www.vishay.com');
    expect(https.value.protocol).toBe('https:');

    const http = validateExternalUrl('http://example.com/part?id=1');
    expect(http.ok).toBe(true);
    if (!http.ok) return;
    expect(http.value.host).toBe('example.com');
  });

  it('trims surrounding whitespace', () => {
    const result = validateExternalUrl('  https://example.com/a  ');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.url).toBe('https://example.com/a');
  });

  it('rejects non-web protocols', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'file:///etc/passwd',
      'ftp://example.com/x',
    ]) {
      const result = validateExternalUrl(url);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(['UNSUPPORTED_PROTOCOL', 'MALFORMED']).toContain(result.reason);
    }
  });

  it('rejects relative and malformed input', () => {
    const relative = validateExternalUrl('/documents/123/download');
    expect(relative.ok).toBe(false);
    if (relative.ok) return;
    expect(relative.reason).toBe('MALFORMED');

    const blank = validateExternalUrl('   ');
    expect(blank.ok).toBe(false);
    if (blank.ok) return;
    expect(blank.reason).toBe('EMPTY');

    expect(validateExternalUrl(undefined).ok).toBe(false);
    expect(validateExternalUrl(1234).ok).toBe(false);
  });

  it('rejects URLs with embedded credentials', () => {
    const result = validateExternalUrl('https://user:secret@example.com/x');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('EMBEDDED_CREDENTIALS');
  });

  it('rejects URLs longer than the limit', () => {
    const result = validateExternalUrl(
      `https://example.com/${'a'.repeat(MAX_EXTERNAL_URL_LENGTH)}`,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('TOO_LONG');
  });

  it('reports a hostname for display, or null when unusable', () => {
    expect(externalUrlHost('https://WWW.Example.com/path')).toBe(
      'www.example.com',
    );
    expect(externalUrlHost('not a url')).toBeNull();
    expect(externalUrlHost('')).toBeNull();
    expect(externalUrlHost(null)).toBeNull();
  });
});

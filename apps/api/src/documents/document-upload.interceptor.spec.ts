import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { mapUploadError } from './document-upload.interceptor';

describe('document upload error mapping', () => {
  it('maps an oversized multipart file to 413 with the documented limit', () => {
    const mapped = mapUploadError({ code: 'LIMIT_FILE_SIZE' });
    expect(mapped).toBeInstanceOf(PayloadTooLargeException);
    expect((mapped as Error).message).toContain('50 MB');
  });

  it('maps an unexpected file field to a clear 400', () => {
    const mapped = mapUploadError({ code: 'LIMIT_UNEXPECTED_FILE' });
    expect(mapped).toBeInstanceOf(BadRequestException);
    expect((mapped as Error).message).toContain('"file" field');
  });

  it('maps oversized metadata fields to 400', () => {
    expect(mapUploadError({ code: 'LIMIT_FIELD_VALUE' })).toBeInstanceOf(
      BadRequestException,
    );
    expect(mapUploadError({ code: 'LIMIT_FIELD_COUNT' })).toBeInstanceOf(
      BadRequestException,
    );
  });

  it('passes unrelated errors through untouched', () => {
    const original = new Error('boom');
    expect(mapUploadError(original)).toBe(original);
    expect(mapUploadError(undefined)).toBeUndefined();
  });
});

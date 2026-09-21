import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { StorageService } from './storage.service';
import { ActivityService } from '../activity/activity.service';
import { SecurityAuditService } from '../security-audit/security-audit.service';
import { MAX_DOCUMENT_UPLOAD_BYTES } from './document-file';
import type { UploadDocumentDto, UploadedDocumentFile } from './dtos';

describe('DocumentsService', () => {
  let service: DocumentsService;
  const storeFile = jest.fn();
  const activityService = { createEvent: jest.fn() };
  const auditService = { record: jest.fn() };

  const componentId = '11111111-2222-3333-4444-555555555555';

  beforeEach(() => {
    jest.clearAllMocks();
    storeFile.mockResolvedValue({
      storageKey: 'stored.pdf',
      sizeBytes: 4,
    });

    service = new DocumentsService(
      {
        driver: 'local',
        storeFile,
        readFile: jest.fn(),
        deleteFile: jest.fn(),
        exists: jest.fn(),
      } as unknown as StorageService,
      activityService as unknown as ActivityService,
      auditService as unknown as SecurityAuditService,
    );
  });

  function uploadDto(overrides: Partial<UploadDocumentDto> = {}) {
    return {
      entityType: 'Component',
      entityId: componentId,
      documentType: 'DATASHEET',
      ...overrides,
    };
  }

  function uploadedFile(
    overrides: Partial<UploadedDocumentFile> = {},
  ): UploadedDocumentFile {
    const buffer = Buffer.from('data');
    return {
      originalname: 'datasheet.pdf',
      buffer,
      size: buffer.length,
      mimetype: 'application/pdf',
      ...overrides,
    };
  }

  describe('upload validation', () => {
    it('requires a file', async () => {
      await expect(
        service.uploadDocument(uploadDto(), undefined, {}),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storeFile).not.toHaveBeenCalled();
    });

    it('rejects an empty file', async () => {
      await expect(
        service.uploadDocument(
          uploadDto(),
          uploadedFile({ buffer: Buffer.alloc(0), size: 0 }),
          {},
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storeFile).not.toHaveBeenCalled();
    });

    it('rejects a file above the 50 MB contract with 413', async () => {
      await expect(
        service.uploadDocument(
          uploadDto(),
          uploadedFile({ size: MAX_DOCUMENT_UPLOAD_BYTES + 1 }),
          {},
        ),
      ).rejects.toBeInstanceOf(PayloadTooLargeException);
      expect(storeFile).not.toHaveBeenCalled();
    });

    it('rejects an unsupported file format with a clear message', async () => {
      await expect(
        service.uploadDocument(
          uploadDto(),
          uploadedFile({
            originalname: 'installer.exe',
            mimetype: 'application/x-msdownload',
          }),
          {},
        ),
      ).rejects.toThrow(/Unsupported file format/);
      expect(storeFile).not.toHaveBeenCalled();
    });

    it('rejects an unsupported entity type before touching storage', async () => {
      await expect(
        service.uploadDocument(
          uploadDto({ entityType: 'Invoice' }),
          uploadedFile(),
          {},
        ),
      ).rejects.toThrow(/Unsupported entity type/);
      expect(storeFile).not.toHaveBeenCalled();
    });

    it('rejects a document type outside the vocabulary', async () => {
      await expect(
        service.uploadDocument(
          uploadDto({ documentType: 'WHATEVER' }),
          uploadedFile(),
          {},
        ),
      ).rejects.toThrow(/valid document type/);
      expect(storeFile).not.toHaveBeenCalled();
    });
  });

  describe('external references', () => {
    it('rejects an invalid URL before any write', async () => {
      await expect(
        service.createExternalUrlDocument(
          {
            entityType: 'Component',
            entityId: componentId,
            documentType: 'PRODUCT_PAGE',
            url: 'javascript:alert(1)',
          },
          {},
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an invalid document type before validating the URL target', async () => {
      await expect(
        service.createExternalUrlDocument(
          {
            entityType: 'Component',
            entityId: componentId,
            documentType: 'NOPE',
            url: 'https://example.com/a',
          },
          {},
        ),
      ).rejects.toThrow(/valid document type/);
    });
  });

  describe('list', () => {
    it('refuses an unsupported entity type', async () => {
      await expect(
        service.getEntityDocuments('Invoice', componentId),
      ).rejects.toThrow(/Unsupported entity type/);
    });
  });
});

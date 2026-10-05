import { Test, TestingModule } from '@nestjs/testing';
import {
  BackupsService,
  BackupPreflightIntegrityError,
} from './backups.service';
import { BackupsMetricsService } from './backups-metrics.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { SecurityAuditService } from '../security-audit/security-audit.service';
import { db } from '@ananya/database';
import { StorageService } from '../documents/storage.service';
import { BACKUP_EVENT_TYPES } from '../email-templates/template-registry';

jest.mock('@ananya/database', () => {
  return {
    db: {
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([
            {
              id: 'artifact-test-1',
              name: 'Preflight Test Backup',
              status: 'RUNNING',
              formatVersion: '2',
              scope: { includeFiles: true },
            },
          ]),
        }),
      }),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      }),
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      }),
    },
    pool: {
      query: jest.fn().mockImplementation((queryText: string) => {
        if (queryText.includes('from documents')) {
          return Promise.resolve({
            rows: [
              { storage_key: 'doc-present-1.pdf' },
              { storage_key: 'doc-present-1.pdf' }, // Duplicate
              { storage_key: 'doc-missing-1.pdf' },
              { storage_key: 'doc-missing-2.pdf' },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      }),
    },
  };
});

describe('Backup Storage Preflight & Fail-Closed Integrity', () => {
  let service: BackupsService;
  let storageService: jest.Mocked<Partial<StorageService>>;
  let metricsService: jest.Mocked<Partial<BackupsMetricsService>>;
  let notificationsService: jest.Mocked<Partial<NotificationsService>>;
  let recordBackupFailedMock: jest.Mock<void, [{ error?: string }]>;

  beforeEach(async () => {
    jest.clearAllMocks();

    storageService = {
      exists: jest.fn().mockImplementation((key: string) => {
        return Promise.resolve(!key.includes('missing'));
      }),
      readFile: jest.fn().mockResolvedValue(Buffer.from('dummy file content')),
      storeFileFromPath: jest.fn().mockResolvedValue({
        storageKey: 'art-key',
        sizeBytes: 100,
      }),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };

    recordBackupFailedMock = jest.fn<void, [{ error?: string }]>();
    metricsService = {
      recordBackupStarted: jest.fn(),
      recordBackupSucceeded: jest.fn(),
      recordBackupFailed: recordBackupFailedMock,
    };

    notificationsService = {
      createNotification: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackupsService,
        { provide: StorageService, useValue: storageService },
        {
          provide: SecurityAuditService,
          useValue: { record: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: NotificationsService, useValue: notificationsService },
        {
          provide: MailService,
          useValue: { enqueue: jest.fn().mockResolvedValue('outbox-1') },
        },
        { provide: BackupsMetricsService, useValue: metricsService },
      ],
    }).compile();

    service = module.get<BackupsService>(BackupsService);
  });

  describe('BackupPreflightIntegrityError formatting', () => {
    it('formats error with single missing file', () => {
      const error = new BackupPreflightIntegrityError(['file-a.pdf']);
      expect(error.name).toBe('BackupPreflightIntegrityError');
      expect(error.missingCount).toBe(1);
      expect(error.missingKeys).toEqual(['file-a.pdf']);
      expect(error.message).toContain(
        '1 referenced document file(s) are missing from storage',
      );
      expect(error.message).toContain('[file-a.pdf]');
    });

    it('formats error with multiple missing files and truncates if > 10', () => {
      const keys = Array.from({ length: 15 }, (_, i) => `doc-${i + 1}.pdf`);
      const error = new BackupPreflightIntegrityError(keys);
      expect(error.missingCount).toBe(15);
      expect(error.missingKeys).toHaveLength(15);
      expect(error.message).toContain(
        '15 referenced document file(s) are missing from storage',
      );
      expect(error.message).toContain('(and 5 more)');
    });
  });

  describe('Storage Preflight Verification', () => {
    it('1. proceeds normally when all referenced files exist in storage', async () => {
      storageService.exists = jest.fn().mockResolvedValue(true);

      const uniqueValidated = await (
        service as unknown as {
          preflightStorageDocuments: (keys: string[]) => Promise<string[]>;
        }
      ).preflightStorageDocuments(['file-1.pdf', 'file-2.pdf']);

      expect(uniqueValidated).toEqual(['file-1.pdf', 'file-2.pdf']);
      expect(storageService.exists).toHaveBeenCalledTimes(2);
    });

    it('2. fails during preflight when one referenced file is missing', async () => {
      storageService.exists = jest.fn().mockImplementation((key: string) => {
        return Promise.resolve(key !== 'missing.pdf');
      });

      await expect(
        (
          service as unknown as {
            preflightStorageDocuments: (keys: string[]) => Promise<string[]>;
          }
        ).preflightStorageDocuments(['valid.pdf', 'missing.pdf']),
      ).rejects.toThrow(BackupPreflightIntegrityError);
    });

    it('3. reports all missing keys when multiple files are missing', async () => {
      storageService.exists = jest.fn().mockImplementation((key: string) => {
        return Promise.resolve(!key.startsWith('missing-'));
      });

      try {
        await (
          service as unknown as {
            preflightStorageDocuments: (keys: string[]) => Promise<string[]>;
          }
        ).preflightStorageDocuments([
          'valid.pdf',
          'missing-1.pdf',
          'missing-2.pdf',
          'missing-3.pdf',
        ]);
        fail('Should have thrown BackupPreflightIntegrityError');
      } catch (err) {
        expect(err).toBeInstanceOf(BackupPreflightIntegrityError);
        const preflightErr = err as BackupPreflightIntegrityError;
        expect(preflightErr.missingCount).toBe(3);
        expect(preflightErr.missingKeys).toEqual([
          'missing-1.pdf',
          'missing-2.pdf',
          'missing-3.pdf',
        ]);
      }
    });

    it('4. deduplicates storage keys so each unique key is checked only once', async () => {
      storageService.exists = jest.fn().mockResolvedValue(true);

      const uniqueValidated = await (
        service as unknown as {
          preflightStorageDocuments: (keys: string[]) => Promise<string[]>;
        }
      ).preflightStorageDocuments([
        'dup-1.pdf',
        'dup-1.pdf',
        'dup-2.pdf',
        'dup-1.pdf',
      ]);

      expect(uniqueValidated).toEqual(['dup-1.pdf', 'dup-2.pdf']);
      expect(storageService.exists).toHaveBeenCalledTimes(2);
      expect(storageService.exists).toHaveBeenCalledWith('dup-1.pdf');
      expect(storageService.exists).toHaveBeenCalledWith('dup-2.pdf');
    });

    it('5. preflight failure produces no successful artifact and transitions to FAILED', async () => {
      const dispatchSpy = jest.spyOn(service, 'dispatchBackupNotification');
      const updateSpy = jest.spyOn(db, 'update');

      await expect(
        service.createBackup(
          {
            name: 'Preflight Failure Test',
            scope: { includeFiles: true, includeDatabase: false },
          },
          'user-1',
        ),
      ).rejects.toThrow(BackupPreflightIntegrityError);

      // Verify readFile was never invoked because preflight halted execution
      expect(storageService.readFile).not.toHaveBeenCalled();

      // Verify artifact was updated to FAILED with error message
      expect(updateSpy).toHaveBeenCalled();

      // Verify metrics recorded failure
      expect(recordBackupFailedMock).toHaveBeenCalled();
      const firstCall = recordBackupFailedMock.mock.calls[0];
      expect(firstCall?.[0]?.error).toContain(
        'Backup preflight integrity check failed',
      );

      // Verify backup.failed notification was dispatched
      expect(dispatchSpy).toHaveBeenCalledWith(
        BACKUP_EVENT_TYPES.FAILED,
        expect.anything(),
      );
      const lastDispatchCall = dispatchSpy.mock.calls[0]?.[1];
      expect(lastDispatchCall?.error).toContain(
        'Backup preflight integrity check failed',
      );
    });
  });
});

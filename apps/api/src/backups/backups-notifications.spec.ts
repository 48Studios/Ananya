import { Test, TestingModule } from '@nestjs/testing';
import { BackupsService } from './backups.service';
import { BackupsMetricsService } from './backups-metrics.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { SecurityAuditService } from '../security-audit/security-audit.service';
import { StorageService } from '../documents/storage.service';
import {
  BACKUP_EVENT_TYPES,
  RESTORE_EVENT_TYPES,
} from '../email-templates/template-registry';

// Mock database query returning a user with an email and an email template
jest.mock('@ananya/database', () => ({
  db: {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockImplementation(() => {
          return Promise.resolve([
            {
              id: '11111111-1111-1111-1111-111111111111',
              email: 'admin@48studios.com',
              isEnabled: true,
              subject: 'Custom subject: {{job_name}}',
              bodyHtml: '<p>Custom body for {{job_name}}</p>',
              bodyText: 'Custom body for {{job_name}}',
            },
          ]);
        }),
      }),
    }),
  },
  pool: {
    query: jest.fn(),
  },
}));

type BackupJobParam = NonNullable<
  Parameters<BackupsService['dispatchBackupNotification']>[1]['job']
>;
type BackupJobRunParam = NonNullable<
  Parameters<BackupsService['dispatchBackupNotification']>[1]['run']
>;
type RestoreOperationParam = NonNullable<
  Parameters<BackupsService['dispatchRestoreNotification']>[1]['operation']
>;

describe('BackupsService Notifications & Email Templates', () => {
  let service: BackupsService;
  let notificationsService: jest.Mocked<Partial<NotificationsService>>;
  let mailService: jest.Mocked<Partial<MailService>>;
  let metricsService: BackupsMetricsService;

  beforeEach(async () => {
    notificationsService = {
      createNotification: jest.fn().mockResolvedValue(undefined),
    };
    mailService = {
      enqueue: jest.fn().mockResolvedValue('outbox-1'),
    };
    metricsService = new BackupsMetricsService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackupsService,
        {
          provide: StorageService,
          useValue: {
            storeFileFromPath: jest.fn(),
            deleteFile: jest.fn(),
            exists: jest.fn(),
            readFile: jest.fn(),
          },
        },
        {
          provide: SecurityAuditService,
          useValue: { record: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: NotificationsService,
          useValue: notificationsService,
        },
        {
          provide: MailService,
          useValue: mailService,
        },
        {
          provide: BackupsMetricsService,
          useValue: metricsService,
        },
      ],
    }).compile();

    service = module.get<BackupsService>(BackupsService);
  });

  describe('Backup Lifecycle Notifications', () => {
    it('dispatches backup.started notification and enqueues email', async () => {
      await service.dispatchBackupNotification(BACKUP_EVENT_TYPES.STARTED, {
        job: {
          id: 'job-1',
          name: 'Nightly Core',
          notifyOnSuccess: true,
          notifyOnFailure: true,
          createdById: '11111111-1111-1111-1111-111111111111',
        } as unknown as BackupJobParam,
        run: {
          id: 'run-101',
          status: 'RUNNING',
          startedAt: new Date(),
        } as unknown as BackupJobRunParam,
        actor: 'System Scheduler',
      });

      expect(notificationsService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          module: 'BACKUPS',
          type: 'INFO',
          entityType: 'BackupJobRun',
          entityId: 'run-101',
        }),
      );

      expect(mailService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: BACKUP_EVENT_TYPES.STARTED,
          to: 'admin@48studios.com',
          sourceType: 'BackupJobRun',
          sourceId: 'run-101',
        }),
      );
    });

    it('dispatches backup.succeeded and respects notifyOnSuccess=false', async () => {
      // With notifyOnSuccess: false
      await service.dispatchBackupNotification(BACKUP_EVENT_TYPES.SUCCEEDED, {
        job: {
          id: 'job-2',
          name: 'Silent Job',
          notifyOnSuccess: false,
          notifyOnFailure: true,
          createdById: '11111111-1111-1111-1111-111111111111',
        } as unknown as BackupJobParam,
        run: {
          id: 'run-102',
          status: 'SUCCESS',
        } as unknown as BackupJobRunParam,
      });

      expect(mailService.enqueue).not.toHaveBeenCalled();

      // With notifyOnSuccess: true
      await service.dispatchBackupNotification(BACKUP_EVENT_TYPES.SUCCEEDED, {
        job: {
          id: 'job-3',
          name: 'Audited Job',
          notifyOnSuccess: true,
          notifyOnFailure: true,
          createdById: '11111111-1111-1111-1111-111111111111',
        } as unknown as BackupJobParam,
        run: {
          id: 'run-103',
          status: 'SUCCESS',
        } as unknown as BackupJobRunParam,
        artifact: { id: 'art-1', sizeBytes: 1048576, checksum: 'abc' },
      });

      expect(mailService.enqueue).toHaveBeenCalledTimes(1);
    });

    it('dispatches backup.retrying and backup.exhausted_retries', async () => {
      await service.dispatchBackupNotification(BACKUP_EVENT_TYPES.RETRYING, {
        job: {
          id: 'job-4',
          name: 'Retrying Job',
          notifyOnSuccess: true,
          notifyOnFailure: true,
          createdById: '11111111-1111-1111-1111-111111111111',
        } as unknown as BackupJobParam,
        run: {
          id: 'run-104',
          status: 'RETRYING',
        } as unknown as BackupJobRunParam,
        attempt: 2,
        maxAttempts: 3,
        error: 'Database lock timeout',
      });

      expect(notificationsService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'WARNING',
        }),
      );
      expect(mailService.enqueue).toHaveBeenCalled();

      await service.dispatchBackupNotification(
        BACKUP_EVENT_TYPES.EXHAUSTED_RETRIES,
        {
          job: {
            id: 'job-4',
            name: 'Retrying Job',
            notifyOnSuccess: true,
            notifyOnFailure: true,
            createdById: '11111111-1111-1111-1111-111111111111',
          } as unknown as BackupJobParam,
          run: {
            id: 'run-104',
            status: 'EXHAUSTED_RETRIES',
          } as unknown as BackupJobRunParam,
          attempt: 3,
          maxAttempts: 3,
          error: 'Retry ceiling reached',
        },
      );

      expect(notificationsService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ERROR',
        }),
      );
    });
  });

  describe('Restore Lifecycle Notifications', () => {
    it('dispatches restore.started, restore.safety_backup_succeeded, and restore.succeeded', async () => {
      const operation = {
        id: 'op-201',
        status: 'RUNNING',
        conflictPolicy: 'ABORT',
        scope: { includeDatabase: true },
        initiatedById: '11111111-1111-1111-1111-111111111111',
      } as unknown as RestoreOperationParam;

      await service.dispatchRestoreNotification(RESTORE_EVENT_TYPES.STARTED, {
        operation,
        actor: 'admin@48studios.com',
      });

      expect(notificationsService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'RestoreOperation',
          entityId: 'op-201',
        }),
      );

      await service.dispatchRestoreNotification(
        RESTORE_EVENT_TYPES.SAFETY_BACKUP_SUCCEEDED,
        {
          operation,
          artifactId: 'art-safety-1',
          artifactSize: '24.5 MB',
        },
      );

      await service.dispatchRestoreNotification(RESTORE_EVENT_TYPES.SUCCEEDED, {
        operation: {
          ...operation,
          status: 'SUCCESS',
        },
        durationMs: 12000,
      });

      expect(mailService.enqueue).toHaveBeenCalledTimes(3);
    });
  });

  describe('Notification Failure Isolation', () => {
    it('catches notification errors, increments failure metric, and never throws to caller', async () => {
      notificationsService.createNotification = jest
        .fn()
        .mockRejectedValue(new Error('Notification DB down'));

      await expect(
        service.dispatchBackupNotification(BACKUP_EVENT_TYPES.FAILED, {
          job: {
            id: 'job-err',
            name: 'Error Job',
            notifyOnFailure: true,
            createdById: '11111111-1111-1111-1111-111111111111',
          } as unknown as BackupJobParam,
          run: {
            id: 'run-err',
            status: 'FAILED',
          } as unknown as BackupJobRunParam,
          error: 'Critical failure',
        }),
      ).resolves.toBeUndefined();

      expect(metricsService.getSnapshot().notificationFailures).toBe(1);
    });
  });
});

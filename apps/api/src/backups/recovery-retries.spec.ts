import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../../../../.env') });

import { Test, TestingModule } from '@nestjs/testing';
import { BackupsService } from './backups.service';
import { StorageService } from '../documents/storage.service';
import { SecurityAuditService } from '../security-audit/security-audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { db } from '@ananya/database';
import {
  backupArtifacts,
  backupJobs,
  backupJobRuns,
  users,
} from '@ananya/database/schema';
import { eq } from '@ananya/database/query';
import { BadRequestException } from '@nestjs/common';

describe('Worker Heartbeat, Abandoned Run Recovery & Durable Retries', () => {
  let service: BackupsService;
  let module: TestingModule;
  let testUserId: string;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        BackupsService,
        {
          provide: StorageService,
          useValue: {
            storeFile: jest.fn().mockResolvedValue(undefined),
            storeFileFromPath: jest.fn().mockResolvedValue(undefined),
            deleteFile: jest.fn().mockResolvedValue(undefined),
            exists: jest.fn().mockResolvedValue(false),
            readFile: jest.fn().mockResolvedValue(Buffer.from('test')),
          },
        },
        {
          provide: SecurityAuditService,
          useValue: { record: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: NotificationsService,
          useValue: {
            createNotification: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: MailService,
          useValue: { enqueue: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<BackupsService>(BackupsService);

    const userList = await db.select({ id: users.id }).from(users).limit(1);
    if (userList.length > 0 && userList[0]) {
      testUserId = userList[0].id;
    } else {
      const [newUser] = await db
        .insert(users)
        .values({
          email: 'test-recovery@example.com',
          firstName: 'Test',
          lastName: 'Recovery',
          passwordHash: 'dummyhash',
        })
        .returning({ id: users.id });
      testUserId = newUser!.id;
    }
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    await db.delete(backupJobRuns);
    await db.delete(backupArtifacts);
    await db.delete(backupJobs);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await db.delete(backupJobRuns);
    await db.delete(backupArtifacts);
    await db.delete(backupJobs);
  });

  afterAll(async () => {
    await module.close();
  });

  async function createTestJob(retryLimit = 2) {
    const [job] = await db
      .insert(backupJobs)
      .values({
        name: `job-${Date.now()}-${Math.random()}`,
        frequency: 'DAILY',
        timeOfDay: '00:00',
        timezone: 'Etc/UTC',
        scope: {
          includeDatabase: false,
          includeFiles: false,
          tables: [],
          components: [],
          dependencies: [],
        },
        encrypted: false,
        retryLimit,
        retryInitialDelaySeconds: 1,
        retryMaxDelaySeconds: 10,
        notifyOnSuccess: false,
        notifyOnFailure: false,
        nextRunAt: new Date(),
        createdById: testUserId,
        enabled: true,
      })
      .returning();
    return job!;
  }

  async function createTestRun(values: typeof backupJobRuns.$inferInsert) {
    const [run] = await db.insert(backupJobRuns).values(values).returning();
    return run!;
  }

  describe('Priority 3: Worker Heartbeat & Abandoned Run Recovery', () => {
    it('1. Active long-running run with fresh heartbeat remains RUNNING', async () => {
      const job = await createTestJob();
      const freshHeartbeat = new Date(Date.now() - 5_000); // 5 seconds ago (< 30s timeout)
      const run = await createTestRun({
        jobId: job.id,
        status: 'RUNNING',
        attempt: 1,
        maxAttempts: 3,
        startedAt: new Date(Date.now() - 3600_000), // Started 1 hour ago
        heartbeatAt: freshHeartbeat,
      });

      const recovered = await service.recoverAbandonedRuns(30_000);
      const recoveredIds = recovered.map((r) => r.id);

      expect(recoveredIds).not.toContain(run.id);

      const [afterRun] = await db
        .select()
        .from(backupJobRuns)
        .where(eq(backupJobRuns.id, run.id));
      expect(afterRun?.status).toBe('RUNNING');
    });

    it('2. Stale heartbeat is recovered', async () => {
      const job = await createTestJob();
      const staleHeartbeat = new Date(Date.now() - 45_000); // 45 seconds ago (> 30s timeout)
      const run = await createTestRun({
        jobId: job.id,
        status: 'RUNNING',
        attempt: 1,
        maxAttempts: 3,
        startedAt: new Date(Date.now() - 50_000),
        heartbeatAt: staleHeartbeat,
      });

      const recovered = await service.recoverAbandonedRuns(30_000);
      const recoveredRun = recovered.find((r) => r.id === run.id);

      expect(recoveredRun).toBeDefined();
      expect(recoveredRun?.status).toBe('RETRY_SCHEDULED');
      expect(recoveredRun?.retryReason).toBe('worker restart recovery');
    });

    it('3. Concurrent recovery: only one worker transitions the run', async () => {
      const job = await createTestJob();
      const staleHeartbeat = new Date(Date.now() - 60_000);
      const run = await createTestRun({
        jobId: job.id,
        status: 'RUNNING',
        attempt: 1,
        maxAttempts: 3,
        startedAt: new Date(Date.now() - 70_000),
        heartbeatAt: staleHeartbeat,
      });

      // Simulate 2 workers concurrently executing recoverAbandonedRuns
      const [result1, result2] = await Promise.all([
        service.recoverAbandonedRuns(30_000),
        service.recoverAbandonedRuns(30_000),
      ]);

      const foundIn1 = result1.some((r) => r.id === run.id);
      const foundIn2 = result2.some((r) => r.id === run.id);

      // Exactly one worker must have claimed and recovered this run
      expect(foundIn1 !== foundIn2).toBe(true);

      const [finalRun] = await db
        .select()
        .from(backupJobRuns)
        .where(eq(backupJobRuns.id, run.id));
      expect(finalRun?.status).toBe('RETRY_SCHEDULED');
    });

    it('4. Retryable stale run: retry is scheduled with nextRetryAt set', async () => {
      const job = await createTestJob();
      const staleHeartbeat = new Date(Date.now() - 60_000);
      const run = await createTestRun({
        jobId: job.id,
        status: 'RUNNING',
        attempt: 1,
        maxAttempts: 3,
        startedAt: new Date(Date.now() - 70_000),
        heartbeatAt: staleHeartbeat,
      });

      await service.recoverAbandonedRuns(30_000);

      const [updated] = await db
        .select()
        .from(backupJobRuns)
        .where(eq(backupJobRuns.id, run.id));

      expect(updated).toBeDefined();
      expect(updated?.status).toBe('RETRY_SCHEDULED');
      expect(updated?.nextRetryAt).toBeDefined();
      expect(updated?.nextRetryAt!.getTime()).toBeLessThanOrEqual(
        Date.now() + 1000,
      );
      expect(updated?.errorMessage).toContain('Worker heartbeat expired');
    });

    it('5. Exhausted stale run: terminal failure', async () => {
      const job = await createTestJob();
      const staleHeartbeat = new Date(Date.now() - 60_000);
      const run = await createTestRun({
        jobId: job.id,
        status: 'RUNNING',
        attempt: 3,
        maxAttempts: 3, // Already at maximum attempts
        startedAt: new Date(Date.now() - 70_000),
        heartbeatAt: staleHeartbeat,
      });

      await service.recoverAbandonedRuns(30_000);

      const [updated] = await db
        .select()
        .from(backupJobRuns)
        .where(eq(backupJobRuns.id, run.id));

      expect(updated).toBeDefined();
      expect(updated?.status).toBe('FAILED');
      expect(updated?.nextRetryAt).toBeNull();
      expect(updated?.errorMessage).toContain('Worker heartbeat expired');
    });

    it('6. Worker restart: new worker instance recovers abandoned runs', async () => {
      const job = await createTestJob();
      // Old worker crashed 2 minutes ago
      const run = await createTestRun({
        jobId: job.id,
        status: 'RUNNING',
        attempt: 1,
        maxAttempts: 2,
        startedAt: new Date(Date.now() - 120_000),
        heartbeatAt: new Date(Date.now() - 120_000),
      });

      // Create a brand new worker service instance simulating fresh boot
      const freshModule = await Test.createTestingModule({
        providers: [
          BackupsService,
          { provide: StorageService, useValue: {} },
          {
            provide: SecurityAuditService,
            useValue: { record: jest.fn().mockResolvedValue(undefined) },
          },
          {
            provide: NotificationsService,
            useValue: {
              createNotification: jest.fn().mockResolvedValue(undefined),
            },
          },
          {
            provide: MailService,
            useValue: { enqueue: jest.fn().mockResolvedValue(undefined) },
          },
        ],
      }).compile();
      const restartedWorker = freshModule.get<BackupsService>(BackupsService);

      const recovered = await restartedWorker.recoverAbandonedRuns(30_000);
      expect(recovered.some((r) => r.id === run.id)).toBe(true);

      const [afterRestartRun] = await db
        .select()
        .from(backupJobRuns)
        .where(eq(backupJobRuns.id, run.id));
      expect(afterRestartRun?.status).toBe('RETRY_SCHEDULED');

      await freshModule.close();
    });
  });

  describe('Priority 5: Durable Retries & Concurrency', () => {
    it('Persisted nextRetryAt is the source of truth without in-memory timers', async () => {
      const job = await createTestJob();
      // Future retry: not yet due
      const futureRetryAt = new Date(Date.now() + 60_000);
      const futureRun = await createTestRun({
        jobId: job.id,
        status: 'RETRY_SCHEDULED',
        attempt: 1,
        maxAttempts: 3,
        nextRetryAt: futureRetryAt,
      });

      // Past retry: due now
      const pastRetryAt = new Date(Date.now() - 5_000);
      const dueRun = await createTestRun({
        jobId: job.id,
        status: 'RETRY_SCHEDULED',
        attempt: 1,
        maxAttempts: 3,
        nextRetryAt: pastRetryAt,
      });

      const runJobSpy = jest
        .spyOn(service, 'runJob')
        .mockResolvedValue(undefined);

      await service.processRetryRuns(testUserId);

      // Only dueRun should have been picked up for execution, not futureRun
      expect(runJobSpy).toHaveBeenCalledWith(job.id, testUserId, dueRun.id);
      expect(runJobSpy).not.toHaveBeenCalledWith(
        job.id,
        testUserId,
        futureRun.id,
      );
    });

    it('Two workers competing for the same retry serialize via advisory lock', async () => {
      const job = await createTestJob();
      const pastRetryAt = new Date(Date.now() - 5_000);
      await createTestRun({
        jobId: job.id,
        status: 'RETRY_SCHEDULED',
        attempt: 1,
        maxAttempts: 3,
        nextRetryAt: pastRetryAt,
      });

      let runJobCount = 0;
      jest.spyOn(service, 'runJob').mockImplementation(async () => {
        runJobCount += 1;
        // Hold execution briefly to test concurrency
        await new Promise((res) => setTimeout(res, 50));
        return undefined;
      });

      // Both workers run processRetryRuns concurrently for the same due run
      await Promise.all([
        service.processRetryRuns(testUserId),
        service.processRetryRuns(testUserId),
      ]);

      // Because of pg_try_advisory_lock('ananya_backup_job_' || jobId), only one worker runs the job
      expect(runJobCount).toBe(1);
    });

    it('Atomic attempt increment during retry execution', async () => {
      const job = await createTestJob(2);
      // Simulate run failed attempt 1
      const run = await createTestRun({
        jobId: job.id,
        status: 'RETRY_SCHEDULED',
        attempt: 1,
        maxAttempts: 3,
        nextRetryAt: new Date(Date.now() - 1000),
      });

      const [art] = await db
        .insert(backupArtifacts)
        .values({
          name: 'test-art',
          type: 'FULL',
          status: 'COMPLETED',
          encrypted: false,
          formatVersion: '2',
          scope: {},
          jobId: job.id,
          storageKey: 'test.archive',
          sizeBytes: 100,
          checksum: 'abc',
        })
        .returning();

      // Trigger runJob for the existing run
      let recordedAttempt: number | undefined;
      jest
        .spyOn<any, any>(service, 'createBackup')
        .mockImplementation(async () => {
          const [currentRun] = await db
            .select()
            .from(backupJobRuns)
            .where(eq(backupJobRuns.id, run.id));
          recordedAttempt = currentRun?.attempt ?? undefined;
          return art!;
        });

      await service.runJob(job.id, testUserId, run.id);

      // Attempt was atomically incremented to 2
      expect(recordedAttempt).toBe(2);

      const [finalRun] = await db
        .select()
        .from(backupJobRuns)
        .where(eq(backupJobRuns.id, run.id));
      expect(finalRun).toBeDefined();
      expect(finalRun?.status).toBe('SUCCESS');
      expect(finalRun?.attempt).toBe(2);
    });

    it('Permanent failure (non-retryable error) immediately marks run FAILED', async () => {
      const job = await createTestJob(2);
      jest
        .spyOn<any, any>(service, 'createBackup')
        .mockRejectedValue(
          new BadRequestException('Invalid backup configuration'),
        );

      await expect(service.runJob(job.id, testUserId)).rejects.toThrow(
        BadRequestException,
      );

      const runs = await db
        .select()
        .from(backupJobRuns)
        .where(eq(backupJobRuns.jobId, job.id));

      expect(runs).toHaveLength(1);
      const failedRun = runs[0]!;
      expect(failedRun.status).toBe('FAILED');
      expect(failedRun.retryReason).toBe('permanent failure');
      expect(failedRun.nextRetryAt).toBeNull();
    });

    it('Transient errors retry until max attempts is exhausted (EXHAUSTED_RETRIES)', async () => {
      const job = await createTestJob(1); // retryLimit = 1, so maxAttempts = 2

      // Attempt 1: Transient network failure -> RETRY_SCHEDULED
      jest
        .spyOn<any, any>(service, 'createBackup')
        .mockRejectedValue(new Error('Transient connection reset by peer'));

      const initialRun = await service.runJob(job.id, testUserId);
      expect(initialRun).toBeUndefined(); // Returns undefined on scheduled retry

      const [runAfter1] = await db
        .select()
        .from(backupJobRuns)
        .where(eq(backupJobRuns.jobId, job.id));
      expect(runAfter1).toBeDefined();
      expect(runAfter1?.status).toBe('RETRY_SCHEDULED');
      expect(runAfter1?.attempt).toBe(1);
      expect(runAfter1?.nextRetryAt).toBeDefined();

      // Attempt 2 (exhausts limit): Throws error and marks EXHAUSTED_RETRIES
      await expect(
        service.runJob(job.id, testUserId, runAfter1!.id),
      ).rejects.toThrow('Transient connection reset by peer');

      const [runAfter2] = await db
        .select()
        .from(backupJobRuns)
        .where(eq(backupJobRuns.id, runAfter1!.id));
      expect(runAfter2).toBeDefined();
      expect(runAfter2?.status).toBe('EXHAUSTED_RETRIES');
      expect(runAfter2?.attempt).toBe(2);
      expect(runAfter2?.retryReason).toBe('retry limit exhausted');
    });
  });
});

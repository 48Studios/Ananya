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
  restoreOperations,
} from '@ananya/database/schema';
import { eq } from '@ananya/database/query';
import { randomUUID } from 'crypto';

/** Helper to create a backup job with desired retention settings. */
async function createJob(
  retentionMaxCount?: number,
  retentionMaxAgeDays?: number,
) {
  const [job] = await db
    .insert(backupJobs)
    .values({
      name: 'test-job',
      frequency: 'DAILY',
      timeOfDay: '00:00',
      timezone: 'Etc/UTC',
      scope: {
        includeDatabase: true,
        includeFiles: false,
        tables: [],
        components: [],
        dependencies: [],
      },
      encrypted: false,
      retentionMaxCount,
      retentionMaxAgeDays,
      retryLimit: 2,
      retryInitialDelaySeconds: 60,
      retryMaxDelaySeconds: 3600,
      notifyOnSuccess: false,
      notifyOnFailure: true,
      nextRunAt: new Date(),
      createdById: null,
      enabled: true,
    })
    .returning();
  return job!;
}

/** Helper to create a completed backup artifact. */
async function createArtifact(jobId: string, createdAt: Date) {
  const [artifact] = await db
    .insert(backupArtifacts)
    .values({
      name: 'artifact',
      description: null,
      type: 'FULL',
      status: 'COMPLETED',
      encrypted: false,
      formatVersion: '2',
      scope: {
        includeDatabase: true,
        includeFiles: false,
        tables: [],
        components: [],
        dependencies: [],
      },
      createdById: null,
      jobId,
      createdAt,
      storageKey: `key-${randomUUID()}`,
      sizeBytes: 100,
      checksum: 'abc',
    })
    .returning();
  return artifact!;
}

describe('BackupsService.applyRetention', () => {
  let service: BackupsService;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        BackupsService,
        { provide: StorageService, useValue: { deleteFile: jest.fn() } },
        { provide: SecurityAuditService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: MailService, useValue: {} },
      ],
    }).compile();
    service = module.get<BackupsService>(BackupsService);
  });

  afterEach(async () => {
    await db.delete(backupArtifacts).execute();
    await db.delete(backupJobRuns).execute();
    await db.delete(restoreOperations).execute();
    await db.delete(backupJobs).execute();
  });

  it('A – retains newest N artifacts and deletes older ones', async () => {
    const job = await createJob(2);
    // create three artifacts
    await createArtifact(job.id, new Date('2024-01-01'));
    await createArtifact(job.id, new Date('2024-01-02'));
    const kept = await createArtifact(job.id, new Date('2024-01-03'));
    await service['applyRetention'](job);
    const remaining = await db
      .select()
      .from(backupArtifacts)
      .where(eq(backupArtifacts.jobId, job.id));
    expect(
      remaining.map((a: typeof backupArtifacts.$inferSelect) => a.id),
    ).toContain(kept.id);
    expect(remaining).toHaveLength(2);
  });

  it('B – deletes artifacts older than retention age', async () => {
    const job = await createJob(undefined, 30); // 30 days
    const fresh = await createArtifact(job.id, new Date());
    await createArtifact(job.id, new Date(Date.now() - 40 * 86400000)); // 40 days old
    await service['applyRetention'](job);
    const remaining = await db
      .select()
      .from(backupArtifacts)
      .where(eq(backupArtifacts.jobId, job.id));
    expect(
      remaining.map((a: typeof backupArtifacts.$inferSelect) => a.id),
    ).toContain(fresh.id);
    expect(remaining).toHaveLength(1);
  });

  it('C – applies both count and age policies together', async () => {
    const job = await createJob(1, 30);
    // three artifacts: one fresh, one old, one extra
    const fresh = await createArtifact(job.id, new Date());
    await createArtifact(job.id, new Date(Date.now() - 40 * 86400000)); // old
    await createArtifact(job.id, new Date('2020-01-01'));
    await service['applyRetention'](job);
    const remaining = await db
      .select()
      .from(backupArtifacts)
      .where(eq(backupArtifacts.jobId, job.id));
    expect(
      remaining.map((a: typeof backupArtifacts.$inferSelect) => a.id),
    ).toContain(fresh.id);
    expect(remaining).toHaveLength(1);
  });

  it('D – protects artifacts referenced by RUNNING backup runs', async () => {
    const job = await createJob(0);
    const artifact = await createArtifact(job.id, new Date());
    await db
      .insert(backupJobRuns)
      .values({
        jobId: job.id,
        status: 'RUNNING',
        artifactId: artifact.id,
        maxAttempts: 3,
      })
      .execute();
    await service['applyRetention'](job);
    const remaining = await db
      .select()
      .from(backupArtifacts)
      .where(eq(backupArtifacts.id, artifact.id));
    expect(remaining).toHaveLength(1);
  });

  it('E – protects artifacts referenced by RETRYING backup runs', async () => {
    const job = await createJob(0);
    const artifact = await createArtifact(job.id, new Date());
    await db
      .insert(backupJobRuns)
      .values({
        jobId: job.id,
        status: 'RETRYING',
        artifactId: artifact.id,
        maxAttempts: 3,
      })
      .execute();
    await service['applyRetention'](job);
    const remaining = await db
      .select()
      .from(backupArtifacts)
      .where(eq(backupArtifacts.id, artifact.id));
    expect(remaining).toHaveLength(1);
  });

  it('F – protects artifacts referenced by RUNNING restores', async () => {
    const job = await createJob(0);
    const artifact = await createArtifact(job.id, new Date());
    await db
      .insert(restoreOperations)
      .values({
        status: 'RUNNING',
        artifactId: artifact.id,
        scope: {},
        conflictPolicy: 'ABORT',
      })
      .execute();
    await service['applyRetention'](job);
    const remaining = await db
      .select()
      .from(backupArtifacts)
      .where(eq(backupArtifacts.id, artifact.id));
    expect(remaining).toHaveLength(1);
  });

  it('G – protects safety‑backup artifacts created during restore', async () => {
    const job = await createJob(0);
    const safety = await createArtifact(job.id, new Date());
    // simulate a restore operation with safety backup stored in artifactId
    await db
      .insert(restoreOperations)
      .values({
        status: 'RUNNING',
        artifactId: safety.id,
        scope: {},
        conflictPolicy: 'ABORT',
      })
      .execute();
    await service['applyRetention'](job);
    const remaining = await db
      .select()
      .from(backupArtifacts)
      .where(eq(backupArtifacts.id, safety.id));
    expect(remaining).toHaveLength(1);
  });

  it('H – never deletes non‑completed artifacts', async () => {
    const job = await createJob(0);
    const [running] = await db
      .insert(backupArtifacts)
      .values({
        name: 'running',
        description: null,
        type: 'FULL',
        status: 'RUNNING',
        encrypted: false,
        formatVersion: '2',
        scope: {
          includeDatabase: true,
          includeFiles: false,
          tables: [],
          components: [],
          dependencies: [],
        },
        createdById: null,
        jobId: job.id,
        createdAt: new Date(),
        storageKey: null,
        sizeBytes: 0,
        checksum: null,
      })
      .returning();
    await service['applyRetention'](job);
    const remaining = await db
      .select()
      .from(backupArtifacts)
      .where(eq(backupArtifacts.id, running!.id));
    expect(remaining).toHaveLength(1);
  });

  it('Concurrent retention executions serialize via advisory lock', async () => {
    const job = await createJob(1);
    // create two extra artifacts that should be removed
    await createArtifact(job.id, new Date('2020-01-01'));
    await createArtifact(job.id, new Date('2020-01-02'));
    // run two retain calls concurrently
    await Promise.all([
      service['applyRetention'](job),
      service['applyRetention'](job),
    ]);
    const remaining = await db
      .select()
      .from(backupArtifacts)
      .where(eq(backupArtifacts.jobId, job.id));
    expect(remaining).toHaveLength(1);
  });
});

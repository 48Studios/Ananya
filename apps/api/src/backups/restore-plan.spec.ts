import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../../../../.env') });

import { Test, TestingModule } from '@nestjs/testing';
import {
  BackupsService,
  canonicalizeRestorePlan,
  hashRestorePlan,
  type CanonicalRestorePlan,
} from './backups.service';
import { StorageService } from '../documents/storage.service';
import { SecurityAuditService } from '../security-audit/security-audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { db } from '@ananya/database';
import {
  backupArtifacts,
  backupJobRuns,
  backupJobs,
  restoreOperations,
  users,
} from '@ananya/database/schema';
import { eq } from '@ananya/database/query';
import { packArchive, type BackupArchive } from './archive';
import { BadRequestException, NotFoundException } from '@nestjs/common';

const sampleArchive: BackupArchive = {
  manifest: {
    formatVersion: '1',
    applicationVersion: 'test',
    createdAt: new Date().toISOString(),
    scope: {
      includeDatabase: true,
      includeFiles: true,
      components: ['CRM', 'INVENTORY'],
    },
    tables: ['components'],
    files: ['doc.txt'],
    components: ['CRM', 'INVENTORY'],
    encrypted: false,
  },
  tables: { components: [{ id: '1', name: 'Item A' }] },
  files: [
    { storageKey: 'doc.txt', content: Buffer.from('test').toString('base64') },
  ],
};

describe('Restore-Plan Integrity Boundary', () => {
  let service: BackupsService;
  let module: TestingModule;
  const mockStorage = {
    exists: jest.fn().mockResolvedValue(false),
    readFile: jest.fn().mockResolvedValue(Buffer.from('existing')),
    storeFile: jest.fn().mockResolvedValue(undefined),
    storeFileFromPath: jest.fn().mockResolvedValue(undefined),
    deleteFile: jest.fn().mockResolvedValue(undefined),
  };
  const mockAudit = {
    record: jest.fn().mockResolvedValue(undefined),
  };

  let testUserId: string;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        BackupsService,
        { provide: StorageService, useValue: mockStorage },
        { provide: SecurityAuditService, useValue: mockAudit },
        { provide: NotificationsService, useValue: {} },
        { provide: MailService, useValue: {} },
      ],
    }).compile();
    service = module.get<BackupsService>(BackupsService);

    const [existingUser] = await db.select().from(users).limit(1);
    if (existingUser) {
      testUserId = existingUser.id;
    } else {
      const [created] = await db
        .insert(users)
        .values({
          email: `test-${Date.now()}@example.com`,
          passwordHash: 'dummy',
          firstName: 'Test',
          lastName: 'User',
        })
        .returning();
      testUserId = created!.id;
    }
  });

  afterEach(async () => {
    await db.delete(restoreOperations).execute();
    await db.delete(backupArtifacts).execute();
    await db.delete(backupJobRuns).execute();
    await db.delete(backupJobs).execute();
    jest.clearAllMocks();
  });

  it('Object key ordering does not change the canonical hash', () => {
    const planA: CanonicalRestorePlan = {
      formatVersion: '2',
      archiveChecksum: 'abc123',
      conflictPolicy: 'ABORT',
      components: ['B', 'A'],
      tables: ['users', 'components'],
      recordsToProcess: 10,
      files: ['z.txt', 'a.txt'],
      destructive: true,
    };
    // Construct planB with identical data but completely different object key order
    const planB = {
      destructive: true,
      files: ['a.txt', 'z.txt'],
      recordsToProcess: 10,
      tables: ['components', 'users'],
      components: ['A', 'B'],
      conflictPolicy: 'ABORT' as const,
      archiveChecksum: 'abc123',
      formatVersion: '2',
    };
    expect(hashRestorePlan(planA)).toBe(hashRestorePlan(planB));
    expect(canonicalizeRestorePlan(planA)).toBe(canonicalizeRestorePlan(planB));
  });

  it('Preview and restore produce identical canonical hashes for unchanged plan', async () => {
    const archiveBuffer = packArchive(sampleArchive);
    const preview = await service.previewRestore(
      archiveBuffer,
      { conflictPolicy: 'SKIP' },
      testUserId,
    );
    expect(preview.operationId).toBeDefined();
    expect(preview.planHash).toBeDefined();

    const [persisted] = await db
      .select()
      .from(restoreOperations)
      .where(eq(restoreOperations.id, preview.operationId!));
    expect(persisted).toBeDefined();
    expect(persisted!.planHash).toBe(preview.planHash);

    const recomputedHash = hashRestorePlan(
      persisted!.plan as unknown as CanonicalRestorePlan,
    );
    expect(recomputedHash).toBe(preview.planHash);
  });

  it('Preview -> restore with unchanged plan succeeds', async () => {
    const archiveBuffer = packArchive(sampleArchive);
    const preview = await service.previewRestore(
      archiveBuffer,
      { conflictPolicy: 'SKIP' },
      testUserId,
    );

    // Insert a real safety artifact so FK constraint on artifactId passes
    const [safetyArtifact] = await db
      .insert(backupArtifacts)
      .values({
        name: 'safety',
        type: 'FULL',
        status: 'COMPLETED',
        formatVersion: '2',
        scope: {},
        createdById: testUserId,
      })
      .returning();
    jest.spyOn(service, 'createBackup').mockResolvedValueOnce(safetyArtifact);
    jest.spyOn<any, any>(service, 'restoreTables').mockResolvedValueOnce({
      inserted: 1,
      skipped: 0,
      tables: ['components'],
    });

    const result = await service.restore(
      archiveBuffer,
      {
        operationId: preview.operationId!,
        planHash: preview.planHash,
        confirmDestructive: true,
      },
      testUserId,
    );

    expect(result.operationId).toBe(preview.operationId);
    const [completed] = await db
      .select()
      .from(restoreOperations)
      .where(eq(restoreOperations.id, preview.operationId!));
    expect(completed!.status).toBe('SUCCESS');
    expect(mockAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'BACKUP_RESTORED',
        details: expect.objectContaining({
          operationId: preview.operationId,
        }) as unknown,
      }),
    );
  });

  it('Modified table selection -> rejected', () => {
    const basePlan: CanonicalRestorePlan = {
      formatVersion: '2',
      archiveChecksum: 'abc',
      conflictPolicy: 'ABORT',
      components: ['CRM'],
      tables: ['components'],
      recordsToProcess: 5,
      files: ['f.txt'],
      destructive: true,
    };
    const modifiedPlan = { ...basePlan, tables: ['components', 'users'] };
    expect(hashRestorePlan(modifiedPlan)).not.toBe(hashRestorePlan(basePlan));
  });

  it('Modified component selection -> rejected', () => {
    const basePlan: CanonicalRestorePlan = {
      formatVersion: '2',
      archiveChecksum: 'abc',
      conflictPolicy: 'ABORT',
      components: ['CRM'],
      tables: ['components'],
      recordsToProcess: 5,
      files: ['f.txt'],
      destructive: true,
    };
    const modifiedPlan = { ...basePlan, components: ['CRM', 'INVENTORY'] };
    expect(hashRestorePlan(modifiedPlan)).not.toBe(hashRestorePlan(basePlan));
  });

  it('Modified conflict policy -> rejected', () => {
    const basePlan: CanonicalRestorePlan = {
      formatVersion: '2',
      archiveChecksum: 'abc',
      conflictPolicy: 'ABORT',
      components: ['CRM'],
      tables: ['components'],
      recordsToProcess: 5,
      files: ['f.txt'],
      destructive: true,
    };
    const modifiedPlan: CanonicalRestorePlan = {
      ...basePlan,
      conflictPolicy: 'SKIP',
    };
    expect(hashRestorePlan(modifiedPlan)).not.toBe(hashRestorePlan(basePlan));
  });

  it('Modified file selection -> rejected', () => {
    const basePlan: CanonicalRestorePlan = {
      formatVersion: '2',
      archiveChecksum: 'abc',
      conflictPolicy: 'ABORT',
      components: ['CRM'],
      tables: ['components'],
      recordsToProcess: 5,
      files: ['f.txt'],
      destructive: true,
    };
    const modifiedPlan = { ...basePlan, files: ['f.txt', 'secret.txt'] };
    expect(hashRestorePlan(modifiedPlan)).not.toBe(hashRestorePlan(basePlan));
  });

  it('Tampered persisted plan in database -> rejected before mutation', async () => {
    const archiveBuffer = packArchive(sampleArchive);
    const preview = await service.previewRestore(
      archiveBuffer,
      { conflictPolicy: 'ABORT' },
      testUserId,
    );

    // Tamper with the persisted plan in the database (e.g. inject an unauthorized table)
    const [op] = await db
      .select()
      .from(restoreOperations)
      .where(eq(restoreOperations.id, preview.operationId!));
    const tamperedPlan = {
      ...(op!.plan as unknown as CanonicalRestorePlan),
      tables: ['components', 'users_passwords'],
    };
    await db
      .update(restoreOperations)
      .set({ plan: tamperedPlan })
      .where(eq(restoreOperations.id, preview.operationId!));

    const createBackupSpy = jest.spyOn(service, 'createBackup');

    await expect(
      service.restore(
        archiveBuffer,
        {
          operationId: preview.operationId!,
          planHash: preview.planHash,
          confirmDestructive: true,
        },
        testUserId,
      ),
    ).rejects.toThrow(BadRequestException);

    // Assert that no mutation or safety backup was created
    expect(createBackupSpy).not.toHaveBeenCalled();
    const [after] = await db
      .select()
      .from(restoreOperations)
      .where(eq(restoreOperations.id, preview.operationId!));
    expect(after!.status).toBe('PREVIEWED');
  });

  it('Tampered persisted hash in database -> rejected before mutation', async () => {
    const archiveBuffer = packArchive(sampleArchive);
    const preview = await service.previewRestore(
      archiveBuffer,
      { conflictPolicy: 'ABORT' },
      testUserId,
    );

    // Tamper with the plan_hash in database
    await db
      .update(restoreOperations)
      .set({ planHash: '0'.repeat(64) })
      .where(eq(restoreOperations.id, preview.operationId!));

    await expect(
      service.restore(
        archiveBuffer,
        {
          operationId: preview.operationId!,
          planHash: preview.planHash,
          confirmDestructive: true,
        },
        testUserId,
      ),
    ).rejects.toThrow(
      'Persisted restore plan tampering detected: hash mismatch.',
    );
  });

  it('Missing restore operation/plan -> rejected', async () => {
    const archiveBuffer = packArchive(sampleArchive);
    await expect(
      service.restore(
        archiveBuffer,
        {
          operationId: '00000000-0000-0000-0000-999999999999',
          planHash: 'anyhash',
          confirmDestructive: true,
        },
        testUserId,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('Modified archive content -> rejected before mutation', async () => {
    const archiveBuffer = packArchive(sampleArchive);
    const preview = await service.previewRestore(
      archiveBuffer,
      { conflictPolicy: 'ABORT' },
      testUserId,
    );

    // Provide a different archive
    const alteredArchiveBuffer = packArchive({
      ...sampleArchive,
      tables: { components: [{ id: '2', name: 'Altered' }] },
    });

    await expect(
      service.restore(
        alteredArchiveBuffer,
        {
          operationId: preview.operationId!,
          planHash: preview.planHash,
          confirmDestructive: true,
        },
        testUserId,
      ),
    ).rejects.toThrow(
      'Archive content does not match the previewed archive checksum.',
    );
  });
});

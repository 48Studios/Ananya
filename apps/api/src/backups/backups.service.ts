import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { db, pool } from '@ananya/database';
import {
  backupArtifacts,
  backupJobRuns,
  backupJobs,
  restoreOperations,
} from '@ananya/database/schema';
import { and, or, desc, eq, lt, sql } from '@ananya/database/query';
import { StorageService } from '../documents/storage.service';
import { SecurityAuditService } from '../security-audit/security-audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { users } from '@ananya/database/schema';
import {
  CreateBackupDto,
  CreateBackupJobDto,
  PreviewRestoreDto,
  RestoreDto,
} from './dtos';
import {
  archiveChecksum,
  type BackupArchive,
  streamPackArchiveToFile,
  unpackArchive,
} from './archive';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import { statfsSync } from 'fs';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { basename } from 'path';
import { resolveComponentScope } from './components';
import { assertTimeZone, nextScheduledRun } from './timezone';

const INTERNAL_TABLES = new Set([
  'backup_artifacts',
  'backup_jobs',
  'backup_job_runs',
  'restore_operations',
  '__drizzle_migrations',
]);

@Injectable()
export class BackupsService {
  private readonly logger = new Logger(BackupsService.name);

  constructor(
    private readonly storage: StorageService,
    private readonly audit: SecurityAuditService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  async listArtifacts() {
    return db
      .select()
      .from(backupArtifacts)
      .orderBy(desc(backupArtifacts.createdAt));
  }

  async deleteJob(id: string, userId: string) {
    const [job] = await db
      .delete(backupJobs)
      .where(eq(backupJobs.id, id))
      .returning();
    if (!job) throw new NotFoundException('Backup job not found.');
    await this.audit.record({
      userId,
      action: 'BACKUP_JOB_DELETED',
      category: 'ADMINISTRATION',
      details: { jobId: id },
    });
    return { success: true };
  }

  async listJobs() {
    return db.select().from(backupJobs).orderBy(desc(backupJobs.createdAt));
  }

  async listRestoreOperations() {
    return db
      .select()
      .from(restoreOperations)
      .orderBy(desc(restoreOperations.createdAt));
  }

  async getArtifact(id: string) {
    const [artifact] = await db
      .select()
      .from(backupArtifacts)
      .where(eq(backupArtifacts.id, id));
    if (!artifact) throw new NotFoundException('Backup not found.');
    return artifact;
  }

  async getJobRuns(jobId: string) {
    return db
      .select()
      .from(backupJobRuns)
      .where(eq(backupJobRuns.jobId, jobId))
      .orderBy(desc(backupJobRuns.startedAt));
  }

  async getJobDetails(jobId: string) {
    const [job] = await db
      .select()
      .from(backupJobs)
      .where(eq(backupJobs.id, jobId));
    if (!job) throw new NotFoundException('Backup job not found.');
    const runs = await this.getJobRuns(jobId);
    const successful = runs.filter((run) => run.status === 'SUCCESS');
    const durations = successful
      .filter((run) => run.startedAt && run.endedAt)
      .map((run) => run.endedAt!.getTime() - run.startedAt!.getTime());
    const artifactIds = successful
      .map((run) => run.artifactId)
      .filter((id): id is string => Boolean(id));
    const artifacts = artifactIds.length
      ? await db
          .select()
          .from(backupArtifacts)
          .where(eq(backupArtifacts.jobId, jobId))
      : [];
    return {
      job,
      runs,
      health: {
        successRate: runs.length ? successful.length / runs.length : 0,
        averageDurationMs: durations.length
          ? durations.reduce((sum, value) => sum + value, 0) / durations.length
          : 0,
        averageBackupSize: artifacts.length
          ? artifacts.reduce((sum, artifact) => sum + artifact.sizeBytes, 0) /
            artifacts.length
          : 0,
        lastSuccessfulRun: successful[0] ?? null,
        lastFailedRun:
          runs.find((run) =>
            ['FAILED', 'EXHAUSTED_RETRIES'].includes(run.status),
          ) ?? null,
      },
    };
  }

  async getRestoreOperation(id: string) {
    const [operation] = await db
      .select()
      .from(restoreOperations)
      .where(eq(restoreOperations.id, id));
    if (!operation) throw new NotFoundException('Restore operation not found.');
    return operation;
  }

  async createBackup(dto: CreateBackupDto, userId: string, source = 'manual') {
    const filesystem = statfsSync(tmpdir());
    const availableBytes = filesystem.bavail * filesystem.bsize;
    if (availableBytes < 100 * 1024 * 1024) {
      throw new BadRequestException(
        'Insufficient temporary storage to create a backup.',
      );
    }
    const [artifact] = await db
      .insert(backupArtifacts)
      .values({
        name: dto.name,
        description: dto.description ?? null,
        type: dto.type ?? 'FULL',
        status: 'RUNNING',
        encrypted: dto.encrypted ?? false,
        formatVersion: '2',
        scope: normalizeScope(dto.scope),
        createdById: userId,
      })
      .returning();
    if (!artifact) throw new Error('Unable to create backup record.');
    const temporaryPath = join(
      tmpdir(),
      `ananya-backup-${artifact.id}-${randomUUID()}.archive`,
    );
    try {
      const streamed = await this.buildStreamingArchive(dto, temporaryPath);
      const storageKey = `backup-${artifact.id}-${randomUUID()}.archive`;
      await this.storage.storeFileFromPath(storageKey, temporaryPath);
      const [completed] = await db
        .update(backupArtifacts)
        .set({
          status: 'COMPLETED',
          storageKey,
          sizeBytes: streamed.sizeBytes,
          checksum: streamed.checksum,
          manifest: streamed.manifest as unknown as Record<string, unknown>,
          completedAt: new Date(),
        })
        .where(eq(backupArtifacts.id, artifact.id))
        .returning();
      await this.audit.record({
        userId,
        action: source === 'manual' ? 'BACKUP_CREATED' : 'BACKUP_SCHEDULED',
        category: 'ADMINISTRATION',
        details: {
          artifactId: artifact.id,
          encrypted: dto.encrypted ?? false,
          checksum: completed?.checksum,
        },
      });
      return completed;
    } catch (error) {
      await db
        .update(backupArtifacts)
        .set({
          status: 'FAILED',
          errorMessage:
            error instanceof Error ? error.message : 'Backup failed.',
        })
        .where(eq(backupArtifacts.id, artifact.id));
      throw error;
    } finally {
      await fs.rm(temporaryPath, { force: true });
    }
  }

  async download(id: string, userId?: string) {
    const artifact = await this.getArtifact(id);
    if (artifact.status !== 'COMPLETED' || !artifact.storageKey) {
      throw new ConflictException('Only completed backups can be downloaded.');
    }
    const content = await this.storage.readFile(artifact.storageKey);
    if (artifact.checksum && archiveChecksum(content) !== artifact.checksum) {
      throw new ConflictException('Backup integrity verification failed.');
    }
    await this.audit.record({
      userId,
      action: 'BACKUP_DOWNLOADED',
      category: 'ADMINISTRATION',
      details: { artifactId: id },
    });
    return { artifact, content };
  }

  async delete(id: string, userId: string) {
    const artifact = await this.getArtifact(id);
    if (artifact.storageKey) await this.storage.deleteFile(artifact.storageKey);
    await db.delete(backupArtifacts).where(eq(backupArtifacts.id, id));
    await this.audit.record({
      userId,
      action: 'BACKUP_DELETED',
      category: 'ADMINISTRATION',
      details: { artifactId: id },
    });
    return { success: true };
  }

  async createJob(dto: CreateBackupJobDto, userId: string) {
    assertTimeZone(dto.timezone ?? 'Etc/UTC');
    const nextRunAt = nextScheduledRun(
      new Date(),
      dto.frequency,
      dto.timeOfDay,
      dto.timezone ?? 'Etc/UTC',
    );
    const [job] = await db
      .insert(backupJobs)
      .values({
        name: dto.name,
        frequency: dto.frequency,
        timeOfDay: dto.timeOfDay,
        timezone: dto.timezone ?? 'Etc/UTC',
        scope: normalizeScope(dto.scope),
        encrypted: dto.encrypted ?? false,
        retentionMaxCount: dto.retentionMaxCount,
        retentionMaxAgeDays: dto.retentionMaxAgeDays,
        retryLimit: dto.retryLimit ?? 2,
        retryInitialDelaySeconds: dto.retryInitialDelaySeconds ?? 60,
        retryMaxDelaySeconds: dto.retryMaxDelaySeconds ?? 3600,
        notifyOnSuccess: dto.notifyOnSuccess ?? false,
        notifyOnFailure: dto.notifyOnFailure ?? true,
        nextRunAt,
        createdById: userId,
      })
      .returning();
    await this.audit.record({
      userId,
      action: 'BACKUP_JOB_CREATED',
      category: 'ADMINISTRATION',
      details: { jobId: job?.id },
    });
    return job;
  }

  async updateJob(
    id: string,
    dto: Partial<CreateBackupJobDto>,
    userId: string,
  ) {
    const [job] = await db
      .update(backupJobs)
      .set({
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.frequency ? { frequency: dto.frequency } : {}),
        ...(dto.timeOfDay ? { timeOfDay: dto.timeOfDay } : {}),
        ...(dto.timezone ? { timezone: dto.timezone } : {}),
        ...(dto.scope ? { scope: normalizeScope(dto.scope) } : {}),
        ...(dto.encrypted !== undefined ? { encrypted: dto.encrypted } : {}),
        ...(dto.retentionMaxCount !== undefined
          ? { retentionMaxCount: dto.retentionMaxCount }
          : {}),
        ...(dto.retentionMaxAgeDays !== undefined
          ? { retentionMaxAgeDays: dto.retentionMaxAgeDays }
          : {}),
        ...(dto.retryLimit !== undefined ? { retryLimit: dto.retryLimit } : {}),
        ...(dto.retryInitialDelaySeconds !== undefined
          ? { retryInitialDelaySeconds: dto.retryInitialDelaySeconds }
          : {}),
        ...(dto.retryMaxDelaySeconds !== undefined
          ? { retryMaxDelaySeconds: dto.retryMaxDelaySeconds }
          : {}),
        ...(dto.notifyOnSuccess !== undefined
          ? { notifyOnSuccess: dto.notifyOnSuccess }
          : {}),
        ...(dto.notifyOnFailure !== undefined
          ? { notifyOnFailure: dto.notifyOnFailure }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(backupJobs.id, id))
      .returning();
    if (!job) throw new NotFoundException('Backup job not found.');
    if (dto.timezone) assertTimeZone(dto.timezone);
    await this.audit.record({
      userId,
      action: 'BACKUP_JOB_UPDATED',
      category: 'ADMINISTRATION',
      details: { jobId: id },
    });
    return job;
  }

  async setJobEnabled(id: string, enabled: boolean, userId: string) {
    const [job] = await db
      .update(backupJobs)
      .set({ enabled, updatedAt: new Date() })
      .where(eq(backupJobs.id, id))
      .returning();
    if (!job) throw new NotFoundException('Backup job not found.');
    await this.audit.record({
      userId,
      action: enabled ? 'BACKUP_JOB_RESUMED' : 'BACKUP_JOB_PAUSED',
      category: 'ADMINISTRATION',
      details: { jobId: id },
    });
    return job;
  }

  async runJob(id: string, userId: string, existingRunId?: string) {
    const [job] = await db
      .select()
      .from(backupJobs)
      .where(eq(backupJobs.id, id));
    if (!job) throw new NotFoundException('Backup job not found.');
    const [run] = existingRunId
      ? await db
          .select()
          .from(backupJobRuns)
          .where(eq(backupJobRuns.id, existingRunId))
      : await db
          .insert(backupJobRuns)
          .values({
            jobId: id,
            status: 'QUEUED',
            maxAttempts: job.retryLimit + 1,
          })
          .returning();
    if (!run) throw new NotFoundException('Backup run not found.');
    let lastError: unknown;
    const firstAttempt = Math.max(1, (run.attempt ?? 0) + 1);
    for (
      let attempt = firstAttempt;
      attempt <= job.retryLimit + 1;
      attempt += 1
    ) {
      const startedAt = new Date();
      await db
        .update(backupJobRuns)
        .set({
          status: attempt === 1 ? 'RUNNING' : 'RETRYING',
          attempt,
          startedAt,
          heartbeatAt: startedAt,
        })
        .where(eq(backupJobRuns.id, run.id));

      const heartbeatTimer = setInterval(() => {
        void db
          .update(backupJobRuns)
          .set({ heartbeatAt: new Date() })
          .where(eq(backupJobRuns.id, run.id))
          .catch((err) => {
            this.logger.warn(
              `Failed to update heartbeat for run ${run.id}: ${String(err)}`,
            );
          });
      }, 5_000);
      heartbeatTimer.unref?.();

      try {
        const jobScope = job.scope;
        const jobTables = Array.isArray(jobScope.tables) ? jobScope.tables : [];
        const artifact = await this.createBackup(
          {
            name: `${job.name} ${new Date().toISOString()}`,
            type: jobTables.length ? 'SELECTIVE' : 'FULL',
            scope: job.scope,
            encrypted: job.encrypted,
          },
          userId,
          'scheduled',
        );
        if (artifact) {
          await db
            .update(backupArtifacts)
            .set({ jobId: id })
            .where(eq(backupArtifacts.id, artifact.id));
        }
        await db
          .update(backupJobRuns)
          .set({
            status: 'SUCCESS',
            artifactId: artifact?.id ?? null,
            endedAt: new Date(),
            nextRetryAt: null,
          })
          .where(eq(backupJobRuns.id, run.id));
        await db
          .update(backupJobs)
          .set({
            lastRunAt: new Date(),
            lastResult: 'SUCCESS',
            consecutiveFailures: 0,
            nextRunAt: nextScheduledRun(
              new Date(),
              job.frequency as 'DAILY' | 'WEEKLY' | 'MONTHLY',
              job.timeOfDay,
              job.timezone,
            ),
          })
          .where(eq(backupJobs.id, id));
        await this.applyRetention(job);
        await this.notifyJobOutcome(job, run, artifact, 'SUCCESS');
        return artifact;
      } catch (error) {
        lastError = error;
        const retryable = isRetryable(error);
        if (!retryable || attempt > job.retryLimit) {
          await db
            .update(backupJobRuns)
            .set({
              status: retryable ? 'EXHAUSTED_RETRIES' : 'FAILED',
              endedAt: new Date(),
              retryReason: retryable
                ? 'retry limit exhausted'
                : 'permanent failure',
              errorMessage:
                error instanceof Error
                  ? error.message
                  : 'Scheduled backup failed.',
            })
            .where(eq(backupJobRuns.id, run.id));
          await db
            .update(backupJobs)
            .set({
              lastRunAt: new Date(),
              lastResult: retryable ? 'EXHAUSTED_RETRIES' : 'FAILED',
              consecutiveFailures: job.consecutiveFailures + 1,
              nextRunAt: nextScheduledRun(
                new Date(),
                job.frequency as 'DAILY' | 'WEEKLY' | 'MONTHLY',
                job.timeOfDay,
                job.timezone,
              ),
            })
            .where(eq(backupJobs.id, id));
          await this.notifyJobOutcome(
            job,
            run,
            undefined,
            retryable ? 'EXHAUSTED_RETRIES' : 'FAILED',
          );
          throw error;
        }

        const delayMs = Math.min(
          job.retryMaxDelaySeconds * 1000,
          job.retryInitialDelaySeconds * 1000 * 2 ** (attempt - 1),
        );
        await db
          .update(backupJobRuns)
          .set({
            status: 'RETRY_SCHEDULED',
            nextRetryAt: new Date(Date.now() + delayMs),
            retryReason:
              error instanceof Error ? error.message : 'transient failure',
          })
          .where(eq(backupJobRuns.id, run.id));
        return undefined;
      } finally {
        clearInterval(heartbeatTimer);
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('Scheduled backup failed.');
  }

  private async notifyJobOutcome(
    job: typeof backupJobs.$inferSelect,
    run: typeof backupJobRuns.$inferSelect,
    artifact: { id: string; name: string; sizeBytes: number } | undefined,
    status: string,
  ) {
    try {
      if (
        (status === 'SUCCESS' && !job.notifyOnSuccess) ||
        (status !== 'SUCCESS' && !job.notifyOnFailure)
      ) {
        return;
      }
      const title = `Backup job ${job.name}: ${status}`;
      const message = `Run ${run.id} finished with status ${status}.`;
      await this.notifications.createNotification({
        userId: job.createdById ?? undefined,
        module: 'BACKUPS',
        type: status === 'SUCCESS' ? 'SUCCESS' : 'ERROR',
        title,
        message,
        entityType: 'BackupJobRun',
        entityId: run.id,
      });
      if (job.createdById) {
        const [user] = await db
          .select({ id: users.id, email: users.email })
          .from(users)
          .where(eq(users.id, job.createdById));
        if (user?.email) {
          await this.mail.enqueue({
            eventType: `BACKUP_${status}`,
            to: user.email,
            userId: user.id,
            subject: title,
            text: `${message}${
              artifact
                ? ` Artifact ${artifact.name} (${artifact.sizeBytes} bytes).`
                : ''
            }`,
            html: `<p>${message}</p>`,
            sourceType: 'BackupJobRun',
            sourceId: run.id,
          });
        }
      }
    } catch (error) {
      this.logger.warn(
        `Backup notification failed for run ${run.id}: ${String(error)}`,
      );
    }
  }

  async previewRestore(
    content: Buffer,
    dtoOrPassphrase?: PreviewRestoreDto | string,
    userId?: string,
  ) {
    const dto: PreviewRestoreDto =
      typeof dtoOrPassphrase === 'string'
        ? { passphrase: dtoOrPassphrase }
        : (dtoOrPassphrase ?? {});

    const archive = unpackArchive(content, dto.passphrase);
    const selectedTables = selectTables(archive, dto.scope);
    const components = Array.isArray(archive.manifest.components)
      ? archive.manifest.components
      : [];
    const selectedFiles =
      dto.scope?.includeFiles === false
        ? []
        : archive.files.map((file) => file.storageKey);

    const canonicalPlan: CanonicalRestorePlan = {
      formatVersion: archive.manifest.formatVersion,
      archiveChecksum: archiveChecksum(content),
      conflictPolicy: dto.conflictPolicy ?? 'ABORT',
      components: [...components].sort(),
      tables: [...selectedTables].sort(),
      recordsToProcess: selectedTables.reduce(
        (total, table) => total + (archive.tables[table]?.length ?? 0),
        0,
      ),
      files: [...selectedFiles].sort(),
      destructive: true,
    };
    const planHash = hashRestorePlan(canonicalPlan);

    let operationId: string | undefined;
    if (userId) {
      const [operation] = await db
        .insert(restoreOperations)
        .values({
          status: 'PREVIEWED',
          scope: (dto.scope ?? {}) as Record<string, unknown>,
          conflictPolicy: canonicalPlan.conflictPolicy,
          preview: canonicalPlan as unknown as Record<string, unknown>,
          plan: canonicalPlan as unknown as Record<string, unknown>,
          planHash,
          initiatedById: userId,
        })
        .returning({ id: restoreOperations.id });
      operationId = operation?.id;
      await this.audit.record({
        userId,
        action: 'BACKUP_RESTORE_PREVIEWED',
        category: 'ADMINISTRATION',
        details: { operationId, planHash },
      });
    }
    return {
      manifest: archive.manifest,
      plan: canonicalPlan,
      planHash,
      operationId,
      tables: Object.fromEntries(
        selectedTables.map((name) => [name, archive.tables[name]?.length ?? 0]),
      ),
      files: selectedFiles,
    };
  }

  async restore(content: Buffer, dto: RestoreDto, userId: string) {
    if (!dto.confirmDestructive) {
      throw new BadRequestException(
        'Explicit destructive restore confirmation is required.',
      );
    }
    if (!dto.operationId || !dto.planHash) {
      throw new BadRequestException(
        'A valid previewed restore operationId and planHash are required.',
      );
    }

    const [operation] = await db
      .select()
      .from(restoreOperations)
      .where(eq(restoreOperations.id, dto.operationId));

    if (!operation) {
      throw new NotFoundException('Restore operation not found.');
    }
    if (operation.status !== 'PREVIEWED') {
      throw new BadRequestException(
        'Restore operation is not in PREVIEWED state or has already been executed.',
      );
    }

    const persistedPlan = operation.plan as unknown as CanonicalRestorePlan;
    if (!persistedPlan || typeof persistedPlan !== 'object') {
      throw new BadRequestException(
        'Persisted restore plan is missing or corrupt.',
      );
    }

    const computedHash = hashRestorePlan(persistedPlan);
    if (computedHash !== operation.planHash) {
      throw new BadRequestException(
        'Persisted restore plan tampering detected: hash mismatch.',
      );
    }
    if (dto.planHash !== operation.planHash) {
      throw new BadRequestException(
        'Supplied planHash does not match the persisted restore plan.',
      );
    }

    const contentChecksum = archiveChecksum(content);
    if (contentChecksum !== persistedPlan.archiveChecksum) {
      throw new BadRequestException(
        'Archive content does not match the previewed archive checksum.',
      );
    }

    const archive = unpackArchive(content, dto.passphrase);

    const lock = await pool.query<{ locked: boolean }>(
      "select pg_try_advisory_lock(hashtext('ananya_backup_restore')) as locked",
    );
    if (!lock.rows[0]?.locked) {
      throw new ConflictException(
        'Another restore operation is already running.',
      );
    }

    await db
      .update(restoreOperations)
      .set({
        status: 'RUNNING',
        startedAt: new Date(),
      })
      .where(eq(restoreOperations.id, operation.id));

    let safetyBackupId: string | undefined;
    let staging: { directory: string; files: string[] } | undefined;
    let databaseCommitted = false;
    try {
      const safety = await this.createBackup(
        {
          name: `Pre-restore safety ${new Date().toISOString()}`,
          type: 'FULL',
          encrypted: false,
        },
        userId,
        'pre-restore',
      );
      safetyBackupId = safety?.id;
      await db
        .update(restoreOperations)
        .set({ artifactId: safetyBackupId })
        .where(eq(restoreOperations.id, operation.id));

      const allowedFileSet = new Set(persistedPlan.files);
      const filteredArchiveFiles = archive.files.filter((file) =>
        allowedFileSet.has(file.storageKey),
      );
      const restoreFilesArchive: BackupArchive = {
        ...archive,
        files: filteredArchiveFiles,
      };

      staging = await this.stageFiles(restoreFilesArchive, {
        includeFiles: persistedPlan.files.length > 0,
      });
      await db
        .update(restoreOperations)
        .set({ stagedFiles: staging.files })
        .where(eq(restoreOperations.id, operation.id));

      const result = await this.restoreTables(
        archive,
        persistedPlan.tables,
        persistedPlan.conflictPolicy,
      );
      databaseCommitted = true;

      const promotedFiles = await this.promoteFiles(
        restoreFilesArchive,
        { includeFiles: persistedPlan.files.length > 0 },
        staging,
      );

      await db
        .update(restoreOperations)
        .set({
          status: 'SUCCESS',
          promotedFiles,
          result: { ...result, promotedFiles, safetyBackupId },
          completedAt: new Date(),
        })
        .where(eq(restoreOperations.id, operation.id));

      await this.audit.record({
        userId,
        action: 'BACKUP_RESTORED',
        category: 'ADMINISTRATION',
        details: {
          operationId: operation.id,
          safetyBackupId,
          tables: persistedPlan.tables,
        },
      });

      return {
        operationId: operation.id,
        ...result,
        promotedFiles,
        safetyBackupId,
      };
    } catch (error) {
      await db
        .update(restoreOperations)
        .set({
          status: databaseCommitted ? 'PARTIALLY_FAILED' : 'FAILED',
          errorMessage:
            error instanceof Error ? error.message : 'Restore failed.',
          recoveryInfo: {
            safetyBackupId,
            stagingDirectory: staging?.directory,
            message: databaseCommitted
              ? 'Database committed but file promotion was incomplete. Restore the safety backup or promote affected files manually.'
              : 'Database transaction was rolled back and production files were not promoted.',
          },
          completedAt: new Date(),
        })
        .where(eq(restoreOperations.id, operation.id));

      try {
        await this.audit.record({
          userId,
          action: 'BACKUP_RESTORE_FAILED',
          category: 'ADMINISTRATION',
          details: {
            operationId: operation.id,
            error: error instanceof Error ? error.message : 'Restore failed',
            databaseCommitted,
          },
        });
      } catch (auditErr) {
        this.logger.warn(
          `Failed to audit restore failure: ${String(auditErr)}`,
        );
      }

      throw error;
    } finally {
      if (staging)
        await fs.rm(staging.directory, { recursive: true, force: true });
      await pool.query(
        "select pg_advisory_unlock(hashtext('ananya_backup_restore'))",
      );
    }
  }

  async tickScheduledJobs(systemUserId: string) {
    await this.recoverAbandonedRuns();
    await this.processRetryRuns(systemUserId);
    const jobs = await db
      .select()
      .from(backupJobs)
      .where(
        and(eq(backupJobs.enabled, true), lt(backupJobs.nextRunAt, new Date())),
      );
    for (const job of jobs) {
      const lock = await pool.query<{ locked: boolean }>(
        'select pg_try_advisory_lock(hashtext($1)) as locked',
        [`ananya_backup_job_${job.id}`],
      );
      if (!lock.rows[0]?.locked) continue;
      try {
        await this.runJob(job.id, systemUserId);
      } catch (error) {
        this.logger.error(
          `Scheduled backup ${job.id} failed: ${String(error)}`,
        );
      } finally {
        await pool.query('select pg_advisory_unlock(hashtext($1))', [
          `ananya_backup_job_${job.id}`,
        ]);
      }
    }
  }

  async processRetryRuns(systemUserId: string) {
    const runs = await db
      .select()
      .from(backupJobRuns)
      .where(
        and(
          eq(backupJobRuns.status, 'RETRY_SCHEDULED'),
          lt(backupJobRuns.nextRetryAt, new Date()),
        ),
      );
    for (const run of runs) {
      const lock = await pool.query<{ locked: boolean }>(
        'select pg_try_advisory_lock(hashtext($1)) as locked',
        [`ananya_backup_job_${run.jobId}`],
      );
      if (!lock.rows[0]?.locked) continue;
      try {
        await this.runJob(run.jobId, systemUserId, run.id);
      } catch (error) {
        this.logger.error(
          `Retry for backup run ${run.id} failed: ${String(error)}`,
        );
      } finally {
        await pool.query('select pg_advisory_unlock(hashtext($1))', [
          `ananya_backup_job_${run.jobId}`,
        ]);
      }
    }
  }

  async recoverAbandonedRuns(heartbeatTimeoutMs = 30_000) {
    const cutoff = new Date(Date.now() - heartbeatTimeoutMs);
    const recovered = await db
      .update(backupJobRuns)
      .set({
        status: sql`CASE WHEN ${backupJobRuns.attempt} < ${backupJobRuns.maxAttempts} THEN 'RETRY_SCHEDULED' ELSE 'FAILED' END`,
        endedAt: new Date(),
        errorMessage: 'Worker heartbeat expired; run abandoned.',
        retryReason: 'worker restart recovery',
        nextRetryAt: sql`CASE WHEN ${backupJobRuns.attempt} < ${backupJobRuns.maxAttempts} THEN NOW() ELSE NULL END`,
      })
      .where(
        and(
          eq(backupJobRuns.status, 'RUNNING'),
          or(
            lt(backupJobRuns.heartbeatAt, cutoff),
            and(
              sql`${backupJobRuns.heartbeatAt} IS NULL`,
              lt(backupJobRuns.startedAt, cutoff),
            ),
          ),
        ),
      )
      .returning();
    return recovered;
  }

  private async buildArchive(dto: CreateBackupDto): Promise<BackupArchive> {
    const scope = normalizeScope(dto.scope);
    const tables = await listTables();
    const requestedTables = Array.isArray(scope.tables) ? scope.tables : [];
    const selected = requestedTables.length
      ? tables.filter((table) => requestedTables.includes(table))
      : tables;
    const tableData: Record<string, unknown[]> = {};
    if (scope.includeDatabase !== false) {
      for (const table of selected) {
        const result = await pool.query(
          `select * from ${quoteIdentifier(table)}`,
        );
        tableData[table] = result.rows;
      }
    }
    const files: BackupArchive['files'] = [];
    if (scope.includeFiles !== false) {
      const docs = await pool.query<{ storage_key: string | null }>(
        'select storage_key from documents where storage_key is not null',
      );
      for (const doc of docs.rows) {
        if (!doc.storage_key) continue;
        files.push({
          storageKey: doc.storage_key,
          content: (await this.storage.readFile(doc.storage_key)).toString(
            'base64',
          ),
        });
      }
    }
    return {
      manifest: {
        formatVersion: '1',
        applicationVersion: process.env.npm_package_version ?? '0.3.0',
        createdAt: new Date().toISOString(),
        scope,
        tables: Object.keys(tableData),
        files: files.map((file) => file.storageKey),
        components: Array.isArray(scope.components)
          ? (scope.components as string[])
          : [],
        encrypted: dto.encrypted ?? false,
      },
      tables: tableData,
      files,
    };
  }

  private async buildStreamingArchive(
    dto: CreateBackupDto,
    outputPath: string,
  ) {
    const scope = normalizeScope(dto.scope);
    const tables = await listTables();
    const requestedTables = Array.isArray(scope.tables) ? scope.tables : [];
    const selected = requestedTables.length
      ? tables.filter((table) => requestedTables.includes(table))
      : tables;
    const documents =
      scope.includeFiles === false
        ? []
        : (
            await pool.query<{ storage_key: string | null }>(
              'select storage_key from documents where storage_key is not null',
            )
          ).rows
            .map((row) => row.storage_key)
            .filter((key): key is string => Boolean(key));
    const manifest = {
      formatVersion: '2',
      applicationVersion: process.env.npm_package_version ?? '0.3.0',
      createdAt: new Date().toISOString(),
      scope,
      tables: scope.includeDatabase === false ? [] : selected,
      files: documents,
      components: Array.isArray(scope.components)
        ? (scope.components as string[])
        : [],
      encrypted: dto.encrypted ?? false,
    };
    const records = (async function* (service: BackupsService) {
      if (scope.includeDatabase !== false) {
        for (const table of selected) {
          const result = await pool.query(
            `select * from ${quoteIdentifier(table)}`,
          );
          for (const row of result.rows) {
            yield {
              type: 'table' as const,
              table,
              row: row as Record<string, unknown>,
            };
          }
        }
      }
      for (const storageKey of documents) {
        const content = await service.storage.readFile(storageKey);
        yield {
          type: 'file' as const,
          storageKey,
          content: content.toString('base64'),
        };
      }
    })(this);
    return streamPackArchiveToFile(
      manifest,
      records,
      outputPath,
      dto.encrypted ? dto.passphrase : undefined,
    );
  }

  private async restoreTables(
    archive: BackupArchive,
    tables: string[],
    policy: CanonicalRestorePlan['conflictPolicy'],
  ) {
    let inserted = 0;
    let skipped = 0;
    await db.transaction(async (tx) => {
      for (const table of tables) {
        const rows = archive.tables[table] ?? [];
        for (const row of rows) {
          const keys = Object.keys(row as Record<string, unknown>);
          if (!keys.length) continue;
          const columns = keys.map(quoteIdentifier).join(', ');
          const values = keys.map((_, index) => `$${index + 1}`).join(', ');
          const args = keys.map((key) => (row as Record<string, unknown>)[key]);
          try {
            await tx.execute({
              sql: `insert into ${quoteIdentifier(table)} (${columns}) values (${values})`,
              params: args,
            } as never);
            inserted += 1;
          } catch (error) {
            if (policy === 'SKIP') {
              skipped += 1;
              continue;
            }
            if (policy === 'UPDATE') {
              const id = (row as Record<string, unknown>).id;
              if (!id) throw error;
              const updates = keys
                .filter((key) => key !== 'id')
                .map((key, index) => `${quoteIdentifier(key)} = $${index + 1}`)
                .join(', ');
              await tx.execute({
                sql: `update ${quoteIdentifier(table)} set ${updates} where id = $${keys.length}`,
                params: [
                  ...keys
                    .filter((key) => key !== 'id')
                    .map((key) => (row as Record<string, unknown>)[key]),
                  id,
                ],
              } as never);
              inserted += 1;
              continue;
            }
            throw error;
          }
        }
      }
    });
    return { inserted, skipped, tables };
  }

  async stageFiles(
    archive: BackupArchive,
    scope?: { includeFiles?: boolean },
  ): Promise<{ directory: string; files: string[] }> {
    const directory = await fs.mkdtemp(join(tmpdir(), 'ananya-restore-'));
    if (scope?.includeFiles === false) return { directory, files: [] };
    const files: string[] = [];
    for (const file of archive.files) {
      const key = basename(file.storageKey.replace(/\\/g, '/'));
      if (key !== file.storageKey || key === '.' || key === '..') {
        throw new BadRequestException(
          `Unsafe restore path "${file.storageKey}".`,
        );
      }
      const target = join(directory, key);
      const content = Buffer.from(file.content, 'base64');
      await fs.writeFile(target, content, { flag: 'wx', mode: 0o600 });
      files.push(key);
    }
    return { directory, files };
  }

  async promoteFiles(
    archive: BackupArchive,
    scope: { includeFiles?: boolean } | undefined,
    staging: { directory: string; files: string[] },
  ): Promise<string[]> {
    if (scope?.includeFiles === false) return [];
    const promotedInfo: {
      key: string;
      replaced: boolean;
      backupKey?: string;
    }[] = [];
    try {
      for (const file of archive.files) {
        const key = basename(file.storageKey.replace(/\\/g, '/'));
        const exists = await this.storage.exists(key);
        if (exists) {
          // Backup existing file before overwriting
          const originalContent = await this.storage.readFile(key);
          const backupKey = `${key}.backup-${Date.now()}-${randomUUID()}`;
          await this.storage.storeFile(backupKey, originalContent);
          await this.storage.storeFileFromPath(
            key,
            join(staging.directory, key),
          );
          promotedInfo.push({ key, replaced: true, backupKey });
        } else {
          await this.storage.storeFileFromPath(
            key,
            join(staging.directory, key),
          );
          promotedInfo.push({ key, replaced: false });
        }
      }
      // Cleanup temporary backup files for replaced entries
      for (const info of promotedInfo) {
        if (info.replaced && info.backupKey) {
          try {
            await this.storage.deleteFile(info.backupKey);
          } catch (cleanupErr) {
            this.logger.warn(
              `Failed to delete temporary backup ${info.backupKey}: ${String(cleanupErr)}`,
            );
          }
        }
      }
      return promotedInfo.map((info) => info.key);
    } catch (err) {
      // Attempt to rollback any files already promoted
      for (const info of promotedInfo) {
        try {
          if (info.replaced && info.backupKey) {
            // Restore original content and attempt to delete backup
            try {
              const backupContent = await this.storage.readFile(info.backupKey);
              await this.storage.storeFile(info.key, backupContent);
            } catch (restoreErr) {
              this.logger.warn(
                `Failed to restore backup for ${info.key}: ${String(restoreErr)}`,
              );
            }
            try {
              await this.storage.deleteFile(info.backupKey);
            } catch (cleanupErr) {
              this.logger.warn(
                `Failed to delete backup after rollback for ${info.key}: ${String(cleanupErr)}`,
              );
            }
          } else {
            await this.storage.deleteFile(info.key);
          }
        } catch {
          // ignore rollback failure
        }
      }
      throw err;
    }
  }

  private async applyRetention(job: typeof backupJobs.$inferSelect) {
    // Run retention inside a transaction-scoped advisory lock to prevent concurrent deletions
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('ananya_backup_retention'))`,
      );

      const artifacts = await tx
        .select()
        .from(backupArtifacts)
        .where(eq(backupArtifacts.jobId, job.id))
        .orderBy(desc(backupArtifacts.createdAt));

      // Protect artifacts referenced by active restores and active backup runs
      const activeRestores = await tx
        .select({ artifactId: restoreOperations.artifactId })
        .from(restoreOperations)
        .where(eq(restoreOperations.status, 'RUNNING'));

      const activeBackupRuns = await tx
        .select({ artifactId: backupJobRuns.artifactId })
        .from(backupJobRuns)
        .where(
          or(
            eq(backupJobRuns.status, 'RUNNING'),
            eq(backupJobRuns.status, 'RETRYING'),
          ),
        );

      const protectedArtifacts = new Set<string>([
        ...activeRestores
          .map((r) => r.artifactId)
          .filter((id): id is string => Boolean(id)),
        ...activeBackupRuns
          .map((r) => r.artifactId)
          .filter((id): id is string => Boolean(id)),
      ]);

      const stale = [
        ...(job.retentionMaxCount
          ? artifacts.slice(job.retentionMaxCount)
          : []),
        ...(job.retentionMaxAgeDays
          ? artifacts.filter(
              (artifact) =>
                artifact.createdAt <
                new Date(Date.now() - job.retentionMaxAgeDays! * 86400000),
            )
          : []),
      ];

      for (const artifact of new Map(
        stale.map((item) => [item.id, item]),
      ).values()) {
        if (
          artifact.status === 'COMPLETED' &&
          !protectedArtifacts.has(artifact.id)
        ) {
          try {
            if (artifact.storageKey)
              await this.storage.deleteFile(artifact.storageKey);
            await tx
              .delete(backupArtifacts)
              .where(eq(backupArtifacts.id, artifact.id));
          } catch {
            // ignore cleanup failure
          }
        }
      }
    });
  }
}

function normalizeScope(
  scope?: CreateBackupDto['scope'],
): Record<string, unknown> {
  const componentIds = scope?.components ?? [];
  const resolved = componentIds.length
    ? resolveComponentScope(componentIds)
    : undefined;
  return {
    includeDatabase: scope?.includeDatabase ?? true,
    includeFiles: resolved?.includeFiles ?? scope?.includeFiles ?? true,
    tables: resolved?.tables ?? scope?.tables ?? [],
    components: resolved?.components ?? [],
    dependencies: resolved?.dependencies ?? [],
  };
}

async function listTables(): Promise<string[]> {
  const result = await pool.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
  );
  return result.rows
    .map((row) => row.table_name)
    .filter((table) => !INTERNAL_TABLES.has(table));
}

function selectTables(archive: BackupArchive, scope?: { tables?: string[] }) {
  const requested = scope?.tables ?? [];
  return requested.length
    ? archive.manifest.tables.filter((table) => requested.includes(table))
    : archive.manifest.tables;
}

function quoteIdentifier(value: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value))
    throw new BadRequestException('Unsafe archive identifier.');
  return `"${value}"`;
}

function isRetryable(error: unknown) {
  if (
    error instanceof BadRequestException ||
    error instanceof UnauthorizedException
  )
    return false;
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return !/(invalid|incompatible|authorization|permission|passphrase|manifest|unsupported)/.test(
    message,
  );
}

export interface CanonicalRestorePlan {
  formatVersion: string;
  archiveChecksum: string;
  conflictPolicy: 'SKIP' | 'UPDATE' | 'ABORT';
  components: string[];
  tables: string[];
  recordsToProcess: number;
  files: string[];
  destructive: boolean;
}

export function canonicalizeRestorePlan(plan: CanonicalRestorePlan): string {
  const normalized: CanonicalRestorePlan = {
    formatVersion: plan.formatVersion,
    archiveChecksum: plan.archiveChecksum,
    conflictPolicy: plan.conflictPolicy,
    components: [...plan.components].sort(),
    tables: [...plan.tables].sort(),
    recordsToProcess: plan.recordsToProcess,
    files: [...plan.files].sort(),
    destructive: Boolean(plan.destructive),
  };
  return JSON.stringify(normalized, Object.keys(normalized).sort());
}

export function hashRestorePlan(plan: CanonicalRestorePlan): string {
  return createHash('sha256')
    .update(canonicalizeRestorePlan(plan))
    .digest('hex');
}

import { Injectable, Logger } from '@nestjs/common';

export interface BackupsMetricsSnapshot {
  backupRunsStarted: number;
  backupRunsSucceeded: number;
  backupRunsFailed: number;
  backupRetries: number;
  backupBytesProduced: number;
  restoreOperationsStarted: number;
  restoreOperationsSucceeded: number;
  restoreOperationsFailed: number;
  retentionDeletions: number;
  notificationFailures: number;
  abandonedRunRecoveries: number;
  lastBackupDurationMs: number | null;
  averageBackupDurationMs: number | null;
  lastRestoreDurationMs: number | null;
  averageRestoreDurationMs: number | null;
}

@Injectable()
export class BackupsMetricsService {
  private readonly logger = new Logger(BackupsMetricsService.name);

  private backupRunsStarted = 0;
  private backupRunsSucceeded = 0;
  private backupRunsFailed = 0;
  private backupRetries = 0;
  private backupBytesProduced = 0;
  private totalBackupDurationMs = 0;
  private lastBackupDurationMs: number | null = null;

  private restoreOperationsStarted = 0;
  private restoreOperationsSucceeded = 0;
  private restoreOperationsFailed = 0;
  private totalRestoreDurationMs = 0;
  private lastRestoreDurationMs: number | null = null;

  private retentionDeletions = 0;
  private notificationFailures = 0;
  private abandonedRunRecoveries = 0;

  recordBackupStarted(jobId?: string, runId?: string): void {
    this.backupRunsStarted += 1;
    this.logger.log(
      JSON.stringify({
        event: 'backup.run.started',
        jobId: jobId ?? null,
        runId: runId ?? null,
        timestamp: new Date().toISOString(),
      }),
    );
  }

  recordBackupSucceeded(params: {
    jobId?: string;
    runId?: string;
    artifactId?: string;
    durationMs: number;
    sizeBytes: number;
  }): void {
    this.backupRunsSucceeded += 1;
    this.backupBytesProduced += params.sizeBytes;
    this.lastBackupDurationMs = params.durationMs;
    this.totalBackupDurationMs += params.durationMs;

    this.logger.log(
      JSON.stringify({
        event: 'backup.run.succeeded',
        jobId: params.jobId ?? null,
        runId: params.runId ?? null,
        artifactId: params.artifactId ?? null,
        durationMs: params.durationMs,
        sizeBytes: params.sizeBytes,
        timestamp: new Date().toISOString(),
      }),
    );
  }

  recordBackupFailed(params: {
    jobId?: string;
    runId?: string;
    durationMs: number;
    error: string;
  }): void {
    this.backupRunsFailed += 1;
    this.lastBackupDurationMs = params.durationMs;

    this.logger.error(
      JSON.stringify({
        event: 'backup.run.failed',
        jobId: params.jobId ?? null,
        runId: params.runId ?? null,
        durationMs: params.durationMs,
        error: this.sanitizeErrorMessage(params.error),
        timestamp: new Date().toISOString(),
      }),
    );
  }

  recordBackupRetry(params: {
    jobId?: string;
    runId?: string;
    attempt: number;
    reason: string;
  }): void {
    this.backupRetries += 1;
    this.logger.warn(
      JSON.stringify({
        event: 'backup.run.retrying',
        jobId: params.jobId ?? null,
        runId: params.runId ?? null,
        attempt: params.attempt,
        reason: this.sanitizeErrorMessage(params.reason),
        timestamp: new Date().toISOString(),
      }),
    );
  }

  recordRestoreStarted(params: {
    operationId?: string;
    artifactId?: string;
  }): void {
    this.restoreOperationsStarted += 1;
    this.logger.log(
      JSON.stringify({
        event: 'restore.operation.started',
        operationId: params.operationId ?? null,
        artifactId: params.artifactId ?? null,
        timestamp: new Date().toISOString(),
      }),
    );
  }

  recordRestoreSucceeded(params: {
    operationId?: string;
    durationMs: number;
  }): void {
    this.restoreOperationsSucceeded += 1;
    this.lastRestoreDurationMs = params.durationMs;
    this.totalRestoreDurationMs += params.durationMs;

    this.logger.log(
      JSON.stringify({
        event: 'restore.operation.succeeded',
        operationId: params.operationId ?? null,
        durationMs: params.durationMs,
        timestamp: new Date().toISOString(),
      }),
    );
  }

  recordRestoreFailed(params: {
    operationId?: string;
    durationMs: number;
    error: string;
  }): void {
    this.restoreOperationsFailed += 1;
    this.lastRestoreDurationMs = params.durationMs;

    this.logger.error(
      JSON.stringify({
        event: 'restore.operation.failed',
        operationId: params.operationId ?? null,
        durationMs: params.durationMs,
        error: this.sanitizeErrorMessage(params.error),
        timestamp: new Date().toISOString(),
      }),
    );
  }

  recordRetentionDeletions(count: number): void {
    if (count <= 0) return;
    this.retentionDeletions += count;
    this.logger.log(
      JSON.stringify({
        event: 'backup.retention.deleted',
        count,
        timestamp: new Date().toISOString(),
      }),
    );
  }

  recordNotificationFailure(eventType: string, error: string): void {
    this.notificationFailures += 1;
    this.logger.warn(
      JSON.stringify({
        event: 'backup.notification.failed',
        eventType,
        error: this.sanitizeErrorMessage(error),
        timestamp: new Date().toISOString(),
      }),
    );
  }

  recordAbandonedRunRecovery(runId: string): void {
    this.abandonedRunRecoveries += 1;
    this.logger.warn(
      JSON.stringify({
        event: 'backup.run.abandoned_recovered',
        runId,
        timestamp: new Date().toISOString(),
      }),
    );
  }

  getSnapshot(): BackupsMetricsSnapshot {
    return {
      backupRunsStarted: this.backupRunsStarted,
      backupRunsSucceeded: this.backupRunsSucceeded,
      backupRunsFailed: this.backupRunsFailed,
      backupRetries: this.backupRetries,
      backupBytesProduced: this.backupBytesProduced,
      restoreOperationsStarted: this.restoreOperationsStarted,
      restoreOperationsSucceeded: this.restoreOperationsSucceeded,
      restoreOperationsFailed: this.restoreOperationsFailed,
      retentionDeletions: this.retentionDeletions,
      notificationFailures: this.notificationFailures,
      abandonedRunRecoveries: this.abandonedRunRecoveries,
      lastBackupDurationMs: this.lastBackupDurationMs,
      averageBackupDurationMs:
        this.backupRunsSucceeded > 0
          ? Math.round(this.totalBackupDurationMs / this.backupRunsSucceeded)
          : null,
      lastRestoreDurationMs: this.lastRestoreDurationMs,
      averageRestoreDurationMs:
        this.restoreOperationsSucceeded > 0
          ? Math.round(
              this.totalRestoreDurationMs / this.restoreOperationsSucceeded,
            )
          : null,
    };
  }

  /**
   * Strips any passphrases, secrets, or file paths containing sensitive data.
   */
  private sanitizeErrorMessage(msg: string): string {
    if (!msg) return 'Unknown error';
    return msg
      .replace(/passphrase[=:\s]+[^\s,;]+/gi, 'passphrase=[REDACTED]')
      .replace(/password[=:\s]+[^\s,;]+/gi, 'password=[REDACTED]')
      .replace(/key[=:\s]+[^\s,;]+/gi, 'key=[REDACTED]');
  }
}

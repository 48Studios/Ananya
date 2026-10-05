import { Logger } from '@nestjs/common';
import { BackupsMetricsService } from './backups-metrics.service';

describe('BackupsMetricsService', () => {
  let service: BackupsMetricsService;

  beforeEach(() => {
    service = new BackupsMetricsService();
  });

  it('initializes with all counters zero and null averages', () => {
    const snapshot = service.getSnapshot();
    expect(snapshot.backupRunsStarted).toBe(0);
    expect(snapshot.backupRunsSucceeded).toBe(0);
    expect(snapshot.backupRunsFailed).toBe(0);
    expect(snapshot.backupRetries).toBe(0);
    expect(snapshot.backupBytesProduced).toBe(0);
    expect(snapshot.restoreOperationsStarted).toBe(0);
    expect(snapshot.restoreOperationsSucceeded).toBe(0);
    expect(snapshot.restoreOperationsFailed).toBe(0);
    expect(snapshot.retentionDeletions).toBe(0);
    expect(snapshot.notificationFailures).toBe(0);
    expect(snapshot.abandonedRunRecoveries).toBe(0);
    expect(snapshot.lastBackupDurationMs).toBeNull();
    expect(snapshot.averageBackupDurationMs).toBeNull();
    expect(snapshot.lastRestoreDurationMs).toBeNull();
    expect(snapshot.averageRestoreDurationMs).toBeNull();
  });

  it('records backup lifecycle metrics and computes duration averages', () => {
    service.recordBackupStarted('job-1', 'run-1');
    service.recordBackupSucceeded({
      jobId: 'job-1',
      runId: 'run-1',
      artifactId: 'art-1',
      durationMs: 2000,
      sizeBytes: 1024,
    });

    service.recordBackupStarted('job-1', 'run-2');
    service.recordBackupRetry({
      jobId: 'job-1',
      runId: 'run-2',
      attempt: 1,
      reason: 'Transient lock timeout',
    });
    service.recordBackupSucceeded({
      jobId: 'job-1',
      runId: 'run-2',
      artifactId: 'art-2',
      durationMs: 4000,
      sizeBytes: 2048,
    });

    service.recordBackupStarted('job-1', 'run-3');
    service.recordBackupFailed({
      jobId: 'job-1',
      runId: 'run-3',
      durationMs: 1500,
      error: 'Disk full passphrase=supersecret',
    });

    const snapshot = service.getSnapshot();
    expect(snapshot.backupRunsStarted).toBe(3);
    expect(snapshot.backupRunsSucceeded).toBe(2);
    expect(snapshot.backupRunsFailed).toBe(1);
    expect(snapshot.backupRetries).toBe(1);
    expect(snapshot.backupBytesProduced).toBe(3072);
    expect(snapshot.lastBackupDurationMs).toBe(1500);
    // Average of succeeded: (2000 + 4000) / 2 = 3000
    expect(snapshot.averageBackupDurationMs).toBe(3000);
  });

  it('records restore lifecycle metrics and computes duration averages', () => {
    service.recordRestoreStarted({ operationId: 'op-1', artifactId: 'art-1' });
    service.recordRestoreSucceeded({ operationId: 'op-1', durationMs: 5000 });

    service.recordRestoreStarted({ operationId: 'op-2' });
    service.recordRestoreFailed({
      operationId: 'op-2',
      durationMs: 3000,
      error: 'Conflict key=mysecret',
    });

    const snapshot = service.getSnapshot();
    expect(snapshot.restoreOperationsStarted).toBe(2);
    expect(snapshot.restoreOperationsSucceeded).toBe(1);
    expect(snapshot.restoreOperationsFailed).toBe(1);
    expect(snapshot.lastRestoreDurationMs).toBe(3000);
    expect(snapshot.averageRestoreDurationMs).toBe(5000);
  });

  it('records retention, notification failures, and abandoned recoveries', () => {
    service.recordRetentionDeletions(5);
    service.recordRetentionDeletions(0); // non-positive ignored
    service.recordNotificationFailure(
      'backup.failed',
      'SMTP offline password=secret',
    );
    service.recordAbandonedRunRecovery('run-abandoned-1');
    service.recordAbandonedRunRecovery('run-abandoned-2');

    const snapshot = service.getSnapshot();
    expect(snapshot.retentionDeletions).toBe(5);
    expect(snapshot.notificationFailures).toBe(1);
    expect(snapshot.abandonedRunRecoveries).toBe(2);
  });

  it('redacts sensitive information in error messages', () => {
    const loggerSpy = jest.spyOn(Logger.prototype, 'error');
    service.recordBackupFailed({
      jobId: 'job-1',
      runId: 'run-1',
      durationMs: 100,
      error:
        'Failed with passphrase: my-super-secret-phrase and password=plain',
    });

    expect(loggerSpy).toHaveBeenCalledTimes(1);
    const firstArg = String(loggerSpy.mock.calls[0]?.[0] ?? '');
    const logged = JSON.parse(firstArg) as { error: string };
    expect(logged.error).not.toContain('my-super-secret-phrase');
    expect(logged.error).not.toContain('plain');
    expect(logged.error).toContain('[REDACTED]');
  });
});

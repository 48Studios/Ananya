import { Injectable, Logger } from '@nestjs/common';
import { db } from '@ananya/database';
import { userSessions } from '@ananya/database/schema';
import { lt, eq, or, and } from '@ananya/database/query';

export interface CleanupResult {
  deletedCount: number;
  skipped: boolean;
  success: boolean;
  error?: string;
}

@Injectable()
export class SessionCleanupService {
  private readonly logger = new Logger(SessionCleanupService.name);
  private isCleaningUp = false;
  private timer: NodeJS.Timeout | null = null;

  /**
   * Performs a single execution cycle of session cleanup.
   * Enforces mutual exclusion to prevent overlapping executions.
   * Catches all exceptions so failures never crash the hosting process.
   */
  async cleanupExpiredSessions(): Promise<CleanupResult> {
    if (this.isCleaningUp) {
      this.logger.debug('[SessionCleanup] Cleanup cycle skipped: previous execution still in progress.');
      return { deletedCount: 0, skipped: true, success: true };
    }

    this.isCleaningUp = true;
    try {
      const now = new Date();
      const retentionDays = parseInt(process.env.SESSION_REVOKED_RETENTION_DAYS || '30', 10);
      const retentionThreshold = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

      // Delete sessions that are expired OR (revoked AND older than retention threshold)
      const deletedRows = await db
        .delete(userSessions)
        .where(
          or(
            lt(userSessions.expiresAt, now),
            and(
              eq(userSessions.isRevoked, true),
              lt(userSessions.updatedAt, retentionThreshold),
            ),
          ),
        )
        .returning({ id: userSessions.id });

      const count = deletedRows?.length ?? 0;
      if (count > 0) {
        this.logger.log(`[SessionCleanup] Successfully purged ${count} expired or stale revoked sessions.`);
      }

      return { deletedCount: count, skipped: false, success: true };
    } catch (err: any) {
      const errorMessage = err?.message || 'Unknown database error';
      this.logger.error(`[SessionCleanup] Cleanup cycle failed safely: ${errorMessage}`, err?.stack);
      return { deletedCount: 0, skipped: false, success: false, error: errorMessage };
    } finally {
      this.isCleaningUp = false;
    }
  }

  /**
   * Starts periodic execution of the session cleanup task.
   * Uses an unref'd timer so background scheduling does not block process shutdown.
   */
  startPeriodicCleanup(intervalMs?: number): NodeJS.Timeout {
    if (this.timer) {
      return this.timer;
    }

    const intervalSec = process.env.SESSION_CLEANUP_INTERVAL_SECONDS
      ? parseInt(process.env.SESSION_CLEANUP_INTERVAL_SECONDS, 10)
      : process.env.SESSION_CLEANUP_INTERVAL_MINUTES
        ? parseInt(process.env.SESSION_CLEANUP_INTERVAL_MINUTES, 10) * 60
        : 3600;
    const interval = intervalMs ?? intervalSec * 1000;

    this.logger.log(
      `[SessionCleanup] Periodic session cleanup scheduled every ${interval / 1000} seconds.`,
    );

    this.timer = setInterval(() => {
      void this.cleanupExpiredSessions();
    }, interval);

    // Unref so test runners and graceful shutdowns are not blocked by the timer
    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }

    return this.timer;
  }

  /**
   * Stops the periodic cleanup schedule cleanly.
   */
  stopPeriodicCleanup(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.log('[SessionCleanup] Periodic session cleanup stopped.');
    }
  }

  /**
   * Returns current execution lock status (useful for unit testing).
   */
  isRunning(): boolean {
    return this.isCleaningUp;
  }
}

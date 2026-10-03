import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InventoryAlertsService } from './inventory-alerts.service';

/**
 * Scheduled reconciliation.
 *
 * Stock-change paths evaluate alerts inline, but imports, direct database
 * maintenance, or a failed inline evaluation can miss a transition. This job
 * re-evaluates on an interval so alert state converges without human action.
 * Evaluation is idempotent, so running it alongside inline triggers is safe.
 */
@Injectable()
export class InventoryAlertScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InventoryAlertScheduler.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly inventoryAlertsService: InventoryAlertsService,
  ) {}

  onModuleInit(): void {
    // Tests evaluate explicitly; an interval would make them non-deterministic.
    if (process.env.NODE_ENV === 'test') return;

    const intervalMs = Number.parseInt(
      process.env.INVENTORY_ALERT_INTERVAL_MS ?? '300000',
      10,
    );
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) return;

    this.timer = setInterval(() => {
      void this.inventoryAlertsService.evaluate().catch((error: unknown) => {
        this.logger.error(
          `Scheduled inventory alert evaluation failed: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      });
    }, intervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}

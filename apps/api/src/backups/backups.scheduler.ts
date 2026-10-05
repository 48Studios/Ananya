import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BackupsService } from './backups.service';

@Injectable()
export class BackupsScheduler implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  constructor(private readonly backups: BackupsService) {}
  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(
      () =>
        void this.backups.tickScheduledJobs(
          process.env.BACKUP_SYSTEM_USER_ID ??
            '00000000-0000-0000-0000-000000000000',
        ),
      30_000,
    );
    this.timer.unref?.();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}

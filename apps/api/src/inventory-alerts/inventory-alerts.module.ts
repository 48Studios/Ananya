import { Module } from '@nestjs/common';
import { InventoryAlertsController } from './inventory-alerts.controller';
import { InventoryAlertsService } from './inventory-alerts.service';
import { InventoryAlertScheduler } from './inventory-alert.scheduler';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [NotificationsModule, MailModule],
  controllers: [InventoryAlertsController],
  providers: [InventoryAlertsService, InventoryAlertScheduler],
  exports: [InventoryAlertsService],
})
export class InventoryAlertsModule {}

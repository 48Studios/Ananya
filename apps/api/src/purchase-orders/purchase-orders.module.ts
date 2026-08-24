import { Module } from '@nestjs/common';
import { PurchaseOrdersController } from './purchase-orders.controller';
import {
  PurchaseOrdersService,
  PURCHASE_ORDER_REPOSITORY,
} from './purchase-orders.service';
import { DrizzlePurchaseOrderRepository } from '../infrastructure/repositories/drizzle-purchase-order.repository';

import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [PurchaseOrdersController],
  providers: [
    PurchaseOrdersService,
    {
      provide: PURCHASE_ORDER_REPOSITORY,
      useClass: DrizzlePurchaseOrderRepository,
    },
  ],
  exports: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}

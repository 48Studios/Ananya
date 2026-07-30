import { Module } from '@nestjs/common';
import { CycleCountsController } from './cycle-counts.controller';
import {
  CycleCountsService,
  CYCLE_COUNT_REPOSITORY,
} from './cycle-counts.service';
import { DrizzleCycleCountRepository } from '../infrastructure/repositories/drizzle-cycle-count.repository';
import { StockAdjustmentsModule } from '../stock-adjustments/stock-adjustments.module';

@Module({
  imports: [StockAdjustmentsModule],
  controllers: [CycleCountsController],
  providers: [
    CycleCountsService,
    {
      provide: CYCLE_COUNT_REPOSITORY,
      useClass: DrizzleCycleCountRepository,
    },
  ],
  exports: [CycleCountsService],
})
export class CycleCountsModule {}

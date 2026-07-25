import { Module } from '@nestjs/common';
import { CycleCountsController } from './cycle-counts.controller';
import {
  CycleCountsService,
  CYCLE_COUNT_REPOSITORY,
} from './cycle-counts.service';
import { DrizzleCycleCountRepository } from '../infrastructure/repositories/drizzle-cycle-count.repository';
import { StockCountsModule } from '../stock-counts/stock-counts.module';

@Module({
  imports: [StockCountsModule],
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

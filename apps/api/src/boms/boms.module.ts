import { Module } from '@nestjs/common';
import { BomsController } from './boms.controller';
import { BomsService, BOM_REPOSITORY } from './boms.service';
import { DrizzleBillOfMaterialsRepository } from '../infrastructure/repositories/drizzle-bill-of-materials.repository';

@Module({
  controllers: [BomsController],
  providers: [
    BomsService,
    {
      provide: BOM_REPOSITORY,
      useClass: DrizzleBillOfMaterialsRepository,
    },
  ],
  exports: [BomsService],
})
export class BomsModule {}

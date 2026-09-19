import { Module } from '@nestjs/common';
import { COMPONENT_REPOSITORY } from './component.tokens';
import { DrizzleComponentRepository } from '../infrastructure/repositories/drizzle-component.repository';
import { ComponentsController } from './components.controller';
import { ComponentsService } from './components.service';
import { ComponentSkuService } from './component-sku.service';
import { PendingComponentEntityService } from './pending-component-entity.service';
import { ComponentSkuPreviewService } from './component-sku-preview.service';

import { AttributesModule } from '../attributes/attributes.module';
import { MlModule } from '../ml/ml.module';
import { ManufacturersModule } from '../manufacturers/manufacturers.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [AttributesModule, MlModule, ManufacturersModule, CategoriesModule],
  controllers: [ComponentsController],
  providers: [
    ComponentsService,
    ComponentSkuService,
    PendingComponentEntityService,
    ComponentSkuPreviewService,
    {
      provide: COMPONENT_REPOSITORY,
      useClass: DrizzleComponentRepository,
    },
  ],
  exports: [ComponentsService],
})
export class ComponentsModule {}

import { forwardRef, Module } from '@nestjs/common';
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
// The catalog routes are guarded (Pass 6). Guards built by
// `createPermissionGuard` depend on `AuthService` and `PermissionsService`, so the
// module that declares the controller must import both — the same pair `MlModule`
// imports for its guards.
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [
    AttributesModule,
    // Deferred edge of the Components -> Ml -> DataPacks -> ImportExport ->
    // Components cycle; see import-export.module.ts.
    forwardRef(() => MlModule),
    ManufacturersModule,
    CategoriesModule,
    AuthModule,
    PermissionsModule,
  ],
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

import { forwardRef, Module } from '@nestjs/common';
import { ImportExportService } from './import-export.service';
import { ImportExportController } from './import-export.controller';
import { BulkActionService } from './bulk-action.service';
import { BulkActionsController } from './bulk-actions.controller';
import { AttributesModule } from '../attributes/attributes.module';
import { BomsModule } from '../boms/boms.module';
import { CategoriesModule } from '../categories/categories.module';
import { ComponentsModule } from '../components/components.module';
import { LocationsModule } from '../locations/locations.module';
import { ManufacturersModule } from '../manufacturers/manufacturers.module';
import { ProductionOrdersModule } from '../production-orders/production-orders.module';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module';
import { RolesModule } from '../roles/roles.module';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { UnitsModule } from '../units/units.module';

/**
 * Bulk actions are carried out by the owning modules' own services (see
 * `BulkActionService`), so those modules are imported here rather than the
 * bulk path reaching into their tables.
 *
 * Importing `ComponentsModule` closes a real cycle — Components needs `MlModule`
 * for AI suggestions, Ml needs `DataPacksModule` for pack hints, and DataPacks
 * needs `ImportExportService` — so every edge of that cycle is deferred with
 * `forwardRef` (here and in those three modules).
 */
@Module({
  imports: [
    AttributesModule,
    BomsModule,
    CategoriesModule,
    forwardRef(() => ComponentsModule),
    LocationsModule,
    ManufacturersModule,
    ProductionOrdersModule,
    PurchaseOrdersModule,
    RolesModule,
    SuppliersModule,
    UnitsModule,
  ],
  controllers: [ImportExportController, BulkActionsController],
  providers: [ImportExportService, BulkActionService],
  exports: [ImportExportService],
})
export class ImportExportModule {}

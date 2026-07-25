import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { LocationsModule } from './locations/locations.module';
import { ComponentsModule } from './components/components.module';
import { ManufacturersModule } from './manufacturers/manufacturers.module';
import { UnitsModule } from './units/units.module';
import { InventoryTransactionsModule } from './inventory-transactions/inventory-transactions.module';
import { InventoryProjectionsModule } from './inventory-projections/inventory-projections.module';
import { ReservationsModule } from './reservations/reservations.module';
import { BatchesModule } from './batches/batches.module';
import { SerialsModule } from './serials/serials.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { GoodsReceiptsModule } from './goods-receipts/goods-receipts.module';
import { SupplierReturnsModule } from './supplier-returns/supplier-returns.module';
import { PurchaseInvoicesModule } from './purchase-invoices/purchase-invoices.module';
import { ProcurementPoliciesModule } from './procurement-policies/procurement-policies.module';
import { ProcurementReportingModule } from './procurement-reporting/procurement-reporting.module';
import { BomsModule } from './boms/boms.module';
import { ProductionOrdersModule } from './production-orders/production-orders.module';
import { MaterialConsumptionsModule } from './material-consumptions/material-consumptions.module';
import { FinishedGoodsModule } from './finished-goods/finished-goods.module';
import { ManufacturingTraceabilityModule } from './manufacturing-traceability/manufacturing-traceability.module';
import { WarehousesModule } from './warehouses/warehouses.module';
import { StockCountsModule } from './stock-counts/stock-counts.module';
import { CycleCountsModule } from './cycle-counts/cycle-counts.module';
import { WarehouseTransfersModule } from './warehouse-transfers/warehouse-transfers.module';
import { WarehousePoliciesModule } from './warehouse-policies/warehouse-policies.module';

@Module({
  imports: [
    LocationsModule,
    ComponentsModule,
    ManufacturersModule,
    UnitsModule,
    InventoryTransactionsModule,
    InventoryProjectionsModule,
    ReservationsModule,
    BatchesModule,
    SerialsModule,
    SuppliersModule,
    PurchaseOrdersModule,
    GoodsReceiptsModule,
    SupplierReturnsModule,
    PurchaseInvoicesModule,
    ProcurementPoliciesModule,
    ProcurementReportingModule,
    BomsModule,
    ProductionOrdersModule,
    MaterialConsumptionsModule,
    FinishedGoodsModule,
    ManufacturingTraceabilityModule,
    WarehousesModule,
    StockCountsModule,
    CycleCountsModule,
    WarehouseTransfersModule,
    WarehousePoliciesModule,
  ],
  controllers: [AppController],
})
export class AppModule {}

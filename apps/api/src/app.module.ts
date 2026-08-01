import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { LocationsModule } from './locations/locations.module';
import { ComponentsModule } from './components/components.module';
import { ManufacturersModule } from './manufacturers/manufacturers.module';
import { CategoriesModule } from './categories/categories.module';
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
import { StockAdjustmentsModule } from './stock-adjustments/stock-adjustments.module';
import { CycleCountsModule } from './cycle-counts/cycle-counts.module';
import { WarehouseTransfersModule } from './warehouse-transfers/warehouse-transfers.module';
import { WarehousePoliciesModule } from './warehouse-policies/warehouse-policies.module';
import { CustomersModule } from './customers/customers.module';
import { QuotationsModule } from './quotations/quotations.module';
import { SalesOrdersModule } from './sales-orders/sales-orders.module';
import { FulfillmentRequestsModule } from './fulfillment/fulfillment-requests.module';
import { CustomerReturnsModule } from './customer-returns/customer-returns.module';
import { AccountsModule } from './accounts/accounts.module';
import { JournalEntriesModule } from './journal-entries/journal-entries.module';
import { ReceivableInvoicesModule } from './receivable-invoices/receivable-invoices.module';
import { PayableInvoicesModule } from './payable-invoices/payable-invoices.module';
import { PaymentsModule } from './payments/payments.module';
import { BankReconciliationsModule } from './bank-reconciliations/bank-reconciliations.module';
import { LeadsModule } from './leads/leads.module';
import { CrmAccountsModule } from './crm-accounts/crm-accounts.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
import { ActivitiesModule } from './activities/activities.module';
import { NotesModule } from './notes/notes.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { TimeEntriesModule } from './time-entries/time-entries.module';
import { ServiceRequestsModule } from './service-requests/service-requests.module';
import { WorkOrdersModule } from './work-orders/work-orders.module';
import { WarrantyClaimsModule } from './warranty-claims/warranty-claims.module';
import { RmaRequestsModule } from './rma-requests/rma-requests.module';
import { MaintenanceSchedulesModule } from './maintenance-schedules/maintenance-schedules.module';
import { ServiceNotesModule } from './service-notes/service-notes.module';
import { PlanningRunsModule } from './planning-runs/planning-runs.module';
import { MaterialRequirementsModule } from './material-requirements/material-requirements.module';
import { PurchaseRecommendationsModule } from './purchase-recommendations/purchase-recommendations.module';
import { ProductionRecommendationsModule } from './production-recommendations/production-recommendations.module';
import { CapacityPlansModule } from './capacity-plans/capacity-plans.module';
import { PlanningMessagesModule } from './planning-messages/planning-messages.module';
import { ReportingModule } from './reporting/reporting.module';
import { BarcodesModule } from './barcodes/barcodes.module';

@Module({
  imports: [
    LocationsModule,
    ComponentsModule,
    ManufacturersModule,
    CategoriesModule,
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
    StockAdjustmentsModule,
    CycleCountsModule,
    WarehouseTransfersModule,
    WarehousePoliciesModule,
    CustomersModule,
    QuotationsModule,
    SalesOrdersModule,
    FulfillmentRequestsModule,
    CustomerReturnsModule,
    AccountsModule,
    JournalEntriesModule,
    ReceivableInvoicesModule,
    PayableInvoicesModule,
    PaymentsModule,
    BankReconciliationsModule,
    LeadsModule,
    CrmAccountsModule,
    OpportunitiesModule,
    ActivitiesModule,
    NotesModule,
    ProjectsModule,
    TasksModule,
    TimeEntriesModule,
    ServiceRequestsModule,
    WorkOrdersModule,
    WarrantyClaimsModule,
    RmaRequestsModule,
    MaintenanceSchedulesModule,
    ServiceNotesModule,
    PlanningRunsModule,
    MaterialRequirementsModule,
    PurchaseRecommendationsModule,
    ProductionRecommendationsModule,
    CapacityPlansModule,
    PlanningMessagesModule,
    ReportingModule,
    BarcodesModule,
  ],
  controllers: [AppController],
})
export class AppModule {}

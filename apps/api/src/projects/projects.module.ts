import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService, PROJECT_REPOSITORY } from './projects.service';
import { DrizzleProjectRepository } from '../infrastructure/repositories/drizzle-project.repository';
import { CustomersModule } from '../customers/customers.module';
import { SalesOrdersModule } from '../sales-orders/sales-orders.module';
import { InventoryTransactionsModule } from '../inventory-transactions/inventory-transactions.module';
import { InventoryProjectionsModule } from '../inventory-projections/inventory-projections.module';

@Module({
  imports: [
    CustomersModule,
    SalesOrdersModule,
    InventoryTransactionsModule,
    InventoryProjectionsModule,
  ],
  controllers: [ProjectsController],
  providers: [
    ProjectsService,
    {
      provide: PROJECT_REPOSITORY,
      useClass: DrizzleProjectRepository,
    },
  ],
  exports: [ProjectsService],
})
export class ProjectsModule {}

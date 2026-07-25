import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService, PROJECT_REPOSITORY } from './projects.service';
import { DrizzleProjectRepository } from '../infrastructure/repositories/drizzle-project.repository';
import { CustomersModule } from '../customers/customers.module';
import { SalesOrdersModule } from '../sales-orders/sales-orders.module';

@Module({
  imports: [CustomersModule, SalesOrdersModule],
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

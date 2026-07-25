import { Module } from '@nestjs/common';
import { OpportunitiesController } from './opportunities.controller';
import {
  OpportunitiesService,
  OPPORTUNITY_REPOSITORY,
} from './opportunities.service';
import { DrizzleOpportunityRepository } from '../infrastructure/repositories/drizzle-opportunity.repository';
import { CrmAccountsModule } from '../crm-accounts/crm-accounts.module';
import { CustomersModule } from '../customers/customers.module';
import { QuotationsModule } from '../quotations/quotations.module';

@Module({
  imports: [CrmAccountsModule, CustomersModule, QuotationsModule],
  controllers: [OpportunitiesController],
  providers: [
    OpportunitiesService,
    {
      provide: OPPORTUNITY_REPOSITORY,
      useClass: DrizzleOpportunityRepository,
    },
  ],
  exports: [OpportunitiesService],
})
export class OpportunitiesModule {}

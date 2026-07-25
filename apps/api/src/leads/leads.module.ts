import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService, LEAD_REPOSITORY } from './leads.service';
import { DrizzleLeadRepository } from '../infrastructure/repositories/drizzle-lead.repository';
import { CrmAccountsModule } from '../crm-accounts/crm-accounts.module';

@Module({
  imports: [CrmAccountsModule],
  controllers: [LeadsController],
  providers: [
    LeadsService,
    {
      provide: LEAD_REPOSITORY,
      useClass: DrizzleLeadRepository,
    },
  ],
  exports: [LeadsService],
})
export class LeadsModule {}

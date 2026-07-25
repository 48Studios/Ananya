import { Module } from '@nestjs/common';
import { CrmAccountsController } from './crm-accounts.controller';
import {
  CrmAccountsService,
  CRM_ACCOUNT_REPOSITORY,
} from './crm-accounts.service';
import { DrizzleCrmAccountRepository } from '../infrastructure/repositories/drizzle-crm-account.repository';

@Module({
  controllers: [CrmAccountsController],
  providers: [
    CrmAccountsService,
    {
      provide: CRM_ACCOUNT_REPOSITORY,
      useClass: DrizzleCrmAccountRepository,
    },
  ],
  exports: [CrmAccountsService],
})
export class CrmAccountsModule {}

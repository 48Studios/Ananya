import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { AccountsService, ACCOUNT_REPOSITORY } from './accounts.service';
import { DrizzleAccountRepository } from '../infrastructure/repositories/drizzle-account.repository';

@Module({
  controllers: [AccountsController],
  providers: [
    AccountsService,
    {
      provide: ACCOUNT_REPOSITORY,
      useClass: DrizzleAccountRepository,
    },
  ],
  exports: [AccountsService],
})
export class AccountsModule {}

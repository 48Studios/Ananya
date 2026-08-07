import { Global, Module } from '@nestjs/common';
import { db, pool } from '@ananya/database';
import { DATABASE_CONNECTION, DATABASE_POOL } from './database.constants';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CONNECTION,
      useValue: db,
    },
    {
      provide: DATABASE_POOL,
      useValue: pool,
    },
  ],
  exports: [DATABASE_CONNECTION, DATABASE_POOL],
})
export class DatabaseModule {}

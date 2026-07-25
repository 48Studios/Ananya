import { Module } from '@nestjs/common';
import { JournalEntriesController } from './journal-entries.controller';
import {
  JournalEntriesService,
  JOURNAL_ENTRY_REPOSITORY,
} from './journal-entries.service';
import { DrizzleJournalEntryRepository } from '../infrastructure/repositories/drizzle-journal-entry.repository';

@Module({
  controllers: [JournalEntriesController],
  providers: [
    JournalEntriesService,
    {
      provide: JOURNAL_ENTRY_REPOSITORY,
      useClass: DrizzleJournalEntryRepository,
    },
  ],
  exports: [JournalEntriesService],
})
export class JournalEntriesModule {}

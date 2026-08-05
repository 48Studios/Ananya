import { JournalEntry, JournalStatus } from "./journal-entry";

export interface FindManyJournalEntriesOptions {
  status?: JournalStatus;
  search?: string;
}

export interface JournalEntryRepository {
  findById(id: string): Promise<JournalEntry | null>;
  findByNumber(journalNumber: string): Promise<JournalEntry | null>;
  findMany(options?: FindManyJournalEntriesOptions): Promise<JournalEntry[]>;
  save(journalEntry: JournalEntry): Promise<void>;
  generateNextJournalNumber(): Promise<string>;
}

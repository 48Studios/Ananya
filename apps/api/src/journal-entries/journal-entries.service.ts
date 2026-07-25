import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  JournalEntry,
  JournalEntryRepository,
  JournalStatus,
} from '@ananya/finance';
import { CreateJournalEntryDto, AddJournalLineDto } from './dtos';

export const JOURNAL_ENTRY_REPOSITORY = 'JOURNAL_ENTRY_REPOSITORY';

@Injectable()
export class JournalEntriesService {
  constructor(
    @Inject(JOURNAL_ENTRY_REPOSITORY)
    private readonly journalRepository: JournalEntryRepository,
  ) {}

  async create(dto: CreateJournalEntryDto): Promise<JournalEntry> {
    const journalNumber =
      await this.journalRepository.generateNextJournalNumber();
    const journal = JournalEntry.create({
      journalNumber,
      description: dto.description,
      date: dto.date ? new Date(dto.date) : undefined,
      reference: dto.reference,
    });
    await this.journalRepository.save(journal);
    return journal;
  }

  async findAll(
    status?: JournalStatus,
    search?: string,
  ): Promise<JournalEntry[]> {
    return this.journalRepository.findMany({ status, search });
  }

  async findOne(id: string): Promise<JournalEntry> {
    const journal = await this.journalRepository.findById(id);
    if (!journal) {
      throw new NotFoundException(`Journal entry with ID ${id} not found.`);
    }
    return journal;
  }

  async addLine(id: string, dto: AddJournalLineDto): Promise<JournalEntry> {
    const journal = await this.findOne(id);
    journal.addLine(dto);
    await this.journalRepository.save(journal);
    return journal;
  }

  async post(id: string): Promise<JournalEntry> {
    const journal = await this.findOne(id);
    journal.post();
    await this.journalRepository.save(journal);
    return journal;
  }

  async reverse(id: string): Promise<JournalEntry> {
    const journal = await this.findOne(id);
    journal.reverse();
    await this.journalRepository.save(journal);
    return journal;
  }

  async void(id: string): Promise<JournalEntry> {
    const journal = await this.findOne(id);
    journal.void();
    await this.journalRepository.save(journal);
    return journal;
  }
}

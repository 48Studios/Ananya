import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Note, NoteRepository } from '@ananya/crm';
import { CreateNoteDto } from './dtos';

export const NOTE_REPOSITORY = 'NOTE_REPOSITORY';

@Injectable()
export class NotesService {
  constructor(
    @Inject(NOTE_REPOSITORY)
    private readonly noteRepository: NoteRepository,
  ) {}

  async create(dto: CreateNoteDto): Promise<Note> {
    const note = Note.create({
      author: dto.author,
      body: dto.body,
      leadId: dto.leadId,
      crmAccountId: dto.crmAccountId,
      opportunityId: dto.opportunityId,
      activityId: dto.activityId,
    });
    await this.noteRepository.save(note);
    return note;
  }

  async findAll(
    leadId?: string,
    crmAccountId?: string,
    opportunityId?: string,
    activityId?: string,
  ): Promise<Note[]> {
    return this.noteRepository.findMany({
      leadId,
      crmAccountId,
      opportunityId,
      activityId,
    });
  }

  async findOne(id: string): Promise<Note> {
    const note = await this.noteRepository.findById(id);
    if (!note) {
      throw new NotFoundException(`Note with ID ${id} not found.`);
    }
    return note;
  }
}

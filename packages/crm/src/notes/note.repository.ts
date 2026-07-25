import { Note } from './note';

export interface FindManyNotesOptions {
  leadId?: string;
  crmAccountId?: string;
  opportunityId?: string;
  activityId?: string;
}

export interface NoteRepository {
  findById(id: string): Promise<Note | null>;
  findMany(options?: FindManyNotesOptions): Promise<Note[]>;
  save(note: Note): Promise<void>;
}

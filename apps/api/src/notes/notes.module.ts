import { Module } from '@nestjs/common';
import { NotesController } from './notes.controller';
import { NotesService, NOTE_REPOSITORY } from './notes.service';
import { DrizzleNoteRepository } from '../infrastructure/repositories/drizzle-note.repository';

@Module({
  controllers: [NotesController],
  providers: [
    NotesService,
    {
      provide: NOTE_REPOSITORY,
      useClass: DrizzleNoteRepository,
    },
  ],
  exports: [NotesService],
})
export class NotesModule {}

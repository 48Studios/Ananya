import { Module } from '@nestjs/common';
import { ServiceNotesController } from './service-notes.controller';
import {
  ServiceNotesService,
  SERVICE_NOTE_REPOSITORY,
} from './service-notes.service';
import { DrizzleServiceNoteRepository } from '../infrastructure/repositories/drizzle-service-note.repository';

@Module({
  controllers: [ServiceNotesController],
  providers: [
    ServiceNotesService,
    {
      provide: SERVICE_NOTE_REPOSITORY,
      useClass: DrizzleServiceNoteRepository,
    },
  ],
  exports: [ServiceNotesService],
})
export class ServiceNotesModule {}

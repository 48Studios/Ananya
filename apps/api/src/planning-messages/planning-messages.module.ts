import { Module } from '@nestjs/common';
import { PlanningMessagesController } from './planning-messages.controller';
import {
  PlanningMessagesService,
  PLANNING_MESSAGE_REPOSITORY,
} from './planning-messages.service';
import { DrizzlePlanningMessageRepository } from '../infrastructure/repositories/drizzle-planning-message.repository';

@Module({
  controllers: [PlanningMessagesController],
  providers: [
    PlanningMessagesService,
    {
      provide: PLANNING_MESSAGE_REPOSITORY,
      useClass: DrizzlePlanningMessageRepository,
    },
  ],
  exports: [PlanningMessagesService],
})
export class PlanningMessagesModule {}

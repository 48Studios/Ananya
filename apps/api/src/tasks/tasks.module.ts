import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService, TASK_REPOSITORY } from './tasks.service';
import { DrizzleTaskRepository } from '../infrastructure/repositories/drizzle-task.repository';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [ProjectsModule],
  controllers: [TasksController],
  providers: [
    TasksService,
    {
      provide: TASK_REPOSITORY,
      useClass: DrizzleTaskRepository,
    },
  ],
  exports: [TasksService],
})
export class TasksModule {}

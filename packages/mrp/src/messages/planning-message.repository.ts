import { PlanningMessage, MessageSeverity } from './planning-message';

export interface FindManyPlanningMessagesOptions {
  planningRunId?: string;
  severity?: MessageSeverity;
}

export interface PlanningMessageRepository {
  findById(id: string): Promise<PlanningMessage | null>;
  findMany(
    options?: FindManyPlanningMessagesOptions,
  ): Promise<PlanningMessage[]>;
  save(message: PlanningMessage): Promise<void>;
  saveMany(messages: PlanningMessage[]): Promise<void>;
}

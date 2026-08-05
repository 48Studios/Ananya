import { Activity, ActivityType, ActivityStatus } from "./activity";

export interface FindManyActivitiesOptions {
  type?: ActivityType;
  status?: ActivityStatus;
  owner?: string;
  relatedLeadId?: string;
  relatedOpportunityId?: string;
  relatedAccountId?: string;
}

export interface ActivityRepository {
  findById(id: string): Promise<Activity | null>;
  findMany(options?: FindManyActivitiesOptions): Promise<Activity[]>;
  save(activity: Activity): Promise<void>;
}

import { ServiceNote } from "./service-note";

export interface FindManyServiceNotesOptions {
  serviceRequestId?: string;
  workOrderId?: string;
  warrantyClaimId?: string;
}

export interface ServiceNoteRepository {
  findById(id: string): Promise<ServiceNote | null>;
  findMany(options?: FindManyServiceNotesOptions): Promise<ServiceNote[]>;
  save(note: ServiceNote): Promise<void>;
}

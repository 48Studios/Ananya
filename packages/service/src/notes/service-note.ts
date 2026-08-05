import { ObjectId } from "@ananya/core";

export interface ServiceNoteProps {
  id: string;
  serviceRequestId?: string;
  workOrderId?: string;
  warrantyClaimId?: string;
  author: string;
  body: string;
  createdAt: Date;
}

export interface CreateServiceNoteProps {
  serviceRequestId?: string;
  workOrderId?: string;
  warrantyClaimId?: string;
  author: string;
  body: string;
}

export class ServiceNote implements ServiceNoteProps {
  public readonly id: string;
  public serviceRequestId?: string;
  public workOrderId?: string;
  public warrantyClaimId?: string;
  public author: string;
  public body: string;
  public readonly createdAt: Date;

  private constructor(props: ServiceNoteProps) {
    this.id = props.id;
    this.serviceRequestId = props.serviceRequestId;
    this.workOrderId = props.workOrderId;
    this.warrantyClaimId = props.warrantyClaimId;
    this.author = props.author;
    this.body = props.body;
    this.createdAt = props.createdAt;
  }

  public static create(props: CreateServiceNoteProps): ServiceNote {
    if (!props.author || props.author.trim() === "") {
      throw new Error("Service note author is required");
    }
    if (!props.body || props.body.trim() === "") {
      throw new Error("Service note body is required");
    }
    if (
      !props.serviceRequestId &&
      !props.workOrderId &&
      !props.warrantyClaimId
    ) {
      throw new Error(
        "Service note must be associated with at least one target",
      );
    }

    return new ServiceNote({
      id: ObjectId.generate().value,
      serviceRequestId: props.serviceRequestId,
      workOrderId: props.workOrderId,
      warrantyClaimId: props.warrantyClaimId,
      author: props.author.trim(),
      body: props.body.trim(),
      createdAt: new Date(),
    });
  }

  public static rehydrate(props: ServiceNoteProps): ServiceNote {
    return new ServiceNote(props);
  }
}

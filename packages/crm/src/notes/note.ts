import { ObjectId } from "@ananya/core";

export interface NoteProps {
  id: string;
  author: string;
  body: string;
  leadId?: string;
  crmAccountId?: string;
  opportunityId?: string;
  activityId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateNoteProps {
  author: string;
  body: string;
  leadId?: string;
  crmAccountId?: string;
  opportunityId?: string;
  activityId?: string;
}

export class Note implements NoteProps {
  public readonly id: string;
  public author: string;
  public body: string;
  public leadId?: string;
  public crmAccountId?: string;
  public opportunityId?: string;
  public activityId?: string;
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: NoteProps) {
    this.id = props.id;
    this.author = props.author;
    this.body = props.body;
    this.leadId = props.leadId;
    this.crmAccountId = props.crmAccountId;
    this.opportunityId = props.opportunityId;
    this.activityId = props.activityId;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(props: CreateNoteProps): Note {
    if (!props.body || props.body.trim() === "") {
      throw new Error("Note body cannot be empty");
    }
    if (
      !props.leadId &&
      !props.crmAccountId &&
      !props.opportunityId &&
      !props.activityId
    ) {
      throw new Error("Note must be attached to at least one CRM entity");
    }

    const now = new Date();
    return new Note({
      id: ObjectId.generate().value,
      author: props.author,
      body: props.body.trim(),
      leadId: props.leadId,
      crmAccountId: props.crmAccountId,
      opportunityId: props.opportunityId,
      activityId: props.activityId,
      createdAt: now,
      updatedAt: now,
    });
  }

  public static rehydrate(props: NoteProps): Note {
    return new Note(props);
  }
}

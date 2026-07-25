export type MessageSeverity = 'INFO' | 'WARNING' | 'ERROR';

export interface CreatePlanningMessageProps {
  planningRunId: string;
  severity: MessageSeverity;
  message: string;
}

export interface RehydratePlanningMessageProps {
  id: string;
  planningRunId: string;
  severity: MessageSeverity;
  message: string;
  createdAt: Date;
}

export class InvalidPlanningMessageError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'InvalidPlanningMessageError';
  }
}

export class PlanningMessage {
  public readonly id: string;
  private _planningRunId: string;
  private _severity: MessageSeverity;
  private _message: string;
  private _createdAt: Date;

  private constructor(props: RehydratePlanningMessageProps) {
    this.id = props.id;
    this._planningRunId = props.planningRunId;
    this._severity = props.severity;
    this._message = props.message;
    this._createdAt = props.createdAt;
  }

  public static create(props: CreatePlanningMessageProps): PlanningMessage {
    if (!props.planningRunId || props.planningRunId.trim().length === 0) {
      throw new InvalidPlanningMessageError('Planning run ID is required.');
    }
    if (!props.message || props.message.trim().length === 0) {
      throw new InvalidPlanningMessageError('Log message text is required.');
    }

    return new PlanningMessage({
      id: crypto.randomUUID(),
      planningRunId: props.planningRunId,
      severity: props.severity,
      message: props.message.trim(),
      createdAt: new Date(),
    });
  }

  public static rehydrate(props: RehydratePlanningMessageProps): PlanningMessage {
    return new PlanningMessage(props);
  }

  public get planningRunId(): string {
    return this._planningRunId;
  }

  public get severity(): MessageSeverity {
    return this._severity;
  }

  public get message(): string {
    return this._message;
  }

  public get createdAt(): Date {
    return this._createdAt;
  }
}

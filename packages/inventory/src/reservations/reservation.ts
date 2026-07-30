import { ObjectId } from "@ananya/core";
import {
  ReservationStatus,
  type ReservationType,
  type CreateReservationInput,
  type ReservationProps,
  type ReservationLineProps,
  type CreateReservationLineInput,
} from "./reservation.types";
import {
  ImmutableReservationError,
  InvalidReservationQuantityError,
  InvalidReservationStatusError,
} from "./reservation.errors";

export class Reservation {
  public readonly id: string;
  public readonly reservationNumber: string;
  public reservationType: ReservationType;
  public referenceDocument?: string | null;
  public reservedBy: string;
  public notes?: string | null;
  public lines: ReservationLineProps[];
  private _status: ReservationStatus;
  public readonly createdAt: Date;
  public updatedAt: Date;
  public expiresAt?: Date | null;

  private constructor(props: ReservationProps) {
    this.id = props.id;
    this.reservationNumber = props.reservationNumber;
    this.reservationType = props.reservationType;
    this.referenceDocument = props.referenceDocument ?? null;
    this.reservedBy = props.reservedBy;
    this.notes = props.notes ?? null;
    this.lines = props.lines ?? [];
    this._status = props.status;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.expiresAt = props.expiresAt ?? null;
  }

  get status(): ReservationStatus {
    return this._status;
  }

  public static create(input: CreateReservationInput): Reservation {
    const id = ObjectId.generate().value;
    const now = new Date();

    const reservation = new Reservation({
      id,
      reservationNumber: input.reservationNumber.trim().toUpperCase(),
      reservationType: input.reservationType,
      referenceDocument: input.referenceDocument?.trim() ?? null,
      reservedBy: input.reservedBy.trim(),
      status: ReservationStatus.Active,
      notes: input.notes?.trim() ?? null,
      lines: [],
      createdAt: now,
      updatedAt: now,
      expiresAt: input.expiresAt ?? null,
    });

    if (input.lines && input.lines.length > 0) {
      for (const line of input.lines) {
        reservation.addLine(line);
      }
    }

    return reservation;
  }

  public addLine(input: CreateReservationLineInput): void {
    if (this._status !== ReservationStatus.Active && this._status !== ReservationStatus.Draft) {
      throw new ImmutableReservationError();
    }
    if (input.reservedQuantity <= 0) {
      throw new InvalidReservationQuantityError();
    }

    const lineId = ObjectId.generate().value;
    const now = new Date();

    this.lines.push({
      id: lineId,
      reservationId: this.id,
      componentId: input.componentId,
      locationId: input.locationId,
      reservedQuantity: input.reservedQuantity,
      fulfilledQuantity: 0,
      unitOfMeasure: input.unitOfMeasure || "pcs",
      notes: input.notes?.trim() ?? null,
      createdAt: now,
      updatedAt: now,
    });

    this.updatedAt = now;
  }

  public updateHeader(input: {
    reservationType?: ReservationType;
    referenceDocument?: string | null;
    reservedBy?: string;
    notes?: string | null;
    expiresAt?: Date | null;
  }): void {
    if (this._status !== ReservationStatus.Active && this._status !== ReservationStatus.Draft) {
      throw new ImmutableReservationError();
    }

    if (input.reservationType) this.reservationType = input.reservationType;
    if (input.referenceDocument !== undefined)
      this.referenceDocument = input.referenceDocument;
    if (input.reservedBy) this.reservedBy = input.reservedBy;
    if (input.notes !== undefined) this.notes = input.notes;
    if (input.expiresAt !== undefined) this.expiresAt = input.expiresAt;
    this.updatedAt = new Date();
  }

  public static rehydrate(props: ReservationProps): Reservation {
    return new Reservation(props);
  }

  public activate(): void {
    if (this._status !== ReservationStatus.Draft) {
      throw new InvalidReservationStatusError("Only draft reservations can be activated.");
    }
    this._status = ReservationStatus.Active;
    this.updatedAt = new Date();
  }

  public fulfill(): void {
    if (this._status !== ReservationStatus.Active) {
      throw new InvalidReservationStatusError(
        "Only active reservations can be fulfilled.",
      );
    }
    this._status = ReservationStatus.Fulfilled;
    this.updatedAt = new Date();
  }

  public release(): void {
    if (this._status !== ReservationStatus.Active) {
      throw new InvalidReservationStatusError(
        "Only active reservations can be released.",
      );
    }
    this._status = ReservationStatus.Released;
    this.updatedAt = new Date();
  }

  public cancel(): void {
    if (
      this._status === ReservationStatus.Fulfilled ||
      this._status === ReservationStatus.Released ||
      this._status === ReservationStatus.Cancelled
    ) {
      throw new ImmutableReservationError();
    }
    this._status = ReservationStatus.Cancelled;
    this.updatedAt = new Date();
  }

  public expire(): void {
    if (this._status !== ReservationStatus.Active) {
      throw new InvalidReservationStatusError(
        "Only active reservations can expire.",
      );
    }
    this._status = ReservationStatus.Expired;
    this.updatedAt = new Date();
  }
}

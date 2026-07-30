import type { Reservation } from "./reservation";
import type { ReservationStatus, ReservationType } from "./reservation.types";

export interface FindManyReservationsOptions {
  componentId?: string;
  locationId?: string;
  reservationType?: ReservationType;
  status?: ReservationStatus;
  referenceDocument?: string;
  search?: string;
}

export interface ReservationRepository {
  findById(id: string): Promise<Reservation | null>;
  findByReservationNumber(reservationNumber: string): Promise<Reservation | null>;
  findMany(options?: FindManyReservationsOptions): Promise<Reservation[]>;
  findActiveByComponentAndLocation(
    componentId: string,
    locationId: string,
  ): Promise<Reservation[]>;
  save(reservation: Reservation): Promise<Reservation>;
  delete(id: string): Promise<void>;
  generateNextReservationNumber(): Promise<string>;
}

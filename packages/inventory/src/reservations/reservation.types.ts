export enum ReservationStatus {
  Draft = "DRAFT",
  Active = "ACTIVE",
  Fulfilled = "FULFILLED",
  Released = "RELEASED",
  Expired = "EXPIRED",
  Cancelled = "CANCELLED",
}

export type ReservationType =
  | "WORK_ORDER"
  | "PROJECT"
  | "PURCHASE_REQUEST"
  | "SALES_ORDER";

export interface ReservationLineProps {
  id: string;
  reservationId: string;
  componentId: string;
  locationId: string;
  reservedQuantity: number;
  fulfilledQuantity: number;
  unitOfMeasure?: string;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReservationProps {
  id: string;
  reservationNumber: string;
  reservationType: ReservationType;
  referenceDocument?: string | null;
  reservedBy: string;
  status: ReservationStatus;
  notes?: string | null;
  lines?: ReservationLineProps[];
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date | null;
}

export interface CreateReservationLineInput {
  componentId: string;
  locationId: string;
  reservedQuantity: number;
  unitOfMeasure?: string;
  notes?: string | null;
}

export interface CreateReservationInput {
  reservationNumber: string;
  reservationType: ReservationType;
  referenceDocument?: string | null;
  reservedBy: string;
  notes?: string | null;
  expiresAt?: Date | null;
  lines?: CreateReservationLineInput[];
}

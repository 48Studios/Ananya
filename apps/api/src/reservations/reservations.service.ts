import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  Reservation,
  ReservationRepository,
  ReservationStatus,
  ReservationType,
  InsufficientAvailableInventoryError,
} from '@ananya/inventory';
import { CreateReservationDto, UpdateReservationDto } from './dtos';
import { RESERVATION_REPOSITORY } from './reservation.tokens';
import { InventoryProjectionsService } from '../inventory-projections/inventory-projections.service';

@Injectable()
export class ReservationsService {
  constructor(
    @Inject(RESERVATION_REPOSITORY)
    private readonly reservationRepository: ReservationRepository,
    private readonly inventoryProjectionsService: InventoryProjectionsService,
  ) {}

  async create(dto: CreateReservationDto): Promise<Reservation> {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException(
        'Inventory Reservation must contain at least one line item.',
      );
    }

    // Over-reservation check for each line item
    for (const line of dto.lines) {
      const avail = await this.getAvailableQuantity(
        line.componentId,
        line.locationId,
      );
      if (line.reservedQuantity > avail.available) {
        throw new InsufficientAvailableInventoryError(
          line.componentId,
          line.reservedQuantity,
          avail.available,
        );
      }
    }

    const reservationNumber =
      await this.reservationRepository.generateNextReservationNumber();

    const reservation = Reservation.create({
      reservationNumber,
      reservationType: dto.reservationType,
      referenceDocument: dto.referenceDocument,
      reservedBy: dto.reservedBy,
      notes: dto.notes,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      lines: dto.lines,
    });

    return this.reservationRepository.save(reservation);
  }

  async update(id: string, dto: UpdateReservationDto): Promise<Reservation> {
    const reservation = await this.getById(id);
    if (
      reservation.status !== ReservationStatus.Active &&
      reservation.status !== ReservationStatus.Draft
    ) {
      throw new BadRequestException(
        `Cannot edit reservation in ${reservation.status} status.`,
      );
    }

    reservation.updateHeader({
      reservationType: dto.reservationType,
      referenceDocument: dto.referenceDocument,
      reservedBy: dto.reservedBy,
      notes: dto.notes,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
    });

    if (dto.lines) {
      for (const line of dto.lines) {
        const avail = await this.getAvailableQuantity(
          line.componentId,
          line.locationId,
        );
        if (line.reservedQuantity > avail.available) {
          throw new InsufficientAvailableInventoryError(
            line.componentId,
            line.reservedQuantity,
            avail.available,
          );
        }
      }
      reservation.lines = [];
      for (const line of dto.lines) {
        reservation.addLine(line);
      }
    }

    return this.reservationRepository.save(reservation);
  }

  async findAll(
    componentId?: string,
    locationId?: string,
    reservationType?: ReservationType,
    status?: ReservationStatus,
    referenceDocument?: string,
    search?: string,
  ): Promise<Reservation[]> {
    return this.reservationRepository.findMany({
      componentId,
      locationId,
      reservationType,
      status,
      referenceDocument,
      search,
    });
  }

  async getById(id: string): Promise<Reservation> {
    const res = await this.reservationRepository.findById(id);
    if (!res) {
      throw new NotFoundException(`Reservation with ID ${id} not found.`);
    }
    return res;
  }

  async fulfill(id: string): Promise<Reservation> {
    const res = await this.getById(id);
    res.fulfill();
    return this.reservationRepository.save(res);
  }

  async release(id: string): Promise<Reservation> {
    const res = await this.getById(id);
    res.release();
    return this.reservationRepository.save(res);
  }

  async cancel(id: string): Promise<Reservation> {
    const res = await this.getById(id);
    res.cancel();
    return this.reservationRepository.save(res);
  }

  async delete(id: string): Promise<void> {
    const res = await this.getById(id);
    if (
      res.status === ReservationStatus.Fulfilled ||
      res.status === ReservationStatus.Released
    ) {
      throw new BadRequestException(
        'Completed or released reservations cannot be deleted.',
      );
    }
    await this.reservationRepository.delete(id);
  }

  async getAvailableQuantity(
    componentId: string,
    locationId: string,
  ): Promise<{ onHand: number; reserved: number; available: number }> {
    const projection =
      await this.inventoryProjectionsService.getByComponentAndLocation(
        componentId,
        locationId,
      );
    const onHand = projection ? projection.quantity : 0;

    const activeReservations =
      await this.reservationRepository.findActiveByComponentAndLocation(
        componentId,
        locationId,
      );

    let reserved = 0;
    for (const res of activeReservations) {
      for (const line of res.lines) {
        if (
          line.componentId === componentId &&
          line.locationId === locationId
        ) {
          reserved += line.reservedQuantity - line.fulfilledQuantity;
        }
      }
    }

    const available = Math.max(0, onHand - reserved);

    return { onHand, reserved, available };
  }
}

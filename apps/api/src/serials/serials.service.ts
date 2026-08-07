import { Inject, Injectable } from '@nestjs/common';
import { db } from '@ananya/database';
import { components, locations, serials } from '@ananya/database/schema';
import { eq } from '@ananya/database/query';
import {
  Serial,
  type CreateSerialInput,
  type SerialRepository,
} from '@ananya/inventory';
import { SERIAL_REPOSITORY } from './serial.tokens';

@Injectable()
export class SerialsService {
  constructor(
    @Inject(SERIAL_REPOSITORY)
    private readonly repository: SerialRepository,
  ) {}

  async create(input: CreateSerialInput): Promise<Serial> {
    const serial = Serial.create(input);
    return this.repository.save(serial);
  }

  async getAll() {
    return db
      .select({
        id: serials.id,
        componentId: serials.componentId,
        componentName: components.name,
        componentSku: components.sku,
        serialNumber: serials.serialNumber,
        locationId: serials.locationId,
        locationName: locations.name,
        createdAt: serials.createdAt,
      })
      .from(serials)
      .innerJoin(components, eq(serials.componentId, components.id))
      .leftJoin(locations, eq(serials.locationId, locations.id))
      .orderBy(components.sku, serials.serialNumber);
  }

  async getByComponent(componentId: string): Promise<Serial[]> {
    return this.repository.findManyByComponent(componentId);
  }

  async getById(id: string): Promise<Serial | null> {
    return this.repository.findById(id);
  }
}

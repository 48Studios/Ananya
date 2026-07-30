import { Inject, Injectable } from '@nestjs/common';
import {
  CreateManufacturer,
  UpdateManufacturer,
  DeleteManufacturer,
  type CreateManufacturerInput,
  type UpdateManufacturerInput,
  type Manufacturer,
  type ManufacturerRepository,
  ManufacturerNotFoundError,
} from '@ananya/inventory';
import { MANUFACTURER_REPOSITORY } from './manufacturer.tokens';

@Injectable()
export class ManufacturersService {
  private readonly createManufacturer: CreateManufacturer;
  private readonly updateManufacturer: UpdateManufacturer;
  private readonly deleteManufacturer: DeleteManufacturer;

  constructor(
    @Inject(MANUFACTURER_REPOSITORY)
    private readonly repository: ManufacturerRepository,
  ) {
    this.createManufacturer = new CreateManufacturer(repository);
    this.updateManufacturer = new UpdateManufacturer(repository);
    this.deleteManufacturer = new DeleteManufacturer(repository);
  }

  create(input: CreateManufacturerInput): Promise<Manufacturer> {
    return this.createManufacturer.execute(input);
  }

  update(id: string, input: UpdateManufacturerInput): Promise<Manufacturer> {
    return this.updateManufacturer.execute(id, input);
  }

  delete(id: string): Promise<void> {
    return this.deleteManufacturer.execute(id);
  }

  getAllManufacturers(): Promise<Manufacturer[]> {
    return this.repository.findMany();
  }

  async getManufacturer(id: string): Promise<Manufacturer> {
    const manufacturer = await this.repository.findById(id);
    if (!manufacturer) {
      throw new ManufacturerNotFoundError(id);
    }
    return manufacturer;
  }
}

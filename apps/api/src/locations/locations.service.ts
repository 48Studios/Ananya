import { Inject, Injectable } from '@nestjs/common';
import {
  CreateLocation,
  UpdateLocation,
  DeleteLocation,
  type CreateLocationInput,
  type UpdateLocationInput,
  type Location,
  type LocationRepository,
  LocationNotFoundError,
} from '@ananya/inventory';
import { LOCATION_REPOSITORY } from './location.tokens';

@Injectable()
export class LocationsService {
  private readonly createLocation: CreateLocation;
  private readonly updateLocation: UpdateLocation;
  private readonly deleteLocation: DeleteLocation;

  constructor(
    @Inject(LOCATION_REPOSITORY)
    private readonly repository: LocationRepository,
  ) {
    this.createLocation = new CreateLocation(repository);
    this.updateLocation = new UpdateLocation(repository);
    this.deleteLocation = new DeleteLocation(repository);
  }

  create(input: CreateLocationInput): Promise<Location> {
    return this.createLocation.execute(input);
  }

  update(id: string, input: UpdateLocationInput): Promise<Location> {
    return this.updateLocation.execute(id, input);
  }

  delete(id: string): Promise<void> {
    return this.deleteLocation.execute(id);
  }

  getAllLocations(): Promise<Location[]> {
    return this.repository.findMany();
  }

  async getLocation(id: string): Promise<Location> {
    const location = await this.repository.findById(id);
    if (!location) {
      throw new LocationNotFoundError(id);
    }
    return location;
  }
}

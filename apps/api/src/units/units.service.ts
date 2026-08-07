import { Inject, Injectable } from '@nestjs/common';
import {
  CreateUnit,
  UpdateUnit,
  DeleteUnit,
  type CreateUnitInput,
  type UpdateUnitInput,
  type Unit,
  type UnitRepository,
  UnitNotFoundError,
} from '@ananya/inventory';
import { UNIT_REPOSITORY } from './unit.tokens';

@Injectable()
export class UnitsService {
  private readonly createUnit: CreateUnit;
  private readonly updateUnit: UpdateUnit;
  private readonly deleteUnit: DeleteUnit;

  constructor(
    @Inject(UNIT_REPOSITORY)
    private readonly repository: UnitRepository,
  ) {
    this.createUnit = new CreateUnit(repository);
    this.updateUnit = new UpdateUnit(repository);
    this.deleteUnit = new DeleteUnit(repository);
  }

  create(input: CreateUnitInput): Promise<Unit> {
    return this.createUnit.execute(input);
  }

  update(id: string, input: UpdateUnitInput): Promise<Unit> {
    return this.updateUnit.execute(id, input);
  }

  delete(id: string): Promise<void> {
    return this.deleteUnit.execute(id);
  }

  getAllUnits(): Promise<Unit[]> {
    return this.repository.findMany();
  }

  async getUnit(id: string): Promise<Unit> {
    const unit = await this.repository.findById(id);
    if (!unit) {
      throw new UnitNotFoundError(id);
    }
    return unit;
  }
}

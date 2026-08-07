import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseFilters,
} from '@nestjs/common';
import type { Unit } from '@ananya/inventory';
import { CreateUnitDto } from './create-unit.dto';
import { UpdateUnitDto } from './update-unit.dto';
import { UnitsService } from './units.service';
import { UnitExceptionFilter } from './unit-exception.filter';

@Controller('units')
@UseFilters(UnitExceptionFilter)
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Post()
  create(@Body() input: CreateUnitDto): Promise<Unit> {
    return this.unitsService.create(input);
  }

  @Get()
  getAll(): Promise<Unit[]> {
    return this.unitsService.getAllUnits();
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<Unit> {
    return this.unitsService.getUnit(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() input: UpdateUnitDto): Promise<Unit> {
    return this.unitsService.update(id, input);
  }

  @Patch(':id')
  patch(@Param('id') id: string, @Body() input: UpdateUnitDto): Promise<Unit> {
    return this.unitsService.update(id, input);
  }

  @Delete(':id')
  delete(@Param('id') id: string): Promise<void> {
    return this.unitsService.delete(id);
  }
}

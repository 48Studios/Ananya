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
  UseGuards,
} from '@nestjs/common';
import type { Unit } from '@ananya/inventory';
import { CreateUnitDto } from './create-unit.dto';
import { UpdateUnitDto } from './update-unit.dto';
import { UnitsService } from './units.service';
import { UnitExceptionFilter } from './unit-exception.filter';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('units')
@UseFilters(UnitExceptionFilter)
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Post()
  @UseGuards(createPermissionGuard('Inventory.Create'))
  create(@Body() input: CreateUnitDto): Promise<Unit> {
    return this.unitsService.create(input);
  }

  @Get()
  @UseGuards(createPermissionGuard('Inventory.Read'))
  getAll(): Promise<Unit[]> {
    return this.unitsService.getAllUnits();
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('Inventory.Read'))
  get(@Param('id') id: string): Promise<Unit> {
    return this.unitsService.getUnit(id);
  }

  @Put(':id')
  @UseGuards(createPermissionGuard('Inventory.Update'))
  update(@Param('id') id: string, @Body() input: UpdateUnitDto): Promise<Unit> {
    return this.unitsService.update(id, input);
  }

  @Patch(':id')
  @UseGuards(createPermissionGuard('Inventory.Update'))
  patch(@Param('id') id: string, @Body() input: UpdateUnitDto): Promise<Unit> {
    return this.unitsService.update(id, input);
  }

  @Delete(':id')
  @UseGuards(createPermissionGuard('Inventory.Update'))
  delete(@Param('id') id: string): Promise<void> {
    return this.unitsService.delete(id);
  }
}

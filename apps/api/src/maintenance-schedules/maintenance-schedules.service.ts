import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  MaintenanceSchedule,
  MaintenanceScheduleRepository,
  MaintenanceStatus,
  ServiceFrequency,
} from '@ananya/service';
import { CreateMaintenanceScheduleDto } from './dtos';
import { CustomersService } from '../customers/customers.service';

export const MAINTENANCE_SCHEDULE_REPOSITORY =
  'MAINTENANCE_SCHEDULE_REPOSITORY';

@Injectable()
export class MaintenanceSchedulesService {
  constructor(
    @Inject(MAINTENANCE_SCHEDULE_REPOSITORY)
    private readonly maintenanceScheduleRepository: MaintenanceScheduleRepository,
    private readonly customersService: CustomersService,
  ) {}

  async create(
    dto: CreateMaintenanceScheduleDto,
  ): Promise<MaintenanceSchedule> {
    await this.customersService.findOne(dto.customerId);
    const scheduleNumber =
      await this.maintenanceScheduleRepository.generateNextScheduleNumber();
    const schedule = MaintenanceSchedule.create({
      scheduleNumber,
      customerId: dto.customerId,
      assetName: dto.assetName,
      serialNumber: dto.serialNumber,
      frequency: dto.frequency,
      nextVisitDate: new Date(dto.nextVisitDate),
      assignedTechnician: dto.assignedTechnician,
      notes: dto.notes,
    });
    await this.maintenanceScheduleRepository.save(schedule);
    return schedule;
  }

  async findAll(
    customerId?: string,
    assignedTechnician?: string,
    status?: MaintenanceStatus,
    frequency?: ServiceFrequency,
    search?: string,
  ): Promise<MaintenanceSchedule[]> {
    return this.maintenanceScheduleRepository.findMany({
      customerId,
      assignedTechnician,
      status,
      frequency,
      search,
    });
  }

  async findOne(id: string): Promise<MaintenanceSchedule> {
    const schedule = await this.maintenanceScheduleRepository.findById(id);
    if (!schedule) {
      throw new NotFoundException(
        `Maintenance Schedule with ID ${id} not found.`,
      );
    }
    return schedule;
  }

  async pause(id: string): Promise<MaintenanceSchedule> {
    const schedule = await this.findOne(id);
    schedule.pause();
    await this.maintenanceScheduleRepository.save(schedule);
    return schedule;
  }

  async resume(id: string): Promise<MaintenanceSchedule> {
    const schedule = await this.findOne(id);
    schedule.resume();
    await this.maintenanceScheduleRepository.save(schedule);
    return schedule;
  }

  async completeVisit(id: string): Promise<MaintenanceSchedule> {
    const schedule = await this.findOne(id);
    schedule.completeVisit();
    await this.maintenanceScheduleRepository.save(schedule);
    return schedule;
  }

  async completePlan(id: string): Promise<MaintenanceSchedule> {
    const schedule = await this.findOne(id);
    schedule.completePlan();
    await this.maintenanceScheduleRepository.save(schedule);
    return schedule;
  }

  async cancel(id: string): Promise<MaintenanceSchedule> {
    const schedule = await this.findOne(id);
    schedule.cancel();
    await this.maintenanceScheduleRepository.save(schedule);
    return schedule;
  }
}

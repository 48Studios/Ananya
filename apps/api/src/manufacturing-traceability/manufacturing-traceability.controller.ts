import { Controller, Get, Param, Query } from '@nestjs/common';
import { ManufacturingTraceabilityService } from './manufacturing-traceability.service';

@Controller('traceability')
export class ManufacturingTraceabilityController {
  constructor(
    private readonly traceabilityService: ManufacturingTraceabilityService,
  ) {}

  @Get('forward')
  forwardTrace(
    @Query('batchNumber') batchNumber?: string,
    @Query('serialNumber') serialNumber?: string,
    @Query('componentId') componentId?: string,
  ) {
    return this.traceabilityService.forwardTrace(
      batchNumber,
      serialNumber,
      componentId,
    );
  }

  @Get('backward')
  backwardTrace(
    @Query('batchNumber') batchNumber?: string,
    @Query('serialNumber') serialNumber?: string,
    @Query('componentId') componentId?: string,
  ) {
    return this.traceabilityService.backwardTrace(
      batchNumber,
      serialNumber,
      componentId,
    );
  }

  @Get('production-order/:id')
  findByProductionOrder(@Param('id') id: string) {
    return this.traceabilityService.findByProductionOrder(id);
  }
}

import { Controller, Get } from '@nestjs/common';
import { ReportingService } from './reporting.service';

@Controller('reporting')
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  @Get('overview')
  getOverviewMetrics() {
    return this.reportingService.getOverviewMetrics();
  }

  @Get('inventory-summary')
  getInventorySummary() {
    return this.reportingService.getInventorySummary();
  }

  @Get('procurement-summary')
  getProcurementSummary() {
    return this.reportingService.getProcurementSummary();
  }

  @Get('manufacturing-summary')
  getManufacturingSummary() {
    return this.reportingService.getManufacturingSummary();
  }

  @Get('project-summary')
  getProjectSummary() {
    return this.reportingService.getProjectSummary();
  }

  @Get('transaction-summary')
  getTransactionSummary() {
    return this.reportingService.getTransactionSummary();
  }
}

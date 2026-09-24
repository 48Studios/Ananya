import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { BulkActionService } from './bulk-action.service';
import { BulkActionDto } from './dtos';
import type {
  BulkActionResultDto,
  BulkActionSupportDto,
} from './bulk-action.dtos';

/**
 * Bulk actions on selected records, kept separate from the import/export
 * controller so the file-transfer routes stay readable. Same route prefix, so
 * the existing client paths (`POST /import-export/bulk-action`) are unchanged.
 */
@Controller('import-export')
export class BulkActionsController {
  constructor(private readonly bulkActionService: BulkActionService) {}

  /**
   * What the toolbar is allowed to offer for one entity type. The frontend
   * renders actions from this list, so an action that has no real mutation
   * behind it is never shown.
   */
  @Get('bulk-actions/:entityType')
  getSupportedActions(
    @Param('entityType') entityType: string,
  ): BulkActionSupportDto {
    return this.bulkActionService.getSupport(entityType);
  }

  @Post('bulk-action')
  executeBulkAction(@Body() dto: BulkActionDto): Promise<BulkActionResultDto> {
    return this.bulkActionService.execute(dto);
  }
}

import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { MlService } from './ml.service';
import { MlClientService } from './ml-client.service';
import {
  SuggestComponentDto,
  ComponentSuggestionResponseDto,
  CreateMlFeedbackDto,
  ExportFeedbackQueryDto,
  ReviewQuarantineRecordDto,
  QuarantineFilterQueryDto,
} from './dtos';

@Controller('ml')
export class MlController {
  constructor(
    private readonly mlService: MlService,
    private readonly mlClient: MlClientService,
  ) {}

  @Get('health')
  async health() {
    const isServiceHealthy = await this.mlClient.health();
    return {
      status: 'ok',
      mlServiceEnabled: this.mlClient.enabled,
      mlServiceReachable: isServiceHealthy,
    };
  }

  @Post('suggest')
  suggest(
    @Body() input: SuggestComponentDto,
  ): Promise<ComponentSuggestionResponseDto> {
    return this.mlService.suggest(input);
  }

  @Post('feedback')
  recordFeedback(
    @Body() input: CreateMlFeedbackDto,
    @Req() req: { user?: { id?: string; email?: string } },
  ) {
    const user = req?.user || {};
    return this.mlService.recordFeedback(input, user);
  }

  @Get('feedback/export')
  exportFeedback(@Query() query: ExportFeedbackQueryDto) {
    return this.mlService.exportFeedbackDataset(query);
  }

  @Get('training/quarantine')
  getQuarantine(@Query() query: QuarantineFilterQueryDto) {
    return this.mlService.getQuarantinedRecords(query);
  }

  @Post('training/quarantine/:id/review')
  reviewQuarantine(
    @Param('id') id: string,
    @Body() input: ReviewQuarantineRecordDto,
    @Req() req: { user?: { id?: string; email?: string } },
  ) {
    const user = req?.user || {};
    return this.mlService.reviewQuarantinedRecord(id, input, user);
  }
}

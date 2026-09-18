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
  SuggestAttributeBindingsDto,
  SuggestAttributeBindingsResponseDto,
  SuggestCategoryAttributesDto,
  SuggestCategoryAttributesResponseDto,
  SuggestAttributeConfigDto,
  SuggestAttributeConfigResponseDto,
  DetectAttributeDuplicatesDto,
  DetectAttributeDuplicatesResponseDto,
  SuggestEnumValuesDto,
  SuggestEnumValuesResponseDto,
  AuditAttributeLibraryResponseDto,
  ApplySuggestedBindingDto,
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

  // ---------------------------------------------------------
  // Attribute Intelligence Endpoints (RFC-0059)
  // ---------------------------------------------------------

  @Post('attributes/suggest-bindings')
  suggestAttributeBindings(
    @Body() input: SuggestAttributeBindingsDto,
  ): Promise<SuggestAttributeBindingsResponseDto> {
    return this.mlService.suggestAttributeBindings(input);
  }

  @Post('attributes/suggest-category-attributes')
  suggestCategoryAttributes(
    @Body() input: SuggestCategoryAttributesDto,
  ): Promise<SuggestCategoryAttributesResponseDto> {
    return this.mlService.suggestCategoryAttributes(input);
  }

  @Post('attributes/suggest-config')
  suggestAttributeConfig(
    @Body() input: SuggestAttributeConfigDto,
  ): Promise<SuggestAttributeConfigResponseDto> {
    return this.mlService.suggestAttributeConfig(input);
  }

  @Post('attributes/detect-duplicates')
  detectAttributeDuplicates(
    @Body() input: DetectAttributeDuplicatesDto,
  ): Promise<DetectAttributeDuplicatesResponseDto> {
    return this.mlService.detectAttributeDuplicates(input);
  }

  @Post('attributes/suggest-enum-values')
  suggestEnumValues(
    @Body() input: SuggestEnumValuesDto,
  ): Promise<SuggestEnumValuesResponseDto> {
    return this.mlService.suggestEnumValues(input);
  }

  @Post('attributes/audit')
  auditAttributeLibrary(): Promise<AuditAttributeLibraryResponseDto> {
    return this.mlService.auditAttributeLibrary();
  }

  @Get('attributes/review-queue')
  getReviewQueue() {
    return this.mlService.getReviewQueue();
  }

  @Post('attributes/apply-bindings')
  applySuggestedBindings(
    @Body() input: ApplySuggestedBindingDto,
    @Req() req: { user?: { id?: string; email?: string } },
  ) {
    const user = req?.user || {};
    return this.mlService.applySuggestedBindings(input, user);
  }
}

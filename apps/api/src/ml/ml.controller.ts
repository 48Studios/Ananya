import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MlService } from './ml.service';
import { MlClientService } from './ml-client.service';
import { AttributeWriteGuard } from '../auth/attribute-permissions';
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
  /**
   * Legacy ML surface.
   *
   * Route security audit (Pass 3):
   *
   *  - `GET /ml/health` — read-only, no data access.  
   *  - `POST /ml/suggest`, `POST /ml/attributes/suggest-*`,
   *    `POST /ml/attributes/detect-duplicates`, `POST /ml/attributes/audit` —
   *    read-only computation: they read ERP rows and return suggestions without
   *    writing anything, so they remain open like the rest of the API's read
   *    endpoints.
   *  - `POST /ml/attributes/apply-bindings` — MUTATION (inserts `category_attributes`).
   *    Now guarded with `AttributeWriteGuard` (`Inventory.Update`).
   *  - `GET /ml/attributes/review-queue` — REMOVED. It recomputed the whole
   *    library audit on every call and regenerated unstable ids. The persisted
   *    queue at `/ml/attributes/review-queue` (AttributeReviewQueueController) is
   *    its replacement.
   *  - `POST /ml/feedback`, `POST /ml/attributes/feedback`, `GET /ml/feedback/export`,
   *    `GET/POST /ml/training/quarantine*` — the generic telemetry and training
   *    surface, shared by every domain (component suggestions included). They are
   *    NOT attribute-intelligence routes and were left unchanged in this pass;
   *    guarding them is a separate decision because it would affect component
   *    flows too.
   */
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

  /**
   * Applies suggested category bindings.
   *
   * This is the one legacy attribute-intelligence route that MUTATES
   * authoritative data: it inserts `category_attributes` rows directly. It was
   * previously unauthenticated, so any caller could create bindings; it now
   * requires `Inventory.Update`, the permission that already gates attribute and
   * component master-data edits.
   *
   * The endpoint's behaviour is otherwise unchanged — resolving and persisting
   * findings is a separate route (`/ml/attributes/review-queue/audit`) and does not
   * apply anything.
   */
  @Post('attributes/apply-bindings')
  @UseGuards(AttributeWriteGuard)
  applySuggestedBindings(
    @Body() input: ApplySuggestedBindingDto,
    @Req() req: { user?: { id?: string; email?: string } },
  ) {
    const user = req?.user || {};
    return this.mlService.applySuggestedBindings(input, user);
  }

  @Post('attributes/feedback')
  recordAttributeFeedback(
    @Body() input: CreateMlFeedbackDto,
    @Req() req: { user?: { id?: string; email?: string } },
  ) {
    const user = req?.user || {};
    return this.mlService.recordFeedback(input, user);
  }
}

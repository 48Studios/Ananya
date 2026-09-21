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
import { MlReadGuard, MlWriteGuard } from '../auth/ml-permissions';
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
   * Legacy ML surface — complete route security audit.
   *
   * Pass 3 guarded `apply-bindings` and left the rest open on the reasoning that a
   * compute-only route is a read. Pass 5 completed the audit and found three gaps
   * that reasoning missed: unauthenticated model inference (abuse/cost), unguarded
   * ERP reads (information disclosure), and unguarded telemetry/training writes
   * (feedback poisoning and training contamination).
   *
   * Every route, its classification and its guard:
   *
   * | Route | Class | Guard |
   * | --- | --- | --- |
   * | `GET  /ml/health` | PUBLIC HEALTH | none — see below |
   * | `POST /ml/suggest` | DEPRECATED, authenticated read/compute | `MlReadGuard` |
   * | `POST /ml/feedback` | AUTHENTICATED WRITE | `MlWriteGuard` |
   * | `GET  /ml/feedback/export` | AUTHENTICATED READ | `MlReadGuard` |
   * | `GET  /ml/training/quarantine` | AUTHENTICATED READ | `MlReadGuard` |
   * | `POST /ml/training/quarantine/:id/review` | AUTHENTICATED WRITE | `MlWriteGuard` |
   * | `POST /ml/attributes/suggest-*` | AUTHENTICATED READ/COMPUTE | `MlReadGuard` |
   * | `POST /ml/attributes/detect-duplicates` | AUTHENTICATED READ/COMPUTE | `MlReadGuard` |
   * | `POST /ml/attributes/suggest-enum-values` | AUTHENTICATED READ/COMPUTE | `MlReadGuard` |
   * | `POST /ml/attributes/audit` | DEPRECATED, authenticated read/compute | `MlReadGuard` |
   * | `POST /ml/attributes/apply-bindings` | AUTHENTICATED WRITE | `AttributeWriteGuard` |
   * | `POST /ml/attributes/feedback` | AUTHENTICATED WRITE | `MlWriteGuard` |
   *
   * **Why `GET /ml/health` stays public.** It returns three booleans — a static
   * `status`, whether ML is enabled by configuration, and whether the Python
   * service answered a probe. It reads no ERP row, writes nothing, and performs no
   * inference; the probe it forwards is a single `GET /health` on the ML service.
   * Liveness endpoints are used by orchestrators before a session exists, so
   * requiring a token would make them useless for their purpose. The information it
   * discloses is that the deployment has an ML service, which the presence of the
   * `/ml/*` namespace already implies.
   *
   * **Deprecated but retained.** `POST /ml/suggest` and `POST /ml/attributes/audit`
   * have no callers left: the web client uses `POST /components/suggest`, and the
   * persisted review queue's `POST /ml/attributes/review-queue/audit` replaced the
   * audit route in Pass 3. They are guarded rather than deleted because the
   * repository has not established that they are dead for external consumers, and
   * `docs/rfcs/0059-attribute-intelligence-v1.md` still documents the audit route.
   *
   * **Known remaining gap, deliberately not fixed here.** `POST /components/suggest`
   * and `POST /components/suggest/feedback` (in `ComponentsController`) call the
   * same `MlService` methods through a different path, and that controller has no
   * guards at all. Guarding the `/ml/*` aliases therefore does not close the
   * feedback write by itself. Those routes belong to the component surface, which
   * this pass was explicitly told not to change; closing them is recorded as the
   * highest-priority item for the next pass.
   */
  constructor(
    private readonly mlService: MlService,
    private readonly mlClient: MlClientService,
  ) {}

  /**
   * Liveness probe for the Python ML service.
   *
   * Public by design: no ERP data, no write, no inference. See the class audit.
   */
  @Get('health')
  async health() {
    const isServiceHealthy = await this.mlClient.health();
    return {
      status: 'ok',
      mlServiceEnabled: this.mlClient.enabled,
      mlServiceReachable: isServiceHealthy,
    };
  }

  /**
   * Legacy component-suggestion route.
   *
   * Superseded by `POST /components/suggest`, which the web client uses. It reads
   * categories, manufacturers and existing components and can make an outbound
   * model call, so it is a read that costs money — hence `Inventory.Read`.
   */
  @Post('suggest')
  @UseGuards(MlReadGuard)
  suggest(
    @Body() input: SuggestComponentDto,
  ): Promise<ComponentSuggestionResponseDto> {
    return this.mlService.suggest(input);
  }

  /**
   * Records AI suggestion telemetry.
   *
   * Writes `ai_suggestion_feedback`, the labeled dataset behind model retraining.
   * The actor is taken from the authenticated session; the request body carries no
   * reviewer field, and `forbidNonWhitelisted` rejects one if supplied, so a
   * spoofed identity cannot be recorded.
   */
  @Post('feedback')
  @UseGuards(MlWriteGuard)
  recordFeedback(
    @Body() input: CreateMlFeedbackDto,
    @Req() req: { user?: { id?: string; email?: string } },
  ) {
    const user = req?.user || {};
    return this.mlService.recordFeedback(input, user);
  }

  /**
   * Exports the labeled feedback dataset.
   *
   * Returns up to 1000 rows including `creationContext`, `finalValue` and
   * `evidence` — internal ERP context and reviewer decisions. A read, but a
   * sensitive one, so it requires the same permission as reading inventory.
   */
  @Get('feedback/export')
  @UseGuards(MlReadGuard)
  exportFeedback(@Query() query: ExportFeedbackQueryDto) {
    return this.mlService.exportFeedbackDataset(query);
  }

  /**
   * Lists quarantined training records.
   *
   * Reads `apps/ml/data/quarantine.json`, whose records contain full component
   * payloads and the reasons they were rejected from the training set.
   */
  @Get('training/quarantine')
  @UseGuards(MlReadGuard)
  getQuarantine(@Query() query: QuarantineFilterQueryDto) {
    return this.mlService.getQuarantinedRecords(query);
  }

  /**
   * Reviews one quarantined training record.
   *
   * The most consequential route on this controller: it rewrites the quarantine
   * file and, on `VERIFIED`, appends the record to `validated_records.json` — the
   * dataset the model is trained from. An unauthenticated caller could therefore
   * inject arbitrary records into the training set, so this is a write and is
   * guarded as one.
   */
  @Post('training/quarantine/:id/review')
  @UseGuards(MlWriteGuard)
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
  @UseGuards(MlReadGuard)
  suggestAttributeBindings(
    @Body() input: SuggestAttributeBindingsDto,
  ): Promise<SuggestAttributeBindingsResponseDto> {
    return this.mlService.suggestAttributeBindings(input);
  }

  @Post('attributes/suggest-category-attributes')
  @UseGuards(MlReadGuard)
  suggestCategoryAttributes(
    @Body() input: SuggestCategoryAttributesDto,
  ): Promise<SuggestCategoryAttributesResponseDto> {
    return this.mlService.suggestCategoryAttributes(input);
  }

  @Post('attributes/suggest-config')
  @UseGuards(MlReadGuard)
  suggestAttributeConfig(
    @Body() input: SuggestAttributeConfigDto,
  ): Promise<SuggestAttributeConfigResponseDto> {
    return this.mlService.suggestAttributeConfig(input);
  }

  @Post('attributes/detect-duplicates')
  @UseGuards(MlReadGuard)
  detectAttributeDuplicates(
    @Body() input: DetectAttributeDuplicatesDto,
  ): Promise<DetectAttributeDuplicatesResponseDto> {
    return this.mlService.detectAttributeDuplicates(input);
  }

  @Post('attributes/suggest-enum-values')
  @UseGuards(MlReadGuard)
  suggestEnumValues(
    @Body() input: SuggestEnumValuesDto,
  ): Promise<SuggestEnumValuesResponseDto> {
    return this.mlService.suggestEnumValues(input);
  }

  /**
   * Runs the legacy whole-library audit and returns its issues.
   *
   * Deprecated: the persisted review queue's `POST /ml/attributes/review-queue/audit`
   * is the replacement, because this route recomputes the audit and persists
   * nothing. It is retained and guarded rather than removed because RFC-0059 still
   * documents it and the repository has not established it is dead for external
   * callers. Compute only — it writes no row — but it is the most expensive route
   * here, so it requires `Inventory.Read` like the other reads.
   */
  @Post('attributes/audit')
  @UseGuards(MlReadGuard)
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

  /**
   * Records attribute-intelligence telemetry.
   *
   * Same write as `POST /ml/feedback`, reached from the attribute dialogs. The
   * actor comes from the session, never the body.
   */
  @Post('attributes/feedback')
  @UseGuards(MlWriteGuard)
  recordAttributeFeedback(
    @Body() input: CreateMlFeedbackDto,
    @Req() req: { user?: { id?: string; email?: string } },
  ) {
    const user = req?.user || {};
    return this.mlService.recordFeedback(input, user);
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MlAdminGuard } from '../../auth/ml-permissions';
import type { AuthenticatedRequest } from '../../auth/permission.guard';
import { MlOpsService } from './ml-ops.service';
import type { MlOpsActor } from './ml-ops.service';
import {
  DeployCandidateDto,
  ListTrainingRunsQueryDto,
  TriggerTrainingRunDto,
} from './ml-ops.dtos';

/**
 * Rejects any field on a request whose contract accepts none.
 *
 * The global `ValidationPipe` already does this via `forbidNonWhitelisted`, so this
 * is defence in depth: the point is that a caller cannot even *express* a training
 * argument — no version, no dataset, no path, no hyperparameter, no actor. It runs
 * before the service, so the rejection is a 400 rather than something the pipeline
 * might act on.
 */
function assertNoRequestFields(body: unknown, operation: string): void {
  const keys = Object.keys(body ?? {});
  if (keys.length > 0) {
    throw new BadRequestException(
      `${operation} accepts no request parameters; received: ${keys.join(', ')}`,
    );
  }
}

/**
 * ML Operations — the operator control plane.
 *
 * ### Why every route here is administrator-only
 *
 * `MlAdminGuard` (`Administration.Roles`) is the boundary the ML training surface
 * already uses for `GET /ml/feedback/export`, `GET /ml/training/quarantine` and
 * `POST /ml/training/quarantine/:id/review`. This controller extends that same
 * boundary to the rest of the training lifecycle rather than inventing a new one:
 *
 *  - **Not `Inventory.Update`.** That permission is held by the `Inventory
 *    Manager` role, which legitimately edits master data. Triggering a retrain and
 *    promoting a model changes the behaviour of the intelligence that advises
 *    every future edit — a materially different capability from editing a row.
 *  - **Not `Administration.Security`.** The read-only `Auditor` role holds it, and
 *    it would hand model promotion to auditors.
 *  - **Reads are admin-only too, deliberately.** The registry listing, dataset
 *    counts and quarantine breakdown are operational detail about the model, and
 *    the page that consumes them already sits behind `Administration.Settings` in
 *    the web app. A dedicated `Administration.ML` permission would be more precise
 *    but does not exist in the catalogue; adding one would require revisiting every
 *    role definition, so the existing administrator-only boundary is used and the
 *    gap is recorded in `docs/ML_OPERATIONS.md`.
 *
 * ### Actor identity
 *
 * Every mutation reads the actor from `req.user`, which the guard populated from the
 * authenticated session. No request body carries an actor id or email, and the
 * global `forbidNonWhitelisted` pipe rejects one if it is supplied — the DTOs here
 * are empty classes precisely so that a stray field is a 400 rather than something
 * that is silently ignored.
 */
@Controller('ml/ops')
export class MlOpsController {
  constructor(private readonly mlOpsService: MlOpsService) {}

  private actor(req: AuthenticatedRequest): MlOpsActor {
    return { id: req.user?.id ?? null, email: req.user?.email ?? null };
  }

  /** Health of the ML service, the running model and the active run. */
  @Get('health')
  @UseGuards(MlAdminGuard)
  health() {
    return this.mlOpsService.getHealth();
  }

  /** Everything the overview tab shows, in one request. */
  @Get('overview')
  @UseGuards(MlAdminGuard)
  overview() {
    return this.mlOpsService.getOverview();
  }

  /** Registry versions, the production artifact and the deployment history. */
  @Get('models')
  @UseGuards(MlAdminGuard)
  models() {
    return this.mlOpsService.getModels();
  }

  /** Current dataset snapshot, quality counts and snapshot history. */
  @Get('datasets')
  @UseGuards(MlAdminGuard)
  datasets() {
    return this.mlOpsService.getDataset();
  }

  /** Feedback, findings and training totals, aggregated server-side. */
  @Get('usage')
  @UseGuards(MlAdminGuard)
  usage() {
    return this.mlOpsService.getUsage();
  }

  /** Paginated training history. Never unbounded. */
  @Get('training-runs')
  @UseGuards(MlAdminGuard)
  listTrainingRuns(@Query() query: ListTrainingRunsQueryDto) {
    return this.mlOpsService.listTrainingRuns(query);
  }

  @Get('training-runs/:id')
  @UseGuards(MlAdminGuard)
  getTrainingRun(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.mlOpsService.getTrainingRun(id);
  }

  /**
   * Starts a training run.
   *
   * Returns as soon as the job is dispatched — training continues on the ML side, so
   * closing the browser does not stop it.
   */
  @Post('training-runs')
  @UseGuards(MlAdminGuard)
  triggerTrainingRun(
    @Req() req: AuthenticatedRequest,
    @Body() body: TriggerTrainingRunDto,
  ) {
    assertNoRequestFields(body, 'Triggering a training run');
    return this.mlOpsService.triggerTrainingRun(this.actor(req));
  }

  /**
   * Promotes the candidate produced by a run.
   *
   * Refused unless the run passed every gate, the artifact exists and no earlier
   * deployment of the same candidate is recorded. `expectedCandidateVersion` is an
   * optional revision gate: the dashboard sends the version it displayed, so a
   * candidate that changed under the operator's feet is refused instead of silently
   * promoting something else.
   */
  @Post('training-runs/:id/deploy')
  @UseGuards(MlAdminGuard)
  deployCandidate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: DeployCandidateDto,
  ) {
    return this.mlOpsService.deployCandidate(id, this.actor(req), body);
  }

  /**
   * Restores the previous production artifact.
   *
   * Available because the existing promotion tool keeps a backup and implements the
   * restore; refused with `NO_ROLLBACK_ARTIFACT` when it does not.
   */
  @Post('models/rollback')
  @UseGuards(MlAdminGuard)
  rollback(@Req() req: AuthenticatedRequest) {
    return this.mlOpsService.rollback(this.actor(req));
  }

  /**
   * Re-reads the production artifact into the running ML process.
   *
   * Writes nothing and changes no version. It exists so a `reloadPending` state —
   * artifact deployed, running process still serving the old model — can be closed
   * without restarting the ML container.
   */
  @Post('models/reload')
  @UseGuards(MlAdminGuard)
  reload(@Req() req: AuthenticatedRequest) {
    return this.mlOpsService.reloadModel(this.actor(req));
  }
}

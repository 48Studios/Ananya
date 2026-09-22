import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { db } from '@ananya/database';
import {
  aiSuggestionFeedback,
  mlModelDeployments,
  mlTrainingRuns,
  securityAuditLogs,
} from '@ananya/database/schema';
import { eq, inArray } from '@ananya/database/query';
import { closeDatabaseConnection } from '@ananya/database';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { RolesService } from '../../src/roles/roles.service';
import { UsersService } from '../../src/users/users.service';
import { MlService } from '../../src/ml/ml.service';
import { MlClientService } from '../../src/ml/ml-client.service';
import type { MlOpsCallOutcome } from '../../src/ml/ml-client.service';
import {
  ActiveTrainingRunExistsError,
  MlOpsRepository,
} from '../../src/ml/ops/ml-ops.repository';
import type { TrainingRunUpdate } from '../../src/ml/ops/ml-ops.repository';
import { FixtureOwner } from '../fixtures/fixture-owner';

/**
 * ML Operations control plane — HTTP-level integration suite.
 *
 * Proves the properties the dashboard's safety argument rests on, at the boundary
 * a real client sees: authorisation, server-derived actor identity, one active run,
 * asynchronous dispatch, history, dataset summary, and — most importantly — that a
 * candidate which did not pass its gates can never be promoted, and that a failed
 * training run leaves the production model untouched.
 *
 * The ML service is stubbed at the `MlClientService` boundary (the same technique
 * `ml-surface-security.integration-spec.ts` uses for outbound model calls), so
 * routes, guards, validation, persistence and audit are all real while the
 * pipeline itself is not executed here. The pipeline's own behaviour is covered by
 * `apps/ml/tests/test_training_runner.py`.
 */
/*
 * The stubs below replace methods on `MlClientService` whose signatures return
 * promises. Returning the outcome object directly (rather than wrapping it in
 * `async`) keeps each stub a one-liner; the service awaits the value either way.
 * The `require-await` rule exists to catch a forgotten `await` in production code,
 * which cannot happen in a stub that deliberately returns a resolved value.
 */
/* eslint-disable @typescript-eslint/require-await */

describe('ML operations — training control plane', () => {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  const owner = new FixtureOwner('mlops');
  const createdRunIds: string[] = [];
  const createdDeploymentIds: string[] = [];

  let app: INestApplication;
  let mlClient: MlClientService;
  let repository: MlOpsRepository;
  let mlService: MlService;

  let adminToken = '';
  let adminEmail = '';
  let managerToken = '';

  /** Call counters, so "poll only while active" is provable rather than assumed. */
  let statusCalls = 0;
  let deployCalls = 0;
  let startCalls = 0;

  const originalMethods: Partial<Record<keyof MlClientService, unknown>> = {};

  function http() {
    return request(app.getHttpServer() as Parameters<typeof request>[0]);
  }

  function body<T>(response: { body: unknown }): T {
    return response.body as T;
  }

  /**
   * Replaces the ML boundary for the duration of a test.
   *
   * Each stub is restored in `afterAll`; the originals are captured once so a test
   * that overrides only some methods does not leave a stub behind for the next one.
   */
  function stubMl(overrides: Partial<Record<keyof MlClientService, unknown>>) {
    for (const [key, value] of Object.entries(overrides)) {
      (mlClient as unknown as Record<string, unknown>)[key] = value;
    }
  }

  function restoreMl() {
    for (const [key, value] of Object.entries(originalMethods)) {
      (mlClient as unknown as Record<string, unknown>)[key] = value;
    }
  }

  const ok = <T>(data: T): MlOpsCallOutcome<T> => ({ ok: true, data });

  const modelRegistryPayload = () => ({
    active: {
      deployedVersion: '1.5.0',
      artifactVersion: '1.5.0',
      artifactVersionSource: 'CHECKSUM' as const,
      deployedAt: '2026-09-18T18:28:01Z',
      qualityGatesPassed: true,
      artifactSha256: 'a'.repeat(64),
      artifactSizeBytes: 226628,
      rollbackAvailable: true,
      backupSha256: 'b'.repeat(64),
    },
    running: {
      loaded: true,
      loadedAt: '2026-09-18T18:28:02Z',
      artifactSha256: 'a'.repeat(64),
      activeVersion: '1.5.0',
      versionSource: 'CHECKSUM' as const,
      recordedActiveVersion: '1.5.0',
    },
    versions: [
      {
        version: '1.5.1',
        createdAt: '2026-09-22T09:00:00Z',
        artifactExists: true,
        artifactSha256: 'c'.repeat(64),
        artifactSizeBytes: 226628,
        championModel: 'char_ngram_model',
        evaluation: {
          promotionEligible: true,
          metrics: { candidateTop1Accuracy: 0.7143 },
          qualityGates: { accuracy_gate: true },
          thresholds: {
            accuracy_gate: {
              description: 'Top-1 accuracy at least 70%',
              minimum: 0.7,
            },
          },
        },
        datasetVersion: 'components-2026-09-22-v1.5.1',
        deployable: true,
      },
    ],
  });

  const runnerPayload = (overrides: Record<string, unknown> = {}) => ({
    runId: 'ignored-by-stub',
    status: 'PASSED',
    phase: 'COMPLETED',
    queuedAt: '2026-09-22T09:00:00Z',
    startedAt: '2026-09-22T09:00:00Z',
    completedAt: '2026-09-22T09:00:02Z',
    durationMs: 2000,
    candidateVersion: '1.5.1',
    baseModelVersion: '1.5.0',
    pipelineVersion: 'rfc-0058',
    datasetVersion: 'components-2026-09-22-v1.5.1',
    datasetFingerprint: 'f'.repeat(64),
    datasetRecordCount: 25,
    feedbackRecordCount: 0,
    trainingRecordCount: 30,
    validationRecordCount: 7,
    quarantineRecordCount: 0,
    evaluationSummary: {
      candidateTop1Accuracy: 0.7143,
      candidateTop3Accuracy: 0.7143,
      activeModelTop1Accuracy: 0.7143,
      duplicatePrecision: 1,
      duplicateRecall: 1,
      criticalFalsePositives: 0,
      latencyMs: { p50: 0.2, p95: 0.25, p99: 0.26 },
      peakMemoryMb: 143.2,
      modelSizeBytes: 226628,
      unverifiedProvenanceCount: 0,
    },
    gateSummary: {
      gates: {
        accuracy_gate: true,
        duplicate_precision_gate: true,
        duplicate_recall_gate: true,
        latency_gate: true,
        memory_gate: true,
        provenance_gate: true,
      },
      thresholds: {
        accuracy_gate: {
          description:
            'Top-1 accuracy at least 70% and no more than 5 points below the active model',
          minimum: 0.7,
        },
      },
      promotionEligible: true,
    },
    errorCode: null,
    errorMessage: null,
    artifactReference: 'registry/v1.5.1',
    log: ['2026-09-22T09:00:00Z Collecting authoritative records'],
    cancellable: false,
    ...overrides,
  });

  const datasetPayload = () => ({
    current: {
      datasetVersion: 'components-2026-09-22-v1.5.1',
      createdAt: new Date().toISOString(),
      fingerprint: 'f'.repeat(64),
      totalSourceRecords: 25,
      totalExpandedExamples: 37,
      trainSize: 30,
      valSize: 7,
      duplicatePairsCount: 57,
      distinctBaseFamilies: 23,
      dataLeakageVerified: true,
      overlapCount: 0,
      categories: ['Capacitors', 'Resistors'],
    },
    snapshots: [
      {
        datasetVersion: 'components-2026-09-22-v1.5.1',
        createdAt: '2026-09-22T09:00:00Z',
        totalSourceRecords: 25,
        trainSize: 30,
        valSize: 7,
      },
    ],
    quarantine: {
      available: true,
      total: 3,
      pending: 3,
      verified: 0,
      rejected: 0,
      byReason: [
        { reason: 'CONFLICT', count: 2 },
        { reason: 'MISSING_CRITICAL_IDENTIFIER', count: 1 },
      ],
      truncated: false,
    },
    distribution: {
      recordCount: 25,
      distinctManufacturers: 12,
      distinctBaseFamilies: 23,
      categories: [{ name: 'Resistors', count: 10 }],
      manufacturers: [{ name: 'Murata Manufacturing', count: 6 }],
      truncated: false,
    },
  });

  beforeAll(async () => {
    if (!hasDbUrl) return;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mirrors main.ts, so whitelist rejection behaves as it does in production.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    mlClient = app.get(MlClientService);
    repository = app.get(MlOpsRepository);
    mlService = app.get(MlService);

    for (const key of [
      'mlOpsReady',
      'mlOpsModels',
      'mlOpsDataset',
      'mlOpsStartTrainingRun',
      'mlOpsTrainingRun',
      'mlOpsDeployCandidate',
      'mlOpsRollback',
      'mlOpsReloadModel',
    ] as const) {
      originalMethods[key] = mlClient[key].bind(mlClient);
    }

    const authService = app.get(AuthService);
    const rolesService = app.get(RolesService);
    const usersService = app.get(UsersService);

    const adminRole = await owner.createRole(
      rolesService,
      ['*'],
      'Fixture administrator',
    );
    const admin = await owner.createUser(
      usersService,
      adminRole.id,
      'mlops-admin',
    );
    adminToken = (await authService.createSessionForUser(admin.id)).token;
    adminEmail = admin.email;

    const managerRole = await owner.createRole(
      rolesService,
      ['Inventory.Read', 'Inventory.Update'],
      'Fixture inventory manager',
    );
    const manager = await owner.createUser(
      usersService,
      managerRole.id,
      'mlops-manager',
    );
    managerToken = (await authService.createSessionForUser(manager.id)).token;
  }, 60_000);

  afterAll(async () => {
    if (!hasDbUrl) return;
    restoreMl();

    // Deployment rows first: they reference runs.
    if (createdDeploymentIds.length > 0) {
      await db
        .delete(mlModelDeployments)
        .where(inArray(mlModelDeployments.id, createdDeploymentIds));
    }
    if (createdRunIds.length > 0) {
      await db
        .delete(mlTrainingRuns)
        .where(inArray(mlTrainingRuns.id, createdRunIds));
    }
    // Any run this suite created but did not track (a test that failed before
    // tracking) is still owned by this suite's actor email.
    await db
      .delete(mlTrainingRuns)
      .where(eq(mlTrainingRuns.triggeredByEmail, adminEmail));
    // Feedback written through `MlService.recordFeedback` carries the actor email
    // and no reviewer id, so it is owned by that email rather than by an id.
    await db
      .delete(aiSuggestionFeedback)
      .where(eq(aiSuggestionFeedback.reviewerEmail, adminEmail));

    await owner.cleanup();
    await app.close();
    await closeDatabaseConnection();
  }, 60_000);

  beforeEach(() => {
    restoreMl();
    statusCalls = 0;
    deployCalls = 0;
    startCalls = 0;
    stubMl({
      mlOpsReady: async () =>
        ok({
          ready: true,
          models_loaded: {
            category_classifier: true,
            manufacturer_resolver: true,
          },
          version: '1.0.0',
          running_model: {
            loaded: true,
            loadedAt: '2026-09-18T18:28:02Z',
            artifactSha256: 'a'.repeat(64),
            activeVersion: '1.5.0',
            versionSource: 'CHECKSUM',
            recordedActiveVersion: '1.5.0',
          },
        }),
      mlOpsModels: async () => ok(modelRegistryPayload()),
      mlOpsDataset: async () => ok(datasetPayload()),
      mlOpsStartTrainingRun: async () => {
        startCalls += 1;
        return ok(runnerPayload({ status: 'RUNNING', phase: 'TRAINING' }));
      },
      mlOpsTrainingRun: async () => {
        statusCalls += 1;
        return ok(runnerPayload());
      },
      mlOpsDeployCandidate: async () => {
        deployCalls += 1;
        return ok({
          artifactVersion: '1.5.1',
          previousVersion: '1.5.0',
          deployedAt: '2026-09-22T09:10:00Z',
          artifactSha256: 'c'.repeat(64),
          runningVersion: '1.5.1',
          reloadPending: false,
          reloadError: null,
        });
      },
      mlOpsRollback: async () => {
        deployCalls += 1;
        return ok({
          artifactVersion: '1.5.0',
          restoredVersion: '1.5.0',
          previousVersion: '1.5.1',
          deployedAt: '2026-09-22T09:12:00Z',
          artifactSha256: 'a'.repeat(64),
          runningVersion: '1.5.0',
          reloadPending: false,
          reloadError: null,
          deploymentMetadataStale: true,
        });
      },
      mlOpsReloadModel: async () =>
        ok({
          artifactVersion: '1.5.1',
          runningVersion: '1.5.1',
          reloadPending: false,
          reloadError: null,
        }),
    });
  });

  afterEach(async () => {
    if (!hasDbUrl) return;
    // Every run this suite created is removed so the single-active-run index is
    // free for the next test, and so nothing is left behind for another suite.
    // Ownership is by actor email rather than by tracked id, so a run created by a
    // path that failed before it could be tracked is still cleaned up.
    await db
      .delete(mlModelDeployments)
      .where(eq(mlModelDeployments.deployedByEmail, adminEmail));
    await db
      .delete(mlTrainingRuns)
      .where(eq(mlTrainingRuns.triggeredByEmail, adminEmail));
    createdRunIds.length = 0;
    createdDeploymentIds.length = 0;
  });

  /** Creates a run row directly, in whatever state a test needs. */
  async function seedRun(overrides: TrainingRunUpdate = {}) {
    const row = await repository.insertTrainingRun({
      status: overrides.status ?? 'PASSED',
      triggeredByUserId: null,
      triggeredByEmail: adminEmail,
      baseModelVersion: '1.5.0',
      trainingCodeVersion: 'rfc-0058',
    });
    if (!row) throw new Error('Failed to seed a training run');
    createdRunIds.push(row.id);
    if (Object.keys(overrides).length > 0) {
      await repository.updateTrainingRun(row.id, overrides);
      const updated = await repository.findTrainingRun(row.id);
      return updated ?? row;
    }
    return row;
  }

  /** Triggers a run over HTTP and returns its id. */
  async function trigger(): Promise<string> {
    const response = await http()
      .post('/ml/ops/training-runs')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(response.status).toBe(201);
    const created = body<{ id: string }>(response);
    createdRunIds.push(created.id);
    return created.id;
  }

  // ------------------------------------------------------------------ guards

  describe('authorisation', () => {
    it('rejects an anonymous request to every route', async () => {
      const routes: Array<[string, string]> = [
        ['get', '/ml/ops/health'],
        ['get', '/ml/ops/overview'],
        ['get', '/ml/ops/models'],
        ['get', '/ml/ops/datasets'],
        ['get', '/ml/ops/usage'],
        ['get', '/ml/ops/training-runs'],
        ['post', '/ml/ops/training-runs'],
        ['post', '/ml/ops/models/rollback'],
        ['post', '/ml/ops/models/reload'],
      ];
      for (const [method, path] of routes) {
        const response =
          method === 'get'
            ? await http().get(path)
            : await http().post(path).send({});
        expect({ path, status: response.status }).toEqual({
          path,
          status: 401,
        });
      }
    });

    it('rejects a run-deploy route anonymously without creating anything', async () => {
      const run = await seedRun();
      const response = await http()
        .post(`/ml/ops/training-runs/${run.id}/deploy`)
        .send({});
      expect(response.status).toBe(401);
      const reread = await repository.findTrainingRun(run.id);
      expect(reread?.deploymentStatus).toBe('NOT_DEPLOYED');
    });

    it('refuses an Inventory Manager on reads and writes alike', async () => {
      const response = await http()
        .get('/ml/ops/health')
        .set('Authorization', `Bearer ${managerToken}`);
      expect(response.status).toBe(403);
      expect(String(body<{ message: string }>(response).message)).toContain(
        'Administration.Roles',
      );

      const triggerResponse = await http()
        .post('/ml/ops/training-runs')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({});
      expect(triggerResponse.status).toBe(403);
      // The refusal must also mean nothing ran.
      expect(startCalls).toBe(0);
      const active = await repository.findActiveTrainingRun();
      expect(active).toBeNull();
    });

    it('allows an administrator on every read route', async () => {
      for (const path of [
        '/ml/ops/health',
        '/ml/ops/overview',
        '/ml/ops/models',
        '/ml/ops/datasets',
        '/ml/ops/usage',
        '/ml/ops/training-runs',
      ]) {
        const response = await http()
          .get(path)
          .set('Authorization', `Bearer ${adminToken}`);
        expect({ path, status: response.status }).toEqual({
          path,
          status: 200,
        });
      }
    });
  });

  // ----------------------------------------------------------- trigger + actor

  describe('triggering a training run', () => {
    it('creates a queued run, dispatches it and returns before training finishes', async () => {
      const response = await http()
        .post('/ml/ops/training-runs')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(201);
      const run = body<{
        id: string;
        status: string;
        candidateModelVersion: string;
      }>(response);
      createdRunIds.push(run.id);

      expect(startCalls).toBe(1);
      // The stub reports RUNNING, so the response cannot have waited for the
      // terminal state — that is the asynchronous contract.
      expect(run.status).toBe('RUNNING');
      expect(run.candidateModelVersion).toBe('1.5.1');

      const stored = await repository.findTrainingRun(run.id);
      expect(stored?.triggeredByEmail).toBe(adminEmail);
      expect(stored?.baseModelVersion).toBe('1.5.0');
      expect(stored?.trainingCodeVersion).toBe('rfc-0058');
    });

    it('derives the actor from the session, never from the body', async () => {
      const spoof = await http()
        .post('/ml/ops/training-runs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          triggeredByEmail: 'attacker@example.com',
          triggeredByUserId: 'x',
        });
      expect(spoof.status).toBe(400);
      expect(startCalls).toBe(0);

      const runId = await trigger();
      const stored = await repository.findTrainingRun(runId);
      expect(stored?.triggeredByEmail).toBe(adminEmail);
    });

    it('records a security audit entry naming the triggering actor', async () => {
      await trigger();
      const rows = await db
        .select()
        .from(securityAuditLogs)
        .where(eq(securityAuditLogs.action, 'ML_TRAINING_TRIGGERED'));
      const mine = rows.filter((row) => row.userEmail === adminEmail);
      expect(mine.length).toBeGreaterThan(0);
      expect(mine[0]?.category).toBe('Inventory');
      expect(mine[0]?.details).toHaveProperty('runId');
    });

    it('refuses a second run while one is active', async () => {
      await trigger();
      const second = await http()
        .post('/ml/ops/training-runs')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(second.status).toBe(409);
      expect(startCalls).toBe(1);
    });

    it('refuses a concurrent second run at the database level', async () => {
      await trigger();
      await expect(
        repository.insertTrainingRun({
          status: 'QUEUED',
          triggeredByUserId: null,
          triggeredByEmail: adminEmail,
          baseModelVersion: null,
          trainingCodeVersion: null,
        }),
      ).rejects.toBeInstanceOf(ActiveTrainingRunExistsError);
    });

    it('answers 503 and creates no run when the ML service is unreachable', async () => {
      stubMl({
        mlOpsModels: async () => ({
          ok: false as const,
          kind: 'UNREACHABLE' as const,
          message: 'fetch failed',
        }),
      });
      const response = await http()
        .post('/ml/ops/training-runs')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(503);
      expect(body<{ reason: string }>(response).reason).toBe('ML_UNAVAILABLE');
      expect(startCalls).toBe(0);
      const active = await repository.findActiveTrainingRun();
      expect(active).toBeNull();
    });

    it('answers 503 and stores DISPATCH_FAILED when the job cannot be started', async () => {
      stubMl({
        mlOpsStartTrainingRun: async () => ({
          ok: false as const,
          kind: 'UNREACHABLE' as const,
          message: 'fetch failed',
        }),
      });
      const response = await http()
        .post('/ml/ops/training-runs')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(503);

      const runs = await repository.listTrainingRuns({ limit: 5, offset: 0 });
      const mine = runs.rows.filter(
        (row) => row.triggeredByEmail === adminEmail,
      );
      expect(mine.length).toBe(1);
      createdRunIds.push(mine[0]!.id);
      expect(mine[0]?.status).toBe('FAILED');
      expect(mine[0]?.errorCode).toBe('DISPATCH_FAILED');
    });

    it('translates an ML "already running" refusal into a 409 and a failed row', async () => {
      stubMl({
        mlOpsStartTrainingRun: async () => ({
          ok: false as const,
          kind: 'CONFLICT' as const,
          status: 409,
          reason: 'TRAINING_ALREADY_ACTIVE',
          message: 'Training run is already active',
        }),
      });
      const response = await http()
        .post('/ml/ops/training-runs')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(409);

      const runs = await repository.listTrainingRuns({ limit: 5, offset: 0 });
      const mine = runs.rows.filter(
        (row) => row.triggeredByEmail === adminEmail,
      );
      expect(mine[0]?.errorCode).toBe('ML_BUSY');
      createdRunIds.push(mine[0]!.id);
    });
  });

  // ------------------------------------------------------------------ history

  describe('training history', () => {
    it('paginates and never returns the whole table', async () => {
      for (let index = 0; index < 3; index += 1) {
        await seedRun({ status: 'FAILED' });
      }
      const response = await http()
        .get('/ml/ops/training-runs?page=1&pageSize=2')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(200);
      const page = body<{
        items: unknown[];
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      }>(response);
      expect(page.items.length).toBe(2);
      expect(page.pageSize).toBe(2);
      expect(page.total).toBeGreaterThanOrEqual(3);
      expect(page.totalPages).toBe(Math.ceil(page.total / 2));
    });

    it('rejects a page size above the ceiling and an unknown status', async () => {
      const tooBig = await http()
        .get('/ml/ops/training-runs?pageSize=101')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(tooBig.status).toBe(400);

      const badStatus = await http()
        .get('/ml/ops/training-runs?status=NOPE')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(badStatus.status).toBe(400);
    });

    it('filters by status', async () => {
      await seedRun({ status: 'REJECTED' });
      const response = await http()
        .get('/ml/ops/training-runs?status=REJECTED')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(200);
      const page = body<{ items: Array<{ status: string }> }>(response);
      expect(page.items.every((item) => item.status === 'REJECTED')).toBe(true);
    });

    it('returns 404 for an unknown run and 400 for a malformed id', async () => {
      const unknown = await http()
        .get('/ml/ops/training-runs/3f2504e0-4f89-11d3-9a0c-0305e82c3301')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(unknown.status).toBe(404);

      const malformed = await http()
        .get('/ml/ops/training-runs/not-a-uuid')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(malformed.status).toBe(400);
    });

    it('exposes dataset, evaluation, gates, artifact and failure blocks', async () => {
      const run = await seedRun({
        status: 'REJECTED',
        candidateModelVersion: '1.5.1',
        datasetVersion: 'components-2026-09-22-v1.5.1',
        datasetFingerprint: 'f'.repeat(64),
        datasetRecordCount: 25,
        feedbackRecordCount: 2,
        trainingRecordCount: 30,
        validationRecordCount: 7,
        quarantineRecordCount: 0,
        evaluationSummary: { candidateTop1Accuracy: 0.6 },
        gateSummary: {
          gates: { accuracy_gate: false },
          thresholds: { accuracy_gate: { minimum: 0.7 } },
          promotionEligible: false,
        },
        errorCode: 'EVALUATION_FAILED',
        errorMessage: 'gates failed',
        logExcerpt: 'line one\nline two',
      });

      const response = await http()
        .get(`/ml/ops/training-runs/${run.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(200);
      const detail = body<{
        dataset: Record<string, unknown>;
        evaluation: Record<string, unknown>;
        gates: {
          gates: Array<{ gate: string; passed: boolean }>;
          promotionEligible: boolean;
        };
        artifact: {
          exists: boolean;
          deployable: boolean;
          reference: string | null;
        };
        failure: { errorCode: string; logExcerpt: string };
        cancellable: boolean;
        deployment: { status: string };
      }>(response);

      expect(detail.dataset.recordCount).toBe(25);
      expect(detail.dataset.quarantineRecordCount).toBe(0);
      expect(detail.evaluation.candidateTop1Accuracy).toBe(0.6);
      expect(detail.gates.gates).toEqual([
        {
          gate: 'accuracy_gate',
          passed: false,
          description: undefined,
          threshold: 0.7,
        },
      ]);
      expect(detail.gates.promotionEligible).toBe(false);
      expect(detail.artifact.deployable).toBe(false);
      expect(detail.failure.errorCode).toBe('EVALUATION_FAILED');
      expect(detail.failure.logExcerpt).toContain('line one');
      expect(detail.cancellable).toBe(false);
      expect(detail.deployment.status).toBe('NOT_DEPLOYED');
    });
  });

  // ------------------------------------------------------------ reconciliation

  describe('polling an active run', () => {
    it('stores the terminal state and stops polling afterwards', async () => {
      const run = await seedRun({ status: 'RUNNING' });
      const first = await http()
        .get(`/ml/ops/training-runs/${run.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(first.status).toBe(200);
      expect(statusCalls).toBe(1);

      const stored = await repository.findTrainingRun(run.id);
      expect(stored?.status).toBe('PASSED');
      expect(stored?.candidateModelVersion).toBe('1.5.1');
      expect(stored?.evaluationSummary).toMatchObject({
        candidateTop1Accuracy: 0.7143,
      });
      expect(stored?.completedAt).not.toBeNull();

      // Terminal: a second read must not poll the ML service again.
      await http()
        .get(`/ml/ops/training-runs/${run.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(statusCalls).toBe(1);
    });

    it('closes a run the ML service no longer knows as ML_JOB_LOST', async () => {
      const run = await seedRun({ status: 'RUNNING' });
      stubMl({
        mlOpsTrainingRun: async () => ({
          ok: false as const,
          kind: 'NOT_FOUND' as const,
          status: 404,
          message: 'Unknown training run',
        }),
      });
      await http()
        .get(`/ml/ops/training-runs/${run.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      const stored = await repository.findTrainingRun(run.id);
      expect(stored?.status).toBe('FAILED');
      expect(stored?.errorCode).toBe('ML_JOB_LOST');
      expect(stored?.deploymentStatus).toBe('NOT_DEPLOYED');
    });

    it('leaves a run active when the ML service is merely unreachable', async () => {
      const run = await seedRun({ status: 'RUNNING' });
      stubMl({
        mlOpsTrainingRun: async () => ({
          ok: false as const,
          kind: 'UNREACHABLE' as const,
          message: 'fetch failed',
        }),
      });
      const response = await http()
        .get(`/ml/ops/training-runs/${run.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(200);
      const stored = await repository.findTrainingRun(run.id);
      expect(stored?.status).toBe('RUNNING');
      expect(stored?.errorCode).toBeNull();
    });

    it('keeps a dispatched run queryable after the triggering client disconnects', async () => {
      const runId = await trigger();
      // The trigger request has already completed and nothing is holding the
      // connection; the run is still there and still progressing.
      const after = await http()
        .get(`/ml/ops/training-runs/${runId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(after.status).toBe(200);
      const stored = await repository.findTrainingRun(runId);
      expect(stored).not.toBeNull();
      expect(['RUNNING', 'PASSED']).toContain(stored?.status);
    });
  });

  // --------------------------------------------------------------- deployment

  describe('candidate deployment', () => {
    it('refuses a run that is still active', async () => {
      const run = await seedRun({ status: 'RUNNING' });
      const response = await http()
        .post(`/ml/ops/training-runs/${run.id}/deploy`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(response.status).toBe(409);
      expect(deployCalls).toBe(0);
    });

    it('refuses a failed candidate', async () => {
      const run = await seedRun({
        status: 'FAILED',
        errorCode: 'TRAINING_FAILED',
      });
      const response = await http()
        .post(`/ml/ops/training-runs/${run.id}/deploy`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(response.status).toBe(409);
      expect(deployCalls).toBe(0);
      const stored = await repository.findTrainingRun(run.id);
      expect(stored?.deploymentStatus).toBe('NOT_DEPLOYED');
    });

    it('refuses a candidate whose gates rejected it', async () => {
      const run = await seedRun({
        status: 'REJECTED',
        gateSummary: {
          gates: { accuracy_gate: false },
          promotionEligible: false,
        },
      });
      const response = await http()
        .post(`/ml/ops/training-runs/${run.id}/deploy`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(response.status).toBe(409);
      expect(body<{ message: string }>(response).message).toContain(
        'quality gate',
      );
      expect(deployCalls).toBe(0);
    });

    it('refuses a PASSED run with no gate record', async () => {
      const run = await seedRun({ status: 'PASSED', gateSummary: null });
      const response = await http()
        .post(`/ml/ops/training-runs/${run.id}/deploy`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(response.status).toBe(409);
      expect(deployCalls).toBe(0);
    });

    it('refuses a candidate that changed since the operator approved it', async () => {
      const run = await seedRun({
        status: 'PASSED',
        candidateModelVersion: '1.5.1',
        gateSummary: {
          gates: { accuracy_gate: true },
          promotionEligible: true,
        },
      });
      const response = await http()
        .post(`/ml/ops/training-runs/${run.id}/deploy`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ expectedCandidateVersion: '9.9.9' });
      expect(response.status).toBe(409);
      expect(deployCalls).toBe(0);
    });

    it('promotes a passing candidate and records the deployment', async () => {
      const run = await seedRun({
        status: 'PASSED',
        candidateModelVersion: '1.5.1',
        gateSummary: {
          gates: { accuracy_gate: true },
          promotionEligible: true,
        },
      });
      const response = await http()
        .post(`/ml/ops/training-runs/${run.id}/deploy`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ expectedCandidateVersion: '1.5.1' });
      expect(response.status).toBe(201);
      expect(deployCalls).toBe(1);

      const detail = body<{
        deploymentStatus: string;
        deployment: {
          modelVersion: string;
          previousModelVersion: string;
          deployedByEmail: string;
          runningModelVersion: string;
          reloadPending: boolean;
        };
      }>(response);
      expect(detail.deploymentStatus).toBe('DEPLOYED');
      expect(detail.deployment.modelVersion).toBe('1.5.1');
      expect(detail.deployment.previousModelVersion).toBe('1.5.0');
      expect(detail.deployment.deployedByEmail).toBe(adminEmail);
      expect(detail.deployment.runningModelVersion).toBe('1.5.1');
      expect(detail.deployment.reloadPending).toBe(false);

      const deployments = await repository.listDeployments(10);
      const mine = deployments.filter((row) => row.trainingRunId === run.id);
      expect(mine.length).toBe(1);
      createdDeploymentIds.push(mine[0]!.id);

      const audits = await db
        .select()
        .from(securityAuditLogs)
        .where(eq(securityAuditLogs.action, 'ML_CANDIDATE_DEPLOYED'));
      expect(audits.some((row) => row.userEmail === adminEmail)).toBe(true);
    });

    it('reports a deployment that still needs a reload as pending', async () => {
      stubMl({
        mlOpsDeployCandidate: async () => {
          deployCalls += 1;
          return ok({
            artifactVersion: '1.5.1',
            previousVersion: '1.5.0',
            artifactSha256: 'c'.repeat(64),
            runningVersion: '1.5.0',
            reloadPending: true,
            reloadError: 'Production model artifact is missing',
          });
        },
      });
      const run = await seedRun({
        status: 'PASSED',
        candidateModelVersion: '1.5.1',
        gateSummary: {
          gates: { accuracy_gate: true },
          promotionEligible: true,
        },
      });
      const response = await http()
        .post(`/ml/ops/training-runs/${run.id}/deploy`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(response.status).toBe(201);
      const detail = body<{
        deploymentStatus: string;
        deployment: { runningModelVersion: string; reloadPending: boolean };
      }>(response);
      // Artifact deployed, running model unchanged — the distinction is preserved.
      expect(detail.deploymentStatus).toBe('DEPLOYED_PENDING_RELOAD');
      expect(detail.deployment.reloadPending).toBe(true);
      expect(detail.deployment.runningModelVersion).toBe('1.5.0');

      const deployments = await repository.listDeployments(10);
      const mine = deployments.filter((row) => row.trainingRunId === run.id);
      createdDeploymentIds.push(mine[0]!.id);
    });

    it('refuses to deploy the same candidate twice', async () => {
      const run = await seedRun({
        status: 'PASSED',
        candidateModelVersion: '1.5.1',
        gateSummary: {
          gates: { accuracy_gate: true },
          promotionEligible: true,
        },
      });
      await http()
        .post(`/ml/ops/training-runs/${run.id}/deploy`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      const second = await http()
        .post(`/ml/ops/training-runs/${run.id}/deploy`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(second.status).toBe(409);
      expect(deployCalls).toBe(1);

      const deployments = await repository.listDeployments(10);
      const mine = deployments.filter((row) => row.trainingRunId === run.id);
      createdDeploymentIds.push(...mine.map((row) => row.id));
    });

    it('marks the run DEPLOYMENT_FAILED and promotes nothing when ML refuses', async () => {
      stubMl({
        mlOpsDeployCandidate: async () => {
          deployCalls += 1;
          return {
            ok: false as const,
            kind: 'CONFLICT' as const,
            status: 409,
            reason: 'CANDIDATE_NOT_ELIGIBLE',
            message:
              'Candidate v1.5.1 did not pass all mandatory quality gates',
          };
        },
      });
      const run = await seedRun({
        status: 'PASSED',
        candidateModelVersion: '1.5.1',
        gateSummary: {
          gates: { accuracy_gate: true },
          promotionEligible: true,
        },
      });
      const response = await http()
        .post(`/ml/ops/training-runs/${run.id}/deploy`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(response.status).toBe(409);

      const stored = await repository.findTrainingRun(run.id);
      expect(stored?.deploymentStatus).toBe('DEPLOYMENT_FAILED');
      expect(stored?.errorCode).toBe('CANDIDATE_NOT_ELIGIBLE');
      const deployments = await repository.listDeployments(10);
      expect(deployments.filter((row) => row.trainingRunId === run.id)).toEqual(
        [],
      );
    });

    it('answers 503 when the ML service is unreachable during deployment', async () => {
      stubMl({
        mlOpsDeployCandidate: async () => ({
          ok: false as const,
          kind: 'UNREACHABLE' as const,
          message: 'fetch failed',
        }),
      });
      const run = await seedRun({
        status: 'PASSED',
        candidateModelVersion: '1.5.1',
        gateSummary: {
          gates: { accuracy_gate: true },
          promotionEligible: true,
        },
      });
      const response = await http()
        .post(`/ml/ops/training-runs/${run.id}/deploy`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(response.status).toBe(503);
      const stored = await repository.findTrainingRun(run.id);
      expect(stored?.deploymentStatus).toBe('DEPLOYMENT_FAILED');
    });
  });

  // ------------------------------------------------------------------ rollback

  describe('rollback', () => {
    it('refuses when no previous artifact exists', async () => {
      stubMl({
        mlOpsModels: async () =>
          ok({
            ...modelRegistryPayload(),
            active: {
              ...modelRegistryPayload().active,
              rollbackAvailable: false,
            },
          }),
      });
      const response = await http()
        .post('/ml/ops/models/rollback')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(409);
      expect(deployCalls).toBe(0);
    });

    it('restores the previous artifact and records a ROLLBACK deployment', async () => {
      const response = await http()
        .post('/ml/ops/models/rollback')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(201);
      expect(deployCalls).toBe(1);
      const record = body<{
        deploymentType: string;
        modelVersion: string;
        previousModelVersion: string;
        status: string;
        deployedByEmail: string;
      }>(response);
      expect(record.deploymentType).toBe('ROLLBACK');
      expect(record.modelVersion).toBe('1.5.0');
      expect(record.previousModelVersion).toBe('1.5.1');
      expect(record.deployedByEmail).toBe(adminEmail);
      createdDeploymentIds.push(
        ...(await repository.listDeployments(5)).map((row) => row.id),
      );

      const audits = await db
        .select()
        .from(securityAuditLogs)
        .where(eq(securityAuditLogs.action, 'ML_MODEL_ROLLED_BACK'));
      expect(audits.some((row) => row.userEmail === adminEmail)).toBe(true);
    });

    it('surfaces a rollback failure without recording a deployment', async () => {
      stubMl({
        mlOpsRollback: async () => ({
          ok: false as const,
          kind: 'CONFLICT' as const,
          status: 409,
          reason: 'ROLLBACK_FAILED',
          message: 'Rollback failed',
        }),
      });
      const response = await http()
        .post('/ml/ops/models/rollback')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(409);
      const audits = await db
        .select()
        .from(securityAuditLogs)
        .where(eq(securityAuditLogs.action, 'ML_MODEL_ROLLED_BACK'));
      const refused = audits.filter(
        (row) => row.userEmail === adminEmail && row.details !== null,
      );
      expect(
        refused.some(
          (row) =>
            (row.details as Record<string, unknown>).outcome === 'FAILED',
        ),
      ).toBe(true);
    });
  });

  // ------------------------------------------------------------------- models

  describe('model registry view', () => {
    it('reports production, running model and reload state separately', async () => {
      const response = await http()
        .get('/ml/ops/models')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(200);
      const models = body<{
        production: {
          artifactVersion: string;
          checksum: string;
          rollbackAvailable: boolean;
        };
        running: { version: string; reloadPending: boolean };
        versions: Array<{ version: string; deployable: boolean }>;
        deployments: unknown[];
        available: boolean;
      }>(response);
      expect(models.available).toBe(true);
      expect(models.production.artifactVersion).toBe('1.5.0');
      expect(models.running.version).toBe('1.5.0');
      expect(models.running.reloadPending).toBe(false);
      expect(models.versions.map((version) => version.version)).toEqual([
        '1.5.1',
      ]);
      expect(models.production.rollbackAvailable).toBe(true);
    });

    it('flags a running model that differs from the deployed artifact', async () => {
      stubMl({
        mlOpsModels: async () =>
          ok({
            ...modelRegistryPayload(),
            running: {
              ...modelRegistryPayload().running,
              artifactSha256: 'd'.repeat(64),
              activeVersion: '1.4.0',
            },
          }),
      });
      const response = await http()
        .get('/ml/ops/models')
        .set('Authorization', `Bearer ${adminToken}`);
      const models = body<{
        running: { reloadPending: boolean; version: string };
      }>(response);
      expect(models.running.reloadPending).toBe(true);
      expect(models.running.version).toBe('1.4.0');
    });

    it('reports the registry as unavailable rather than empty when ML is down', async () => {
      stubMl({
        mlOpsModels: async () => ({
          ok: false as const,
          kind: 'DISABLED' as const,
          message: 'disabled',
        }),
      });
      const response = await http()
        .get('/ml/ops/models')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(200);
      const models = body<{ available: boolean; versions: unknown[] }>(
        response,
      );
      expect(models.available).toBe(false);
      expect(models.versions).toEqual([]);
    });

    it('reloads the running model and audits it', async () => {
      const response = await http()
        .post('/ml/ops/models/reload')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(201);
      const audits = await db
        .select()
        .from(securityAuditLogs)
        .where(eq(securityAuditLogs.action, 'ML_MODEL_RELOADED'));
      expect(audits.some((row) => row.userEmail === adminEmail)).toBe(true);
    });

    it('links a registry version to its training run and its dataset', async () => {
      // A control-plane run calls the pipeline steps directly, so the registry's own
      // `pipeline_summary.json` is absent and the dataset version lives in the run.
      await seedRun({
        status: 'PASSED',
        candidateModelVersion: '1.5.1',
        datasetVersion: 'components-2026-09-22-v1.5.1',
        gateSummary: {
          gates: { accuracy_gate: true },
          promotionEligible: true,
        },
      });

      const response = await http()
        .get('/ml/ops/models')
        .set('Authorization', `Bearer ${adminToken}`);
      const version = body<{
        versions: Array<{
          version: string;
          datasetVersion: string | null;
          trainingRunId: string | null;
          deployable: boolean;
          runDeployable: boolean;
          gates: { gates: Array<{ gate: string }>; promotionEligible: boolean };
        }>;
      }>(response).versions.find((item) => item.version === '1.5.1');

      expect(version?.trainingRunId).not.toBeNull();
      // The registry report has no datasetVersion, so it comes from the run record.
      expect(version?.datasetVersion).toBe('components-2026-09-22-v1.5.1');
      expect(version?.deployable).toBe(true);
      // The run is PASSED and not yet deployed, so the operator action is available.
      expect(version?.runDeployable).toBe(true);
      // Gate verdicts are read from the registry report's own `qualityGates` key.
      expect(version?.gates.gates.map((gate) => gate.gate)).toContain(
        'accuracy_gate',
      );
    });

    it('stops offering deployment for a version whose run was already deployed', async () => {
      await seedRun({
        status: 'PASSED',
        candidateModelVersion: '1.5.1',
        deploymentStatus: 'DEPLOYED',
        gateSummary: {
          gates: { accuracy_gate: true },
          promotionEligible: true,
        },
      });

      const response = await http()
        .get('/ml/ops/models')
        .set('Authorization', `Bearer ${adminToken}`);
      const version = body<{
        versions: Array<{
          version: string;
          deployable: boolean;
          runDeployable: boolean;
        }>;
      }>(response).versions.find((item) => item.version === '1.5.1');

      // The artifact is still deployable; the RUN is not, and the UI must not offer
      // a button that the server would refuse.
      expect(version?.deployable).toBe(true);
      expect(version?.runDeployable).toBe(false);
    });
  });

  // ----------------------------------------------------------------- dataset

  describe('dataset summary', () => {
    it('reports the snapshot, its quality counts and its history', async () => {
      const response = await http()
        .get('/ml/ops/datasets')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(200);
      const dataset = body<{
        available: boolean;
        current: {
          version: string;
          totalRecords: number;
          trainingRecords: number;
          evaluationRecords: number;
          quarantinedRecords: number;
          duplicatePairs: number;
          distinctBaseFamilies: number;
          fingerprint: string;
        };
        freshness: { ageHours: number; lastTrainingRunAt: string | null };
        quality: {
          conflictingLabels: number;
          missingFields: number;
          quarantineTotal: number;
          quarantineByReason: Array<{ reason: string; count: number }>;
          categoryDistribution: Array<{ name: string; count: number }>;
          manufacturerDistribution: Array<{ name: string; count: number }>;
        };
        history: Array<{ version: string }>;
      }>(response);

      expect(dataset.available).toBe(true);
      expect(dataset.current.version).toBe('components-2026-09-22-v1.5.1');
      expect(dataset.current.totalRecords).toBe(25);
      expect(dataset.current.trainingRecords).toBe(30);
      expect(dataset.current.evaluationRecords).toBe(7);
      expect(dataset.current.quarantinedRecords).toBe(3);
      expect(dataset.current.fingerprint).toHaveLength(64);
      expect(dataset.quality.conflictingLabels).toBe(2);
      expect(dataset.quality.missingFields).toBe(1);
      expect(dataset.quality.quarantineTotal).toBe(3);
      expect(dataset.quality.categoryDistribution).toEqual([
        { name: 'Resistors', count: 10 },
      ]);
      expect(dataset.quality.manufacturerDistribution).toEqual([
        { name: 'Murata Manufacturing', count: 6 },
      ]);
      expect(dataset.history.length).toBe(1);
    });

    it('reports nulls rather than zeroes when the quarantine file does not exist', async () => {
      stubMl({
        mlOpsDataset: async () =>
          ok({
            ...datasetPayload(),
            quarantine: {
              available: false,
              total: 0,
              pending: 0,
              verified: 0,
              rejected: 0,
              byReason: [],
              truncated: false,
            },
          }),
      });
      const response = await http()
        .get('/ml/ops/datasets')
        .set('Authorization', `Bearer ${adminToken}`);
      const dataset = body<{
        quality: {
          conflictingLabels: number | null;
          quarantineTotal: number | null;
        };
      }>(response);
      expect(dataset.quality.conflictingLabels).toBeNull();
      expect(dataset.quality.quarantineTotal).toBeNull();
    });

    it('reports the dataset as unavailable when ML is down', async () => {
      stubMl({
        mlOpsDataset: async () => ({
          ok: false as const,
          kind: 'UNREACHABLE' as const,
          message: 'fetch failed',
        }),
      });
      const response = await http()
        .get('/ml/ops/datasets')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(200);
      const dataset = body<{
        available: boolean;
        current: unknown;
        quality: { duplicatePairs: number | null };
      }>(response);
      expect(dataset.available).toBe(false);
      expect(dataset.current).toBeNull();
      expect(dataset.quality.duplicatePairs).toBeNull();
    });
  });

  // ------------------------------------------------------------------- usage

  describe('usage statistics', () => {
    it("aggregates feedback server-side, counting only this fixture's rows", async () => {
      const before = await http()
        .get('/ml/ops/usage')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(before.status).toBe(200);
      const beforeTotal = body<{ feedback: { total: number } }>(before).feedback
        .total;

      // Feedback written through the real service, so the aggregate is measured
      // against rows the product itself created rather than hand-inserted rows.
      await mlService.recordFeedback(
        {
          items: [
            {
              suggestionType: 'CATEGORY',
              field: 'category',
              predictedValue: { categoryName: 'Resistors' },
              confidenceLevel: 'HIGH',
              userAction: 'ACCEPTED',
            },
            {
              suggestionType: 'MANUFACTURER',
              field: 'manufacturer',
              predictedValue: { manufacturer: 'Yageo' },
              confidenceLevel: 'HIGH',
              userAction: 'REJECTED',
            },
          ],
        },
        { email: adminEmail },
      );

      const after = await http()
        .get('/ml/ops/usage')
        .set('Authorization', `Bearer ${adminToken}`);
      const usage = body<{
        feedback: {
          total: number;
          accepted: number;
          rejected: number;
          bySuggestionType: Array<{ suggestionType: string; count: number }>;
        };
        findings: {
          total: number;
          byIssueCategory: Array<{ issueCategory: string }>;
        };
        training: { totalRuns: number; deployments: number; rollbacks: number };
        available: { feedback: boolean; findings: boolean; training: boolean };
      }>(after);

      expect(usage.available).toEqual({
        feedback: true,
        findings: true,
        training: true,
      });
      expect(usage.feedback.total).toBe(beforeTotal + 2);
      expect(usage.feedback.accepted).toBeGreaterThanOrEqual(1);
      expect(usage.feedback.rejected).toBeGreaterThanOrEqual(1);
      expect(usage.feedback.bySuggestionType.length).toBeGreaterThan(0);
      expect(Array.isArray(usage.findings.byIssueCategory)).toBe(true);
      expect(usage.training.totalRuns).toBeGreaterThanOrEqual(0);
    });

    it('counts training runs and deployments from the run ledger', async () => {
      await seedRun({ status: 'FAILED' });
      const response = await http()
        .get('/ml/ops/usage')
        .set('Authorization', `Bearer ${adminToken}`);
      const usage = body<{
        training: { totalRuns: number; failed: number; active: number };
      }>(response);
      expect(usage.training.totalRuns).toBeGreaterThanOrEqual(1);
      expect(usage.training.failed).toBeGreaterThanOrEqual(1);
      expect(usage.training.active).toBe(0);
    });
  });

  // ---------------------------------------------------------------- overview

  describe('overview', () => {
    it('composes health, production model, latest run, candidate and counts', async () => {
      const response = await http()
        .get('/ml/ops/overview')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(200);
      const overview = body<{
        health: {
          serviceReachable: boolean;
          ready: boolean;
          categoryModelLoaded: boolean;
          manufacturerResolverLoaded: boolean;
          runningModelVersion: string;
          activeTrainingRunId: string | null;
        };
        productionModel: {
          artifactVersion: string;
          runningVersion: string;
          status: string;
        };
        counts: {
          feedback: number;
          findings: number;
          trainingRuns: number;
          deployedModels: number;
        };
      }>(response);

      expect(overview.health.serviceReachable).toBe(true);
      expect(overview.health.ready).toBe(true);
      expect(overview.health.categoryModelLoaded).toBe(true);
      expect(overview.health.manufacturerResolverLoaded).toBe(true);
      expect(overview.health.runningModelVersion).toBe('1.5.0');
      expect(overview.productionModel.status).toBe('RUNNING');
      expect(overview.productionModel.runningVersion).toBe('1.5.0');
      expect(typeof overview.counts.feedback).toBe('number');
      expect(typeof overview.counts.findings).toBe('number');
    });

    it('reports an unhealthy ML service without failing the request', async () => {
      stubMl({
        mlOpsReady: async () => ({
          ok: false as const,
          kind: 'UNREACHABLE' as const,
          message: 'fetch failed',
        }),
        mlOpsModels: async () => ({
          ok: false as const,
          kind: 'UNREACHABLE' as const,
          message: 'fetch failed',
        }),
      });
      const response = await http()
        .get('/ml/ops/overview')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(200);
      const overview = body<{
        health: { serviceReachable: boolean; ready: boolean };
        productionModel: unknown;
        counts: { feedback: number };
      }>(response);
      expect(overview.health.serviceReachable).toBe(false);
      expect(overview.health.ready).toBe(false);
      // Nothing is claimed about a model the API cannot see.
      expect(overview.productionModel).toBeNull();
      // The database-derived counts are still reported: they do not depend on ML.
      expect(typeof overview.counts.feedback).toBe('number');
    });

    it('exposes an active run id while training is in flight', async () => {
      const runId = await trigger();
      const response = await http()
        .get('/ml/ops/overview')
        .set('Authorization', `Bearer ${adminToken}`);
      const overview = body<{ health: { activeTrainingRunId: string | null } }>(
        response,
      );
      expect(overview.health.activeTrainingRunId).toBe(runId);
    });
  });
});

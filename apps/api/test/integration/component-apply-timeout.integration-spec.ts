import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { ConflictException } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { ComponentsService } from '../../src/components/components.service';
import { ComponentReviewQueueService } from '../../src/ml/component-review-queue.service';
import { ComponentReviewApplyService } from '../../src/ml/component-review-apply.service';
import {
  ComponentApplyTimeoutError,
  resolveComponentApplyTimeouts,
} from '../../src/ml/component-apply-timeout';
import { describeApplyTimeout } from '../../src/ml/intelligence-findings/apply-timeout';
import { db, closeDatabaseConnection } from '@ananya/database';
import { aiSuggestionFeedback } from '@ananya/database/schema';
import { and, count, eq } from '@ananya/database/query';
import { sql } from '@ananya/database/query';
import { FixtureOwner } from '../fixtures/fixture-owner';

/**
 * Component apply — bounded transaction (Pass 6).
 *
 * `ComponentReviewApplyService` had the same transaction shape as the attribute
 * apply path — a row-locked finding, domain repositories bound to the transaction,
 * a guarded transition, a feedback row — and none of the bounds. Pass 4 found a
 * real deadlock in the attribute path; the class of failure was never
 * attribute-specific.
 *
 * The contention here is deterministic rather than sleep-based: a separate
 * connection takes a real `SELECT … FOR UPDATE` on the finding row and signals
 * through a promise once the lock is actually held, so the apply request genuinely
 * blocks on a lock that exists.
 */
describe('Component apply — bounded transaction', () => {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  const reviewer = { email: 'component-timeout@ananya.local' };

  let app: INestApplicationContext;
  let componentsService: ComponentsService;
  let reviewQueue: ComponentReviewQueueService;
  let applyService: ComponentReviewApplyService;

  const owner = new FixtureOwner('comp-timeout');

  /**
   * The bound in force for this suite, and why it is not the default.
   *
   * The apply service resolves its bounds once, at construction, so the only way
   * to tighten them for a suite is to set the environment before the application
   * context exists. The suite does that so the contention tests prove the
   * mechanism in milliseconds rather than seconds — and so the determinism check
   * can run several iterations instead of one.
   *
   * This does not weaken the coverage. That the bounds are *read* from the
   * environment, and that the unset defaults are the documented values, is asserted
   * separately in `configuration` with an explicit environment object — so this
   * suite proves what a configured bound does, and the configuration tests prove
   * what the bound is when nobody sets it.
   *
   * The previous value is restored in `afterAll`: jest reuses worker processes
   * across spec files, so leaking this would retune the bound for whichever suite
   * runs next in the same worker.
   */
  const SUITE_LOCK_TIMEOUT_MS = '750';
  let previousLockTimeout: string | undefined;

  beforeAll(async () => {
    if (!hasDbUrl) return;

    previousLockTimeout =
      process.env.COMPONENT_INTELLIGENCE_APPLY_LOCK_TIMEOUT_MS;
    process.env.COMPONENT_INTELLIGENCE_APPLY_LOCK_TIMEOUT_MS =
      SUITE_LOCK_TIMEOUT_MS;

    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    componentsService = app.get(ComponentsService);
    reviewQueue = app.get(ComponentReviewQueueService);
    applyService = app.get(ComponentReviewApplyService);

    // A successful apply writes `COMPONENT_INTELLIGENCE_FINDING_APPLIED` naming the
    // reviewer as `user_email`. Registering the address with the owner is what lets
    // cleanup see those rows — they carry no user id, so the actor-id predicate
    // cannot reach them.
    owner.trackEmail(reviewer.email);
  });

  afterAll(async () => {
    if (!hasDbUrl) return;
    await owner.cleanup();
    if (app) await app.close();
    if (previousLockTimeout === undefined) {
      delete process.env.COMPONENT_INTELLIGENCE_APPLY_LOCK_TIMEOUT_MS;
    } else {
      process.env.COMPONENT_INTELLIGENCE_APPLY_LOCK_TIMEOUT_MS =
        previousLockTimeout;
    }
    await closeDatabaseConnection();
  });

  /** A component fixture with the owner's namespaced SKU. */
  async function createComponent() {
    return owner.createComponent(componentsService, { unit: 'pcs' });
  }

  /** Persists one applicable `MPN_MISSING` finding through the real queue service. */
  async function createMpnFinding(
    componentId: string,
    componentUpdatedAt: Date,
  ) {
    const result = await reviewQueue.persistFindings([
      {
        componentId,
        issueType: 'MPN_MISSING',
        issueCategory: 'IDENTITY',
        field: 'manufacturerPartNumber',
        title: owner.name('Timeout fixture MPN_MISSING'),
        description: 'Fixture finding for the bounded-transaction suite.',
        currentValue: { manufacturerPartNumber: null },
        suggestedValue: { manufacturerPartNumber: 'RC0805FR-0727RL' },
        confidence: 0.95,
        confidenceLevel: 'HIGH',
        evidence: [
          {
            type: 'mpn_pattern',
            description: 'Fixture evidence',
            weight: 0.9,
            source: 'analyzer:identity',
          },
        ],
        source: 'analyzer:identity',
        intelligenceVersion: 'test-v1',
        componentUpdatedAt,
      },
    ]);
    const finding = result.findings[0]!;
    owner.trackComponentFinding(finding.id);
    return finding;
  }

  /**
   * Holds a real row lock on the finding from a SEPARATE connection.
   *
   * Deterministic rather than sleep-based: the holder signals through a promise
   * once `SELECT … FOR UPDATE` has actually returned, so the test never races its
   * own setup. The apply request then has to wait for a lock that is genuinely
   * held, which is the exact condition `lock_timeout` exists to bound.
   */
  async function holdFindingLock(findingId: string) {
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let acquired!: () => void;
    const locked = new Promise<void>((resolve) => {
      acquired = resolve;
    });

    const done = db
      .transaction(async (tx) => {
        await tx.execute(
          sql`select id from component_intelligence_findings where id = ${findingId} for update`,
        );
        acquired();
        await released;
      })
      .catch(() => undefined);

    await locked;
    return {
      async release() {
        release();
        await done;
      },
    };
  }

  /** Counts the feedback rows a component's apply produced. */
  async function appliedFeedbackCount(componentId: string): Promise<number> {
    const rows = await db
      .select({ value: count() })
      .from(aiSuggestionFeedback)
      .where(
        and(
          eq(aiSuggestionFeedback.componentId, componentId),
          eq(aiSuggestionFeedback.suggestionType, 'MPN_MISSING'),
        ),
      );
    return Number(rows[0]?.value ?? 0);
  }

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  describe('configuration', () => {
    it('reads its own environment scope, separately from the attribute path', () => {
      const defaults = resolveComponentApplyTimeouts({});
      expect(defaults.lockTimeoutMs).toBe(5_000);
      // More generous than the attribute path's 15 s, because this transaction may
      // run the full SaveComponentAttributes use case.
      expect(defaults.statementTimeoutMs).toBe(20_000);

      const configured = resolveComponentApplyTimeouts({
        COMPONENT_INTELLIGENCE_APPLY_LOCK_TIMEOUT_MS: '1234',
        COMPONENT_INTELLIGENCE_APPLY_STATEMENT_TIMEOUT_MS: '5678',
      });
      expect(configured.lockTimeoutMs).toBe(1234);
      expect(configured.statementTimeoutMs).toBe(5678);
    });

    it('does not read the attribute path’s variables', () => {
      // The two scopes must be independently boundable: an operator setting the
      // attribute bounds must not silently retune the component path.
      const resolved = resolveComponentApplyTimeouts({
        ATTRIBUTE_INTELLIGENCE_APPLY_LOCK_TIMEOUT_MS: '111',
        ATTRIBUTE_INTELLIGENCE_APPLY_STATEMENT_TIMEOUT_MS: '222',
      });
      expect(resolved.lockTimeoutMs).toBe(5_000);
      expect(resolved.statementTimeoutMs).toBe(20_000);
    });

    it('falls back to the default rather than disabling the bound', () => {
      for (const bad of ['0', '-1', 'abc', '']) {
        const resolved = resolveComponentApplyTimeouts({
          COMPONENT_INTELLIGENCE_APPLY_LOCK_TIMEOUT_MS: bad,
        });
        expect(resolved.lockTimeoutMs).toBe(5_000);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Classification
  // -------------------------------------------------------------------------

  describe('error classification', () => {
    const config = resolveComponentApplyTimeouts({});

    it('recognises a lock timeout hidden behind a drizzle wrapper', () => {
      // Verified against the driver: drizzle wraps driver failures in
      // `DrizzleQueryError` and puts the SQLSTATE on `cause`, not on the error.
      const wrapped = Object.assign(new Error('Failed query: select …'), {
        cause: Object.assign(new Error('canceling statement'), {
          code: '55P03',
        }),
      });
      const descriptor = describeApplyTimeout(wrapped, config, {
        name: 'component',
        lockTimeoutEnv: 'X',
        statementTimeoutEnv: 'Y',
        defaultLockTimeoutMs: 1,
        defaultStatementTimeoutMs: 1,
      });
      expect(descriptor?.kind).toBe('LOCK_TIMEOUT');
      expect(descriptor?.message).toContain('Nothing was changed');
    });

    it('does not classify anything that is not a timeout', () => {
      const scope = {
        name: 'component',
        lockTimeoutEnv: 'X',
        statementTimeoutEnv: 'Y',
        defaultLockTimeoutMs: 1,
        defaultStatementTimeoutMs: 1,
      };
      // A unique violation, a foreign-key violation, a domain refusal and a plain
      // error must all fall through — reporting one as retryable would tell a
      // client to retry something that fails identically.
      for (const code of ['23505', '23503', '40001', undefined]) {
        const error =
          code === undefined
            ? new Error('connection reset by peer')
            : Object.assign(new Error('db error'), { code });
        expect(describeApplyTimeout(error, config, scope)).toBeNull();
      }
    });

    it('is a distinct conflict from the domain refusals on the same route', () => {
      const error = new ComponentApplyTimeoutError('timed out', {
        timeout: 'LOCK_TIMEOUT',
        limitMs: 5_000,
        elapsedMs: 5_000,
      });
      expect(error).toBeInstanceOf(ConflictException);
      const body = error.getResponse() as Record<string, unknown>;
      expect(body.reason).toBe('APPLY_TIMEOUT');
      expect(body.retryable).toBe(true);
      expect(body.timeout).toBe('LOCK_TIMEOUT');
      // Not the reason any state refusal uses.
      expect(body.reason).not.toBe('COMPONENT_CHANGED');
      expect(body.reason).not.toBe('FINGERPRINT_MISMATCH');
    });
  });

  // -------------------------------------------------------------------------
  // Lock contention
  // -------------------------------------------------------------------------

  describe('lock contention', () => {
    it('returns APPLY_TIMEOUT and mutates nothing when the finding is locked', async () => {
      if (!hasDbUrl) return;
      const component = await createComponent();
      const finding = await createMpnFinding(component.id, component.updatedAt);

      const holder = await holdFindingLock(finding.id);
      try {
        // `toBeInstanceOf` rather than `toMatchObject({constructor})`: the timeout
        // error extends `ConflictException`, and matching the exact constructor
        // would be a stricter assertion than the contract.
        await expect(
          applyService.applyFinding(
            finding.id,
            { expectedFingerprint: finding.fingerprint },
            reviewer,
          ),
        ).rejects.toBeInstanceOf(ComponentApplyTimeoutError);
      } finally {
        await holder.release();
      }

      // The whole transaction rolled back: no component mutation, no APPLIED
      // finding state, no feedback row.
      const reloaded = await componentsService.getComponent(component.id);
      expect(reloaded.manufacturerPartNumber ?? null).toBeNull();

      const stored = await reviewQueue.getFinding(finding.id);
      expect(stored.metadata?.applied).toBeUndefined();
      expect(stored.status).toBe('PENDING');

      expect(await appliedFeedbackCount(component.id)).toBe(0);
    });

    it('reports the timeout as retryable, and the retry after release succeeds', async () => {
      if (!hasDbUrl) return;
      const component = await createComponent();
      const finding = await createMpnFinding(component.id, component.updatedAt);

      const holder = await holdFindingLock(finding.id);
      let reason: string | undefined;
      try {
        await applyService.applyFinding(
          finding.id,
          { expectedFingerprint: finding.fingerprint },
          reviewer,
        );
      } catch (error) {
        reason = (
          (error as ConflictException).getResponse() as { reason?: string }
        ).reason;
      } finally {
        await holder.release();
      }
      expect(reason).toBe('APPLY_TIMEOUT');

      // The retry the 409 told the client to make.
      const result = await applyService.applyFinding(
        finding.id,
        { expectedFingerprint: finding.fingerprint },
        reviewer,
      );
      expect(result.appliedValue).toBe('RC0805FR-0727RL');

      const reloaded = await componentsService.getComponent(component.id);
      expect(reloaded.manufacturerPartNumber).toBe('RC0805FR-0727RL');
      expect(await appliedFeedbackCount(component.id)).toBe(1);
    });

    it('produces the same timeout on every attempt, so it is not timing-dependent', async () => {
      if (!hasDbUrl) return;

      // Repetition rather than delay. The failure mode this rules out is a bound
      // that only appears to work because the test happened to sleep long enough;
      // here each iteration creates the same real, signalled row lock and takes a
      // fresh component and finding, so nothing carries over between attempts
      // except the mechanism under test.
      const attempts = 6;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const component = await createComponent();
        const finding = await createMpnFinding(
          component.id,
          component.updatedAt,
        );

        const holder = await holdFindingLock(finding.id);
        let error: unknown;
        try {
          await applyService.applyFinding(
            finding.id,
            { expectedFingerprint: finding.fingerprint },
            reviewer,
          );
        } catch (caught) {
          error = caught;
        } finally {
          await holder.release();
        }

        expect(error).toBeInstanceOf(ComponentApplyTimeoutError);
        const timeoutError = error as ComponentApplyTimeoutError;
        expect(
          (timeoutError.getResponse() as Record<string, unknown>).reason,
        ).toBe('APPLY_TIMEOUT');
        // The configured bound, not the default — which is what proves the
        // environment scope is the one consulted.
        expect(timeoutError.detail.timeout).toBe('LOCK_TIMEOUT');
        expect(timeoutError.detail.limitMs).toBe(Number(SUITE_LOCK_TIMEOUT_MS));

        // No iteration leaves anything behind: the rollback is as reliable at the
        // sixth attempt as at the first.
        const reloaded = await componentsService.getComponent(component.id);
        expect(reloaded.manufacturerPartNumber ?? null).toBeNull();
        const stored = await reviewQueue.getFinding(finding.id);
        expect(stored.status).toBe('PENDING');
        expect(stored.metadata?.applied).toBeUndefined();
        expect(await appliedFeedbackCount(component.id)).toBe(0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Errors that must NOT become a timeout
  // -------------------------------------------------------------------------

  describe('other failures keep their own meaning', () => {
    it('leaves a domain refusal as a domain refusal', async () => {
      if (!hasDbUrl) return;
      const component = await createComponent();
      const finding = await createMpnFinding(component.id, component.updatedAt);

      // A fingerprint mismatch is a state refusal, not a timeout: the client must
      // not be told to retry something that will fail identically.
      await expect(
        applyService.applyFinding(
          finding.id,
          { expectedFingerprint: 'a'.repeat(64) },
          reviewer,
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      let reason: string | undefined;
      try {
        await applyService.applyFinding(
          finding.id,
          { expectedFingerprint: 'a'.repeat(64) },
          reviewer,
        );
      } catch (error) {
        reason = (
          (error as ConflictException).getResponse() as { reason?: string }
        ).reason;
        // And specifically NOT the timeout error, which is the only reason on this
        // route that means "retry unchanged".
        expect(error).not.toBeInstanceOf(ComponentApplyTimeoutError);
      }
      expect(reason).toBe('FINGERPRINT_MISMATCH');
      expect(reason).not.toBe('APPLY_TIMEOUT');
    });

    it('does not report an unexpected database failure as a timeout', async () => {
      if (!hasDbUrl) return;
      const component = await createComponent();
      const finding = await createMpnFinding(component.id, component.updatedAt);

      // A generic driver error with no SQLSTATE, injected into a database-reading
      // step inside `applyFinding`. Nothing may classify this as a retryable
      // timeout — it must surface as the genuine failure it is.
      const spy = jest
        .spyOn(
          applyService as unknown as {
            loadPackagePatterns: () => Promise<string[]>;
          },
          'loadPackagePatterns',
        )
        .mockRejectedValueOnce(new Error('connection reset by peer'));

      try {
        await expect(
          applyService.applyFinding(
            finding.id,
            { expectedFingerprint: finding.fingerprint },
            reviewer,
          ),
        ).rejects.toThrow('connection reset by peer');
      } finally {
        spy.mockRestore();
      }

      const reloaded = await componentsService.getComponent(component.id);
      expect(reloaded.manufacturerPartNumber ?? null).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // The attribute path is unaffected
  // -------------------------------------------------------------------------

  describe('scope isolation', () => {
    it('leaves the attribute path’s configuration alone', async () => {
      const { resolveAttributeApplyTimeouts } =
        await import('../../src/ml/attribute-findings/attribute-apply-timeout');
      // Setting the component bounds must not move the attribute bounds.
      const attributeDefaults = resolveAttributeApplyTimeouts({
        COMPONENT_INTELLIGENCE_APPLY_LOCK_TIMEOUT_MS: '1',
        COMPONENT_INTELLIGENCE_APPLY_STATEMENT_TIMEOUT_MS: '2',
      });
      expect(attributeDefaults.lockTimeoutMs).toBe(5_000);
      expect(attributeDefaults.statementTimeoutMs).toBe(15_000);
    });
  });

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  describe('fixture ownership', () => {
    it('removes its own fixtures and nothing else', () => {
      const tracked = owner.tracked;
      expect(tracked.componentFindings).toBeGreaterThanOrEqual(1);
      expect(tracked.components).toBeGreaterThanOrEqual(1);
    });
  });
});

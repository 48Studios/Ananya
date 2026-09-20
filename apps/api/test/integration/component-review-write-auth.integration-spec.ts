import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { RolesService } from '../../src/roles/roles.service';
import { UsersService } from '../../src/users/users.service';
import { ComponentsService } from '../../src/components/components.service';
import { ComponentReviewQueueService } from '../../src/ml/component-review-queue.service';
import { db, closeDatabaseConnection } from '@ananya/database';
import { aiSuggestionFeedback, roles, users } from '@ananya/database/schema';
import { eq, inArray } from '@ananya/database/query';

/** Typed view of the review-queue response bodies (supertest bodies are `any`). */
interface ReviewResponseBody {
  appliedValue?: string | null;
  appliedValueLabel?: string | null;
  reason?: string;
  message?: string | string[];
  status?: string;
  analyzedCount?: number;
  component?: {
    manufacturerPartNumber?: string | null;
    manufacturerId?: string | null;
    categoryId?: string | null;
  };
}

/**
 * Pass 4.1 / 4.2: authorization of the Component Review Queue write routes.
 *
 * These tests go through HTTP so they prove the guard is actually attached to
 * each route (a service-level test cannot). Roles, users, and sessions are
 * created through the application's own services rather than by inserting fake
 * rows, so the tokens exercised here are real session tokens.
 */
describe('Component Review Queue — write authorization', () => {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  const runId = Date.now();

  let app: INestApplication;
  let authService: AuthService;
  let rolesService: RolesService;
  let usersService: UsersService;
  let componentsService: ComponentsService;
  let reviewQueue: ComponentReviewQueueService;

  const createdRoleIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdComponentIds: string[] = [];

  let readerToken = '';
  let writerToken = '';
  let writerUserId = '';
  let writerEmail = '';

  const APPLY_ROUTE = (id: string) => `/ml/components/review-queue/${id}/apply`;
  const DECISION_ROUTE = (id: string) =>
    `/ml/components/review-queue/${id}/decision`;
  const AUDIT_ROUTE = '/ml/components/review-queue/audit';
  const QUEUE_ROUTE = '/ml/components/review-queue';

  /** Typed HTTP entry point; `getHttpServer()` is untyped, hence the cast. */
  function http() {
    return request(app.getHttpServer() as Parameters<typeof request>[0]);
  }

  function responseBody(response: { body: unknown }): ReviewResponseBody {
    return response.body as ReviewResponseBody;
  }

  beforeAll(async () => {
    if (!hasDbUrl) return;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mirrors main.ts so whitelist rejection behaves as it does in production.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    authService = app.get(AuthService);
    rolesService = app.get(RolesService);
    usersService = app.get(UsersService);
    componentsService = app.get(ComponentsService);
    reviewQueue = app.get(ComponentReviewQueueService);

    // A read-only role and a role holding the component-write permission.
    const readerRole = await rolesService.create({
      name: `E2E Apply Reader ${runId}`,
      description: 'Authorization fixture: read-only inventory access',
      permissions: ['Inventory.Read'],
    });
    const writerRole = await rolesService.create({
      name: `E2E Apply Writer ${runId}`,
      description: 'Authorization fixture: component edit access',
      permissions: ['Inventory.Read', 'Inventory.Update'],
    });
    createdRoleIds.push(readerRole.id, writerRole.id);

    const reader = await usersService.create({
      email: `apply-reader-${runId}@ananya.local`,
      password: 'ReaderPassw0rd!',
      firstName: 'Apply',
      lastName: 'Reader',
      roleId: readerRole.id,
    });
    const writer = await usersService.create({
      email: `apply-writer-${runId}@ananya.local`,
      password: 'WriterPassw0rd!',
      firstName: 'Apply',
      lastName: 'Writer',
      roleId: writerRole.id,
    });
    createdUserIds.push(reader.id, writer.id);
    writerUserId = writer.id;
    writerEmail = writer.email;

    // Real sessions issued by the application's own login path.
    readerToken = (await authService.createSessionForUser(reader.id)).token;
    writerToken = (await authService.createSessionForUser(writer.id)).token;
  });

  afterAll(async () => {
    if (!hasDbUrl) return;
    for (const id of createdComponentIds) {
      await componentsService.delete(id).catch(() => undefined);
    }
    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    if (createdRoleIds.length > 0) {
      await db.delete(roles).where(inArray(roles.id, createdRoleIds));
    }
    if (app) {
      await app.close();
    }
    await closeDatabaseConnection();
  });

  async function createPendingFinding(
    issueType = 'MPN_MISSING',
    suggested: Record<string, unknown> = {
      manufacturerPartNumber: `AUTHFIX${runId}`,
    },
  ) {
    const component = await componentsService.create({
      sku: `E2E-AUTH-${runId}-${createdComponentIds.length}`,
      name: `Authorization Fixture ${createdComponentIds.length}`,
      unit: 'pcs',
    });
    createdComponentIds.push(component.id);

    const persisted = await reviewQueue.persistFindings([
      {
        componentId: component.id,
        issueType,
        issueCategory: issueType.startsWith('CATEGORY')
          ? 'CLASSIFICATION'
          : 'IDENTITY',
        field: 'manufacturerPartNumber',
        title: `Auth fixture ${issueType}`,
        description: `Auth fixture ${issueType}`,
        currentValue: { manufacturerPartNumber: null },
        suggestedValue: suggested,
        confidence: 0.95,
        confidenceLevel: 'HIGH',
        evidence: [],
        source: 'analyzer:identity',
        intelligenceVersion: 'test-v1',
        componentUpdatedAt: component.updatedAt,
      },
    ]);

    return { component, finding: persisted.findings[0]! };
  }

  it('rejects an unauthenticated apply with 401 and does not mutate the component', async () => {
    if (!hasDbUrl) return;
    const { component, finding } = await createPendingFinding();

    const response = await http()
      .post(APPLY_ROUTE(finding.id))
      .send({ expectedFingerprint: finding.fingerprint });

    expect(response.status).toBe(401);

    const reloaded = await componentsService.getComponent(component.id);
    expect(reloaded.manufacturerPartNumber).toBeNull();
    expect((await reviewQueue.getFinding(finding.id)).status).toBe('PENDING');
  });

  it('rejects an invalid session token with 401', async () => {
    if (!hasDbUrl) return;
    const { component, finding } = await createPendingFinding();

    const response = await http()
      .post(APPLY_ROUTE(finding.id))
      .set('Authorization', 'Bearer not-a-real-session-token')
      .send({ expectedFingerprint: finding.fingerprint });

    expect(response.status).toBe(401);
    const reloaded = await componentsService.getComponent(component.id);
    expect(reloaded.manufacturerPartNumber).toBeNull();
  });

  it('rejects an authenticated user without the component-write permission with 403', async () => {
    if (!hasDbUrl) return;
    const { component, finding } = await createPendingFinding();

    const response = await http()
      .post(APPLY_ROUTE(finding.id))
      .set('Authorization', `Bearer ${readerToken}`)
      .send({ expectedFingerprint: finding.fingerprint });

    expect(response.status).toBe(403);
    expect(String(responseBody(response).message)).toContain(
      'Inventory.Update',
    );

    // Nothing changed for an unauthorized caller.
    const reloaded = await componentsService.getComponent(component.id);
    expect(reloaded.manufacturerPartNumber).toBeNull();
    expect((await reviewQueue.getFinding(finding.id)).status).toBe('PENDING');

    const feedback = await db
      .select()
      .from(aiSuggestionFeedback)
      .where(eq(aiSuggestionFeedback.componentId, component.id));
    expect(feedback.length).toBe(0);
  });

  it('applies successfully for an authorized user and records that reviewer', async () => {
    if (!hasDbUrl) return;
    const { component, finding } = await createPendingFinding();

    const response = await http()
      .post(APPLY_ROUTE(finding.id))
      .set('Authorization', `Bearer ${writerToken}`)
      .send({ expectedFingerprint: finding.fingerprint });

    expect(response.status).toBe(201);
    expect(responseBody(response).appliedValue).toBe(`AUTHFIX${runId}`);
    expect(responseBody(response).component?.manufacturerPartNumber).toBe(
      `AUTHFIX${runId}`,
    );

    const reloaded = await componentsService.getComponent(component.id);
    expect(reloaded.manufacturerPartNumber).toBe(`AUTHFIX${runId}`);

    // Reviewer identity comes from the authenticated principal.
    const stored = await reviewQueue.getFinding(finding.id);
    expect(stored.status).toBe('ACCEPTED');
    expect(stored.reviewerId).toBe(writerUserId);
    expect(stored.reviewerEmail).toBe(writerEmail);

    const feedback = await db
      .select()
      .from(aiSuggestionFeedback)
      .where(eq(aiSuggestionFeedback.componentId, component.id));
    expect(feedback.length).toBe(1);
    expect(feedback[0]!.reviewerId).toBe(writerUserId);
    expect(feedback[0]!.reviewerEmail).toBe(writerEmail);
  });

  it('ignores or rejects body-supplied reviewer identity', async () => {
    if (!hasDbUrl) return;
    const { finding } = await createPendingFinding();

    // Identity fields are not part of the DTO, so whitelist validation rejects
    // them rather than silently trusting the caller.
    const rejected = await http()
      .post(APPLY_ROUTE(finding.id))
      .set('Authorization', `Bearer ${writerToken}`)
      .send({
        expectedFingerprint: finding.fingerprint,
        reviewerId: '00000000-0000-4000-8000-000000000000',
        reviewerEmail: 'attacker@example.com',
      });

    expect(rejected.status).toBe(400);
    const stored = await reviewQueue.getFinding(finding.id);
    expect(stored.status).toBe('PENDING');
    expect(stored.reviewerEmail).not.toBe('attacker@example.com');

    // Applying legitimately afterwards records the authenticated identity only.
    const ok = await http()
      .post(APPLY_ROUTE(finding.id))
      .set('Authorization', `Bearer ${writerToken}`)
      .send({ expectedFingerprint: finding.fingerprint });
    expect(ok.status).toBe(201);

    const applied = await reviewQueue.getFinding(finding.id);
    expect(applied.reviewerId).toBe(writerUserId);
    expect(applied.reviewerEmail).toBe(writerEmail);
  });

  it('leaves the read endpoints open, matching the rest of the API', async () => {
    if (!hasDbUrl) return;

    const list = await http().get(
      '/ml/components/review-queue?page=1&pageSize=1',
    );
    expect(list.status).toBe(200);

    const { finding } = await createPendingFinding();
    const detail = await http().get(
      `/ml/components/review-queue/${finding.id}`,
    );
    expect(detail.status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // Pass 4.2 — decision authorization
  // -------------------------------------------------------------------------

  describe('decision', () => {
    it('rejects an unauthenticated decision with 401 and leaves the finding pending', async () => {
      if (!hasDbUrl) return;
      const { finding } = await createPendingFinding();

      const response = await http()
        .post(DECISION_ROUTE(finding.id))
        .send({ decision: 'REJECTED' });

      expect(response.status).toBe(401);
      expect((await reviewQueue.getFinding(finding.id)).status).toBe('PENDING');
    });

    it('rejects an invalid session token with 401', async () => {
      if (!hasDbUrl) return;
      const { finding } = await createPendingFinding();

      const response = await http()
        .post(DECISION_ROUTE(finding.id))
        .set('Authorization', 'Bearer not-a-real-session-token')
        .send({ decision: 'REJECTED' });

      expect(response.status).toBe(401);
      expect((await reviewQueue.getFinding(finding.id)).status).toBe('PENDING');
    });

    it('rejects an authenticated read-only user with 403', async () => {
      if (!hasDbUrl) return;
      const { component, finding } = await createPendingFinding();

      const response = await http()
        .post(DECISION_ROUTE(finding.id))
        .set('Authorization', `Bearer ${readerToken}`)
        .send({ decision: 'REJECTED' });

      expect(response.status).toBe(403);
      expect(String(responseBody(response).message)).toContain(
        'Inventory.Update',
      );

      const stored = await reviewQueue.getFinding(finding.id);
      expect(stored.status).toBe('PENDING');
      expect(stored.reviewerId).toBeNull();

      // No feedback is written for a refused decision.
      const feedback = await db
        .select()
        .from(aiSuggestionFeedback)
        .where(eq(aiSuggestionFeedback.componentId, component.id));
      expect(feedback.length).toBe(0);
    });

    it('records the decision for an authorized user using the authenticated reviewer', async () => {
      if (!hasDbUrl) return;
      const { component, finding } = await createPendingFinding();

      const response = await http()
        .post(DECISION_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ decision: 'REJECTED', decisionNotes: 'Reviewed by fixture' });

      expect(response.status).toBe(201);

      const stored = await reviewQueue.getFinding(finding.id);
      expect(stored.status).toBe('REJECTED');
      expect(stored.reviewerId).toBe(writerUserId);
      expect(stored.reviewerEmail).toBe(writerEmail);
      expect(stored.decisionNotes).toBe('Reviewed by fixture');

      // Decision semantics are unchanged: a decision never applies the
      // suggestion to the component.
      const reloaded = await componentsService.getComponent(component.id);
      expect(reloaded.manufacturerPartNumber).toBeNull();

      const feedback = await db
        .select()
        .from(aiSuggestionFeedback)
        .where(eq(aiSuggestionFeedback.componentId, component.id));
      expect(feedback.length).toBe(1);
      expect(feedback[0]!.userAction).toBe('REJECTED');
      expect(feedback[0]!.reviewerId).toBe(writerUserId);
    });

    it('rejects body-supplied reviewer identity on a decision', async () => {
      if (!hasDbUrl) return;
      const { finding } = await createPendingFinding();

      const response = await http()
        .post(DECISION_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          decision: 'REJECTED',
          reviewerId: '00000000-0000-4000-8000-000000000000',
          reviewerEmail: 'attacker@example.com',
        });

      expect(response.status).toBe(400);
      const stored = await reviewQueue.getFinding(finding.id);
      expect(stored.status).toBe('PENDING');
      expect(stored.reviewerEmail).not.toBe('attacker@example.com');
    });

    it('keeps lifecycle semantics unchanged for an authorized user', async () => {
      if (!hasDbUrl) return;

      // PENDING → DISMISSED, then the second decision is refused as before.
      const { finding } = await createPendingFinding();
      const dismissed = await http()
        .post(DECISION_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ decision: 'DISMISSED' });
      expect(dismissed.status).toBe(201);
      expect((await reviewQueue.getFinding(finding.id)).status).toBe(
        'DISMISSED',
      );

      const again = await http()
        .post(DECISION_ROUTE(finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ decision: 'REJECTED' });
      expect(again.status).toBe(409);
      expect((await reviewQueue.getFinding(finding.id)).status).toBe(
        'DISMISSED',
      );

      // A stale finding still cannot be accepted.
      const stale = await createPendingFinding();
      await reviewQueue.markFindingsStale({
        ids: [stale.finding.id],
        reason: 'authorization fixture',
      });
      const accept = await http()
        .post(DECISION_ROUTE(stale.finding.id))
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ decision: 'ACCEPTED' });
      expect(accept.status).toBe(409);
      expect((await reviewQueue.getFinding(stale.finding.id)).status).toBe(
        'STALE',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Pass 4.2 — audit authorization
  // -------------------------------------------------------------------------

  describe('audit', () => {
    it('rejects an unauthenticated audit with 401', async () => {
      if (!hasDbUrl) return;

      const response = await http()
        .post(AUDIT_ROUTE)
        .send({ scope: 'RECENTLY_UPDATED', limit: 1 });

      expect(response.status).toBe(401);
    });

    it('rejects an invalid session token with 401', async () => {
      if (!hasDbUrl) return;

      const response = await http()
        .post(AUDIT_ROUTE)
        .set('Authorization', 'Bearer not-a-real-session-token')
        .send({ scope: 'RECENTLY_UPDATED', limit: 1 });

      expect(response.status).toBe(401);
    });

    it('rejects an authenticated read-only user with 403 and persists nothing', async () => {
      if (!hasDbUrl) return;

      const component = await componentsService.create({
        sku: `E2E-AUDIT-AUTH-${runId}`,
        name: 'Audit authorization fixture',
        unit: 'pcs',
      });
      createdComponentIds.push(component.id);

      const before = await reviewQueue.listFindings({
        componentId: component.id,
      });

      const response = await http()
        .post(AUDIT_ROUTE)
        .set('Authorization', `Bearer ${readerToken}`)
        .send({ scope: 'SELECTED', componentIds: [component.id] });

      expect(response.status).toBe(403);

      const after = await reviewQueue.listFindings({
        componentId: component.id,
      });
      expect(after.total).toBe(before.total);
    });

    it('runs the audit for an authorized user', async () => {
      if (!hasDbUrl) return;

      const component = await componentsService.create({
        sku: `E2E-AUDIT-OK-${runId}`,
        name: 'Audit authorization success fixture',
        unit: 'pcs',
      });
      createdComponentIds.push(component.id);

      const response = await http()
        .post(AUDIT_ROUTE)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ scope: 'SELECTED', componentIds: [component.id], limit: 1 });

      expect(response.status).toBe(201);
      expect(responseBody(response).analyzedCount).toBe(1);

      // The audit never mutates the component itself.
      const reloaded = await componentsService.getComponent(component.id);
      expect(reloaded.manufacturerPartNumber).toBeNull();
      expect(reloaded.categoryId).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Pass 4.2 — remaining write routes
  // -------------------------------------------------------------------------

  describe('findings and mark-stale write routes', () => {
    it('require authentication', async () => {
      if (!hasDbUrl) return;

      const persist = await http()
        .post(`${QUEUE_ROUTE}/findings`)
        .send({ findings: [] });
      expect(persist.status).toBe(401);

      const stale = await http()
        .post(`${QUEUE_ROUTE}/mark-stale`)
        .send({ reason: 'authorization probe' });
      expect(stale.status).toBe(401);
    });

    it('reject an authenticated read-only user', async () => {
      if (!hasDbUrl) return;

      const persist = await http()
        .post(`${QUEUE_ROUTE}/findings`)
        .set('Authorization', `Bearer ${readerToken}`)
        .send({ findings: [] });
      expect(persist.status).toBe(403);

      const { finding } = await createPendingFinding();
      const stale = await http()
        .post(`${QUEUE_ROUTE}/mark-stale`)
        .set('Authorization', `Bearer ${readerToken}`)
        .send({ ids: [finding.id], reason: 'authorization probe' });

      expect(stale.status).toBe(403);
      expect((await reviewQueue.getFinding(finding.id)).status).toBe('PENDING');
    });
  });

  it('keeps duplicate findings non-applicable for an authorized user', async () => {
    if (!hasDbUrl) return;

    const canonical = await componentsService.create({
      sku: `E2E-AUTH-DUPA-${runId}`,
      name: 'Authorization duplicate fixture A',
      manufacturerPartNumber: `AUTHDUP${runId}`,
      unit: 'pcs',
    });
    const duplicate = await componentsService.create({
      sku: `E2E-AUTH-DUPB-${runId}`,
      name: 'Authorization duplicate fixture B',
      manufacturerPartNumber: `AUTHDUP${runId}`,
      unit: 'pcs',
    });
    createdComponentIds.push(canonical.id, duplicate.id);

    const persisted = await reviewQueue.persistFindings([
      {
        componentId: duplicate.id,
        relatedComponentId: canonical.id,
        issueType: 'EXACT_DUPLICATE',
        issueCategory: 'DUPLICATE',
        field: 'duplicate',
        title: 'Duplicate',
        description: 'Authorization duplicate fixture',
        currentValue: { manufacturerPartNumber: `AUTHDUP${runId}` },
        suggestedValue: { duplicateOfComponentId: canonical.id },
        confidence: 1,
        confidenceLevel: 'HIGH',
        evidence: [],
        source: 'analyzer:duplicate',
        intelligenceVersion: 'test-v1',
        componentUpdatedAt: duplicate.updatedAt,
      },
    ]);
    const finding = persisted.findings[0]!;

    const response = await http()
      .post(APPLY_ROUTE(finding.id))
      .set('Authorization', `Bearer ${writerToken}`)
      .send({ expectedFingerprint: finding.fingerprint });

    // Authorization passes; the finding type itself is still refused.
    expect(response.status).toBe(409);
    expect(responseBody(response).reason).toBe('UNSUPPORTED_FINDING_TYPE');

    const [left, right] = await Promise.all([
      componentsService.getComponent(canonical.id),
      componentsService.getComponent(duplicate.id),
    ]);
    expect(left.manufacturerPartNumber).toBe(`AUTHDUP${runId}`);
    expect(right.manufacturerPartNumber).toBe(`AUTHDUP${runId}`);
  });
});

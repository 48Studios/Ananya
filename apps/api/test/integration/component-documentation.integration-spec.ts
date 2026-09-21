import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { RolesService } from '../../src/roles/roles.service';
import { UsersService } from '../../src/users/users.service';
import { ComponentsService } from '../../src/components/components.service';
import { StorageService } from '../../src/documents/storage.service';
import { db, closeDatabaseConnection } from '@ananya/database';
import {
  activityEvents,
  aiSuggestionFeedback,
  documents,
  documentVersions,
  roles,
  securityAuditLogs,
  users,
} from '@ananya/database/schema';
import { and, eq, ilike, inArray, or, sql } from '@ananya/database/query';

/** Typed view of documentation response bodies (supertest bodies are `any`). */
interface DocumentationBody {
  id?: string;
  title?: string;
  description?: string | null;
  documentType?: string;
  sourceType?: string;
  externalUrl?: string | null;
  externalUrlHost?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  currentVersion?: number;
  tags?: string[];
  uploadedById?: string | null;
  downloadPath?: string | null;
  previewPath?: string | null;
  message?: string | string[];
  statusCode?: number;
}

interface VersionBody {
  id?: string;
  versionNumber?: number;
  fileName?: string;
  sizeBytes?: number;
  changelog?: string | null;
}

/**
 * Pass 1: Component Documentation over HTTP.
 *
 * Exercises the full stack (guards → validation → service → storage → database)
 * for both source kinds, because none of the behaviour asserted here can be
 * proven by a service-level test: route wiring, multipart parsing, header
 * construction, permission enforcement and cleanup all live above the service.
 */
describe('Component Documentation', () => {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  const runId = Date.now();

  let app: INestApplication;
  let authService: AuthService;
  let rolesService: RolesService;
  let usersService: UsersService;
  let componentsService: ComponentsService;
  let storageService: StorageService;

  const createdRoleIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdComponentIds: string[] = [];
  let storageRoot = '';

  let writerToken = '';
  let writerUserId = '';
  let writerEmail = '';
  let readerToken = '';
  let componentId = '';

  const PDF_BYTES = Buffer.from('%PDF-1.4 ananya datasheet fixture');
  const PDF_V2_BYTES = Buffer.from('%PDF-1.4 ananya datasheet revision two');

  function http() {
    return request(app.getHttpServer() as Parameters<typeof request>[0]);
  }

  function body(response: { body: unknown }): DocumentationBody {
    return response.body as DocumentationBody;
  }

  function versionBody(response: { body: unknown }): VersionBody[] {
    return response.body as VersionBody[];
  }

  /** Multipart upload helper: metadata fields plus one file. */
  function uploadRequest(
    url: string,
    token: string,
    fields: Record<string, string>,
    file: { buffer: Buffer; filename: string; contentType: string },
  ) {
    let builder = http().post(url).set('Authorization', `Bearer ${token}`);
    for (const [key, value] of Object.entries(fields)) {
      builder = builder.field(key, value);
    }
    return builder.attach('file', file.buffer, {
      filename: file.filename,
      contentType: file.contentType,
    });
  }

  /** Reads a binary response body, which supertest does not parse by default. */
  function readBinary(response: request.Response): Buffer {
    return Buffer.isBuffer(response.body)
      ? response.body
      : Buffer.from(response.text ?? '', 'binary');
  }

  beforeAll(async () => {
    if (!hasDbUrl) return;

    // Storage is configured before the application is instantiated so the
    // provider under test writes into a disposable directory.
    storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ananya-docs-e2e-'));
    process.env.STORAGE_DRIVER = 'local';
    process.env.STORAGE_LOCAL_PATH = storageRoot;

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
    storageService = app.get(StorageService);

    const readerRole = await rolesService.create({
      name: `E2E Docs Reader ${runId}`,
      description: 'Documentation fixture: read-only inventory access',
      permissions: ['Inventory.Read'],
    });
    const writerRole = await rolesService.create({
      name: `E2E Docs Writer ${runId}`,
      description: 'Documentation fixture: component edit access',
      permissions: ['Inventory.Read', 'Inventory.Update'],
    });
    createdRoleIds.push(readerRole.id, writerRole.id);

    const reader = await usersService.create({
      email: `docs-reader-${runId}@ananya.local`,
      password: 'ReaderPassw0rd!',
      firstName: 'Docs',
      lastName: 'Reader',
      roleId: readerRole.id,
    });
    const writer = await usersService.create({
      email: `docs-writer-${runId}@ananya.local`,
      password: 'WriterPassw0rd!',
      firstName: 'Docs',
      lastName: 'Writer',
      roleId: writerRole.id,
    });
    createdUserIds.push(reader.id, writer.id);
    writerUserId = writer.id;
    writerEmail = writer.email;

    // Real sessions issued through the application's own login path.
    readerToken = (await authService.createSessionForUser(reader.id)).token;
    writerToken = (await authService.createSessionForUser(writer.id)).token;

    const component = await componentsService.create({
      sku: `E2E-DOCS-${runId}`,
      name: `Documentation Fixture ${runId}`,
      unit: 'pcs',
    });
    createdComponentIds.push(component.id);
    componentId = component.id;
  });

  afterAll(async () => {
    if (!hasDbUrl) return;

    // Documentation has no foreign key to components, so its rows are removed
    // explicitly rather than left behind as residue.
    if (createdComponentIds.length > 0) {
      const ids = createdComponentIds.map((id) => String(id));
      await db
        .delete(documents)
        .where(
          and(
            eq(documents.entityType, 'Component'),
            inArray(documents.entityId, ids),
          ),
        );
    }
    // Feedback, activity and audit rows all name this suite's fixture component,
    // and none of them can be found once it is gone: `ai_suggestion_feedback`
    // nulls its subject (`ON DELETE SET NULL`), `activity_events.entity_id` is a
    // plain varchar with no FK at all, and the audit details carry the component id
    // in a jsonb blob. Deleting the component first is what produced this suite's
    // share of the orphaned Component activity events.
    if (createdComponentIds.length > 0) {
      await db
        .delete(aiSuggestionFeedback)
        .where(inArray(aiSuggestionFeedback.componentId, createdComponentIds));
      await db
        .delete(activityEvents)
        .where(
          and(
            eq(activityEvents.entityType, 'Component'),
            inArray(activityEvents.entityId, createdComponentIds),
          ),
        );
      await db.delete(securityAuditLogs).where(
        sql`${securityAuditLogs.details}->>'componentId' IN (${sql.join(
          createdComponentIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
    }
    // Actor rows carry the fixture address with `user_id` NULL; `ROLE_CREATED`
    // carries neither id nor email, only `details->>'roleId'`.
    await db
      .delete(securityAuditLogs)
      .where(
        or(
          ilike(
            securityAuditLogs.userEmail,
            `docs-reader-${runId}@ananya.local`,
          ),
          ilike(
            securityAuditLogs.userEmail,
            `docs-writer-${runId}@ananya.local`,
          ),
        ),
      );
    if (createdRoleIds.length > 0) {
      await db.delete(securityAuditLogs).where(
        sql`${securityAuditLogs.details}->>'roleId' IN (${sql.join(
          createdRoleIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
    }
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
    if (storageRoot) {
      fs.rmSync(storageRoot, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // Uploaded files
  // -------------------------------------------------------------------------

  describe('uploaded files', () => {
    let uploadedId = '';
    let uploadedStorageKey = '';

    it('uploads a file and returns typed documentation metadata', async () => {
      if (!hasDbUrl) return;

      const response = await uploadRequest(
        '/documents/upload',
        writerToken,
        {
          entityType: 'Component',
          entityId: componentId,
          documentType: 'DATASHEET',
          title: 'RC0805 Datasheet',
          description: 'Primary manufacturer datasheet',
          tags: 'power, resistor, smd',
        },
        {
          buffer: PDF_BYTES,
          filename: 'RC0805-datasheet.pdf',
          contentType: 'application/pdf',
        },
      );

      expect(response.status).toBe(201);
      const created = body(response);
      expect(created.documentType).toBe('DATASHEET');
      expect(created.sourceType).toBe('UPLOADED_FILE');
      expect(created.title).toBe('RC0805 Datasheet');
      expect(created.fileName).toBe('RC0805-datasheet.pdf');
      expect(created.mimeType).toBe('application/pdf');
      expect(created.sizeBytes).toBe(PDF_BYTES.length);
      expect(created.currentVersion).toBe(1);
      expect(created.tags).toEqual(['power', 'resistor', 'smd']);
      expect(created.externalUrl).toBeNull();
      expect(created.downloadPath).toContain('/download');
      expect(created.previewPath).toContain('/preview');
      // The uploader is the authenticated principal, not a body field.
      expect(created.uploadedById).toBe(writerUserId);

      uploadedId = created.id!;

      const [row] = await db
        .select()
        .from(documents)
        .where(eq(documents.id, uploadedId));
      expect(row?.storageKey).toBeTruthy();
      uploadedStorageKey = row!.storageKey!;
      // The stored object really exists on disk.
      expect(await storageService.exists(uploadedStorageKey)).toBe(true);
    });

    it('creates version 1 alongside the document', async () => {
      if (!hasDbUrl) return;

      const response = await http()
        .get(`/documents/${uploadedId}/versions`)
        .set('Authorization', `Bearer ${readerToken}`);

      expect(response.status).toBe(200);
      const versions = versionBody(response);
      expect(versions).toHaveLength(1);
      expect(versions[0]!.versionNumber).toBe(1);
      expect(versions[0]!.changelog).toBe('Initial upload (v1)');
    });

    it('lists documentation for the component', async () => {
      if (!hasDbUrl) return;

      const response = await http()
        .get(`/documents/entity/Component/${componentId}`)
        .set('Authorization', `Bearer ${readerToken}`);

      expect(response.status).toBe(200);
      const list = response.body as DocumentationBody[];
      expect(list.some((item) => item.id === uploadedId)).toBe(true);
      expect(list[0]!.sourceType).toBeDefined();
    });

    it('returns a single document by id', async () => {
      if (!hasDbUrl) return;

      const response = await http()
        .get(`/documents/${uploadedId}`)
        .set('Authorization', `Bearer ${readerToken}`);

      expect(response.status).toBe(200);
      expect(body(response).id).toBe(uploadedId);
      expect(body(response).documentType).toBe('DATASHEET');
    });

    it('downloads the stored bytes with attachment headers', async () => {
      if (!hasDbUrl) return;

      const response = await http()
        .get(`/documents/${uploadedId}/download`)
        .set('Authorization', `Bearer ${readerToken}`)
        .buffer(true);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/pdf');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain(
        'RC0805-datasheet.pdf',
      );
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(readBinary(response).equals(PDF_BYTES)).toBe(true);
    });

    it('serves the same bytes inline for preview', async () => {
      if (!hasDbUrl) return;

      const response = await http()
        .get(`/documents/${uploadedId}/preview`)
        .set('Authorization', `Bearer ${readerToken}`)
        .buffer(true);

      expect(response.status).toBe(200);
      expect(response.headers['content-disposition']).toContain('inline');
      expect(readBinary(response).equals(PDF_BYTES)).toBe(true);
    });

    it('records activity and security audit entries for the upload', async () => {
      if (!hasDbUrl) return;

      const events = await db
        .select()
        .from(activityEvents)
        .where(
          and(
            eq(activityEvents.entityType, 'Component'),
            eq(activityEvents.entityId, componentId),
            eq(activityEvents.eventType, 'DOCUMENT_UPLOADED'),
          ),
        );
      expect(events.length).toBeGreaterThan(0);

      const audits = await db
        .select()
        .from(securityAuditLogs)
        .where(
          and(
            eq(securityAuditLogs.action, 'DOCUMENT_UPLOAD'),
            eq(securityAuditLogs.userId, writerUserId),
          ),
        );
      expect(audits.length).toBeGreaterThan(0);
      expect(audits[0]!.userEmail).toBe(writerEmail);
    });
  });

  // -------------------------------------------------------------------------
  // External references
  // -------------------------------------------------------------------------

  describe('external references', () => {
    let externalId = '';

    it('creates a link with no file metadata', async () => {
      if (!hasDbUrl) return;

      const response = await http()
        .post('/documents/external-url')
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          entityType: 'Component',
          entityId: componentId,
          documentType: 'PRODUCT_PAGE',
          title: 'Manufacturer product page',
          url: 'https://www.vishay.com/en/product/88746/',
          tags: ['manufacturer'],
        });

      expect(response.status).toBe(201);
      const created = body(response);
      expect(created.sourceType).toBe('EXTERNAL_URL');
      expect(created.externalUrl).toBe(
        'https://www.vishay.com/en/product/88746/',
      );
      expect(created.externalUrlHost).toBe('www.vishay.com');
      // Nothing is faked: there is no stored object behind this record.
      expect(created.fileName).toBeNull();
      expect(created.mimeType).toBeNull();
      expect(created.sizeBytes).toBeNull();
      expect(created.downloadPath).toBeNull();
      expect(created.previewPath).toBeNull();

      externalId = created.id!;
    });

    it('appears in the component documentation list', async () => {
      if (!hasDbUrl) return;

      const response = await http()
        .get(`/documents/entity/Component/${componentId}`)
        .set('Authorization', `Bearer ${readerToken}`);

      const list = response.body as DocumentationBody[];
      const external = list.find((item) => item.id === externalId);
      expect(external).toBeDefined();
      expect(external!.sourceType).toBe('EXTERNAL_URL');
    });

    it('has no file versions', async () => {
      if (!hasDbUrl) return;

      const response = await http()
        .get(`/documents/${externalId}/versions`)
        .set('Authorization', `Bearer ${readerToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('refuses download instead of pretending to be a local file', async () => {
      if (!hasDbUrl) return;

      const response = await http()
        .get(`/documents/${externalId}/download`)
        .set('Authorization', `Bearer ${readerToken}`);

      expect(response.status).toBe(400);
      expect(String(body(response).message)).toContain('external reference');
    });

    it('records a distinct activity event for the reference', async () => {
      if (!hasDbUrl) return;

      const events = await db
        .select()
        .from(activityEvents)
        .where(
          and(
            eq(activityEvents.entityId, componentId),
            eq(activityEvents.eventType, 'DOCUMENT_EXTERNAL_REFERENCE_CREATED'),
          ),
        );
      expect(events.length).toBeGreaterThan(0);
    });

    it('rejects a non-http URL', async () => {
      if (!hasDbUrl) return;

      const response = await http()
        .post('/documents/external-url')
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          entityType: 'Component',
          entityId: componentId,
          documentType: 'PRODUCT_PAGE',
          url: 'javascript:alert(1)',
        });

      expect(response.status).toBe(400);
    });

    it('rejects a document type outside the vocabulary', async () => {
      if (!hasDbUrl) return;

      const response = await http()
        .post('/documents/external-url')
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          entityType: 'Component',
          entityId: componentId,
          documentType: 'SPEC_SHEET',
          url: 'https://example.com/a',
        });

      expect(response.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // Versions
  // -------------------------------------------------------------------------

  describe('versions', () => {
    let versionedId = '';

    it('creates a second version without touching the first', async () => {
      if (!hasDbUrl) return;

      const created = await uploadRequest(
        '/documents/upload',
        writerToken,
        {
          entityType: 'Component',
          entityId: componentId,
          documentType: 'TECHNICAL_MANUAL',
          title: 'Manual',
        },
        {
          buffer: PDF_BYTES,
          filename: 'manual.pdf',
          contentType: 'application/pdf',
        },
      );
      expect(created.status).toBe(201);
      versionedId = body(created).id!;

      const response = await uploadRequest(
        `/documents/${versionedId}/version`,
        writerToken,
        { changelog: 'Added thermal derating table' },
        {
          buffer: PDF_V2_BYTES,
          filename: 'manual-rev2.pdf',
          contentType: 'application/pdf',
        },
      );

      expect(response.status).toBe(201);
      expect(body(response).currentVersion).toBe(2);
      expect(body(response).fileName).toBe('manual-rev2.pdf');
      expect(body(response).sizeBytes).toBe(PDF_V2_BYTES.length);
    });

    it('lists both revisions newest first', async () => {
      if (!hasDbUrl) return;

      const response = await http()
        .get(`/documents/${versionedId}/versions`)
        .set('Authorization', `Bearer ${readerToken}`);

      const versions = versionBody(response);
      expect(versions).toHaveLength(2);
      expect(versions[0]!.versionNumber).toBe(2);
      expect(versions[0]!.changelog).toBe('Added thermal derating table');
      expect(versions[1]!.versionNumber).toBe(1);
    });

    it('keeps each revision retrievable separately', async () => {
      if (!hasDbUrl) return;

      const current = await http()
        .get(`/documents/${versionedId}/download`)
        .set('Authorization', `Bearer ${readerToken}`)
        .buffer(true);
      expect(readBinary(current).equals(PDF_V2_BYTES)).toBe(true);

      const first = await http()
        .get(`/documents/${versionedId}/download?version=1`)
        .set('Authorization', `Bearer ${readerToken}`)
        .buffer(true);
      expect(first.status).toBe(200);
      expect(readBinary(first).equals(PDF_BYTES)).toBe(true);

      const missing = await http()
        .get(`/documents/${versionedId}/download?version=99`)
        .set('Authorization', `Bearer ${readerToken}`);
      expect(missing.status).toBe(404);

      const malformed = await http()
        .get(`/documents/${versionedId}/download?version=abc`)
        .set('Authorization', `Bearer ${readerToken}`);
      expect(malformed.status).toBe(400);
    });

    it('refuses to version an external reference', async () => {
      if (!hasDbUrl) return;

      const list = await http()
        .get(`/documents/entity/Component/${componentId}`)
        .set('Authorization', `Bearer ${readerToken}`);
      const external = (list.body as DocumentationBody[]).find(
        (item) => item.sourceType === 'EXTERNAL_URL',
      );

      const response = await uploadRequest(
        `/documents/${external!.id}/version`,
        writerToken,
        {},
        {
          buffer: PDF_BYTES,
          filename: 'manual.pdf',
          contentType: 'application/pdf',
        },
      );

      expect(response.status).toBe(409);
    });
  });

  // -------------------------------------------------------------------------
  // Metadata
  // -------------------------------------------------------------------------

  describe('metadata updates', () => {
    let targetId = '';

    it('updates metadata through PATCH', async () => {
      if (!hasDbUrl) return;

      const created = await uploadRequest(
        '/documents/upload',
        writerToken,
        {
          entityType: 'Component',
          entityId: componentId,
          documentType: 'OTHER',
          title: 'Untitled upload',
        },
        {
          buffer: PDF_BYTES,
          filename: 'notes.pdf',
          contentType: 'application/pdf',
        },
      );
      targetId = body(created).id!;

      const response = await http()
        .patch(`/documents/${targetId}`)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          title: 'Application note',
          description: 'Thermal behaviour under load',
          documentType: 'APPLICATION_NOTE',
          tags: ['thermal'],
          isConfidential: true,
        });

      expect(response.status).toBe(200);
      const updated = body(response);
      expect(updated.title).toBe('Application note');
      expect(updated.description).toBe('Thermal behaviour under load');
      expect(updated.documentType).toBe('APPLICATION_NOTE');
      expect(updated.tags).toEqual(['thermal']);
    });

    it('records an DOCUMENT_UPDATED activity event', async () => {
      if (!hasDbUrl) return;

      const events = await db
        .select()
        .from(activityEvents)
        .where(
          and(
            eq(activityEvents.eventType, 'DOCUMENT_UPDATED'),
            eq(activityEvents.entityId, componentId),
          ),
        );
      expect(events.length).toBeGreaterThan(0);
    });

    it('does not expose the removed POST verb for metadata', async () => {
      if (!hasDbUrl) return;

      // The web client used to call POST here while the controller only
      // accepted PATCH; the fix is asserted so it cannot regress.
      const response = await http()
        .post(`/documents/${targetId}`)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ title: 'Nope' });

      expect(response.status).toBe(404);
    });

    it('rejects unknown metadata fields', async () => {
      if (!hasDbUrl) return;

      const response = await http()
        .patch(`/documents/${targetId}`)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ storageKey: '/etc/passwd' });

      expect(response.status).toBe(400);
    });

    it('refuses a link update on an uploaded file', async () => {
      if (!hasDbUrl) return;

      const response = await http()
        .patch(`/documents/${targetId}`)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ externalUrl: 'https://example.com/replacement' });

      expect(response.status).toBe(400);
      expect(String(body(response).message)).toContain('external references');
    });
  });

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------

  describe('deletion', () => {
    it('removes the record, its revisions and its stored file', async () => {
      if (!hasDbUrl) return;

      const created = await uploadRequest(
        '/documents/upload',
        writerToken,
        {
          entityType: 'Component',
          entityId: componentId,
          documentType: 'CERTIFICATE',
          title: 'To be deleted',
        },
        {
          buffer: PDF_BYTES,
          filename: 'certificate.pdf',
          contentType: 'application/pdf',
        },
      );
      const id = body(created).id!;

      // A second revision so the cascade is genuinely exercised.
      await uploadRequest(
        `/documents/${id}/version`,
        writerToken,
        { changelog: 'second' },
        {
          buffer: PDF_V2_BYTES,
          filename: 'certificate-v2.pdf',
          contentType: 'application/pdf',
        },
      );

      const storedKeys = await db
        .select({ storageKey: documentVersions.storageKey })
        .from(documentVersions)
        .where(eq(documentVersions.documentId, id));
      expect(storedKeys).toHaveLength(2);

      const response = await http()
        .delete(`/documents/${id}`)
        .set('Authorization', `Bearer ${writerToken}`);

      expect(response.status).toBe(200);
      expect(body(response).id).toBe(id);

      const gone = await http()
        .get(`/documents/${id}`)
        .set('Authorization', `Bearer ${readerToken}`);
      expect(gone.status).toBe(404);

      const orphanVersions = await db
        .select()
        .from(documentVersions)
        .where(eq(documentVersions.documentId, id));
      expect(orphanVersions).toHaveLength(0);

      // No orphaned storage objects.
      for (const key of storedKeys) {
        expect(await storageService.exists(key.storageKey)).toBe(false);
      }
    });

    it('records delete activity and a security audit entry', async () => {
      if (!hasDbUrl) return;

      const events = await db
        .select()
        .from(activityEvents)
        .where(eq(activityEvents.eventType, 'DOCUMENT_DELETED'));
      expect(events.length).toBeGreaterThan(0);

      const audits = await db
        .select()
        .from(securityAuditLogs)
        .where(eq(securityAuditLogs.action, 'DOCUMENT_DELETE'));
      expect(audits.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  describe('validation', () => {
    it('rejects an upload with no file', async () => {
      if (!hasDbUrl) return;

      const response = await http()
        .post('/documents/upload')
        .set('Authorization', `Bearer ${writerToken}`)
        .field('entityType', 'Component')
        .field('entityId', componentId)
        .field('documentType', 'DATASHEET');

      expect(response.status).toBe(400);
    });

    it('rejects an unsupported file format', async () => {
      if (!hasDbUrl) return;

      const response = await uploadRequest(
        '/documents/upload',
        writerToken,
        {
          entityType: 'Component',
          entityId: componentId,
          documentType: 'OTHER',
        },
        {
          buffer: Buffer.from('MZ binary'),
          filename: 'installer.exe',
          contentType: 'application/x-msdownload',
        },
      );

      expect(response.status).toBe(400);
      expect(String(body(response).message)).toContain(
        'Unsupported file format',
      );
    });

    it('accepts an engineering format browsers cannot type', async () => {
      if (!hasDbUrl) return;

      const response = await uploadRequest(
        '/documents/upload',
        writerToken,
        {
          entityType: 'Component',
          entityId: componentId,
          documentType: 'THREE_D_MODEL',
          title: 'Bracket model',
        },
        {
          buffer: Buffer.from('ISO-10303-21; fixture'),
          filename: 'bracket.step',
          contentType: '',
        },
      );

      expect(response.status).toBe(201);
      expect(body(response).mimeType).toBe('model/step');
    });

    it('rejects an unknown component', async () => {
      if (!hasDbUrl) return;

      const response = await uploadRequest(
        '/documents/upload',
        writerToken,
        {
          entityType: 'Component',
          entityId: '00000000-0000-0000-0000-000000000000',
          documentType: 'DATASHEET',
        },
        {
          buffer: PDF_BYTES,
          filename: 'x.pdf',
          contentType: 'application/pdf',
        },
      );

      expect(response.status).toBe(404);
    });

    it('rejects a missing document type', async () => {
      if (!hasDbUrl) return;

      const response = await uploadRequest(
        '/documents/upload',
        writerToken,
        { entityType: 'Component', entityId: componentId },
        {
          buffer: PDF_BYTES,
          filename: 'x.pdf',
          contentType: 'application/pdf',
        },
      );

      expect(response.status).toBe(400);
    });

    it('rejects a non-component entity type', async () => {
      if (!hasDbUrl) return;

      const response = await http()
        .get(`/documents/entity/Invoice/${componentId}`)
        .set('Authorization', `Bearer ${readerToken}`);

      expect(response.status).toBe(400);
      expect(String(body(response).message)).toContain(
        'Unsupported entity type',
      );
    });

    it('returns 404 for an unknown document id', async () => {
      if (!hasDbUrl) return;

      const response = await http()
        .get('/documents/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${readerToken}`);

      expect(response.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // Authorization
  // -------------------------------------------------------------------------

  describe('authorization', () => {
    it('rejects an unauthenticated list with 401', async () => {
      if (!hasDbUrl) return;

      const response = await http().get(
        `/documents/entity/Component/${componentId}`,
      );
      expect(response.status).toBe(401);
    });

    it('rejects an unauthenticated upload with 401', async () => {
      if (!hasDbUrl) return;

      const response = await http()
        .post('/documents/upload')
        .field('entityType', 'Component')
        .field('entityId', componentId)
        .field('documentType', 'DATASHEET')
        .attach('file', PDF_BYTES, {
          filename: 'x.pdf',
          contentType: 'application/pdf',
        });

      expect(response.status).toBe(401);
    });

    it('rejects an invalid session token with 401', async () => {
      if (!hasDbUrl) return;

      const response = await http()
        .get(`/documents/entity/Component/${componentId}`)
        .set('Authorization', 'Bearer not-a-real-session-token');

      expect(response.status).toBe(401);
    });

    it('lets a read-only user read but not write', async () => {
      if (!hasDbUrl) return;

      const list = await http()
        .get(`/documents/entity/Component/${componentId}`)
        .set('Authorization', `Bearer ${readerToken}`);
      expect(list.status).toBe(200);

      const uploadAttempt = await uploadRequest(
        '/documents/upload',
        readerToken,
        {
          entityType: 'Component',
          entityId: componentId,
          documentType: 'DATASHEET',
        },
        {
          buffer: PDF_BYTES,
          filename: 'forbidden.pdf',
          contentType: 'application/pdf',
        },
      );
      expect(uploadAttempt.status).toBe(403);
      expect(String(body(uploadAttempt).message)).toContain('Inventory.Update');

      const externalAttempt = await http()
        .post('/documents/external-url')
        .set('Authorization', `Bearer ${readerToken}`)
        .send({
          entityType: 'Component',
          entityId: componentId,
          documentType: 'PRODUCT_PAGE',
          url: 'https://example.com',
        });
      expect(externalAttempt.status).toBe(403);

      const tooManyFiles = await http()
        .get(`/documents/entity/Component/${componentId}`)
        .set('Authorization', `Bearer ${readerToken}`);
      expect((tooManyFiles.body as DocumentationBody[]).length).toBeGreaterThan(
        0,
      );
    });

    it('lets a read-only user download but not delete or edit', async () => {
      if (!hasDbUrl) return;

      const created = await uploadRequest(
        '/documents/upload',
        writerToken,
        {
          entityType: 'Component',
          entityId: componentId,
          documentType: 'TEST_REPORT',
          title: 'Authorization fixture',
        },
        {
          buffer: PDF_BYTES,
          filename: 'report.pdf',
          contentType: 'application/pdf',
        },
      );
      const id = body(created).id!;

      const download = await http()
        .get(`/documents/${id}/download`)
        .set('Authorization', `Bearer ${readerToken}`)
        .buffer(true);
      expect(download.status).toBe(200);

      const patch = await http()
        .patch(`/documents/${id}`)
        .set('Authorization', `Bearer ${readerToken}`)
        .send({ title: 'Read-only edit' });
      expect(patch.status).toBe(403);

      const remove = await http()
        .delete(`/documents/${id}`)
        .set('Authorization', `Bearer ${readerToken}`);
      expect(remove.status).toBe(403);

      const stillThere = await http()
        .get(`/documents/${id}`)
        .set('Authorization', `Bearer ${readerToken}`);
      expect(stillThere.status).toBe(200);
      expect(body(stillThere).title).toBe('Authorization fixture');

      // Housekeeping: the authorized user removes the fixture.
      await http()
        .delete(`/documents/${id}`)
        .set('Authorization', `Bearer ${writerToken}`)
        .expect(200);
    });
  });
});

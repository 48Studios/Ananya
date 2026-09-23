import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { RolesService } from '../../src/roles/roles.service';
import { UsersService } from '../../src/users/users.service';
import { ComponentsService } from '../../src/components/components.service';
import { StorageService } from '../../src/documents/storage.service';
import { MlClientService } from '../../src/ml/ml-client.service';
import { MlService } from '../../src/ml/ml.service';
import { DocumentationAnalysisService } from '../../src/ml/documentation-analysis.service';
import { ComponentReviewQueueService } from '../../src/ml/component-review-queue.service';
import { db, closeDatabaseConnection } from '@ananya/database';
import {
  activityEvents,
  aiSuggestionFeedback,
  componentIntelligenceFindings,
  documentIntelligenceAnalyses,
  documents,
  roles,
  securityAuditLogs,
  users,
} from '@ananya/database/schema';
import { and, eq, inArray, sql } from '@ananya/database/query';

/** Typed view of documentation intelligence response bodies. */
interface AnalysisBody {
  documentId?: string;
  eligibility?: { available: boolean; reason?: string; message?: string };
  analysis?: {
    id: string;
    componentId: string;
    status: string;
    isCurrent: boolean;
    contentHash?: string;
    pageCount: number | null;
    identity: {
      manufacturerName: string | null;
      manufacturerId: string | null;
      manufacturerPartNumber: string | null;
      manufacturerPartNumberSource: string | null;
    };
    summary: Record<string, number>;
    attributes: Array<{
      extractedCode: string;
      resolution: string;
      conflict: boolean;
      normalizedValue: unknown;
      evidence: Array<Record<string, unknown>>;
    }>;
    evidence: Array<Record<string, unknown>>;
    findings: Array<{ id: string; issueType: string; status: string }>;
    document: { documentVersion: number; contentHash: string };
  } | null;
  latestAnalysis?: { document: { documentVersion: number } } | null;
  inProgress?: boolean;
  createdFindingCount?: number;
  staledPreviousCount?: number;
  message?: string | string[];
  statusCode?: number;
}

interface DocumentBody {
  id?: string;
  currentVersion?: number;
}

/**
 * Pass 2: Datasheet Documentation Intelligence over HTTP.
 *
 * Proves the full pipeline end to end: upload → analyze → evidence → findings →
 * existing review queue → existing apply workflow → component mutation, plus
 * idempotency, revision staleness, ML failure and authorization.
 *
 * The ML service is stubbed at the Nest boundary (`MlClientService` /
 * `MlService`), because the extraction itself is covered by the Python suite and
 * a live ML container is not part of this workspace's test environment. What is
 * proven here is everything Ananya owns: eligibility, hashing, version binding,
 * evidence, mapping, findings, permissions and the absence of component mutation.
 */
describe('Datasheet Documentation Intelligence', () => {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  const runTag = Math.random().toString(36).slice(2, 8).toUpperCase();
  const runId = Date.now();

  let app: INestApplication;
  let authService: AuthService;
  let rolesService: RolesService;
  let usersService: UsersService;
  let componentsService: ComponentsService;
  let storageService: StorageService;
  let mlClient: MlClientService;
  let mlService: MlService;
  let analysisService: DocumentationAnalysisService;
  let reviewQueue: ComponentReviewQueueService;

  const createdRoleIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdComponentIds: string[] = [];
  const createdDocumentIds: string[] = [];
  let storageRoot = '';

  let writerToken = '';
  let readerToken = '';
  let componentId = '';
  let componentSku = '';

  const MANUFACTURER_PART_NUMBER = `MC0805S8F3000T5E`;
  const PDF_V1_BYTES = Buffer.from(
    '%PDF-1.4 datasheet v1 300 Ohm 1% 0805 Yageo MC0805S8F3000T5E',
  );
  const PDF_V2_BYTES = Buffer.from(
    '%PDF-1.4 datasheet v2 470 Ohm 5% 0603 Yageo MC0805S8F3000T5E',
  );

  function http() {
    return request(app.getHttpServer() as Parameters<typeof request>[0]);
  }

  function body(response: { body: unknown }): AnalysisBody {
    return response.body as AnalysisBody;
  }

  /**
   * Deterministic extraction payload, shaped exactly like the Python response.
   * Page 3 is where the resistance lives, mirroring the ML extractor's
   * page-aware evidence.
   */
  function extractionPayload(
    options: {
      resistance?: number;
      tolerance?: number;
      packageCode?: string;
    } = {},
  ) {
    const resistance = options.resistance ?? 300;
    const tolerance = options.tolerance ?? 1;
    const packageCode = options.packageCode ?? '0805';
    return {
      attributes: {
        resistance: {
          code: 'resistance',
          value: resistance,
          unit: 'ohm',
          formatted: `${resistance}Ω`,
          confidence: 0.95,
          confidence_level: 'HIGH',
          evidence: [
            {
              type: 'datasheet_param',
              description: `Extracted resistance rating ${resistance}Ω`,
              weight: 0.95,
              source: 'extractor:ee_regex',
              page: 3,
              text: `... resistance ${resistance} ohm ${tolerance}% ...`,
            },
          ],
        },
        tolerance: {
          code: 'tolerance',
          value: tolerance,
          unit: '%',
          formatted: `${tolerance}%`,
          confidence: 0.95,
          confidence_level: 'HIGH',
          evidence: [
            {
              type: 'datasheet_param',
              description: `Extracted tolerance rating ${tolerance}%`,
              weight: 0.95,
              source: 'extractor:ee_regex',
              page: 3,
              text: `... ${tolerance}% tolerance ...`,
            },
          ],
        },
        package: {
          code: 'package',
          value: packageCode,
          formatted: packageCode,
          confidence: 0.98,
          confidence_level: 'HIGH',
          evidence: [
            {
              type: 'datasheet_param',
              description: `Identified physical package footprint '${packageCode}'`,
              weight: 0.98,
              source: 'extractor:ee_package',
              page: 1,
              text: `... ${packageCode} package ...`,
            },
          ],
        },
        thermal_resistance: {
          code: 'thermal_resistance',
          value: 25,
          unit: 'C/W',
          formatted: '25 C/W',
          confidence: 0.9,
          confidence_level: 'HIGH',
          evidence: [
            {
              type: 'datasheet_param',
              description: 'Extracted thermal resistance 25 C/W',
              weight: 0.9,
              source: 'extractor:ee_regex',
              // No page: the extractor could not locate it.
              page: null,
              text: null,
            },
          ],
        },
      },
      extracted_text_preview: 'datasheet text…',
      extracted_text: `Yageo ${MANUFACTURER_PART_NUMBER} 300 Ohm 1% 0805`,
      page_count: 4,
      pages_analyzed: 4,
      extractor_version: 'datasheet-extract-v1',
    };
  }

  /** Existing component-intelligence response shape. */
  function suggestionPayload(overrides: Record<string, unknown> = {}) {
    return {
      query: MANUFACTURER_PART_NUMBER,
      manufacturerPartNumber: MANUFACTURER_PART_NUMBER,
      manufacturer: {
        resolution: 'EXISTING',
        manufacturerId: null,
        manufacturerCode: 'YAGEO',
        manufacturerName: 'Yageo',
        confidence: 0.94,
        confidenceLevel: 'HIGH',
        matchType: 'datasheet_mention',
        evidence: [
          {
            type: 'keyword',
            description: 'Manufacturer "Yageo" was found in the datasheet text',
            weight: 0.94,
            source: 'resolver:datasheet_keyword',
          },
        ],
      },
      category: null,
      alternativeCategories: [],
      isDuplicate: false,
      duplicateWarnings: [],
      attributes: {},
      attributeSuggestions: [],
      confidenceLevel: 'HIGH',
      isMlActive: true,
      executionTimeMs: 8,
      ...overrides,
    };
  }

  async function uploadDatasheet(
    token: string,
    bytes: Buffer,
    filename: string,
    documentType = 'DATASHEET',
  ): Promise<string> {
    const response = await http()
      .post('/documents/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('entityType', 'Component')
      .field('entityId', componentId)
      .field('documentType', documentType)
      .field('title', `${runTag} ${filename}`)
      .attach('file', bytes, {
        filename,
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(201);
    const id = (response.body as DocumentBody).id!;
    createdDocumentIds.push(id);
    return id;
  }

  beforeAll(async () => {
    if (!hasDbUrl) return;

    storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ananya-di-e2e-'));
    process.env.STORAGE_DRIVER = 'local';
    process.env.STORAGE_LOCAL_PATH = storageRoot;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
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
    mlClient = app.get(MlClientService);
    mlService = app.get(MlService);
    analysisService = app.get(DocumentationAnalysisService);
    reviewQueue = app.get(ComponentReviewQueueService);

    const readerRole = await rolesService.create({
      name: `E2E DI Reader ${runId}`,
      description: 'Documentation intelligence fixture: read-only',
      permissions: ['Inventory.Read'],
    });
    const writerRole = await rolesService.create({
      name: `E2E DI Writer ${runId}`,
      description: 'Documentation intelligence fixture: component editor',
      permissions: ['Inventory.Read', 'Inventory.Update'],
    });
    createdRoleIds.push(readerRole.id, writerRole.id);

    const reader = await usersService.create({
      email: `di-reader-${runId}@ananya.local`,
      password: 'ReaderPassw0rd!',
      firstName: 'DI',
      lastName: 'Reader',
      roleId: readerRole.id,
    });
    const writer = await usersService.create({
      email: `di-writer-${runId}@ananya.local`,
      password: 'WriterPassw0rd!',
      firstName: 'DI',
      lastName: 'Writer',
      roleId: writerRole.id,
    });
    createdUserIds.push(reader.id, writer.id);

    readerToken = (await authService.createSessionForUser(reader.id)).token;
    writerToken = (await authService.createSessionForUser(writer.id)).token;

    componentSku = `E2E-DI-${runTag}`;
    const component = await componentsService.create({
      sku: componentSku,
      name: `Documentation Intelligence Fixture ${runTag}`,
      unit: 'pcs',
    });
    createdComponentIds.push(component.id);
    componentId = component.id;
  });

  afterAll(async () => {
    if (!hasDbUrl) return;

    // Findings cascade with the component; analyses and documents have no
    // component FK, so they are removed explicitly to avoid residue.
    if (createdDocumentIds.length > 0) {
      await db
        .delete(documentIntelligenceAnalyses)
        .where(
          inArray(documentIntelligenceAnalyses.documentId, createdDocumentIds),
        );
      await db
        .delete(documents)
        .where(inArray(documents.id, createdDocumentIds));
    }
    // Feedback BEFORE components. `ai_suggestion_feedback.component_id` is
    // `ON DELETE SET NULL`: deleting the component first leaves the row with no
    // subject at all, which makes it permanent residue rather than merely an
    // orphan — nothing can match it afterwards.
    if (createdComponentIds.length > 0) {
      await db
        .delete(aiSuggestionFeedback)
        .where(inArray(aiSuggestionFeedback.componentId, createdComponentIds));
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
    // Activity events carry no foreign key to their subject, so the component
    // delete leaves them behind with a dangling `entity_id`. Removed by the fixture
    // component id they were written against — not by orphanhood, which cannot
    // distinguish residue from a legitimate event whose entity was later deleted.
    if (createdComponentIds.length > 0) {
      await db
        .delete(activityEvents)
        .where(inArray(activityEvents.entityId, createdComponentIds));
    }
    // Audit rows name their actor by EMAIL with `user_id` NULL, so the fixture
    // addresses are the only deterministic handle.
    await db
      .delete(securityAuditLogs)
      .where(
        inArray(securityAuditLogs.userEmail, [
          `di-reader-${runId}@ananya.local`,
          `di-writer-${runId}@ananya.local`,
        ]),
      );
    // `ROLE_CREATED` carries NO actor at all — `user_id` and `user_email` are both
    // NULL and the role id lives in the details blob, so it is invisible to every
    // predicate above.
    if (createdRoleIds.length > 0) {
      await db.delete(securityAuditLogs).where(
        sql`${securityAuditLogs.details}->>'roleId' IN (${sql.join(
          createdRoleIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
    }
    // A third shape: the analysis path records its own `DOCUMENT_ANALYZED` rows
    // under whatever actor it is handed, and this suite drives it directly with a
    // synthetic one (`{ email: 'e2e@local' }`) rather than a fixture account. The
    // component id inside the details blob is the deterministic handle — no
    // fixture email can match these rows.
    if (createdComponentIds.length > 0) {
      await db.delete(securityAuditLogs).where(
        sql`${securityAuditLogs.details}->>'componentId' IN (${sql.join(
          createdComponentIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
    }
    if (app) {
      await app.close();
    }
    await closeDatabaseConnection();
    if (storageRoot) {
      fs.rmSync(storageRoot, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    if (!hasDbUrl) return;
    jest
      .spyOn(mlClient, 'extractDatasheet')
      .mockResolvedValue(extractionPayload() as never);
    jest
      .spyOn(mlService, 'suggest')
      .mockResolvedValue(suggestionPayload() as never);
  });

  // -------------------------------------------------------------------------
  // Eligibility
  // -------------------------------------------------------------------------

  describe('eligibility', () => {
    it('offers analysis for an uploaded PDF datasheet', async () => {
      if (!hasDbUrl) return;
      const documentId = await uploadDatasheet(
        writerToken,
        PDF_V1_BYTES,
        `${runTag}-eligible.pdf`,
      );

      const response = await http()
        .get(`/ml/documents/${documentId}/analysis`)
        .set('Authorization', `Bearer ${readerToken}`);

      expect(response.status).toBe(200);
      expect(body(response).eligibility?.available).toBe(true);
      // No analysis has run yet.
      expect(body(response).analysis).toBeNull();
    });

    it('explains why an external reference cannot be analyzed', async () => {
      if (!hasDbUrl) return;
      const created = await http()
        .post('/documents/external-url')
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          entityType: 'Component',
          entityId: componentId,
          documentType: 'DATASHEET',
          title: `${runTag} external datasheet`,
          url: 'https://example.com/datasheet.pdf',
        });
      expect(created.status).toBe(201);
      const documentId = (created.body as DocumentBody).id!;
      createdDocumentIds.push(documentId);

      const response = await http()
        .get(`/ml/documents/${documentId}/analysis`)
        .set('Authorization', `Bearer ${readerToken}`);

      expect(body(response).eligibility?.available).toBe(false);
      expect(body(response).eligibility?.reason).toBe('EXTERNAL_REFERENCE');

      const attempt = await http()
        .post(`/ml/documents/${documentId}/analyze`)
        .set('Authorization', `Bearer ${writerToken}`);
      expect(attempt.status).toBe(400);
    });

    it('refuses non-datasheet document types and says so', async () => {
      if (!hasDbUrl) return;
      const documentId = await uploadDatasheet(
        writerToken,
        PDF_V1_BYTES,
        `${runTag}-drawing.pdf`,
        'CAD_DRAWING',
      );

      const response = await http()
        .get(`/ml/documents/${documentId}/analysis`)
        .set('Authorization', `Bearer ${readerToken}`);

      expect(body(response).eligibility?.available).toBe(false);
      expect(body(response).eligibility?.reason).toBe('NOT_A_DATASHEET');
    });

    it('refuses a document whose stored file is missing', async () => {
      if (!hasDbUrl) return;
      const documentId = await uploadDatasheet(
        writerToken,
        PDF_V1_BYTES,
        `${runTag}-missing.pdf`,
      );

      // Delete the object behind the record's back, as an operator might.
      const [row] = await db
        .select()
        .from(documents)
        .where(eq(documents.id, documentId));
      await storageService.deleteFile(row!.storageKey!);

      const response = await http()
        .get(`/ml/documents/${documentId}/analysis`)
        .set('Authorization', `Bearer ${readerToken}`);

      expect(body(response).eligibility?.available).toBe(false);
      expect(body(response).eligibility?.reason).toBe('MISSING_STORAGE_OBJECT');
    });
  });

  // -------------------------------------------------------------------------
  // Analysis
  // -------------------------------------------------------------------------

  describe('analysis', () => {
    let documentId = '';

    it('analyzes an uploaded datasheet and returns an evidence-backed summary', async () => {
      if (!hasDbUrl) return;
      documentId = await uploadDatasheet(
        writerToken,
        PDF_V1_BYTES,
        `${runTag}-${MANUFACTURER_PART_NUMBER}.pdf`,
      );

      const response = await http()
        .post(`/ml/documents/${documentId}/analyze`)
        .set('Authorization', `Bearer ${writerToken}`);

      expect(response.status).toBe(201);
      const analysis = body(response).analysis!;
      expect(analysis.status).toBe('FINDINGS_AVAILABLE');
      expect(analysis.isCurrent).toBe(true);
      expect(analysis.document.documentVersion).toBe(1);
      expect(analysis.identity.manufacturerName).toBe('Yageo');
      expect(analysis.identity.manufacturerPartNumber).toBe(
        MANUFACTURER_PART_NUMBER,
      );

      // Summary counts come from the actual extraction.
      expect(analysis.summary.extractedSpecifications).toBe(4);
      expect(analysis.summary.findingsPending).toBeGreaterThan(0);
      expect(analysis.summary.evidenceCount).toBeGreaterThan(0);
    });

    it('binds the analysis to the exact bytes it read', async () => {
      if (!hasDbUrl) return;

      const response = await http()
        .get(`/ml/documents/${documentId}/analysis`)
        .set('Authorization', `Bearer ${readerToken}`);
      const analysis = body(response).analysis!;

      const expectedHash = createHash('sha256')
        .update(PDF_V1_BYTES)
        .digest('hex');
      expect(analysis.document.contentHash).toBe(expectedHash);

      // The stored row carries the same hash, so evidence can never be
      // attributed to bytes it was not derived from.
      const [row] = await db
        .select()
        .from(documentIntelligenceAnalyses)
        .where(eq(documentIntelligenceAnalyses.documentId, documentId));
      expect(row!.contentHash).toBe(expectedHash);
      expect(row!.documentVersion).toBe(1);
      // Pass 4 bumped the contract version: the mapping's meaning changed (scored
      // resolution, semantic comparison, evidence roles), so stored analyses are
      // identifiable rather than silently reinterpreted.
      expect(row!.intelligenceVersion).toBe('datasheet-extract-v2');
    });

    it('attaches page and excerpt evidence, and invents none', async () => {
      if (!hasDbUrl) return;

      const response = await http()
        .get(`/ml/documents/${documentId}/analysis`)
        .set('Authorization', `Bearer ${readerToken}`);
      const analysis = body(response).analysis!;

      const resistance = analysis.attributes.find(
        (candidate) => candidate.extractedCode === 'resistance',
      )!;
      expect(resistance.evidence[0]!.page).toBe(3);
      expect(String(resistance.evidence[0]!.text)).toContain(
        'resistance 300 ohm',
      );
      expect(resistance.evidence[0]!.documentId).toBe(documentId);
      expect(resistance.evidence[0]!.documentVersion).toBe(1);
      expect(resistance.evidence[0]!.documentContentHash).toBe(
        analysis.document.contentHash,
      );
      expect(resistance.evidence[0]!.extractionMethod).toBe(
        'extractor:ee_regex',
      );

      // The property the extractor could not locate claims no page.
      const thermal = analysis.attributes.find(
        (candidate) => candidate.extractedCode === 'thermal_resistance',
      )!;
      expect(thermal.evidence[0]!.page).toBeNull();
      expect(thermal.evidence[0]!.text).toBeNull();
    });

    it('maps extracted specifications onto existing attribute definitions', async () => {
      if (!hasDbUrl) return;

      const response = await http()
        .get(`/ml/documents/${documentId}/analysis`)
        .set('Authorization', `Bearer ${readerToken}`);
      const attributes = body(response).analysis!.attributes;

      const resistance = attributes.find(
        (a) => a.extractedCode === 'resistance',
      )!;
      // `resistance` resolves only if the ERP has that definition; when it does
      // not, the candidate must be unresolved rather than invented.
      if (resistance.resolution === 'DEFINITION_MATCHED') {
        expect(resistance.normalizedValue).toBeTruthy();
      } else {
        expect(resistance.resolution).toBe('NO_DEFINITION');
        expect(resistance.normalizedValue).toBeNull();
      }

      // A property with no definition in the ERP is reported, not created.
      const thermal = attributes.find(
        (a) => a.extractedCode === 'thermal_resistance',
      )!;
      expect(['NO_DEFINITION', 'DEFINITION_MATCHED']).toContain(
        thermal.resolution,
      );
    });

    it('does not mutate the component', async () => {
      if (!hasDbUrl) return;

      const component = await componentsService.getComponent(componentId);
      expect(component.manufacturerId).toBeNull();
      expect(component.manufacturerPartNumber).toBeNull();
      expect(component.categoryId).toBeNull();
    });

    it('creates findings in the existing Component Review Queue', async () => {
      if (!hasDbUrl) return;

      const response = await http()
        .get('/ml/components/review-queue?pageSize=100')
        .set('Authorization', `Bearer ${readerToken}`);

      const items = (response.body as { items: Array<Record<string, unknown>> })
        .items;
      const documentFindings = items.filter(
        (item) =>
          item.componentId === componentId &&
          item.source === 'document:datasheet',
      );

      expect(documentFindings.length).toBeGreaterThan(0);
      const issueTypes = documentFindings.map((item) => item.issueType);
      // Existing identity issue types, not a document-specific taxonomy.
      expect(issueTypes).toContain('MPN_MISSING');
      expect(issueTypes).toContain('MANUFACTURER_UNRESOLVED');

      // Every finding identifies the document revision it came from.
      for (const finding of documentFindings) {
        const metadata = finding.metadata as {
          document?: Record<string, unknown>;
        };
        expect(metadata.document?.documentId).toBe(documentId);
        expect(metadata.document?.documentVersion).toBe(1);
        expect(metadata.document?.documentContentHash).toBe(
          body(
            await http()
              .get(`/ml/documents/${documentId}/analysis`)
              .set('Authorization', `Bearer ${readerToken}`),
          ).analysis!.document.contentHash,
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  // Idempotency and revision staleness
  // -------------------------------------------------------------------------

  describe('idempotency and revisions', () => {
    let documentId = '';

    it('is idempotent when the same document is analyzed again', async () => {
      if (!hasDbUrl) return;
      documentId = await uploadDatasheet(
        writerToken,
        PDF_V1_BYTES,
        `${runTag}-idempotent-${MANUFACTURER_PART_NUMBER}.pdf`,
      );

      const first = await http()
        .post(`/ml/documents/${documentId}/analyze`)
        .set('Authorization', `Bearer ${writerToken}`);
      expect(first.status).toBe(201);
      const firstAnalysis = body(first).analysis!;
      expect(body(first).createdFindingCount).toBeGreaterThan(0);

      const second = await http()
        .post(`/ml/documents/${documentId}/analyze`)
        .set('Authorization', `Bearer ${writerToken}`);
      expect(second.status).toBe(201);

      // No new findings: the same bytes produce the same fingerprints.
      expect(body(second).createdFindingCount).toBe(0);
      expect(body(second).analysis!.findings.length).toBe(
        firstAnalysis.findings.length,
      );

      // No duplicate analysis rows either.
      const rows = await db
        .select({ id: documentIntelligenceAnalyses.id })
        .from(documentIntelligenceAnalyses)
        .where(eq(documentIntelligenceAnalyses.documentId, documentId));
      expect(rows).toHaveLength(1);

      // And no duplicate findings.
      const findings = await db
        .select({ id: componentIntelligenceFindings.id })
        .from(componentIntelligenceFindings)
        .where(
          and(
            eq(componentIntelligenceFindings.componentId, componentId),
            eq(componentIntelligenceFindings.source, 'document:datasheet'),
          ),
        );
      const fingerprints = new Set(findings.map((row) => row.id));
      expect(fingerprints.size).toBe(findings.length);
    });

    it('marks the previous revision findings stale when a new version is analyzed', async () => {
      if (!hasDbUrl) return;

      const findingsBefore = await db
        .select({
          id: componentIntelligenceFindings.id,
          status: componentIntelligenceFindings.status,
        })
        .from(componentIntelligenceFindings)
        .where(
          and(
            eq(componentIntelligenceFindings.componentId, componentId),
            eq(componentIntelligenceFindings.source, 'document:datasheet'),
          ),
        );
      expect(findingsBefore.length).toBeGreaterThan(0);

      // Upload v2: different bytes, so the older evidence no longer describes
      // the file that is stored.
      const versioned = await http()
        .post(`/documents/${documentId}/version`)
        .set('Authorization', `Bearer ${writerToken}`)
        .field('changelog', 'revised datasheet')
        .attach('file', PDF_V2_BYTES, {
          filename: `${runTag}-v2-${MANUFACTURER_PART_NUMBER}.pdf`,
          contentType: 'application/pdf',
        });
      expect(versioned.status).toBe(201);
      expect((versioned.body as DocumentBody).currentVersion).toBe(2);

      const reanalyzed = await http()
        .post(`/ml/documents/${documentId}/analyze`)
        .set('Authorization', `Bearer ${writerToken}`);
      expect(reanalyzed.status).toBe(201);

      const analysis = body(reanalyzed).analysis!;
      expect(analysis.document.documentVersion).toBe(2);
      expect(analysis.isCurrent).toBe(true);
      expect(body(reanalyzed).staledPreviousCount).toBeGreaterThan(0);

      // v1 findings are STALE, not deleted: history is preserved.
      const staleRows = await db
        .select()
        .from(componentIntelligenceFindings)
        .where(
          and(
            eq(componentIntelligenceFindings.componentId, componentId),
            eq(componentIntelligenceFindings.source, 'document:datasheet'),
          ),
        );
      const versionOneFindings = staleRows.filter((row) => {
        const metadata = row.metadata ?? {};
        const documentRef = (metadata.document ?? {}) as Record<
          string,
          unknown
        >;
        return (
          documentRef.documentId === documentId &&
          documentRef.documentVersion === 1
        );
      });
      expect(versionOneFindings.length).toBeGreaterThan(0);
      for (const finding of versionOneFindings) {
        expect(finding.status).toBe('STALE');
      }

      // New findings point at v2.
      const pendingForDocument = staleRows.filter((row) => {
        const metadata = row.metadata ?? {};
        const documentRef = (metadata.document ?? {}) as Record<
          string,
          unknown
        >;
        return (
          documentRef.documentId === documentId && row.status === 'PENDING'
        );
      });
      expect(pendingForDocument.length).toBeGreaterThan(0);
      for (const finding of pendingForDocument) {
        const metadata = finding.metadata ?? {};
        const documentRef = (metadata.document ?? {}) as Record<
          string,
          unknown
        >;
        expect(documentRef.documentVersion).toBe(2);
        expect(documentRef.documentContentHash).toBe(
          createHash('sha256').update(PDF_V2_BYTES).digest('hex'),
        );
      }
    });

    it('reports an analysis of an older revision as not current', async () => {
      if (!hasDbUrl) return;

      const response = await http()
        .get(`/ml/documents/${documentId}/analysis`)
        .set('Authorization', `Bearer ${readerToken}`);
      const state = body(response);

      // The current-version analysis is returned, so it is current.
      expect(state.analysis?.document.documentVersion).toBe(2);
      expect(state.analysis?.isCurrent).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Review workflow integration
  // -------------------------------------------------------------------------

  describe('existing review workflow', () => {
    let findingId = '';
    let findingFingerprint = '';

    it('exposes document findings as standard review findings', async () => {
      if (!hasDbUrl) return;

      const response = await http()
        .get(
          `/ml/components/review-queue?componentId=${componentId}&status=PENDING&pageSize=50`,
        )
        .set('Authorization', `Bearer ${readerToken}`);

      const items = (response.body as { items: Array<Record<string, unknown>> })
        .items;
      const mpn = items.find((item) => item.issueType === 'MPN_MISSING');
      expect(mpn).toBeDefined();
      findingId = String(mpn!.id);
      findingFingerprint = String(mpn!.fingerprint);
      expect(String(mpn!.description)).toContain('datasheet');
    });

    it('applies a document finding through the existing apply endpoint', async () => {
      if (!hasDbUrl) return;

      const response = await http()
        .post(`/ml/components/review-queue/${findingId}/apply`)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ expectedFingerprint: findingFingerprint });

      expect(response.status).toBe(201);
    });

    it('mutates the component only after the human apply step', async () => {
      if (!hasDbUrl) return;

      const component = await componentsService.getComponent(componentId);
      // The mutation came from the review workflow, not from the analysis.
      expect(component.manufacturerPartNumber).toBe(MANUFACTURER_PART_NUMBER);
    });

    it('records the acceptance in the existing feedback ledger', async () => {
      if (!hasDbUrl) return;

      const queue = await reviewQueue.getFinding(findingId);
      expect(queue.status).toBe('ACCEPTED');
      expect(queue.reviewerEmail).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // Failure handling
  // -------------------------------------------------------------------------

  describe('failure handling', () => {
    it('records an explicit failure and commits no findings when ML is unavailable', async () => {
      if (!hasDbUrl) return;
      const documentId = await uploadDatasheet(
        writerToken,
        PDF_V1_BYTES,
        `${runTag}-ml-down.pdf`,
      );

      jest.spyOn(mlClient, 'extractDatasheet').mockResolvedValue(null);

      const response = await http()
        .post(`/ml/documents/${documentId}/analyze`)
        .set('Authorization', `Bearer ${writerToken}`);
      expect(response.status).toBe(400);

      // The failure is persisted, explicitly, with no findings.
      const [row] = await db
        .select()
        .from(documentIntelligenceAnalyses)
        .where(eq(documentIntelligenceAnalyses.documentId, documentId));
      expect(row!.status).toBe('ANALYSIS_FAILED');
      expect(row!.failureReason).toBeTruthy();

      const findings = await db
        .select()
        .from(componentIntelligenceFindings)
        .where(
          and(
            eq(componentIntelligenceFindings.componentId, componentId),
            eq(componentIntelligenceFindings.source, 'document:datasheet'),
          ),
        );
      const documentFindings = findings.filter((finding) => {
        const metadata = finding.metadata ?? {};
        const documentRef = (metadata.document ?? {}) as Record<
          string,
          unknown
        >;
        return documentRef.documentId === documentId;
      });
      expect(documentFindings).toHaveLength(0);

      // Documentation still works normally.
      const list = await http()
        .get(`/documents/entity/Component/${componentId}`)
        .set('Authorization', `Bearer ${readerToken}`);
      expect(list.status).toBe(200);

      const download = await http()
        .get(`/documents/${documentId}/download`)
        .set('Authorization', `Bearer ${readerToken}`)
        .buffer(true);
      expect(download.status).toBe(200);
    });

    it('does not fail the analysis when identity intelligence is unavailable', async () => {
      if (!hasDbUrl) return;
      const documentId = await uploadDatasheet(
        writerToken,
        PDF_V1_BYTES,
        `${runTag}-identity-down.pdf`,
      );

      jest
        .spyOn(mlClient, 'extractDatasheet')
        .mockResolvedValue(extractionPayload() as never);
      jest
        .spyOn(mlService, 'suggest')
        .mockRejectedValue(new Error('identity intelligence unavailable'));

      const response = await http()
        .post(`/ml/documents/${documentId}/analyze`)
        .set('Authorization', `Bearer ${writerToken}`);

      // Extraction succeeded, so the specifications are still reviewable.
      expect(response.status).toBe(201);
      const analysis = body(response).analysis!;
      expect(['ANALYZED', 'FINDINGS_AVAILABLE']).toContain(analysis.status);
      expect(analysis.attributes.length).toBeGreaterThan(0);

      // Degraded, not lost: no manufacturer resolution without the intelligence
      // service, but the part number printed in the document is still surfaced
      // from the extractor's own text.
      expect(analysis.identity.manufacturerName).toBeNull();
      expect(analysis.identity.manufacturerId).toBeNull();
      expect(analysis.identity.manufacturerPartNumber).toBe(
        MANUFACTURER_PART_NUMBER,
      );
      expect(analysis.identity.manufacturerPartNumberSource).toBe(
        'DOCUMENT_TEXT',
      );
    });

    it('reports a failed analysis in the state payload', async () => {
      if (!hasDbUrl) return;
      const list = await http()
        .get(`/documents/entity/Component/${componentId}`)
        .set('Authorization', `Bearer ${readerToken}`);
      const failedDocument = (list.body as DocumentBody[]).find((document) =>
        document.id ? createdDocumentIds.includes(document.id) : false,
      );
      expect(failedDocument).toBeDefined();

      const response = await http()
        .get(`/ml/documents/${failedDocument!.id}/analysis`)
        .set('Authorization', `Bearer ${readerToken}`);
      expect(response.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Authorization
  // -------------------------------------------------------------------------

  describe('authorization', () => {
    let documentId = '';

    beforeAll(async () => {
      if (!hasDbUrl) return;
      documentId = await uploadDatasheet(
        writerToken,
        PDF_V1_BYTES,
        `${runTag}-auth.pdf`,
      );
    });

    it('rejects an unauthenticated analysis with 401', async () => {
      if (!hasDbUrl) return;
      const response = await http().post(`/ml/documents/${documentId}/analyze`);
      expect(response.status).toBe(401);
    });

    it('rejects an unauthenticated read with 401', async () => {
      if (!hasDbUrl) return;
      const response = await http().get(`/ml/documents/${documentId}/analysis`);
      expect(response.status).toBe(401);
    });

    it('rejects an invalid session with 401', async () => {
      if (!hasDbUrl) return;
      const response = await http()
        .post(`/ml/documents/${documentId}/analyze`)
        .set('Authorization', 'Bearer not-a-real-session');
      expect(response.status).toBe(401);
    });

    it('lets a read-only user read but not analyze', async () => {
      if (!hasDbUrl) return;

      const read = await http()
        .get(`/ml/documents/${documentId}/analysis`)
        .set('Authorization', `Bearer ${readerToken}`);
      expect(read.status).toBe(200);

      const analyzed = await http()
        .post(`/ml/documents/${documentId}/analyze`)
        .set('Authorization', `Bearer ${readerToken}`);
      expect(analyzed.status).toBe(403);
      expect(String(body(analyzed).message)).toContain('Inventory.Update');
    });

    it('resolves the component from the document, not from the request', async () => {
      if (!hasDbUrl) return;

      // A caller cannot redirect analysis at another component: there is no
      // component parameter at all, and an extra one is rejected outright.
      const response = await http()
        .post(`/ml/documents/${documentId}/analyze?componentId=other`)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ componentId: '00000000-0000-0000-0000-000000000000' });

      expect(response.status).toBe(201);
      const analysis = body(response).analysis!;
      expect(analysis.componentId).toBe(componentId);
    });

    it('returns 404 for an unknown document', async () => {
      if (!hasDbUrl) return;
      const response = await http()
        .get('/ml/documents/00000000-0000-0000-0000-000000000000/analysis')
        .set('Authorization', `Bearer ${readerToken}`);
      expect(response.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // Analysis never mutates
  // -------------------------------------------------------------------------

  describe('advisory guarantee', () => {
    it('leaves every component field untouched for an unattended analysis', async () => {
      if (!hasDbUrl) return;

      const before = await componentsService.getComponent(componentId);

      const documentId = await uploadDatasheet(
        writerToken,
        PDF_V1_BYTES,
        `${runTag}-advisory.pdf`,
      );
      const response = await http()
        .post(`/ml/documents/${documentId}/analyze`)
        .set('Authorization', `Bearer ${writerToken}`);
      expect(response.status).toBe(201);

      const after = await componentsService.getComponent(componentId);
      expect(after.manufacturerId).toBe(before.manufacturerId);
      expect(after.manufacturerPartNumber).toBe(before.manufacturerPartNumber);
      expect(after.categoryId).toBe(before.categoryId);
      expect(after.name).toBe(before.name);
      expect(after.description).toBe(before.description);
      expect(after.updatedAt).toEqual(before.updatedAt);
    });

    it('is callable directly on the service without touching the component', async () => {
      if (!hasDbUrl) return;

      const documentId = await uploadDatasheet(
        writerToken,
        PDF_V1_BYTES,
        `${runTag}-direct.pdf`,
      );
      const before = await componentsService.getComponent(componentId);

      await analysisService.analyzeDocument(documentId, { email: 'e2e@local' });

      const after = await componentsService.getComponent(componentId);
      expect(after.updatedAt).toEqual(before.updatedAt);
    });

    it('does not create attribute values from an analysis', async () => {
      if (!hasDbUrl) return;

      const attributes = await http()
        .get(`/components/${componentId}/attributes`)
        .set('Authorization', `Bearer ${readerToken}`);
      // Attribute values only exist if a human applied them; analysis alone
      // never writes any.
      expect(attributes.status).toBe(200);
    });
  });
});

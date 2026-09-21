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
import { AttributesService } from '../../src/attributes/attributes.service';
import { DataPacksService } from '../../src/data-packs/data-packs.service';
import { MlClientService } from '../../src/ml/ml-client.service';
import { MlService } from '../../src/ml/ml.service';
import { ComponentReviewQueueService } from '../../src/ml/component-review-queue.service';
import { ComponentSpecificationIntelligenceService } from '../../src/ml/component-specification-intelligence.service';
import { DOCUMENT_ATTRIBUTE_SOURCE } from '../../src/ml/document-attribute-value-review';
import { db, closeDatabaseConnection } from '@ananya/database';
import {
  activityEvents,
  aiSuggestionFeedback,
  attributeDefinitions,
  componentAttributeValues,
  componentIntelligenceFindings,
  documentIntelligenceAnalyses,
  documents,
  roles,
  securityAuditLogs,
  users,
} from '@ananya/database/schema';
import { and, eq, inArray, sql } from '@ananya/database/query';
import type { ComponentIntelligenceFinding } from '@ananya/database/schema';

interface SpecificationBody {
  attributeDefinitionId: string;
  attributeCode: string;
  state: string;
  display: string | null;
  value: unknown;
  sources: Array<{
    documentId: string;
    documentVersion: number;
    display: string;
    agreement: string;
    erp: string;
  }>;
  groups: Array<{ display: string; agreement: string }>;
  evidence: Array<{
    documentId: string;
    page: number | null;
    role: string;
    section: string | null;
  }>;
  documentCount: number;
  currentValue: string | null;
  erpAgreement: string;
  confidence: number;
  confidenceReasons: string[];
  notApplicableReason: string | null;
  review: { findingId: string | null; status: string; applied: boolean } | null;
}

interface StateBody {
  componentId: string;
  summary: {
    documentsAnalyzed: number;
    documentsNotAnalyzed: string[];
    documentsSkipped: Array<{ reason: string }>;
    specificationsFound: number;
    needsReview: number;
    applied: number;
    conflicts: number;
    ambiguous: number;
    unresolved: number;
    alreadyCurrent: number;
  };
  specifications: SpecificationBody[];
  unmapped: Array<{
    extractedCode: string;
    resolutionState: string;
    candidates: Array<{ attributeCode: string; reasons: string[] }>;
  }>;
  eligibleDocumentIds: string[];
}

interface RunBody extends StateBody {
  createdFindingCount: number;
  staledFindingCount: number;
  message?: string | string[];
  statusCode?: number;
}

interface AnalysisBody {
  analysis?: {
    attributes: Array<{
      extractedCode: string;
      evidence: Array<{
        page: number | null;
        role: string;
        section: string | null;
      }>;
      review: {
        findingId: string | null;
        status: string;
        fingerprint: string | null;
        applied: boolean;
      } | null;
    }>;
  } | null;
  message?: string | string[];
}

/**
 * Pass 4: Specification Intelligence across a component's documents.
 *
 * Proves the aggregation behaviour over HTTP — one finding for agreeing sources,
 * a conflict finding for disagreeing ones, the ERP comparison, evidence roles and
 * the summary counts — and every way it must refuse: another component's
 * documents, a component that does not exist, missing permissions, and a value
 * that must never be applied automatically.
 *
 * The ML service is stubbed at the Nest boundary, because extraction quality is
 * the Python suite's subject and a live container is not part of this workspace's
 * test environment. Everything Ananya owns is exercised against a real database.
 */
describe('Specification Intelligence (component level)', () => {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  const runTag = Math.random().toString(36).slice(2, 8).toUpperCase();
  const runId = Date.now();

  let app: INestApplication;
  let authService: AuthService;
  let rolesService: RolesService;
  let usersService: UsersService;
  let componentsService: ComponentsService;
  let attributesService: AttributesService;
  let dataPacksService: DataPacksService;
  let mlClient: MlClientService;
  let mlService: MlService;
  let reviewQueue: ComponentReviewQueueService;
  let intelligence: ComponentSpecificationIntelligenceService;

  const createdRoleIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdComponentIds: string[] = [];
  const createdDocumentIds: string[] = [];
  const createdDefinitionIds: string[] = [];
  let storageRoot = '';

  let writerToken = '';
  let readerToken = '';
  let resistanceDefinitionId = '';
  let voltageDefinitionId = '';

  /** One component per scenario, so no scenario can decide another's outcome. */
  let agreeingComponentId = '';
  let conflictingComponentId = '';
  let singleComponentId = '';
  let otherComponentId = '';
  /** The component the apply scenario used, read by the feedback assertion. */
  let applyComponentId = '';

  const PDF_BYTES = Buffer.from('%PDF-1.4 datasheet 300 Ohm 0805 50V');

  function http() {
    return request(app.getHttpServer() as Parameters<typeof request>[0]);
  }

  function body<T>(response: { body: unknown }): T {
    return response.body as T;
  }

  /**
   * Extraction payload with per-document overrides.
   *
   * The ML service is stubbed per test, so one component's documents can be made
   * to agree, to disagree, or to state different attributes.
   */
  function extractionPayload(
    options: {
      resistance?: number;
      resistanceFormatted?: string;
      resistanceUnit?: string;
      voltage?: number | null;
      packageCode?: string;
      page?: number;
      /** `null` means the extractor identified no section. */
      section?: string | null;
    } = {},
  ) {
    const resistance = options.resistance ?? 300;
    const unit = options.resistanceUnit ?? 'ohm';
    const page = options.page ?? 3;
    const section =
      options.section === undefined
        ? 'ELECTRICAL_CHARACTERISTICS'
        : options.section;

    const attributes: Record<string, unknown> = {
      resistance: {
        code: 'resistance',
        value: resistance,
        unit,
        formatted: options.resistanceFormatted ?? `${resistance}Ω`,
        confidence: 0.95,
        confidence_level: 'HIGH',
        evidence: [
          {
            type: 'datasheet_param',
            description: `Extracted resistance rating ${resistance}`,
            weight: 0.95,
            source: 'extractor:ee_regex',
            page,
            text: `... resistance ${resistance} ${unit} ...`,
            section,
          },
        ],
      },
      package: {
        code: 'package',
        value: options.packageCode ?? '0805',
        formatted: options.packageCode ?? '0805',
        confidence: 0.98,
        confidence_level: 'HIGH',
        evidence: [
          {
            type: 'datasheet_param',
            description: 'Identified physical package footprint',
            weight: 0.98,
            source: 'extractor:ee_package',
            page: 1,
            text: `... ${options.packageCode ?? '0805'} package ...`,
            section: 'MECHANICAL',
          },
        ],
      },
      // No attribute definition exists for this property.
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
            description: 'Extracted thermal resistance',
            weight: 0.9,
            source: 'extractor:ee_regex',
            page: null,
            text: null,
            section: null,
          },
        ],
      },
    };

    if (options.voltage !== null) {
      const voltage = options.voltage ?? 50;
      attributes.voltage = {
        code: 'voltage',
        value: voltage,
        unit: 'V',
        formatted: `${voltage}V`,
        confidence: 0.92,
        confidence_level: 'HIGH',
        evidence: [
          {
            type: 'datasheet_param',
            description: `Extracted voltage rating ${voltage}V`,
            weight: 0.92,
            source: 'extractor:ee_regex',
            page,
            text: `... ${voltage} V ...`,
            section,
          },
        ],
      };
    }

    return {
      attributes,
      extracted_text_preview: 'datasheet text…',
      extracted_text: 'Yageo MC0805S8F3000T5E 300 Ohm 0805 50V',
      page_count: 8,
      pages_analyzed: 4,
      extractor_version: 'datasheet-extract-v2',
    };
  }

  function suggestionPayload() {
    return {
      query: 'MC0805S8F3000T5E',
      manufacturerPartNumber: 'MC0805S8F3000T5E',
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
      confidenceLevel: 'HIGH',
      isMlActive: true,
      executionTimeMs: 8,
    };
  }

  /** Stubs the extractor for the next analysis with the given payload. */
  function stubExtraction(payload: Record<string, unknown>) {
    jest
      .spyOn(mlClient, 'extractDatasheet')
      .mockResolvedValue(payload as never);
  }

  /**
   * Stubs the extractor per document, keyed on the uploaded bytes.
   *
   * A component-level analysis reads every document in one run, so a scenario
   * where the documents disagree needs each document to extract differently. The
   * document bytes travel base64-encoded, so the payload is decoded and the
   * marker matched in the text the real extractor would read.
   */
  function stubExtractionByMarker(
    markers: Array<{ marker: string; payload: Record<string, unknown> }>,
  ) {
    jest
      .spyOn(mlClient, 'extractDatasheet')
      .mockImplementation((payload: { pdf_base64?: string } = {}) => {
        const text = payload.pdf_base64
          ? Buffer.from(payload.pdf_base64, 'base64').toString('latin1')
          : '';
        const match = markers.find((entry) => text.includes(entry.marker));
        return (match?.payload ?? extractionPayload()) as never;
      });
  }

  /** A PDF whose bytes carry a marker, so the stub can identify the document. */
  function markedPdf(marker: string): Buffer {
    return Buffer.from(`%PDF-1.4 datasheet ${marker}`);
  }

  async function uploadDatasheet(
    componentId: string,
    bytes: Buffer,
    filename: string,
    documentType = 'DATASHEET',
  ): Promise<string> {
    const response = await http()
      .post('/documents/upload')
      .set('Authorization', `Bearer ${writerToken}`)
      .field('entityType', 'Component')
      .field('entityId', componentId)
      .field('documentType', documentType)
      .field('title', `${runTag} ${filename}`)
      .attach('file', bytes, { filename, contentType: 'application/pdf' });

    expect(response.status).toBe(201);
    const id = body<{ id: string }>(response).id;
    createdDocumentIds.push(id);
    return id;
  }

  async function createComponent(label: string) {
    const component = await componentsService.create({
      sku: `E2E-P4-${runTag}-${label}`,
      name: `Specification Intelligence Fixture ${runTag} ${label}`,
      unit: 'pcs',
    });
    createdComponentIds.push(component.id);
    return component.id;
  }

  async function runAnalysis(componentId: string) {
    const response = await http()
      .post(`/ml/components/${componentId}/documentation/analyze`)
      .set('Authorization', `Bearer ${writerToken}`);
    expect(response.status).toBe(201);
    return body<RunBody>(response);
  }

  async function getState(componentId: string) {
    const response = await http()
      .get(`/ml/components/${componentId}/documentation`)
      .set('Authorization', `Bearer ${readerToken}`);
    expect(response.status).toBe(200);
    return body<StateBody>(response);
  }

  function specificationFor(
    state: StateBody,
    attributeDefinitionId: string,
  ): SpecificationBody | undefined {
    return state.specifications.find(
      (specification) =>
        specification.attributeDefinitionId === attributeDefinitionId,
    );
  }

  async function findingsFor(componentId: string) {
    return db
      .select()
      .from(componentIntelligenceFindings)
      .where(
        and(
          eq(componentIntelligenceFindings.componentId, componentId),
          eq(componentIntelligenceFindings.source, DOCUMENT_ATTRIBUTE_SOURCE),
        ),
      );
  }

  async function attributeFinding(
    componentId: string,
    attributeDefinitionId: string,
  ): Promise<ComponentIntelligenceFinding | undefined> {
    const rows = await findingsFor(componentId);
    const matching = rows.filter(
      (row) => row.metadata?.attributeDefinitionId === attributeDefinitionId,
    );
    const pending = matching.filter((row) => row.status === 'PENDING');
    return pending.length > 0
      ? pending[pending.length - 1]
      : matching[matching.length - 1];
  }

  beforeAll(async () => {
    if (!hasDbUrl) return;

    storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ananya-p4-e2e-'));
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
    attributesService = app.get(AttributesService);
    dataPacksService = app.get(DataPacksService);
    mlClient = app.get(MlClientService);
    mlService = app.get(MlService);
    reviewQueue = app.get(ComponentReviewQueueService);
    intelligence = app.get(ComponentSpecificationIntelligenceService);

    await dataPacksService.installDataPack('electronics-smd');

    const definitions = await attributesService.getAllDefinitions();
    resistanceDefinitionId = definitions.find(
      (d) => d.code === 'resistance',
    )!.id;
    voltageDefinitionId = definitions.find(
      (d) => d.code === 'voltage_rating',
    )!.id;

    const readerRole = await rolesService.create({
      name: `E2E P4 Reader ${runId}`,
      description: 'Specification intelligence fixture: read-only',
      permissions: ['Inventory.Read'],
    });
    const writerRole = await rolesService.create({
      name: `E2E P4 Writer ${runId}`,
      description: 'Specification intelligence fixture: component editor',
      permissions: ['Inventory.Read', 'Inventory.Update'],
    });
    createdRoleIds.push(readerRole.id, writerRole.id);

    const reader = await usersService.create({
      email: `p4-reader-${runId}@ananya.local`,
      password: 'ReaderPassw0rd!',
      firstName: 'P4',
      lastName: 'Reader',
      roleId: readerRole.id,
    });
    const writer = await usersService.create({
      email: `p4-writer-${runId}@ananya.local`,
      password: 'WriterPassw0rd!',
      firstName: 'P4',
      lastName: 'Writer',
      roleId: writerRole.id,
    });
    createdUserIds.push(reader.id, writer.id);

    readerToken = (await authService.createSessionForUser(reader.id)).token;
    writerToken = (await authService.createSessionForUser(writer.id)).token;

    agreeingComponentId = await createComponent('AGREE');
    conflictingComponentId = await createComponent('CONFLICT');
    singleComponentId = await createComponent('SINGLE');
    otherComponentId = await createComponent('OTHER');
  });

  afterAll(async () => {
    if (!hasDbUrl) return;

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
    // `ON DELETE SET NULL`, so deleting the component first leaves the row with
    // every subject column null: it survives, it is no longer attributable to any
    // fixture, and no later cleanup can find it. This suite writes feedback
    // through the accept/apply path, so it has to own those rows explicitly.
    if (createdComponentIds.length > 0) {
      await db
        .delete(aiSuggestionFeedback)
        .where(inArray(aiSuggestionFeedback.componentId, createdComponentIds));
    }
    for (const id of createdComponentIds) {
      await componentsService.delete(id).catch(() => undefined);
    }
    if (createdDefinitionIds.length > 0) {
      // A definition left behind by a failed test would change how every other
      // spec resolves that term, so cleanup is explicit and unconditional.
      await db
        .delete(attributeDefinitions)
        .where(inArray(attributeDefinitions.id, createdDefinitionIds))
        .catch(() => undefined);
    }
    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    if (createdRoleIds.length > 0) {
      await db.delete(roles).where(inArray(roles.id, createdRoleIds));
    }
    // Activity events have no foreign key to their subject, so deleting the
    // component does not remove them — they would survive as orphaned rows whose
    // `entity_id` points at nothing. Ownership is by the fixture component id the
    // event was written against, never by orphanhood: an event whose component was
    // deleted in normal use is history, not residue.
    if (createdComponentIds.length > 0) {
      await db
        .delete(activityEvents)
        .where(inArray(activityEvents.entityId, createdComponentIds));
    }
    // Audit rows name their actor by EMAIL with `user_id` NULL, so the fixture
    // addresses are the deterministic handle (the same predicate `FixtureOwner`
    // uses). The suite issues exactly these two.
    await db
      .delete(securityAuditLogs)
      .where(
        inArray(securityAuditLogs.userEmail, [
          `p4-reader-${runId}@ananya.local`,
          `p4-writer-${runId}@ananya.local`,
        ]),
      );
    // `ROLE_CREATED` is the second audit shape: `user_id` AND `user_email` are both
    // NULL, with the role id buried in the details blob. Neither predicate above can
    // see it, which is why these rows accumulate silently.
    if (createdRoleIds.length > 0) {
      await db.delete(securityAuditLogs).where(
        sql`${securityAuditLogs.details}->>'roleId' IN (${sql.join(
          createdRoleIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
    }
    // The third shape: the analysis path writes its own `DOCUMENT_ANALYZED` rows
    // under the actor it is handed, and this suite invokes it directly with a
    // synthetic one (`{ email: 'service@ananya.local' }`) instead of a fixture
    // account. The component id in the details blob is the deterministic handle.
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
    stubExtraction(extractionPayload());
    jest
      .spyOn(mlService, 'suggest')
      .mockResolvedValue(suggestionPayload() as never);
  });

  // -------------------------------------------------------------------------
  // §13 — agreement across documents
  // -------------------------------------------------------------------------

  describe('cross-document agreement', () => {
    let datasheetId = '';
    let productPageId = '';

    it('analyses every eligible document of the component', async () => {
      if (!hasDbUrl) return;

      datasheetId = await uploadDatasheet(
        agreeingComponentId,
        PDF_BYTES,
        `${runTag}-agree-datasheet.pdf`,
      );
      productPageId = await uploadDatasheet(
        agreeingComponentId,
        PDF_BYTES,
        `${runTag}-agree-product-page.pdf`,
        'PRODUCT_PAGE',
      );

      const result = await runAnalysis(agreeingComponentId);

      expect(result.summary.documentsAnalyzed).toBe(2);
      expect(result.summary.documentsNotAnalyzed).toEqual([]);
      expect(result.summary.documentsSkipped).toEqual([]);
    });

    it('produces one specification with both documents as evidence', async () => {
      if (!hasDbUrl) return;

      const state = await getState(agreeingComponentId);
      const resistance = specificationFor(state, resistanceDefinitionId)!;

      expect(resistance).toBeDefined();
      expect(resistance.state).toBe('AGREED');
      expect(resistance.documentCount).toBe(2);
      expect(resistance.sources).toHaveLength(2);
      expect(
        resistance.sources.map((source) => source.documentId).sort(),
      ).toEqual([datasheetId, productPageId].sort());
      expect(resistance.sources.every((s) => s.agreement === 'AGREES')).toBe(
        true,
      );
      // Agreement strengthens the evidence instead of multiplying the queue.
      expect(resistance.groups).toHaveLength(1);
      expect(resistance.evidence).toHaveLength(2);
    });

    it('creates exactly one applicable finding for the agreeing attribute', async () => {
      if (!hasDbUrl) return;

      const rows = (await findingsFor(agreeingComponentId)).filter(
        (row) => row.metadata?.attributeDefinitionId === resistanceDefinitionId,
      );

      // The per-document pipeline created a suggestion per document first; the
      // aggregate replaced them, and reconciliation retired those as stale rather
      // than deleting them. History is preserved, the queue shows one item.
      const pending = rows.filter((row) => row.status === 'PENDING');
      expect(pending).toHaveLength(1);
      expect(pending[0]!.issueType).toBe('ATTRIBUTE_VALUE_SUGGESTION');

      const superseded = rows.filter((row) => row.status === 'STALE');
      for (const row of superseded) {
        expect(
          row.metadata?.staleReason ?? row.metadata?.staleCause,
        ).toBeTruthy();
      }

      // The finding names every source, so the queue shows the same picture.
      const metadata = pending[0]!.metadata as {
        sources?: Array<{ documentId: string }>;
        documentCount?: number;
      };
      expect(metadata.documentCount).toBe(2);
      expect(metadata.sources).toHaveLength(2);
    });

    it('reports the agreement in its confidence reasons', async () => {
      if (!hasDbUrl) return;

      const state = await getState(agreeingComponentId);
      const resistance = specificationFor(state, resistanceDefinitionId)!;

      expect(
        resistance.confidenceReasons.some((reason) =>
          reason.includes('documents agree'),
        ),
      ).toBe(true);
      // Positives first, negatives after.
      const signs = resistance.confidenceReasons.map((reason) => reason[0]);
      const firstNegative = signs.indexOf('-');
      if (firstNegative >= 0) {
        expect(signs.slice(firstNegative).every((sign) => sign === '-')).toBe(
          true,
        );
      }
    });

    it('is idempotent: re-analysis refreshes instead of duplicating', async () => {
      if (!hasDbUrl) return;

      const before = await findingsFor(agreeingComponentId);
      const second = await runAnalysis(agreeingComponentId);
      const after = await findingsFor(agreeingComponentId);

      expect(after).toHaveLength(before.length);
      expect(second.createdFindingCount).toBe(0);
      expect(second.summary.specificationsFound).toBeGreaterThan(0);
    });

    it('agrees when documents write the same value in different units', async () => {
      if (!hasDbUrl) return;

      const componentId = await createComponent('UNITS');
      await uploadDatasheet(componentId, PDF_BYTES, `${runTag}-units-a.pdf`);
      stubExtraction(extractionPayload({ resistance: 300 }));
      await runAnalysis(componentId);

      // A second document stating the same resistance as 0.3 kΩ.
      const secondDocumentId = await uploadDatasheet(
        componentId,
        PDF_BYTES,
        `${runTag}-units-b.pdf`,
      );
      void secondDocumentId;
      stubExtraction(
        extractionPayload({
          resistance: 0.3,
          resistanceUnit: 'kohm',
          resistanceFormatted: '0.3kΩ',
        }),
      );
      const result = await runAnalysis(componentId);

      const resistance = specificationFor(result, resistanceDefinitionId)!;
      expect(resistance.state).toBe('AGREED');
      expect(resistance.groups).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // §14 — conflicts across documents
  // -------------------------------------------------------------------------

  describe('cross-document conflicts', () => {
    it('surfaces a conflict instead of choosing a source', async () => {
      if (!hasDbUrl) return;

      // Two documents that disagree about the voltage. Each is stubbed by its
      // own bytes, because the component-level run reads both.
      await uploadDatasheet(
        conflictingComponentId,
        markedPdf('conflict-50v'),
        `${runTag}-conflict-a.pdf`,
      );
      await uploadDatasheet(
        conflictingComponentId,
        markedPdf('conflict-25v'),
        `${runTag}-conflict-b.pdf`,
        'PRODUCT_PAGE',
      );
      stubExtractionByMarker([
        { marker: 'conflict-50v', payload: extractionPayload({ voltage: 50 }) },
        { marker: 'conflict-25v', payload: extractionPayload({ voltage: 25 }) },
      ]);

      const result = await runAnalysis(conflictingComponentId);
      const voltage = specificationFor(result, voltageDefinitionId)!;

      expect(voltage.state).toBe('CONFLICT');
      // Nothing is offered for application when sources disagree.
      expect(voltage.value).toBeNull();
      expect(voltage.display).toBeNull();
      expect(voltage.notApplicableReason).toContain('disagree');
      expect(voltage.groups).toHaveLength(2);
    });

    it('records the conflict as a finding that cannot be applied', async () => {
      if (!hasDbUrl) return;

      const rows = (await findingsFor(conflictingComponentId)).filter(
        (row) => row.issueType === 'DOCUMENT_CONFLICT',
      );
      expect(rows.length).toBeGreaterThan(0);

      const conflict = rows[0]!;
      expect(conflict.issueCategory).toBe('ATTRIBUTE_VALUE');
      // Not actionable, so the queue cannot write it.
      expect(conflict.metadata?.actionable).toBe(false);

      const applyAttempt = await http()
        .post(`/ml/components/review-queue/${conflict.id}/apply`)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ expectedFingerprint: conflict.fingerprint });

      expect(applyAttempt.status).toBe(409);
      expect(body<{ reason?: string }>(applyAttempt).reason).toBe(
        'UNSUPPORTED_FINDING_TYPE',
      );
    });

    it('never writes a component value for a conflict', async () => {
      if (!hasDbUrl) return;

      const rows = await db
        .select()
        .from(componentAttributeValues)
        .where(
          and(
            eq(componentAttributeValues.componentId, conflictingComponentId),
            eq(
              componentAttributeValues.attributeDefinitionId,
              voltageDefinitionId,
            ),
          ),
        );
      expect(rows).toHaveLength(0);
    });

    it('states what each document says', async () => {
      if (!hasDbUrl) return;

      const state = await getState(conflictingComponentId);
      const voltage = specificationFor(state, voltageDefinitionId)!;

      const displays = voltage.groups.map((group) => group.display).sort();
      expect(displays).toEqual(['25V', '50V']);
      expect(voltage.confidenceReasons).toContain(
        '- documents disagree about the value',
      );
    });
  });

  // -------------------------------------------------------------------------
  // §16 — the value the component records
  // -------------------------------------------------------------------------

  describe('component value comparison', () => {
    it('reports when the component already records the documented value', async () => {
      if (!hasDbUrl) return;

      const componentId = await createComponent('CURRENT');
      await attributesService.saveComponentAttributes(componentId, [
        {
          attributeDefinitionId: resistanceDefinitionId,
          value: 300,
          unit: 'ohm',
        },
      ]);
      await uploadDatasheet(componentId, PDF_BYTES, `${runTag}-current.pdf`);

      const result = await runAnalysis(componentId);
      const resistance = specificationFor(result, resistanceDefinitionId)!;

      expect(resistance.state).toBe('ALREADY_CURRENT');
      expect(resistance.erpAgreement).toBe('AGREES');
      expect(resistance.currentValue).toBe('300 ohm');
      // No applicable finding is created for a value already recorded.
      const rows = await findingsFor(componentId);
      expect(
        rows.filter(
          (row) =>
            row.metadata?.attributeDefinitionId === resistanceDefinitionId &&
            row.issueType === 'ATTRIBUTE_VALUE_SUGGESTION',
        ),
      ).toHaveLength(0);
    });

    it('recognises an equivalent recorded value in another unit', async () => {
      if (!hasDbUrl) return;

      const componentId = await createComponent('EQUIV');
      await attributesService.saveComponentAttributes(componentId, [
        {
          attributeDefinitionId: resistanceDefinitionId,
          value: 0.3,
          unit: 'kohm',
        },
      ]);
      await uploadDatasheet(componentId, PDF_BYTES, `${runTag}-equiv.pdf`);

      const result = await runAnalysis(componentId);
      const resistance = specificationFor(result, resistanceDefinitionId)!;

      // 300 Ω and 0.3 kΩ are the same resistance, so this is not a conflict.
      expect(resistance.state).toBe('ALREADY_CURRENT');
    });

    it('reports a conflicting recorded value without touching it', async () => {
      if (!hasDbUrl) return;

      const componentId = await createComponent('DIFFERS');
      await attributesService.saveComponentAttributes(componentId, [
        {
          attributeDefinitionId: resistanceDefinitionId,
          value: 470,
          unit: 'ohm',
        },
      ]);
      await uploadDatasheet(componentId, PDF_BYTES, `${runTag}-differs.pdf`);

      const result = await runAnalysis(componentId);
      const resistance = specificationFor(result, resistanceDefinitionId)!;

      expect(resistance.state).toBe('AGREED');
      expect(resistance.erpAgreement).toBe('CONFLICTS');
      expect(resistance.currentValue).toBe('470 ohm');
      expect(resistance.confidenceReasons).toContain(
        '- the component records a different value',
      );

      // The recorded value is untouched: analysis never mutates the component.
      const [stored] = await db
        .select()
        .from(componentAttributeValues)
        .where(
          and(
            eq(componentAttributeValues.componentId, componentId),
            eq(
              componentAttributeValues.attributeDefinitionId,
              resistanceDefinitionId,
            ),
          ),
        );
      expect(Number(stored!.numberValue)).toBe(470);
    });

    it('marks each source with how it relates to the recorded value', async () => {
      if (!hasDbUrl) return;

      const componentId = await createComponent('MIXEDERP');
      await attributesService.saveComponentAttributes(componentId, [
        {
          attributeDefinitionId: voltageDefinitionId,
          value: 50,
          unit: 'V',
        },
      ]);

      const documentA = await uploadDatasheet(
        componentId,
        markedPdf('mixed-50v'),
        `${runTag}-mixed-a.pdf`,
      );
      void documentA;
      const documentB = await uploadDatasheet(
        componentId,
        markedPdf('mixed-25v'),
        `${runTag}-mixed-b.pdf`,
      );
      void documentB;
      stubExtractionByMarker([
        { marker: 'mixed-50v', payload: extractionPayload({ voltage: 50 }) },
        { marker: 'mixed-25v', payload: extractionPayload({ voltage: 25 }) },
      ]);

      const result = await runAnalysis(componentId);
      const voltage = specificationFor(result, voltageDefinitionId)!;

      // §16's example: the ERP value agrees with one source and conflicts with
      // the other, and both facts are reported per source.
      const erpStates = voltage.sources.map((source) => source.erp).sort();
      expect(erpStates).toEqual(['AGREES', 'CONFLICTS']);
      expect(voltage.state).toBe('CONFLICT');
    });
  });

  // -------------------------------------------------------------------------
  // §12 — evidence roles and pages
  // -------------------------------------------------------------------------

  describe('evidence quality', () => {
    it('reports the section each piece of evidence was found in', async () => {
      if (!hasDbUrl) return;

      const componentId = await createComponent('EVIDENCE');
      const documentId = await uploadDatasheet(
        componentId,
        PDF_BYTES,
        `${runTag}-evidence.pdf`,
      );
      stubExtraction(
        extractionPayload({ page: 7, section: 'ORDERING_INFORMATION' }),
      );
      await http()
        .post(`/ml/documents/${documentId}/analyze`)
        .set('Authorization', `Bearer ${writerToken}`);

      const result = await runAnalysis(componentId);
      const resistance = specificationFor(result, resistanceDefinitionId)!;

      const evidence = resistance.evidence.find(
        (item) => item.documentId === documentId && item.page === 7,
      );
      expect(evidence).toBeDefined();
      // Ordering information is a secondary section, so it is SUPPORTING.
      expect(evidence!.role).toBe('SUPPORTING');
      expect(evidence!.section).toBe('ORDERING_INFORMATION');
    });

    it('promotes a specification table to primary evidence', async () => {
      if (!hasDbUrl) return;

      const componentId = await createComponent('PRIMARY');
      const documentId = await uploadDatasheet(
        componentId,
        PDF_BYTES,
        `${runTag}-primary.pdf`,
      );
      stubExtraction(
        extractionPayload({ page: 3, section: 'ELECTRICAL_CHARACTERISTICS' }),
      );
      await http()
        .post(`/ml/documents/${documentId}/analyze`)
        .set('Authorization', `Bearer ${writerToken}`);

      const result = await runAnalysis(componentId);
      const resistance = specificationFor(result, resistanceDefinitionId)!;

      expect(
        resistance.evidence.some(
          (item) =>
            item.documentId === documentId &&
            item.role === 'PRIMARY' &&
            item.page === 3,
        ),
      ).toBe(true);
      expect(
        resistance.confidenceReasons.some((reason) =>
          reason.includes('specification table'),
        ),
      ).toBe(true);
    });

    it('claims no section when the extractor could not identify one', async () => {
      if (!hasDbUrl) return;

      const componentId = await createComponent('NOSECTION');
      const documentId = await uploadDatasheet(
        componentId,
        PDF_BYTES,
        `${runTag}-nosection.pdf`,
      );
      stubExtraction(extractionPayload({ page: 2, section: null }));
      await http()
        .post(`/ml/documents/${documentId}/analyze`)
        .set('Authorization', `Bearer ${writerToken}`);

      const response = await http()
        .get(`/ml/documents/${documentId}/analysis`)
        .set('Authorization', `Bearer ${readerToken}`);
      const analysis = body<AnalysisBody>(response).analysis!;
      const resistance = analysis.attributes.find(
        (attribute) => attribute.extractedCode === 'resistance',
      )!;

      const item = resistance.evidence.find((entry) => entry.page === 2);
      expect(item?.section).toBeNull();
      // Unidentified evidence is contextual, never promoted.
      expect(item?.role).toBe('CONTEXTUAL');
    });

    it('preserves the page a value was found on', async () => {
      if (!hasDbUrl) return;

      const state = await getState(agreeingComponentId);
      const resistance = specificationFor(state, resistanceDefinitionId)!;
      expect(resistance.evidence.some((item) => item.page === 3)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // §6 — ambiguity stays explicit
  // -------------------------------------------------------------------------

  describe('ambiguous mappings', () => {
    it('reports an ambiguous property with its ranked candidates', async () => {
      if (!hasDbUrl) return;

      /*
       * Two definitions claiming the *same* term make a mapping ambiguous. The
       * pair is unique to this run, and the extraction is stubbed to emit exactly
       * that property: an ambiguity created on a term another spec also extracts
       * would be visible to every other test file sharing this database, because
       * jest runs them in parallel workers.
       */
      const term = `p4signal${runTag}`.toLowerCase();
      const primary = await attributesService.createDefinition({
        code: term,
        name: `P4 Signal ${runTag}`,
        dataType: 'QUANTITY',
        unitCategory: 'Voltage',
        defaultUnit: 'V',
      });
      const alternate = await attributesService.createDefinition({
        code: `${term}_alt`,
        name: `P4 Signal ${runTag}`,
        dataType: 'QUANTITY',
        unitCategory: 'Voltage',
        defaultUnit: 'V',
      });
      createdDefinitionIds.push(primary.id, alternate.id);

      try {
        const componentId = await createComponent('AMBIGUOUS');
        await uploadDatasheet(componentId, PDF_BYTES, `${runTag}-ambig.pdf`);
        stubExtraction({
          attributes: {
            [term]: {
              code: term,
              value: 12,
              unit: 'V',
              formatted: '12V',
              confidence: 0.9,
              confidence_level: 'HIGH',
              evidence: [
                {
                  type: 'datasheet_param',
                  description: 'Extracted a property two attributes claim',
                  weight: 0.9,
                  source: 'extractor:ee_regex',
                  page: 2,
                  text: `... ${term} 12 V ...`,
                  section: 'ELECTRICAL_CHARACTERISTICS',
                },
              ],
            },
          },
          extracted_text_preview: null,
          extracted_text: null,
          page_count: 4,
          pages_analyzed: 2,
          extractor_version: 'datasheet-extract-v2',
        });

        const result = await runAnalysis(componentId);

        const ambiguous = result.unmapped.find(
          (entry) => entry.resolutionState === 'AMBIGUOUS',
        );
        expect(ambiguous).toBeDefined();
        expect(ambiguous!.extractedCode).toBe(term);
        expect(ambiguous!.candidates.length).toBeGreaterThanOrEqual(2);
        for (const candidate of ambiguous!.candidates) {
          expect(candidate.reasons.length).toBeGreaterThan(0);
        }
        // No actionable finding is created for an ambiguous mapping.
        const rows = await findingsFor(componentId);
        expect(
          rows.filter((row) => row.metadata?.attributeCode === term),
        ).toHaveLength(0);
        expect(result.summary.ambiguous).toBeGreaterThanOrEqual(1);
      } finally {
        await attributesService.deleteDefinition(primary.id);
        await attributesService.deleteDefinition(alternate.id);
      }
    });

    it('reports a property no attribute matches as unresolved', async () => {
      if (!hasDbUrl) return;

      const state = await getState(agreeingComponentId);
      const unresolved = state.unmapped.find(
        (entry) => entry.extractedCode === 'thermal_resistance',
      );

      expect(unresolved).toBeDefined();
      expect(unresolved!.resolutionState).toBe('UNRESOLVED');
      expect(unresolved!.candidates).toEqual([]);
      expect(state.summary.unresolved).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // §19 / §20 — fingerprints and reconciliation
  // -------------------------------------------------------------------------

  describe('fingerprints and reconciliation', () => {
    it('keeps the fingerprint stable when only the evidence changes', async () => {
      if (!hasDbUrl) return;

      const componentId = await createComponent('FPSTABLE');
      const firstDocument = await uploadDatasheet(
        componentId,
        PDF_BYTES,
        `${runTag}-fp-a.pdf`,
      );
      stubExtraction(extractionPayload({ page: 3 }));
      await http()
        .post(`/ml/documents/${firstDocument}/analyze`)
        .set('Authorization', `Bearer ${writerToken}`);
      const before = await runAnalysis(componentId);
      const beforeFinding = await attributeFinding(
        componentId,
        resistanceDefinitionId,
      );
      expect(beforeFinding).toBeDefined();
      expect(before.createdFindingCount).toBeGreaterThan(0);

      // A second document stating the same value, on another page.
      const secondDocument = await uploadDatasheet(
        componentId,
        PDF_BYTES,
        `${runTag}-fp-b.pdf`,
      );
      stubExtraction(extractionPayload({ page: 5 }));
      await http()
        .post(`/ml/documents/${secondDocument}/analyze`)
        .set('Authorization', `Bearer ${writerToken}`);
      await runAnalysis(componentId);

      const afterFinding = await attributeFinding(
        componentId,
        resistanceDefinitionId,
      );
      // Same value, more evidence: the same finding, refreshed.
      expect(afterFinding!.id).toBe(beforeFinding!.id);
      expect(afterFinding!.fingerprint).toBe(beforeFinding!.fingerprint);

      const rows = (await findingsFor(componentId)).filter(
        (row) =>
          row.issueType === 'ATTRIBUTE_VALUE_SUGGESTION' &&
          row.metadata?.attributeDefinitionId === resistanceDefinitionId,
      );
      // One pending suggestion, with the superseded per-document ones retired.
      expect(rows.filter((row) => row.status === 'PENDING')).toHaveLength(1);
    });

    it('creates a new finding when the normalized value changes', async () => {
      if (!hasDbUrl) return;

      const componentId = await createComponent('FPCHANGE');
      const documentId = await uploadDatasheet(
        componentId,
        PDF_BYTES,
        `${runTag}-fp-change.pdf`,
      );
      stubExtraction(extractionPayload({ resistance: 300 }));
      await http()
        .post(`/ml/documents/${documentId}/analyze`)
        .set('Authorization', `Bearer ${writerToken}`);
      await runAnalysis(componentId);
      const before = await attributeFinding(
        componentId,
        resistanceDefinitionId,
      );

      // A new revision states a different value.
      stubExtraction(extractionPayload({ resistance: 470 }));
      const versioned = await http()
        .post(`/documents/${documentId}/version`)
        .set('Authorization', `Bearer ${writerToken}`)
        .field('changelog', 'revised')
        .attach('file', Buffer.from('%PDF-1.4 revised 470 Ohm'), {
          filename: `${runTag}-fp-change-v2.pdf`,
          contentType: 'application/pdf',
        });
      expect(versioned.status).toBe(201);
      await http()
        .post(`/ml/documents/${documentId}/analyze`)
        .set('Authorization', `Bearer ${writerToken}`);
      await runAnalysis(componentId);

      const after = await attributeFinding(componentId, resistanceDefinitionId);
      expect(after!.fingerprint).not.toBe(before!.fingerprint);
      expect(after!.status).toBe('PENDING');
    });

    it('stales a suggestion whose candidate disappeared', async () => {
      if (!hasDbUrl) return;

      const componentId = await createComponent('RECONCILE');
      await uploadDatasheet(componentId, PDF_BYTES, `${runTag}-recon.pdf`);
      stubExtraction(extractionPayload({ voltage: 50 }));
      const first = await runAnalysis(componentId);
      const voltage = specificationFor(first, voltageDefinitionId);
      expect(voltage?.state).toBe('AGREED');

      const pending = await attributeFinding(componentId, voltageDefinitionId);
      expect(pending).toBeDefined();

      // The document no longer states the voltage, and the component now records
      // it, so the suggestion is no longer worth applying.
      stubExtraction(extractionPayload({ voltage: null }));
      await attributesService.saveComponentAttributes(componentId, [
        {
          attributeDefinitionId: voltageDefinitionId,
          value: 50,
          unit: 'V',
        },
      ]);
      const second = await runAnalysis(componentId);

      expect(second.staledFindingCount).toBeGreaterThanOrEqual(1);
      const after = await db
        .select()
        .from(componentIntelligenceFindings)
        .where(eq(componentIntelligenceFindings.id, pending!.id));
      expect(after[0]!.status).toBe('STALE');
    });

    it('preserves a reviewer decision across re-analysis', async () => {
      if (!hasDbUrl) return;

      const componentId = await createComponent('HISTORY');
      await uploadDatasheet(componentId, PDF_BYTES, `${runTag}-history.pdf`);
      await runAnalysis(componentId);
      const finding = await attributeFinding(
        componentId,
        resistanceDefinitionId,
      );
      expect(finding).toBeDefined();

      const decision = await http()
        .post(`/ml/components/review-queue/${finding!.id}/decision`)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ decision: 'REJECTED' });
      expect(decision.status).toBe(201);

      await runAnalysis(componentId);

      const stored = await reviewQueue.getFinding(finding!.id);
      expect(stored.status).toBe('REJECTED');
    });
  });

  // -------------------------------------------------------------------------
  // §24 — summary counts
  // -------------------------------------------------------------------------

  describe('summary', () => {
    it('derives every count from the persisted findings', async () => {
      if (!hasDbUrl) return;

      const state = await getState(agreeingComponentId);
      const findings = await findingsFor(agreeingComponentId);

      const pending = findings.filter((row) => row.status === 'PENDING').length;
      expect(state.summary.needsReview).toBe(pending);
      expect(state.summary.documentsAnalyzed).toBeGreaterThan(0);
      expect(state.summary.specificationsFound).toBe(
        state.specifications.length,
      );
      expect(state.summary.conflicts).toBe(
        findings.filter((row) => row.issueType === 'DOCUMENT_CONFLICT').length,
      );
    });

    it('reports the same counts through the read and analyze routes', async () => {
      if (!hasDbUrl) return;

      const state = await getState(agreeingComponentId);
      const run = await runAnalysis(agreeingComponentId);

      expect(run.summary.needsReview).toBe(state.summary.needsReview);
      expect(run.summary.applied).toBe(state.summary.applied);
      expect(run.summary.conflicts).toBe(state.summary.conflicts);
    });

    it('reports the documents that were not analysed', async () => {
      if (!hasDbUrl) return;

      const componentId = await createComponent('BOUNDED');
      for (let index = 0; index < 7; index += 1) {
        await uploadDatasheet(
          componentId,
          PDF_BYTES,
          `${runTag}-bounded-${index}.pdf`,
        );
      }

      const result = await runAnalysis(componentId);
      // The document bound is enforced and reported, never silent.
      expect(result.summary.documentsAnalyzed).toBe(5);
      expect(result.summary.documentsNotAnalyzed).toHaveLength(2);
    });

    it('reports documents it could not analyse instead of failing', async () => {
      if (!hasDbUrl) return;

      const componentId = await createComponent('SKIPPED');
      await uploadDatasheet(componentId, PDF_BYTES, `${runTag}-skipped.pdf`);
      // A corrupt upload is a clean empty extraction, so the run reports it.
      stubExtraction({
        attributes: {},
        extracted_text_preview: null,
        extracted_text: null,
        page_count: 0,
        pages_analyzed: null,
        extractor_version: 'datasheet-extract-v2',
      });

      const result = await runAnalysis(componentId);
      expect(result.summary.documentsAnalyzed).toBe(1);
      expect(result.summary.specificationsFound).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // §25 — security
  // -------------------------------------------------------------------------

  describe('authorization and ownership', () => {
    it('rejects an unauthenticated read with 401', async () => {
      if (!hasDbUrl) return;
      const response = await http().get(
        `/ml/components/${agreeingComponentId}/documentation`,
      );
      expect(response.status).toBe(401);
    });

    it('rejects an unauthenticated analysis with 401', async () => {
      if (!hasDbUrl) return;
      const response = await http().post(
        `/ml/components/${agreeingComponentId}/documentation/analyze`,
      );
      expect(response.status).toBe(401);
    });

    it('lets a read-only user read but not analyze', async () => {
      if (!hasDbUrl) return;

      const read = await http()
        .get(`/ml/components/${agreeingComponentId}/documentation`)
        .set('Authorization', `Bearer ${readerToken}`);
      expect(read.status).toBe(200);

      const analyze = await http()
        .post(`/ml/components/${agreeingComponentId}/documentation/analyze`)
        .set('Authorization', `Bearer ${readerToken}`);
      expect(analyze.status).toBe(403);
    });

    it('never reads another component documents', async () => {
      if (!hasDbUrl) return;

      // The other component has its own datasheet, which must not appear in the
      // first component's analysis: documents are resolved server-side from the
      // component's own documentation.
      const otherDocument = await uploadDatasheet(
        otherComponentId,
        PDF_BYTES,
        `${runTag}-other.pdf`,
      );

      const state = await getState(agreeingComponentId);
      expect(state.eligibleDocumentIds).not.toContain(otherDocument);
      for (const specification of state.specifications) {
        for (const source of specification.sources) {
          expect(source.documentId).not.toBe(otherDocument);
        }
      }
    });

    it('ignores a body claiming a different component', async () => {
      if (!hasDbUrl) return;

      // The route takes no body at all, so a body cannot redirect the analysis:
      // the component is the path segment, and the documents are resolved from
      // that component's own documentation.
      const response = await http()
        .post(`/ml/components/${agreeingComponentId}/documentation/analyze`)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ componentId: otherComponentId, documentIds: ['anything'] });

      expect(response.status).toBe(201);

      const analyses = await db
        .select({ componentId: documentIntelligenceAnalyses.componentId })
        .from(documentIntelligenceAnalyses)
        .where(
          inArray(documentIntelligenceAnalyses.documentId, createdDocumentIds),
        );
      // Every analysis belongs to a component that owns the document; none was
      // created for the component named in the body.
      const otherDocuments = await db
        .select({ id: documents.id })
        .from(documents)
        .where(eq(documents.entityId, otherComponentId));
      const otherDocumentIds = new Set(otherDocuments.map((row) => row.id));
      for (const analysis of analyses) {
        if (otherDocumentIds.has(analysis.componentId)) continue;
        expect(analysis.componentId).not.toBe(otherComponentId);
      }
    });

    it('returns 404 for a component that does not exist', async () => {
      if (!hasDbUrl) return;

      const response = await http()
        .get(
          '/ml/components/00000000-0000-4000-8000-0000000000ff/documentation',
        )
        .set('Authorization', `Bearer ${readerToken}`);
      expect(response.status).toBe(404);
    });

    it('applies findings to the component that owns them, never another', async () => {
      if (!hasDbUrl) return;

      const componentId = await createComponent('OWNERSHIP');
      await uploadDatasheet(componentId, PDF_BYTES, `${runTag}-ownership.pdf`);
      await runAnalysis(componentId);
      const finding = await attributeFinding(
        componentId,
        resistanceDefinitionId,
      );
      expect(finding).toBeDefined();

      // The apply contract carries no component id, so there is nothing to forge.
      const applied = await http()
        .post(`/ml/components/review-queue/${finding!.id}/apply`)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ expectedFingerprint: finding!.fingerprint });
      expect(applied.status).toBe(201);

      const [stored] = await db
        .select()
        .from(componentAttributeValues)
        .where(
          and(
            eq(componentAttributeValues.componentId, componentId),
            eq(
              componentAttributeValues.attributeDefinitionId,
              resistanceDefinitionId,
            ),
          ),
        );
      expect(stored).toBeDefined();

      // The other component is untouched.
      const other = await db
        .select()
        .from(componentAttributeValues)
        .where(eq(componentAttributeValues.componentId, otherComponentId));
      expect(other).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Advisory guarantee
  // -------------------------------------------------------------------------

  describe('advisory guarantee', () => {
    it('never writes a component attribute during a component-level analysis', async () => {
      if (!hasDbUrl) return;

      const componentId = await createComponent('ADVISORY4');
      await uploadDatasheet(componentId, PDF_BYTES, `${runTag}-advisory4.pdf`);
      const result = await runAnalysis(componentId);

      expect(result.summary.specificationsFound).toBeGreaterThan(0);

      const values = await db
        .select()
        .from(componentAttributeValues)
        .where(eq(componentAttributeValues.componentId, componentId));
      expect(values).toHaveLength(0);
    });

    it('creates no attribute definition from a document', async () => {
      if (!hasDbUrl) return;

      const before = await attributesService.getAllDefinitions();
      const componentId = await createComponent('NODEF');
      await uploadDatasheet(componentId, PDF_BYTES, `${runTag}-nodef.pdf`);
      await runAnalysis(componentId);
      const after = await attributesService.getAllDefinitions();

      expect(after.length).toBe(before.length);
      expect(after.some((d) => d.code === 'thermal_resistance')).toBe(false);
    });

    it('resolves the component from the path, not from a document', async () => {
      if (!hasDbUrl) return;

      const componentId = await createComponent('RESOLVE');
      const documentId = await uploadDatasheet(
        componentId,
        PDF_BYTES,
        `${runTag}-resolve.pdf`,
      );
      await runAnalysis(componentId);

      const analyses = await db
        .select()
        .from(documentIntelligenceAnalyses)
        .where(eq(documentIntelligenceAnalyses.documentId, documentId));
      expect(analyses.length).toBeGreaterThan(0);
      for (const analysis of analyses) {
        expect(analysis.componentId).toBe(componentId);
      }
    });

    it('is callable directly on the service without mutating the component', async () => {
      if (!hasDbUrl) return;

      const componentId = await createComponent('SERVICE');
      await uploadDatasheet(componentId, PDF_BYTES, `${runTag}-service.pdf`);

      const result = await intelligence.analyzeComponent(componentId, {
        id: undefined,
        email: 'service@ananya.local',
      });

      expect(result.summary.documentsAnalyzed).toBeGreaterThan(0);
      const component = await componentsService.getComponent(componentId);
      expect(component.manufacturerPartNumber).toBeNull();
      expect(component.categoryId).toBeNull();
      expect(component.manufacturerId).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Regression: the per-document pipeline still works
  // -------------------------------------------------------------------------

  describe('per-document analysis remains authoritative', () => {
    it('still analyses a single document through its own route', async () => {
      if (!hasDbUrl) return;

      const componentId = await createComponent('PERDOC');
      const documentId = await uploadDatasheet(
        componentId,
        PDF_BYTES,
        `${runTag}-perdoc.pdf`,
      );

      const response = await http()
        .post(`/ml/documents/${documentId}/analyze`)
        .set('Authorization', `Bearer ${writerToken}`);
      expect(response.status).toBe(201);

      const state = await http()
        .get(`/ml/documents/${documentId}/analysis`)
        .set('Authorization', `Bearer ${readerToken}`);
      expect(state.status).toBe(200);
      expect(
        body<AnalysisBody>(state).analysis!.attributes.length,
      ).toBeGreaterThan(0);
    });

    it('keeps the per-document findings reviewable through the queue', async () => {
      if (!hasDbUrl) return;

      const queue = await http()
        .get(
          `/ml/components/review-queue?componentId=${singleComponentId}&pageSize=100`,
        )
        .set('Authorization', `Bearer ${readerToken}`);
      expect(queue.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Materialization ownership
  // -------------------------------------------------------------------------

  /**
   * The component-level aggregation is the authoritative materialization point
   * for actionable attribute findings. These tests pin that down: a
   * component-level run creates the aggregate finding and *nothing else*, so
   * repeated runs cannot accumulate retired suggestions.
   */
  describe('materialization ownership', () => {
    /** Every attribute finding for a component, whatever its status. */
    async function attributeFindingRows(componentId: string) {
      const rows = await findingsFor(componentId);
      return rows.filter(
        (row) =>
          row.issueType === 'ATTRIBUTE_VALUE_SUGGESTION' ||
          row.issueType === 'DOCUMENT_CONFLICT',
      );
    }

    it('materializes one finding per specification and no per-document duplicates', async () => {
      if (!hasDbUrl) return;

      const componentId = await createComponent('MATERIALIZE');
      await uploadDatasheet(componentId, PDF_BYTES, `${runTag}-mat-a.pdf`);
      await uploadDatasheet(
        componentId,
        PDF_BYTES,
        `${runTag}-mat-b.pdf`,
        'PRODUCT_PAGE',
      );

      const result = await runAnalysis(componentId);

      const rows = await attributeFindingRows(componentId);
      // Two documents, four agreed specifications each: four findings, not eight.
      expect(rows.length).toBe(result.summary.specificationsFound);
      expect(rows.filter((row) => row.status === 'PENDING').length).toBe(
        result.summary.specificationsFound,
      );
      // Nothing was created only to be retired in the same run.
      expect(rows.filter((row) => row.status === 'STALE')).toHaveLength(0);
      expect(result.staledFindingCount).toBe(0);
    });

    it('does not grow the finding set when analysis is repeated', async () => {
      if (!hasDbUrl) return;

      const componentId = await createComponent('NOREPEAT');
      await uploadDatasheet(componentId, PDF_BYTES, `${runTag}-rep-a.pdf`);
      await uploadDatasheet(
        componentId,
        PDF_BYTES,
        `${runTag}-rep-b.pdf`,
        'PRODUCT_PAGE',
      );

      await runAnalysis(componentId);
      const afterFirst = await attributeFindingRows(componentId);
      const fingerprints = afterFirst.map((row) => row.fingerprint).sort();

      const staleCounts: number[] = [];
      for (let run = 0; run < 3; run += 1) {
        const result = await runAnalysis(componentId);
        staleCounts.push(result.staledFindingCount);
      }

      const afterRepeats = await attributeFindingRows(componentId);
      // Identical rows: no new finding, and no additional retirement either.
      expect(afterRepeats).toHaveLength(afterFirst.length);
      expect(afterRepeats.map((row) => row.fingerprint).sort()).toEqual(
        fingerprints,
      );
      expect(afterRepeats.filter((row) => row.status === 'STALE')).toHaveLength(
        0,
      );
      expect(staleCounts).toEqual([0, 0, 0]);
    });

    it('retires a legacy per-document finding once and never revives it', async () => {
      if (!hasDbUrl) return;

      const componentId = await createComponent('LEGACY');
      const documentId = await uploadDatasheet(
        componentId,
        PDF_BYTES,
        `${runTag}-legacy.pdf`,
      );

      // A standalone per-document analysis materializes the document's own
      // finding, exactly as Pass 3 does.
      const standalone = await http()
        .post(`/ml/documents/${documentId}/analyze`)
        .set('Authorization', `Bearer ${writerToken}`);
      expect(standalone.status).toBe(201);

      const before = await attributeFindingRows(componentId);
      expect(before.filter((row) => row.status === 'PENDING').length).toBe(
        before.length,
      );
      const legacyIds = before.map((row) => row.id).sort();

      // The first component-level run retires them: the aggregate is now the
      // authoritative item for those specifications.
      const first = await runAnalysis(componentId);
      expect(first.staledFindingCount).toBe(before.length);

      const afterFirst = await attributeFindingRows(componentId);
      for (const row of afterFirst) {
        if (legacyIds.includes(row.id)) expect(row.status).toBe('STALE');
      }

      // Re-running must not revive them, and must not retire anything again.
      const second = await runAnalysis(componentId);
      expect(second.staledFindingCount).toBe(0);

      const afterSecond = await attributeFindingRows(componentId);
      expect(afterSecond).toHaveLength(afterFirst.length);
      for (const row of afterSecond) {
        if (legacyIds.includes(row.id)) expect(row.status).toBe('STALE');
      }
    });

    it('records the deferred materialization on the stored analysis', async () => {
      if (!hasDbUrl) return;

      const componentId = await createComponent('DEFERRED');
      const documentId = await uploadDatasheet(
        componentId,
        PDF_BYTES,
        `${runTag}-deferred.pdf`,
      );
      await runAnalysis(componentId);

      const [row] = await db
        .select()
        .from(documentIntelligenceAnalyses)
        .where(eq(documentIntelligenceAnalyses.documentId, documentId))
        .limit(1);

      expect(row).toBeDefined();
      // The extraction and its evidence are stored in full: the analysis is
      // still the historical, evidence-bearing record it was.
      expect(row!.status).toBe('FINDINGS_AVAILABLE');
      expect((row!.attributes as unknown[]).length).toBeGreaterThan(0);
      expect((row!.evidence as unknown[]).length).toBeGreaterThan(0);
      expect(row!.contentHash).toBeTruthy();

      // The findings it recorded are the document's own identity findings — not
      // attribute suggestions, which the aggregate owns.
      const recorded = row!.findingFingerprints as string[];
      const allFindings = await db
        .select()
        .from(componentIntelligenceFindings)
        .where(eq(componentIntelligenceFindings.componentId, componentId));
      const recordedFindings = allFindings.filter((finding) =>
        recorded.includes(finding.fingerprint),
      );
      expect(recordedFindings.length).toBeGreaterThan(0);
      expect(
        recordedFindings.every(
          (finding) => finding.issueCategory !== 'ATTRIBUTE_VALUE',
        ),
      ).toBe(true);
    });

    it('keeps the per-document panel showing the authoritative review state', async () => {
      if (!hasDbUrl) return;

      const componentId = await createComponent('PANELSTATE');
      const documentId = await uploadDatasheet(
        componentId,
        PDF_BYTES,
        `${runTag}-panelstate.pdf`,
      );
      await runAnalysis(componentId);

      const response = await http()
        .get(`/ml/documents/${documentId}/analysis`)
        .set('Authorization', `Bearer ${readerToken}`);
      const attributes = body<AnalysisBody>(response).analysis!.attributes;
      const resistance = attributes.find(
        (attribute) => attribute.extractedCode === 'resistance',
      )!;

      // The analysis stored no per-document finding, but the component-level
      // aggregate is the authoritative item for this specification, so the
      // panel must report it rather than "not analyzed".
      expect(resistance.review).not.toBeNull();
      expect(resistance.review!.status).toBe('PENDING');
      expect(resistance.review!.findingId).toBeTruthy();
    });

    it('keeps apply working on the aggregate finding', async () => {
      if (!hasDbUrl) return;

      const componentId = await createComponent('APPLYAGG');
      applyComponentId = componentId;
      await uploadDatasheet(componentId, PDF_BYTES, `${runTag}-applyagg.pdf`);
      await runAnalysis(componentId);

      const finding = await attributeFinding(
        componentId,
        resistanceDefinitionId,
      );
      expect(finding).toBeDefined();

      const applied = await http()
        .post(`/ml/components/review-queue/${finding!.id}/apply`)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ expectedFingerprint: finding!.fingerprint });
      expect(applied.status).toBe(201);

      const [stored] = await db
        .select()
        .from(componentAttributeValues)
        .where(
          and(
            eq(componentAttributeValues.componentId, componentId),
            eq(
              componentAttributeValues.attributeDefinitionId,
              resistanceDefinitionId,
            ),
          ),
        );
      expect(Number(stored!.numberValue)).toBe(300);

      // Applying wrote provenance from the aggregate's primary source.
      const provenance = stored!.provenance as Record<string, unknown>;
      expect(provenance.findingId).toBe(finding!.id);
      expect(provenance.documentId).toBeTruthy();

      // And a re-run after the application adds no new suggestion.
      const rerun = await runAnalysis(componentId);
      expect(rerun.staledFindingCount).toBe(0);
      const rows = await attributeFindingRows(componentId);
      const forResistance = rows.filter(
        (row) =>
          row.metadata?.attributeDefinitionId === resistanceDefinitionId &&
          row.status === 'PENDING',
      );
      // The applied value is now what the component records, so nothing is
      // pending for it any more.
      expect(forResistance).toHaveLength(0);
    });

    it('records the application in the feedback ledger exactly once', async () => {
      if (!hasDbUrl) return;

      const rows = await db
        .select()
        .from(aiSuggestionFeedback)
        .where(
          and(
            eq(aiSuggestionFeedback.componentId, applyComponentId),
            eq(
              aiSuggestionFeedback.suggestionType,
              'ATTRIBUTE_VALUE_SUGGESTION',
            ),
          ),
        );

      const applied = rows.filter(
        (row) => row.metadata?.applicationResult === 'APPLIED',
      );
      expect(applied).toHaveLength(1);
    });
  });
});

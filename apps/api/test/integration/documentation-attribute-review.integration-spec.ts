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
import { DocumentationAnalysisService } from '../../src/ml/documentation-analysis.service';
import { ComponentReviewQueueService } from '../../src/ml/component-review-queue.service';
import { DOCUMENT_ATTRIBUTE_SOURCE } from '../../src/ml/document-attribute-value-review';
import { db, closeDatabaseConnection } from '@ananya/database';
import {
  aiSuggestionFeedback,
  attributeDefinitions,
  componentAttributeValues,
  componentIntelligenceFindings,
  components,
  documentIntelligenceAnalyses,
  documents,
  roles,
  users,
} from '@ananya/database/schema';
import { and, eq, inArray } from '@ananya/database/query';
import type { ComponentIntelligenceFinding } from '@ananya/database/schema';

/** Response body of one analysis candidate. */
interface CandidateBody {
  extractedCode: string;
  formatted: string;
  resolution: string;
  resolutionState: string;
  validationState: string;
  validationReason: string | null;
  applicable: boolean;
  inapplicableReason: string | null;
  validationDetail: string | null;
  conflict: boolean;
  currentValue: string | null;
  attributeDefinitionId: string | null;
  normalizedValue: unknown;
  resolutionConfidence: number;
  resolutionReasons: string[];
  resolutionCandidates: Array<{ attributeCode: string; reasons: string[] }>;
  review: {
    findingId: string | null;
    status: string | null;
    fingerprint: string | null;
    isNew: boolean;
    applied: boolean;
  } | null;
}

interface AnalysisBody {
  documentId?: string;
  message?: string | string[];
  createdFindingCount?: number;
  staledPreviousCount?: number;
  statusCode?: number;
  reason?: string;
  analysis?: {
    id: string;
    componentId: string;
    attributes: CandidateBody[];
    findings: Array<{
      id: string;
      issueType: string;
      issueCategory: string;
      attributeDefinitionId: string | null;
      applied: boolean;
      status: string;
    }>;
    document: { documentVersion: number; contentHash: string };
  } | null;
}

interface ApplyBody {
  findingId?: string;
  field?: string;
  fieldLabel?: string;
  previousValue?: string | null;
  appliedValue?: string | null;
  appliedValueLabel?: string | null;
  reason?: string;
  message?: string;
  component?: { id: string; sku: string; updatedAt: string };
}

/**
 * Pass 3: Attribute Value Review and Apply over HTTP.
 *
 * Proves the whole path — datasheet extraction → formal review finding → human
 * decision → apply through the existing attribute use case → provenance,
 * feedback and audit — and, just as importantly, every way that path must
 * REFUSE: invalid and unresolved values, ambiguous attributes, inactive or
 * missing definitions, changed recorded values, retired components, missing
 * permissions, forged identity, and concurrent reviewers.
 *
 * The ML service is stubbed at the Nest boundary (`MlClientService` /
 * `MlService`): extraction quality is covered by the Python suite, while
 * everything Ananya owns — resolution, validation, findings, staleness,
 * application, provenance and authorization — is exercised here against a real
 * database.
 */
describe('Attribute Value Review and Apply', () => {
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
  let analysisService: DocumentationAnalysisService;
  let reviewQueue: ComponentReviewQueueService;

  const createdRoleIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdComponentIds: string[] = [];
  const createdDocumentIds: string[] = [];
  const createdDefinitionIds: string[] = [];
  let storageRoot = '';

  let writerToken = '';
  let readerToken = '';
  let resistanceDefinitionId = '';
  let packageDefinitionId = '';

  /**
   * One component per scenario, so a mutation made by one test can never decide
   * the outcome of another.
   */
  let cleanComponentId = '';
  let conflictComponentId = '';
  let staleComponentId = '';
  let retiredComponentId = '';
  let concurrencyComponentId = '';

  const PDF_BYTES = Buffer.from(
    '%PDF-1.4 datasheet 300 Ohm 1% 0805 0.125W Yageo MC0805S8F3000T5E',
  );
  const PDF_REVISION_BYTES = Buffer.from(
    '%PDF-1.4 datasheet revision 2 470 Ohm 5% 1206 Yageo MC0805S8F3000T5E',
  );

  function http() {
    return request(app.getHttpServer() as Parameters<typeof request>[0]);
  }

  function body<T>(response: { body: unknown }): T {
    return response.body as T;
  }

  /** Deterministic extraction payload, shaped exactly like the Python response. */
  function extractionPayload(
    options: {
      resistance?: number | string | null;
      resistanceFormatted?: string;
      packageCode?: string;
      includePowerRating?: boolean;
      evidencePage?: number | null;
      /** One more extracted property, for a scenario needing its own term. */
      extraAttribute?: Record<string, unknown>;
    } = {},
  ) {
    const resistance =
      options.resistance === undefined ? 300 : options.resistance;
    const packageCode = options.packageCode ?? '0805';
    const evidencePage =
      options.evidencePage === undefined ? 3 : options.evidencePage;

    const attributes: Record<string, unknown> = {
      resistance: {
        code: 'resistance',
        value: resistance,
        unit: 'ohm',
        formatted: options.resistanceFormatted ?? '300Ω',
        confidence: 0.95,
        confidence_level: 'HIGH',
        evidence: [
          {
            type: 'datasheet_param',
            description: 'Extracted resistance rating 300Ω',
            weight: 0.95,
            source: 'extractor:ee_regex',
            page: evidencePage,
            text:
              evidencePage === null ? null : '... resistance 300 ohm ±1% ...',
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
      // No attribute definition exists for this property: it must be reported,
      // never created.
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
            page: null,
            text: null,
          },
        ],
      },
    };

    if (options.includePowerRating !== false) {
      attributes.power_rating = {
        code: 'power_rating',
        value: 0.125,
        unit: 'W',
        formatted: '0.125W',
        confidence: 0.93,
        confidence_level: 'HIGH',
        evidence: [
          {
            type: 'datasheet_param',
            description: 'Extracted power rating 0.125W',
            weight: 0.93,
            source: 'extractor:ee_regex',
            page: 2,
            text: '... power rating 0.125 W ...',
          },
        ],
      };
    }

    if (options.extraAttribute) {
      const code = options.extraAttribute.code;
      if (typeof code === 'string') {
        attributes[code] = options.extraAttribute;
      }
    }

    return {
      attributes,
      extracted_text_preview: 'datasheet text…',
      extracted_text: 'Yageo MC0805S8F3000T5E 300 Ohm 1% 0805 0.125W',
      page_count: 4,
      pages_analyzed: 4,
      extractor_version: 'datasheet-extract-v2',
    };
  }

  /** Existing component-intelligence response shape. */
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

  async function uploadDatasheet(
    componentId: string,
    bytes: Buffer,
    filename: string,
    token = writerToken,
  ): Promise<string> {
    const response = await http()
      .post('/documents/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('entityType', 'Component')
      .field('entityId', componentId)
      .field('documentType', 'DATASHEET')
      .field('title', `${runTag} ${filename}`)
      .attach('file', bytes, { filename, contentType: 'application/pdf' });

    expect(response.status).toBe(201);
    const id = body<{ id: string }>(response).id;
    createdDocumentIds.push(id);
    return id;
  }

  async function analyze(componentId: string, documentId: string) {
    const response = await http()
      .post(`/ml/documents/${documentId}/analyze`)
      .set('Authorization', `Bearer ${writerToken}`);
    expect(response.status).toBe(201);
    const payload = body<AnalysisBody>(response);
    expect(payload.analysis?.componentId).toBe(componentId);
    return payload;
  }

  /**
   * The current (pending) attribute-value finding for one attribute.
   *
   * A superseded suggestion stays in the table as history, so the newest
   * PENDING row is the one a reviewer would act on.
   */
  async function attributeFinding(
    componentId: string,
    attributeDefinitionId: string,
  ): Promise<ComponentIntelligenceFinding> {
    const rows = await attributeFindings(componentId, attributeDefinitionId);
    const pending = rows.filter((row) => row.status === 'PENDING');
    const match =
      pending.length > 0 ? pending[pending.length - 1]! : rows[rows.length - 1];
    expect(match).toBeDefined();
    return match!;
  }

  async function createComponent(label: string) {
    const component = await componentsService.create({
      sku: `E2E-AVR-${runTag}-${label}`,
      name: `Attribute Review Fixture ${runTag} ${label}`,
      unit: 'pcs',
    });
    createdComponentIds.push(component.id);
    return component.id;
  }

  /** Writes an attribute value the way a human editor would. */
  async function setAttribute(
    componentId: string,
    attributeDefinitionId: string,
    input: Record<string, unknown>,
  ) {
    await attributesService.saveComponentAttributes(componentId, [
      { attributeDefinitionId, ...input },
    ]);
  }

  /**
   * The feedback ledger entry that records the value actually written.
   *
   * A decision and an application are separate entries in this ledger (the
   * queue records both the review history and the mutation), so "recorded
   * exactly once" is asserted on the application entry.
   */
  async function applicationFeedback(componentId: string, findingId: string) {
    const rows = await db
      .select()
      .from(aiSuggestionFeedback)
      .where(eq(aiSuggestionFeedback.componentId, componentId));
    return rows.filter((row) => {
      const metadata = row.metadata;
      return (
        metadata?.findingId === findingId &&
        metadata?.applicationResult === 'APPLIED'
      );
    });
  }

  async function storedValue(
    componentId: string,
    attributeDefinitionId: string,
  ) {
    const [row] = await db
      .select()
      .from(componentAttributeValues)
      .where(
        and(
          eq(componentAttributeValues.componentId, componentId),
          eq(
            componentAttributeValues.attributeDefinitionId,
            attributeDefinitionId,
          ),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /**
   * Attribute-value findings for one component, optionally for one attribute.
   *
   * Scoped by attribute because a single analysis legitimately produces one
   * finding per actionable specification: "no finding for THIS property" is the
   * property under test, not "no findings at all".
   */
  async function attributeFindings(
    componentId: string,
    attributeDefinitionId?: string,
  ) {
    const rows = await db
      .select()
      .from(componentIntelligenceFindings)
      .where(
        and(
          eq(componentIntelligenceFindings.componentId, componentId),
          eq(componentIntelligenceFindings.source, DOCUMENT_ATTRIBUTE_SOURCE),
        ),
      );
    if (!attributeDefinitionId) return rows;
    return rows.filter(
      (row) => row.metadata?.attributeDefinitionId === attributeDefinitionId,
    );
  }

  function candidateFor(
    payload: AnalysisBody,
    extractedCode: string,
  ): CandidateBody {
    const candidate = payload.analysis!.attributes.find(
      (item) => item.extractedCode === extractedCode,
    );
    expect(candidate).toBeDefined();
    return candidate!;
  }

  beforeAll(async () => {
    if (!hasDbUrl) return;

    storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ananya-avr-e2e-'));
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
    analysisService = app.get(DocumentationAnalysisService);
    reviewQueue = app.get(ComponentReviewQueueService);

    // The electronics data pack provides the authoritative definitions this
    // pass resolves against (resistance QUANTITY / ohm, package SELECT / 0805).
    // Nothing in Pass 3 invents a definition, so the fixture uses real ones.
    await dataPacksService.installDataPack('electronics-smd');

    const definitions = await attributesService.getAllDefinitions();
    resistanceDefinitionId = definitions.find(
      (d) => d.code === 'resistance',
    )!.id;
    packageDefinitionId = definitions.find((d) => d.code === 'package')!.id;

    const readerRole = await rolesService.create({
      name: `E2E AVR Reader ${runId}`,
      description: 'Attribute review fixture: read-only',
      permissions: ['Inventory.Read'],
    });
    const writerRole = await rolesService.create({
      name: `E2E AVR Writer ${runId}`,
      description: 'Attribute review fixture: component editor',
      permissions: ['Inventory.Read', 'Inventory.Update'],
    });
    createdRoleIds.push(readerRole.id, writerRole.id);

    const reader = await usersService.create({
      email: `avr-reader-${runId}@ananya.local`,
      password: 'ReaderPassw0rd!',
      firstName: 'AVR',
      lastName: 'Reader',
      roleId: readerRole.id,
    });
    const writer = await usersService.create({
      email: `avr-writer-${runId}@ananya.local`,
      password: 'WriterPassw0rd!',
      firstName: 'AVR',
      lastName: 'Writer',
      roleId: writerRole.id,
    });
    createdUserIds.push(reader.id, writer.id);

    readerToken = (await authService.createSessionForUser(reader.id)).token;
    writerToken = (await authService.createSessionForUser(writer.id)).token;

    cleanComponentId = await createComponent('CLEAN');
    conflictComponentId = await createComponent('CONFLICT');
    staleComponentId = await createComponent('STALE');
    retiredComponentId = await createComponent('RETIRED');
    concurrencyComponentId = await createComponent('RACE');
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
    for (const id of createdComponentIds) {
      await componentsService.delete(id).catch(() => undefined);
    }
    if (createdDefinitionIds.length > 0) {
      await db
        .delete(attributeDefinitions)
        .where(inArray(attributeDefinitions.id, createdDefinitionIds));
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
  // 1, 2, 23 — candidates become formal review items, deterministically
  // -------------------------------------------------------------------------

  describe('extraction candidates become review findings', () => {
    let documentId = '';

    it('turns an actionable specification into a finding on the existing queue', async () => {
      if (!hasDbUrl) return;
      documentId = await uploadDatasheet(
        cleanComponentId,
        PDF_BYTES,
        `${runTag}-clean.pdf`,
      );

      const first = await analyze(cleanComponentId, documentId);
      const resistance = candidateFor(first, 'resistance');

      // Resolution and validation state are explicit on the candidate.
      expect(resistance.resolutionState).toBe('RESOLVED');
      expect(resistance.validationState).toBe('VALID');
      expect(resistance.applicable).toBe(true);
      expect(resistance.inapplicableReason).toBeNull();
      expect(resistance.attributeDefinitionId).toBe(resistanceDefinitionId);
      expect(resistance.normalizedValue).toEqual({ value: 300, unit: 'ohm' });

      // A formal review item, with the review state attached to the candidate.
      expect(resistance.review).not.toBeNull();
      expect(resistance.review!.status).toBe('PENDING');
      expect(resistance.review!.isNew).toBe(true);
      expect(resistance.review!.applied).toBe(false);
      expect(resistance.review!.findingId).toBeTruthy();
      expect(resistance.review!.fingerprint).toBeTruthy();

      // It is an ordinary finding on the existing queue, with the Pass 3
      // taxonomy and producer tag.
      const finding = await attributeFinding(
        cleanComponentId,
        resistanceDefinitionId,
      );
      expect(finding.issueType).toBe('ATTRIBUTE_VALUE_SUGGESTION');
      expect(finding.issueCategory).toBe('ATTRIBUTE_VALUE');
      // The field names the attribute the finding targets, so the queue can
      // filter and display it like any other finding.
      expect(finding.metadata?.field).toBe('attributes.resistance');
      expect(finding.status).toBe('PENDING');

      const queue = await http()
        .get(
          `/ml/components/review-queue?componentId=${cleanComponentId}&pageSize=100`,
        )
        .set('Authorization', `Bearer ${readerToken}`);
      expect(queue.status).toBe(200);
      const items = body<{ items: Array<{ id: string; source: string }> }>(
        queue,
      ).items;
      expect(items.some((item) => item.id === finding.id)).toBe(true);
      expect(
        items.some((item) => item.source === DOCUMENT_ATTRIBUTE_SOURCE),
      ).toBe(true);
    });

    it('is idempotent: re-analysis refreshes the finding instead of duplicating it (1, 23)', async () => {
      if (!hasDbUrl) return;

      const before = await db
        .select()
        .from(componentIntelligenceFindings)
        .where(
          and(
            eq(componentIntelligenceFindings.componentId, cleanComponentId),
            eq(componentIntelligenceFindings.source, DOCUMENT_ATTRIBUTE_SOURCE),
          ),
        );
      expect(before.length).toBeGreaterThan(0);

      const second = await analyze(cleanComponentId, documentId);

      // Nothing new was created, and the same row is still PENDING.
      expect(second.createdFindingCount).toBe(0);
      expect(second.staledPreviousCount).toBe(0);
      const resistance = candidateFor(second, 'resistance');
      expect(resistance.review!.isNew).toBe(false);
      expect(resistance.review!.findingId).toBe(
        (await attributeFinding(cleanComponentId, resistanceDefinitionId)).id,
      );

      const after = await db
        .select()
        .from(componentIntelligenceFindings)
        .where(
          and(
            eq(componentIntelligenceFindings.componentId, cleanComponentId),
            eq(componentIntelligenceFindings.source, DOCUMENT_ATTRIBUTE_SOURCE),
          ),
        );
      expect(after).toHaveLength(before.length);
    });

    it('produces a stable fingerprint for the same bytes and component state (2)', async () => {
      if (!hasDbUrl) return;

      const finding = await attributeFinding(
        cleanComponentId,
        resistanceDefinitionId,
      );
      const payload = await analyze(cleanComponentId, documentId);
      const resistance = candidateFor(payload, 'resistance');

      expect(resistance.review!.fingerprint).toBe(finding.fingerprint);
    });

    it('produces a new fingerprint when the document revision changes (3, 4)', async () => {
      if (!hasDbUrl) return;

      const before = await attributeFinding(
        cleanComponentId,
        resistanceDefinitionId,
      );

      const versioned = await http()
        .post(`/documents/${documentId}/version`)
        .set('Authorization', `Bearer ${writerToken}`)
        .field('changelog', 'revised datasheet')
        .attach('file', PDF_REVISION_BYTES, {
          filename: `${runTag}-clean-v2.pdf`,
          contentType: 'application/pdf',
        });
      expect(versioned.status).toBe(201);
      expect(body<{ currentVersion: number }>(versioned).currentVersion).toBe(
        2,
      );

      const payload = await analyze(cleanComponentId, documentId);
      expect(payload.analysis!.document.documentVersion).toBe(2);

      // The superseded suggestion is STALE, not deleted: history is preserved
      // and a stale suggestion can never be applied.
      const [staleRow] = await db
        .select()
        .from(componentIntelligenceFindings)
        .where(eq(componentIntelligenceFindings.id, before.id))
        .limit(1);
      expect(staleRow!.status).toBe('STALE');

      // A new, distinct fingerprint now describes the same attribute.
      const refreshed = await attributeFinding(
        cleanComponentId,
        resistanceDefinitionId,
      );
      expect(refreshed.id).not.toBe(before.id);
      expect(refreshed.fingerprint).not.toBe(before.fingerprint);
      expect(refreshed.status).toBe('PENDING');
      expect(
        (refreshed.metadata?.document as Record<string, unknown>)
          .documentVersion,
      ).toBe(2);
    });

    it('never creates an attribute definition from a datasheet property (9)', async () => {
      if (!hasDbUrl) return;

      const payload = await analyze(cleanComponentId, documentId);
      const thermal = candidateFor(payload, 'thermal_resistance');

      expect(thermal.resolutionState).toBe('UNRESOLVED');
      expect(thermal.validationState).toBe('INVALID');
      expect(thermal.applicable).toBe(false);
      expect(thermal.inapplicableReason).toBe('ATTRIBUTE_NOT_FOUND');
      expect(thermal.review).toBeNull();

      const definitions = await attributesService.getAllDefinitions();
      expect(definitions.some((d) => d.code === 'thermal_resistance')).toBe(
        false,
      );

      // No finding was created for the unresolved property, and it is not
      // silently mapped onto some other definition either.
      const findings = await attributeFindings(cleanComponentId);
      expect(
        findings.some(
          (row) => row.metadata?.attributeCode === 'thermal_resistance',
        ),
      ).toBe(false);
      expect(findings.some((row) => row.suggestedValue?.rawValue === 25)).toBe(
        false,
      );
    });

    it('reports classification values that the definition cannot represent as invalid (7)', async () => {
      if (!hasDbUrl) return;

      jest.spyOn(mlClient, 'extractDatasheet').mockResolvedValue(
        extractionPayload({
          packageCode: 'not-a-real-package',
        }) as never,
      );

      const other = await createComponent('INVALID');
      const documentForOther = await uploadDatasheet(
        other,
        PDF_BYTES,
        `${runTag}-invalid.pdf`,
      );
      const payload = await analyze(other, documentForOther);

      const packageCandidate = candidateFor(payload, 'package');
      expect(packageCandidate.resolutionState).toBe('RESOLVED');
      expect(packageCandidate.validationState).toBe('INVALID');
      expect(packageCandidate.validationReason).toBe('INVALID_SELECT_OPTION');
      expect(packageCandidate.applicable).toBe(false);
      expect(packageCandidate.inapplicableReason).toBe('INVALID_VALUE');
      expect(packageCandidate.review).toBeNull();

      // Invalid values are never executable, so no finding was created for the
      // package while the other specifications still were.
      expect(await attributeFindings(other, packageDefinitionId)).toHaveLength(
        0,
      );
      expect((await attributeFindings(other)).length).toBeGreaterThan(0);
    });

    it('treats a property that matches two definitions as ambiguous (8)', async () => {
      if (!hasDbUrl) return;

      /*
       * Two definitions claiming the *same* term make the extracted property
       * genuinely ambiguous: a human decides, the extractor does not.
       *
       * The pair is unique to this run, and the extraction is stubbed to emit
       * exactly that property. A second definition named `Resistance` would be
       * visible to every other spec analysing concurrently — jest runs test files
       * in parallel workers against one database — and would make `resistance`
       * ambiguous for all of them.
       */
      const term = `avrsignal${runTag}`.toLowerCase();
      const shadow = await attributesService.createDefinition({
        code: term,
        name: `AVR Signal ${runTag}`,
        dataType: 'QUANTITY',
        unitCategory: 'Voltage',
        defaultUnit: 'V',
      });
      const primary = await attributesService.createDefinition({
        code: `${term}_primary`,
        name: `AVR Signal ${runTag}`,
        dataType: 'QUANTITY',
        unitCategory: 'Voltage',
        defaultUnit: 'V',
      });
      createdDefinitionIds.push(shadow.id, primary.id);

      try {
        jest.spyOn(mlClient, 'extractDatasheet').mockResolvedValue(
          extractionPayload({
            extraAttribute: {
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
                },
              ],
            },
          }) as never,
        );

        const other = await createComponent('AMBIGUOUS');
        const documentForOther = await uploadDatasheet(
          other,
          PDF_BYTES,
          `${runTag}-ambiguous.pdf`,
        );
        const payload = await analyze(other, documentForOther);

        const ambiguous = candidateFor(payload, term);
        expect(ambiguous.resolutionState).toBe('AMBIGUOUS');
        expect(ambiguous.validationState).toBe('REQUIRES_REVIEW');
        expect(ambiguous.applicable).toBe(false);
        expect(ambiguous.inapplicableReason).toBe('AMBIGUOUS_ATTRIBUTE');
        expect(ambiguous.review).toBeNull();
        expect(ambiguous.resolutionCandidates.length).toBeGreaterThanOrEqual(2);

        // Neither of the two candidate definitions received a finding: an
        // ambiguous match is reported, never resolved silently.
        expect(await attributeFindings(other, shadow.id)).toHaveLength(0);
        expect(await attributeFindings(other, primary.id)).toHaveLength(0);
      } finally {
        await attributesService.deleteDefinition(shadow.id);
        await attributesService.deleteDefinition(primary.id);
        for (const id of [shadow.id, primary.id]) {
          const index = createdDefinitionIds.indexOf(id);
          if (index >= 0) createdDefinitionIds.splice(index, 1);
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // 10, 11, 5 — the recorded value decides the review outcome
  // -------------------------------------------------------------------------

  describe('current value versus suggested value', () => {
    it('requires an explicit human decision when the component records a different value (10)', async () => {
      if (!hasDbUrl) return;

      await setAttribute(conflictComponentId, resistanceDefinitionId, {
        value: 470,
        unit: 'ohm',
      });

      const documentId = await uploadDatasheet(
        conflictComponentId,
        PDF_BYTES,
        `${runTag}-conflict.pdf`,
      );
      const payload = await analyze(conflictComponentId, documentId);
      const resistance = candidateFor(payload, 'resistance');

      expect(resistance.currentValue).toBe('470 ohm');
      expect(resistance.conflict).toBe(true);
      // A conflict is reviewable, not invalid: the reviewer must see both
      // values and decide.
      expect(resistance.validationState).toBe('REQUIRES_REVIEW');
      expect(resistance.applicable).toBe(true);
      expect(resistance.review!.status).toBe('PENDING');

      const finding = await attributeFinding(
        conflictComponentId,
        resistanceDefinitionId,
      );
      expect(finding.currentValue).toEqual({
        attributeDefinitionId: resistanceDefinitionId,
        attributeCode: 'resistance',
        value: '470 ohm',
      });
      expect((finding.metadata as Record<string, unknown>).conflict).toBe(true);
      expect(finding.description).toContain('470 ohm');
    });

    it('creates no actionable duplicate when the value is already recorded (11)', async () => {
      if (!hasDbUrl) return;

      const other = await createComponent('SAME');
      await setAttribute(other, resistanceDefinitionId, {
        value: 300,
        unit: 'ohm',
      });

      const documentId = await uploadDatasheet(
        other,
        PDF_BYTES,
        `${runTag}-same.pdf`,
      );
      const payload = await analyze(other, documentId);
      const resistance = candidateFor(payload, 'resistance');

      expect(resistance.currentValue).toBe('300 ohm');
      expect(resistance.validationState).toBe('VALID');
      expect(resistance.applicable).toBe(false);
      expect(resistance.inapplicableReason).toBe('VALUE_ALREADY_CURRENT');
      expect(resistance.review).toBeNull();

      // Informational only: no finding was created for resistance, while the
      // other specifications still were.
      expect(
        await attributeFindings(other, resistanceDefinitionId),
      ).toHaveLength(0);
      expect((await attributeFindings(other)).length).toBeGreaterThan(0);
    });

    it('becomes stale instead of applying when the recorded value changed (5)', async () => {
      if (!hasDbUrl) return;

      const documentId = await uploadDatasheet(
        staleComponentId,
        PDF_BYTES,
        `${runTag}-stale.pdf`,
      );
      await analyze(staleComponentId, documentId);
      const finding = await attributeFinding(
        staleComponentId,
        resistanceDefinitionId,
      );

      // A human edits the attribute after the analysis ran.
      await setAttribute(staleComponentId, resistanceDefinitionId, {
        value: 999,
        unit: 'ohm',
      });

      const response = await http()
        .post(`/ml/components/review-queue/${finding.id}/apply`)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ expectedFingerprint: finding.fingerprint });

      expect(response.status).toBe(409);
      expect(body<ApplyBody>(response).reason).toBe('ATTRIBUTE_VALUE_CHANGED');

      // The manual value is untouched, and the suggestion is now stale.
      const stored = await storedValue(
        staleComponentId,
        resistanceDefinitionId,
      );
      expect(Number(stored!.numberValue)).toBe(999);
      const [after] = await db
        .select()
        .from(componentIntelligenceFindings)
        .where(eq(componentIntelligenceFindings.id, finding.id))
        .limit(1);
      expect(after!.status).toBe('STALE');

      // A stale suggestion cannot be applied on a retry either (22).
      const retry = await http()
        .post(`/ml/components/review-queue/${finding.id}/apply`)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ expectedFingerprint: finding.fingerprint });
      expect(retry.status).toBe(409);
      expect(body<ApplyBody>(retry).reason).toBe('FINDING_NOT_PENDING');
    });
  });

  // -------------------------------------------------------------------------
  // Apply: the existing mutation path
  // -------------------------------------------------------------------------

  describe('applying an accepted specification', () => {
    let findingId = '';
    let fingerprint = '';

    it('accepts the suggestion, then writes it through the attribute use case', async () => {
      if (!hasDbUrl) return;

      const finding = await attributeFinding(
        cleanComponentId,
        resistanceDefinitionId,
      );
      findingId = finding.id;
      fingerprint = finding.fingerprint;

      // Nothing is written by inspecting or accepting it.
      expect(
        await storedValue(cleanComponentId, resistanceDefinitionId),
      ).toBeNull();

      const accepted = await http()
        .post(`/ml/components/review-queue/${findingId}/decision`)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ decision: 'ACCEPTED' });
      expect(accepted.status).toBe(201);
      expect(
        await storedValue(cleanComponentId, resistanceDefinitionId),
      ).toBeNull();

      const applied = await http()
        .post(`/ml/components/review-queue/${findingId}/apply`)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ expectedFingerprint: fingerprint });
      // The body is included so a refusal reports its machine-readable reason.
      if (applied.status !== 201) {
        throw new Error(`apply refused: ${JSON.stringify(applied.body)}`);
      }
      expect(applied.status).toBe(201);

      const result = body<ApplyBody>(applied);
      expect(result.findingId).toBe(findingId);
      expect(result.field).toBe('attributes');
      expect(result.fieldLabel).toBe('Resistance');
      expect(result.appliedValue).toBe('300Ω');

      // The component attribute now holds the extracted value, written by the
      // existing attribute domain: 300 Ω, normalized, with its unit.
      const stored = await storedValue(
        cleanComponentId,
        resistanceDefinitionId,
      );
      expect(Number(stored!.numberValue)).toBe(300);
      expect(stored!.unit).toBe('ohm');
      expect(Number(stored!.normalizedNumberValue)).toBe(300);

      const populated =
        await attributesService.getComponentAttributes(cleanComponentId);
      expect(populated.resistance!.displayValue).toBe('300 ohm');
    });

    it('preserves provenance: document, revision, hash, page and excerpt (24, 25)', async () => {
      if (!hasDbUrl) return;

      const stored = await storedValue(
        cleanComponentId,
        resistanceDefinitionId,
      );
      const provenance = stored!.provenance as Record<string, unknown>;

      expect(provenance.source).toBe(DOCUMENT_ATTRIBUTE_SOURCE);
      expect(provenance.findingId).toBe(findingId);
      expect(provenance.documentVersion).toBe(2);
      expect(typeof provenance.documentId).toBe('string');
      expect(typeof provenance.contentHash).toBe('string');
      expect(provenance.intelligenceVersion).toBeTruthy();
      expect(provenance.reviewerEmail).toContain(`avr-writer-${runId}`);
      expect(typeof provenance.appliedAt).toBe('string');

      // The page is the page the extractor located the value on, not the first
      // evidence item's page.
      expect(provenance.page).toBe(3);
      expect(String(provenance.evidenceExcerpt)).toContain('300 ohm');

      // Provenance survives a reload: it is stored, not computed on read.
      const reloaded = await storedValue(
        cleanComponentId,
        resistanceDefinitionId,
      );
      expect(reloaded!.provenance).toEqual(stored!.provenance);
    });

    it('records the application in the feedback ledger exactly once (26)', async () => {
      if (!hasDbUrl) return;

      const feedback = await db
        .select()
        .from(aiSuggestionFeedback)
        .where(
          and(
            eq(aiSuggestionFeedback.componentId, cleanComponentId),
            eq(
              aiSuggestionFeedback.suggestionType,
              'ATTRIBUTE_VALUE_SUGGESTION',
            ),
          ),
        );

      const forFinding = feedback.filter(
        (row) => row.metadata?.findingId === findingId,
      );
      // One entry for the review history, one for the mutation — and exactly one
      // of each, naming the attribute this finding targets.
      expect(forFinding).toHaveLength(2);
      const applied = await applicationFeedback(cleanComponentId, findingId);
      expect(applied).toHaveLength(1);
      expect(applied[0]!.userAction).toBe('ACCEPTED');
      expect(applied[0]!.field).toBe('attributes.resistance');
      expect(applied[0]!.finalValue).toEqual({ value: 300 });
      expect(
        (applied[0]!.metadata as Record<string, unknown>).appliedValue,
      ).toBe('300Ω');
      expect(
        (applied[0]!.metadata as Record<string, unknown>).documentId,
      ).toBeTruthy();
    });

    it('marks the finding accepted, with the application recorded on it', async () => {
      if (!hasDbUrl) return;

      const queue = await reviewQueue.getFinding(findingId);
      expect(queue.status).toBe('ACCEPTED');
      expect(queue.metadata.applied).toBe(true);
      expect(queue.metadata.applicationResult).toBe('APPLIED');
      expect(queue.reviewerEmail).toContain(`avr-writer-${runId}`);
    });

    it('reports the applied value on the analysis without a reload', async () => {
      if (!hasDbUrl) return;

      const state = await analysisService.getAnalysisState(
        (
          await db
            .select({ documentId: documentIntelligenceAnalyses.documentId })
            .from(documentIntelligenceAnalyses)
            .where(
              eq(documentIntelligenceAnalyses.componentId, cleanComponentId),
            )
            .limit(1)
        )[0]!.documentId,
      );

      const resistance = state.analysis!.attributes.find(
        (item) => item.extractedCode === 'resistance',
      )!;
      expect(resistance.review?.applied).toBe(true);
      expect(resistance.review?.status).toBe('ACCEPTED');
    });

    it('refuses to apply the same finding twice (21)', async () => {
      if (!hasDbUrl) return;

      const second = await http()
        .post(`/ml/components/review-queue/${findingId}/apply`)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ expectedFingerprint: fingerprint });

      expect(second.status).toBe(409);
      expect(body<ApplyBody>(second).reason).toBe('FINDING_NOT_PENDING');

      // And exactly one stored value, reflecting exactly one application.
      const stored = await storedValue(
        cleanComponentId,
        resistanceDefinitionId,
      );
      expect(Number(stored!.numberValue)).toBe(300);
      expect(
        await applicationFeedback(cleanComponentId, findingId),
      ).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // 17, 18 — concurrency and failure
  // -------------------------------------------------------------------------

  describe('concurrency and failure handling', () => {
    it('applies exactly one mutation for two concurrent reviewers (17)', async () => {
      if (!hasDbUrl) return;

      const documentId = await uploadDatasheet(
        concurrencyComponentId,
        PDF_BYTES,
        `${runTag}-race.pdf`,
      );
      await analyze(concurrencyComponentId, documentId);
      const finding = await attributeFinding(
        concurrencyComponentId,
        resistanceDefinitionId,
      );

      const [first, second] = await Promise.all([
        http()
          .post(`/ml/components/review-queue/${finding.id}/apply`)
          .set('Authorization', `Bearer ${writerToken}`)
          .send({ expectedFingerprint: finding.fingerprint }),
        http()
          .post(`/ml/components/review-queue/${finding.id}/apply`)
          .set('Authorization', `Bearer ${writerToken}`)
          .send({ expectedFingerprint: finding.fingerprint }),
      ]);

      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([201, 409]);

      // Exactly one value and one feedback row: the loser wrote nothing.
      const rows = await db
        .select()
        .from(componentAttributeValues)
        .where(
          and(
            eq(componentAttributeValues.componentId, concurrencyComponentId),
            eq(
              componentAttributeValues.attributeDefinitionId,
              resistanceDefinitionId,
            ),
          ),
        );
      expect(rows).toHaveLength(1);
      expect(Number(rows[0]!.numberValue)).toBe(300);

      expect(
        await applicationFeedback(concurrencyComponentId, finding.id),
      ).toHaveLength(1);
    });

    it('leaves the finding pending and writes nothing when the domain refuses the value (18)', async () => {
      if (!hasDbUrl) return;

      // A finding whose stored value the attribute domain will not accept: the
      // definition is QUANTITY, so a non-numeric value is refused by the
      // existing validation inside the attribute use case.
      const quantityDefinition = await attributesService.createDefinition({
        code: `avr_quantity_${runTag}`,
        name: `AVR Quantity ${runTag}`,
        dataType: 'QUANTITY',
        unitCategory: 'Resistance',
        defaultUnit: 'ohm',
      });
      createdDefinitionIds.push(quantityDefinition.id);

      const other = await createComponent('REFUSED');
      const persisted = await reviewQueue.persistFindings([
        {
          componentId: other,
          issueType: 'ATTRIBUTE_VALUE_SUGGESTION',
          issueCategory: 'ATTRIBUTE_VALUE',
          field: `attributes.${quantityDefinition.code}`,
          title: 'Quantity attribute suggested',
          description: 'A value the attribute domain refuses.',
          currentValue: {
            attributeDefinitionId: quantityDefinition.id,
            attributeCode: quantityDefinition.code,
            value: null,
          },
          suggestedValue: {
            attributeDefinitionId: quantityDefinition.id,
            attributeCode: quantityDefinition.code,
            dataType: 'QUANTITY',
            display: 'not a number',
            unit: 'ohm',
            value: { value: 'not-a-number', unit: 'ohm' },
          },
          confidence: 0.9,
          confidenceLevel: 'HIGH',
          evidence: [],
          source: DOCUMENT_ATTRIBUTE_SOURCE,
          intelligenceVersion: 'datasheet-intelligence-v1',
          metadata: {
            rule: 'ATTRIBUTE_VALUE_SUGGESTION',
            origin: 'DATASHEET',
            field: `attributes.${quantityDefinition.code}`,
            attributeDefinitionId: quantityDefinition.id,
            attributeCode: quantityDefinition.code,
            actionable: true,
          },
        },
      ]);
      const finding = persisted.findings[0]!;

      const response = await http()
        .post(`/ml/components/review-queue/${finding.id}/apply`)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ expectedFingerprint: finding.fingerprint });

      expect(response.status).toBe(409);
      expect(body<ApplyBody>(response).reason).toBe('INVALID_SUGGESTED_VALUE');

      // Consistent state: no value written, the finding is still PENDING, and
      // no feedback claims an application happened.
      expect(await storedValue(other, quantityDefinition.id)).toBeNull();
      const [after] = await db
        .select()
        .from(componentIntelligenceFindings)
        .where(eq(componentIntelligenceFindings.id, finding.id))
        .limit(1);
      expect(after!.status).toBe('PENDING');
      const feedback = await db
        .select()
        .from(aiSuggestionFeedback)
        .where(eq(aiSuggestionFeedback.componentId, other));
      expect(feedback).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // 6, 12, 15, 16 — refused targets
  // -------------------------------------------------------------------------

  describe('refused targets', () => {
    it('refuses to apply to a retired component (12)', async () => {
      if (!hasDbUrl) return;

      const documentId = await uploadDatasheet(
        retiredComponentId,
        PDF_BYTES,
        `${runTag}-retired.pdf`,
      );
      await analyze(retiredComponentId, documentId);
      const finding = await attributeFinding(
        retiredComponentId,
        resistanceDefinitionId,
      );

      // Consolidation retires the record; its suggestions must not be applied.
      await db
        .update(components)
        .set({ consolidatedIntoComponentId: cleanComponentId, isActive: false })
        .where(eq(components.id, retiredComponentId));

      const response = await http()
        .post(`/ml/components/review-queue/${finding.id}/apply`)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ expectedFingerprint: finding.fingerprint });

      expect(response.status).toBe(409);
      expect(body<ApplyBody>(response).reason).toBe('COMPONENT_RETIRED');
      expect(
        await storedValue(retiredComponentId, resistanceDefinitionId),
      ).toBeNull();
    });

    it('refuses to apply through a deactivated attribute definition (6)', async () => {
      if (!hasDbUrl) return;

      const other = await createComponent('INACTIVE');
      const documentId = await uploadDatasheet(
        other,
        PDF_BYTES,
        `${runTag}-inactive.pdf`,
      );
      await analyze(other, documentId);
      const finding = await attributeFinding(other, resistanceDefinitionId);

      await attributesService.updateDefinition(resistanceDefinitionId, {
        isActive: false,
      });

      try {
        const response = await http()
          .post(`/ml/components/review-queue/${finding.id}/apply`)
          .set('Authorization', `Bearer ${writerToken}`)
          .send({ expectedFingerprint: finding.fingerprint });

        expect(response.status).toBe(409);
        expect(body<ApplyBody>(response).reason).toBe(
          'SUGGESTED_ENTITY_INACTIVE',
        );
        expect(await storedValue(other, resistanceDefinitionId)).toBeNull();
      } finally {
        await attributesService.updateDefinition(resistanceDefinitionId, {
          isActive: true,
        });
      }
    });

    it('rejects a finding whose attribute definition no longer exists (16)', async () => {
      if (!hasDbUrl) return;

      const orphan = await attributesService.createDefinition({
        code: `avr_orphan_${runTag}`,
        name: `AVR Orphan ${runTag}`,
        dataType: 'QUANTITY',
        defaultUnit: 'ohm',
      });

      const other = await createComponent('ORPHAN');
      const persisted = await reviewQueue.persistFindings([
        {
          componentId: other,
          issueType: 'ATTRIBUTE_VALUE_SUGGESTION',
          issueCategory: 'ATTRIBUTE_VALUE',
          field: `attributes.${orphan.code}`,
          title: 'Orphan definition suggestion',
          description: 'The definition is deleted before the application.',
          currentValue: {
            attributeDefinitionId: orphan.id,
            attributeCode: orphan.code,
            value: null,
          },
          suggestedValue: {
            attributeDefinitionId: orphan.id,
            attributeCode: orphan.code,
            dataType: 'QUANTITY',
            display: '300 ohm',
            unit: 'ohm',
            value: { value: 300, unit: 'ohm' },
          },
          confidence: 0.9,
          confidenceLevel: 'HIGH',
          evidence: [],
          source: DOCUMENT_ATTRIBUTE_SOURCE,
          intelligenceVersion: 'datasheet-intelligence-v1',
          metadata: {
            rule: 'ATTRIBUTE_VALUE_SUGGESTION',
            origin: 'DATASHEET',
            attributeDefinitionId: orphan.id,
            attributeCode: orphan.code,
            actionable: true,
          },
        },
      ]);
      const finding = persisted.findings[0]!;

      await attributesService.deleteDefinition(orphan.id);

      const response = await http()
        .post(`/ml/components/review-queue/${finding.id}/apply`)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ expectedFingerprint: finding.fingerprint });

      expect(response.status).toBe(409);
      expect(body<ApplyBody>(response).reason).toBe(
        'SUGGESTED_ENTITY_NOT_FOUND',
      );
      expect(await storedValue(other, orphan.id)).toBeNull();
    });

    it('ignores a forged target supplied in the request body (15, 16)', async () => {
      if (!hasDbUrl) return;

      const other = await createComponent('FORGED');
      const documentId = await uploadDatasheet(
        other,
        PDF_BYTES,
        `${runTag}-forged.pdf`,
      );
      await analyze(other, documentId);
      const finding = await attributeFinding(other, resistanceDefinitionId);

      // The apply contract identifies the finding only: the target component and
      // attribute definition are read from the finding, never the request.
      const response = await http()
        .post(`/ml/components/review-queue/${finding.id}/apply`)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          expectedFingerprint: finding.fingerprint,
          componentId: cleanComponentId,
          attributeDefinitionId: packageDefinitionId,
          value: { value: 999, unit: 'ohm' },
        });

      expect(response.status).toBe(400);

      // Nothing was written to either component.
      expect(
        await storedValue(cleanComponentId, packageDefinitionId),
      ).toBeNull();
      expect(await storedValue(other, resistanceDefinitionId)).toBeNull();
      expect(await storedValue(other, packageDefinitionId)).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 13, 14, 19, 20 — authorization and decisions
  // -------------------------------------------------------------------------

  describe('authorization and decisions', () => {
    it('rejects an unauthenticated apply with 401', async () => {
      if (!hasDbUrl) return;

      const finding = await attributeFinding(
        conflictComponentId,
        resistanceDefinitionId,
      );

      const response = await http()
        .post(`/ml/components/review-queue/${finding.id}/apply`)
        .send({ expectedFingerprint: finding.fingerprint });

      expect(response.status).toBe(401);
    });

    it('rejects an apply without Inventory.Update with 403 (13)', async () => {
      if (!hasDbUrl) return;

      const finding = await attributeFinding(
        conflictComponentId,
        resistanceDefinitionId,
      );

      const response = await http()
        .post(`/ml/components/review-queue/${finding.id}/apply`)
        .set('Authorization', `Bearer ${readerToken}`)
        .send({ expectedFingerprint: finding.fingerprint });

      expect(response.status).toBe(403);

      // A read-only reviewer cannot even record the decision.
      const decision = await http()
        .post(`/ml/components/review-queue/${finding.id}/decision`)
        .set('Authorization', `Bearer ${readerToken}`)
        .send({ decision: 'ACCEPTED' });
      expect(decision.status).toBe(403);

      const stored = await storedValue(
        conflictComponentId,
        resistanceDefinitionId,
      );
      expect(Number(stored!.numberValue)).toBe(470);
    });

    it('takes the reviewer from the session, never the body (14)', async () => {
      if (!hasDbUrl) return;

      const finding = await attributeFinding(
        conflictComponentId,
        resistanceDefinitionId,
      );

      const response = await http()
        .post(`/ml/components/review-queue/${finding.id}/apply`)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({
          expectedFingerprint: finding.fingerprint,
          reviewerId: 'forged-reviewer',
          reviewerEmail: 'attacker@example.com',
        });

      // A forged identity is refused outright by the request contract.
      expect(response.status).toBe(400);
      expect(
        await storedValue(conflictComponentId, resistanceDefinitionId),
      ).not.toBeNull();

      // The legitimate apply records the authenticated principal.
      const legit = await http()
        .post(`/ml/components/review-queue/${finding.id}/apply`)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ expectedFingerprint: finding.fingerprint });
      expect(legit.status).toBe(201);

      const queue = await reviewQueue.getFinding(finding.id);
      expect(queue.reviewerEmail).toContain(`avr-writer-${runId}`);
      expect(queue.reviewerEmail).not.toContain('attacker');

      // The conflict was resolved by writing the datasheet value over the
      // recorded one, which is what the reviewer was asked to decide.
      const stored = await storedValue(
        conflictComponentId,
        resistanceDefinitionId,
      );
      expect(Number(stored!.numberValue)).toBe(300);
    });

    it('refuses to apply a rejected finding (19)', async () => {
      if (!hasDbUrl) return;

      const other = await createComponent('REJECTED');
      const documentId = await uploadDatasheet(
        other,
        PDF_BYTES,
        `${runTag}-rejected.pdf`,
      );
      await analyze(other, documentId);
      const finding = await attributeFinding(other, resistanceDefinitionId);

      const decision = await http()
        .post(`/ml/components/review-queue/${finding.id}/decision`)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ decision: 'REJECTED' });
      expect(decision.status).toBe(201);

      const response = await http()
        .post(`/ml/components/review-queue/${finding.id}/apply`)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ expectedFingerprint: finding.fingerprint });

      expect(response.status).toBe(409);
      expect(body<ApplyBody>(response).reason).toBe('FINDING_NOT_PENDING');
      expect(await storedValue(other, resistanceDefinitionId)).toBeNull();
    });

    it('refuses to apply a dismissed finding (20)', async () => {
      if (!hasDbUrl) return;

      const other = await createComponent('DISMISSED');
      const documentId = await uploadDatasheet(
        other,
        PDF_BYTES,
        `${runTag}-dismissed.pdf`,
      );
      await analyze(other, documentId);
      const finding = await attributeFinding(other, packageDefinitionId);

      const decision = await http()
        .post(`/ml/components/review-queue/${finding.id}/decision`)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ decision: 'DISMISSED' });
      expect(decision.status).toBe(201);

      const response = await http()
        .post(`/ml/components/review-queue/${finding.id}/apply`)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ expectedFingerprint: finding.fingerprint });

      expect(response.status).toBe(409);
      expect(body<ApplyBody>(response).reason).toBe('FINDING_NOT_PENDING');
      expect(await storedValue(other, packageDefinitionId)).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Advisory guarantee
  // -------------------------------------------------------------------------

  describe('advisory guarantee', () => {
    it('never mutates a component attribute during analysis', async () => {
      if (!hasDbUrl) return;

      const other = await createComponent('ADVISORY');
      const documentId = await uploadDatasheet(
        other,
        PDF_BYTES,
        `${runTag}-advisory.pdf`,
      );
      await analyze(other, documentId);

      // The analysis produced findings…
      const rows = await db
        .select()
        .from(componentIntelligenceFindings)
        .where(
          and(
            eq(componentIntelligenceFindings.componentId, other),
            eq(componentIntelligenceFindings.source, DOCUMENT_ATTRIBUTE_SOURCE),
          ),
        );
      expect(rows.length).toBeGreaterThan(0);

      // …and wrote no attribute value at all.
      const values = await db
        .select()
        .from(componentAttributeValues)
        .where(eq(componentAttributeValues.componentId, other));
      expect(values).toHaveLength(0);
    });

    it('requires the component write permission to run the analysis at all', async () => {
      if (!hasDbUrl) return;

      const other = await createComponent('AUTH');
      const documentId = await uploadDatasheet(
        other,
        PDF_BYTES,
        `${runTag}-auth.pdf`,
      );

      const forbidden = await http()
        .post(`/ml/documents/${documentId}/analyze`)
        .set('Authorization', `Bearer ${readerToken}`);
      expect(forbidden.status).toBe(403);

      const anonymous = await http().post(
        `/ml/documents/${documentId}/analyze`,
      );
      expect(anonymous.status).toBe(401);
    });

    it('keeps the specification candidates visible to read-only users', async () => {
      if (!hasDbUrl) return;

      const documentId = await uploadDatasheet(
        cleanComponentId,
        PDF_BYTES,
        `${runTag}-readonly.pdf`,
      );
      await analyze(cleanComponentId, documentId);

      const response = await http()
        .get(`/ml/documents/${documentId}/analysis`)
        .set('Authorization', `Bearer ${readerToken}`);

      expect(response.status).toBe(200);
      const payload = body<AnalysisBody>(response);
      expect(payload.analysis!.attributes.length).toBeGreaterThan(0);
      // The review state is part of the analysis payload, so a read-only user
      // sees exactly what was applied and by whom it is pending.
      for (const attribute of payload.analysis!.attributes) {
        expect(attribute.resolutionState).toBeTruthy();
        expect(attribute.validationState).toBeTruthy();
        expect(typeof attribute.applicable).toBe('boolean');
      }
    });
  });
});

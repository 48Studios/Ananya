import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import request from 'supertest';
import { closeDatabaseConnection, db } from '@ananya/database';
import { billOfMaterialLines, components } from '@ananya/database/schema';
import { sql } from '@ananya/database/query';
import { AppModule } from '../../src/app.module';
import { ComponentsService } from '../../src/components/components.service';
import { CategoriesService } from '../../src/categories/categories.service';
import { ManufacturersService } from '../../src/manufacturers/manufacturers.service';
import {
  ComponentReviewAnalyzer,
  COMPONENT_REVIEW_INTELLIGENCE_VERSION,
} from '../../src/ml/component-review-analyzer';
import { ComponentReviewQueueService } from '../../src/ml/component-review-queue.service';
import { ComponentConsolidationPreviewService } from '../../src/ml/component-consolidation-preview.service';
import {
  ALL_DEPENDENCY_ADAPTERS,
  inspectDependencyCoverage,
} from '../../src/ml/component-consolidation-dependencies';
import { CONSOLIDATION_PREVIEW_VERSION } from '../../src/ml/component-consolidation.dtos';

/**
 * Consolidation preview integration coverage (Pass 6A).
 *
 * Two safety properties are proven here:
 *
 *  1. the dependency registry matches the live database (no component reference
 *     is silently unrepresented), and
 *  2. the preview endpoint is provably read-only: every affected table is
 *     snapshotted before and after and must be identical.
 */
describe('Consolidation preview (read-only, Pass 6A)', () => {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  const runId = Date.now();
  const runTag = `C${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

  let app: INestApplicationContext;
  let componentsService: ComponentsService;
  let categoriesService: CategoriesService;
  let manufacturersService: ManufacturersService;
  let reviewQueue: ComponentReviewQueueService;
  let analyzer: ComponentReviewAnalyzer;
  let previewService: ComponentConsolidationPreviewService;

  const createdComponentIds: string[] = [];
  const createdManufacturerIds: string[] = [];

  async function ensureManufacturer(code: string, name: string) {
    const all = await manufacturersService.getAllManufacturers();
    const existing = all.find(
      (manufacturer) => manufacturer.code.toLowerCase() === code.toLowerCase(),
    );
    if (existing) return existing;
    const created = await manufacturersService.create({ code, name });
    createdManufacturerIds.push(created.id);
    return created;
  }

  async function ensureCategory(code: string, name: string) {
    const all = await categoriesService.getAllCategories();
    const existing = all.find(
      (category) => category.code.toLowerCase() === code.toLowerCase(),
    );
    if (existing) return existing;
    return categoriesService.create({ code, name });
  }

  async function createComponent(
    input: Parameters<ComponentsService['create']>[0],
  ) {
    const component = await componentsService.create(input);
    createdComponentIds.push(component.id);
    return component;
  }

  /** Makes each seeded location code unique within the spec run. */
  let locationOrdinal = 0;

  /**
   * Creates a throwaway storage location and an inventory balance for a
   * component. The spec owns this row entirely and removes it afterwards, so the
   * shared development database is left exactly as it was found.
   */
  async function seedInventory(
    componentId: string,
    quantity: number,
  ): Promise<{ locationId: string }> {
    locationOrdinal += 1;
    const code = `E2E-LOC-${runId}${runTag}-${locationOrdinal}`;
    const locationResult = await db.execute<{ id: string }>(
      sql`insert into locations (code, name, kind) values (${code}, ${`E2E Consolidation Location ${runTag} ${locationOrdinal}`}, 'BIN') returning id`,
    );
    const locationId = locationResult.rows[0]!.id;

    await db.execute(
      sql`insert into inventory_projections (component_id, location_id, quantity, unit_of_measure) values (${componentId}, ${locationId}, ${quantity}, 'pcs')`,
    );

    return { locationId };
  }

  async function cleanupInventory(
    componentId: string,
    locationId: string,
  ): Promise<void> {
    await db.execute(
      sql`delete from inventory_projections where component_id = ${componentId}`,
    );
    await db.execute(sql`delete from locations where id = ${locationId}`);
  }

  /**
   * Creates a pair of duplicate components and runs the audit so a real
   * EXACT_DUPLICATE finding exists, then returns that finding.
   */
  async function createDuplicatePair(label: string) {
    const yageo = await ensureManufacturer('yageo', 'Yageo');
    const resistors = await ensureCategory('RESISTORS', 'Resistors');
    const mpn = `${label}${runId}${runTag}KL`;

    const canonical = await createComponent({
      sku: `E2E-${label}-A-${runId}${runTag}`,
      name: `${label} Fixture Resistor A ${runTag}`,
      manufacturerPartNumber: mpn,
      manufacturerId: yageo.id,
      categoryId: resistors.id,
      unit: 'pcs',
      attributes: [
        { code: 'resistance', value: 10, unit: 'kohm' },
        { code: 'package', value: '0805', optionCode: '0805' },
      ],
    });
    const duplicate = await createComponent({
      sku: `E2E-${label}-B-${runId}${runTag}`,
      name: `${label} Fixture Resistor B ${runTag}`,
      manufacturerPartNumber: mpn,
      manufacturerId: yageo.id,
      categoryId: resistors.id,
      unit: 'pcs',
      attributes: [
        { code: 'resistance', value: 10, unit: 'kohm' },
        // Deliberately different: the preview must report the difference.
        { code: 'package', value: '0603', optionCode: '0603' },
      ],
    });

    await analyzer.runAudit({
      scope: 'SELECTED',
      componentIds: [canonical.id, duplicate.id],
    });

    const findings = await reviewQueue.listFindings({
      componentId: duplicate.id,
      issueType: 'EXACT_DUPLICATE',
      pageSize: 100,
    });
    const finding = findings.items.find(
      (item) => item.relatedComponentId === canonical.id,
    );
    if (!finding) {
      throw new Error(
        'Fixture did not produce the expected duplicate finding.',
      );
    }
    return { canonical, duplicate, finding };
  }

  beforeAll(async () => {
    if (!hasDbUrl) return;
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    componentsService = app.get(ComponentsService);
    categoriesService = app.get(CategoriesService);
    manufacturersService = app.get(ManufacturersService);
    reviewQueue = app.get(ComponentReviewQueueService);
    analyzer = app.get(ComponentReviewAnalyzer);
    previewService = app.get(ComponentConsolidationPreviewService);
  });

  afterAll(async () => {
    if (!hasDbUrl) return;
    for (const id of createdComponentIds) {
      await componentsService.delete(id).catch(() => undefined);
    }
    for (const id of createdManufacturerIds) {
      await manufacturersService.delete(id).catch(() => undefined);
    }
    // Sweep up every location this spec could have created. A test that fails
    // before its own cleanup would otherwise leak a row into the shared
    // development database, which is exactly what this spec must never do.
    await db
      .execute(
        sql`delete from locations where code like ${`E2E-LOC-${runId}${runTag}%`}`,
      )
      .catch(() => undefined);
    if (app) {
      await app.close();
    }
    await closeDatabaseConnection();
  });

  // -------------------------------------------------------------------------
  // 1. Dependency coverage (machine-checkable, fails closed)
  // -------------------------------------------------------------------------

  it('represents every component reference that exists in the database', async () => {
    if (!hasDbUrl) return;

    const report = await inspectDependencyCoverage();

    expect(report.unregistered).toEqual([]);
    expect(report.stale).toEqual([]);
    expect(report.ok).toBe(true);
    // The database currently exposes 34 FK columns referencing components.id.
    // The registry must match exactly, which proves no reference was dropped.
    expect(report.dbReferences.length).toBeGreaterThanOrEqual(34);
    expect(report.registeredReferences.length).toBe(report.dbReferences.length);
  });

  it('registers each dependency exactly once per physical column', async () => {
    if (!hasDbUrl) return;

    const report = await inspectDependencyCoverage();
    const keys = report.registeredReferences.map(
      (reference) => `${reference.table}.${reference.column}`,
    );

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('counts references for a real component without mutating anything', async () => {
    if (!hasDbUrl) return;

    const { canonical } = await createDuplicatePair('COUNT');
    const analysis = await inspectDependencyCoverage();
    expect(analysis.ok).toBe(true);

    // The attribute adapter must see the fixture's own attribute rows.
    const attributeAdapter = ALL_DEPENDENCY_ADAPTERS.find(
      (entry) => entry.id === 'component_attribute_values',
    );
    const counted = await attributeAdapter!.analyze(canonical.id, db);
    expect(counted.count).toBeGreaterThanOrEqual(2);
    expect(counted.sampleIds.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // 2. Preview content
  // -------------------------------------------------------------------------

  it('builds an analyzable preview for a real duplicate finding', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding } = await createDuplicatePair('PREV');
    const preview = await previewService.buildPreview(finding.id);

    // Execution is always blocked in this pass.
    expect(preview.executable).toBe(false);
    expect(preview.previewVersion).toBe(CONSOLIDATION_PREVIEW_VERSION);
    expect(preview.intelligenceVersion).toBe(
      COMPONENT_REVIEW_INTELLIGENCE_VERSION,
    );

    // Eligibility: an exact MPN duplicate with high confidence is eligible for
    // *analysis* even though execution is blocked.
    expect(preview.eligibility.eligible).toBe(true);
    expect(preview.eligibility.reasonCodes).toEqual([]);

    // Canonical / source presentation.
    const ids = [preview.canonical.id, ...preview.sources.map((s) => s.id)];
    expect(ids.sort()).toEqual([canonical.id, duplicate.id].sort());
    expect(preview.canonicalCandidates).toHaveLength(2);
    expect(preview.canonicalCandidates[0]!.reason).toContain('active');

    // Dependencies cover the registry and none is silently missing.
    expect(preview.dependencies).toHaveLength(ALL_DEPENDENCY_ADAPTERS.length);
    expect(preview.dependencyCoverage.ok).toBe(true);

    // Attribute comparison: identical resistance, differing package.
    const attributeByCode = Object.fromEntries(
      preview.attributes.entries.map((entry) => [entry.code, entry]),
    );
    expect(attributeByCode.resistance?.classification).toBe('IDENTICAL');
    expect(attributeByCode.package?.classification).toBe('CONFLICTING');
    // Every differing attribute has a resolution mechanism in Pass 6B.
    expect(attributeByCode.package?.resolutionSupported).toBe(true);
    expect(attributeByCode.package?.resolutionRequired).toBe(true);

    // Inventory analysis is present and correctly shaped.
    expect(preview.inventory.canonical.componentId).toBe(canonical.id);
    expect(preview.inventory.source.componentId).toBe(duplicate.id);
    expect(preview.inventory.executionSupport).toBe('SUPPORTED');

    // The four Pass 6A blockers are resolved in the domain and no longer
    // reported as conflicts.
    const codes = preview.conflicts.map((conflict) => conflict.code);
    expect(codes).not.toContain('ATOMICITY_UNAVAILABLE');
    expect(codes).not.toContain('UNSUPPORTED_RETIREMENT_STATE');
    expect(preview.retirement.executionSupport).toBe('SUPPORTED');

    // Attribute differences are still reported, and still block until the
    // reviewer supplies a resolution.
    expect(codes).toContain('ATTRIBUTE_VALUE_DIFFERENCE');
    const attributeConflict = preview.conflicts.find(
      (conflict) => conflict.code === 'ATTRIBUTE_VALUE_DIFFERENCE',
    );
    expect(attributeConflict!.blocksExecution).toBe(true);
    expect(attributeConflict!.resolutionSupported).toBe(true);

    // With the attribute decided, the attribute conflict stops blocking.
    const resolvedPreview = await previewService.buildPreview(
      finding.id,
      undefined,
      db,
      {
        attributeResolutions: [
          {
            attributeDefinitionId:
              attributeByCode.package!.attributeDefinitionId,
            strategy: 'KEEP_CANONICAL_VALUE',
          },
        ],
        bomResolutions: [],
      },
    );
    const resolvedAttributeConflict = resolvedPreview.conflicts.find(
      (conflict) => conflict.code === 'ATTRIBUTE_VALUE_DIFFERENCE',
    );
    expect(resolvedAttributeConflict!.blocksExecution).toBe(false);
    expect(resolvedPreview.executionBlockedReasons).toHaveLength(0);
    expect(resolvedPreview.executable).toBe(true);

    // Every conflict carries a stable code, severity and explanation.
    for (const conflict of preview.conflicts) {
      expect(['BLOCKING', 'WARNING', 'INFORMATIONAL']).toContain(
        conflict.severity,
      );
      expect(conflict.code).toMatch(/^[A-Z_]+$/);
      expect(conflict.title.length).toBeGreaterThan(0);
      expect(conflict.description.length).toBeGreaterThan(0);
      expect(typeof conflict.blocksExecution).toBe('boolean');
    }

    // Retirement is now a defined lifecycle rather than an invented flag, and
    // no semantics are missing.
    expect(preview.retirement.executionSupport).toBe('SUPPORTED');
    expect(preview.retirement.missingSemantics).toHaveLength(0);
    expect(preview.retirement.supportedMechanism).toContain('CONSOLIDATED');
  });

  it('produces a deterministic preview fingerprint', async () => {
    if (!hasDbUrl) return;

    const { finding } = await createDuplicatePair('FINGER');
    const first = await previewService.buildPreview(finding.id);
    const second = await previewService.buildPreview(finding.id);

    expect(second.previewFingerprint).toBe(first.previewFingerprint);
    // The human-readable timestamp must not participate in the fingerprint.
    expect(second.computedAt).toBeDefined();
    expect(first.previewFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes the fingerprint when relevant component state changes', async () => {
    if (!hasDbUrl) return;

    const { duplicate, finding } = await createDuplicatePair('DRIFT');
    const before = await previewService.buildPreview(finding.id);

    // Change an attribute value on the source record.
    await componentsService.update(duplicate.id, {
      attributes: [
        { code: 'resistance', value: 22, unit: 'kohm' },
        { code: 'package', value: '0603', optionCode: '0603' },
      ],
    });

    const after = await previewService.buildPreview(finding.id);
    expect(after.previewFingerprint).not.toBe(before.previewFingerprint);
  });

  it('analyses BOM collisions as a hard blocker when both records share a BOM', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding } = await createDuplicatePair('BOM');

    // A BOM of its own for the canonical component, with a line for each record.
    const [bom] = await db
      .insert((await import('@ananya/database/schema')).billOfMaterials)
      .values({
        componentId: canonical.id,
        revision: `v${runTag}`,
        status: 'DRAFT',
      })
      .returning();

    await db.insert(billOfMaterialLines).values([
      { bomId: bom!.id, componentId: canonical.id, quantityPerUnit: '1.0000' },
      { bomId: bom!.id, componentId: duplicate.id, quantityPerUnit: '2.0000' },
    ]);

    try {
      const preview = await previewService.buildPreview(finding.id);
      const collision = preview.conflicts.find(
        (conflict) => conflict.code === 'BOM_COLLISION',
      );

      expect(collision).toBeDefined();
      expect(collision!.severity).toBe('BLOCKING');
      // Unresolved: no COMBINE decision was supplied.
      expect(collision!.blocksExecution).toBe(true);
      expect(collision!.resolutionSupported).toBe(true);
      expect(collision!.affectedCount).toBe(2);
      expect(preview.bom.collisions).toHaveLength(1);
      expect(preview.bom.collisions[0]!.bomId).toBe(bom!.id);
      expect(preview.bom.collisions[0]!.combinedQuantityPerUnit).toBe('3');
      expect(preview.bom.executionSupport).toBe('SUPPORTED');

      // Supplying the COMBINE decision stops it blocking.
      const resolved = await previewService.buildPreview(
        finding.id,
        undefined,
        db,
        { attributeResolutions: [], bomResolutions: [{ bomId: bom!.id }] },
      );
      const resolvedCollision = resolved.conflicts.find(
        (conflict) => conflict.code === 'BOM_COLLISION',
      );
      expect(resolvedCollision!.blocksExecution).toBe(false);
    } finally {
      await db
        .delete(billOfMaterialLines)
        .where(sql`${billOfMaterialLines.bomId} = ${bom!.id}`);
      await db.execute(
        sql`delete from bill_of_materials where id = ${bom!.id}`,
      );
    }
  });

  it('reports the requested canonical direction when the reviewer overrides it', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding } = await createDuplicatePair('DIR');

    const defaultPreview = await previewService.buildPreview(finding.id);
    const overridePreview = await previewService.buildPreview(
      finding.id,
      defaultPreview.canonical.id === canonical.id
        ? duplicate.id
        : canonical.id,
    );

    expect(overridePreview.canonical.id).not.toBe(defaultPreview.canonical.id);
    expect(overridePreview.previewFingerprint).not.toBe(
      defaultPreview.previewFingerprint,
    );
  });

  it('rejects a canonical component that is not part of the finding', async () => {
    if (!hasDbUrl) return;

    const { finding } = await createDuplicatePair('BAD');
    const outsider = await createComponent({
      sku: `E2E-OUTSIDER-${runId}${runTag}`,
      name: `Outsider Fixture ${runTag}`,
      unit: 'pcs',
    });

    await expect(
      previewService.buildPreview(finding.id, outsider.id),
    ).rejects.toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // 3. Fail-closed behaviour
  // -------------------------------------------------------------------------

  it('refuses to analyse a non-duplicate finding and explains why', async () => {
    if (!hasDbUrl) return;

    const component = await createComponent({
      sku: `E2E-NONDUP-${runId}${runTag}`,
      name: `Non Duplicate Fixture LM358DR ${runTag}`,
      unit: 'pcs',
    });
    await analyzer.runAudit({
      scope: 'SELECTED',
      componentIds: [component.id],
    });

    const identity = await reviewQueue.listFindings({
      componentId: component.id,
      issueType: 'MPN_MISSING',
    });
    expect(identity.total).toBe(1);

    const preview = await previewService.buildPreview(identity.items[0]!.id);

    expect(preview.executable).toBe(false);
    expect(preview.eligibility.eligible).toBe(false);
    expect(preview.eligibility.reasonCodes).toContain(
      'NOT_A_DUPLICATE_FINDING',
    );
    expect(preview.dependencies).toEqual([]);
    expect(preview.executionBlockedReasons.length).toBeGreaterThan(0);
  });

  it('refuses to analyse a stale finding', async () => {
    if (!hasDbUrl) return;

    const { duplicate, finding } = await createDuplicatePair('STALE');
    await reviewQueue.markFindingsStale({
      ids: [finding.id],
      reason: 'Fixture staleness for the preview test',
    });

    const preview = await previewService.buildPreview(finding.id);
    expect(preview.eligibility.eligible).toBe(false);
    // STALE stays ineligible: the analysis no longer describes the records.
    expect(preview.eligibility.reasonCodes).toContain(
      'FINDING_STATUS_NOT_CONSOLIDATABLE',
    );
    void duplicate;
  });

  it('blocks a manufacturer-conflict duplicate rather than guessing', async () => {
    if (!hasDbUrl) return;

    const yageo = await ensureManufacturer('yageo', 'Yageo');
    const murata = await ensureManufacturer('murata', 'Murata');
    const mpn = `MCONF${runId}${runTag}KL`;

    const first = await createComponent({
      sku: `E2E-MCONF-A-${runId}${runTag}`,
      name: `Manufacturer Conflict A ${runTag}`,
      manufacturerPartNumber: mpn,
      manufacturerId: yageo.id,
      unit: 'pcs',
    });
    const second = await createComponent({
      sku: `E2E-MCONF-B-${runId}${runTag}`,
      name: `Manufacturer Conflict B ${runTag}`,
      manufacturerPartNumber: mpn,
      manufacturerId: murata.id,
      unit: 'pcs',
    });

    await analyzer.runAudit({
      scope: 'SELECTED',
      componentIds: [first.id, second.id],
    });
    const findings = await reviewQueue.listFindings({
      componentId: second.id,
      issueType: 'POTENTIAL_DUPLICATE',
      pageSize: 100,
    });
    const finding = findings.items.find(
      (item) => item.relatedComponentId === first.id,
    );
    expect(finding).toBeDefined();

    const preview = await previewService.buildPreview(finding!.id);
    expect(preview.eligibility.eligible).toBe(false);
    expect(preview.eligibility.reasonCodes).toContain(
      'MATCH_TYPE_NOT_CONSOLIDATABLE',
    );
    expect(preview.manufacturer.relation).toBe('CONFLICT');
    expect(
      preview.conflicts.find(
        (conflict) => conflict.code === 'MANUFACTURER_CONFLICT',
      ),
    ).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 4. HTTP endpoint and permission guard
  // -------------------------------------------------------------------------

  it('exposes the preview over HTTP behind the write guard', async () => {
    if (!hasDbUrl) return;

    const { finding } = await createDuplicatePair('HTTP');
    const application = await NestFactory.create(AppModule, { logger: false });
    await application.init();
    const server = application.getHttpServer() as Parameters<typeof request>[0];
    const http = request(server);

    try {
      const response = await http
        .post(`/ml/components/review-queue/${finding.id}/consolidation-preview`)
        .send({});

      // Unauthenticated callers are rejected by ComponentWriteGuard, exactly
      // like the other write-route surfaces on this controller.
      expect([401, 403]).toContain(response.status);
      // The guard refuses before the handler runs, so no preview is returned.
      expect(
        (response.body as { executable?: unknown }).executable,
      ).toBeUndefined();
    } finally {
      await application.close();
    }
  });

  it('guards against unauthenticated access to the preview route only', async () => {
    if (!hasDbUrl) return;

    // The read routes stay open, matching the rest of the API. This asserts the
    // guard is scoped to the preview route rather than applied globally.
    const application = await NestFactory.create(AppModule, { logger: false });
    await application.init();
    const server = application.getHttpServer() as Parameters<typeof request>[0];
    const http = request(server);

    try {
      const list = await http.get('/ml/components/review-queue?pageSize=1');
      expect(list.status).toBe(200);
    } finally {
      await application.close();
    }
  });

  // -------------------------------------------------------------------------
  // 5. The critical no-mutation proof
  // -------------------------------------------------------------------------

  it('never mutates any affected table while building a preview', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding } =
      await createDuplicatePair('IMMUT');

    // Give the preview real inventory, ledger and finding history to look at.
    const { locationId } = await seedInventory(duplicate.id, 25);
    const pairIds = [canonical.id, duplicate.id];

    /**
     * Snapshots the state the preview could plausibly touch.
     *
     * Scoped to the fixture pair (or to a row count for tables that carry no
     * component column) because jest runs spec files in parallel against the same
     * development database: an unscoped table dump would fail whenever an
     * unrelated spec wrote a row, which would prove nothing about this feature.
     */
    const snapshot = async () => {
      const scoped = async (table: string, includeRelated = false) => {
        const condition = includeRelated
          ? sql`component_id in (${canonical.id}, ${duplicate.id}) or related_component_id in (${canonical.id}, ${duplicate.id})`
          : sql`component_id in (${canonical.id}, ${duplicate.id})`;
        const result = await db.execute(
          sql`select * from ${sql.identifier(table)} where ${condition} order by id`,
        );
        return result.rows;
      };
      /**
       * Counts rows attributable to this fixture pair.
       *
       * A bare table count would race with any other spec writing to these
       * tables, which proves nothing about the preview. Scoping by the pair's
       * ids (or by this run's location prefix) makes the assertion mean "this
       * operation created nothing", which is the property under test.
       */
      const attributableCounts = async () => {
        const rows = await db.execute<{
          audit: number;
          activity: number;
          documents: number;
          notifications: number;
          favorites: number;
          locations: number;
        }>(sql`
          select
            (select count(*)::int from security_audit_logs
              where details::text like ${`%${canonical.id}%`}
                 or details::text like ${`%${duplicate.id}%`}) as audit,
            (select count(*)::int from activity_events
              where entity_id in (${canonical.id}, ${duplicate.id})) as activity,
            (select count(*)::int from documents
              where entity_id in (${canonical.id}, ${duplicate.id})) as documents,
            (select count(*)::int from notifications
              where entity_id in (${canonical.id}, ${duplicate.id})) as notifications,
            (select count(*)::int from user_favorites
              where entity_id in (${canonical.id}, ${duplicate.id})) as favorites,
            (select count(*)::int from locations
              where code like ${`E2E-LOC-${runId}${runTag}%`}) as locations
        `);
        return rows.rows[0]!;
      };

      return {
        // Every component-referencing table the preview reads.
        components: await db
          .select()
          .from(components)
          .where(sql`${components.id} in (${canonical.id}, ${duplicate.id})`)
          .orderBy(sql`id`),
        inventory_transactions: await scoped('inventory_transactions'),
        inventory_projections: await scoped('inventory_projections'),
        inventory_reservation_lines: await scoped(
          'inventory_reservation_lines',
        ),
        component_attribute_values: await scoped('component_attribute_values'),
        bill_of_material_lines: await scoped('bill_of_material_lines'),
        bill_of_materials: await scoped('bill_of_materials'),
        purchase_order_lines: await scoped('purchase_order_lines'),
        batches: await scoped('batches'),
        serials: await scoped('serials'),
        supplier_components: await scoped('supplier_components'),
        component_intelligence_findings: await scoped(
          'component_intelligence_findings',
          true,
        ),
        ai_suggestion_feedback: await scoped('ai_suggestion_feedback'),
        // Global append-only tables: the preview must not add a row that
        // mentions this pair. Scoped rather than counted globally, because
        // other specs write to these tables concurrently.
        attributable: await attributableCounts(),
      };
    };

    const before = await snapshot();

    // Build the preview twice (default and overridden direction) to prove the
    // whole code path is read-only, not just the happy path.
    const preview = await previewService.buildPreview(finding.id);
    await previewService.buildPreview(finding.id, preview.sources[0]!.id);

    const after = await snapshot();

    expect(after).toEqual(before);

    // Belt and braces: the inventory row the preview described still exists with
    // the same quantity, and nothing was posted to the ledger.
    const projection = await db.execute<{ quantity: string }>(
      sql`select quantity from inventory_projections where component_id = ${duplicate.id}`,
    );
    expect(Number(projection.rows[0]?.quantity ?? 0)).toBe(25);

    const canonicalRows = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from inventory_projections where component_id = ${canonical.id}`,
    );
    expect(Number(canonicalRows.rows[0]?.total ?? 0)).toBe(0);

    const ledger = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from inventory_transactions where component_id in (${duplicate.id}, ${canonical.id})`,
    );
    expect(Number(ledger.rows[0]?.total ?? 0)).toBe(0);

    // Both records are still active: the preview never retires anything.
    expect(preview.retirement.sourceIsActive).toBe(true);

    // Clean up the balance and location this test created.
    await cleanupInventory(duplicate.id, locationId);
    void pairIds;
  });

  it('describes a proposed inventory reconciliation without applying it', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding } = await createDuplicatePair('INV');

    const { locationId } = await seedInventory(duplicate.id, 25);

    try {
      // The deterministic suggestion prefers the record that holds inventory, so
      // it is asserted first...
      const suggested = await previewService.buildPreview(finding.id);
      expect(suggested.canonicalCandidates[0]!.componentId).toBe(duplicate.id);
      expect(suggested.canonicalCandidates[0]!.hasInventory).toBe(true);
      expect(suggested.canonicalCandidates[0]!.reason).toContain('inventory');
      // ...and nothing needs to move when the stocked record already survives.
      expect(suggested.inventory.proposedReconciliation).toEqual([]);

      // Now exercise the case that actually needs reconciliation: the reviewer
      // keeps the empty record, so the stocked record is the one being retired.
      const preview = await previewService.buildPreview(
        finding.id,
        canonical.id,
      );

      expect(preview.canonical.id).toBe(canonical.id);
      expect(preview.sources.map((source) => source.id)).toEqual([
        duplicate.id,
      ]);
      expect(preview.inventory.source.totalQuantity).toBe(25);
      expect(preview.inventory.canonical.totalQuantity).toBe(0);
      expect(preview.inventory.byLocation).toHaveLength(1);
      expect(preview.inventory.byLocation[0]).toMatchObject({
        canonicalQuantity: 0,
        sourceQuantity: 25,
        combinedQuantity: 25,
      });

      // The reconciliation is described, explicitly not executed.
      expect(preview.inventory.proposedReconciliation).toHaveLength(2);
      expect(
        preview.inventory.proposedReconciliation.map((entry) => entry.action),
      ).toEqual(['ISSUE_SOURCE', 'RECEIPT_CANONICAL']);
      expect(
        preview.inventory.proposedReconciliation.every(
          (entry) => entry.quantity === 25,
        ),
      ).toBe(true);
      // The ledger move is now a supported operation, and the preview describes
      // it without executing it.
      expect(preview.inventory.executionSupport).toBe('SUPPORTED');
      expect(
        preview.conflicts.find(
          (conflict) => conflict.code === 'INVENTORY_PRESENT',
        ),
      ).toBeDefined();

      // Nothing was written: the ledger is still empty for both components and
      // the canonical balance is still zero.
      const ledger = await db.execute<{ total: number }>(
        sql`select count(*)::int as total from inventory_transactions where component_id in (${duplicate.id}, ${canonical.id})`,
      );
      expect(Number(ledger.rows[0]?.total ?? 0)).toBe(0);

      const canonicalBalance = await db.execute<{ total: number }>(
        sql`select count(*)::int as total from inventory_projections where component_id = ${canonical.id}`,
      );
      expect(Number(canonicalBalance.rows[0]?.total ?? 0)).toBe(0);
    } finally {
      await cleanupInventory(duplicate.id, locationId);
    }
  });

  it('keeps working when a component has no references at all', async () => {
    if (!hasDbUrl) return;

    const { finding } = await createDuplicatePair('EMPTY');
    const preview = await previewService.buildPreview(finding.id);

    expect(preview.executable).toBe(false);
    expect(preview.dependencies.length).toBeGreaterThan(0);
    // Every dependency is still reported, even at zero, so the reviewer can see
    // the full surface was analysed.
    expect(
      preview.dependencies.every((dependency) => dependency.count >= 0),
    ).toBe(true);
    expect(preview.inventory.combinedTotalQuantity).toBe(0);
  });

  it('does not hard-delete or deactivate anything as part of the preview', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding } =
      await createDuplicatePair('STATE');
    await previewService.buildPreview(finding.id);

    const rows = await db
      .select({
        id: components.id,
        isActive: components.isActive,
        sku: components.sku,
      })
      .from(components)
      .where(sql`${components.id} in (${canonical.id}, ${duplicate.id})`);

    expect(rows).toHaveLength(2);
    // Retirement is never performed: both records stay active.
    expect(rows.every((row) => row.isActive)).toBe(true);
  });
});

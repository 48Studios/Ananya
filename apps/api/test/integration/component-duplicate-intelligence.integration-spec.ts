import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { closeDatabaseConnection, db } from '@ananya/database';
import { components } from '@ananya/database/schema';
import { asc, eq, inArray, sql } from '@ananya/database/query';
import { AppModule } from '../../src/app.module';
import { ComponentsService } from '../../src/components/components.service';
import { CategoriesService } from '../../src/categories/categories.service';
import { ManufacturersService } from '../../src/manufacturers/manufacturers.service';
import {
  ComponentReviewAnalyzer,
  COMPONENT_REVIEW_INTELLIGENCE_VERSION,
} from '../../src/ml/component-review-analyzer';
import { ComponentReviewQueueService } from '../../src/ml/component-review-queue.service';
import {
  normalizeComponentName,
  normalizeMpn,
  normalizedMpnSql,
  normalizedNameSql,
} from '../../src/ml/component-duplicate-intelligence';
import { MAX_SEMANTIC_CANDIDATES_PER_COMPONENT } from '../../src/ml/component-semantic-similarity';

/**
 * Pass 5A coverage: deterministic duplicate intelligence against the real
 * catalog.
 *
 * These tests exercise the *retrieval* path (indexed/grouped queries against
 * Postgres) and the full analyzer pipeline, so they are the only place where the
 * SQL normalization mirrors are verified against real rows. The analyzer must
 * never mutate component data.
 */
describe('Component Duplicate Intelligence (deterministic)', () => {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  const runId = Date.now();
  /** Random tag: jest runs spec files in parallel, so `runId` alone can
   * repeat across files and make fixtures collide. */
  const runTag = `T${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  let app: INestApplicationContext;
  let componentsService: ComponentsService;
  let categoriesService: CategoriesService;
  let manufacturersService: ManufacturersService;
  let reviewQueue: ComponentReviewQueueService;
  let analyzer: ComponentReviewAnalyzer;

  const createdComponentIds: string[] = [];
  const createdManufacturerIds: string[] = [];

  /** Looks up an existing manufacturer by code, creating it when absent. */
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

  function duplicatesFor(componentId: string) {
    return reviewQueue.listFindings({
      componentId,
      issueType: 'EXACT_DUPLICATE',
      pageSize: 100,
    });
  }

  function potentialFor(componentId: string) {
    return reviewQueue.listFindings({
      componentId,
      issueType: 'POTENTIAL_DUPLICATE',
      pageSize: 100,
    });
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
  });

  afterAll(async () => {
    if (!hasDbUrl) return;
    for (const id of createdComponentIds) {
      await componentsService.delete(id).catch(() => undefined);
    }
    for (const id of createdManufacturerIds) {
      await manufacturersService.delete(id).catch(() => undefined);
    }
    if (app) {
      await app.close();
    }
    await closeDatabaseConnection();
  });

  it('keeps the SQL normalization mirrors identical to the JavaScript rules', async () => {
    if (!hasDbUrl) return;

    // Own fixtures, not whatever the catalog happens to contain.
    //
    // This test previously read the first 500 rows of `components` and asserted
    // `> 0`. That made it pass only while some other spec's components were still
    // present — it silently verified nothing once the catalog was empty, and it
    // failed outright the moment the catalog was legitimately cleaned. The
    // mirror is only meaningful against inputs that exercise its branches, so the
    // rows below carry the cases the SQL expressions have to reproduce: mixed
    // case, internal whitespace, punctuation, a numeric suffix, and a null MPN.
    const normalizationFixtures: Array<{
      sku: string;
      name: string;
      manufacturerPartNumber?: string;
    }> = [
      {
        sku: `NORMMIR-${runTag}-1`,
        name: '  Resistor  10KΩ  ',
        manufacturerPartNumber: 'rc0805fr-0710kl',
      },
      {
        sku: `NORMMIR-${runTag}-2`,
        name: 'RC0805FR 0710KL',
        manufacturerPartNumber: 'RC0805FR-0710KL',
      },
      {
        sku: `NORMMIR-${runTag}-3`,
        name: 'Capacitor 100nF (X7R)',
        manufacturerPartNumber: 'C0805C104K5RACTU',
      },
      {
        sku: `NORMMIR-${runTag}-4`,
        name: 'Legacy Spacer',
        // Deliberately absent: the SQL mirror must return NULL, not ''.
      },
    ];
    for (const fixture of normalizationFixtures) {
      await createComponent({ unit: 'pcs', ...fixture });
    }

    const fixtureSkus = normalizationFixtures.map((fixture) => fixture.sku);
    const rows = await db
      .select({
        id: components.id,
        sku: components.sku,
        name: components.name,
        manufacturerPartNumber: components.manufacturerPartNumber,
        normalizedMpn: normalizedMpnSql(components.manufacturerPartNumber),
        normalizedName: normalizedNameSql(components.name),
      })
      .from(components)
      .where(inArray(components.sku, fixtureSkus))
      .orderBy(asc(components.sku))
      .limit(500);

    // Every fixture must be present: a `where` that matched nothing would
    // otherwise pass vacuously, which is the failure mode this test just had.
    expect(rows.length).toBe(normalizationFixtures.length);
    for (const row of rows) {
      expect({ sku: row.sku, value: row.normalizedMpn }).toEqual({
        sku: row.sku,
        value: normalizeMpn(row.manufacturerPartNumber) ?? null,
      });
      expect({ sku: row.sku, value: row.normalizedName }).toEqual({
        sku: row.sku,
        value: normalizeComponentName(row.name),
      });
    }
  });

  it('flags an exact duplicate across manufacturer aliases (Yageo / Phycomp)', async () => {
    if (!hasDbUrl) return;

    const yageo = await ensureManufacturer('yageo', 'Yageo');
    const phycomp = await ensureManufacturer('phycomp', 'Phycomp');
    expect(phycomp.id).not.toBe(yageo.id);

    const mpn = `RC${runId}${runTag}FR-0727RL`;
    const canonical = await createComponent({
      sku: `E2E-ALIAS-A-${runId}${runTag}`,
      name: 'Alias Fixture Resistor A',
      manufacturerPartNumber: mpn,
      manufacturerId: yageo.id,
      unit: 'pcs',
    });
    const duplicate = await createComponent({
      sku: `E2E-ALIAS-B-${runId}${runTag}`,
      name: 'Alias Fixture Resistor B',
      // Same engineering part, different manufacturer record + formatting.
      manufacturerPartNumber: mpn.toLowerCase().replace(/-/g, ''),
      manufacturerId: phycomp.id,
      unit: 'pcs',
    });

    const result = await analyzer.runAudit({
      scope: 'SELECTED',
      componentIds: [duplicate.id],
    });
    expect(result.intelligenceVersion).toBe(
      COMPONENT_REVIEW_INTELLIGENCE_VERSION,
    );
    expect(result.issueTypes.DUPLICATE).toEqual([
      'EXACT_DUPLICATE',
      'POTENTIAL_DUPLICATE',
    ]);

    const findings = await duplicatesFor(duplicate.id);
    expect(findings.total).toBe(1);
    const finding = findings.items[0]!;
    expect(finding.relatedComponentId).toBe(canonical.id);
    expect(finding.issueCategory).toBe('DUPLICATE');
    expect(finding.status).toBe('PENDING');
    expect(finding.confidenceLevel).toBe('HIGH');
    expect(finding.confidence).toBe(1);
    expect(finding.suggestedValue).toMatchObject({
      matchType: 'EXACT_MPN',
      duplicateOfComponentId: canonical.id,
      duplicateOfSku: canonical.sku,
    });
    // Alias-resolved manufacturers must not be reported as a conflict.
    expect((finding.evidence ?? []).map((item) => item.source)).not.toContain(
      'analyzer:duplicate_conflict',
    );
    expect((finding.evidence ?? []).length).toBeGreaterThan(0);

    // Never mutate the components.
    const [reloadedCanonical, reloadedDuplicate] = await Promise.all([
      componentsService.getComponent(canonical.id),
      componentsService.getComponent(duplicate.id),
    ]);
    expect(reloadedCanonical.manufacturerPartNumber).toBe(mpn);
    expect(reloadedCanonical.manufacturerId).toBe(yageo.id);
    expect(reloadedDuplicate.manufacturerId).toBe(phycomp.id);
  });

  it('never reports different manufacturers sharing an MPN as an exact duplicate', async () => {
    if (!hasDbUrl) return;

    const yageo = await ensureManufacturer('yageo', 'Yageo');
    const murata = await ensureManufacturer('murata', 'Murata');

    const mpn = `GRM${runId}${runTag}KA01D`;
    const first = await createComponent({
      sku: `E2E-MFGCONF-A-${runId}${runTag}`,
      name: 'Manufacturer Conflict Fixture A',
      manufacturerPartNumber: mpn,
      manufacturerId: yageo.id,
      unit: 'pcs',
    });
    const second = await createComponent({
      sku: `E2E-MFGCONF-B-${runId}${runTag}`,
      name: 'Manufacturer Conflict Fixture B',
      manufacturerPartNumber: mpn,
      manufacturerId: murata.id,
      unit: 'pcs',
    });

    await analyzer.runAudit({
      scope: 'SELECTED',
      componentIds: [first.id, second.id],
    });

    expect((await duplicatesFor(second.id)).total).toBe(0);

    const potentials = await potentialFor(second.id);
    expect(potentials.total).toBe(1);
    const finding = potentials.items[0]!;
    expect(finding.suggestedValue).toMatchObject({
      matchType: 'MPN_MANUFACTURER_CONFLICT',
    });
    expect(finding.confidenceLevel).toBe('MEDIUM');
    expect((finding.evidence ?? []).map((item) => item.source)).toContain(
      'analyzer:duplicate_conflict',
    );
  });

  it('classifies a reel variant as a packaging-variant potential duplicate', async () => {
    if (!hasDbUrl) return;

    const yageo = await ensureManufacturer('yageo', 'Yageo');

    const canonical = await createComponent({
      sku: `E2E-PKG-A-${runId}${runTag}`,
      name: 'Packaging Fixture Resistor A',
      manufacturerPartNumber: `RC${runId}${runTag}KL`,
      manufacturerId: yageo.id,
      unit: 'pcs',
    });
    const variant = await createComponent({
      sku: `E2E-PKG-B-${runId}${runTag}`,
      name: 'Packaging Fixture Resistor B',
      manufacturerPartNumber: `RC${runId}${runTag}KLTR`,
      manufacturerId: yageo.id,
      unit: 'pcs',
    });

    await analyzer.runAudit({
      scope: 'SELECTED',
      componentIds: [variant.id],
    });

    const findings = await potentialFor(variant.id);
    expect(findings.total).toBe(1);
    expect(findings.items[0]!.suggestedValue).toMatchObject({
      matchType: 'PACKAGING_VARIANT',
      duplicateOfComponentId: canonical.id,
    });
    expect(findings.items[0]!.confidence).toBe(0.9);
    expect((await duplicatesFor(variant.id)).total).toBe(0);
  });

  it('does not collapse MPNs that merely share a prefix', async () => {
    if (!hasDbUrl) return;

    const yageo = await ensureManufacturer('yageo', 'Yageo');

    const first = await createComponent({
      sku: `E2E-PREFIX-A-${runId}${runTag}`,
      name: 'Prefix Fixture Resistor A',
      manufacturerPartNumber: `PFX${runId}${runTag}0727RL`,
      manufacturerId: yageo.id,
      unit: 'pcs',
    });
    const second = await createComponent({
      sku: `E2E-PREFIX-B-${runId}${runTag}`,
      name: 'Prefix Fixture Resistor B',
      manufacturerPartNumber: `PFX${runId}${runTag}0710KL`,
      manufacturerId: yageo.id,
      unit: 'pcs',
    });

    await analyzer.runAudit({
      scope: 'SELECTED',
      componentIds: [first.id, second.id],
    });

    // Assertions are scoped to the fixture pair: the dev catalog is shared, so
    // unrelated findings for other components are not this test's concern.
    const exact = await duplicatesFor(second.id);
    expect(
      exact.items.filter((finding) => finding.relatedComponentId === first.id),
    ).toHaveLength(0);
    const potential = await potentialFor(second.id);
    expect(
      potential.items.filter(
        (finding) => finding.relatedComponentId === first.id,
      ),
    ).toHaveLength(0);
  });

  it('detects a name + attribute identity duplicate and guards physical values', async () => {
    if (!hasDbUrl) return;

    const yageo = await ensureManufacturer('yageo', 'Yageo');
    const resistors = await ensureCategory('RESISTORS', 'Resistors');

    const attributes = [
      { code: 'resistance', value: 10, unit: 'kohm' },
      { code: 'package', value: '0805', optionCode: '0805' },
    ];

    const canonical = await createComponent({
      sku: `E2E-NAME-A-${runId}${runTag}`,
      name: '10KΩ SMD Resistor 0805',
      manufacturerId: yageo.id,
      categoryId: resistors.id,
      unit: 'pcs',
      attributes,
    });
    const equivalent = await createComponent({
      sku: `E2E-NAME-B-${runId}${runTag}`,
      name: '10K Ohm SMD Resistor 0805',
      manufacturerId: yageo.id,
      categoryId: resistors.id,
      unit: 'pcs',
      attributes,
    });
    // Same name, same manufacturer, same category - but a different resistance.
    const different = await createComponent({
      sku: `E2E-NAME-C-${runId}${runTag}`,
      name: '10K Ohm SMD Resistor 0805',
      manufacturerId: yageo.id,
      categoryId: resistors.id,
      unit: 'pcs',
      attributes: [
        { code: 'resistance', value: 100, unit: 'kohm' },
        { code: 'package', value: '0805', optionCode: '0805' },
      ],
    });

    await analyzer.runAudit({
      scope: 'SELECTED',
      componentIds: [equivalent.id, different.id],
    });

    const equivalentFindings = await potentialFor(equivalent.id);
    expect(equivalentFindings.total).toBe(1);
    const finding = equivalentFindings.items[0]!;
    expect(finding.relatedComponentId).toBe(canonical.id);
    expect(finding.suggestedValue).toMatchObject({
      matchType: 'NAME_ATTRIBUTE_IDENTITY',
    });
    expect(finding.confidenceLevel).toBe('MEDIUM');
    expect(finding.confidence).toBe(0.8);

    const sources = (finding.evidence ?? []).map((item) => item.source);
    expect(sources).toContain('analyzer:duplicate_name');
    expect(sources).toContain('analyzer:duplicate_manufacturer');
    expect(sources).toContain('analyzer:duplicate_category');
    expect(sources).toContain('analyzer:duplicate_attributes');

    // The 100 kΩ record must be guarded out of the same group.
    const guarded = await potentialFor(different.id);
    expect(guarded.items.map((item) => item.relatedComponentId)).not.toContain(
      canonical.id,
    );

    // No component may be reported as its own duplicate.
    for (const item of [...equivalentFindings.items, ...guarded.items]) {
      expect(item.componentId).not.toBe(item.relatedComponentId);
    }
  });

  it('finds a duplicate far outside the audit scope and the first 150 rows', async () => {
    if (!hasDbUrl) return;

    const yageo = await ensureManufacturer('yageo', 'Yageo');

    // Fillers push the duplicate pair well past any fixed row window.
    const fillerIds: string[] = [];
    for (let batch = 0; batch < 8; batch += 1) {
      const created = await Promise.all(
        Array.from({ length: 20 }, (_, index) => {
          const ordinal = batch * 20 + index;
          return createComponent({
            sku: `E2E-DUPFILL-${runId}${runTag}-${ordinal}`,
            name: `Duplicate Fixture Filler ${ordinal}`,
            manufacturerPartNumber: `DUPFILL${runId}${ordinal
              .toString()
              .padStart(4, '0')}X`,
            manufacturerId: yageo.id,
            unit: 'pcs',
          });
        }),
      );
      fillerIds.push(...created.map((component) => component.id));
    }
    expect(fillerIds.length).toBeGreaterThan(150);

    const windowMpn = `WINDOW${runId}${runTag}KL`;
    const canonical = await createComponent({
      sku: `E2E-DUPWIN-A-${runId}${runTag}`,
      name: 'Window Fixture Resistor A',
      manufacturerPartNumber: windowMpn,
      manufacturerId: yageo.id,
      unit: 'pcs',
    });
    const duplicate = await createComponent({
      sku: `E2E-DUPWIN-B-${runId}${runTag}`,
      name: 'Window Fixture Resistor B',
      manufacturerPartNumber: windowMpn,
      manufacturerId: yageo.id,
      unit: 'pcs',
    });

    // Only one side is analyzed: retrieval must still reach the other one.
    const result = await analyzer.runAudit({
      scope: 'SELECTED',
      componentIds: [duplicate.id],
    });
    expect(result.analyzedCount).toBe(1);
    expect(result.duplicateFindingsTruncated).toBe(false);

    const findings = await duplicatesFor(duplicate.id);
    expect(findings.total).toBe(1);
    expect(findings.items[0]!.relatedComponentId).toBe(canonical.id);

    // Filler components carry unique MPNs, so they must not produce duplicates.
    const fillerFindings = await reviewQueue.listFindings({
      issueType: 'EXACT_DUPLICATE',
      pageSize: 100,
    });
    expect(
      fillerFindings.items.filter((finding) =>
        fillerIds.includes(finding.componentId),
      ),
    ).toHaveLength(0);
  });

  it('is idempotent and reconciles findings when the duplicate condition disappears', async () => {
    if (!hasDbUrl) return;

    const yageo = await ensureManufacturer('yageo', 'Yageo');

    const mpn = `RECONCILE${runId}${runTag}KL`;
    const canonical = await createComponent({
      sku: `E2E-REC-A-${runId}${runTag}`,
      name: 'Reconcile Fixture Resistor A',
      manufacturerPartNumber: mpn,
      manufacturerId: yageo.id,
      unit: 'pcs',
    });
    const duplicate = await createComponent({
      sku: `E2E-REC-B-${runId}${runTag}`,
      name: 'Reconcile Fixture Resistor B',
      manufacturerPartNumber: mpn,
      manufacturerId: yageo.id,
      unit: 'pcs',
    });

    await analyzer.runAudit({
      scope: 'SELECTED',
      componentIds: [canonical.id, duplicate.id],
    });
    const first = await duplicatesFor(duplicate.id);
    expect(first.total).toBe(1);

    // Re-analysis must not duplicate the finding.
    await analyzer.runAudit({
      scope: 'SELECTED',
      componentIds: [canonical.id, duplicate.id],
    });
    const second = await duplicatesFor(duplicate.id);
    expect(second.total).toBe(1);
    expect(second.items[0]!.fingerprint).toBe(first.items[0]!.fingerprint);
    expect(second.items[0]!.status).toBe('PENDING');

    // Resolve the condition and re-analyze: the finding goes STALE, not away.
    await componentsService.update(duplicate.id, {
      manufacturerPartNumber: `UNIQUE${runId}`,
    });
    const result = await analyzer.runAudit({
      scope: 'SELECTED',
      componentIds: [canonical.id, duplicate.id],
    });
    expect(result.staledCount).toBeGreaterThanOrEqual(1);

    const stale = await duplicatesFor(duplicate.id);
    expect(stale.total).toBe(1);
    expect(stale.items[0]!.status).toBe('STALE');
    expect(String(stale.items[0]!.metadata.staleReason)).toContain(
      'No longer detected',
    );
  });

  it('never mutates component records during duplicate analysis', async () => {
    if (!hasDbUrl) return;

    const yageo = await ensureManufacturer('yageo', 'Yageo');
    const mpn = `IMMUTABLE${runId}${runTag}KL`;

    const canonical = await createComponent({
      sku: `E2E-IMM-A-${runId}${runTag}`,
      name: 'Immutability Fixture A',
      manufacturerPartNumber: mpn,
      manufacturerId: yageo.id,
      unit: 'pcs',
    });
    const duplicate = await createComponent({
      sku: `E2E-IMM-B-${runId}${runTag}`,
      name: 'Immutability Fixture B',
      manufacturerPartNumber: mpn,
      manufacturerId: yageo.id,
      unit: 'pcs',
    });

    const before = await db
      .select()
      .from(components)
      .where(inArray(components.id, [canonical.id, duplicate.id]))
      .orderBy(asc(components.sku));

    await analyzer.runAudit({
      scope: 'SELECTED',
      componentIds: [canonical.id, duplicate.id],
    });

    const after = await db
      .select()
      .from(components)
      .where(inArray(components.id, [canonical.id, duplicate.id]))
      .orderBy(asc(components.sku));

    expect(after).toEqual(before);
  });

  it('keeps duplicate candidate retrieval bounded on a large catalog', async () => {
    if (!hasDbUrl) return;

    // The bounded retrieval is a grouped query, so the number of catalog rows
    // scanned for candidates must stay far below the catalog size.
    const totals = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(components);
    const total = totals[0]?.total ?? 0;
    expect(total).toBeGreaterThan(150);

    const normalizedMpn = normalizedMpnSql(components.manufacturerPartNumber);
    const candidateRows = await db
      .select({ key: normalizedMpn.as('key') })
      .from(components)
      .where(sql`${components.manufacturerPartNumber} is not null`)
      .groupBy(normalizedMpn)
      .having(sql`count(*) > 1`);

    // Only genuinely duplicated part numbers are returned, never the catalog.
    expect(candidateRows.length).toBeLessThan(total);
    for (const row of candidateRows) {
      expect(row.key.length).toBeGreaterThan(0);
    }
  });

  it('leaves unrelated components without duplicate findings', async () => {
    if (!hasDbUrl) return;

    const unique = await createComponent({
      sku: `E2E-LONE-${runId}${runTag}`,
      name: 'Lone Fixture Component',
      manufacturerPartNumber: `LONE${runId}${runTag}XYZ`,
      unit: 'pcs',
    });

    const result = await analyzer.runAudit({
      scope: 'SELECTED',
      componentIds: [unique.id],
    });
    expect(result.duplicateFindingsCount).toBe(0);
    expect(result.duplicateFindingsTruncated).toBe(false);

    const all = await reviewQueue.listFindings({
      componentId: unique.id,
      issueCategory: 'DUPLICATE',
      pageSize: 100,
    });
    expect(all.total).toBe(0);
  });

  it('records the componentUpdatedAt snapshot for staleness detection', async () => {
    if (!hasDbUrl) return;

    const yageo = await ensureManufacturer('yageo', 'Yageo');
    const mpn = `SNAPSHOT${runId}${runTag}KL`;

    const canonical = await createComponent({
      sku: `E2E-SNAP-A-${runId}${runTag}`,
      name: 'Snapshot Fixture A',
      manufacturerPartNumber: mpn,
      manufacturerId: yageo.id,
      unit: 'pcs',
    });
    const duplicate = await createComponent({
      sku: `E2E-SNAP-B-${runId}${runTag}`,
      name: 'Snapshot Fixture B',
      manufacturerPartNumber: mpn,
      manufacturerId: yageo.id,
      unit: 'pcs',
    });

    await analyzer.runAudit({
      scope: 'SELECTED',
      componentIds: [duplicate.id],
    });

    const findings = await duplicatesFor(duplicate.id);
    expect(findings.total).toBe(1);
    const [row] = await db
      .select({ updatedAt: components.updatedAt })
      .from(components)
      .where(eq(components.id, duplicate.id));
    expect(findings.items[0]!.metadata.componentUpdatedAt).toBe(
      row!.updatedAt.toISOString(),
    );
    expect(findings.items[0]!.component).toMatchObject({
      sku: duplicate.sku,
      manufacturerPartNumber: mpn,
    });
    expect(findings.items[0]!.relatedComponent).toMatchObject({
      sku: canonical.sku,
    });
  });

  it('generates a bounded semantic candidate set for the real catalog', async () => {
    if (!hasDbUrl) return;

    const yageo = await ensureManufacturer('yageo', 'Yageo');
    const resistors = await ensureCategory('RESISTORS', 'Resistors');

    const attributes = [
      { code: 'resistance', value: 10, unit: 'kohm' },
      { code: 'package', value: '0805', optionCode: '0805' },
    ];

    // Same part described two ways, with no shared MPN: only the semantic tier
    // can connect them.
    const canonical = await createComponent({
      sku: `E2E-SEM-A-${runId}${runTag}`,
      name: `10KΩ SMD Thick Film Resistor 0805 ${runTag}`,
      manufacturerId: yageo.id,
      categoryId: resistors.id,
      unit: 'pcs',
      attributes,
    });
    const similar = await createComponent({
      sku: `E2E-SEM-B-${runId}${runTag}`,
      name: `10K Ohm 0805 SMD Thick Film Resistor ${runTag}`,
      manufacturerId: yageo.id,
      categoryId: resistors.id,
      unit: 'pcs',
      attributes,
    });
    // Different resistance: must never be connected.
    const differentValue = await createComponent({
      sku: `E2E-SEM-C-${runId}${runTag}`,
      name: `100K Ohm 0805 SMD Thick Film Resistor ${runTag}`,
      manufacturerId: yageo.id,
      categoryId: resistors.id,
      unit: 'pcs',
      attributes: [
        { code: 'resistance', value: 100, unit: 'kohm' },
        { code: 'package', value: '0805', optionCode: '0805' },
      ],
    });

    const result = await analyzer.runAudit({
      scope: 'SELECTED',
      componentIds: [similar.id, differentValue.id],
    });

    // Instrumentation is exposed without leaking internals into the UI contract.
    expect(result.semanticCandidatesConsidered).toBeGreaterThan(0);
    expect(result.semanticCandidatesConsidered).toBeLessThanOrEqual(
      MAX_SEMANTIC_CANDIDATES_PER_COMPONENT * 2,
    );
    expect(result.semanticCandidatesAccepted).toBeGreaterThanOrEqual(1);
    expect(typeof result.semanticBlocking.tokensUsed).toBe('number');
    expect(result.semanticBlocking.rowsRetrieved).toBeGreaterThan(0);
    expect(result.semanticBlocking.pairs).toBe(
      result.semanticCandidatesConsidered,
    );

    const findings = await potentialFor(similar.id);
    const semantic = findings.items.filter(
      (finding) =>
        finding.suggestedValue?.matchType === 'SEMANTIC_NAME_SIMILARITY' &&
        finding.relatedComponentId === canonical.id,
    );
    expect(semantic).toHaveLength(1);

    const finding = semantic[0]!;
    expect(finding.issueType).toBe('POTENTIAL_DUPLICATE');
    expect(finding.relatedComponentId).toBe(canonical.id);
    expect(
      finding.confidenceLevel === 'HIGH' ||
        finding.confidenceLevel === 'MEDIUM',
    ).toBe(true);
    expect(finding.suggestedValue).toMatchObject({
      primaryMatchType: 'SEMANTIC_NAME_SIMILARITY',
    });
    expect(typeof finding.suggestedValue?.similarityScore).toBe('number');

    const sources = (finding.evidence ?? []).map((item) => item.source);
    expect(sources).toContain('analyzer:duplicate_similarity');
    expect(sources).toContain('analyzer:duplicate_manufacturer');
    expect(sources).toContain('analyzer:duplicate_category');

    // The differing-resistance record must not be connected to the pair.
    const guarded = await potentialFor(differentValue.id);
    const guardedSemantic = guarded.items.filter(
      (item) => item.suggestedValue?.matchType === 'SEMANTIC_NAME_SIMILARITY',
    );
    expect(
      guardedSemantic.map((item) => item.relatedComponentId),
    ).not.toContain(canonical.id);
    expect(
      guardedSemantic.map((item) => item.relatedComponentId),
    ).not.toContain(similar.id);
  });
  it('never creates EXACT_DUPLICATE from the semantic tier', async () => {
    if (!hasDbUrl) return;

    const yageo = await ensureManufacturer('yageo', 'Yageo');
    const mpnA = `SEMEXACT${runId}${runTag}A`;

    const canonical = await createComponent({
      sku: `E2E-SEMX-A-${runId}${runTag}`,
      name: `Semantic Fixture Amplifier ${runTag}`,
      manufacturerPartNumber: mpnA,
      manufacturerId: yageo.id,
      unit: 'pcs',
    });
    const similar = await createComponent({
      sku: `E2E-SEMX-B-${runId}${runTag}`,
      name: `Semantic Fixture Amplifier ${runTag} SMD`,
      manufacturerId: yageo.id,
      unit: 'pcs',
    });

    await analyzer.runAudit({
      scope: 'SELECTED',
      componentIds: [similar.id],
    });

    const exact = await duplicatesFor(similar.id);
    expect(
      exact.items.filter(
        (finding) =>
          finding.suggestedValue?.matchType === 'SEMANTIC_NAME_SIMILARITY',
      ),
    ).toHaveLength(0);

    for (const finding of exact.items) {
      expect(finding.issueType).toBe('EXACT_DUPLICATE');
    }
    // The MPN-bearing record must remain untouched.
    const reloaded = await componentsService.getComponent(canonical.id);
    expect(reloaded.manufacturerPartNumber).toBe(mpnA);
  });

  it('keeps semantic candidate retrieval bounded on a large catalog', async () => {
    if (!hasDbUrl) return;

    const yageo = await ensureManufacturer('yageo', 'Yageo');

    // 60 filler components sharing a common technical value token with the seed.
    const fillerIds: string[] = [];
    for (let batch = 0; batch < 3; batch += 1) {
      const created = await Promise.all(
        Array.from({ length: 20 }, (_, index) => {
          const ordinal = batch * 20 + index;
          return createComponent({
            sku: `E2E-SEMFILL-${runId}${runTag}-${ordinal}`,
            name: `Semantic Filler ${ordinal} 33KΩ Resistor ${runTag}`,
            manufacturerId: yageo.id,
            unit: 'pcs',
          });
        }),
      );
      fillerIds.push(...created.map((component) => component.id));
    }

    const seed = await createComponent({
      sku: `E2E-SEMSEED-${runId}${runTag}`,
      name: `Semantic Seed 33KΩ Resistor ${runTag}`,
      manufacturerId: yageo.id,
      unit: 'pcs',
    });

    const result = await analyzer.runAudit({
      scope: 'SELECTED',
      componentIds: [seed.id],
    });

    // One analyzed component can never consider more than the per-component cap,
    // even when dozens of catalog rows share its blocking token.
    expect(result.semanticCandidatesConsidered).toBeLessThanOrEqual(
      MAX_SEMANTIC_CANDIDATES_PER_COMPONENT,
    );
    expect(result.semanticBlocking.rowsRetrieved).toBeGreaterThan(0);
    expect(result.semanticBlocking.rowsTruncated).toBe(false);
    expect(result.durationMs).toBeLessThan(30_000);
  });

  it('is idempotent for semantic findings and stales them when resolved', async () => {
    if (!hasDbUrl) return;

    const yageo = await ensureManufacturer('yageo', 'Yageo');
    const resistors = await ensureCategory('RESISTORS', 'Resistors');
    const attributes = [
      { code: 'resistance', value: 47, unit: 'kohm' },
      { code: 'package', value: '0603', optionCode: '0603' },
    ];

    const canonical = await createComponent({
      sku: `E2E-SEMID-A-${runId}${runTag}`,
      name: `47KΩ SMD Resistor 0603 ${runTag}`,
      manufacturerId: yageo.id,
      categoryId: resistors.id,
      unit: 'pcs',
      attributes,
    });
    const similar = await createComponent({
      sku: `E2E-SEMID-B-${runId}${runTag}`,
      name: `47K Ohm 0603 SMD Resistor ${runTag}`,
      manufacturerId: yageo.id,
      categoryId: resistors.id,
      unit: 'pcs',
      attributes,
    });

    const semanticFor = async (componentId: string) =>
      (
        await reviewQueue.listFindings({
          componentId,
          issueCategory: 'DUPLICATE',
          pageSize: 100,
        })
      ).items.filter(
        (finding) =>
          finding.suggestedValue?.matchType === 'SEMANTIC_NAME_SIMILARITY',
      );

    await analyzer.runAudit({
      scope: 'SELECTED',
      componentIds: [similar.id],
    });
    const first = await semanticFor(similar.id);
    expect(first).toHaveLength(1);
    expect(first[0]!.relatedComponentId).toBe(canonical.id);

    await analyzer.runAudit({
      scope: 'SELECTED',
      componentIds: [similar.id],
    });
    const second = await semanticFor(similar.id);
    expect(second).toHaveLength(1);
    expect(second[0]!.fingerprint).toBe(first[0]!.fingerprint);
    expect(second[0]!.status).toBe('PENDING');

    // Renaming the record removes the similarity condition entirely.
    await componentsService.update(similar.id, {
      name: `Unrelated Renamed Part ${runTag}`,
    });
    await analyzer.runAudit({
      scope: 'SELECTED',
      componentIds: [similar.id],
    });

    const third = await semanticFor(similar.id);
    expect(third).toHaveLength(1);
    expect(third[0]!.status).toBe('STALE');
  });

  it('exposes the structured attribute comparison on duplicate findings', async () => {
    if (!hasDbUrl) return;

    const yageo = await ensureManufacturer('yageo', 'Yageo');
    const resistors = await ensureCategory('RESISTORS', 'Resistors');

    await createComponent({
      sku: `E2E-CMP-A-${runId}${runTag}`,
      name: `Comparison Fixture Resistor A ${runTag}`,
      manufacturerPartNumber: `CMP${runId}${runTag}KL`,
      manufacturerId: yageo.id,
      categoryId: resistors.id,
      unit: 'pcs',
      attributes: [
        { code: 'resistance', value: 10, unit: 'kohm' },
        { code: 'package', value: '0805', optionCode: '0805' },
      ],
    });
    const duplicate = await createComponent({
      sku: `E2E-CMP-B-${runId}${runTag}`,
      name: `Comparison Fixture Resistor B ${runTag}`,
      manufacturerPartNumber: `CMP${runId}${runTag}KL`,
      manufacturerId: yageo.id,
      categoryId: resistors.id,
      unit: 'pcs',
      // Same resistance, different package: the comparison must report both a
      // match and a difference so the review detail can show them.
      attributes: [
        { code: 'resistance', value: 10, unit: 'kohm' },
        { code: 'package', value: '0603', optionCode: '0603' },
      ],
    });

    await analyzer.runAudit({
      scope: 'SELECTED',
      componentIds: [duplicate.id],
    });

    const findings = await duplicatesFor(duplicate.id);
    expect(findings.total).toBe(1);
    const finding = findings.items[0]!;

    // Typed field on the DTO, so the frontend needs no metadata parsing.
    expect(Array.isArray(finding.attributeComparison)).toBe(true);
    const byCode = Object.fromEntries(
      finding.attributeComparison.map((entry) => [entry.code, entry]),
    );
    expect(byCode.resistance).toMatchObject({
      label: 'Resistance',
      result: 'MATCH',
    });
    expect(byCode.package).toMatchObject({ result: 'DIFFERENT' });

    // The persisted metadata carries the same comparison.
    expect(finding.metadata.attributeComparison).toEqual(
      finding.attributeComparison,
    );

    // Reading the finding directly (not through the list) exposes it too.
    const single = await reviewQueue.getFinding(finding.id);
    expect(single.attributeComparison).toEqual(finding.attributeComparison);
  });

  it('returns an empty comparison for findings that are not duplicates', async () => {
    if (!hasDbUrl) return;

    // The name carries a literal part-number token, so an MPN_MISSING finding is
    // deterministic regardless of where the audit batch lands.
    const component = await createComponent({
      sku: `E2E-NONCMP-${runId}${runTag}`,
      name: `Non Duplicate Fixture LM358DR ${runTag}`,
      unit: 'pcs',
    });

    await analyzer.runAudit({
      scope: 'SELECTED',
      componentIds: [component.id],
    });

    const identityFindings = await reviewQueue.listFindings({
      componentId: component.id,
      issueType: 'MPN_MISSING',
    });
    expect(identityFindings.total).toBe(1);
    expect(identityFindings.items[0]!.attributeComparison).toEqual([]);

    // Every finding for this component is comparison-free: the field is a
    // duplicate-only payload.
    const allFindings = await reviewQueue.listFindings({
      componentId: component.id,
      pageSize: 100,
    });
    expect(allFindings.items.length).toBeGreaterThan(0);
    for (const finding of allFindings.items) {
      expect(finding.attributeComparison).toEqual([]);
    }
  });

  it('never mutates component data while running the semantic layer', async () => {
    if (!hasDbUrl) return;

    const yageo = await ensureManufacturer('yageo', 'Yageo');
    const resistors = await ensureCategory('RESISTORS', 'Resistors');
    const attributes = [
      { code: 'resistance', value: 22, unit: 'ohm' },
      { code: 'package', value: '1206', optionCode: '1206' },
    ];

    const first = await createComponent({
      sku: `E2E-SEMIMM-A-${runId}${runTag}`,
      name: `22Ω SMD Resistor 1206 ${runTag}`,
      manufacturerId: yageo.id,
      categoryId: resistors.id,
      unit: 'pcs',
      attributes,
    });
    const second = await createComponent({
      sku: `E2E-SEMIMM-B-${runId}${runTag}`,
      name: `22 Ohm 1206 SMD Resistor ${runTag}`,
      manufacturerId: yageo.id,
      categoryId: resistors.id,
      unit: 'pcs',
      attributes,
    });

    const before = await db
      .select()
      .from(components)
      .where(inArray(components.id, [first.id, second.id]))
      .orderBy(asc(components.sku));

    const result = await analyzer.runAudit({
      scope: 'SELECTED',
      componentIds: [first.id, second.id],
    });
    expect(result.semanticFindingsCount).toBeGreaterThanOrEqual(1);

    const after = await db
      .select()
      .from(components)
      .where(inArray(components.id, [first.id, second.id]))
      .orderBy(asc(components.sku));

    expect(after).toEqual(before);
  });
});

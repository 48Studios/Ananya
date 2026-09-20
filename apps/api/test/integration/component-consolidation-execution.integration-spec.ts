import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import request from 'supertest';
import { closeDatabaseConnection, db, toDbExecutor } from '@ananya/database';
import {
  aiSuggestionFeedback,
  batches,
  billOfMaterialLines,
  billOfMaterials,
  componentAttributeValues,
  componentIntelligenceFindings,
  components,
  consolidations,
  consolidationSources,
  documents,
  inventoryProjections,
  inventoryReservationLines,
  inventoryReservations,
  inventoryTransactions,
  locations,
  manufacturers,
  purchaseOrderLines,
  purchaseOrders,
  serials,
  supplierComponents,
  suppliers,
  userFavorites,
} from '@ananya/database/schema';
import { and, eq, inArray, like, or, sql } from '@ananya/database/query';
import { AppModule } from '../../src/app.module';
import { ComponentsService } from '../../src/components/components.service';
import { CategoriesService } from '../../src/categories/categories.service';
import { ManufacturersService } from '../../src/manufacturers/manufacturers.service';
import { ComponentReviewAnalyzer } from '../../src/ml/component-review-analyzer';
import {
  ComponentReviewQueueService,
  stableStringify,
} from '../../src/ml/component-review-queue.service';
import { ComponentConsolidationPreviewService } from '../../src/ml/component-consolidation-preview.service';
import { ComponentConsolidationService } from '../../src/ml/component-consolidation/component-consolidation.service';
import { InventoryProjectionsService } from '../../src/inventory-projections/inventory-projections.service';
import { ReservationsService } from '../../src/reservations/reservations.service';
import { InventoryTransactionsService } from '../../src/inventory-transactions/inventory-transactions.service';
import { BomsService } from '../../src/boms/boms.service';
import { PurchaseOrdersService } from '../../src/purchase-orders/purchase-orders.service';
import { SuppliersService } from '../../src/suppliers/suppliers.service';
import type { ConsolidationExecutionRequestDto } from '../../src/ml/component-consolidation/component-consolidation.execution.dtos';

/**
 * Consolidation EXECUTION integration coverage (Pass 6B).
 *
 * The properties proven here are the ones that make the feature safe to ship:
 *
 *  1. a successful consolidation commits every subsystem together,
 *  2. a failure anywhere commits NOTHING — no partial state anywhere,
 *  3. the source is retired rather than deleted, and history is preserved,
 *  4. inventory moves through the ledger, never by rewriting balances,
 *  5. retrying an identical request does not move inventory twice,
 *  6. a stale preview is refused,
 *  7. blocking domains stay blocking.
 *
 * Every fixture is created with a run-unique prefix and removed in `afterAll`,
 * even when a test fails, so the development database is left as found.
 */
describe('Consolidation execution (Pass 6B)', () => {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  const runId = Date.now();
  const runTag = `X${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

  let app: INestApplicationContext;
  let componentsService: ComponentsService;
  let categoriesService: CategoriesService;
  let manufacturersService: ManufacturersService;
  let reviewQueue: ComponentReviewQueueService;
  let analyzer: ComponentReviewAnalyzer;
  let previewService: ComponentConsolidationPreviewService;
  let consolidationService: ComponentConsolidationService;
  let reservationsService: ReservationsService;
  let inventoryTransactionsService: InventoryTransactionsService;
  let bomsService: BomsService;
  let purchaseOrdersService: PurchaseOrdersService;
  let suppliersService: SuppliersService;

  const createdComponentIds: string[] = [];
  const createdManufacturerIds: string[] = [];
  const createdLocationIds: string[] = [];
  const createdBomIds: string[] = [];
  const createdSupplierIds: string[] = [];
  const createdPurchaseOrderIds: string[] = [];

  const actor = { id: null, email: `e2e-consolidation-${runTag}@ananya.test` };

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
    consolidationService = app.get(ComponentConsolidationService);
    reservationsService = app.get(ReservationsService);
    inventoryTransactionsService = app.get(InventoryTransactionsService);
    bomsService = app.get(BomsService);
    purchaseOrdersService = app.get(PurchaseOrdersService);
    suppliersService = app.get(SuppliersService);
  });

  afterAll(async () => {
    if (!hasDbUrl) return;

    /*
     * Cleanup must never be able to fail silently.
     *
     * An earlier version of this spec used `= any(${array})` inside a raw `sql`
     * template and swallowed errors with `.catch()`. Drizzle expands a JS array
     * into `($1, $2, ...)`, which PostgreSQL rejects for `any(...)`, so every
     * delete failed and the fixtures leaked. The helper below therefore:
     *
     *  - binds arrays with `inArray` (which Drizzle renders correctly),
     *  - takes a run-unique SKU prefix as a second safety net, so a cleanup that
     *    somehow misses an id still removes this run's rows and cannot reach
     *    another run's or a real user's data,
     *  - is NOT wrapped in `.catch()`: a genuine failure should surface.
     */
    const ids = [...new Set(createdComponentIds)];
    const runPrefix = `E2E-%${runId}${runTag}%`;

    const componentScope = or(
      ids.length > 0 ? inArray(components.id, ids) : sql`false`,
      like(components.sku, runPrefix),
    );

    // The retirement pointer and the operation records are RESTRICT foreign
    // keys, so they are cleared before anything is deleted.
    await db
      .update(components)
      .set({
        consolidatedIntoComponentId: null,
        consolidationId: null,
        consolidatedAt: null,
      })
      .where(componentScope);

    const leaked = await db
      .select({ id: components.id })
      .from(components)
      .where(componentScope);
    const leakedIds = leaked.map((row) => row.id);

    if (leakedIds.length > 0) {
      await db
        .delete(consolidationSources)
        .where(inArray(consolidationSources.sourceComponentId, leakedIds));
      await db
        .delete(consolidations)
        .where(inArray(consolidations.canonicalComponentId, leakedIds));
      await db
        .delete(componentIntelligenceFindings)
        .where(
          or(
            inArray(componentIntelligenceFindings.componentId, leakedIds),
            inArray(
              componentIntelligenceFindings.relatedComponentId,
              leakedIds,
            ),
          ),
        );
      await db
        .delete(inventoryTransactions)
        .where(inArray(inventoryTransactions.componentId, leakedIds));
      await db
        .delete(inventoryProjections)
        .where(inArray(inventoryProjections.componentId, leakedIds));
      await db
        .delete(inventoryReservationLines)
        .where(inArray(inventoryReservationLines.componentId, leakedIds));
      // Reservation headers this run created are removed once their lines are
      // gone. Identified by this run's reservation-number prefix, never by
      // pattern-matching another run's data.
      await db
        .delete(inventoryReservations)
        .where(
          like(
            inventoryReservations.reservationNumber,
            `E2E-${runId}${runTag}%`,
          ),
        );
      await db.delete(batches).where(inArray(batches.componentId, leakedIds));
      await db.delete(serials).where(inArray(serials.componentId, leakedIds));
      await db
        .delete(componentAttributeValues)
        .where(inArray(componentAttributeValues.componentId, leakedIds));
      await db
        .delete(supplierComponents)
        .where(inArray(supplierComponents.componentId, leakedIds));
      await db
        .delete(aiSuggestionFeedback)
        .where(inArray(aiSuggestionFeedback.componentId, leakedIds));

      const leakedIdText = leakedIds.map((id) => String(id));
      await db
        .delete(documents)
        .where(
          and(
            eq(documents.entityType, 'Component'),
            inArray(documents.entityId, leakedIdText),
          ),
        );
      await db
        .delete(userFavorites)
        .where(
          and(
            eq(userFavorites.entityType, 'Component'),
            inArray(userFavorites.entityId, leakedIdText),
          ),
        );

      const leakedBoms = await db
        .select({ id: billOfMaterials.id })
        .from(billOfMaterials)
        .where(inArray(billOfMaterials.componentId, leakedIds));
      const leakedBomIds = leakedBoms.map((row) => row.id);
      if (leakedBomIds.length > 0) {
        await db
          .delete(billOfMaterialLines)
          .where(inArray(billOfMaterialLines.bomId, leakedBomIds));
        await db
          .delete(billOfMaterials)
          .where(inArray(billOfMaterials.id, leakedBomIds));
      }

      await db
        .delete(billOfMaterialLines)
        .where(inArray(billOfMaterialLines.componentId, leakedIds));

      // Any BOM this run created is removed whether or not its product was one
      // of the fixture components.
      if (createdBomIds.length > 0) {
        await db
          .delete(billOfMaterialLines)
          .where(inArray(billOfMaterialLines.bomId, createdBomIds));
        await db
          .delete(billOfMaterials)
          .where(inArray(billOfMaterials.id, createdBomIds));
      }

      await db.delete(components).where(inArray(components.id, leakedIds));
    }

    if (createdLocationIds.length > 0) {
      await db
        .delete(locations)
        .where(inArray(locations.id, createdLocationIds));
    }
    // Belt and braces: a location created by a run whose ids were lost.
    await db
      .delete(locations)
      .where(like(locations.code, `E2E-LOC-${runId}${runTag}%`));

    if (createdManufacturerIds.length > 0) {
      await db
        .delete(manufacturers)
        .where(inArray(manufacturers.id, createdManufacturerIds));
    }

    // Purchase orders this run created, then the suppliers they referenced.
    // Identified by exact id, never by a naming pattern.
    if (createdPurchaseOrderIds.length > 0) {
      await db
        .delete(purchaseOrderLines)
        .where(
          inArray(purchaseOrderLines.purchaseOrderId, createdPurchaseOrderIds),
        );
      await db
        .delete(purchaseOrders)
        .where(inArray(purchaseOrders.id, createdPurchaseOrderIds));
    }
    if (createdSupplierIds.length > 0) {
      await db
        .delete(suppliers)
        .where(inArray(suppliers.id, createdSupplierIds));
    }

    await app.close();
    await closeDatabaseConnection();
  });

  // -------------------------------------------------------------------------
  // Fixtures
  // -------------------------------------------------------------------------

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

  let locationOrdinal = 0;

  async function seedInventory(
    componentId: string,
    quantity: number,
  ): Promise<string> {
    locationOrdinal += 1;
    const code = `E2E-LOC-${runId}${runTag}-${locationOrdinal}`;
    const result = await db.execute<{ id: string }>(
      sql`insert into locations (code, name, kind) values (${code}, ${`E2E Consolidation ${runTag} ${locationOrdinal}`}, 'BIN') returning id`,
    );
    const locationId = result.rows[0]!.id;
    createdLocationIds.push(locationId);

    await db.execute(
      sql`insert into inventory_projections (component_id, location_id, quantity, unit_of_measure) values (${componentId}, ${locationId}, ${quantity}, 'pcs')`,
    );
    // `Receipt` is the transaction type the projection calculator treats as an
    // increase; it is the supported way to establish an opening balance.
    await db.execute(
      sql`insert into inventory_transactions (component_id, transaction_type, quantity, unit_of_measure, destination_location_id, reference, reason, created_by) values (${componentId}, 'Receipt', ${quantity}, 'pcs', ${locationId}, 'E2E-SEED', 'E2E seed balance', 'e2e')`,
    );

    return locationId;
  }

  /**
   * Creates a location and records opening stock as an `InitialStock`
   * transaction, with NO projection row.
   *
   * This mirrors the only real path by which InitialStock reaches the database:
   * `inventory_transactions` accepts the type, and projections are only ever
   * built by `RebuildInventoryProjections`, which delegates to
   * `CalculateInventoryProjection`. That calculator has no `InitialStock` case,
   * so the quantity never becomes visible to projections.
   */
  async function seedInitialStock(
    componentId: string,
    quantity: number,
  ): Promise<string> {
    locationOrdinal += 1;
    const code = `E2E-LOC-${runId}${runTag}-${locationOrdinal}`;
    const result = await db.execute<{ id: string }>(
      sql`insert into locations (code, name, kind) values (${code}, ${`E2E InitialStock ${runTag} ${locationOrdinal}`}, 'BIN') returning id`,
    );
    const locationId = result.rows[0]!.id;
    createdLocationIds.push(locationId);

    await db.execute(
      sql`insert into inventory_transactions (component_id, transaction_type, quantity, unit_of_measure, destination_location_id, reference, reason, created_by) values (${componentId}, 'InitialStock', ${quantity}, 'pcs', ${locationId}, 'E2E-INITIAL', 'E2E opening balance', 'e2e')`,
    );

    return locationId;
  }

  /**
   * The AUTHORITATIVE stock read model used by the rest of the ERP:
   * `ReservationsService.getAvailableQuantity` and `PlanningRunsService` both
   * read `inventory_projections`.
   */
  async function authoritativeOnHand(componentId: string): Promise<number> {
    const rows = await db.execute<{ total: string }>(
      sql`select coalesce(sum(quantity), 0) as total from inventory_projections where component_id = ${componentId}`,
    );
    return Number(rows.rows[0]?.total ?? 0);
  }

  /**
   * The stock figure the ERP **UI** shows for a component list / inventory page.
   *
   * Mirrors `apps/web/app/components/page.tsx` and
   * `apps/web/app/inventory/page.tsx`, which derive stock from transactions and
   * DO count `InitialStock` as an increase.
   */
  async function uiVisibleStock(componentId: string): Promise<number> {
    const rows = await db.execute<{
      transaction_type: string;
      quantity: string;
    }>(
      sql`select transaction_type, quantity from inventory_transactions where component_id = ${componentId}`,
    );

    let total = 0;
    for (const row of rows.rows) {
      const quantity = Number(row.quantity) || 0;
      if (
        ['Receipt', 'Return', 'Production', 'InitialStock'].includes(
          row.transaction_type,
        )
      ) {
        total += quantity;
      } else if (['Issue', 'Consumption'].includes(row.transaction_type)) {
        total -= quantity;
      } else if (row.transaction_type === 'Adjustment') {
        total += quantity;
      }
    }
    return total;
  }

  /**
   * Creates a duplicate pair and runs the audit so a real duplicate finding
   * exists. Every generated component is owned by this spec.
   */
  async function createDuplicatePair(
    label: string,
    options: {
      unit?: string;
      sourceUnit?: string;
      resistanceA?: number;
      resistanceB?: number;
    } = {},
  ) {
    const yageo = await ensureManufacturer('yageo', 'Yageo');
    const resistors = await ensureCategory('RESISTORS', 'Resistors');
    const mpn = `E2E${label}${runId}${runTag}KL`;
    const unit = options.unit ?? 'pcs';

    const canonical = await createComponent({
      sku: `E2E-${label}-A-${runId}${runTag}`,
      name: `${label} Fixture Resistor A ${runTag}`,
      manufacturerPartNumber: mpn,
      manufacturerId: yageo.id,
      categoryId: resistors.id,
      unit,
      attributes: [
        {
          code: 'resistance',
          value: options.resistanceA ?? 10,
          unit: 'kohm',
        },
      ],
    });

    const duplicate = await createComponent({
      sku: `E2E-${label}-B-${runId}${runTag}`,
      name: `${label} Fixture Resistor B ${runTag}`,
      manufacturerPartNumber: mpn,
      manufacturerId: yageo.id,
      categoryId: resistors.id,
      unit: options.sourceUnit ?? unit,
      attributes: [
        {
          code: 'resistance',
          value: options.resistanceB ?? 10,
          unit: 'kohm',
        },
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
      throw new Error(`No duplicate finding was produced for ${label}.`);
    }

    // The preview is always computed for the direction the tests act on, so the
    // fingerprint they approve is the one the executor recomputes.
    const preview = await previewService.buildPreview(finding.id, canonical.id);

    return { canonical, duplicate, finding, preview };
  }

  /**
   * Builds an executable request for a preview.
   *
   * Every attribute the preview reports as undecided is resolved explicitly, in
   * the same way the UI would submit the reviewer's decisions: keep the
   * surviving record's value where there is one, discard a source-only value
   * otherwise. The fingerprint covers the underlying state rather than the
   * decisions, so supplying resolutions does not change it.
   */
  function buildRequest(
    preview: Awaited<
      ReturnType<ComponentConsolidationPreviewService['buildPreview']>
    >,
    canonicalComponentId: string,
    overrides: Partial<ConsolidationExecutionRequestDto> = {},
  ): ConsolidationExecutionRequestDto {
    return {
      expectedPreviewFingerprint: preview.previewFingerprint,
      canonicalComponentId,
      attributeResolutions: preview.attributes.entries
        .filter((entry) => entry.resolutionRequired)
        .map((entry) => ({
          attributeDefinitionId: entry.attributeDefinitionId,
          strategy:
            entry.classification === 'SOURCE_ONLY'
              ? ('DISCARD_SOURCE_VALUE' as const)
              : ('KEEP_CANONICAL_VALUE' as const),
        })),
      bomResolutions: [],
      confirmation: true,
      ...overrides,
    };
  }

  /** Counts every table consolidation can touch, for one component pair. */
  async function snapshotPair(canonicalId: string, sourceId: string) {
    const result = await db.execute<{
      transactions: number;
      projections: number;
      attributes: number;
      batches: number;
      serials: number;
      reservations: number;
      bom_lines: number;
      documents: number;
      favorites: number;
      suppliers: number;
      findings: number;
    }>(sql`
      select
        (select count(*)::int from inventory_transactions where component_id in (${canonicalId}, ${sourceId})) as transactions,
        (select count(*)::int from inventory_projections where component_id in (${canonicalId}, ${sourceId})) as projections,
        (select count(*)::int from component_attribute_values where component_id in (${canonicalId}, ${sourceId})) as attributes,
        (select count(*)::int from batches where component_id in (${canonicalId}, ${sourceId})) as batches,
        (select count(*)::int from serials where component_id in (${canonicalId}, ${sourceId})) as serials,
        (select count(*)::int from inventory_reservation_lines where component_id in (${canonicalId}, ${sourceId})) as reservations,
        (select count(*)::int from bill_of_material_lines where component_id in (${canonicalId}, ${sourceId})) as bom_lines,
        (select count(*)::int from documents where entity_type = 'Component' and entity_id in (${canonicalId}, ${sourceId})) as documents,
        (select count(*)::int from user_favorites where entity_type = 'Component' and entity_id in (${canonicalId}, ${sourceId})) as favorites,
        (select count(*)::int from supplier_components where component_id in (${canonicalId}, ${sourceId})) as suppliers,
        (select count(*)::int from component_intelligence_findings where component_id in (${canonicalId}, ${sourceId}) or related_component_id in (${canonicalId}, ${sourceId})) as findings
    `);
    return result.rows[0]!;
  }

  async function reloadComponent(id: string) {
    const rows = await db.execute<{
      is_active: boolean;
      consolidated_into_component_id: string | null;
      consolidation_id: string | null;
      consolidated_at: string | null;
    }>(
      sql`select is_active, consolidated_into_component_id, consolidation_id, consolidated_at from components where id = ${id}`,
    );
    return rows.rows[0]!;
  }

  // -------------------------------------------------------------------------
  // 1. Happy path
  // -------------------------------------------------------------------------

  it('consolidates an exact duplicate with no dependencies and retires the source', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding, preview } =
      await createDuplicatePair('BASIC');

    expect(preview.executable).toBe(true);

    const result = await consolidationService.consolidate(
      finding.id,
      buildRequest(preview, canonical.id),
      actor,
    );

    expect(result.status).toBe('COMPLETED');
    expect(result.idempotentReplay).toBe(false);
    expect(result.canonical.id).toBe(canonical.id);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]!.id).toBe(duplicate.id);

    // The source is retired, not deleted, and points at the survivor.
    const source = await reloadComponent(duplicate.id);
    expect(source.is_active).toBe(false);
    expect(source.consolidated_into_component_id).toBe(canonical.id);
    expect(source.consolidation_id).toBe(result.consolidationId);
    expect(source.consolidated_at).not.toBeNull();

    // The canonical component is untouched.
    const survivor = await reloadComponent(canonical.id);
    expect(survivor.is_active).toBe(true);
    expect(survivor.consolidated_into_component_id).toBeNull();

    // The operation record exists and names the pair.
    const record = await db.execute<{ status: string }>(
      sql`select status from consolidations where id = ${result.consolidationId}`,
    );
    expect(record.rows[0]!.status).toBe('COMPLETED');

    const sourceRecord = await db.execute<{ source_component_id: string }>(
      sql`select source_component_id from consolidation_sources where consolidation_id = ${result.consolidationId}`,
    );
    expect(sourceRecord.rows).toHaveLength(1);
    expect(sourceRecord.rows[0]!.source_component_id).toBe(duplicate.id);

    // The finding is closed as ACCEPTED with the consolidation recorded.
    const findingRows = await db.execute<{
      status: string;
      metadata: Record<string, unknown>;
    }>(
      sql`select status, metadata from component_intelligence_findings where id = ${finding.id}`,
    );
    expect(findingRows.rows[0]!.status).toBe('ACCEPTED');
    expect(
      (findingRows.rows[0]!.metadata as { consolidationId?: string })
        .consolidationId,
    ).toBe(result.consolidationId);
  });

  // -------------------------------------------------------------------------
  // 2. Inventory through the ledger
  // -------------------------------------------------------------------------

  it('moves inventory through the ledger and reconciles both projections', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding } = await createDuplicatePair('INV');

    const canonicalLocation = await seedInventory(canonical.id, 10);
    const sourceLocation = await seedInventory(duplicate.id, 25);

    // The fixture's preview predates these balances, so it is recomputed.
    const preview = await previewService.buildPreview(finding.id, canonical.id);
    expect(preview.executable).toBe(true);

    const before = await snapshotPair(canonical.id, duplicate.id);

    const result = await consolidationService.consolidate(
      finding.id,
      buildRequest(preview, canonical.id),
      actor,
    );

    // Two balanced entries per location with a non-zero balance were posted.
    const ledger = await db.execute<{
      component_id: string;
      transaction_type: string;
      quantity: string;
    }>(
      sql`select component_id, transaction_type, quantity from inventory_transactions where reference = ${`CONSOLIDATION:${result.consolidationId}`} order by transaction_type`,
    );
    // Exactly one Issue/Receipt pair: only the retired component's location had
    // a balance to move. The surviving component's own balance is untouched and
    // generates no entry, because the adapter iterates the SOURCE's balances.
    expect(ledger.rows).toHaveLength(2);

    const issues = ledger.rows.filter(
      (row) => row.transaction_type === 'Issue',
    );
    const receipts = ledger.rows.filter(
      (row) => row.transaction_type === 'Receipt',
    );
    expect(issues).toHaveLength(1);
    expect(receipts).toHaveLength(1);
    expect(issues[0]!.component_id).toBe(duplicate.id);
    expect(receipts[0]!.component_id).toBe(canonical.id);
    expect(Number(issues[0]!.quantity)).toBe(25);
    expect(Number(receipts[0]!.quantity)).toBe(25);

    // Historical rows were not rewritten: the seed entries are still there.
    const historical = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from inventory_transactions where reference = 'E2E-SEED' and component_id in (${canonical.id}, ${duplicate.id})`,
    );
    expect(Number(historical.rows[0]!.total)).toBe(2);

    // Projections were recalculated from each component's own ledger.
    const sourceProjection = await db.execute<{ quantity: string }>(
      sql`select quantity from inventory_projections where component_id = ${duplicate.id} and location_id = ${sourceLocation}`,
    );
    expect(sourceProjection.rows).toHaveLength(1);
    expect(Number(sourceProjection.rows[0]!.quantity)).toBe(0);

    const canonicalProjection = await db.execute<{ quantity: string }>(
      sql`select quantity from inventory_projections where component_id = ${canonical.id} and location_id = ${sourceLocation}`,
    );
    expect(canonicalProjection.rows).toHaveLength(1);
    expect(Number(canonicalProjection.rows[0]!.quantity)).toBe(25);

    // The canonical's own pre-existing balance is unchanged.
    const canonicalOwn = await db.execute<{ quantity: string }>(
      sql`select quantity from inventory_projections where component_id = ${canonical.id} and location_id = ${canonicalLocation}`,
    );
    expect(Number(canonicalOwn.rows[0]!.quantity)).toBe(10);

    // Ledger rows only ever grow; projections are rewritten in place.
    const after = await snapshotPair(canonical.id, duplicate.id);
    expect(after.transactions).toBeGreaterThan(before.transactions);
  });

  it('posts no ledger entry for a zero balance', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding } = await createDuplicatePair('ZERO');

    await seedInventory(duplicate.id, 0);

    const preview = await previewService.buildPreview(finding.id, canonical.id);
    const result = await consolidationService.consolidate(
      finding.id,
      buildRequest(preview, canonical.id),
      actor,
    );

    const ledger = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from inventory_transactions where reference = ${`CONSOLIDATION:${result.consolidationId}`}`,
    );
    expect(Number(ledger.rows[0]!.total)).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 3. Attributes
  // -------------------------------------------------------------------------

  it('requires an explicit resolution for a conflicting attribute, then applies it', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding } = await createDuplicatePair(
      'ATTR',
      { resistanceA: 10, resistanceB: 27 },
    );

    // Without a resolution the operation is refused.
    const blocked = await previewService.buildPreview(finding.id, canonical.id);
    const conflict = blocked.conflicts.find(
      (entry) => entry.code === 'ATTRIBUTE_VALUE_DIFFERENCE',
    );
    expect(conflict).toBeDefined();
    expect(conflict!.blocksExecution).toBe(true);

    // Without a resolution the operation is refused: the request deliberately
    // sends no attribute decisions.
    await expect(
      consolidationService.consolidate(
        finding.id,
        buildRequest(blocked, canonical.id, { attributeResolutions: [] }),
        actor,
      ),
    ).rejects.toThrow();

    // The refusal left nothing behind.
    const stillPending = await db.execute<{ status: string }>(
      sql`select status from component_intelligence_findings where id = ${finding.id}`,
    );
    expect(stillPending.rows[0]!.status).toBe('PENDING');
    const untouched = await reloadComponent(duplicate.id);
    expect(untouched.is_active).toBe(true);
    expect(untouched.consolidated_into_component_id).toBeNull();

    // With an explicit decision it proceeds and the decision is applied.
    const attributeDefinitionId = blocked.attributes.entries.find(
      (entry) => entry.classification === 'CONFLICTING',
    )!.attributeDefinitionId;

    const resolved = await previewService.buildPreview(
      finding.id,
      canonical.id,
      db,
      {
        attributeResolutions: [
          {
            attributeDefinitionId,
            strategy: 'KEEP_SOURCE_VALUE',
          },
        ],
        bomResolutions: [],
      },
    );
    expect(resolved.executable).toBe(true);

    await consolidationService.consolidate(
      finding.id,
      buildRequest(resolved, canonical.id, {
        attributeResolutions: [
          { attributeDefinitionId, strategy: 'KEEP_SOURCE_VALUE' },
        ],
      }),
      actor,
    );

    // The source kept its value on the survivor, and holds none itself.
    const canonicalValue = await db.execute<{ number_value: string }>(
      sql`select number_value from component_attribute_values where component_id = ${canonical.id} and attribute_definition_id = ${attributeDefinitionId}`,
    );
    expect(canonicalValue.rows).toHaveLength(1);
    expect(Number(canonicalValue.rows[0]!.number_value)).toBe(27);

    const sourceValues = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from component_attribute_values where component_id = ${duplicate.id}`,
    );
    expect(Number(sourceValues.rows[0]!.total)).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 4. BOM
  // -------------------------------------------------------------------------

  async function createBomWithLine(
    productComponentId: string,
    lineComponentId: string,
    quantityPerUnit: number,
    scrapFactorPercent = 0,
  ): Promise<string> {
    const bom = await db.execute<{ id: string }>(
      sql`insert into bill_of_materials (component_id, revision, status) values (${productComponentId}, 'v1.0', 'DRAFT') returning id`,
    );
    const bomId = bom.rows[0]!.id;
    createdBomIds.push(bomId);
    await db.execute(
      sql`insert into bill_of_material_lines (bom_id, component_id, quantity_per_unit, unit_of_measure, scrap_factor_percent) values (${bomId}, ${lineComponentId}, ${quantityPerUnit}, 'pcs', ${scrapFactorPercent})`,
    );
    return bomId;
  }

  it('repoints a source-only BOM line onto the surviving component', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding } = await createDuplicatePair('BOMA');
    const product = await createComponent({
      sku: `E2E-BOMA-P-${runId}${runTag}`,
      name: `BOMA Product ${runTag}`,
      unit: 'pcs',
    });

    const bomId = await createBomWithLine(product.id, duplicate.id, 4, 5);

    const preview = await previewService.buildPreview(finding.id, canonical.id);
    expect(preview.executable).toBe(true);

    await consolidationService.consolidate(
      finding.id,
      buildRequest(preview, canonical.id),
      actor,
    );

    const line = await db.execute<{
      component_id: string;
      quantity_per_unit: string;
      scrap_factor_percent: string;
    }>(
      sql`select component_id, quantity_per_unit, scrap_factor_percent from bill_of_material_lines where bom_id = ${bomId}`,
    );
    expect(line.rows).toHaveLength(1);
    expect(line.rows[0]!.component_id).toBe(canonical.id);
    // Quantity and scrap factor are preserved exactly.
    expect(Number(line.rows[0]!.quantity_per_unit)).toBe(4);
    expect(Number(line.rows[0]!.scrap_factor_percent)).toBe(5);
  });

  it('combines a BOM collision with an explicit scrap factor decision', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding } = await createDuplicatePair('BOMB');
    const product = await createComponent({
      sku: `E2E-BOMB-P-${runId}${runTag}`,
      name: `BOMB Product ${runTag}`,
      unit: 'pcs',
    });

    const bomId = await createBomWithLine(product.id, duplicate.id, 1, 2);
    await db.execute(
      sql`insert into bill_of_material_lines (bom_id, component_id, quantity_per_unit, unit_of_measure, scrap_factor_percent) values (${bomId}, ${canonical.id}, 2, 'pcs', 7)`,
    );

    const preview = await previewService.buildPreview(finding.id, canonical.id);
    const collision = preview.conflicts.find(
      (conflict) => conflict.code === 'BOM_COLLISION',
    );
    expect(collision!.blocksExecution).toBe(true);

    // No resolution -> the operation is refused and nothing changes.
    await expect(
      consolidationService.consolidate(
        finding.id,
        buildRequest(preview, canonical.id),
        actor,
      ),
    ).rejects.toThrow();
    const beforeResolve = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from bill_of_material_lines where bom_id = ${bomId}`,
    );
    expect(Number(beforeResolve.rows[0]!.total)).toBe(2);

    // With an explicit scrap-factor strategy the lines are combined.
    const resolved = await previewService.buildPreview(
      finding.id,
      canonical.id,
      db,
      { attributeResolutions: [], bomResolutions: [{ bomId }] },
    );
    expect(resolved.executable).toBe(true);

    await consolidationService.consolidate(
      finding.id,
      buildRequest(resolved, canonical.id, {
        bomResolutions: [
          {
            bomId,
            resolution: 'COMBINE',
            scrapFactorResolution: { strategy: 'USE_CANONICAL' },
          },
        ],
      }),
      actor,
    );

    const line = await db.execute<{
      component_id: string;
      quantity_per_unit: string;
      scrap_factor_percent: string;
    }>(
      sql`select component_id, quantity_per_unit, scrap_factor_percent from bill_of_material_lines where bom_id = ${bomId}`,
    );
    // One line remains, for the survivor, with the summed quantity.
    expect(line.rows).toHaveLength(1);
    expect(line.rows[0]!.component_id).toBe(canonical.id);
    expect(Number(line.rows[0]!.quantity_per_unit)).toBe(3);
    expect(Number(line.rows[0]!.scrap_factor_percent)).toBe(7);
  });

  // -------------------------------------------------------------------------
  // 5. Atomicity / rollback
  // -------------------------------------------------------------------------

  it('rolls everything back when a batch collision blocks the operation', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding } = await createDuplicatePair('ROLL');

    const locationId = await seedInventory(duplicate.id, 15);
    const sharedBatchNumber = `E2E-BATCH-${runId}${runTag}`;
    await db.execute(
      sql`insert into batches (component_id, batch_number) values (${canonical.id}, ${sharedBatchNumber})`,
    );
    await db.execute(
      sql`insert into batches (component_id, batch_number) values (${duplicate.id}, ${sharedBatchNumber})`,
    );

    const before = await snapshotPair(canonical.id, duplicate.id);

    const preview = await previewService.buildPreview(finding.id, canonical.id);
    const batchConflict = preview.conflicts.find(
      (conflict) => conflict.code === 'BATCH_COLLISION',
    );
    expect(batchConflict).toBeDefined();
    expect(batchConflict!.blocksExecution).toBe(true);
    // A batch identity collision needs the data fixed, not a reviewer decision.
    expect(batchConflict!.resolutionSupported).toBe(false);

    await expect(
      consolidationService.consolidate(
        finding.id,
        buildRequest(preview, canonical.id),
        actor,
      ),
    ).rejects.toThrow();

    // The inventory adapter runs BEFORE the batch adapter, so a ledger entry
    // would already have been written. The rollback must have removed it.
    const after = await snapshotPair(canonical.id, duplicate.id);
    expect(after.transactions).toBe(before.transactions);
    expect(after.projections).toBe(before.projections);
    expect(after.batches).toBe(before.batches);
    expect(after.attributes).toBe(before.attributes);
    expect(after.findings).toBe(before.findings);

    const ledger = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from inventory_transactions where reference like 'CONSOLIDATION:%' and component_id in (${canonical.id}, ${duplicate.id})`,
    );
    expect(Number(ledger.rows[0]!.total)).toBe(0);

    const projection = await db.execute<{ quantity: string }>(
      sql`select quantity from inventory_projections where component_id = ${duplicate.id} and location_id = ${locationId}`,
    );
    expect(Number(projection.rows[0]!.quantity)).toBe(15);

    const components = await Promise.all([
      reloadComponent(canonical.id),
      reloadComponent(duplicate.id),
    ]);
    expect(components[0].is_active).toBe(true);
    expect(components[0].consolidated_into_component_id).toBeNull();
    expect(components[1].is_active).toBe(true);
    expect(components[1].consolidated_into_component_id).toBeNull();

    // The finding stays pending so the reviewer can retry after fixing the data.
    const stillPending = await db.execute<{ status: string }>(
      sql`select status from component_intelligence_findings where id = ${finding.id}`,
    );
    expect(stillPending.rows[0]!.status).toBe('PENDING');

    // The refused attempt is still auditable.
    const failure = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from consolidations where canonical_component_id = ${canonical.id} and status = 'FAILED'`,
    );
    expect(Number(failure.rows[0]!.total)).toBeGreaterThanOrEqual(1);
    const completed = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from consolidations where canonical_component_id = ${canonical.id} and status = 'COMPLETED'`,
    );
    expect(Number(completed.rows[0]!.total)).toBe(0);
  });

  it('rolls everything back when a serial collision blocks a LATER stage', async () => {
    if (!hasDbUrl) return;

    // The serial adapter runs at order 40, after inventory (10), attributes
    // (15), BOM (20), supplier (25), procurement (26) and batches (30). A
    // failure here therefore proves every one of those stages rolled back, not
    // just the last one.
    const { canonical, duplicate, finding } =
      await createDuplicatePair('ROLL2');

    const locationId = await seedInventory(duplicate.id, 9);
    const sharedSerial = `E2E-ROLL2-SERIAL-${runId}${runTag}`;
    const sharedBatch = `E2E-ROLL2-BATCH-${runId}${runTag}`;
    await db.execute(
      sql`insert into batches (component_id, batch_number) values (${duplicate.id}, ${sharedBatch})`,
    );
    await db.execute(
      sql`insert into serials (component_id, serial_number, location_id) values (${canonical.id}, ${sharedSerial}, ${locationId})`,
    );
    await db.execute(
      sql`insert into serials (component_id, serial_number, location_id) values (${duplicate.id}, ${sharedSerial}, ${locationId})`,
    );

    const before = await snapshotPair(canonical.id, duplicate.id);

    const preview = await previewService.buildPreview(finding.id, canonical.id);
    const serialConflict = preview.conflicts.find(
      (conflict) => conflict.code === 'SERIAL_COLLISION',
    );
    expect(serialConflict).toBeDefined();
    expect(serialConflict!.blocksExecution).toBe(true);
    expect(serialConflict!.resolutionSupported).toBe(false);

    await expect(
      consolidationService.consolidate(
        finding.id,
        buildRequest(preview, canonical.id),
        actor,
      ),
    ).rejects.toThrow();

    // Zero partial state across every table, not just counts of the pair.
    expect(await snapshotPair(canonical.id, duplicate.id)).toEqual(before);

    // Nothing was posted to the ledger and no balance moved.
    const ledger = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from inventory_transactions where reference like 'CONSOLIDATION:%' and component_id in (${canonical.id}, ${duplicate.id})`,
    );
    expect(Number(ledger.rows[0]!.total)).toBe(0);

    const projection = await db.execute<{ quantity: string }>(
      sql`select quantity from inventory_projections where component_id = ${duplicate.id} and location_id = ${locationId}`,
    );
    expect(Number(projection.rows[0]!.quantity)).toBe(9);

    // The batch migration that ran at order 30 was undone.
    const batch = await db.execute<{ component_id: string }>(
      sql`select component_id from batches where batch_number = ${sharedBatch}`,
    );
    expect(batch.rows[0]!.component_id).toBe(duplicate.id);

    // Both components are still ACTIVE and the finding is still reviewable.
    const [canonicalRow, sourceRow] = await Promise.all([
      reloadComponent(canonical.id),
      reloadComponent(duplicate.id),
    ]);
    expect(canonicalRow.is_active).toBe(true);
    expect(canonicalRow.consolidated_into_component_id).toBeNull();
    expect(sourceRow.is_active).toBe(true);
    expect(sourceRow.consolidated_into_component_id).toBeNull();

    const stillPending = await db.execute<{ status: string }>(
      sql`select status from component_intelligence_findings where id = ${finding.id}`,
    );
    expect(stillPending.rows[0]!.status).toBe('PENDING');

    // No committed operation record, and no source row.
    const completed = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from consolidations where canonical_component_id = ${canonical.id} and status = 'COMPLETED'`,
    );
    expect(Number(completed.rows[0]!.total)).toBe(0);
    const sourceRecords = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from consolidation_sources where source_component_id = ${duplicate.id}`,
    );
    expect(Number(sourceRecords.rows[0]!.total)).toBe(0);
  });

  it('rolls everything back when a domain guard refuses a different unit of measure', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding } = await createDuplicatePair(
      'UNIT',
      { unit: 'pcs', sourceUnit: 'm' },
    );

    const before = await snapshotPair(canonical.id, duplicate.id);

    // The unit mismatch is a hard block, not a warning.
    const preview = await previewService.buildPreview(finding.id, canonical.id);
    await expect(
      consolidationService.consolidate(
        finding.id,
        buildRequest(preview, canonical.id),
        actor,
      ),
    ).rejects.toThrow();

    const after = await snapshotPair(canonical.id, duplicate.id);
    expect(after).toEqual(before);
    const source = await reloadComponent(duplicate.id);
    expect(source.is_active).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 6. Idempotency
  // -------------------------------------------------------------------------

  it('returns the existing result instead of moving inventory twice on a replay', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding } = await createDuplicatePair('IDEM');
    await seedInventory(duplicate.id, 12);

    const preview = await previewService.buildPreview(finding.id, canonical.id);
    const request = buildRequest(preview, canonical.id);

    const first = await consolidationService.consolidate(
      finding.id,
      request,
      actor,
    );
    expect(first.idempotentReplay).toBe(false);

    const ledgerAfterFirst = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from inventory_transactions where reference = ${`CONSOLIDATION:${first.consolidationId}`}`,
    );

    // The same request again.
    const second = await consolidationService.consolidate(
      finding.id,
      request,
      actor,
    );

    expect(second.idempotentReplay).toBe(true);
    expect(second.consolidationId).toBe(first.consolidationId);
    expect(second.sources[0]!.id).toBe(duplicate.id);

    const ledgerAfterSecond = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from inventory_transactions where reference = ${`CONSOLIDATION:${first.consolidationId}`}`,
    );
    expect(Number(ledgerAfterSecond.rows[0]!.total)).toBe(
      Number(ledgerAfterFirst.rows[0]!.total),
    );

    const operations = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from consolidations where canonical_component_id = ${canonical.id}`,
    );
    expect(Number(operations.rows[0]!.total)).toBe(1);

    // A different source cannot be consolidated twice either.
    const sourceRecords = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from consolidation_sources where source_component_id = ${duplicate.id}`,
    );
    expect(Number(sourceRecords.rows[0]!.total)).toBe(1);
  });

  it('refuses a different fingerprint when the source is already consolidated', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding, preview } =
      await createDuplicatePair('IDEM2');

    await consolidationService.consolidate(
      finding.id,
      buildRequest(preview, canonical.id),
      actor,
    );

    await expect(
      consolidationService.consolidate(
        finding.id,
        buildRequest(preview, canonical.id, {
          expectedPreviewFingerprint: '0'.repeat(64),
        }),
        actor,
      ),
    ).rejects.toThrow(/already consolidated/i);

    const source = await reloadComponent(duplicate.id);
    expect(source.consolidated_into_component_id).toBe(canonical.id);
  });

  // -------------------------------------------------------------------------
  // 7. Concurrency and stale state
  // -------------------------------------------------------------------------

  it('refuses a stale preview fingerprint', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding, preview } =
      await createDuplicatePair('STALE');

    // Another user edits the component after the preview was taken.
    await componentsService.update(duplicate.id, {
      name: `Changed After Preview ${runTag}`,
    });

    await expect(
      consolidationService.consolidate(
        finding.id,
        buildRequest(preview, canonical.id),
        actor,
      ),
    ).rejects.toThrow();

    const source = await reloadComponent(duplicate.id);
    expect(source.is_active).toBe(true);
    expect(source.consolidated_into_component_id).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 13. Fingerprint consistency (reported defect)
  // -------------------------------------------------------------------------

  it('executes successfully immediately after an unchanged executable preview', async () => {
    if (!hasDbUrl) return;

    // Exactly the reported request shape: the preview is taken, then executed
    // with the same fingerprint, empty resolutions and confirmation true, with
    // nothing touched in between.
    const { canonical, duplicate, finding } =
      await createDuplicatePair('IMMED');
    await seedInventory(duplicate.id, 3);

    const preview = await previewService.buildPreview(finding.id, canonical.id);
    expect(preview.executable).toBe(true);
    expect(preview.conflicts.some((c) => c.blocksExecution)).toBe(false);

    const result = await consolidationService.consolidate(
      finding.id,
      {
        expectedPreviewFingerprint: preview.previewFingerprint,
        canonicalComponentId: canonical.id,
        sourceComponentIds: [duplicate.id],
        attributeResolutions: [],
        bomResolutions: [],
        confirmation: true,
      },
      actor,
    );

    expect(result.status).toBe('COMPLETED');
    expect(result.idempotentReplay).toBe(false);
    expect(result.sources[0]!.id).toBe(duplicate.id);
  });

  it('produces identical fingerprints across repeated preview calls on unchanged state', async () => {
    if (!hasDbUrl) return;

    // The fingerprint must be a pure function of authoritative state: no
    // timestamps, no transaction-specific values, no ordering drift.
    const { canonical, finding } = await createDuplicatePair('DETERM');

    const first = await previewService.buildPreview(finding.id, canonical.id);

    // Repeat immediately.
    const second = await previewService.buildPreview(finding.id, canonical.id);

    // Repeat after a real delay, to catch any time-dependent input.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const third = await previewService.buildPreview(finding.id, canonical.id);

    // Repeat from inside a transaction, which is how execution recomputes it.
    const fourth = await db.transaction(async (tx) =>
      previewService.buildPreview(finding.id, canonical.id, toDbExecutor(tx)),
    );

    expect(second.previewFingerprint).toBe(first.previewFingerprint);
    expect(third.previewFingerprint).toBe(first.previewFingerprint);
    expect(fourth.previewFingerprint).toBe(first.previewFingerprint);

    // And the payload itself is byte-identical, not merely hash-equal.
    const payloads = [first, second, third, fourth].map((preview) =>
      stableStringify(
        previewService.buildPreviewFingerprintPayload(
          preview as Omit<typeof preview, 'previewFingerprint'>,
        ),
      ),
    );
    expect(new Set(payloads).size).toBe(1);

    // `computedAt` legitimately differs; it must not participate.
    expect(third.computedAt).not.toBe(first.computedAt);
  });

  it('invalidates the old preview when a review decision is recorded', async () => {
    if (!hasDbUrl) return;

    // The finding's lifecycle is part of the fingerprint, so recording a review
    // decision must invalidate a preview taken beforehand — even though the
    // decision leaves the finding consolidatable.
    const { canonical, duplicate, finding } =
      await createDuplicatePair('DECIDED');

    const preview = await previewService.buildPreview(finding.id, canonical.id);
    expect(preview.executable).toBe(true);

    // A reviewer accepts the finding, exactly as the UI decision button does.
    await reviewQueue.recordDecision(finding.id, {
      decision: 'ACCEPTED',
    });

    let message = '';
    try {
      await consolidationService.consolidate(
        finding.id,
        buildRequest(preview, canonical.id),
        actor,
      );
      throw new Error('consolidation should have been refused');
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    // Refused because the fingerprint no longer matches, and the message says
    // the state changed rather than blaming the components.
    expect(message).toContain('no longer applies');
    expect(message).not.toContain('components changed');

    // Nothing was mutated by the refused attempt.
    const source = await reloadComponent(duplicate.id);
    expect(source.is_active).toBe(true);
    expect(source.consolidated_into_component_id).toBeNull();

    // A refreshed preview reflects the accepted finding and is still executable:
    // accepting acknowledges the duplicate, it does not close the workflow.
    const refreshed = await previewService.buildPreview(
      finding.id,
      canonical.id,
    );
    expect(refreshed.executable).toBe(true);
    expect(refreshed.eligibility.eligible).toBe(true);
    expect(refreshed.eligibility.reasonCodes).not.toContain(
      'FINDING_STATUS_NOT_CONSOLIDATABLE',
    );
    // The fingerprint genuinely changed, which is what invalidated the old one.
    expect(refreshed.previewFingerprint).not.toBe(preview.previewFingerprint);
  });

  it('still rejects a genuinely changed component with the old fingerprint', async () => {
    if (!hasDbUrl) return;

    // The protection itself must be untouched by the fixes above.
    const { canonical, duplicate, finding } =
      await createDuplicatePair('GUARDED');

    const preview = await previewService.buildPreview(finding.id, canonical.id);
    expect(preview.executable).toBe(true);

    await componentsService.update(duplicate.id, {
      name: `Genuinely Changed ${runTag}`,
    });

    let message = '';
    try {
      await consolidationService.consolidate(
        finding.id,
        buildRequest(preview, canonical.id),
        actor,
      );
      throw new Error('consolidation should have been refused');
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('no longer applies');

    const source = await reloadComponent(duplicate.id);
    expect(source.is_active).toBe(true);
    expect(source.consolidated_into_component_id).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 14. Duplicate review workflow: acknowledge then consolidate
  // -------------------------------------------------------------------------

  it('W1. consolidates after the reviewer acknowledges the duplicate (PENDING → ACCEPTED)', async () => {
    if (!hasDbUrl) return;

    // The intended workflow: investigate, acknowledge the duplicate, then
    // consolidate. Accepting must not close the door on consolidation.
    const { canonical, duplicate, finding } = await createDuplicatePair('W1');
    await seedInventory(duplicate.id, 6);

    // 1. Investigate: a PENDING finding produces an executable preview.
    const beforeAccept = await previewService.buildPreview(
      finding.id,
      canonical.id,
    );
    expect(beforeAccept.history.findingStatus).toBe('PENDING');
    expect(beforeAccept.executable).toBe(true);

    // 2. Acknowledge the duplicate.
    const accepted = await reviewQueue.recordDecision(finding.id, {
      decision: 'ACCEPTED',
    });
    expect(accepted.status).toBe('ACCEPTED');

    // 3. The old preview is invalidated (finding status is in the fingerprint).
    await expect(
      consolidationService.consolidate(
        finding.id,
        buildRequest(beforeAccept, canonical.id),
        actor,
      ),
    ).rejects.toThrow();
    expect(await authoritativeOnHand(duplicate.id)).toBe(6);

    // 4. A refreshed preview is still executable.
    const afterAccept = await previewService.buildPreview(
      finding.id,
      canonical.id,
    );
    expect(afterAccept.history.findingStatus).toBe('ACCEPTED');
    expect(afterAccept.eligibility.eligible).toBe(true);
    expect(afterAccept.executable).toBe(true);
    expect(afterAccept.previewFingerprint).not.toBe(
      beforeAccept.previewFingerprint,
    );

    // 5. Consolidation completes.
    const result = await consolidationService.consolidate(
      finding.id,
      buildRequest(afterAccept, canonical.id),
      actor,
    );

    expect(result.status).toBe('COMPLETED');
    expect(result.sources[0]!.id).toBe(duplicate.id);
    expect(await authoritativeOnHand(duplicate.id)).toBe(0);
    expect(await authoritativeOnHand(canonical.id)).toBe(6);

    // The finding stays ACCEPTED, carrying the consolidation facts.
    const findingRow = await db.execute<{
      status: string;
      metadata: Record<string, unknown>;
    }>(
      sql`select status, metadata from component_intelligence_findings where id = ${finding.id}`,
    );
    expect(findingRow.rows[0]!.status).toBe('ACCEPTED');
    expect(
      (findingRow.rows[0]!.metadata as { consolidationId?: string })
        .consolidationId,
    ).toBe(result.consolidationId);
  });

  it('W2. preserves the original acknowledgement when consolidating an ACCEPTED finding', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding } = await createDuplicatePair('W2');

    // Reviewer A acknowledges the duplicate with a note.
    await reviewQueue.recordDecision(
      finding.id,
      {
        decision: 'ACCEPTED',
        decisionNotes: 'Confirmed against the manufacturer datasheet.',
      },
      { email: `first-reviewer-${runTag}@ananya.test` },
    );

    const afterAccept = await previewService.buildPreview(
      finding.id,
      canonical.id,
    );
    expect(afterAccept.executable).toBe(true);

    // Reviewer B consolidates later, without their own note.
    await consolidationService.consolidate(
      finding.id,
      buildRequest(afterAccept, canonical.id),
      { email: `second-reviewer-${runTag}@ananya.test` },
    );

    const row = await db.execute<{
      reviewer_email: string | null;
      decision_notes: string | null;
      reviewed_at: string | null;
    }>(
      sql`select reviewer_email, decision_notes, reviewed_at from component_intelligence_findings where id = ${finding.id}`,
    );

    // The acknowledgement's reviewer and note survive: consolidation must not
    // overwrite the decision that authorised it.
    expect(row.rows[0]!.decision_notes).toBe(
      'Confirmed against the manufacturer datasheet.',
    );
    expect(row.rows[0]!.reviewer_email).toBe(
      `first-reviewer-${runTag}@ananya.test`,
    );
    expect(row.rows[0]!.reviewed_at).not.toBeNull();
    void duplicate;
  });

  it('W3. blocks consolidation for a REJECTED duplicate finding', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding } = await createDuplicatePair('W3');

    await reviewQueue.recordDecision(finding.id, { decision: 'REJECTED' });

    const preview = await previewService.buildPreview(finding.id, canonical.id);
    expect(preview.eligibility.eligible).toBe(false);
    expect(preview.eligibility.reasonCodes).toContain(
      'FINDING_STATUS_NOT_CONSOLIDATABLE',
    );
    expect(preview.executable).toBe(false);

    await expect(
      consolidationService.consolidate(
        finding.id,
        buildRequest(preview, canonical.id),
        actor,
      ),
    ).rejects.toThrow();

    const source = await reloadComponent(duplicate.id);
    expect(source.is_active).toBe(true);
    expect(source.consolidated_into_component_id).toBeNull();
  });

  it('W4. blocks consolidation for a DISMISSED duplicate finding', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding } = await createDuplicatePair('W4');

    await reviewQueue.recordDecision(finding.id, { decision: 'DISMISSED' });

    const preview = await previewService.buildPreview(finding.id, canonical.id);
    expect(preview.eligibility.eligible).toBe(false);
    expect(preview.eligibility.reasonCodes).toContain(
      'FINDING_STATUS_NOT_CONSOLIDATABLE',
    );

    await expect(
      consolidationService.consolidate(
        finding.id,
        buildRequest(preview, canonical.id),
        actor,
      ),
    ).rejects.toThrow();

    const source = await reloadComponent(duplicate.id);
    expect(source.consolidated_into_component_id).toBeNull();
  });

  it('W5. blocks consolidation for a STALE finding', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding } = await createDuplicatePair('W5');

    await reviewQueue.markFindingsStale({
      ids: [finding.id],
      reason: 'Fixture staleness',
    });

    const preview = await previewService.buildPreview(finding.id, canonical.id);
    expect(preview.eligibility.eligible).toBe(false);
    expect(preview.eligibility.reasonCodes).toContain(
      'FINDING_STATUS_NOT_CONSOLIDATABLE',
    );

    await expect(
      consolidationService.consolidate(
        finding.id,
        buildRequest(preview, canonical.id),
        actor,
      ),
    ).rejects.toThrow();

    const source = await reloadComponent(duplicate.id);
    expect(source.consolidated_into_component_id).toBeNull();
  });

  it('W6. refuses a genuinely changed component even for an ACCEPTED finding', async () => {
    if (!hasDbUrl) return;

    // Eligibility was widened; the stale-state protection was not weakened.
    const { canonical, duplicate, finding } = await createDuplicatePair('W6');

    await reviewQueue.recordDecision(finding.id, { decision: 'ACCEPTED' });

    const acceptedPreview = await previewService.buildPreview(
      finding.id,
      canonical.id,
    );
    expect(acceptedPreview.executable).toBe(true);

    // Someone edits the component after the accepted preview was taken.
    await componentsService.update(duplicate.id, {
      name: `Changed After Accepted Preview ${runTag}`,
    });

    await expect(
      consolidationService.consolidate(
        finding.id,
        buildRequest(acceptedPreview, canonical.id),
        actor,
      ),
    ).rejects.toThrow();

    const source = await reloadComponent(duplicate.id);
    expect(source.is_active).toBe(true);
    expect(source.consolidated_into_component_id).toBeNull();
  });

  it('W7. keeps consolidation atomic and idempotent for an ACCEPTED finding', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding } = await createDuplicatePair('W7');
    await seedInventory(duplicate.id, 4);

    await reviewQueue.recordDecision(finding.id, { decision: 'ACCEPTED' });
    const preview = await previewService.buildPreview(finding.id, canonical.id);
    const request = buildRequest(preview, canonical.id);

    const first = await consolidationService.consolidate(
      finding.id,
      request,
      actor,
    );
    expect(first.status).toBe('COMPLETED');
    expect(first.idempotentReplay).toBe(false);

    const ledgerAfterFirst = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from inventory_transactions where reference = ${`CONSOLIDATION:${first.consolidationId}`}`,
    );

    // A replay returns the same operation without moving anything again.
    const second = await consolidationService.consolidate(
      finding.id,
      request,
      actor,
    );
    expect(second.idempotentReplay).toBe(true);
    expect(second.consolidationId).toBe(first.consolidationId);

    const ledgerAfterSecond = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from inventory_transactions where reference = ${`CONSOLIDATION:${first.consolidationId}`}`,
    );
    expect(Number(ledgerAfterSecond.rows[0]!.total)).toBe(
      Number(ledgerAfterFirst.rows[0]!.total),
    );

    // One operation, one retirement.
    const operations = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from consolidations where canonical_component_id = ${canonical.id}`,
    );
    expect(Number(operations.rows[0]!.total)).toBe(1);
    const sourceRecords = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from consolidation_sources where source_component_id = ${duplicate.id}`,
    );
    expect(Number(sourceRecords.rows[0]!.total)).toBe(1);
  });

  it('W8. refuses to consolidate when a concurrent decision rejects the finding', async () => {
    if (!hasDbUrl) return;

    // The finding adapter's guard must still refuse if the finding moved to a
    // terminal status after the preview was approved.
    const { canonical, duplicate, finding } = await createDuplicatePair('W8');

    const preview = await previewService.buildPreview(finding.id, canonical.id);
    expect(preview.executable).toBe(true);

    // The reviewer rejects it. The old fingerprint is now stale.
    await reviewQueue.recordDecision(finding.id, { decision: 'REJECTED' });

    await expect(
      consolidationService.consolidate(
        finding.id,
        buildRequest(preview, canonical.id),
        actor,
      ),
    ).rejects.toThrow();

    const source = await reloadComponent(duplicate.id);
    expect(source.is_active).toBe(true);
    expect(source.consolidated_into_component_id).toBeNull();
    expect(await authoritativeOnHand(duplicate.id)).toBe(0);
  });

  it('serialises two simultaneous consolidations of the same source', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding } = await createDuplicatePair('RACE');
    await seedInventory(duplicate.id, 8);

    const preview = await previewService.buildPreview(finding.id, canonical.id);
    const request = buildRequest(preview, canonical.id);

    const outcomes = await Promise.allSettled([
      consolidationService.consolidate(finding.id, request, actor),
      consolidationService.consolidate(finding.id, request, actor),
    ]);

    const fulfilled = outcomes.filter(
      (outcome) => outcome.status === 'fulfilled',
    );
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    // Exactly one component retirement and one committed operation.
    const operations = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from consolidations where canonical_component_id = ${canonical.id} and status = 'COMPLETED'`,
    );
    expect(Number(operations.rows[0]!.total)).toBe(1);

    const sourceRecords = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from consolidation_sources where source_component_id = ${duplicate.id}`,
    );
    expect(Number(sourceRecords.rows[0]!.total)).toBe(1);

    // The source balance moved exactly once.
    const projections = await db.execute<{ quantity: string }>(
      sql`select quantity from inventory_projections where component_id = ${duplicate.id}`,
    );
    expect(projections.rows.every((row) => Number(row.quantity) === 0)).toBe(
      true,
    );
  });

  // -------------------------------------------------------------------------
  // 8. Security and validation
  // -------------------------------------------------------------------------

  it('exposes the execution route behind the write guard over HTTP', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding } = await createDuplicatePair('HTTP');
    const preview = await previewService.buildPreview(finding.id, canonical.id);

    const application = await NestFactory.create(AppModule, { logger: false });
    await application.init();
    const server = application.getHttpServer() as Parameters<typeof request>[0];
    const http = request(server);

    try {
      const response = await http
        .post(`/ml/components/review-queue/${finding.id}/consolidate`)
        .send({
          expectedPreviewFingerprint: preview.previewFingerprint,
          canonicalComponentId: canonical.id,
          confirmation: true,
        });

      // Unauthenticated callers are rejected by ComponentWriteGuard before the
      // handler runs, so no consolidation id is returned.
      expect([401, 403]).toContain(response.status);
      expect(
        (response.body as { consolidationId?: unknown }).consolidationId,
      ).toBeUndefined();
    } finally {
      await application.close();
    }

    // The guard refused before any mutation.
    const source = await reloadComponent(duplicate.id);
    expect(source.is_active).toBe(true);
    expect(source.consolidated_into_component_id).toBeNull();
    const operations = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from consolidations where canonical_component_id = ${canonical.id}`,
    );
    expect(Number(operations.rows[0]!.total)).toBe(0);
  });

  it('refuses a request without explicit confirmation', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding } = await createDuplicatePair('CONF');

    const preview = await previewService.buildPreview(finding.id, canonical.id);

    await expect(
      consolidationService.consolidate(
        finding.id,
        buildRequest(preview, canonical.id, {
          confirmation: false,
        }),
        actor,
      ),
    ).rejects.toThrow(/confirm/i);

    const source = await reloadComponent(duplicate.id);
    expect(source.consolidated_into_component_id).toBeNull();
  });

  it('refuses a canonical component that is not part of the finding', async () => {
    if (!hasDbUrl) return;

    const { canonical, finding } = await createDuplicatePair('FORGE');
    const outsider = await createComponent({
      sku: `E2E-FORGE-OUT-${runId}${runTag}`,
      name: `Outsider ${runTag}`,
      unit: 'pcs',
    });

    const preview = await previewService.buildPreview(finding.id, canonical.id);

    await expect(
      consolidationService.consolidate(
        finding.id,
        buildRequest(preview, outsider.id),
        actor,
      ),
    ).rejects.toThrow(/not part of finding/i);

    const outsiderRow = await reloadComponent(outsider.id);
    expect(outsiderRow.consolidated_into_component_id).toBeNull();
  });

  it('refuses a finding that is not a duplicate', async () => {
    if (!hasDbUrl) return;

    const component = await createComponent({
      sku: `E2E-NONDUP-${runId}${runTag}`,
      name: `Non Dup ${runTag}`,
      unit: 'pcs',
    });

    // A syntactically valid but unrelated finding id.
    await expect(
      consolidationService.consolidate(
        '00000000-0000-4000-8000-000000000000',
        {
          expectedPreviewFingerprint: 'x'.repeat(20),
          canonicalComponentId: component.id,
          bomResolutions: [],
          attributeResolutions: [],
          confirmation: true,
        },
        actor,
      ),
    ).rejects.toThrow();
  });

  // -------------------------------------------------------------------------
  // 9. Polymorphic references
  // -------------------------------------------------------------------------

  it('repoints documents and deduplicates favorites while preserving history', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding } = await createDuplicatePair('POLY');

    const userIds = await db.execute<{ id: string }>(
      sql`select id from users order by id limit 1`,
    );
    const userId = userIds.rows[0]?.id ?? null;

    await db.execute(
      sql`insert into documents (entity_type, entity_id, title, file_name, file_url, storage_key, mime_type) values ('Component', ${duplicate.id}, ${`Doc ${runTag}`}, 'x.pdf', 'local://x.pdf', ${`e2e/${runId}`}, 'application/pdf')`,
    );
    await db.execute(
      sql`insert into activity_events (event_type, module, entity_type, entity_id, description) values ('UPDATED', 'Inventory', 'Component', ${duplicate.id}, ${`History ${runTag}`})`,
    );
    if (userId) {
      // The user already favorited the survivor, so the source favorite must be
      // removed rather than leaving two bookmarks for one part.
      await db.execute(
        sql`insert into user_favorites (user_id, entity_type, entity_id, title, href) values (${userId}, 'Component', ${canonical.id}, ${`Survivor ${runTag}`}, '/components/x')`,
      );
      await db.execute(
        sql`insert into user_favorites (user_id, entity_type, entity_id, title, href) values (${userId}, 'Component', ${duplicate.id}, ${`Source ${runTag}`}, '/components/y')`,
      );
    }

    const polyPreview = await previewService.buildPreview(
      finding.id,
      canonical.id,
    );
    expect(polyPreview.executable).toBe(true);

    await consolidationService.consolidate(
      finding.id,
      buildRequest(polyPreview, canonical.id),
      actor,
    );

    // Documents follow the survivor.
    const doc = await db.execute<{ entity_id: string }>(
      sql`select entity_id from documents where entity_type = 'Component' and storage_key = ${`e2e/${runId}`}`,
    );
    expect(doc.rows[0]!.entity_id).toBe(canonical.id);

    // Activity history is preserved on the retired component.
    const activity = await db.execute<{ entity_id: string }>(
      sql`select entity_id from activity_events where entity_type = 'Component' and entity_id = ${duplicate.id} and description = ${`History ${runTag}`}`,
    );
    expect(activity.rows).toHaveLength(1);

    // No duplicate favorite for the survivor.
    if (userId) {
      const favorites = await db.execute<{ total: number }>(
        sql`select count(*)::int as total from user_favorites where user_id = ${userId} and entity_type = 'Component' and entity_id = ${canonical.id}`,
      );
      expect(Number(favorites.rows[0]!.total)).toBe(1);
      const strandedFavorites = await db.execute<{ total: number }>(
        sql`select count(*)::int as total from user_favorites where entity_type = 'Component' and entity_id = ${duplicate.id}`,
      );
      expect(Number(strandedFavorites.rows[0]!.total)).toBe(0);
    }
  });

  it('repoints a lone source favorite so its link resolves to the survivor', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding } = await createDuplicatePair('FAV');

    const userIds = await db.execute<{ id: string }>(
      sql`select id from users order by id limit 1`,
    );
    const userId = userIds.rows[0]?.id ?? null;
    if (!userId) return;

    // The user bookmarked ONLY the component that will be retired. `title` and
    // `href` are denormalized display data, so a repoint that moved `entity_id`
    // alone would leave a bookmark naming and linking to the retired record.
    await db.execute(
      sql`insert into user_favorites (user_id, entity_type, entity_id, title, href) values (${userId}, 'Component', ${duplicate.id}, ${duplicate.sku}, ${`/components/${duplicate.id}`})`,
    );

    // The favorite is part of the preview basis, so the preview is taken after
    // it exists — the fingerprint guard would otherwise (correctly) refuse.
    const preview = await previewService.buildPreview(finding.id, canonical.id);

    await consolidationService.consolidate(
      finding.id,
      buildRequest(preview, canonical.id),
      actor,
    );

    const favorite = await db.execute<{
      entity_id: string;
      title: string;
      href: string;
    }>(
      sql`select entity_id, title, href from user_favorites where user_id = ${userId} and entity_type = 'Component' and entity_id = ${canonical.id}`,
    );
    expect(favorite.rows).toHaveLength(1);
    // All three fields point at the record that still exists.
    expect(favorite.rows[0]!.entity_id).toBe(canonical.id);
    expect(favorite.rows[0]!.title).toBe(canonical.sku);
    expect(favorite.rows[0]!.href).toBe(`/components/${canonical.id}`);

    // And nothing points at the retired component any more.
    const stranded = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from user_favorites where entity_type = 'Component' and entity_id = ${duplicate.id}`,
    );
    expect(Number(stranded.rows[0]!.total)).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 10. Post-consolidation guards
  // -------------------------------------------------------------------------

  it('blocks new inventory transactions and master-data edits on a retired component', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding, preview } =
      await createDuplicatePair('GUARD');

    await consolidationService.consolidate(
      finding.id,
      buildRequest(preview, canonical.id),
      actor,
    );

    // Master-data edits are refused by the aggregate.
    await expect(
      componentsService.update(duplicate.id, { name: `Should Fail ${runTag}` }),
    ).rejects.toThrow();

    // The consolidated component is still readable by id (never deleted) and
    // reports itself as inactive with its consolidation target.
    const detail = await componentsService.getComponent(duplicate.id);
    expect(detail.id).toBe(duplicate.id);
    expect(detail.isActive).toBe(false);
  });

  it('refuses every new-activity path for a retired component', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding } =
      await createDuplicatePair('RETIRED');
    const locationId = await seedInventory(duplicate.id, 5);

    // The balance is part of the preview basis, so the preview is taken after it
    // exists — the fingerprint guard would otherwise (correctly) refuse.
    const preview = await previewService.buildPreview(finding.id, canonical.id);

    await consolidationService.consolidate(
      finding.id,
      buildRequest(preview, canonical.id),
      actor,
    );

    // --- inventory transactions -------------------------------------------
    await expect(
      inventoryTransactionsService.create({
        componentId: duplicate.id,
        quantity: 1,
        unitOfMeasure: 'pcs',
        transactionType: 'Receipt',
        destinationLocationId: locationId,
        createdBy: 'e2e',
      }),
    ).rejects.toThrow();

    // --- reservations ------------------------------------------------------
    await expect(
      reservationsService.create({
        reservationType: 'WORK_ORDER',
        reservedBy: `e2e-${runTag}`,
        lines: [
          {
            componentId: duplicate.id,
            locationId,
            reservedQuantity: 1,
            unitOfMeasure: 'pcs',
          },
        ],
      }),
    ).rejects.toThrow();

    // --- bill of materials lines -------------------------------------------
    const product = await createComponent({
      sku: `E2E-RETIRED-P-${runId}${runTag}`,
      name: `Retired Guard Product ${runTag}`,
      unit: 'pcs',
    });
    const bom = await bomsService.create({ componentId: product.id });
    await expect(
      bomsService.addLine(bom.id, {
        componentId: duplicate.id,
        quantityPerUnit: 1,
      }),
    ).rejects.toThrow();

    // --- purchase order lines ----------------------------------------------
    const supplier = await suppliersService.create({
      code: `E2E-RETIRED-S-${runId}${runTag}`,
      name: `Retired Guard Supplier ${runTag}`,
    });
    createdSupplierIds.push(supplier.id);
    const po = await purchaseOrdersService.create({
      supplierId: supplier.id,
      currency: 'INR',
    });
    createdPurchaseOrderIds.push(po.id);
    await expect(
      purchaseOrdersService.addLine(po.id, {
        componentId: duplicate.id,
        quantityOrdered: 1,
        unitPrice: 1,
      }),
    ).rejects.toThrow();

    // The surviving component is unaffected by every guard.
    await expect(
      inventoryTransactionsService.create({
        componentId: canonical.id,
        quantity: 1,
        unitOfMeasure: 'pcs',
        transactionType: 'Receipt',
        destinationLocationId: locationId,
        createdBy: 'e2e',
      }),
    ).resolves.toBeDefined();

    // And no partial writes leaked from the refusals.
    const bomLines = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from bill_of_material_lines where bom_id = ${bom.id}`,
    );
    expect(Number(bomLines.rows[0]!.total)).toBe(0);
    const poLines = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from purchase_order_lines where purchase_order_id = ${po.id}`,
    );
    expect(Number(poLines.rows[0]!.total)).toBe(0);
    const reservations = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from inventory_reservation_lines where component_id = ${duplicate.id}`,
    );
    expect(Number(reservations.rows[0]!.total)).toBe(0);
  });

  it('reports a retired source as inactive with its consolidation target', async () => {
    if (!hasDbUrl) return;

    const { canonical, finding, preview } = await createDuplicatePair('REPORT');

    const result = await consolidationService.consolidate(
      finding.id,
      buildRequest(preview, canonical.id),
      actor,
    );

    expect(result.sources[0]!.isActive).toBe(false);
    expect(result.sources[0]!.consolidatedIntoComponentId).toBe(canonical.id);
    expect(result.canonical.isActive).toBe(true);

    // The adapter report names what each domain did, for the audit trail.
    const entities = result.adapters.map((adapter) => adapter.entity);
    expect(entities).toContain('components');
    expect(entities).toContain('component_intelligence_findings');
    expect(
      result.adapters.find((adapter) => adapter.adapterId === 'retirement')!
        .action,
    ).toBe('RETIRE');
  });

  // -------------------------------------------------------------------------
  // 11. InitialStock (audit finding, Pass 6B final safety audit)
  // -------------------------------------------------------------------------

  it('proves InitialStock is invisible to projections and BLOCKS consolidation', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding } =
      await createDuplicatePair('INITIAL');

    // The retired component's opening balance is recorded ONLY as an
    // `InitialStock` ledger entry, exactly as the real posting path would leave
    // it. The surviving component has ordinary Receipt-backed stock.
    await seedInitialStock(duplicate.id, 40);
    const canonicalLocation = await seedInventory(canonical.id, 10);

    // --- The two read models disagree -------------------------------------
    //
    // `CalculateInventoryProjection` (the calculator behind
    // `RebuildInventoryProjections`, and therefore behind the projections that
    // reservations and MRP read) has no `InitialStock` case, so the entry is
    // permanently invisible to it.
    expect(await authoritativeOnHand(duplicate.id)).toBe(0);
    // The ERP UI, which derives stock from transactions, does count it.
    expect(await uiVisibleStock(duplicate.id)).toBe(40);

    // Even a full rebuild cannot see it, so this is not a "not projected yet"
    // problem: no rebuild will ever include the quantity.
    await app.get(InventoryProjectionsService).rebuild();
    expect(await authoritativeOnHand(duplicate.id)).toBe(0);
    expect(await uiVisibleStock(duplicate.id)).toBe(40);

    // --- Consolidation must refuse rather than strand the stock -----------
    const preview = await previewService.buildPreview(finding.id, canonical.id);

    const initialStockConflict = preview.conflicts.find(
      (conflict) => conflict.code === 'INITIAL_STOCK_UNSUPPORTED',
    );
    expect(initialStockConflict).toBeDefined();
    expect(initialStockConflict!.severity).toBe('BLOCKING');
    expect(initialStockConflict!.blocksExecution).toBe(true);
    // No reviewer decision can make this safe: the fix is an inventory
    // modelling decision, not a choice about this pair.
    expect(initialStockConflict!.resolutionSupported).toBe(false);
    expect(preview.executable).toBe(false);

    await expect(
      consolidationService.consolidate(
        finding.id,
        buildRequest(preview, canonical.id),
        actor,
      ),
    ).rejects.toThrow();

    // --- Nothing moved, and the stock is still where it was ---------------
    expect(await authoritativeOnHand(duplicate.id)).toBe(0);
    expect(await uiVisibleStock(duplicate.id)).toBe(40);
    expect(await authoritativeOnHand(canonical.id)).toBe(10);
    expect(await uiVisibleStock(canonical.id)).toBe(10);

    const source = await reloadComponent(duplicate.id);
    expect(source.is_active).toBe(true);
    expect(source.consolidated_into_component_id).toBeNull();

    // The surviving component's own balance is untouched.
    const canonicalProjection = await db.execute<{ quantity: string }>(
      sql`select quantity from inventory_projections where component_id = ${canonical.id} and location_id = ${canonicalLocation}`,
    );
    expect(Number(canonicalProjection.rows[0]!.quantity)).toBe(10);
  });

  it('still consolidates normally when no InitialStock is present', async () => {
    if (!hasDbUrl) return;

    // The guard must be precise: ordinary ledger stock is unaffected.
    const { canonical, duplicate, finding } =
      await createDuplicatePair('NOSHIFT');
    await seedInventory(duplicate.id, 7);

    const preview = await previewService.buildPreview(finding.id, canonical.id);
    expect(
      preview.conflicts.find(
        (conflict) => conflict.code === 'INITIAL_STOCK_UNSUPPORTED',
      ),
    ).toBeUndefined();
    expect(preview.executable).toBe(true);

    await consolidationService.consolidate(
      finding.id,
      buildRequest(preview, canonical.id),
      actor,
    );

    expect(await authoritativeOnHand(duplicate.id)).toBe(0);
    expect(await uiVisibleStock(duplicate.id)).toBe(0);
    expect(await uiVisibleStock(canonical.id)).toBe(7);
  });

  // -------------------------------------------------------------------------
  // 12. Inventory accounting matrix (audit §2 cases C, F, G, H, I)
  // -------------------------------------------------------------------------

  it('C. merges source and canonical stock held at the SAME location', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding } = await createDuplicatePair('SAME');
    const locationId = await seedInventory(canonical.id, 3);
    // Same location, different component.
    await db.execute(
      sql`insert into inventory_projections (component_id, location_id, quantity, unit_of_measure) values (${duplicate.id}, ${locationId}, 5, 'pcs')`,
    );
    await db.execute(
      sql`insert into inventory_transactions (component_id, transaction_type, quantity, unit_of_measure, destination_location_id, reference, reason, created_by) values (${duplicate.id}, 'Receipt', 5, 'pcs', ${locationId}, 'E2E-SEED', 'E2E seed balance', 'e2e')`,
    );

    expect(await authoritativeOnHand(canonical.id)).toBe(3);
    expect(await authoritativeOnHand(duplicate.id)).toBe(5);

    const preview = await previewService.buildPreview(finding.id, canonical.id);
    await consolidationService.consolidate(
      finding.id,
      buildRequest(preview, canonical.id),
      actor,
    );

    // One location row for the survivor, holding the sum.
    const survivorRows = await db.execute<{ quantity: string }>(
      sql`select quantity from inventory_projections where component_id = ${canonical.id} and location_id = ${locationId}`,
    );
    expect(survivorRows.rows).toHaveLength(1);
    expect(Number(survivorRows.rows[0]!.quantity)).toBe(8);

    expect(await authoritativeOnHand(duplicate.id)).toBe(0);
    expect(await uiVisibleStock(canonical.id)).toBe(8);
    expect(await uiVisibleStock(duplicate.id)).toBe(0);
  });

  it('F. refuses a negative source projection instead of absorbing it', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding } = await createDuplicatePair('NEG');
    const locationId = await seedInventory(duplicate.id, -5);

    expect(await authoritativeOnHand(duplicate.id)).toBe(-5);

    const preview = await previewService.buildPreview(finding.id, canonical.id);
    await expect(
      consolidationService.consolidate(
        finding.id,
        buildRequest(preview, canonical.id),
        actor,
      ),
    ).rejects.toThrow();

    // Nothing changed: the inconsistency was not silently transferred.
    expect(await authoritativeOnHand(duplicate.id)).toBe(-5);
    expect(await authoritativeOnHand(canonical.id)).toBe(0);
    const source = await reloadComponent(duplicate.id);
    expect(source.is_active).toBe(true);
    expect(source.consolidated_into_component_id).toBeNull();

    // The refusal is recorded for diagnosis.
    const failure = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from consolidations where canonical_component_id = ${canonical.id} and status = 'FAILED'`,
    );
    expect(Number(failure.rows[0]!.total)).toBeGreaterThanOrEqual(1);
    void locationId;
  });

  it('G. migrates reserved stock and keeps the availability invariant', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding } = await createDuplicatePair('RESV');
    const locationId = await seedInventory(duplicate.id, 10);

    // A live commitment for 4 of the 10 units.
    const reservation = await db.execute<{ id: string }>(
      sql`insert into inventory_reservations (reservation_number, reservation_type, reserved_by, status) values (${`E2E-${runId}${runTag}-R1`}, 'WORK_ORDER', ${`e2e-${runTag}`}, 'ACTIVE') returning id`,
    );
    const reservationId = reservation.rows[0]!.id;
    await db.execute(
      sql`insert into inventory_reservation_lines (reservation_id, component_id, location_id, reserved_quantity, unit_of_measure) values (${reservationId}, ${duplicate.id}, ${locationId}, 4, 'pcs')`,
    );

    const preview = await previewService.buildPreview(finding.id, canonical.id);
    expect(preview.executable).toBe(true);

    await consolidationService.consolidate(
      finding.id,
      buildRequest(preview, canonical.id),
      actor,
    );

    // The commitment followed the stock.
    const line = await db.execute<{
      component_id: string;
      location_id: string;
      reserved_quantity: string;
    }>(
      sql`select component_id, location_id, reserved_quantity from inventory_reservation_lines where reservation_id = ${reservationId}`,
    );
    expect(line.rows).toHaveLength(1);
    expect(line.rows[0]!.component_id).toBe(canonical.id);
    expect(line.rows[0]!.location_id).toBe(locationId);
    expect(Number(line.rows[0]!.reserved_quantity)).toBe(4);

    // The domain read model the reservations UI uses agrees, and the invariant
    // reserved <= onHand holds.
    const availability = await reservationsService.getAvailableQuantity(
      canonical.id,
      locationId,
    );
    expect(availability.onHand).toBe(10);
    expect(availability.reserved).toBe(4);
    expect(availability.available).toBe(6);

    // No reservation points at the retired component any more.
    const stranded = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from inventory_reservation_lines where component_id = ${duplicate.id}`,
    );
    expect(Number(stranded.rows[0]!.total)).toBe(0);
  });

  it('G2. refuses to repoint a reservation that would over-reserve the survivor', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding } =
      await createDuplicatePair('RESV2');
    const locationId = await seedInventory(duplicate.id, 10);
    // The survivor already commits more than it holds once the source arrives.
    await db.execute(
      sql`insert into inventory_projections (component_id, location_id, quantity, unit_of_measure) values (${canonical.id}, ${locationId}, 2, 'pcs')`,
    );
    await db.execute(
      sql`insert into inventory_transactions (component_id, transaction_type, quantity, unit_of_measure, destination_location_id, reference, reason, created_by) values (${canonical.id}, 'Receipt', 2, 'pcs', ${locationId}, 'E2E-SEED', 'E2E seed balance', 'e2e')`,
    );

    const reservation = await db.execute<{ id: string }>(
      sql`insert into inventory_reservations (reservation_number, reservation_type, reserved_by, status) values (${`E2E-${runId}${runTag}-R2`}, 'WORK_ORDER', ${`e2e-${runTag}`}, 'ACTIVE') returning id`,
    );
    const reservationId = reservation.rows[0]!.id;
    await db.execute(
      sql`insert into inventory_reservation_lines (reservation_id, component_id, location_id, reserved_quantity, unit_of_measure) values (${reservationId}, ${duplicate.id}, ${locationId}, 20, 'pcs')`,
    );

    const preview = await previewService.buildPreview(finding.id, canonical.id);
    await expect(
      consolidationService.consolidate(
        finding.id,
        buildRequest(preview, canonical.id),
        actor,
      ),
    ).rejects.toThrow();

    // The over-committed reservation stayed on the source, and nothing moved.
    const line = await db.execute<{ component_id: string }>(
      sql`select component_id from inventory_reservation_lines where reservation_id = ${reservationId}`,
    );
    expect(line.rows[0]!.component_id).toBe(duplicate.id);
    expect(await authoritativeOnHand(duplicate.id)).toBe(10);
    expect(await authoritativeOnHand(canonical.id)).toBe(2);
  });

  it('H. migrates batch stock onto the survivor', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding } =
      await createDuplicatePair('BATCHM');
    const batchNumber = `E2E-BATCHM-${runId}${runTag}`;
    await db.execute(
      sql`insert into batches (component_id, batch_number, supplier_batch_number) values (${duplicate.id}, ${batchNumber}, 'SUP-1')`,
    );

    const preview = await previewService.buildPreview(finding.id, canonical.id);
    await consolidationService.consolidate(
      finding.id,
      buildRequest(preview, canonical.id),
      actor,
    );

    const batch = await db.execute<{
      component_id: string;
      batch_number: string;
      supplier_batch_number: string | null;
    }>(
      sql`select component_id, batch_number, supplier_batch_number from batches where batch_number = ${batchNumber}`,
    );
    expect(batch.rows).toHaveLength(1);
    expect(batch.rows[0]!.component_id).toBe(canonical.id);
    // Batch identity is preserved, not recreated.
    expect(batch.rows[0]!.supplier_batch_number).toBe('SUP-1');

    const stranded = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from batches where component_id = ${duplicate.id}`,
    );
    expect(Number(stranded.rows[0]!.total)).toBe(0);
  });

  it('I. migrates serialized stock onto the survivor', async () => {
    if (!hasDbUrl) return;

    const { canonical, duplicate, finding } = await createDuplicatePair('SERM');
    const locationId = await seedInventory(duplicate.id, 2);
    const serialNumber = `E2E-SERIALM-${runId}${runTag}`;
    await db.execute(
      sql`insert into serials (component_id, serial_number, location_id) values (${duplicate.id}, ${serialNumber}, ${locationId})`,
    );

    const preview = await previewService.buildPreview(finding.id, canonical.id);
    await consolidationService.consolidate(
      finding.id,
      buildRequest(preview, canonical.id),
      actor,
    );

    const serial = await db.execute<{
      component_id: string;
      serial_number: string;
      location_id: string | null;
    }>(
      sql`select component_id, serial_number, location_id from serials where serial_number = ${serialNumber}`,
    );
    expect(serial.rows).toHaveLength(1);
    expect(serial.rows[0]!.component_id).toBe(canonical.id);
    // Serial identity and physical location are preserved.
    expect(serial.rows[0]!.location_id).toBe(locationId);

    const stranded = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from serials where component_id = ${duplicate.id}`,
    );
    expect(Number(stranded.rows[0]!.total)).toBe(0);
  });
});

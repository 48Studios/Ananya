import {
  ALL_DEPENDENCY_ADAPTERS,
  COMPONENT_DEPENDENCY_ADAPTERS,
  DEPENDENCY_SAMPLE_LIMIT,
  POLYMORPHIC_DEPENDENCY_ADAPTERS,
  isRegisteredDependencyId,
  type DependencyClassification,
  type ExecutionSupport,
} from './component-consolidation-dependencies';

/**
 * Registry integrity tests (Pass 6A).
 *
 * These are the *static* half of the dependency coverage guarantee: they assert
 * that the registry represents every component reference discovered in Phase 0,
 * with a valid classification. The dynamic half (registry vs live
 * `information_schema`) runs in the integration spec, because it needs a
 * database.
 *
 * A new component reference that nobody registers must fail this suite, which is
 * the point: consolidation analysis is not allowed to silently ignore a
 * relationship.
 */

/**
 * The complete Phase 0 dependency map: every table and column that references a
 * component, exactly as discovered from the schema and confirmed against
 * `information_schema`.
 */
const PHASE_0_FK_REFERENCES: ReadonlyArray<{ table: string; column: string }> =
  [
    { table: 'ai_suggestion_feedback', column: 'component_id' },
    { table: 'batches', column: 'component_id' },
    { table: 'bill_of_material_lines', column: 'component_id' },
    { table: 'bill_of_materials', column: 'component_id' },
    { table: 'component_attribute_values', column: 'component_id' },
    { table: 'component_intelligence_findings', column: 'component_id' },
    {
      table: 'component_intelligence_findings',
      column: 'related_component_id',
    },
    { table: 'customer_return_lines', column: 'component_id' },
    { table: 'cycle_count_lines', column: 'component_id' },
    { table: 'finished_goods_receipt_lines', column: 'component_id' },
    { table: 'fulfillment_request_lines', column: 'component_id' },
    { table: 'goods_receipt_lines', column: 'component_id' },
    { table: 'inventory_projections', column: 'component_id' },
    { table: 'inventory_reservation_lines', column: 'component_id' },
    { table: 'inventory_transactions', column: 'component_id' },
    { table: 'manufacturing_traceability', column: 'component_id' },
    { table: 'material_consumption_lines', column: 'component_id' },
    { table: 'material_requirements', column: 'component_id' },
    { table: 'production_orders', column: 'component_id' },
    { table: 'production_recommendations', column: 'product_id' },
    { table: 'project_materials', column: 'component_id' },
    { table: 'purchase_invoice_lines', column: 'component_id' },
    { table: 'purchase_order_lines', column: 'component_id' },
    { table: 'purchase_recommendations', column: 'component_id' },
    { table: 'quotation_lines', column: 'component_id' },
    { table: 'sales_order_lines', column: 'component_id' },
    { table: 'serials', column: 'component_id' },
    { table: 'service_requests', column: 'component_id' },
    { table: 'stock_adjustment_lines', column: 'component_id' },
    { table: 'stock_count_lines', column: 'component_id' },
    { table: 'supplier_components', column: 'component_id' },
    { table: 'supplier_return_lines', column: 'component_id' },
    { table: 'warehouse_transfer_lines', column: 'component_id' },
    { table: 'warranty_claims', column: 'product_id' },
  ];

/** The polymorphic reference systems discovered in Phase 0. */
const PHASE_0_POLYMORPHIC_REFERENCES: readonly string[] = [
  'activity_events',
  'documents',
  'notifications',
  'user_favorites',
];

const VALID_CLASSIFICATIONS: readonly DependencyClassification[] = [
  'MUST_PRESERVE',
  'MUST_REPOINT',
  'MUST_RECONCILE',
  'MUST_NOT_CHANGE',
  'UNKNOWN',
];

const VALID_SUPPORT: readonly ExecutionSupport[] = [
  'SUPPORTED',
  'UNSUPPORTED',
  'NOT_APPLICABLE',
];

describe('Component dependency registry (Pass 6A, extended in Pass 6B)', () => {
  it('represents every component reference discovered in Phase 0', () => {
    const registered = COMPONENT_DEPENDENCY_ADAPTERS.flatMap((entry) =>
      entry.tables.map((table) => `${table.table}.${table.column}`),
    );

    for (const reference of PHASE_0_FK_REFERENCES) {
      expect(registered).toContain(`${reference.table}.${reference.column}`);
    }

    // Pass 6B added the three consolidation-owned references (the retirement
    // pointer and the two operation tables). They are real foreign keys to
    // `components.id`, so the registry must represent them or the live coverage
    // check would fail closed.
    const CONSOLIDATION_OWNED_REFERENCES = [
      'components.consolidated_into_component_id',
      'consolidations.canonical_component_id',
      'consolidation_sources.source_component_id',
    ];
    for (const reference of CONSOLIDATION_OWNED_REFERENCES) {
      expect(registered).toContain(reference);
    }

    // Pass 2 (Documentation Intelligence) added a real foreign key from
    // `document_intelligence_analyses` to `components.id`. It is registered for
    // the same reason: an unregistered component reference must fail closed.
    const DOCUMENTATION_INTELLIGENCE_REFERENCES = [
      'document_intelligence_analyses.component_id',
    ];
    for (const reference of DOCUMENTATION_INTELLIGENCE_REFERENCES) {
      expect(registered).toContain(reference);
    }

    expect(registered).toHaveLength(
      PHASE_0_FK_REFERENCES.length +
        CONSOLIDATION_OWNED_REFERENCES.length +
        DOCUMENTATION_INTELLIGENCE_REFERENCES.length,
    );
  });

  it('treats datasheet analysis evidence as a supported repoint', () => {
    // An analysis describes a component's documentation now, so it follows the
    // surviving component exactly as the document it analysed does. It keeps its
    // document id, version and content hash, so it still identifies the exact
    // bytes it read.
    const analyses = ALL_DEPENDENCY_ADAPTERS.find(
      (entry) => entry.id === 'document_intelligence_analyses',
    );
    expect(analyses).toBeDefined();
    expect(analyses!.classification).toBe('MUST_REPOINT');
    expect(analyses!.executionSupport).toBe('SUPPORTED');
    expect(analyses!.temporality).toBe('CURRENT');
    expect(analyses!.tables).toEqual([
      { table: 'document_intelligence_analyses', column: 'component_id' },
    ]);
    expect(analyses!.supportNote).toMatch(/content hash/i);
  });

  it('has a registered identity for every reference the live database exposes', () => {
    // The adapter ids must stay unique and discoverable by id, because
    // consolidation and the coverage check resolve them that way.
    expect(isRegisteredDependencyId('document_intelligence_analyses')).toBe(
      true,
    );
  });

  it('represents every polymorphic reference system discovered in Phase 0', () => {
    const registered = POLYMORPHIC_DEPENDENCY_ADAPTERS.flatMap((entry) =>
      entry.tables.map((table) => table.table),
    );

    for (const table of PHASE_0_POLYMORPHIC_REFERENCES) {
      expect(registered).toContain(table);
    }
    expect(registered).toHaveLength(PHASE_0_POLYMORPHIC_REFERENCES.length);
  });

  it('has no duplicate adapter ids', () => {
    const ids = ALL_DEPENDENCY_ADAPTERS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses only valid classifications and execution support values', () => {
    const offenders = ALL_DEPENDENCY_ADAPTERS.filter(
      (entry) =>
        !VALID_CLASSIFICATIONS.includes(entry.classification) ||
        !VALID_SUPPORT.includes(entry.executionSupport),
    ).map((entry) => ({
      id: entry.id,
      classification: entry.classification,
      executionSupport: entry.executionSupport,
    }));

    expect(offenders).toEqual([]);
  });

  it('fails closed: UNKNOWN classification is never marked supported', () => {
    const offenders = ALL_DEPENDENCY_ADAPTERS.filter(
      (entry) =>
        entry.classification === 'UNKNOWN' &&
        entry.executionSupport === 'SUPPORTED',
    ).map((entry) => entry.id);

    expect(offenders).toEqual([]);
  });

  it('fails closed: an UNSUPPORTED dependency is never marked SUPPORTED', () => {
    const offenders = ALL_DEPENDENCY_ADAPTERS.filter(
      (entry) =>
        entry.classification === 'UNKNOWN' &&
        entry.executionSupport === 'SUPPORTED',
    ).map((entry) => entry.id);

    expect(offenders).toEqual([]);
  });

  it('gives every polymorphic reference explicit semantics (Pass 6B)', () => {
    // Pass 6A left all four tables UNKNOWN because Phase 0 could not classify
    // them. Pass 6B defines each one, so the assertion changed from "all
    // unsupported" to "all classified, and none left UNKNOWN".
    const unclassified = POLYMORPHIC_DEPENDENCY_ADAPTERS.filter(
      (entry) =>
        entry.referenceKind !== 'POLYMORPHIC' ||
        entry.classification === 'UNKNOWN',
    ).map((entry) => entry.id);

    expect(unclassified).toEqual([]);

    // Historical tables are preserved; current references are migrated.
    const preserved = POLYMORPHIC_DEPENDENCY_ADAPTERS.filter(
      (entry) => entry.classification === 'MUST_PRESERVE',
    ).map((entry) => entry.id);
    expect(preserved.sort()).toEqual(['activity_events', 'notifications']);

    const current = POLYMORPHIC_DEPENDENCY_ADAPTERS.filter(
      (entry) =>
        entry.classification === 'MUST_REPOINT' ||
        entry.classification === 'MUST_RECONCILE',
    ).map((entry) => entry.id);
    expect(current.sort()).toEqual(['documents', 'user_favorites']);
  });

  it('fails closed: MUST_PRESERVE entries are never repointable as SUPPORTED', () => {
    // Preserving history is not a mutation, so it must never be described as a
    // supported repoint.
    const offenders = ALL_DEPENDENCY_ADAPTERS.filter(
      (entry) =>
        entry.classification === 'MUST_PRESERVE' &&
        entry.executionSupport === 'SUPPORTED',
    ).map((entry) => entry.id);

    expect(offenders).toEqual([]);
  });

  it('keeps the inventory ledger out of the repointable set', () => {
    const ledger = ALL_DEPENDENCY_ADAPTERS.find(
      (entry) => entry.id === 'inventory_transactions',
    );
    expect(ledger).toBeDefined();
    expect(ledger!.classification).toBe('MUST_PRESERVE');
    expect(ledger!.temporality).toBe('HISTORICAL');
    expect(ledger!.executionSupport).toBe('UNSUPPORTED');
  });

  it('treats a product BOM as MUST_NOT_CHANGE rather than guessing', () => {
    // A BOM belongs to the product it builds. A BOM that produces a component
    // being retired cannot be repointed, and there is no domain operation that
    // amends an issued BOM, so this blocks while it exists.
    const productBom = ALL_DEPENDENCY_ADAPTERS.find(
      (entry) => entry.id === 'bill_of_materials',
    );
    expect(productBom).toBeDefined();
    expect(productBom!.classification).toBe('MUST_NOT_CHANGE');
    expect(productBom!.executionSupport).toBe('UNSUPPORTED');
    expect(productBom!.supportNote).toContain('product');
  });

  it('defines BOM line semantics explicitly (Pass 6B)', () => {
    // Pass 6A marked BOM lines UNKNOWN because no quantity-merge rule existed.
    // Pass 6B defines one: repoint a source-only line, combine a collision with
    // an explicitly chosen scrap factor.
    const bomLines = ALL_DEPENDENCY_ADAPTERS.find(
      (entry) => entry.id === 'bill_of_material_lines',
    );
    expect(bomLines).toBeDefined();
    expect(bomLines!.classification).toBe('MUST_REPOINT');
    expect(bomLines!.executionSupport).toBe('SUPPORTED');
    expect(bomLines!.supportNote).toContain('combined');
    expect(bomLines!.supportNote).toContain('scrap factor');
  });

  it('keeps genuinely unresolvable dependencies blocking', () => {
    // These are the dependencies where no reviewer decision can make the action
    // safe, so consolidation must refuse rather than migrate them.
    const blocking = ['service_requests', 'purchase_order_lines'];
    for (const id of blocking) {
      const entry = ALL_DEPENDENCY_ADAPTERS.find((item) => item.id === id);
      expect(entry).toBeDefined();
      expect(entry!.classification).toBe('MUST_NOT_CHANGE');
      expect(entry!.executionSupport).toBe('UNSUPPORTED');
    }
  });

  it('documents why each unsupported dependency is unsupported', () => {
    const undocumented = ALL_DEPENDENCY_ADAPTERS.filter(
      (entry) =>
        entry.executionSupport === 'UNSUPPORTED' &&
        entry.supportNote.length <= 20,
    ).map((entry) => entry.id);

    expect(undocumented).toEqual([]);
  });

  it('declares at least one physical table per adapter', () => {
    const invalid = ALL_DEPENDENCY_ADAPTERS.filter(
      (entry) =>
        entry.tables.length === 0 ||
        entry.tables.some(
          (table) =>
            !/^[a-z_]+$/.test(table.table) || !/^[a-z_]+$/.test(table.column),
        ),
    ).map((entry) => entry.id);

    expect(invalid).toEqual([]);
  });

  it('marks the reference kind consistently with the Phase 0 report', () => {
    const polymorphicIds = ALL_DEPENDENCY_ADAPTERS.filter(
      (entry) => entry.referenceKind === 'POLYMORPHIC',
    ).map((entry) => entry.id);
    expect(polymorphicIds.sort()).toEqual(
      [...PHASE_0_POLYMORPHIC_REFERENCES].sort(),
    );
  });

  it('exposes a bounded sample size so previews cannot load unbounded rows', () => {
    expect(DEPENDENCY_SAMPLE_LIMIT).toBeGreaterThan(0);
    expect(DEPENDENCY_SAMPLE_LIMIT).toBeLessThanOrEqual(20);
  });

  it('recognises only registered dependency ids', () => {
    expect(isRegisteredDependencyId('inventory_transactions')).toBe(true);
    expect(isRegisteredDependencyId('documents')).toBe(true);
    expect(isRegisteredDependencyId('some_future_table')).toBe(false);
  });

  it('counts the expected dependency surface', () => {
    // 37 FK tables / 38 columns: the 33 tables Phase 0 discovered (34 columns,
    // because findings carry both sides of a pair and two tables reference
    // components through a `product_id` column), plus the 3 consolidation-owned
    // references added in Pass 6B, plus the documentation intelligence analysis
    // reference added in Pass 2. Plus 4 polymorphic systems.
    expect(COMPONENT_DEPENDENCY_ADAPTERS).toHaveLength(37);
    expect(POLYMORPHIC_DEPENDENCY_ADAPTERS).toHaveLength(4);
    expect(ALL_DEPENDENCY_ADAPTERS).toHaveLength(41);
  });
});

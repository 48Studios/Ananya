/**
 * Location hierarchy integrity diagnostic — READ-ONLY.
 *
 * Reports on two independent relations:
 *
 * 1. Organizational hierarchy (`parentId`) — classifies every persisted
 *    `parent.kind` → `child.kind` relationship as canonical physical
 *    containment, a valid context-root relationship, an explicitly documented
 *    legacy compatibility pair, or a violation.
 *
 * 2. Physical containment readiness (`containerId`, RFC-0069 Phase 1) — reports
 *    coverage and integrity of the new nullable column: populated/missing
 *    counts, coverage %, dangling references, invalid category relationships,
 *    and container cycles. In Phase 1 the column is intentionally unpopulated,
 *    so coverage is expected to be 0%.
 *
 * STRICTLY READ-ONLY. It NEVER writes, migrates, repairs, backfills, canonicalizes
 * or re-parents anything, and never mutates fixtures. Every statement is a
 * `SELECT` wrapped in a read-only transaction. It is a report for the
 * dev/reviewer workflow, not a runtime endpoint on the Location APIs.
 *
 * Classification uses the SAME functions the application uses
 * (`classifyLocationHierarchyRelationship` in `@ananya/inventory`), loaded from
 * the workspace build so the report can never drift from the canonical taxonomy.
 * No second containment vocabulary is introduced.
 *
 * Usage:
 *   pnpm --filter @ananya/inventory build   # one-time, if not already built
 *   node tools/spatial-integrity/diagnose-location-hierarchy.mjs
 *
 * Optional env:
 *   ANANYA_DB_CONTAINER   postgres container name (default: ananya-db)
 *   ANANYA_HIERARCHY_JSON emit a JSON report instead of text
 */
import { execFileSync } from 'node:child_process';

const DB_CONTAINER = process.env.ANANYA_DB_CONTAINER ?? 'ananya-db';
const AS_JSON = process.env.ANANYA_HIERARCHY_JSON === '1';

/**
 * Runs a single read-only query.
 *
 * Every statement is sent as `SELECT ... FROM (…) t`, inside an explicit
 * `BEGIN READ ONLY` transaction so PostgreSQL itself refuses any write, and the
 * outer expression is always an aggregate `SELECT` (never a bare statement that
 * could be misinterpreted as a mutation vehicle).
 */
function queryRows(sqlText) {
  const out = execFileSync(
    'docker',
    [
      'exec',
      DB_CONTAINER,
      'psql',
      '-U',
      'ananya',
      '-d',
      'ananya',
      '-t',
      '-A',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `BEGIN READ ONLY; SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (${sqlText}) t; COMMIT;`,
    ],
    { encoding: 'utf8' },
  );
  // With a READ ONLY transaction + ON_ERROR_STOP, the only JSON line is the
  // aggregate result; ignore empty lines and BEGIN/COMMIT status lines.
  const jsonLine = out
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('['))
    .pop();
  return JSON.parse(jsonLine || '[]');
}

async function loadEngine() {
  const engine = await import(
    new URL('../../packages/inventory/dist/index.js', import.meta.url)
  );
  if (typeof engine.classifyLocationHierarchyRelationship !== 'function') {
    throw new Error(
      "The @ananya/inventory build does not export classifyLocationHierarchyRelationship. Run 'pnpm --filter @ananya/inventory build' first.",
    );
  }
  return engine;
}

export function runDiagnostic() {
  // Every parent/child relationship. Orphan roots (parent_id IS NULL) are not
  // relationships and are reported only as an informational count.
  const relationships = queryRows(`
    SELECT
      l.id            AS child_id,
      l.code          AS child_code,
      l.kind          AS child_kind,
      p.id            AS parent_id,
      p.code          AS parent_code,
      p.kind          AS parent_kind
    FROM locations l
    JOIN locations p ON p.id = l.parent_id
    ORDER BY p.kind, l.kind, l.code
  `);

  const [rootCount] = queryRows(
    'SELECT count(*)::int AS roots FROM locations WHERE parent_id IS NULL',
  );

  // Total location count (independent of any relationship).
  const [locationCount] = queryRows(
    'SELECT count(*)::int AS total FROM locations',
  );

  // Inventory ledger count, read only to prove this diagnostic mutates nothing.
  const [ledgerCount] = queryRows(
    'SELECT count(*)::int AS total FROM inventory_transactions',
  );

  // Container coverage (RFC-0069 Phase 1 — column is intentionally empty).
  const [containerCoverage] = queryRows(`
    SELECT
      count(*)::int                                                   AS total,
      count(*) FILTER (WHERE container_id IS NOT NULL)::int           AS populated,
      count(*) FILTER (WHERE container_id IS NULL)::int                AS missing,
      count(*) FILTER (WHERE container_id = id)::int                   AS self_reference
    FROM locations
  `);

  // Every container relationship, when any exists.
  const containerRelationships = queryRows(`
    SELECT
      l.id            AS child_id,
      l.code          AS child_code,
      l.kind          AS child_kind,
      c.id            AS container_id,
      c.code          AS container_code,
      c.kind          AS container_kind,
      c.is_active     AS container_is_active
    FROM locations l
    JOIN locations c ON c.id = l.container_id
    ORDER BY c.kind, l.kind, l.code
  `);

  // Dangling container references. The FK makes these impossible while the
  // constraint holds; reported explicitly so a dropped/deferred constraint or a
  // partially-applied migration is visible rather than silent.
  const danglingContainers = queryRows(`
    SELECT l.id AS child_id, l.code AS child_code, l.container_id AS missing_container_id
    FROM locations l
    LEFT JOIN locations c ON c.id = l.container_id
    WHERE l.container_id IS NOT NULL AND c.id IS NULL
    ORDER BY l.code
  `);

  return {
    relationships,
    rootCount: rootCount?.roots ?? 0,
    locationCount: locationCount?.total ?? 0,
    ledgerCount: ledgerCount?.total ?? 0,
    containerCoverage: containerCoverage ?? {
      total: 0,
      populated: 0,
      missing: 0,
      self_reference: 0,
    },
    containerRelationships,
    danglingContainers,
  };
}

/**
 * Wall-clock budget for the container cycle walk. A malformed graph is probed
 * with a hard step cap, expressed as a SQL `depth < N` guard, so the walk can
 * never run unbounded.
 */
const CONTAINER_CYCLE_MAX_DEPTH = 30;

function findContainerCycles() {
  return queryRows(`
    WITH RECURSIVE walk AS (
      SELECT
        id,
        container_id,
        code,
        0 AS depth,
        ARRAY[id] AS path,
        false AS is_cycle
      FROM locations
      WHERE container_id IS NULL

      UNION ALL

      SELECT
        l.id,
        l.container_id,
        l.code,
        w.depth + 1,
        w.path || l.id,
        l.id = ANY(w.path)
      FROM locations l
      JOIN walk w ON l.container_id = w.id
      WHERE w.depth < ${CONTAINER_CYCLE_MAX_DEPTH}
        AND NOT w.is_cycle
    )
    SELECT DISTINCT code AS cycle_code, depth
    FROM walk
    WHERE is_cycle
    ORDER BY code
  `);
}

export async function buildReport() {
  const engine = await loadEngine();
  const classify = engine.classifyLocationHierarchyRelationship;
  const {
    relationships,
    rootCount,
    locationCount,
    ledgerCount,
    containerCoverage,
    containerRelationships,
    danglingContainers,
  } = runDiagnostic();

  const classified = relationships.map((row) => {
    const result = classify(row.parent_kind, row.child_kind);
    return { ...row, ...result };
  });

  const violations = classified.filter((row) => row.violation);
  const legacy = classified.filter((row) => row.kind === 'legacy-compatible');
  const contextRoot = classified.filter((row) => row.kind === 'context-root');
  const canonical = classified.filter((row) => row.kind === 'canonical');

  // Group violations by kind pair for a compact summary.
  const byPair = new Map();
  for (const row of violations) {
    const key = `${row.parent_kind} → ${row.child_kind}`;
    byPair.set(key, (byPair.get(key) ?? 0) + 1);
  }

  // Container-side integrity (RFC-0069 Phase 1).
  const coveragePercent =
    containerCoverage.total > 0
      ? Math.round(
          (containerCoverage.populated / containerCoverage.total) * 10000,
        ) / 100
      : 0;

  const containerCycles = findContainerCycles();

  // A container relationship is physically invalid when the EXISTING canonical
  // classifier reports a violation for the (container.kind, child.kind) pair.
  // This deliberately reuses `classifyLocationHierarchyRelationship` rather than
  // introducing a second containment vocabulary or a Phase 2 predicate. It
  // accepts exactly the same three relationship kinds the audit already
  // recognizes: canonical, context-root, legacy-compatible.
  //
  // NOTE: RFC-0069 Phase 2 will introduce a stricter `canBePhysicalContainer`
  // that additionally requires the child to be a physical ROOT category (so a
  // bare `compartment` may not sit directly in a warehouse). That refinement is
  // intentionally NOT applied here; in Phase 1 `containerId` is unpopulated, so
  // this check is informational only.
  const invalidContainers = containerRelationships
    .map((row) => ({ row, verdict: classify(row.container_kind, row.child_kind) }))
    .filter(({ verdict }) => verdict.violation)
    .map(({ row, verdict }) => ({
      ...row,
      reason:
        verdict.reason ??
        `'${row.container_kind}' cannot physically contain '${row.child_kind}'`,
    }));

  const inactiveContainers = containerRelationships.filter(
    (row) => row.container_is_active === false,
  );

  return {
    totals: {
      locations: locationCount,
      ledgerRows: ledgerCount,
      relationships: relationships.length,
      roots: rootCount,
      canonical: canonical.length,
      contextRoot: contextRoot.length,
      legacyCompatible: legacy.length,
      violations: violations.length,
    },
    violationsByPair: [...byPair.entries()]
      .map(([pair, count]) => ({ pair, count }))
      .sort((a, b) => b.count - a.count || a.pair.localeCompare(b.pair)),
    violations,
    legacyCompatible: legacy,
    container: {
      total: containerCoverage.total,
      populated: containerCoverage.populated,
      missing: containerCoverage.missing,
      coveragePercent,
      selfReferences: containerCoverage.self_reference,
      relationships: containerRelationships.length,
      dangling: danglingContainers,
      invalid: invalidContainers,
      inactive: inactiveContainers,
      cycles: containerCycles,
    },
  };
}

async function main() {
  const report = await buildReport();

  const containerIssues =
    report.container.dangling.length +
    report.container.invalid.length +
    report.container.cycles.length +
    report.container.selfReferences;

  if (AS_JSON) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    // Exit non-zero when organizational violations OR container integrity issues
    // exist, so CI/reviewers can gate on the report.
    process.exitCode =
      report.totals.violations > 0 || containerIssues > 0 ? 1 : 0;
    return;
  }

  const line = (label, value) =>
    console.log(`  ${String(label).padEnd(32)}: ${value}`);

  console.log('\n================================================================');
  console.log('🔎 LOCATION HIERARCHY INTEGRITY (read-only)');
  console.log('================================================================');
  line('Locations', report.totals.locations);
  line('Ledger rows (unchanged)', report.totals.ledgerRows);

  console.log('\n📁 Organizational hierarchy (parentId)');
  line('Relationships scanned', report.totals.relationships);
  line('Top-level (parent_id NULL)', report.totals.roots);
  line('Canonical', report.totals.canonical);
  line('Context-root', report.totals.contextRoot);
  line('Legacy-compatible', report.totals.legacyCompatible);
  line('Violations', report.totals.violations);

  if (report.violationsByPair.length > 0) {
    console.log('\n⚠️  Violations by kind pair');
    for (const { pair, count } of report.violationsByPair) {
      line(pair, count);
    }
  }

  if (report.violations.length > 0) {
    console.log('\n❌ Violating relationships');
    for (const row of report.violations) {
      console.log(
        `  ${row.parent_code} (${row.parent_kind}) → ${row.child_code} (${row.child_kind})`,
      );
      console.log(`      reason: ${row.reason}`);
    }
  } else {
    console.log('\n✅ No hierarchy violations.');
  }

  if (report.legacyCompatible.length > 0) {
    console.log('\nℹ️  Documented legacy-compatible relationships (not violations)');
    for (const row of report.legacyCompatible) {
      console.log(
        `  ${row.parent_code} (${row.parent_kind}) → ${row.child_code} (${row.child_kind})`,
      );
    }
  }

  console.log('\n📦 Physical containment (containerId — RFC-0069 Phase 1)');
  line('Total locations', report.container.total);
  line('With containerId', report.container.populated);
  line('Without containerId', report.container.missing);
  line('Coverage', `${report.container.coveragePercent}%`);
  line('Container relationships', report.container.relationships);
  line('Missing references (dangling)', report.container.dangling.length);
  line('Invalid container relationships', report.container.invalid.length);
  line('Inactive containers', report.container.inactive.length);
  line('Self references', report.container.selfReferences);
  line('Container cycles', report.container.cycles.length);

  if (report.container.dangling.length > 0) {
    console.log('\n❌ Missing container references');
    for (const row of report.container.dangling) {
      console.log(
        `  ${row.child_code} → ${row.missing_container_id} (no such location)`,
      );
    }
  }

  if (report.container.invalid.length > 0) {
    console.log('\n❌ Invalid container relationships');
    for (const row of report.container.invalid) {
      console.log(
        `  ${row.container_code} (${row.container_kind}) → ${row.child_code} (${row.child_kind})`,
      );
      console.log(`      reason: ${row.reason}`);
    }
  }

  if (report.container.cycles.length > 0) {
    console.log('\n❌ Container cycles');
    for (const row of report.container.cycles) {
      console.log(`  ${row.cycle_code} (depth ${row.depth})`);
    }
  }

  if (
    report.container.populated === 0 &&
    containerIssues === 0
  ) {
    console.log(
      '\nℹ️  containerId is unpopulated (expected for Phase 1: schema only).',
    );
  }

  console.log(
    '\nNo data was modified. This diagnostic is strictly read-only.\n',
  );

  process.exitCode =
    report.totals.violations > 0 || containerIssues > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
});

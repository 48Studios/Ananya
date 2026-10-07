/**
 * RFC-0069 — physical-containment integrity verifier (READ-ONLY harness).
 *
 * Validates the persisted `containerId` graph against the canonical physical
 * containment rules and exits non-zero on any integrity failure. It NEVER
 * writes: every statement is a `SELECT` inside `BEGIN READ ONLY`.
 *
 * The rules live in the pure, unit-tested
 * `verifyPhysicalContainmentIntegrity` (`@ananya/inventory`); this script only
 * supplies read-only DB input and maps the report to an exit code.
 *
 * Usage:
 *   pnpm --filter @ananya/inventory build   # one-time
 *   node tools/spatial-integrity/verify-physical-containment.mjs
 *   # or: pnpm verify:physical-containment
 *
 * Optional env:
 *   ANANYA_DB_CONTAINER    postgres container name (default: ananya-db)
 *   ANANYA_VERIFY_JSON=1   emit the JSON report
 *   ANANYA_EXPECT_LEDGER=N assert the ledger row count equals N
 */
import { execFileSync } from 'node:child_process';

const DB_CONTAINER = process.env.ANANYA_DB_CONTAINER ?? 'ananya-db';
const AS_JSON = process.env.ANANYA_VERIFY_JSON === '1';
const EXPECT_LEDGER =
  process.env.ANANYA_EXPECT_LEDGER !== undefined
    ? Number(process.env.ANANYA_EXPECT_LEDGER)
    : undefined;

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
  const jsonLine = out
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('['))
    .pop();
  return JSON.parse(jsonLine || '[]');
}

async function loadVerifier() {
  const engine = await import(
    new URL('../../packages/inventory/dist/index.js', import.meta.url)
  );
  if (typeof engine.verifyPhysicalContainmentIntegrity !== 'function') {
    throw new Error(
      "The @ananya/inventory build does not export verifyPhysicalContainmentIntegrity. Run 'pnpm --filter @ananya/inventory build' first.",
    );
  }
  return engine.verifyPhysicalContainmentIntegrity;
}

export function readInputs() {
  const locations = queryRows(`
    SELECT id, code, kind, parent_id AS "parentId", container_id AS "containerId",
           is_active AS "isActive"
      FROM locations
     ORDER BY code
  `);
  const [counts] = queryRows(
    'SELECT (SELECT count(*)::int FROM inventory_transactions) AS ledger',
  );
  return { locations, ledger: counts?.ledger ?? 0 };
}

async function main() {
  const verify = await loadVerifier();
  const { locations, ledger } = readInputs();
  const report = verify(locations, {
    observedLedgerCount: ledger,
    expectedLedgerCount: EXPECT_LEDGER,
  });

  if (AS_JSON) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = report.ok ? 0 : 1;
    return;
  }

  const line = (label, value) =>
    console.log(`  ${String(label).padEnd(34)}: ${value}`);

  console.log('\n================================================================');
  console.log('🔒 PHYSICAL CONTAINMENT INTEGRITY (read-only)');
  console.log('================================================================');
  line('Locations', report.counts.locations);
  line('containerId populated', report.counts.populated);
  line('Distinct containers in use', report.counts.containers);
  line('Context-root relationships', report.counts.contextRootRelationships);
  line('Legacy-compatible relationships', report.counts.legacyCompatibleRelationships);
  line('Max container depth', report.counts.maxContainerDepth);
  line('Inventory ledger rows', ledger);

  if (report.legacyCompatible.length > 0) {
    console.log('\nℹ️  Documented legacy-compatible relationships (not failures)');
    for (const row of report.legacyCompatible) {
      console.log(`  ${row.containerCode} → ${row.childCode}  [${row.pair}]`);
    }
  }

  if (report.ok) {
    console.log('\n✅ INTEGRITY OK — no physical containment failures.');
  } else {
    console.log(`\n❌ INTEGRITY FAILED — ${report.errors.length} issue(s)`);
    for (const error of report.errors) {
      console.log(`  [${error.code}] ${error.locationCode}: ${error.message}`);
    }
  }

  console.log('\nNo data was modified. This verifier is read-only.\n');
  process.exitCode = report.ok ? 0 : 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
});
/**
 * RFC-0069 Phase 3A — physical-containment backfill PREVIEW (READ-ONLY).
 *
 * Computes the `containerId` value every location WOULD receive if the Phase 3
 * backfill ran, and validates that every proposal is safe. It NEVER writes:
 * every statement is a `SELECT` inside `BEGIN READ ONLY`, and no INSERT / UPDATE
 * / DELETE / TRUNCATE / ALTER / DROP is issued anywhere in this file.
 *
 * The proposal rules and the safety validation live in the pure, unit-tested
 * planner `planPhysicalContainerBackfill` (exported from `@ananya/inventory`),
 * loaded from the workspace build so the preview can never drift from the
 * canonical taxonomy or the application's classifier.
 *
 * ## Proposal rules (RFC-0069 §16 Phase 3)
 *   canonical         → containerId = parentId
 *   context-root      → containerId = parentId
 *   legacy-compatible → containerId = parentId   (preserves legacy tray → bin)
 *   violation         → containerId = NULL       (never repaired or guessed)
 *   parentId = NULL   → containerId = NULL       (no inferred facility ownership)
 *
 * Usage:
 *   pnpm --filter @ananya/inventory build   # one-time, if not already built
 *   node tools/spatial-integrity/preview-physical-container-backfill.mjs
 *
 * Optional env:
 *   ANANYA_DB_CONTAINER        postgres container name (default: ananya-db)
 *   ANANYA_BACKFILL_JSON=1     emit the full JSON plan (for determinism diffing)
 */
import { execFileSync } from 'node:child_process';

const DB_CONTAINER = process.env.ANANYA_DB_CONTAINER ?? 'ananya-db';
const AS_JSON = process.env.ANANYA_BACKFILL_JSON === '1';

/**
 * Runs a single read-only query, mirroring the hardened mechanism used by
 * `diagnose-location-hierarchy.mjs`: an explicit `BEGIN READ ONLY` transaction
 * (so PostgreSQL refuses any write), `ON_ERROR_STOP=1`, and an aggregate SELECT
 * wrapper so the emitted JSON is the only structured output.
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
  const jsonLine = out
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('['))
    .pop();
  return JSON.parse(jsonLine || '[]');
}

async function loadPlanner() {
  const engine = await import(
    new URL('../../packages/inventory/dist/index.js', import.meta.url)
  );
  if (typeof engine.planPhysicalContainerBackfill !== 'function') {
    throw new Error(
      "The @ananya/inventory build does not export planPhysicalContainerBackfill. Run 'pnpm --filter @ananya/inventory build' first.",
    );
  }
  return engine.planPhysicalContainerBackfill;
}

/** Reads the (read-only) inputs the planner needs. */
export function readInputs() {
  const locations = queryRows(`
    SELECT
      id,
      code,
      kind,
      parent_id   AS "parentId",
      container_id AS "containerId",
      is_active   AS "isActive"
    FROM locations
    ORDER BY code
  `);

  const [counts] = queryRows(`
    SELECT
      (SELECT count(*)::int FROM locations)               AS locations,
      (SELECT count(*)::int FROM inventory_transactions)  AS ledger,
      (SELECT count(*)::int FROM locations WHERE container_id IS NOT NULL) AS container_populated
  `);

  return {
    locations,
    counts: counts ?? { locations: 0, ledger: 0, container_populated: 0 },
  };
}

export async function buildPlan() {
  const plan = await loadPlanner();
  const { locations, counts } = readInputs();
  const result = plan(locations);
  return { counts, ...result };
}

async function main() {
  const { counts, proposals, summary, validation } = await buildPlan();

  if (AS_JSON) {
    process.stdout.write(
      `${JSON.stringify({ counts, summary, validation, proposals }, null, 2)}\n`,
    );
    process.exitCode = validation.safe ? 0 : 1;
    return;
  }

  const line = (label, value) =>
    console.log(`  ${String(label).padEnd(38)}: ${value}`);

  console.log('\n================================================================');
  console.log('🧪 PHYSICAL CONTAINMENT BACKFILL PREVIEW (read-only)');
  console.log('================================================================');
  line('Locations scanned', summary.locationsScanned);
  line('Relationships scanned (parentId)', summary.relationshipsScanned);
  line('Already populated containerId', summary.alreadyPopulated);

  console.log('\n📋 Proposal counts by classification');
  line('canonical', `${summary.canonical.count} (proposed ${summary.canonical.proposed})`);
  line('context-root', `${summary.contextRoot.count} (proposed ${summary.contextRoot.proposed})`);
  line('legacy-compatible', `${summary.legacyCompatible.count} (proposed ${summary.legacyCompatible.proposed})`);
  line('violations', `${summary.violations.count} (proposed NULL ${summary.violations.proposedNull})`);

  if (summary.violations.breakdown.length > 0) {
    console.log('\n⚠️  Violations by relationship');
    for (const { pair, count } of summary.violations.breakdown) {
      line(pair, count);
    }
  }

  console.log('\n🧮 Totals');
  line('Proposed non-null containerId assignments', summary.proposedAssignments);
  line('Proposed NULL (violations)', summary.proposedNull);
  line('Intentionally left NULL (unparented + violations)', summary.unchangedNull);

  console.log('\n🔐 Safety validation');
  if (validation.safe) {
    console.log('  ✅ SAFE — every proposal exists, is active, satisfies');
    console.log('     canBePhysicalContainer (or is a documented legacy pair),');
    console.log('     is not self-referential, and forms no container cycle.');
  } else {
    console.log(`  ❌ UNSAFE — ${validation.issues.length} issue(s)`);
    for (const issue of validation.issues) {
      console.log(`     [${issue.code}] ${issue.childCode}: ${issue.message}`);
    }
  }

  console.log('\n📄 Proposed assignments (child → container)');
  if (proposals.length === 0) {
    console.log('  (none)');
  } else {
    for (const p of proposals) {
      const target =
        p.proposedContainerId === null
          ? 'NULL'
          : `${p.parentCode} (${p.parentKind})`;
      console.log(
        `  ${p.childCode} (${p.childKind}) → ${target}  [${p.classification}]`,
      );
    }
  }

  console.log(
    `\nNo data was modified. PostgreSQL count: locations=${counts.locations}, ` +
      `ledger=${counts.ledger}, containerId populated=${counts.container_populated}.\n`,
  );

  process.exitCode = validation.safe ? 0 : 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
});
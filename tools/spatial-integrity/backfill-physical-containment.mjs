/**
 * RFC-0069 Phase 3B — physical-containment backfill (guarded, transactional).
 *
 * Writes `locations.container_id = locations.parent_id` for EXACTLY the
 * relationships the Phase 3A planner approves (canonical / context-root /
 * legacy-compatible). Violations and unparented rows are never written.
 *
 * The planner (`planPhysicalContainerBackfill` from `@ananya/inventory`) is the
 * SOLE authority — this script never re-implements the decision logic.
 *
 * ## Safety model
 *   - A count guard must pass BEFORE any write. It requires the approved counts
 *     (canonical 132, context-root 7, legacy-compatible 12, assignments 151,
 *     violations 18, unparented 101). Any mismatch aborts with no write.
 *   - The mutation runs inside ONE transaction. Fingerprints of the parentId
 *     graph, location kinds, ledger and spatial tables are captured before the
 *     write and asserted identical after it.
 *   - If ANY post-write assertion fails the transaction is ROLLED BACK. A
 *     partial backfill is never committed.
 *   - Idempotent: rows already carrying the approved containerId are not
 *     rewritten; a second run performs zero updates.
 *
 * ## Usage
 *   pnpm --filter @ananya/inventory build   # one-time
 *   pnpm backfill:physical-containment                    # dry run (default)
 *   pnpm backfill:physical-containment -- --execute       # perform the backfill
 *   pnpm backfill:physical-containment -- --execute --expect-unparented=103
 *
 * Override any guard with `--expect-<key>=<n>` where key ∈
 * {assignments, violations, canonical, context-root, legacy-compatible, unparented}.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');

const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const REPORT_PATH =
  (args.find((arg) => arg.startsWith('--report=')) ?? '').split('=')[1] ||
  process.env.ANANYA_BACKFILL_REPORT ||
  null;
const PRINT_ASSIGNMENTS =
  args.includes('--print-assignments') || process.env.ANANYA_BACKFILL_PRINT === '1';

const APPROVED = {
  assignments: 151,
  violations: 18,
  canonical: 132,
  'context-root': 7,
  'legacy-compatible': 12,
  unparented: 101,
};

// Allow `--expect-<key>=<n>` overrides for every guard.
const EXPECTED = { ...APPROVED };
for (const arg of args) {
  const match = arg.match(/^--expect-([a-z-]+)=(\d+)$/);
  if (match && match[1] in EXPECTED) {
    EXPECTED[match[1]] = Number(match[2]);
  }
}

function connectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  // Fall back to the repository .env (the root script passes --env-file-if-exists).
  try {
    const raw = readFileSync(new URL('../../.env', import.meta.url), 'utf8');
    const line = raw.split('\n').find((l) => l.startsWith('DATABASE_URL='));
    if (line) return line.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, '');
  } catch {
    // handled below
  }
  throw new Error(
    'DATABASE_URL is not set. Run with the root script (which loads .env) or export it.',
  );
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
  if (typeof engine.evaluateBackfillGuard !== 'function') {
    throw new Error(
      "The @ananya/inventory build does not export evaluateBackfillGuard. Run 'pnpm --filter @ananya/inventory build' first.",
    );
  }
  return {
    plan: engine.planPhysicalContainerBackfill,
    guard: engine.evaluateBackfillGuard,
  };
}

/** Read-only: the exact rows the planner consumes. */
async function readLocations(client) {
  const { rows } = await client.query(
    `SELECT id, code, kind, parent_id AS "parentId", container_id AS "containerId",
            is_active AS "isActive"
       FROM locations
      ORDER BY code`,
  );
  return rows;
}

/**
 * Content fingerprints proving nothing outside `container_id` changed.
 * `md5(string_agg(... order by id))` is order-independent of physical row order
 * and captures every value, so any edit changes the hash.
 */
async function fingerprint(client) {
  const { rows } = await client.query(`
    SELECT
      (SELECT count(*)::int FROM locations) AS locations,
      (SELECT count(*)::int FROM locations WHERE parent_id IS NULL) AS unparented,
      (SELECT count(*)::int FROM locations WHERE container_id IS NOT NULL) AS populated,
      (SELECT md5(string_agg(id::text || ':' || coalesce(parent_id::text, '~'), ',' ORDER BY id)) FROM locations) AS parent_fp,
      (SELECT md5(string_agg(id::text || ':' || kind, ',' ORDER BY id)) FROM locations) AS kind_fp,
      (SELECT md5(string_agg(id::text || ':' || code || ':' || name, ',' ORDER BY id)) FROM locations) AS identity_fp,
      (SELECT count(*)::int FROM inventory_transactions) AS ledger_count,
      (SELECT md5(string_agg(id::text, ',' ORDER BY id)) FROM inventory_transactions) AS ledger_fp,
      (SELECT count(*)::int FROM spatial_layouts) AS layouts,
      (SELECT count(*)::int FROM spatial_layout_mappings) AS mappings,
      (SELECT count(*)::int FROM spatial_nodes) AS nodes,
      (SELECT md5(string_agg(id::text || ':' || status || ':' || revision, ',' ORDER BY id)) FROM spatial_layouts) AS layouts_fp,
      (SELECT md5(string_agg(id::text || ':' || layout_id::text || ':' || slot_id || ':' || location_id::text, ',' ORDER BY id)) FROM spatial_layout_mappings) AS mappings_fp,
      (SELECT md5(string_agg(id::text || ':' || location_id::text || ':' || coalesce(parent_spatial_node_id::text, '~'), ',' ORDER BY id)) FROM spatial_nodes) AS nodes_fp
  `);
  return rows[0];
}

function evaluateGuard(summary, evaluateBackfillGuard) {
  const expected = {
    assignments: EXPECTED.assignments,
    violations: EXPECTED.violations,
    canonical: EXPECTED.canonical,
    contextRoot: EXPECTED['context-root'],
    legacyCompatible: EXPECTED['legacy-compatible'],
    unparented: EXPECTED.unparented,
  };
  const result = evaluateBackfillGuard(summary, expected);
  const renameKey = (key) =>
    key === 'contextRoot'
      ? 'context-root'
      : key === 'legacyCompatible'
        ? 'legacy-compatible'
        : key;
  return {
    // Present the actual counts under the CLI-facing key names.
    actual: {
      assignments: result.actual.assignments,
      violations: result.actual.violations,
      canonical: result.actual.canonical,
      'context-root': result.actual.contextRoot,
      'legacy-compatible': result.actual.legacyCompatible,
      unparented: result.actual.unparented,
    },
    mismatches: result.mismatches.map((m) => ({
      key: renameKey(m.key),
      expected: m.expected,
      actual: m.actual,
    })),
    ok: result.ok,
  };
}

/** Post-write assertions; throws to trigger ROLLBACK. */
async function assertPostWrite(client, plan, before, approvedByChild) {
  const fail = (message) => {
    throw new Error(`POST-WRITE ASSERTION FAILED: ${message}`);
  };

  const after = await fingerprint(client);

  // Population.
  const expectedPopulated = approvedByChild.size;
  if (after.populated !== expectedPopulated) {
    fail(`populated=${after.populated}, expected ${expectedPopulated}`);
  }

  // Assignment identity: every approved child has container_id = parent_id, and
  // no other row is populated.
  const { rows: assignmentRows } = await client.query(`
    SELECT id, container_id, parent_id FROM locations WHERE container_id IS NOT NULL
  `);
  for (const row of assignmentRows) {
    const approved = approvedByChild.get(row.id);
    if (approved === undefined) fail(`unexpected populated row ${row.id}`);
    if (row.container_id !== approved) fail(`row ${row.id} container_id mismatch`);
    if (row.container_id !== row.parent_id) fail(`row ${row.id} container_id != parent_id`);
  }
  if (assignmentRows.length !== expectedPopulated) {
    fail('populated row count does not match the approved assignment set');
  }

  // Violations remain NULL.
  for (const proposal of plan.proposals) {
    if (proposal.classification !== 'violation') continue;
    const { rows } = await client.query(
      `SELECT container_id FROM locations WHERE id = $1`,
      [proposal.childId],
    );
    if (rows[0]?.container_id !== null) {
      fail(`violation row ${proposal.childCode} was populated`);
    }
  }

  // Unparented remain NULL (never infer a container).
  const { rows: orphanNonNull } = await client.query(
    `SELECT count(*)::int AS n FROM locations WHERE parent_id IS NULL AND container_id IS NOT NULL`,
  );
  if (orphanNonNull[0].n !== 0) fail('an unparented location was given a container');

  // parentId graph, identity, kinds unchanged.
  if (after.parent_fp !== before.parent_fp) fail('parent_id graph changed');
  if (after.kind_fp !== before.kind_fp) fail('location kinds changed');
  if (after.identity_fp !== before.identity_fp) fail('location identity changed');
  if (after.locations !== before.locations) fail('location count changed');
  if (after.unparented !== before.unparented) fail('unparented count changed');

  // Ledger unchanged.
  if (after.ledger_count !== before.ledger_count) fail('ledger row count changed');
  if (after.ledger_fp !== before.ledger_fp) fail('ledger content changed');

  // Spatial tables unchanged.
  if (after.layouts !== before.layouts) fail('spatial_layouts count changed');
  if (after.mappings !== before.mappings) fail('spatial_layout_mappings count changed');
  if (after.nodes !== before.nodes) fail('spatial_nodes count changed');
  if (after.layouts_fp !== before.layouts_fp) fail('spatial_layouts content changed');
  if (after.mappings_fp !== before.mappings_fp) fail('spatial_layout_mappings content changed');
  if (after.nodes_fp !== before.nodes_fp) fail('spatial_nodes content changed');

  // Physical validity: no self-container, no cycle, no missing/inactive container.
  const { rows: invalid } = await client.query(`
    WITH RECURSIVE walk AS (
      SELECT id, container_id, ARRAY[id] AS path, false AS cy
        FROM locations WHERE container_id IS NULL
      UNION ALL
      SELECT l.id, l.container_id, w.path || l.id, l.id = ANY(w.path)
        FROM locations l JOIN walk w ON l.container_id = w.id
       WHERE array_length(w.path, 1) < 30 AND NOT w.cy
    )
    SELECT
      (SELECT count(*)::int FROM locations WHERE container_id = id) AS self_refs,
      (SELECT count(*)::int FROM walk WHERE cy) AS cycles,
      (SELECT count(*)::int FROM locations l
         LEFT JOIN locations c ON c.id = l.container_id
        WHERE l.container_id IS NOT NULL AND c.id IS NULL) AS dangling,
      (SELECT count(*)::int FROM locations l JOIN locations c ON c.id = l.container_id
        WHERE NOT c.is_active) AS inactive
  `);
  const v = invalid[0];
  if (v.self_refs !== 0) fail('self-referencing container present');
  if (v.cycles !== 0) fail('container cycle present');
  if (v.dangling !== 0) fail('dangling container reference present');
  if (v.inactive !== 0) fail('inactive container present');

  return after;
}

/**
 * Builds the deterministic, auditable report of the CURRENT plan (Phase 3B
 * Task 2). Contains every field a reviewer needs to approve or reject the run
 * BEFORE any write, plus the exact parent/child ids and codes for every proposed
 * assignment.
 */
function buildAuditReport({ before, summary, proposals, validation, approvedByChild, guard }) {
  return {
    generatedAt: new Date().toISOString(),
    mode: EXECUTE ? 'EXECUTE' : 'DRY_RUN',
    current: {
      locationCount: before.locations,
      containerIdPopulated: before.populated,
      unparented: before.unparented,
    },
    plan: {
      locationsScanned: summary.locationsScanned,
      relationshipsScanned: summary.relationshipsScanned,
      proposedAssignments: summary.proposedAssignments,
      canonical: summary.canonical.count,
      contextRoot: summary.contextRoot.count,
      legacyCompatible: summary.legacyCompatible.count,
      violations: summary.violations.count,
      unparented: summary.unparented,
      violationsByRelationship: summary.violations.breakdown,
    },
    guard: {
      ok: guard.ok,
      expected: EXPECTED,
      actual: guard.actual,
      mismatches: guard.mismatches,
    },
    plannerSafe: validation.safe,
    plannerIssues: validation.issues,
    assignments: proposals.map((p) => ({
      childId: p.childId,
      childCode: p.childCode,
      childKind: p.childKind,
      parentId: p.parentId,
      parentCode: p.parentCode,
      parentKind: p.parentKind,
      classification: p.classification,
      proposedContainerId: p.proposedContainerId,
      reason: p.reason,
    })),
    executionSetSize: approvedByChild.size,
  };
}

async function run() {
  const { plan: planBackfill, guard: evaluateBackfillGuard } =
    await loadPlanner();
  const pool = new Pool({ connectionString: connectionString() });
  const client = await pool.connect();

  try {
    const locations = await readLocations(client);
    const result = planBackfill(locations);
    const { proposals, summary, validation } = result;

    console.log('\n================================================================');
    console.log('🏗️  PHYSICAL CONTAINMENT BACKFILL');
    console.log('================================================================');
    console.log(`  Mode                          : ${EXECUTE ? 'EXECUTE' : 'DRY RUN'}`);
    console.log(`  Planner safe                  : ${validation.safe}`);
    console.log(`  Locations scanned             : ${summary.locationsScanned}`);
    console.log(`  Relationships scanned         : ${summary.relationshipsScanned}`);
    console.log(`  canonical                     : ${summary.canonical.count}`);
    console.log(`  context-root                  : ${summary.contextRoot.count}`);
    console.log(`  legacy-compatible             : ${summary.legacyCompatible.count}`);
    console.log(`  violations                    : ${summary.violations.count}`);
    console.log(`  unparented                    : ${summary.unparented}`);
    console.log(`  PROPOSED ASSIGNMENTS          : ${summary.proposedAssignments}`);

    if (!validation.safe) {
      console.error('\n❌ Planner is UNSAFE. Refusing to write.');
      for (const issue of validation.issues) {
        console.error(`   [${issue.code}] ${issue.childCode}: ${issue.message}`);
      }
      process.exitCode = 1;
      return;
    }

    const guard = evaluateGuard(summary, evaluateBackfillGuard);
    console.log('\n🔎 Approved-count guard');
    for (const key of Object.keys(EXPECTED)) {
      const mark = guard.actual[key] === EXPECTED[key] ? '✅' : '❌';
      console.log(
        `  ${mark} ${key.padEnd(20)} expected ${EXPECTED[key]}  actual ${guard.actual[key]}`,
      );
    }

    if (!guard.ok) {
      console.error(
        '\n⛔ STOP — count guard failed. Nothing was written.',
      );
      for (const m of guard.mismatches) {
        console.error(`   ${m.key}: expected ${m.expected}, got ${m.actual}`);
      }
      console.error(
        '\n   The Phase 3A preview was run at a database state whose counts matched\n' +
          '   the approved plan. The live database no longer reproduces them: it has\n' +
          '   been reset, reseeded, or diverged since approval. Restore the approved\n' +
          '   DB state, or explicitly re-approve the counts via --expect-<key>=<n>.',
      );
      process.exitCode = 1;
      return;
    }

    // Approved mutation target set: exactly the non-null proposals.
    const approvedByChild = new Map();
    for (const proposal of proposals) {
      if (proposal.proposedContainerId !== null) {
        approvedByChild.set(proposal.childId, proposal.proposedContainerId);
      }
    }
    if (approvedByChild.size !== EXPECTED.assignments) {
      console.error(
        `\n⛔ STOP — approved assignment set is ${approvedByChild.size}, expected ${EXPECTED.assignments}.`,
      );
      process.exitCode = 1;
      return;
    }

    // Planner output and execution set must be IDENTICAL (Phase 3B Task 1):
    // every planner proposal is either an assignment or an intentional NULL.
    const plannerNonNull = proposals.filter(
      (p) => p.proposedContainerId !== null,
    ).length;
    if (plannerNonNull !== approvedByChild.size) {
      console.error(
        `\n⛔ STOP — planner produced ${plannerNonNull} assignments but the execution set has ${approvedByChild.size}.`,
      );
      process.exitCode = 1;
      return;
    }

    // Auditable pre-write report (Phase 3B Task 2).
    const before = await fingerprint(client);
    const audit = buildAuditReport({
      before,
      summary,
      proposals,
      validation,
      approvedByChild,
      guard,
    });

    if (REPORT_PATH) {
      writeFileSync(REPORT_PATH, `${JSON.stringify(audit, null, 2)}\n`);
      console.log(`\n📄 Audit report written to ${REPORT_PATH}`);
    }

    if (PRINT_ASSIGNMENTS) {
      console.log('\n📄 Proposed assignments (child → container)');
      for (const a of audit.assignments) {
        const target =
          a.proposedContainerId === null
            ? 'NULL'
            : `${a.parentCode} (${a.parentKind})`;
        console.log(
          `  ${a.childCode} (${a.childKind}) → ${target}  [${a.classification}]`,
        );
      }
    }

    if (!EXECUTE) {
      console.log(
        `\n✅ DRY RUN complete. Would update ${approvedByChild.size} rows inside one transaction.\n` +
          '   Re-run with -- --execute to perform the backfill.\n',
      );
      process.exitCode = 0;
      return;
    }

    // ------------------------------------------------------------------ WRITE
    await client.query('BEGIN');
    try {
      let updated = 0;
      for (const [childId, containerId] of approvedByChild) {
        const res = await client.query(
          `UPDATE locations
              SET container_id = $1, updated_at = now()
            WHERE id = $2 AND container_id IS DISTINCT FROM $1`,
          [containerId, childId],
        );
        updated += res.rowCount;
      }
      // Skipped = rows already carrying the approved value (idempotent re-run).
      const skipped = approvedByChild.size - updated;

      const after = await assertPostWrite(client, result, before, approvedByChild);

      await client.query('COMMIT');

      console.log('\n================================================================');
      console.log('✅ BACKFILL COMMITTED');
      console.log('================================================================');
      console.log(`  rows updated                  : ${updated}`);
      console.log(`  rows skipped (already set)    : ${skipped}`);
      console.log(`  rows rejected                 : 0`);
      console.log(`  containerId populated         : ${after.populated}`);
      console.log(
        `  violations left NULL          : ${summary.violations.count}`,
      );
      console.log(
        `  unparented left NULL          : ${summary.unparented}`,
      );
      console.log(`  final validation              : PASS`);
      process.exitCode = 0;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`\n❌ ${error instanceof Error ? error.message : error}`);
      console.error('   Transaction ROLLED BACK — no partial backfill was committed.');
      process.exitCode = 1;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
});
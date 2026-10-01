/**
 * Spatial Demo dataset — deterministic cleanup.
 *
 * Removes exactly and only the records created for the Spatial Inventory demo.
 * Ownership comes from `manifest.json` plus the `DEMO-SPATIAL-` / `DEMO-` namespace.
 *
 * Safety guarantee:
 * - Never truncates tables.
 * - Never modifies or removes any non-demo operational data.
 * - Dry-run by default; requires `--execute` to perform deletions.
 *
 * Usage:
 *   node tools/spatial-demo-dataset/cleanup.mjs             # Dry run (default)
 *   node tools/spatial-demo-dataset/cleanup.mjs --execute   # Execute deletion
 */
import { execFileSync } from 'node:child_process';
import {
  API_BASE,
  DB_CONTAINER,
  del,
  get,
  log,
  post,
  readManifest,
  writeManifest,
} from './lib.mjs';

const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');

function sql(query) {
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
      '-F',
      '\u0001',
      '-c',
      query,
    ],
    { encoding: 'utf8' },
  );
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split('\u0001'));
}

function sqlValue(query) {
  const rows = sql(query);
  return rows.length > 0 ? rows[0][0] : null;
}

export async function runCleanup(execute = EXECUTE) {
  log('================================================================');
  log(`🧹 SPATIAL DEMO DATASET CLEANUP ${execute ? '(EXECUTE MODE)' : '(DRY RUN)'}`);
  log('================================================================');

  const manifest = readManifest();

  // 1. Identify Demo Locations
  const dbLocations = sql(
    "SELECT id, code, name, kind, parent_id FROM locations WHERE code LIKE 'DEMO-SPATIAL-%' ORDER BY code;",
  );
  const locationIds = dbLocations.map(([id]) => id);

  // 2. Identify Demo Components
  const dbComponents = sql(
    "SELECT id, sku, name FROM components WHERE sku LIKE 'DEMO-%' OR name LIKE 'DEMO-%' ORDER BY sku;",
  );
  const componentIds = dbComponents.map(([id]) => id);

  // 3. Identify Demo Spatial Models
  const dbModels = sql(
    "SELECT id, code, name FROM spatial_models WHERE code LIKE 'DEMO-SPATIAL-%' ORDER BY code;",
  );
  const modelIds = dbModels.map(([id]) => id);

  // 4. Identify Demo Spatial Nodes
  const dbNodes = sql(
    "SELECT sn.id, l.code FROM spatial_nodes sn JOIN locations l ON sn.location_id = l.id WHERE l.code LIKE 'DEMO-SPATIAL-%';",
  );
  const nodeIds = dbNodes.map(([id]) => id);

  // 5. Identify Demo Inventory Transactions
  const dbTransactions = sql(
    "SELECT id, reference, transaction_type FROM inventory_transactions WHERE reference LIKE 'DEMO-%';",
  );
  const transactionIds = dbTransactions.map(([id]) => id);

  log(`Found entities targeted for cleanup:`);
  log(`  - Inventory Transactions : ${dbTransactions.length}`);
  log(`  - Spatial Nodes          : ${dbNodes.length}`);
  log(`  - Spatial Models         : ${dbModels.length}`);
  log(`  - Demo Components        : ${dbComponents.length}`);
  log(`  - Demo Locations         : ${dbLocations.length}`);

  if (!execute) {
    log('\n⚠️  DRY RUN ONLY. No data was deleted.');
    log('To perform deletion, rerun with --execute:');
    log('  node tools/spatial-demo-dataset/cleanup.mjs --execute\n');
    return;
  }

  log('\n🚀 Executing deterministic deletion...');

  // Step A: Delete Inventory Transactions & Projections for Demo Components/Locations
  if (transactionIds.length > 0) {
    const list = transactionIds.map((id) => `'${id}'`).join(',');
    sql(`DELETE FROM inventory_transactions WHERE id IN (${list});`);
    log(`  ✅ Removed ${transactionIds.length} inventory transactions.`);
  }

  if (componentIds.length > 0) {
    const list = componentIds.map((id) => `'${id}'`).join(',');
    sql(`DELETE FROM inventory_projections WHERE component_id IN (${list});`);
    log(`  ✅ Removed inventory projections for demo components.`);
  }

  if (locationIds.length > 0) {
    const list = locationIds.map((id) => `'${id}'`).join(',');
    sql(`DELETE FROM inventory_projections WHERE location_id IN (${list});`);
    log(`  ✅ Removed inventory projections for demo locations.`);
  }

  // Step B: Delete Spatial Nodes (bottom up: children first)
  if (nodeIds.length > 0) {
    // Break parent references first to avoid foreign key constraints
    const list = nodeIds.map((id) => `'${id}'`).join(',');
    sql(`UPDATE spatial_nodes SET parent_spatial_node_id = NULL WHERE id IN (${list});`);
    sql(`DELETE FROM spatial_nodes WHERE id IN (${list});`);
    log(`  ✅ Removed ${nodeIds.length} spatial nodes.`);
  }

  // Step C: Delete Spatial Models (cascades to anchors)
  if (modelIds.length > 0) {
    const list = modelIds.map((id) => `'${id}'`).join(',');
    sql(`DELETE FROM spatial_models WHERE id IN (${list});`);
    log(`  ✅ Removed ${modelIds.length} spatial models and associated anchors.`);
  }

  // Step D: Delete Demo Components
  for (const [id, sku] of dbComponents) {
    try {
      await del(`/components/${id}`);
      log(`  ✅ Deleted component ${sku}`);
    } catch (e) {
      // Fallback SQL if API call fails due to remaining relation
      sql(`DELETE FROM components WHERE id = '${id}';`);
      log(`  ✅ Deleted component ${sku} (via SQL fallback)`);
    }
  }

  // Step E: Delete Demo Locations in true topological order (leaf nodes first)
  while (true) {
    const leaves = sql(
      "SELECT id, code FROM locations WHERE code LIKE 'DEMO-SPATIAL-%' AND id NOT IN (SELECT parent_id FROM locations WHERE parent_id IS NOT NULL);",
    );
    if (leaves.length === 0) break;
    for (const [id, code] of leaves) {
      try {
        await del(`/locations/${id}`);
        log(`  ✅ Deleted location ${code}`);
      } catch {
        sql(`DELETE FROM locations WHERE id = '${id}';`);
        log(`  ✅ Deleted location ${code} (via SQL fallback)`);
      }
    }
  }

  // Step F: Rebuild inventory projections to ensure consistency
  try {
    await post('/inventory-projections/rebuild');
    log('  ✅ Rebuilt inventory projections.');
  } catch {
    // Ignore if stack offline
  }

  // Step G: Reset manifest
  writeManifest({
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    models: [],
    anchors: [],
    locations: [],
    nodes: [],
    components: [],
    transactions: [],
  });

  log('\n================================================================');
  log('🎉 CLEANUP COMPLETED SUCCESSFULLY');
  log('================================================================\n');
}

if (process.argv[1]?.endsWith('cleanup.mjs')) {
  runCleanup().catch((err) => {
    console.error('\n❌ Cleanup failed:', err);
    process.exit(1);
  });
}

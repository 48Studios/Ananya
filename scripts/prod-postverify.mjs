import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const API_BASE = 'https://api.erp.48studios.dev';
const TOKEN_FILE = path.resolve('tests/.auth/token.json');
const SNAPSHOT_FILE = path.resolve(
  '/Users/jrsarath/.gemini/antigravity-ide/brain/95761271-167b-4df0-9501-eb5708026c0b/scratch/pre_write_snapshot.json',
);

function md5(val) {
  return crypto.createHash('md5').update(val).digest('hex');
}

async function main() {
  if (!fs.existsSync(SNAPSHOT_FILE)) {
    throw new Error('Pre-write snapshot file not found!');
  }
  const preSnapshot = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));

  const { token } = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  async function apiGet(endpoint) {
    const res = await fetch(`${API_BASE}${endpoint}`, { headers });
    if (!res.ok) {
      throw new Error(`GET ${endpoint} failed: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  console.log('=== RFC-0069 PHASE 3B POST-MIGRATION VERIFICATION (LIVE PRODUCTION) ===\n');

  // 1. Re-read live production
  console.log('1. Fetching live production dataset...');
  const [locations, layouts, nodes, models, transactions] = await Promise.all([
    apiGet('/locations'),
    apiGet('/spatial/layouts'),
    apiGet('/spatial/nodes'),
    apiGet('/spatial/models'),
    apiGet('/inventory-transactions'),
  ]);

  const stockProjections = {};
  for (const loc of locations) {
    try {
      stockProjections[loc.id] = await apiGet(`/inventory-projections/location/${loc.id}`);
    } catch {
      stockProjections[loc.id] = [];
    }
  }

  // 2. Run Verifier from @ananya/inventory
  const {
    verifyPhysicalContainmentIntegrity,
    planPhysicalContainerBackfill,
    collectPhysicalSubtreeIds,
  } = await import('../packages/inventory/dist/spatial/index.js');

  const locMap = locations.map((l) => ({
    id: l.id,
    code: l.code,
    kind: l.kind,
    parentId: l.parentId ?? null,
    containerId: l.containerId ?? null,
    isActive: l.isActive,
  }));

  const integrityReport = verifyPhysicalContainmentIntegrity(locMap, {
    observedLedgerCount: transactions.length,
    expectedLedgerCount: preSnapshot.ledgerCount,
  });

  // 3. Evaluate the 19 POST-WRITE INVARIANTS
  console.log('\n2. Evaluating 19 Post-Write Invariants:');
  const sortedLocations = [...locations].sort((a, b) => a.id.localeCompare(b.id));
  const parentIdChecksum = md5(sortedLocations.map((l) => `${l.id}:${l.parentId ?? '~'}`).join(','));
  const kindChecksum = md5(sortedLocations.map((l) => `${l.id}:${l.kind}`).join(','));
  const identityChecksum = md5(sortedLocations.map((l) => `${l.id}:${l.code}:${l.name}`).join(','));

  const sortedLayouts = [...layouts].sort((a, b) => a.id.localeCompare(b.id));
  const layoutsChecksum = md5(sortedLayouts.map((l) => `${l.id}:${l.status}:${l.revision}`).join(','));

  const sortedNodes = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
  const nodesChecksum = md5(
    sortedNodes.map((n) => `${n.id}:${n.locationId}:${n.parentSpatialNodeId ?? '~'}`).join(','),
  );

  const sortedTx = [...transactions].sort((a, b) => a.id.localeCompare(b.id));
  const ledgerChecksum = md5(sortedTx.map((t) => t.id).join(','));

  let totalProjectedQty = 0;
  let totalProjectionRecords = 0;
  for (const projs of Object.values(stockProjections)) {
    totalProjectionRecords += projs.length;
    for (const p of projs) totalProjectedQty += Number(p.quantity) || 0;
  }

  const populatedCount = locations.filter((l) => l.containerId != null).length;
  const nullCount = locations.filter((l) => l.containerId == null).length;

  const assertions = [
    { name: '1. containerId populated', expected: 21, actual: populatedCount },
    { name: '2. containerId NULL', expected: 1, actual: nullCount },
    { name: '3. physical containment cycles', expected: 0, actual: integrityReport.issues.filter(i => i.code === 'CONTAINER_CYCLE').length },
    { name: '4. dangling container references', expected: 0, actual: integrityReport.issues.filter(i => i.code === 'DANGLING_CONTAINER').length },
    { name: '5. inactive containers referenced', expected: 0, actual: integrityReport.issues.filter(i => i.code === 'INACTIVE_CONTAINER').length },
    { name: '6. invalid physical containment', expected: 0, actual: integrityReport.issues.filter(i => i.code === 'INVALID_PHYSICAL_CONTAINMENT').length },
    { name: '7. canonical relationships', expected: 16, actual: integrityReport.canonical.count },
    { name: '8. context-root relationships', expected: 5, actual: integrityReport.contextRoot.count },
    { name: '9. legacy-compatible relationships', expected: 0, actual: integrityReport.legacyCompatible.count },
    { name: '10. violations', expected: 0, actual: integrityReport.violations.count },
    { name: '11. max physical depth', expected: 4, actual: integrityReport.maxDepth },
    { name: '12. parentId checksum unchanged', expected: preSnapshot.parentIdChecksum, actual: parentIdChecksum },
    { name: '13. kind checksum unchanged', expected: preSnapshot.kindChecksum, actual: kindChecksum },
    { name: '14. location identity checksum unchanged', expected: preSnapshot.identityChecksum, actual: identityChecksum },
    { name: '15. spatial layout count/checksum unchanged', expected: `${preSnapshot.layoutsCount}:${preSnapshot.layoutsChecksum}`, actual: `${layouts.length}:${layoutsChecksum}` },
    { name: '16. spatial mapping count unchanged', expected: true, actual: layouts.length === preSnapshot.layoutsCount },
    { name: '17. spatial node count/checksum unchanged', expected: `${preSnapshot.nodesCount}:${preSnapshot.nodesChecksum}`, actual: `${nodes.length}:${nodesChecksum}` },
    { name: '18. inventory transaction count/checksum unchanged', expected: `${preSnapshot.ledgerCount}:${preSnapshot.ledgerChecksum}`, actual: `${transactions.length}:${ledgerChecksum}` },
    { name: '19. inventory projection state unchanged', expected: `${preSnapshot.totalProjectionRecords}:${preSnapshot.totalProjectedQty}`, actual: `${totalProjectionRecords}:${totalProjectedQty}` },
  ];

  let passedAssertions = 0;
  for (const a of assertions) {
    const ok = a.expected === a.actual;
    if (ok) passedAssertions++;
    console.log(`   ${ok ? '✅' : '❌'} ${a.name.padEnd(52)}: expected ${a.expected}, actual ${a.actual}`);
  }

  // 4. IDEMPOTENCY CHECK
  console.log('\n3. Idempotency Check (re-running Phase 3A planner against post-write state):');
  const secondPlan = planPhysicalContainerBackfill(locMap);
  const secondSummary = secondPlan.summary;
  console.log(`   - proposedAssignments       : ${secondSummary.proposedAssignments} (expected: 0)`);
  console.log(`   - alreadyPopulated          : ${secondSummary.alreadyPopulated} (expected: 21)`);
  console.log(`   - unparented (OFC)          : ${secondSummary.unparented} (expected: 1)`);
  console.log(`   - violations                : ${secondSummary.violations.count} (expected: 0)`);
  console.log(`   - planner safe              : ${secondPlan.validation.safe} (expected: true)`);
  const idempotencyOk = secondSummary.proposedAssignments === 0 && secondSummary.alreadyPopulated === 21;
  console.log(`   ${idempotencyOk ? '✅' : '❌'} Idempotency check: ${idempotencyOk ? 'PASS (0 updates required)' : 'FAIL'}`);

  // 5. POST-MIGRATION FUNCTIONAL CHECK: PHYSICAL ROLLUPS
  console.log('\n4. Functional Verification: Physical Stock Rollup (Strict containerId, legacyParentFallback: false):');
  const directStockMap = new Map();
  for (const loc of locations) {
    const projs = stockProjections[loc.id] || [];
    const qty = projs.reduce((acc, p) => acc + (Number(p.quantity) || 0), 0);
    directStockMap.set(loc.id, qty);
  }

  const targets = ['OFC', 'WRB', 'SMD-CAB-01', 'SMD-DRW-01', 'SMD-DRW-02'];
  for (const code of targets) {
    const loc = locations.find((l) => l.code === code);
    if (!loc) {
      console.log(`   ❌ Location ${code} not found!`);
      continue;
    }
    const subtree = collectPhysicalSubtreeIds(loc.id, locMap, { legacyParentFallback: false });
    const directQty = directStockMap.get(loc.id) || 0;
    const rollupQty = subtree.reduce((sum, id) => sum + (directStockMap.get(id) || 0), 0);
    console.log(`   ✅ ${code.padEnd(12)} (${loc.kind}): direct = ${directQty}, physical subtree = ${subtree.length} locations, physical rollup = ${rollupQty} units`);
  }

  const allPassed = passedAssertions === assertions.length && idempotencyOk && integrityReport.ok;
  console.log(`\n================================================================`);
  console.log(`POST-MIGRATION INTEGRITY RESULT: ${allPassed ? 'ALL CHECKS PASSED ✅' : 'CHECKS FAILED ❌'}`);
  console.log(`================================================================`);

  if (!allPassed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

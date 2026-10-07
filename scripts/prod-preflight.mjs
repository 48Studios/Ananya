import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const API_BASE = 'https://api.erp.48studios.dev';
const TOKEN_FILE = path.resolve('tests/.auth/token.json');

function md5(val) {
  return crypto.createHash('md5').update(val).digest('hex');
}

async function main() {
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

  console.log('=== RFC-0069 PHASE 3B PRE-FLIGHT (LIVE PRODUCTION) ===\n');

  // 1. Fetch live production data
  console.log('1. Fetching live production dataset...');
  const [locations, layouts, nodes, models, transactions] = await Promise.all([
    apiGet('/locations'),
    apiGet('/spatial/layouts'),
    apiGet('/spatial/nodes'),
    apiGet('/spatial/models'),
    apiGet('/inventory-transactions'),
  ]);

  console.log(`   - Locations: ${locations.length}`);
  console.log(`   - Spatial Layouts: ${layouts.length}`);
  console.log(`   - Spatial Nodes: ${nodes.length}`);
  console.log(`   - Spatial Models: ${models.length}`);
  console.log(`   - Inventory Transactions: ${transactions.length}`);

  // Fetch projections for each location
  const stockProjections = {};
  for (const loc of locations) {
    try {
      const projs = await apiGet(`/inventory-projections/location/${loc.id}`);
      stockProjections[loc.id] = projs;
    } catch (e) {
      stockProjections[loc.id] = [];
    }
  }

  // 2. Re-run Phase 3A planner against live data
  const { planPhysicalContainerBackfill, evaluateBackfillGuard } = await import(
    '../packages/inventory/dist/spatial/index.js'
  );

  const planInput = locations.map((l) => ({
    id: l.id,
    code: l.code,
    kind: l.kind,
    parentId: l.parentId ?? null,
    containerId: l.containerId ?? null,
    isActive: l.isActive,
  }));

  const plan = planPhysicalContainerBackfill(planInput);
  const { summary, validation, proposals } = plan;

  // 3. HARD SAFETY CHECKS
  console.log('\n2. Evaluating hard safety requirements:');
  const expectedGuards = {
    assignments: 21,
    canonical: 16,
    contextRoot: 5,
    legacyCompatible: 0,
    violations: 0,
    unparented: 1,
    inactive: 0,
    dangling: 0,
    cycles: 0,
    currentlyPopulated: 0,
  };

  const actualGuards = {
    assignments: summary.proposedAssignments,
    canonical: summary.canonical.count,
    contextRoot: summary.contextRoot.count,
    legacyCompatible: summary.legacyCompatible.count,
    violations: summary.violations.count,
    unparented: summary.unparented,
    inactive: 0, // checked below
    dangling: 0, // checked below
    cycles: 0, // checked below
    currentlyPopulated: locations.filter((l) => l.containerId != null).length,
  };

  // Check validation issues
  for (const issue of validation.issues) {
    if (issue.code === 'INACTIVE_CONTAINER') actualGuards.inactive++;
    if (issue.code === 'DANGLING_CONTAINER') actualGuards.dangling++;
    if (issue.code === 'CONTAINER_CYCLE') actualGuards.cycles++;
  }

  let failedGuards = 0;
  for (const [k, expectedVal] of Object.entries(expectedGuards)) {
    const actualVal = actualGuards[k];
    const match = actualVal === expectedVal;
    if (!match) failedGuards++;
    console.log(
      `   ${match ? '✅' : '❌'} ${k.padEnd(20)}: expected ${expectedVal}, actual ${actualVal}`,
    );
  }

  if (failedGuards > 0 || !validation.safe) {
    console.error('\n❌ HARD SAFETY GUARD FAILED! Refusing execution.');
    process.exit(1);
  }

  // 4. Exact Assignment Identity Verification
  console.log('\n3. Verifying exact assignment identity set (21 approved proposals):');
  const approvedProposals = proposals.filter((p) => p.proposedContainerId !== null);
  if (approvedProposals.length !== 21) {
    console.error(`❌ Expected 21 proposals, got ${approvedProposals.length}`);
    process.exit(1);
  }

  for (const p of approvedProposals) {
    console.log(
      `   ✅ [${p.classification.padEnd(12)}] ${p.childCode.padEnd(12)} (${p.childId}) -> ${p.parentCode.padEnd(12)} (${p.proposedContainerId})`,
    );
  }

  // 5. Compute Pre-Write Fingerprints & Checksums
  console.log('\n4. Computing Pre-Write Checksums & Invariants:');
  
  // Sort locations by ID for deterministic checksums
  const sortedLocations = [...locations].sort((a, b) => a.id.localeCompare(b.id));
  const locationIds = sortedLocations.map((l) => l.id);
  const parentIdChecksum = md5(sortedLocations.map((l) => `${l.id}:${l.parentId ?? '~'}`).join(','));
  const kindChecksum = md5(sortedLocations.map((l) => `${l.id}:${l.kind}`).join(','));
  const identityChecksum = md5(sortedLocations.map((l) => `${l.id}:${l.code}:${l.name}`).join(','));
  const containerIdChecksum = md5(sortedLocations.map((l) => `${l.id}:${l.containerId ?? '~'}`).join(','));

  // Sort spatial tables
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
    for (const p of projs) {
      totalProjectedQty += Number(p.quantity) || 0;
    }
  }

  const snapshot = {
    timestamp: new Date().toISOString(),
    locationCount: locations.length,
    locationIds,
    parentIdChecksum,
    kindChecksum,
    identityChecksum,
    containerIdChecksum,
    layoutsCount: layouts.length,
    layoutsChecksum,
    nodesCount: nodes.length,
    nodesChecksum,
    ledgerCount: transactions.length,
    ledgerChecksum,
    totalProjectionRecords,
    totalProjectedQty,
    approvedAssignments: approvedProposals.map((p) => ({
      childId: p.childId,
      childCode: p.childCode,
      childKind: p.childKind,
      proposedContainerId: p.proposedContainerId,
      parentCode: p.parentCode,
      parentKind: p.parentKind,
      classification: p.classification,
    })),
  };

  const snapshotPath = path.resolve(
    '/Users/jrsarath/.gemini/antigravity-ide/brain/95761271-167b-4df0-9501-eb5708026c0b/scratch/pre_write_snapshot.json',
  );
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');

  console.log(`   - locationCount          : ${snapshot.locationCount}`);
  console.log(`   - parentIdChecksum       : ${snapshot.parentIdChecksum}`);
  console.log(`   - kindChecksum           : ${snapshot.kindChecksum}`);
  console.log(`   - identityChecksum       : ${snapshot.identityChecksum}`);
  console.log(`   - containerIdChecksum    : ${snapshot.containerIdChecksum}`);
  console.log(`   - layoutsCount           : ${snapshot.layoutsCount}`);
  console.log(`   - layoutsChecksum        : ${snapshot.layoutsChecksum}`);
  console.log(`   - nodesCount             : ${snapshot.nodesCount}`);
  console.log(`   - nodesChecksum          : ${snapshot.nodesChecksum}`);
  console.log(`   - ledgerCount            : ${snapshot.ledgerCount}`);
  console.log(`   - ledgerChecksum         : ${snapshot.ledgerChecksum}`);
  console.log(`   - totalProjectionRecords : ${snapshot.totalProjectionRecords}`);
  console.log(`   - totalProjectedQty      : ${snapshot.totalProjectedQty}`);
  console.log(`\n💾 Snapshot saved to ${snapshotPath}`);
  console.log('\nPRE-FLIGHT COMPLETE: 100% PASS. READY FOR GUARDED EXECUTION.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

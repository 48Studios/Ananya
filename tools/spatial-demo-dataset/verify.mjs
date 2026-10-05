/**
 * Spatial Demo dataset — read-only verification.
 *
 * Reconciles the seeded database against the authoritative mapping semantics
 * and checks spatial/inventory integrity. Never writes.
 *
 * Usage:
 *   node tools/spatial-demo-dataset/verify.mjs
 */
import { execFileSync } from 'node:child_process';
import { DB_CONTAINER, loadEngine } from './lib.mjs';
import {
  INVENTORY_TRANSACTIONS,
  LAYOUTS,
  LOCATIONS_HIERARCHY,
} from './dataset.mjs';

const GEOMETRY_TOLERANCE_MM = 0.01;
const SPATIAL_PREFIX = 'DEMO-SPATIAL-';

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
      '-c',
      `SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (${sqlText}) t;`,
    ],
    { encoding: 'utf8' },
  );
  return JSON.parse(out.trim() || '[]');
}

function line(label, value) {
  console.log(`  ${label.padEnd(34)}: ${value}`);
}

export async function runVerification() {
  const engine = await loadEngine();
  const issues = [];
  const check = (name, ok, detail = '') => {
    if (!ok) issues.push(`${name}${detail ? ` — ${detail}` : ''}`);
    return ok;
  };

  console.log('\n================================================================');
  console.log('🔎 SPATIAL DEMO DATASET VERIFICATION');
  console.log('================================================================');

  // ---------------------------------------------------------------- Data set
  const locations = queryRows(
    `SELECT id, code, name, kind, parent_id, is_active FROM locations WHERE code LIKE '${SPATIAL_PREFIX}%' ORDER BY code`,
  );
  const nodes = queryRows(
    `SELECT n.location_id, n.id, n.model_id, n.anchor_id, n.parent_spatial_node_id, n.position_x, n.position_y, n.position_z, n.rotation_x, n.rotation_y, n.rotation_z, n.scale_x, n.scale_y, n.scale_z, n.metadata FROM spatial_nodes n JOIN locations l ON l.id = n.location_id WHERE l.code LIKE '${SPATIAL_PREFIX}%'`,
  );
  const layouts = queryRows(
    `SELECT id, parent_location_id, code, status, revision, total_compartments, config FROM spatial_layouts WHERE code LIKE '${SPATIAL_PREFIX}%' OR parent_location_id IN (SELECT id FROM locations WHERE code LIKE '${SPATIAL_PREFIX}%') ORDER BY code`,
  );
  const mappings = queryRows(
    `SELECT layout_id, slot_id, slot_code, location_id, is_stale FROM spatial_layout_mappings WHERE layout_id IN (SELECT id FROM spatial_layouts WHERE code LIKE '${SPATIAL_PREFIX}%' OR parent_location_id IN (SELECT id FROM locations WHERE code LIKE '${SPATIAL_PREFIX}%'))`,
  );
  const revisions = queryRows(
    `SELECT layout_id, revision_number, diff_summary FROM spatial_layout_revisions WHERE layout_id IN (SELECT id FROM spatial_layouts WHERE code LIKE '${SPATIAL_PREFIX}%')`,
  );
  const projections = queryRows(
    `SELECT p.location_id, p.component_id, p.quantity, c.sku FROM inventory_projections p JOIN components c ON c.id = p.component_id WHERE c.sku LIKE 'DEMO-%' AND p.location_id IN (SELECT id FROM locations WHERE code LIKE '${SPATIAL_PREFIX}%')`,
  );

  const locationById = new Map(locations.map((l) => [l.id, l]));
  const nodeByLocationId = new Map(nodes.map((n) => [n.location_id, n]));
  const layoutsByParent = new Map();
  for (const layout of layouts) {
    const list = layoutsByParent.get(layout.parent_location_id) ?? [];
    list.push(layout);
    layoutsByParent.set(layout.parent_location_id, list);
  }
  const mappingsByLayout = new Map();
  for (const mapping of mappings) {
    const list = mappingsByLayout.get(mapping.layout_id) ?? [];
    list.push(mapping);
    mappingsByLayout.set(mapping.layout_id, list);
  }

  // -------------------------------------------------------- Location counts
  const expectedByCode = new Map(LOCATIONS_HIERARCHY.map((l) => [l.code, l]));
  const missing = LOCATIONS_HIERARCHY.filter(
    (spec) => !locations.some((l) => l.code === spec.code),
  );
  check('all declared locations exist', missing.length === 0, missing.map((m) => m.code).join(', '));

  const roots = locations.filter((l) => !l.parent_id);
  const rootId = roots[0]?.id ?? null;
  const hierarchyDepth = (() => {
    const byId = new Map(locations.map((l) => [l.id, l]));
    let deepest = 0;
    for (const location of locations) {
      let depth = 0;
      let current = location;
      while (current?.parent_id) {
        depth++;
        current = byId.get(current.parent_id);
      }
      deepest = Math.max(deepest, depth);
    }
    return deepest;
  })();

  console.log('\n📍 Location counts');
  line('Declared locations', LOCATIONS_HIERARCHY.length);
  line('Seeded locations', locations.length);
  line('Facility roots', roots.length);
  line(
    'Containers under the root',
    locations.filter((l) => l.parent_id === rootId).length,
  );
  line('Hierarchy depth', hierarchyDepth);

  // ------------------------------------------------- Mapping reconciliation
  const statusCounts = { MAPPED: 0, PARTIAL: 0, UNMAPPED: 0, ROOT: 0 };
  const containerCounts = { NONE: 0, DRAFT: 0, PUBLISHED: 0, ARCHIVED: 0 };
  const statusByCode = new Map();

  for (const location of locations) {
    const directChildren = locations.filter((c) => c.parent_id === location.id);
    const mappedChildren = directChildren.filter((c) =>
      nodeByLocationId.has(c.id),
    ).length;
    const layoutStatuses = (layoutsByParent.get(location.id) ?? []).map(
      (layout) => layout.status,
    );
    const result = engine.computeSpatialMappingStatus({
      parentId: location.parent_id,
      hasSpatialNode: nodeByLocationId.has(location.id),
      directChildCount: directChildren.length,
      mappedDirectChildCount: mappedChildren,
      layoutStatuses,
    });
    statusCounts[result.status]++;
    containerCounts[result.containerStatus]++;
    statusByCode.set(location.code, {
      status: result.status,
      containerStatus: result.containerStatus,
      mappedChildren,
      directChildren: directChildren.length,
    });
  }

  console.log('\n🗺️  Mapping-state distribution (authoritative semantics)');
  line('ROOT', statusCounts.ROOT);
  line('MAPPED', statusCounts.MAPPED);
  line('PARTIAL', statusCounts.PARTIAL);
  line('UNMAPPED', statusCounts.UNMAPPED);
  console.log('\n🗂️  Container status distribution');
  line('NONE', containerCounts.NONE);
  line('DRAFT', containerCounts.DRAFT);
  line('PUBLISHED', containerCounts.PUBLISHED);
  line('ARCHIVED', containerCounts.ARCHIVED);

  // Declared expectations from the dataset itself
  const expectations = [
    ['WAREHOUSE', 'ROOT', null],
    ['CABINET-A', 'PARTIAL', 'PUBLISHED'],
    ['CABINET-B', 'MAPPED', 'PUBLISHED'],
    ['CABINET-C', 'UNMAPPED', 'DRAFT'],
    ['OPEN-BINS', 'PARTIAL', 'PUBLISHED'],
    ['RACK', 'MAPPED', 'PUBLISHED'],
    ['TRAY', 'UNMAPPED', 'ARCHIVED'],
    ['SHELF', 'UNMAPPED', 'NONE'],
  ];
  for (const [suffix, status, containerStatus] of expectations) {
    const code = `${SPATIAL_PREFIX}${suffix}`;
    const actual = statusByCode.get(code);
    if (!actual) {
      check(`state of ${code}`, false, 'location missing');
      continue;
    }
    check(
      `${code} placement status`,
      actual.status === status,
      `expected ${status}, got ${actual.status}`,
    );
    if (containerStatus) {
      check(
        `${code} container status`,
        actual.containerStatus === containerStatus,
        `expected ${containerStatus}, got ${actual.containerStatus}`,
      );
    }
  }

  // ------------------------------------------------------- Spatial integrity
  const layoutIds = new Set(layouts.map((l) => l.id));
  const locationIds = new Set(locations.map((l) => l.id));

  const orphanMappings = mappings.filter(
    (m) => !layoutIds.has(m.layout_id) || !locationIds.has(m.location_id),
  );
  const orphanBuilderNodes = nodes.filter(
    (n) =>
      n.metadata?.source === 'inventory_builder' &&
      !layoutIds.has(n.metadata?.layoutId),
  );
  const staleMappings = mappings.filter((m) => m.is_stale);
  const duplicateSlots = new Map();
  const duplicateLocations = new Map();
  for (const mapping of mappings) {
    const slotKey = `${mapping.layout_id}:${mapping.slot_id}`;
    const locationKey = `${mapping.layout_id}:${mapping.location_id}`;
    duplicateSlots.set(slotKey, (duplicateSlots.get(slotKey) ?? 0) + 1);
    duplicateLocations.set(
      locationKey,
      (duplicateLocations.get(locationKey) ?? 0) + 1,
    );
  }
  const duplicateCount =
    [...duplicateSlots.values(), ...duplicateLocations.values()].filter(
      (count) => count > 1,
    ).length;
  const publishedByParent = new Map();
  for (const layout of layouts.filter((l) => l.status === 'PUBLISHED')) {
    publishedByParent.set(
      layout.parent_location_id,
      (publishedByParent.get(layout.parent_location_id) ?? 0) + 1,
    );
  }
  const multiplePublished = [...publishedByParent.values()].filter(
    (count) => count > 1,
  ).length;
  const layoutsWithoutRevision = layouts.filter(
    (layout) =>
      layout.status === 'PUBLISHED' &&
      !revisions.some(
        (revision) =>
          revision.layout_id === layout.id &&
          revision.revision_number === layout.revision - 1,
      ),
  );
  const inactiveMappedLocations = nodes.filter(
    (node) => locationById.get(node.location_id)?.is_active === false,
  );
  const malformedNodes = nodes.filter(
    (node) =>
      node.metadata?.source === 'inventory_builder' &&
      !['layoutId', 'slotId'].every(
        (key) => node.metadata[key] !== undefined,
      ),
  );

  console.log('\n🧱 Spatial integrity');
  line('Layouts in dataset', layouts.length);
  line('Mappings in dataset', mappings.length);
  line('Spatial nodes in dataset', nodes.length);
  line('Orphan mappings', orphanMappings.length);
  line('Orphan builder nodes', orphanBuilderNodes.length);
  line('Duplicate mappings', duplicateCount);
  line('Multiple published per parent', multiplePublished);
  line('Stale mappings', staleMappings.length);
  line('Published layouts without revision', layoutsWithoutRevision.length);
  line('Builder nodes with incomplete ownership', malformedNodes.length);
  line('Nodes on inactive locations', inactiveMappedLocations.length);

  check('no orphan mappings', orphanMappings.length === 0);
  check('no orphan builder nodes', orphanBuilderNodes.length === 0);
  check('no duplicate mappings', duplicateCount === 0);
  check('one published layout per parent', multiplePublished === 0);
  check('published layouts have revisions', layoutsWithoutRevision.length === 0);
  check('builder ownership metadata complete', malformedNodes.length === 0);
  check('no nodes on inactive locations', inactiveMappedLocations.length === 0);

  // -------------------------------------------------------------- Geometry
  console.log('\n📐 Geometry consistency (builder preview == published node == renderer frame)');
  let geometryChecked = 0;
  let geometryFailures = 0;

  for (const spec of LAYOUTS) {
    const layout = layouts.find((l) => l.code === spec.code);
    if (!layout || layout.status !== 'PUBLISHED') continue;

    const generated = engine.generateStorageCompartments(spec.config);
    const bySlotId = new Map(generated.compartments.map((c) => [c.slotId, c]));
    const parentNode = nodeByLocationId.get(layout.parent_location_id) ?? null;
    const configDimensions = spec.config.dimensions;
    const configDimensionsPresent =
      configDimensions &&
      configDimensions.widthMm > 0 &&
      configDimensions.heightMm > 0 &&
      configDimensions.depthMm > 0;
    check(
      `${spec.code} exposes container dimensions`,
      Boolean(configDimensionsPresent),
      'published layout config has no usable dimensions',
    );

    for (const mapping of mappingsByLayout.get(layout.id) ?? []) {
      geometryChecked++;
      const compartment = bySlotId.get(mapping.slot_id);
      const node = nodeByLocationId.get(mapping.location_id);
      if (!compartment || !node) {
        geometryFailures++;
        check(
          `${spec.code}/${mapping.slot_code} geometry`,
          false,
          'missing generated slot or spatial node',
        );
        continue;
      }

      const dx = Math.abs(Number(node.position_x) - compartment.position.x);
      const dy = Math.abs(Number(node.position_y) - compartment.position.y);
      const dz = Math.abs(Number(node.position_z) - compartment.position.z);
      const scaleOk =
        Math.abs(Number(node.scale_x) - 1) < 0.0001 &&
        Math.abs(Number(node.scale_y) - 1) < 0.0001 &&
        Math.abs(Number(node.scale_z) - 1) < 0.0001;
      const metadataOk =
        node.metadata?.source === 'inventory_builder' &&
        node.metadata?.layoutId === layout.id &&
        node.metadata?.slotId === mapping.slot_id;
      const parentOk =
        (node.parent_spatial_node_id ?? null) === (parentNode?.id ?? null);

      if (
        dx > GEOMETRY_TOLERANCE_MM ||
        dy > GEOMETRY_TOLERANCE_MM ||
        dz > GEOMETRY_TOLERANCE_MM ||
        !scaleOk ||
        !metadataOk ||
        !parentOk
      ) {
        geometryFailures++;
        check(
          `${spec.code}/${mapping.slot_code} geometry`,
          false,
          `d=(${dx.toFixed(2)},${dy.toFixed(2)},${dz.toFixed(2)})mm scaleOk=${scaleOk} metadataOk=${metadataOk} parentOk=${parentOk}`,
        );
      }
    }
  }

  line('Published mappings checked', geometryChecked);
  line('Geometry mismatches', geometryFailures);
  check('published geometry matches generated slots', geometryFailures === 0);

  // -------------------------------------------------------------- Inventory
  console.log('\n📦 Inventory');
  const projectionsByLocationComponent = new Map();
  for (const projection of projections) {
    const key = `${projection.location_id}:${projection.component_id}`;
    projectionsByLocationComponent.set(
      key,
      (projectionsByLocationComponent.get(key) ?? 0) + Number(projection.quantity),
    );
  }

  const components = queryRows(
    `SELECT id, sku FROM components WHERE sku LIKE 'DEMO-%'`,
  );
  const componentBySku = new Map(components.map((c) => [c.sku, c]));
  const locationByCode = new Map(locations.map((l) => [l.code, l]));

  let stockOk = 0;
  for (const tx of INVENTORY_TRANSACTIONS) {
    const component = componentBySku.get(tx.componentSku);
    const location = locationByCode.get(tx.locationCode);
    if (!component || !location) {
      check(`stock ${tx.reference}`, false, 'component or location missing');
      continue;
    }
    const quantity =
      projectionsByLocationComponent.get(`${location.id}:${component.id}`) ?? 0;
    if (quantity === tx.quantity) {
      stockOk++;
    } else {
      check(
        `stock ${tx.reference}`,
        false,
        `expected ${tx.quantity} at ${tx.locationCode}, projection shows ${quantity}`,
      );
    }
  }
  const mappedStock = INVENTORY_TRANSACTIONS.filter(
    (tx) => statusByCode.get(tx.locationCode)?.status === 'MAPPED',
  ).length;
  const unmappedStock = INVENTORY_TRANSACTIONS.filter((tx) => {
    const state = statusByCode.get(tx.locationCode);
    return state && state.status === 'UNMAPPED';
  }).length;

  line('Stock records reconciled', `${stockOk}/${INVENTORY_TRANSACTIONS.length}`);
  line('Stock in mapped locations', mappedStock);
  line('Stock in unmapped locations', unmappedStock);
  check('all demo stock quantities visible', stockOk === INVENTORY_TRANSACTIONS.length);
  check('stock independent of mapping state', mappedStock > 0 && unmappedStock > 0);

  // ------------------------------------------------------------- Conclusion
  console.log('\n================================================================');
  if (issues.length === 0) {
    console.log('✅ VERIFICATION PASSED — dataset is complete and consistent');
    console.log('================================================================\n');
    return { ok: true, issues: [] };
  }
  console.log(`❌ VERIFICATION FOUND ${issues.length} PROBLEM(S):`);
  for (const issue of issues) {
    console.log(`   - ${issue}`);
  }
  console.log('================================================================\n');
  return { ok: false, issues };
}

if (process.argv[1]?.endsWith('verify.mjs')) {
  runVerification()
    .then((result) => {
      if (!result.ok) process.exit(1);
    })
    .catch((error) => {
      console.error('\n❌ Verification failed:', error);
      process.exit(1);
    });
}

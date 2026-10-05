/**
 * Spatial Demo dataset seeder.
 *
 * Safe, deterministic, idempotent seed that establishes a complete Spatial
 * Inventory demo dataset:
 *
 *   1. Spatial models (+ anchors), with dimensions derived from the parametric
 *      engine so operational 2D/3D render exactly the authored slots.
 *   2. Location hierarchy under DEMO-SPATIAL-WAREHOUSE.
 *   3. Parametric layouts created, published and archived through the same REST
 *      endpoints the Inventory Builder uses (draft -> publish -> archive), which
 *      produces builder-owned spatial nodes with real ownership metadata.
 *   4. Node enrichment: container/drawer models attached to builder-owned
 *      nodes, plus deep-hierarchy bins mapped to drawer anchors.
 *   5. Demo components and baseline stock through the immutable ledger.
 *
 * Usage:
 *   node tools/spatial-demo-dataset/seed.mjs
 *   node tools/spatial-demo-dataset/seed.mjs --reset       # cleanup then seed
 *   node tools/spatial-demo-dataset/seed.mjs --no-verify   # skip verification
 */
import {
  API_BASE,
  generateCompartmentMap,
  get,
  log,
  patch,
  post,
  put,
  readManifest,
  writeManifest,
} from './lib.mjs';
import {
  COMPONENTS,
  INVENTORY_TRANSACTIONS,
  LAYOUTS,
  LOCATIONS_HIERARCHY,
  MODEL_SPECS,
  NESTED_NODE_MAPPINGS,
  NODE_MODEL_ASSIGNMENTS,
} from './dataset.mjs';

const args = process.argv.slice(2);
const SHOULD_RESET_FIRST = args.includes('--reset');
const SHOULD_VERIFY = !args.includes('--no-verify');

const round2 = (value) => Math.round(value * 100) / 100;

/** Stable JSON stringification (Postgres jsonb does not preserve key order). */
function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

async function verifyEnvironment() {
  log('🔍 Verifying target environment...');
  try {
    const health = await get('/health');
    log(`  ✅ Connected to API at ${API_BASE} (${JSON.stringify(health)})`);
  } catch (error) {
    throw new Error(
      `Failed to connect to API at ${API_BASE}. Ensure the dev stack is running ('pnpm dev'). Error: ${error.message}`,
    );
  }

  // Safety check: ensure not pointing to a production domain
  if (
    API_BASE.includes('production') ||
    API_BASE.includes('erp.48studios.in') ||
    (!API_BASE.includes('localhost') && !API_BASE.includes('127.0.0.1'))
  ) {
    throw new Error(
      `ABORT: API_BASE '${API_BASE}' does not look like a local development environment. Demo seeding is restricted to development.`,
    );
  }
}

/**
 * Computes every layout's generated geometry once. The same engine build the
 * API uses produces the slots, so derived model dimensions cannot drift.
 */
async function buildLayoutGeometry() {
  log('\n📐 0. Generating parametric geometry from the storage engine...');
  const geometry = new Map();
  for (const spec of LAYOUTS) {
    const generated = await generateCompartmentMap(spec.config);
    geometry.set(spec.code, {
      config: spec.config,
      compartments: generated.compartments,
      byCode: generated.byCode,
      bySlotId: generated.bySlotId,
    });
    const sample = generated.compartments[0];
    log(
      `  ${spec.code}: ${generated.compartments.length} slots, cell ${sample.dimensions.widthMm} x ${sample.dimensions.heightMm} x ${sample.dimensions.depthMm} mm`,
    );
  }
  return geometry;
}

/** Derives concrete model records (mm + anchors) from layout geometry. */
function deriveModels(layoutGeometry) {
  return MODEL_SPECS.map((spec) => {
    const layout = layoutGeometry.get(spec.from.layoutCode);
    if (!layout) {
      throw new Error(
        `Model '${spec.code}' references unknown layout '${spec.from.layoutCode}'.`,
      );
    }

    let dimensions;
    if (spec.from.use === 'container') {
      dimensions = layout.config.dimensions;
    } else {
      const slot = layout.compartments[0];
      dimensions = {
        widthMm: slot.dimensions.widthMm * (spec.from.widthRatio ?? 1),
        heightMm: slot.dimensions.heightMm * (spec.from.heightRatio ?? 1),
        depthMm: slot.dimensions.depthMm * (spec.from.depthRatio ?? 1),
      };
    }

    const model = {
      code: spec.code,
      name: spec.name,
      format: 'PROCEDURAL',
      widthMm: round2(dimensions.widthMm),
      heightMm: round2(dimensions.heightMm),
      depthMm: round2(dimensions.depthMm),
    };

    const anchors = (spec.anchors ?? []).map((anchor) => ({
      code: anchor.code,
      name: anchor.name,
      anchorType: anchor.anchorType,
      localPositionX: round2(model.widthMm * anchor.xRatio),
      localPositionY: round2(model.heightMm * anchor.yRatio),
      localPositionZ: round2(anchor.zMm ?? 0),
      boundingWidthMm: round2(model.widthMm * anchor.boundingWidthRatio),
      boundingHeightMm: round2(model.heightMm * anchor.boundingHeightRatio),
      boundingDepthMm: round2(model.depthMm * anchor.boundingDepthRatio),
    }));

    return { ...model, anchors };
  });
}

async function ensureModelsAndAnchors(manifest, models) {
  log('\n📦 1. Setting up Spatial Models & Anchors...');
  const existingModels = await get('/spatial/models');
  const modelByCode = new Map(existingModels.map((m) => [m.code, m]));

  const modelsMap = new Map(); // code -> modelDto
  const anchorsMap = new Map(); // `${modelCode}:${anchorCode}` -> anchorDto

  for (const modelSpec of models) {
    let model = modelByCode.get(modelSpec.code);
    let created = false;
    let updated = false;

    if (!model) {
      model = await post('/spatial/models', {
        code: modelSpec.code,
        name: modelSpec.name,
        format: modelSpec.format,
        widthMm: modelSpec.widthMm,
        heightMm: modelSpec.heightMm,
        depthMm: modelSpec.depthMm,
      });
      created = true;
      log(`  ➕ Created model ${model.code} (${model.id})`);
    } else {
      const needsUpdate =
        Number(model.widthMm) !== modelSpec.widthMm ||
        Number(model.heightMm) !== modelSpec.heightMm ||
        Number(model.depthMm) !== modelSpec.depthMm;
      if (needsUpdate) {
        model = await patch(`/spatial/models/${model.id}`, {
          widthMm: modelSpec.widthMm,
          heightMm: modelSpec.heightMm,
          depthMm: modelSpec.depthMm,
        });
        updated = true;
        log(
          `  🔄 Updated model dimensions for ${model.code} -> ${modelSpec.widthMm} x ${modelSpec.heightMm} x ${modelSpec.depthMm} mm`,
        );
      } else {
        log(`  ✓ Reusing existing model ${model.code} (${model.id})`);
      }
    }

    modelsMap.set(modelSpec.code, model);
    if (!manifest.models.some((m) => m.id === model.id)) {
      manifest.models.push({
        id: model.id,
        code: model.code,
        created,
        updated,
      });
    }

    // Anchors for this model
    const existingAnchors = await get(`/spatial/models/${model.id}/anchors`);
    const anchorByCode = new Map(existingAnchors.map((a) => [a.code, a]));

    for (const anchorSpec of modelSpec.anchors) {
      let anchor = anchorByCode.get(anchorSpec.code);
      let anchorCreated = false;

      if (!anchor) {
        anchor = await post(`/spatial/models/${model.id}/anchors`, {
          code: anchorSpec.code,
          name: anchorSpec.name,
          anchorType: anchorSpec.anchorType,
          localPositionX: anchorSpec.localPositionX,
          localPositionY: anchorSpec.localPositionY,
          localPositionZ: anchorSpec.localPositionZ,
          boundingWidthMm: anchorSpec.boundingWidthMm,
          boundingHeightMm: anchorSpec.boundingHeightMm,
          boundingDepthMm: anchorSpec.boundingDepthMm,
        });
        anchorCreated = true;
        log(`    ➕ Created anchor ${anchor.code} for ${model.code}`);
      } else {
        log(`    ✓ Reusing anchor ${anchor.code} for ${model.code}`);
      }

      const key = `${modelSpec.code}:${anchorSpec.code}`;
      anchorsMap.set(key, anchor);
      if (!manifest.anchors.some((a) => a.id === anchor.id)) {
        manifest.anchors.push({
          id: anchor.id,
          modelId: model.id,
          code: anchor.code,
          created: anchorCreated,
        });
      }
    }
  }

  return { modelsMap, anchorsMap };
}

async function ensureLocations(manifest) {
  log('\n📍 2. Setting up Location Hierarchy...');
  const existingLocations = await get('/locations');
  const locationByCode = new Map(existingLocations.map((l) => [l.code, l]));
  const locationsMap = new Map(); // code -> locationDto

  let createdCount = 0;
  for (const locSpec of LOCATIONS_HIERARCHY) {
    let loc = locationByCode.get(locSpec.code);
    let created = false;

    let parentId = null;
    if (locSpec.parentCode) {
      const parentLoc = locationsMap.get(locSpec.parentCode);
      if (!parentLoc) {
        throw new Error(
          `Parent location '${locSpec.parentCode}' not found for '${locSpec.code}'.`,
        );
      }
      parentId = parentLoc.id;
    }

    if (!loc) {
      // CreateLocationDto declares metadata as a string (API DTO constraint);
      // the free-form metadata (capacity hints) is applied through the update
      // route below, which accepts an object.
      loc = await post('/locations', {
        code: locSpec.code,
        name: locSpec.name,
        kind: locSpec.kind,
        parentId: parentId || undefined,
      });
      created = true;
      createdCount++;
      log(`  ➕ Created location [${loc.kind}] ${loc.code} -> ${loc.id}`);
    } else {
      log(`  ✓ Reusing location [${loc.kind}] ${loc.code} -> ${loc.id}`);
    }

    if (locSpec.metadata) {
      const desired = canonicalJson(locSpec.metadata);
      const current = canonicalJson(loc.metadata ?? {});
      if (desired !== current) {
        loc = await put(`/locations/${loc.id}`, {
          metadata: locSpec.metadata,
        });
        log(`  🔄 Applied metadata for ${loc.code}`);
      }
    }

    locationsMap.set(locSpec.code, loc);
    if (!manifest.locations.some((l) => l.id === loc.id)) {
      manifest.locations.push({
        id: loc.id,
        code: loc.code,
        kind: loc.kind,
        created,
      });
    }
  }

  log(`  → ${createdCount} locations created, ${locationsMap.size} in the demo tree.`);
  return locationsMap;
}

/**
 * Ensures one layout reaches its desired state through the builder endpoints.
 *
 * Idempotency rules:
 * - an existing layout that already matches the spec is reused untouched
 *   (no revision churn, no node rewrites);
 * - a DRAFT layout that drifted from the spec is repaired before publishing;
 * - a PUBLISHED/ARCHIVED layout is never silently rewritten, because an
 *   operator may have edited it after seeding.
 */
async function ensureLayouts(manifest, { locationsMap, layoutGeometry }) {
  log('\n🗂️  3. Creating & publishing parametric layouts (Inventory Builder path)...');
  const existingLayouts = await get('/spatial/layouts');
  const layoutsMap = new Map(); // layoutCode -> layoutDto

  for (const spec of LAYOUTS) {
    const parent = locationsMap.get(spec.parentCode);
    if (!parent) {
      throw new Error(
        `Layout '${spec.code}' parent '${spec.parentCode}' not found.`,
      );
    }
    const geometry = layoutGeometry.get(spec.code);

    const desiredMappings = spec.mappings.map((mapping) => {
      const compartment = geometry.byCode.get(mapping.slotCode);
      if (!compartment) {
        throw new Error(
          `Layout '${spec.code}' has no slot '${mapping.slotCode}'. Available: ${[...geometry.byCode.keys()].join(', ')}`,
        );
      }
      const location = locationsMap.get(mapping.locationCode);
      if (!location) {
        throw new Error(
          `Layout '${spec.code}' mapping target '${mapping.locationCode}' not found.`,
        );
      }
      return {
        slotId: compartment.slotId,
        slotCode: compartment.code,
        locationId: location.id,
        logicalRow: compartment.logicalIndex.row,
        logicalCol: compartment.logicalIndex.col,
      };
    });

    const candidates = existingLayouts.filter(
      (layout) => layout.parentLocationId === parent.id,
    );
    let layout =
      candidates.find((candidate) => candidate.code === spec.code) ??
      candidates[0] ??
      null;

    if (layout && layout.code !== spec.code) {
      log(
        `  ⚠️  Parent ${parent.code} already has layout '${layout.code}' (not '${spec.code}'); adopting it.`,
      );
    }

    const configMatches =
      layout && canonicalJson(layout.config) === canonicalJson(spec.config);
    const mappingKey = (list) =>
      list
        .map((m) => `${m.slotCode}->${m.locationId}`)
        .sort()
        .join('|');
    const mappingsMatch =
      layout &&
      layout.mappings.length === desiredMappings.length &&
      mappingKey(layout.mappings) === mappingKey(desiredMappings);

    let created = false;
    let publishedNow = false;
    let archivedNow = false;

    if (!layout) {
      layout = await post('/spatial/layouts', {
        parentLocationId: parent.id,
        code: spec.code,
        name: spec.name,
        templateType: spec.templateType,
        description: `Demo seed layout for ${parent.code}`,
        config: spec.config,
        mappings: desiredMappings,
      });
      created = true;
      log(`  ➕ Created DRAFT layout ${layout.code} (${layout.id})`);
    } else if (layout.status === 'PUBLISHED' || layout.status === 'ARCHIVED') {
      if (!configMatches || !mappingsMatch) {
        log(
          `  ⚠️  Layout ${layout.code} is ${layout.status} and differs from the seed spec; leaving operator state untouched.`,
        );
      } else {
        log(`  ✓ Layout ${layout.code} already ${layout.status}`);
      }
    } else {
      // Draft: repair drift, then continue to the desired end state.
      if (!configMatches || !mappingsMatch) {
        layout = await put(`/spatial/layouts/${layout.id}`, {
          expectedRevision: layout.revision,
          name: spec.name,
          templateType: spec.templateType,
          config: spec.config,
          mappings: desiredMappings,
          changeDescription: spec.changeDescription ?? 'Demo seed repair',
        });
        log(`  🔄 Repaired DRAFT layout ${layout.code} (rev ${layout.revision})`);
      } else {
        log(`  ✓ Layout ${layout.code} already DRAFT`);
      }
    }

    // Reach the desired end state
    if (spec.status === 'PUBLISHED' && layout.status !== 'PUBLISHED') {
      layout = await post(`/spatial/layouts/${layout.id}/publish`, {
        expectedRevision: layout.revision,
        changeDescription: spec.changeDescription ?? 'Demo seed publication',
      });
      publishedNow = true;
      log(`  🚀 Published layout ${layout.code} (rev ${layout.revision})`);
    } else if (spec.status === 'ARCHIVED') {
      if (layout.status === 'DRAFT') {
        layout = await post(`/spatial/layouts/${layout.id}/publish`, {
          expectedRevision: layout.revision,
          changeDescription: 'Demo seed: publish before archiving',
        });
        publishedNow = true;
        log(`  🚀 Published layout ${layout.code} (rev ${layout.revision})`);
      }
      if (layout.status !== 'ARCHIVED') {
        layout = await post(`/spatial/layouts/${layout.id}/archive`, {
          expectedRevision: layout.revision,
          changeDescription:
            spec.changeDescription ?? 'Demo seed: archived example',
        });
        archivedNow = true;
        log(`  🗄️  Archived layout ${layout.code} (rev ${layout.revision})`);
      }
    }

    layoutsMap.set(spec.code, layout);
    const manifestEntry = manifest.layouts.find((l) => l.id === layout.id);
    if (manifestEntry) {
      manifestEntry.status = layout.status;
      manifestEntry.revision = layout.revision;
    } else {
      manifest.layouts.push({
        id: layout.id,
        code: layout.code,
        parentLocationCode: spec.parentCode,
        templateType: layout.templateType,
        status: layout.status,
        revision: layout.revision,
        created,
        publishedNow,
        archivedNow,
      });
    }
  }

  return layoutsMap;
}

/** Attaches models to builder-owned nodes so operational sizes match the slots. */
async function ensureNodeModelAssignments(manifest, { modelsMap, locationsMap }) {
  log('\n🧩 4. Attaching authored models to builder-owned nodes...');
  let updatedCount = 0;

  for (const assignment of NODE_MODEL_ASSIGNMENTS) {
    const location = locationsMap.get(assignment.locationCode);
    if (!location) {
      throw new Error(
        `Node model assignment target '${assignment.locationCode}' not found.`,
      );
    }
    const model = modelsMap.get(assignment.modelCode);
    if (!model) {
      throw new Error(
        `Node model assignment model '${assignment.modelCode}' not found.`,
      );
    }

    const node = await get(`/spatial/nodes/location/${location.id}`);
    if (!node) {
      log(
        `  ⚠️  ${location.code} has no spatial node (layout not published?); skipping model attachment.`,
      );
      continue;
    }
    if (node.modelId === model.id) {
      log(`  ✓ ${location.code} already uses ${model.code}`);
      continue;
    }

    await patch(`/spatial/nodes/${node.id}`, { modelId: model.id });
    updatedCount++;
    log(`  🔧 ${location.code} -> model ${model.code}`);
  }

  log(`  → ${updatedCount} nodes enriched with authored models.`);
}

/** Creates deep-hierarchy child nodes placed on a parent model anchor. */
async function ensureNestedNodes(manifest, { modelsMap, anchorsMap, locationsMap }) {
  log('\n🪆 5. Creating deep-hierarchy child nodes (anchor flow)...');
  let createdCount = 0;

  for (const mapping of NESTED_NODE_MAPPINGS) {
    const location = locationsMap.get(mapping.locationCode);
    const parentLocation = locationsMap.get(mapping.parentLocationCode);
    if (!location || !parentLocation) {
      throw new Error(
        `Nested mapping ${mapping.locationCode} -> ${mapping.parentLocationCode} references an unknown location.`,
      );
    }

    const parentNode = await get(
      `/spatial/nodes/location/${parentLocation.id}`,
    );
    if (!parentNode?.modelId) {
      log(
        `  ⚠️  Parent ${parentLocation.code} has no model; cannot place ${location.code}.`,
      );
      continue;
    }
    const parentModel = modelsMap.get(
      NODE_MODEL_ASSIGNMENTS.find(
        (assignment) => assignment.locationCode === mapping.parentLocationCode,
      )?.modelCode,
    );
    if (!parentModel) {
      log(
        `  ⚠️  Parent model for ${parentLocation.code} is not a demo model; cannot resolve anchor.`,
      );
      continue;
    }
    const anchor = anchorsMap.get(`${parentModel.code}:${mapping.anchorCode}`);
    if (!anchor) {
      throw new Error(
        `Anchor '${mapping.anchorCode}' not found on model ${parentModel.code}.`,
      );
    }

    const existing = await get(`/spatial/nodes/location/${location.id}`);
    if (existing) {
      if (
        existing.parentSpatialNodeId === parentNode.id &&
        existing.anchorId === anchor.id
      ) {
        log(`  ✓ ${location.code} already mapped to ${anchor.code}`);
      } else {
        await patch(`/spatial/nodes/${existing.id}`, {
          parentSpatialNodeId: parentNode.id,
          anchorId: anchor.id,
        });
        log(`  🔄 ${location.code} re-mapped to ${anchor.code}`);
      }
      if (!manifest.nodes.some((n) => n.id === existing.id)) {
        manifest.nodes.push({
          id: existing.id,
          locationId: location.id,
          locationCode: location.code,
          anchorCode: anchor.code,
          created: false,
        });
      }
      continue;
    }

    const node = await post('/spatial/nodes', {
      locationId: location.id,
      parentSpatialNodeId: parentNode.id,
      anchorId: anchor.id,
      positionX: 0,
      positionY: 0,
      positionZ: 0,
    });
    createdCount++;
    log(`  ➕ ${location.code} -> ${anchor.code} (Node ${node.id})`);
    manifest.nodes.push({
      id: node.id,
      locationId: location.id,
      locationCode: location.code,
      anchorCode: anchor.code,
      created: true,
    });
  }

  log(`  → ${createdCount} nested nodes created.`);
}

async function ensureComponents(manifest) {
  log('\n🧾 6. Setting up Demo Components...');
  const existingComponents = await get('/components');
  const compBySku = new Map(existingComponents.map((c) => [c.sku, c]));
  const componentsMap = new Map(); // sku -> compDto

  for (const spec of COMPONENTS) {
    let comp = compBySku.get(spec.sku);
    let created = false;

    if (!comp) {
      comp = await post('/components', {
        sku: spec.sku,
        name: spec.name,
        description: spec.description,
        unit: spec.unit,
        manufacturerPartNumber: spec.manufacturerPartNumber,
      });
      created = true;
      log(`  ➕ Created component ${spec.sku} (${comp.id})`);
    } else {
      log(`  ✓ Reusing component ${spec.sku} (${comp.id})`);
    }

    componentsMap.set(spec.sku, comp);
    if (!manifest.components.some((c) => c.id === comp.id)) {
      manifest.components.push({ id: comp.id, sku: comp.sku, created });
    }
  }

  return componentsMap;
}

async function ensureInventoryTransactions(manifest, { componentsMap, locationsMap }) {
  log('\n📊 7. Recording Demo Inventory Transactions...');
  const existingTx = await get('/inventory-transactions');
  const txByRef = new Map(existingTx.map((t) => [t.reference, t]));

  let createdCount = 0;
  for (const txSpec of INVENTORY_TRANSACTIONS) {
    const comp = componentsMap.get(txSpec.componentSku);
    if (!comp) {
      throw new Error(
        `Component '${txSpec.componentSku}' not found for transaction.`,
      );
    }

    const loc = locationsMap.get(txSpec.locationCode);
    if (!loc) {
      throw new Error(
        `Location '${txSpec.locationCode}' not found for transaction.`,
      );
    }

    const existing = txByRef.get(txSpec.reference);
    if (existing) {
      log(`  ✓ Transaction ${txSpec.reference} already recorded (${existing.id})`);
      if (!manifest.transactions.some((t) => t.id === existing.id)) {
        manifest.transactions.push({
          id: existing.id,
          reference: txSpec.reference,
          componentId: comp.id,
          locationId: loc.id,
          quantity: txSpec.quantity,
          created: false,
        });
      }
      continue;
    }

    const createdTx = await post('/inventory-transactions', {
      componentId: comp.id,
      destinationLocationId: loc.id,
      quantity: txSpec.quantity,
      unitOfMeasure: txSpec.unitOfMeasure,
      transactionType: txSpec.transactionType,
      reference: txSpec.reference,
      reason: txSpec.reason,
    });

    createdCount++;
    log(
      `  ➕ Stock Receipt: ${txSpec.quantity} ${txSpec.unitOfMeasure} of ${txSpec.componentSku} at ${txSpec.locationCode} (Tx: ${createdTx.id})`,
    );

    manifest.transactions.push({
      id: createdTx.id,
      reference: txSpec.reference,
      componentId: comp.id,
      locationId: loc.id,
      quantity: txSpec.quantity,
      created: true,
    });
  }

  log('\n⚡ 8. Rebuilding Inventory Projections...');
  try {
    await post('/inventory-projections/rebuild');
    log('  ✅ Inventory projections rebuilt successfully across location hierarchy.');
  } catch (error) {
    log(`  ⚠️ Note on projection rebuild: ${error.message}`);
  }

  return createdCount;
}

async function main() {
  log('================================================================');
  log('🚀 ANANYA SPATIAL INVENTORY DEMO DATA SEEDER');
  log('================================================================');

  await verifyEnvironment();

  let manifest = readManifest();

  if (SHOULD_RESET_FIRST) {
    log('\n🧹 Option --reset passed. Running cleanup first...');
    const { runCleanup } = await import('./cleanup.mjs');
    await runCleanup(true);
    manifest = readManifest();
  }

  const layoutGeometry = await buildLayoutGeometry();
  const models = deriveModels(layoutGeometry);

  // 1. Models & Anchors
  const { modelsMap, anchorsMap } = await ensureModelsAndAnchors(
    manifest,
    models,
  );

  // 2. Locations Hierarchy
  const locationsMap = await ensureLocations(manifest);

  // 3. Layouts through the real builder persistence path
  await ensureLayouts(manifest, { locationsMap, layoutGeometry });

  // 4. Models on builder-owned nodes
  await ensureNodeModelAssignments(manifest, { modelsMap, locationsMap });

  // 5. Deep-hierarchy nodes anchored on parent models
  await ensureNestedNodes(manifest, { modelsMap, anchorsMap, locationsMap });

  // 6. Components
  const componentsMap = await ensureComponents(manifest);

  // 7. Inventory Ledger Transactions & Projections
  await ensureInventoryTransactions(manifest, {
    componentsMap,
    locationsMap,
  });

  writeManifest(manifest);

  log('\n================================================================');
  log('🎉 SEEDING COMPLETE! SPATIAL DEMO DATASET IS READY');
  log('================================================================');
  log(`Total Spatial Models   : ${manifest.models.length}`);
  log(`Total Spatial Anchors  : ${manifest.anchors.length}`);
  log(`Total Locations        : ${manifest.locations.length}`);
  log(`Total Layouts          : ${manifest.layouts.length}`);
  log(`Anchored Child Nodes   : ${manifest.nodes.length}`);
  log(`Total Demo Components  : ${manifest.components.length}`);
  log(`Total Transactions     : ${manifest.transactions.length}`);
  log('================================================================\n');

  if (SHOULD_VERIFY) {
    const { runVerification } = await import('./verify.mjs');
    await runVerification({ manifest });
  }
}

main().catch((err) => {
  console.error('\n❌ Seeding failed:', err);
  process.exit(1);
});

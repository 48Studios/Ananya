/**
 * Spatial Demo dataset seeder.
 *
 * Safe, idempotent seed script that establishes a complete Spatial Inventory demo dataset.
 *
 * Usage:
 *   node tools/spatial-demo-dataset/seed.mjs
 *   node tools/spatial-demo-dataset/seed.mjs --reset
 */
import {
  API_BASE,
  del,
  get,
  log,
  patch,
  post,
  readManifest,
  writeManifest,
} from './lib.mjs';
import {
  COMPONENTS,
  INVENTORY_TRANSACTIONS,
  LOCATIONS_HIERARCHY,
  MODELS,
  SPATIAL_MAPPINGS,
} from './dataset.mjs';

const args = process.argv.slice(2);
const SHOULD_RESET_FIRST = args.includes('--reset');

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

async function ensureModelsAndAnchors(manifest) {
  log('\n📦 1. Setting up Spatial Models & Anchors...');
  const existingModels = await get('/spatial/models');
  const modelByCode = new Map(existingModels.map((m) => [m.code, m]));

  const modelsMap = new Map(); // code -> modelDto
  const anchorsMap = new Map(); // `${modelCode}:${anchorCode}` -> anchorDto

  for (const modelSpec of MODELS) {
    let model = modelByCode.get(modelSpec.code);
    let created = false;

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
      log(`  ✓ Reusing existing model ${model.code} (${model.id})`);
    }

    modelsMap.set(modelSpec.code, model);
    if (!manifest.models.some((m) => m.id === model.id)) {
      manifest.models.push({ id: model.id, code: model.code, created });
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
      loc = await post('/locations', {
        code: locSpec.code,
        name: locSpec.name,
        kind: locSpec.kind,
        parentId: parentId || undefined,
      });
      created = true;
      log(`  ➕ Created location [${loc.kind}] ${loc.code} -> ${loc.id}`);
    } else {
      log(`  ✓ Reusing location [${loc.kind}] ${loc.code} -> ${loc.id}`);
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

  return locationsMap;
}

async function ensureSpatialMappings(manifest, { modelsMap, anchorsMap, locationsMap }) {
  log('\n🗺️  3. Setting up Spatial Nodes & Mappings...');
  const existingNodes = await get('/spatial/nodes');
  const nodeByLocationId = new Map(existingNodes.map((n) => [n.locationId, n]));
  const nodesMap = new Map(); // locationCode -> nodeDto

  for (const mapping of SPATIAL_MAPPINGS) {
    const loc = locationsMap.get(mapping.locationCode);
    if (!loc) {
      throw new Error(`Location '${mapping.locationCode}' not found for spatial mapping.`);
    }

    let modelId = null;
    if (mapping.modelCode) {
      const model = modelsMap.get(mapping.modelCode);
      if (!model) throw new Error(`Model '${mapping.modelCode}' not found.`);
      modelId = model.id;
    }

    let parentSpatialNodeId = null;
    let anchorId = null;

    if (mapping.parentLocationCode) {
      const parentNode = nodesMap.get(mapping.parentLocationCode);
      if (!parentNode) {
        throw new Error(
          `Parent spatial node for location '${mapping.parentLocationCode}' not found before child '${mapping.locationCode}'.`,
        );
      }
      parentSpatialNodeId = parentNode.id;

      if (mapping.anchorCode) {
        // Find parent's model code
        const parentMapping = SPATIAL_MAPPINGS.find(
          (m) => m.locationCode === mapping.parentLocationCode,
        );
        if (!parentMapping || !parentMapping.modelCode) {
          throw new Error(
            `Parent mapping for '${mapping.parentLocationCode}' has no modelCode for anchor resolution.`,
          );
        }
        const anchorKey = `${parentMapping.modelCode}:${mapping.anchorCode}`;
        const anchor = anchorsMap.get(anchorKey);
        if (!anchor) {
          throw new Error(`Anchor '${anchorKey}' not found.`);
        }
        anchorId = anchor.id;
      }
    }

    let node = nodeByLocationId.get(loc.id);
    let created = false;

    if (!node) {
      node = await post('/spatial/nodes', {
        locationId: loc.id,
        modelId: modelId || undefined,
        parentSpatialNodeId: parentSpatialNodeId || undefined,
        anchorId: anchorId || undefined,
        positionX: 0,
        positionY: 0,
        positionZ: 0,
      });
      created = true;
      log(
        `  ➕ Mapped ${mapping.locationCode}${mapping.anchorCode ? ` -> anchor ${mapping.anchorCode}` : ''}${mapping.modelCode ? ` [model: ${mapping.modelCode}]` : ''} (Node ${node.id})`,
      );
    } else {
      // Ensure existing node matches configuration
      const needsUpdate =
        (modelId && node.modelId !== modelId) ||
        (parentSpatialNodeId && node.parentSpatialNodeId !== parentSpatialNodeId) ||
        (anchorId && node.anchorId !== anchorId);

      if (needsUpdate) {
        node = await patch(`/spatial/nodes/${node.id}`, {
          modelId: modelId || undefined,
          parentSpatialNodeId: parentSpatialNodeId || undefined,
          anchorId: anchorId || undefined,
        });
        log(`  🔄 Updated mapping for ${mapping.locationCode} (Node ${node.id})`);
      } else {
        log(`  ✓ Mapping already active for ${mapping.locationCode}`);
      }
    }

    nodesMap.set(mapping.locationCode, node);
    if (!manifest.nodes.some((n) => n.id === node.id)) {
      manifest.nodes.push({
        id: node.id,
        locationId: loc.id,
        locationCode: mapping.locationCode,
        created,
      });
    }
  }

  return nodesMap;
}

async function ensureComponents(manifest) {
  log('\n🧩 4. Setting up Demo Components...');
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
  log('\n📊 5. Recording Demo Inventory Transactions...');
  const existingTx = await get('/inventory-transactions');
  const txByRef = new Map(existingTx.map((t) => [t.reference, t]));

  let createdCount = 0;
  for (const txSpec of INVENTORY_TRANSACTIONS) {
    const comp = componentsMap.get(txSpec.componentSku);
    if (!comp) {
      throw new Error(`Component '${txSpec.componentSku}' not found for transaction.`);
    }

    const loc = locationsMap.get(txSpec.locationCode);
    if (!loc) {
      throw new Error(`Location '${txSpec.locationCode}' not found for transaction.`);
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

  log('\n⚡ 6. Rebuilding Inventory Projections...');
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

  // 1. Models & Anchors
  const { modelsMap, anchorsMap } = await ensureModelsAndAnchors(manifest);

  // 2. Locations Hierarchy
  const locationsMap = await ensureLocations(manifest);

  // 3. Spatial Nodes & Mappings
  const nodesMap = await ensureSpatialMappings(manifest, {
    modelsMap,
    anchorsMap,
    locationsMap,
  });

  // 4. Components
  const componentsMap = await ensureComponents(manifest);

  // 5. Inventory Ledger Transactions & Projections
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
  log(`Total Spatial Mappings : ${manifest.nodes.length}`);
  log(`Total Demo Components  : ${manifest.components.length}`);
  log(`Total Transactions     : ${manifest.transactions.length}`);
  log('================================================================\n');
}

main().catch((err) => {
  console.error('\n❌ Seeding failed:', err);
  process.exit(1);
});

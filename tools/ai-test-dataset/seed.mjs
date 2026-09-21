/**
 * AI-TEST dataset — seeder.
 *
 * Creates the dataset described in `dataset.mjs` through the real HTTP API.
 * Every created id is recorded in `manifest.json` so `cleanup.mjs` can remove
 * the dataset deterministically.
 *
 * Usage:  node tools/ai-test-dataset/seed.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CATEGORIES,
  CATEGORY_BINDINGS,
  COMPONENTS,
  DOCUMENTS,
  MANUFACTURERS,
  SUSPICIOUS_BINDINGS,
} from './dataset.mjs';
import {
  TMP_DIR,
  log,
  get,
  post,
  readManifest,
  sequentially,
  textToPdf,
  upload,
  writeManifest,
} from './lib.mjs';

mkdirSync(TMP_DIR, { recursive: true });

const manifest = readManifest();
manifest.createdAt = new Date().toISOString();

// ---------------------------------------------------------------------------
// 1. Manufacturers — created only when the code is absent.
// ---------------------------------------------------------------------------

async function ensureManufacturers() {
  const existing = await get('/manufacturers');
  const byCode = new Map(existing.map((m) => [m.code, m]));
  const recorded = new Map(manifest.manufacturers.map((m) => [m.code, m]));
  for (const spec of MANUFACTURERS) {
    const found = byCode.get(spec.code);
    if (found) {
      // Adopt a pre-existing record rather than duplicating it.
      recorded.set(spec.code, { ...spec, id: found.id, adopted: true });
      continue;
    }
    const created = await post('/manufacturers', spec);
    recorded.set(spec.code, { ...spec, id: created.id, adopted: false });
    log(`  manufacturer ${spec.code} -> ${created.id}`);
  }
  manifest.manufacturers = [...recorded.values()];
}

// ---------------------------------------------------------------------------
// 2. Categories — parents before children.
// ---------------------------------------------------------------------------

async function ensureCategories() {
  const existing = await get('/categories');
  const byCode = new Map(existing.map((c) => [c.code, c]));
  const idByCode = new Map(byCode);
  const recorded = new Map(manifest.categories.map((c) => [c.code, c]));

  for (const spec of CATEGORIES) {
    const found = byCode.get(spec.code);
    if (found) {
      recorded.set(spec.code, { ...spec, id: found.id, adopted: true });
      idByCode.set(spec.code, found);
      continue;
    }
    const parentId = spec.parent ? idByCode.get(spec.parent)?.id : null;
    const created = await post('/categories', {
      code: spec.code,
      name: spec.name,
      ...(parentId ? { parentId } : {}),
    });
    idByCode.set(spec.code, created);
    recorded.set(spec.code, { ...spec, id: created.id, adopted: false });
    log(`  category ${spec.code} -> ${created.id}`);
  }
  manifest.categories = [...recorded.values()];
  return idByCode;
}

// ---------------------------------------------------------------------------
// 3. Components (with inline attribute values).
// ---------------------------------------------------------------------------

async function createComponents(context) {
  for (const spec of COMPONENTS) {
    if (manifest.components.some((c) => c.key === spec.key)) {
      log(`  component ${spec.key} already seeded, skipping`);
      continue;
    }
    const body = {
      name: spec.name,
      unit: spec.unit,
      description: spec.description,
      // `manufacturerPartNumber` is nullable; omit it when the test case is
      // deliberately MPN-less so the column stays NULL rather than ''.
      ...(spec.mpn ? { manufacturerPartNumber: spec.mpn } : {}),
      ...(spec.manufacturer
        ? { manufacturerId: context.manufacturerByCode.get(spec.manufacturer) }
        : {}),
      ...(spec.category
        ? { categoryId: context.categoryByCode.get(spec.category) }
        : {}),
      ...(spec.attributes.length > 0 ? { attributes: spec.attributes } : {}),
    };
    const created = await post('/components', body);
    manifest.components.push({
      key: spec.key,
      group: spec.group,
      id: created.id,
      sku: created.sku,
      name: spec.name,
      mpn: spec.mpn,
      manufacturer: spec.manufacturer,
      category: spec.category,
      attributeCount: spec.attributes.length,
    });
    log(`  [${spec.group}] ${spec.name} -> ${created.sku} (${created.id})`);
  }
}

// ---------------------------------------------------------------------------
// 4. Category attribute bindings.
// ---------------------------------------------------------------------------

async function createBindings(context) {
  const existing = await get('/attributes');
  const defByCode = new Map(existing.map((d) => [d.code, d]));

  const bind = async (attributeCode, categoryCode, note) => {
    const definition = defByCode.get(attributeCode);
    if (!definition) throw new Error(`No attribute definition '${attributeCode}'`);
    const categoryId = context.categoryByCode.get(categoryCode);
    if (!categoryId) throw new Error(`No category '${categoryCode}'`);
    const created = await post(`/attributes/${definition.id}/categories`, {
      categoryId,
    });
    manifest.bindings.push({
      id: created?.id ?? null,
      attributeCode,
      categoryCode,
      attributeDefinitionId: definition.id,
      categoryId,
      ...(note ? { note } : {}),
    });
  };

  for (const [categoryCode, attributeCodes] of Object.entries(
    CATEGORY_BINDINGS,
  )) {
    for (const attributeCode of attributeCodes) {
      await bind(attributeCode, categoryCode);
      log(`  binding ${attributeCode} -> ${categoryCode}`);
    }
  }

  // Deliberate fixture: the only input shape the audit's SUSPICIOUS_BINDING
  // rule recognises (resistance bound to a capacitor/diode category).
  for (const spec of SUSPICIOUS_BINDINGS) {
    await bind(spec.attributeCode, spec.categoryCode, 'SYNTHETIC_FIXTURE_SUSPICIOUS_BINDING');
    log(
      `  binding ${spec.attributeCode} -> ${spec.categoryCode} (suspicious-binding fixture)`,
    );
  }
}

// ---------------------------------------------------------------------------
// 5. Documents (generated, clearly marked).
// ---------------------------------------------------------------------------

async function createDocuments() {
  for (const spec of DOCUMENTS) {
    if (manifest.documents.some((d) => d.key === spec.key)) {
      log(`  document ${spec.key} already seeded, skipping`);
      continue;
    }
    const component = manifest.components.find(
      (c) => c.key === spec.componentKey,
    );
    if (!component) {
      throw new Error(`Document ${spec.key} references unknown component ${spec.componentKey}`);
    }

    let file;
    if (spec.textFile) {
      const bytes = Buffer.from(spec.build().join('\n'), 'utf8');
      file = {
        name: spec.fileName,
        bytes,
        mimeType: spec.fileName.endsWith('.dxf')
          ? 'image/vnd.dxf'
          : 'text/plain',
      };
    } else {
      const sourcePath = join(TMP_DIR, `${spec.key}.txt`);
      const { bytes } = textToPdf(spec.build(), sourcePath);
      file = { name: spec.fileName, bytes, mimeType: 'application/pdf' };
    }

    const created = await upload(
      '/documents/upload',
      {
        entityType: 'Component',
        entityId: component.id,
        documentType: spec.documentType,
        title: spec.title,
        description: `Generated test document for ${component.name}`,
        tags: 'ai-test,generated',
      },
      file,
    );
    writeFileSync(join(TMP_DIR, spec.fileName), file.bytes);
    manifest.documents.push({
      key: spec.key,
      id: created.id,
      componentKey: spec.componentKey,
      componentId: component.id,
      fileName: spec.fileName,
      documentType: spec.documentType,
      analyze: spec.analyze,
      bytes: file.bytes.length,
    });
    log(`  document ${spec.key} -> ${created.id}`);
  }
}

// ---------------------------------------------------------------------------

async function main() {
  log('AI-TEST dataset seed');
  log('1. manufacturers');
  await ensureManufacturers();
  log('2. categories');
  const categoryByCode = await ensureCategories();

  const context = {
    categoryByCode: new Map(
      manifest.categories.map((c) => [c.code, c.id]),
    ),
    manufacturerByCode: new Map(
      manifest.manufacturers.map((m) => [m.code, m.id]),
    ),
  };

  log('3. components');
  await createComponents(context);
  log('4. category attribute bindings');
  await createBindings(context);
  log('5. documents');
  await createDocuments();

  manifest.notes = [
    'Manufacturers and categories did not exist before this dataset; all were created here except those reported with adopted:true.',
    'SUSPICIOUS_BINDINGS is a deliberate fixture: the attribute audit emits SUSPICIOUS_BINDING only for resistance bound to a capacitor/diode category.',
  ];
  writeManifest(manifest);

  log('');
  log(`manufacturers: ${manifest.manufacturers.length}`);
  log(`categories:    ${manifest.categories.length}`);
  log(`components:    ${manifest.components.length}`);
  log(`bindings:      ${manifest.bindings.length}`);
  log(`documents:     ${manifest.documents.length}`);
  log(`manifest:      tools/ai-test-dataset/manifest.json`);
}

main().catch((error) => {
  writeManifest(manifest);
  console.error('SEED FAILED', error);
  process.exitCode = 1;
});

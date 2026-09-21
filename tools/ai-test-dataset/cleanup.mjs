/**
 * AI-TEST dataset — deterministic cleanup.
 *
 * Removes exactly the records this dataset created. Ownership comes from
 * `manifest.json` (explicit ids recorded at seed time) plus the `AI-TEST-`
 * namespace — never from a timestamp window and never from a table truncation.
 *
 *   node tools/ai-test-dataset/cleanup.mjs             # dry run (default)
 *   node tools/ai-test-dataset/cleanup.mjs --execute   # perform the deletion
 *   node tools/ai-test-dataset/cleanup.mjs --execute --include-library-findings
 *
 * `--include-library-findings` additionally removes attribute-library findings
 * that describe the PRE-EXISTING (Data Pack) attribute definitions. Those are
 * legitimate findings about real reference data, so they are kept by default.
 */
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { TMP_DIR, api, log, readManifest, writeManifest } from './lib.mjs';

const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const INCLUDE_LIBRARY = args.includes('--include-library-findings');
const DB_CONTAINER = process.env.ANANYA_DB_CONTAINER ?? 'ananya-db';

const manifest = readManifest();

/** Runs SQL and returns rows as arrays of strings. */
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

/** Single-quoted SQL literal list from an id array. */
const idList = (ids) =>
  ids.length === 0 ? null : ids.map((id) => `'${id}'`).join(',');

async function deleteDocuments(plan) {
  for (const doc of manifest.documents) {
    plan.push(`document ${doc.key} (${doc.id})`);
  }
  if (!EXECUTE) return;
  for (const doc of manifest.documents) {
    try {
      // The API deletes the storage object before the row, so no orphan file
      // is left behind.
      await api('DELETE', `/documents/${doc.id}`);
    } catch (error) {
      if (error.status !== 404) throw error;
    }
  }
}

function deleteFeedbackAndEvents(plan) {
  const componentIds = manifest.components.map((c) => c.id);
  const list = idList(componentIds);
  if (!list) return;

  const feedback = sqlValue(
    `select count(*) from ai_suggestion_feedback where component_id in (${list})`,
  );
  const events = sqlValue(
    `select count(*) from activity_events where entity_id in (${list})`,
  );
  const audits = sqlValue(
    `select count(*) from security_audit_logs where details->>'componentId' in (${list})`,
  );
  const findings = sqlValue(
    `select count(*) from component_intelligence_findings where component_id in (${list}) or related_component_id in (${list})`,
  );
  plan.push(
    `ai_suggestion_feedback rows: ${feedback}`,
    `activity_events rows: ${events}`,
    `security_audit_logs rows (component-scoped): ${audits}`,
    `component_intelligence_findings rows: ${findings}`,
  );

  if (!EXECUTE) return;
  // Feedback and activity/audit rows have no enforcing FK (SET NULL / none), so
  // they must be removed explicitly BEFORE the component is deleted.
  sql(`delete from ai_suggestion_feedback where component_id in (${list});`);
  sql(`delete from activity_events where entity_id in (${list});`);
  sql(
    `delete from security_audit_logs where details->>'componentId' in (${list});`,
  );
  sql(
    `delete from component_intelligence_findings where component_id in (${list}) or related_component_id in (${list});`,
  );
}

async function deleteComponents(plan) {
  for (const component of manifest.components) {
    plan.push(`component ${component.key} ${component.sku} (${component.id})`);
  }
  if (!EXECUTE) return;
  for (const component of manifest.components) {
    try {
      await api('DELETE', `/components/${component.id}`);
    } catch (error) {
      if (error.status !== 404) throw error;
    }
  }
}

async function deleteBindings(plan) {
  for (const binding of manifest.bindings) {
    plan.push(
      `category binding ${binding.attributeCode} -> ${binding.categoryCode}`,
    );
  }
  if (!EXECUTE) return;
  for (const binding of manifest.bindings) {
    try {
      await api(
        'DELETE',
        `/attributes/${binding.attributeDefinitionId}/categories/${binding.categoryId}`,
      );
    } catch (error) {
      if (error.status !== 404) throw error;
    }
  }
}

function deleteAttributeFindings(plan) {
  const categoryIds = manifest.categories.map((c) => c.id);
  const list = idList(categoryIds);
  if (!list) return;
  const createdDefinitions = manifest.createdAttributeDefinitionIds ?? [];
  const definitionCondition =
    createdDefinitions.length > 0
      ? ` or attribute_definition_id in (${idList(createdDefinitions)})`
      : '';

  const owned = sqlValue(
    `select count(*) from attribute_intelligence_findings where category_id in (${list})${definitionCondition}`,
  );
  const library = sqlValue(
    `select count(*) from attribute_intelligence_findings where category_id is null and attribute_definition_id is not null`,
  );
  plan.push(
    `attribute_intelligence_findings owned by the dataset (category or created definition): ${owned}`,
    `attribute_intelligence_findings about the pre-existing Data Pack library: ${library}${INCLUDE_LIBRARY ? ' (will be removed)' : ' (kept)'}`,
  );

  if (!EXECUTE) return;
  sql(
    `delete from attribute_intelligence_findings where category_id in (${list})${definitionCondition};`,
  );
  if (INCLUDE_LIBRARY) {
    sql(
      `delete from attribute_intelligence_findings where category_id is null and attribute_definition_id is not null;`,
    );
  }
}

async function deleteCategories(plan) {
  // Children before parents so the self-referencing FK never blocks a delete
  // (the API refuses a parent that still has subcategories).
  const ordered = [...manifest.categories].sort(
    (a, b) => Number(Boolean(b.parent)) - Number(Boolean(a.parent)),
  );
  for (const category of ordered) {
    plan.push(`category ${category.code} ${category.name} (${category.id})`);
  }
  if (!EXECUTE) return;
  for (const category of ordered) {
    try {
      await api('DELETE', `/categories/${category.id}`);
    } catch (error) {
      if (error.status !== 404) throw error;
    }
  }
}

async function deleteManufacturers(plan) {
  for (const manufacturer of manifest.manufacturers) {
    plan.push(
      `manufacturer ${manufacturer.code} ${manufacturer.name} (${manufacturer.id})`,
    );
  }
  if (!EXECUTE) return;
  for (const manufacturer of manifest.manufacturers) {
    try {
      await api('DELETE', `/manufacturers/${manufacturer.id}`);
    } catch (error) {
      if (error.status !== 404) throw error;
    }
  }
}

function removeStorageFiles(plan) {
  const docIds = manifest.documents.map((d) => d.id);
  if (docIds.length === 0) return;
  const conditions = docIds.map((id) => `storage_key like '%_${id}_%'`).join(' or ');
  const remaining = sql(
    `select storage_key from documents where ${conditions};`,
  ).map((row) => row[0]);
  plan.push(
    `leftover storage objects matching dataset document ids: ${remaining.length}`,
  );
  if (!EXECUTE || remaining.length === 0) return;
  for (const key of remaining) {
    rmSync(join(process.cwd(), 'apps/api/uploads', key), { force: true });
  }
}

function reportVerification() {
  const componentIds = idList(manifest.components.map((c) => c.id));
  const categoryIds = idList(manifest.categories.map((c) => c.id));
  const manufacturerIds = idList(manifest.manufacturers.map((m) => m.id));
  const rows = [];
  if (componentIds) {
    rows.push([
      'components',
      sqlValue(`select count(*) from components where id in (${componentIds})`),
    ]);
    rows.push([
      'component findings',
      sqlValue(
        `select count(*) from component_intelligence_findings where component_id in (${componentIds})`,
      ),
    ]);
    rows.push([
      'feedback',
      sqlValue(
        `select count(*) from ai_suggestion_feedback where component_id in (${componentIds})`,
      ),
    ]);
    rows.push([
      'documents (namespace)',
      sqlValue(
        `select count(*) from documents where title like 'AI TEST DOCUMENT%'`,
      ),
    ]);
  }
  if (categoryIds) {
    rows.push([
      'categories',
      sqlValue(`select count(*) from categories where id in (${categoryIds})`),
    ]);
    rows.push([
      'attribute findings (dataset)',
      sqlValue(
        `select count(*) from attribute_intelligence_findings where category_id in (${categoryIds})`,
      ),
    ]);
  }
  if (manufacturerIds) {
    rows.push([
      'manufacturers',
      sqlValue(
        `select count(*) from manufacturers where id in (${manufacturerIds})`,
      ),
    ]);
  }
  log('');
  log('verification (all should be 0):');
  for (const [label, value] of rows) log(`  ${label}: ${value}`);
}

async function main() {
  log(
    `AI-TEST dataset cleanup — ${EXECUTE ? 'EXECUTE' : 'DRY RUN (pass --execute to delete)'}`,
  );
  if (manifest.components.length === 0 && manifest.categories.length === 0) {
    log('manifest is empty; nothing to do');
    return;
  }

  const plan = [];
  await deleteDocuments(plan);
  deleteFeedbackAndEvents(plan);
  await deleteComponents(plan);
  await deleteBindings(plan);
  deleteAttributeFindings(plan);
  await deleteCategories(plan);
  await deleteManufacturers(plan);
  removeStorageFiles(plan);

  log('');
  log(`deletion plan (${plan.length} entries):`);
  for (const entry of plan) log(`  - ${entry}`);

  if (EXECUTE) {
    rmSync(TMP_DIR, { recursive: true, force: true });
    const emptied = {
      ...manifest,
      cleanedAt: new Date().toISOString(),
      lastCleanup: {
        manufacturers: manifest.manufacturers.length,
        categories: manifest.categories.length,
        components: manifest.components.length,
        bindings: manifest.bindings.length,
        documents: manifest.documents.length,
      },
      manufacturers: [],
      categories: [],
      components: [],
      documents: [],
      bindings: [],
      findings: [],
    };
    writeManifest(emptied);
    reportVerification();
  }
}

main().catch((error) => {
  console.error('CLEANUP FAILED', error);
  process.exitCode = 1;
});

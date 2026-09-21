/**
 * AI-TEST dataset — test-data index generator.
 *
 * Writes `README.md` from `manifest.json` plus the LIVE review queues, so the
 * index can never drift from what is actually in the database. Read-only apart
 * from writing README.md.
 *
 * Usage:  node tools/ai-test-dataset/report.mjs
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, MANIFEST_PATH, get, log, readManifest } from './lib.mjs';

const manifest = readManifest();

const GROUP_TITLES = {
  A: 'A — clean, fully classified baseline',
  B: 'B — deliberately incomplete classification',
  C: 'C — MPN / identity extraction',
  'D1-exact': 'D1 — exact duplicate (identical normalized MPN)',
  'D2-packaging': 'D2 — packaging variant',
  'D3-semantic': 'D3 — semantic name similarity',
  'D4-mfr-conflict': 'D4 — identical MPN, conflicting manufacturers',
  E: 'E — interconnect, discretes, modules',
  'H-conflict': 'H — deliberate identity conflicts',
};

function mdTable(headers, rows) {
  const head = `| ${headers.join(' | ')} |`;
  const rule = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.join(' | ')} |`);
  return [head, rule, ...body].join('\n');
}

async function loadQueues() {
  const component = await get(
    '/ml/components/review-queue?pageSize=100&status=PENDING',
  );
  const attribute = await get(
    '/ml/attributes/review-queue?pageSize=100&status=PENDING',
  );
  return {
    component: component.items ?? component.findings ?? [],
    attribute: attribute.items ?? attribute.findings ?? [],
  };
}

function groupComponents() {
  const byGroup = new Map();
  for (const component of manifest.components) {
    const key = component.group ?? 'Z';
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(component);
  }
  return byGroup;
}

function documentsFor(componentKey) {
  return manifest.documents.filter((d) => d.componentKey === componentKey);
}

async function main() {
  const queue = await loadQueues();
  const byGroup = groupComponents();
  const componentByKey = new Map(manifest.components.map((c) => [c.key, c]));

  const findingsFor = (componentId) =>
    queue.component.filter(
      (f) =>
        f.componentId === componentId || f.relatedComponentId === componentId,
    );

  const lines = [];
  const push = (...args) => lines.push(...args);

  push('# AI-TEST dataset — test data index');
  push('');
  push(
    'Generated test dataset for manually exercising the Ananya intelligence stack.',
    'Everything here is **test data**: it is namespaced `AI-TEST-`, created through the',
    'real HTTP API, and removable with one command.',
  );
  push('');
  push(`Generated: ${new Date().toISOString()}`);
  push('');
  push('## Contents');
  push('');
  push(
    mdTable(
      ['Record', 'Count'],
      [
        ['Manufacturers (ERP)', manifest.manufacturers.length],
        ['Categories (ERP)', manifest.categories.length],
        ['Components', manifest.components.length],
        ['Documents', manifest.documents.length],
        [
          'Document versions',
          manifest.documents.length,
        ],
        ['Category attribute bindings', manifest.bindings.length],
        ['Component findings (PENDING)', queue.component.length],
        ['Attribute findings (PENDING)', queue.attribute.length],
      ],
    ),
  );
  push('');
  push('## Components');
  push('');
  push(
    'Search `AI-TEST-` in the components list to find all of them. `purpose` is the',
    'test intent, not a description of the record.',
  );
  push('');

  for (const [group, components] of [...byGroup.entries()].sort()) {
    push(`### Group ${GROUP_TITLES[group] ?? group}`);
    push('');
    push(
      mdTable(
        ['Key', 'SKU', 'Name', 'Manufacturer', 'Category', 'MPN', 'Intent'],
        components.map((c) => [
          c.key,
          `\`${c.sku}\``,
          `\`${c.name}\``,
          c.manufacturer ?? '—',
          c.category ?? '—',
          c.mpn ? `\`${c.mpn}\`` : '—',
          (c.group ?? '').startsWith('D')
            ? 'duplicate scenario'
            : (c.group ?? '').startsWith('H')
              ? 'identity conflict'
              : '',
        ]),
      ),
    );
    push('');
  }

  push('## Duplicate scenarios');
  push('');
  const duplicateFindings = queue.component.filter(
    (f) => f.issueType === 'EXACT_DUPLICATE' || f.issueType === 'POTENTIAL_DUPLICATE',
  );
  push(
    mdTable(
      ['Finding id', 'Rule (matchType)', 'Pair', 'Confidence'],
      duplicateFindings.map((f) => {
        const other =
          f.componentId === f.component?.id ? f.relatedComponent : f.component;
        return [
          `\`${f.id}\``,
          `\`${f.suggestedValue?.matchType ?? f.issueType}\``,
          `${f.component?.name ?? f.componentId}<br>↔ ${other?.name ?? f.relatedComponentId}`,
          `${f.confidence} ${f.confidenceLevel}`,
        ];
      }),
    ),
  );
  push('');
  push(
    'The **consolidation test pair** is the `EXACT_MPN` row above',
    '(group D1: `AI-TEST-DUP-EXACT-YAGEO-33K-A` / `-B`). The preview for that finding',
    'reports `executable: true` with no blocked reasons, so the',
    'Duplicate Finding → Investigation → Preview → Consolidate walkthrough can be',
    'completed end to end. The other pairs are review-only by design.',
  );
  push('');

  push('## Datasheet-driven scenarios');
  push('');
  const docComponents = [
    ...new Set(manifest.documents.map((d) => d.componentKey)),
  ].sort();
  push(
    mdTable(
      ['Key', 'Component', 'Documents', 'Analyzable'],
      docComponents.map((key) => {
        const component = componentByKey.get(key);
        const docs = documentsFor(key);
        return [
          key,
          `\`${component?.name ?? key}\``,
          docs.map((d) => `\`${d.documentType}\``).join(', '),
          docs.filter((d) => d.analyze).length,
        ];
      }),
    ),
  );
  push('');
  push('### Document conflict');
  push('');
  const conflict = queue.component.find(
    (f) => f.issueType === 'DOCUMENT_CONFLICT',
  );
  if (conflict) {
    push(
      `Component \`${conflict.component?.name}\` (${conflict.componentId}) carries two`,
      'datasheets that state **different voltage ratings** (25 V and 50 V). The',
      `aggregate reports \`${conflict.issueType}\` with no value offered, and both`,
      'documents are listed as evidence. Conflicts are review-only: the type is',
      'deliberately absent from the apply rules.',
    );
  } else {
    push('_No DOCUMENT_CONFLICT finding is currently pending._');
  }
  push('');

  push('### Attribute-value suggestions');
  push('');
  const attributeValueSuggestions = queue.component.filter(
    (f) => f.issueType === 'ATTRIBUTE_VALUE_SUGGESTION',
  );
  const byComponent = new Map();
  for (const finding of attributeValueSuggestions) {
    const name = finding.component?.name ?? finding.componentId;
    byComponent.set(name, (byComponent.get(name) ?? 0) + 1);
  }
  push(
    mdTable(
      ['Component', 'Pending value suggestions'],
      [...byComponent.entries()]
        .sort()
        .map(([name, count]) => [`\`${name}\``, String(count)]),
    ),
  );
  push('');
  push(
    'Group B and group C components record fewer attributes than their datasheet',
    'states, which is what produces these. Apply one through the component detail',
    'page (`Accept & Apply`) and re-run the analysis to see the row become',
    '`VALUE_ALREADY_CURRENT`.',
  );
  push('');

  push('## Attribute definition creation candidates');
  push('');
  const createCandidates = queue.attribute.filter(
    (f) =>
      f.issueType === 'MISSING_EXPECTED_ATTRIBUTE' &&
      !f.attributeDefinitionId &&
      !f.attributeDefinition,
  );
  if (createCandidates.length > 0) {
    push(
      mdTable(
        ['Finding id', 'Category', 'Proposed attribute', 'Data type', 'Default unit'],
        createCandidates.slice(0, 12).map((f) => [
          `\`${f.id}\``,
          `\`${f.category?.name ?? f.categoryId}\``,
          `\`${f.suggestedValue?.canonicalCode ?? '?'}\` (${f.suggestedValue?.canonicalName ?? '?'})`,
          `\`${f.suggestedValue?.dataType ?? '—'}\``,
          `\`${f.suggestedValue?.defaultUnit ?? '—'}\``,
        ]),
      ),
    );
    push('');
    push(
      `${createCandidates.length} findings propose an attribute definition that does not`,
      'exist in the library. Accept one, then **Create Attribute** to exercise',
      '`MISSING_EXPECTED_ATTRIBUTE → CREATE_DEFINITION`. The `inductance` proposal for',
      '`Inductors` is the cleanest: the unit catalogue already has `uH` under the',
      '`Inductance` dimension, so the whole validation path succeeds.',
    );
  } else {
    push('_None currently pending._');
  }
  push('');

  push('## Attribute review queue families');
  push('');
  const attributeByType = queue.attribute.reduce((acc, f) => {
    acc[f.issueType] = (acc[f.issueType] ?? 0) + 1;
    return acc;
  }, {});
  push(
    mdTable(
      ['Issue type', 'Pending'],
      Object.entries(attributeByType)
        .sort()
        .map(([type, count]) => [`\`${type}\``, String(count)]),
    ),
  );
  push('');
  push(
    '`SUSPICIOUS_BINDING` is produced by a **deliberate fixture**: the audit rule',
    'only fires for `resistance` bound to a capacitor/diode category, so',
    '`resistance → Capacitors` is seeded and removed by cleanup like everything else.',
  );
  push('');

  push('## Skill / pipeline coverage');
  push('');
  push(
    mdTable(
      ['Findings by type (component queue, PENDING)', 'Count'],
      Object.entries(
        queue.component.reduce((acc, f) => {
          acc[f.issueType] = (acc[f.issueType] ?? 0) + 1;
          return acc;
        }, {}),
      )
        .sort()
        .map(([type, count]) => [`\`${type}\``, String(count)]),
    ),
  );
  push('');

  push('## Commands');
  push('');
  push('```bash');
  push('# 1. verify the dataset will not produce false MPN findings');
  push('node tools/ai-test-dataset/verify-extraction.mjs');
  push('');
  push('# 2. create the dataset (idempotent; adopts existing master data by code)');
  push('node tools/ai-test-dataset/seed.mjs');
  push('');
  push('# 3. run every intelligence producer over it');
  push('node tools/ai-test-dataset/run-pipelines.mjs');
  push('');
  push('# 4. regenerate this index');
  push('node tools/ai-test-dataset/report.mjs');
  push('');
  push('# 5. remove the dataset (dry run first)');
  push('node tools/ai-test-dataset/cleanup.mjs');
  push('node tools/ai-test-dataset/cleanup.mjs --execute');
  push('```');
  push('');
  push(
    'The scripts need a session token in `/tmp/ai-test-token.env` (or `ANANYA_TOKEN`)',
    'for the supplied user, and a running API on `http://localhost:4000`.',
  );
  push('');

  push('## Cleanup guarantees');
  push('');
  push(
    '- Ownership comes from `manifest.json` (explicit ids) plus the `AI-TEST-` namespace.',
    '- No time-window deletes, no `TRUNCATE`, no removal of reference data outside the dataset.',
    '- Cleanup is a **dry run by default**; `--execute` performs it and verifies every count at 0.',
    '- Documents are deleted through the API so their storage objects are removed too.',
  );
  push('');

  writeFileSync(join(HERE, 'README.md'), `${lines.join('\n')}\n`);
  log(`README.md written (${lines.length} lines)`);
  log(`manifest: ${MANIFEST_PATH}`);
}

main().catch((error) => {
  console.error('REPORT FAILED', error);
  process.exitCode = 1;
});

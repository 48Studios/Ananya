/**
 * AI-TEST dataset — extraction pre-flight.
 *
 * Runs the REAL compiled MPN extractor over every component name + description
 * and reports what the review-queue analyzer would identify, so a dataset edit
 * that accidentally introduces a false MPN finding is caught before seeding.
 *
 * Read-only. Usage: node tools/ai-test-dataset/verify-extraction.mjs
 * Requires `pnpm --filter @ananya/api build` to have produced dist/.
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { COMPONENTS, MANUFACTURERS } from './dataset.mjs';
import { HERE, log } from './lib.mjs';

const require = createRequire(import.meta.url);
const distPath = join(
  HERE,
  '..',
  '..',
  'apps',
  'api',
  'dist',
  'src',
  'ml',
  'component-duplicate-intelligence.js',
);
const {
  extractCandidateMpnFromText,
  areEquivalentMpns,
  normalizeMpn,
} = require(distPath);

const manufacturerTerms = MANUFACTURERS.map((m) => ({
  name: m.name,
  code: m.code,
}));

// Data Pack package patterns (electronics-smd-pack.ts) — the extractor skips
// tokens that are footprint codes.
const PACKAGE_PATTERNS = [
  '0201',
  '0402',
  '0603',
  '0805',
  '1206',
  '1210',
  '2010',
  '2512',
  'axial',
  'SOT-23',
  'SOT-223',
  'SOIC-8',
  'SOIC-14',
  'TSSOP-16',
  'DIP-8',
  'QFN-32',
  'LQFP-48',
  'BGA',
  'TO-220',
  'SOD-123',
  'SOD-323',
  'SMA',
  'SMB',
  'SMC',
  'TO-252',
  'DFN',
  'QFP',
];

let problems = 0;

log('component | persisted MPN | extracted from name+description | verdict');
log('---');
for (const component of COMPONENTS) {
  const text = [component.name, component.description]
    .filter(Boolean)
    .join(' ');
  const extracted = extractCandidateMpnFromText(
    text,
    manufacturerTerms,
    PACKAGE_PATTERNS,
  );
  const persisted = component.mpn ?? null;

  let verdict;
  if (component.expectedExtractedMpn) {
    // Deliberate conflict fixture: the analyzer is SUPPOSED to flag this.
    verdict =
      extracted === component.expectedExtractedMpn
        ? `ok (intentional MPN_CONFLICT fixture: extracts ${extracted})`
        : `PROBLEM: expected the intentional conflict to extract ${component.expectedExtractedMpn}`;
    if (verdict.startsWith('PROBLEM')) problems += 1;
  } else if (!extracted) {
    verdict = 'ok (nothing extracted)';
  } else if (!persisted) {
    verdict = 'EXPECTED mpn-discovery case';
  } else if (areEquivalentMpns(normalizeMpn(persisted), normalizeMpn(extracted))) {
    verdict = 'ok (equivalent)';
  } else {
    verdict = 'PROBLEM: analyzer would raise MPN_CONFLICT';
    problems += 1;
  }

  const flag = verdict.startsWith('PROBLEM') ? ' <<<' : '';
  log(
    `${component.key.padEnd(4)} | ${String(persisted).padEnd(24)} | ${String(extracted).padEnd(24)} | ${verdict}${flag}`,
  );
}

log('---');
log(problems === 0 ? 'no extraction problems found' : `${problems} problem(s)`);
process.exitCode = problems === 0 ? 0 : 1;

/**
 * AI-TEST dataset — intelligence pipeline runner.
 *
 * Runs the REAL producers over the seeded dataset and records what they
 * produced. Nothing here fabricates a finding: every finding in the review
 * queues is created by the application's own audit / analysis services.
 *
 * Usage:  node tools/ai-test-dataset/run-pipelines.mjs
 */
import { log, get, post, readManifest, writeManifest } from './lib.mjs';

const manifest = readManifest();

function summarise(label, value) {
  log(`  ${label}: ${JSON.stringify(value)}`);
}

async function runComponentAudit() {
  log('1. component review queue audit (scope ALL)');
  const result = await post('/ml/components/review-queue/audit', {
    scope: 'ALL',
    limit: 100,
  });
  manifest.pipeline = manifest.pipeline ?? {};
  manifest.pipeline.componentAudit = {
    scope: result.scope,
    intelligenceVersion: result.intelligenceVersion,
    analyzedCount: result.analyzedCount,
    persistedCount: result.persistedCount,
    staledCount: result.staledCount,
    failedCount: result.failedCount,
    notFoundCount: result.notFoundCount,
    mlActiveCount: result.mlActiveCount,
    duplicateFindingsCount: result.duplicateFindingsCount,
    duplicateFindingsTruncated: result.duplicateFindingsTruncated,
    semanticFindingsCount: result.semanticFindingsCount,
    semanticCandidatesConsidered: result.semanticCandidatesConsidered,
    semanticCandidatesAccepted: result.semanticCandidatesAccepted,
    semanticRejectionReasons: result.semanticRejectionReasons,
    findingsByCategory: result.findingsByCategory,
    pendingTotal: result.pendingTotal,
    batchLimitReached: result.batchLimitReached,
    durationMs: result.durationMs,
  };
  summarise('analyzed', result.analyzedCount);
  summarise('persisted', result.persistedCount);
  summarise('staled', result.staledCount);
  summarise('byCategory', result.findingsByCategory);
  summarise('duplicateFindings', result.duplicateFindingsCount);
  summarise('semanticFindings', result.semanticFindingsCount);
  return result;
}

async function runAttributeAudit() {
  log('2. attribute intelligence audit (whole library)');
  const result = await post('/ml/attributes/review-queue/audit', {});
  manifest.pipeline = manifest.pipeline ?? {};
  manifest.pipeline.attributeAudit = {
    source: result.source,
    intelligenceVersion: result.intelligenceVersion,
    scannedCount: result.scannedCount,
    scannedCategoryCount: result.scannedCategoryCount,
    rawFindingCount: result.rawFindingCount,
    persistedCount: result.persistedCount,
    createdCount: result.createdCount,
    staleCount: result.staleCount,
    skippedCount: result.skippedCount,
    warningCount: result.warningCount,
    warnings: result.warnings,
    byIssueType: result.byIssueType,
  };
  summarise('persisted', result.persistedCount);
  summarise('byIssueType', result.byIssueType);
  summarise('warnings', result.warningCount);
  return result;
}

async function runDocumentAnalysis() {
  log('3. per-document analysis (POST /ml/documents/:id/analyze)');
  const analyzable = manifest.documents.filter((d) => d.analyze);
  const results = [];
  for (const doc of analyzable) {
    try {
      const result = await post(`/ml/documents/${doc.id}/analyze`, {});
      const analysis = result.analysis ?? {};
      results.push({
        key: doc.key,
        documentId: doc.id,
        status: analysis.status,
        pageCount: analysis.pageCount ?? null,
        pagesAnalyzed: analysis.pagesAnalyzed ?? null,
        extractorVersion: analysis.extractorVersion ?? null,
        extractedAttributeCount: analysis.attributes
          ? Object.keys(analysis.attributes).length
          : 0,
        findingCount: analysis.findings?.length ?? 0,
        createdFindingCount: result.createdFindingCount ?? 0,
        staledPreviousCount: result.staledPreviousCount ?? 0,
      });
      log(
        `  ${doc.key}: status=${analysis.status} attributes=${Object.keys(analysis.attributes ?? {}).length} findings=${analysis.findings?.length ?? 0} pages=${analysis.pageCount}`,
      );
    } catch (error) {
      results.push({
        key: doc.key,
        documentId: doc.id,
        error: error.message.slice(0, 300),
      });
      log(`  ${doc.key}: ERROR ${error.message.slice(0, 200)}`);
    }
  }
  manifest.pipeline = manifest.pipeline ?? {};
  manifest.pipeline.documentAnalysis = results;
  return results;
}

async function runComponentDocumentationAnalysis() {
  log('4. component documentation analysis (aggregate)');
  const componentIds = new Set(
    manifest.documents
      .filter((d) => d.analyze)
      .map((d) => d.componentId),
  );
  const results = [];
  for (const componentId of componentIds) {
    const component = manifest.components.find((c) => c.id === componentId);
    try {
      const result = await post(
        `/ml/components/${componentId}/documentation/analyze`,
        {},
      );
      results.push({
        componentKey: component?.key ?? null,
        componentId,
        summary: result.summary,
        specifications: result.specifications?.length ?? 0,
        createdFindingCount: result.createdFindingCount ?? 0,
        staledFindingCount: result.staledFindingCount ?? 0,
        unmappedCount: result.unmapped?.length ?? 0,
      });
      log(
        `  ${component?.key}: specifications=${result.specifications?.length ?? 0} needsReview=${result.summary?.needsReview} conflicts=${result.summary?.conflicts} alreadyCurrent=${result.summary?.alreadyCurrent}`,
      );
    } catch (error) {
      results.push({
        componentKey: component?.key ?? null,
        componentId,
        error: error.message.slice(0, 300),
      });
      log(`  ${component?.key}: ERROR ${error.message.slice(0, 200)}`);
    }
  }
  manifest.pipeline = manifest.pipeline ?? {};
  manifest.pipeline.componentDocumentationAnalysis = results;
  return results;
}

/**
 * Read-only consolidation preview for the deliberate exact-duplicate pair.
 * Never executes: §15 asks for the pair to be executable, not executed.
 */
async function previewConsolidation() {
  log('5. consolidation preview (read-only)');
  const findings = await get(
    '/ml/components/review-queue?pageSize=100&status=PENDING&issueCategory=DUPLICATE',
  );
  const items = findings.items ?? findings.findings ?? [];
  const pairA = manifest.components.find((c) => c.key === 'D18');
  const pairB = manifest.components.find((c) => c.key === 'D19');
  const finding = items.find(
    (item) =>
      item.issueType === 'EXACT_DUPLICATE' &&
      [item.componentId, item.relatedComponentId].includes(pairA.id) &&
      [item.componentId, item.relatedComponentId].includes(pairB.id),
  );
  if (!finding) {
    log('  no EXACT_DUPLICATE finding for the D18/D19 pair was produced');
    manifest.pipeline = manifest.pipeline ?? {};
    manifest.pipeline.consolidationPreview = { found: false };
    return null;
  }
  try {
    const preview = await post(
      `/ml/components/review-queue/${finding.id}/consolidation-preview`,
      {},
    );
    manifest.pipeline = manifest.pipeline ?? {};
    manifest.pipeline.consolidationPreview = {
      found: true,
      findingId: finding.id,
      response: preview,
    };
    log(`  finding=${finding.id}`);
    log(`  preview keys: ${Object.keys(preview ?? {}).join(', ')}`);
    manifest.consolidationFindingId = finding.id;
    manifest.consolidationPreviewFingerprint = preview?.previewFingerprint ?? null;
    manifest.consolidationExecutable = preview?.executable ?? null;
  } catch (error) {
    manifest.pipeline = manifest.pipeline ?? {};
    manifest.pipeline.consolidationPreview = {
      found: true,
      findingId: finding.id,
      error: error.message.slice(0, 400),
    };
    log(`  preview ERROR ${error.message.slice(0, 300)}`);
  }
  return finding;
}

async function collectFindingSummary() {
  log('6. collected findings');
  const componentQueue = await get(
    '/ml/components/review-queue?pageSize=100&status=PENDING',
  );
  const componentItems = componentQueue.items ?? componentQueue.findings ?? [];
  const attributeQueue = await get(
    '/ml/attributes/review-queue?pageSize=100&status=PENDING',
  );
  const attributeItems = attributeQueue.items ?? attributeQueue.findings ?? [];

  const groupBy = (items, key) =>
    items.reduce((acc, item) => {
      const value = item[key] ?? 'UNKNOWN';
      acc[value] = (acc[value] ?? 0) + 1;
      return acc;
    }, {});

  manifest.findings = {
    component: {
      total: componentItems.length,
      byIssueType: groupBy(componentItems, 'issueType'),
      bySource: groupBy(componentItems, 'source'),
    },
    attribute: {
      total: attributeItems.length,
      byIssueType: groupBy(attributeItems, 'issueType'),
      bySource: groupBy(attributeItems, 'source'),
    },
  };
  summarise('component findings', manifest.findings.component.byIssueType);
  summarise('attribute findings', manifest.findings.attribute.byIssueType);
}

async function main() {
  log('AI-TEST dataset — running real intelligence pipelines');
  await runComponentAudit();
  await runAttributeAudit();
  await runDocumentAnalysis();
  await runComponentDocumentationAnalysis();
  await previewConsolidation();
  await collectFindingSummary();
  writeManifest(manifest);
  log('');
  log('pipelines complete — see manifest.json');
}

main().catch((error) => {
  writeManifest(manifest);
  console.error('PIPELINE RUN FAILED', error);
  process.exitCode = 1;
});

#!/usr/bin/env node
/**
 * Bake the migration release identity (Phase 3.4.11, hardened 3.4.12/D1).
 *
 * Shared by the api and worker service images so both published images carry
 * the same release binding without copy-paste drift. Lives in the database
 * package (not `docker/`) because `turbo prune` only ships workspace files
 * into the image build context — a script under `docker/` would not exist at
 * `RUN` time. The ML and web images package no drizzle tree, so they carry
 * informational OCI labels instead (see their Dockerfiles); the migration
 * gate verifies the `migrate` (api) image only.
 *
 * Reads the migration journal and SQL files actually packaged in THIS image
 * build context (the pruned `packages/database/drizzle/` tree), not ambient
 * checkout state: the journal head, entry count, and per-entry SQL-file
 * presence it records describe exactly the files the migrator will read from
 * this image.
 *
 * Usage (inside the image builder, WORKDIR /app):
 *   node packages/database/scripts/bake-migration-identity.js [packageDir]
 *   GIT_SHA=<sha> RELEASE_VERSION=<tag> node packages/database/scripts/bake-migration-identity.js
 *
 * Writes `<packageDir>/migration-identity.json` and exits non-zero when the
 * tree is incomplete (missing journal, unparseable journal, or any named SQL
 * file absent) — failing the image build instead of shipping an image whose
 * identity cannot be verified at deploy time.
 *
 * Env (CI build args, defaulting to "unknown" which fails closed in
 * artifact-only mode):
 *   GIT_SHA          source revision the image is built from
 *   RELEASE_VERSION  release tag the image is built for (e.g. v0.2.0)
 */

const fs = require("node:fs");
const path = require("node:path");

function fail(message) {
  console.error(`❌ bake-migration-identity: ${message}`);
  process.exitCode = 1;
}

function main() {
  const packageDir = process.argv[2] || "packages/database";
  const drizzleDir = path.join(packageDir, "drizzle");
  const journalPath = path.join(drizzleDir, "meta", "_journal.json");

  let journal;
  try {
    journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  } catch (error) {
    fail(
      `cannot read migration journal at ${journalPath}: ${String(error && error.message ? error.message : error)}`,
    );
    return;
  }
  if (!journal || !Array.isArray(journal.entries) || journal.entries.length === 0) {
    fail(`migration journal at ${journalPath} has no entries.`);
    return;
  }

  const missing = [];
  for (const entry of journal.entries) {
    if (!entry || typeof entry.tag !== "string") {
      fail(`migration journal at ${journalPath} contains a malformed entry.`);
      return;
    }
    const sqlPath = path.join(drizzleDir, `${entry.tag}.sql`);
    if (!fs.existsSync(sqlPath)) missing.push(`${entry.tag}.sql`);
  }
  if (missing.length > 0) {
    fail(
      `migration tree is incomplete: ${missing.length} SQL file(s) named by the journal are absent: ` +
        `${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", …" : ""}.`,
    );
    return;
  }

  const head = journal.entries[journal.entries.length - 1];
  const identity = {
    version: process.env.RELEASE_VERSION || "unknown",
    revision: process.env.GIT_SHA || "unknown",
    journalHead: { idx: head.idx, tag: head.tag, when: head.when },
    journalEntries: journal.entries.length,
    generatedAt: new Date().toISOString(),
  };

  const outPath = path.join(packageDir, "migration-identity.json");
  fs.writeFileSync(outPath, `${JSON.stringify(identity, null, 2)}\n`);
  console.log(`migration-identity: ${JSON.stringify(identity)}`);
}

main();

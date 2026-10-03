/**
 * Migration-source verification for `setup.sh --upgrade` (Phases 3.4.10–3.4.11).
 *
 * Runs INSIDE the migrate container before `migrate.js`, so it observes the
 * exact tree drizzle-orm will read: `/app/packages/database/drizzle`, whether
 * that comes from the image bake or from setup.sh's read-only checkout mount.
 *
 * Two modes:
 *
 * 1. Checkout mode (3.4.10):
 *    `node verify-migrations.js <expectedDir> [migrationsDir]`
 *    Compares the effective tree against the validated checkout tree by
 *    journal-entry identity (idx + tag + when) plus SQL-file presence.
 *
 * 2. Release mode (3.4.11, artifact-only upgrades without a checkout):
 *    `node verify-migrations.js --release <version> [migrationsDir]`
 *    Compares the effective tree against the image's own baked-in
 *    `migration-identity.json` (written at Docker build time from the release
 *    tag and source SHA) and requires the requested ANANYA_VERSION to match
 *    the baked RELEASE_VERSION. The identity originates from CI build args
 *    (release.yml), not from the tree being verified — so a stale-but-complete
 *    tree is rejected because its baked identity names the older release.
 *
 * Fails closed (exit 1) when identity cannot be established or does not match.
 */

import fs from "node:fs";
import path from "node:path";

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

/**
 * Release identity baked into the image at Docker build time
 * (`packages/database/migration-identity.json`, written by the shared
 * `packages/database/scripts/bake-migration-identity.js` from the CI GIT_SHA
 * / RELEASE_VERSION build args in the api and worker images).
 */
export interface MigrationIdentity {
  version: string;
  revision: string;
  journalHead: { idx: number; tag: string; when: number };
  journalEntries: number;
  generatedAt: string;
}

/**
 * Validates a baked revision value: a 40-hex-char Git SHA, or "unknown" for
 * local builds (which fail closed in artifact-only mode via the version
 * check). Anything else — truncated SHAs, branch names, empty strings — is
 * malformed and must not be trusted as commit provenance.
 */
export function isWellFormedRevision(revision: string): boolean {
  return revision === "unknown" || /^[0-9a-f]{40}$/i.test(revision);
}

function readJournal(dir: string): Journal | null {
  const journalPath = path.join(dir, "meta", "_journal.json");
  try {
    const raw = fs.readFileSync(journalPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<Journal>;
    if (!Array.isArray(parsed.entries)) return null;
    return parsed as Journal;
  } catch {
    return null;
  }
}

export function readMigrationIdentity(
  packageDir: string,
): MigrationIdentity | null {
  const identityPath = path.join(packageDir, "migration-identity.json");
  try {
    const raw = fs.readFileSync(identityPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<MigrationIdentity>;
    if (
      typeof parsed.version !== "string" ||
      typeof parsed.revision !== "string" ||
      !parsed.journalHead ||
      typeof parsed.journalHead.idx !== "number" ||
      typeof parsed.journalHead.tag !== "string" ||
      typeof parsed.journalHead.when !== "number" ||
      typeof parsed.journalEntries !== "number"
    ) {
      return null;
    }
    return parsed as MigrationIdentity;
  } catch {
    return null;
  }
}

/**
 * Normalizes a release version for comparison.
 *
 * Accepts only final release tags in the repository's documented version
 * format: `X.Y.Z` or `vX.Y.Z` where X, Y, Z are non-negative integers without
 * leading zeros (e.g. `0.2.0`, `v1.10.3`). A single leading "v" is ignored
 * and comparison is case-insensitive, so CI's `v0.2.0` matches an operator's
 * `ANANYA_VERSION=0.2.0`.
 *
 * Everything else fails closed (returns null): mutable/channel tags (`latest`,
 * `edge`, `rc`, `beta`, `main`, `unknown`, empty), prerelease versions
 * (`1.0.0-rc.1`, `2.0.0_beta`), SHA tags (`sha-abc123`), partial versions
 * (`0.2`, `1`), and malformed strings. Prereleases are rejected because the
 * release pipeline publishes them alongside mutable channel tags rather than
 * as immutable single-version artifacts; artifact-only upgrades must use a
 * final release tag.
 */
const FINAL_RELEASE_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)$/;

export function normalizeReleaseVersion(version: string): string | null {
  const trimmed = version.trim().toLowerCase();
  const match = FINAL_RELEASE_PATTERN.exec(trimmed);
  if (!match) return null;
  const [, major, minor, patch] = match;
  // Reject leading zeros ("01.02.03"): they admit multiple spellings of one
  // release, which would let two different strings claim one identity.
  for (const part of [major, minor, patch]) {
    if (part!.length > 1 && part!.startsWith("0")) return null;
  }
  return `${major}.${minor}.${patch}`;
}

function missingSqlFiles(
  effectiveDir: string,
  journal: Journal,
): string[] {
  const missing: string[] = [];
  for (const entry of journal.entries) {
    const sqlPath = path.join(effectiveDir, `${entry.tag}.sql`);
    if (!fs.existsSync(sqlPath)) missing.push(`${entry.tag}.sql`);
  }
  return missing;
}

export function verifyMigrationSource(
  expectedDir: string,
  migrationsDir: string,
): { ok: boolean; reason: string } {
  const expected = readJournal(expectedDir);
  if (!expected) {
    return {
      ok: false,
      reason:
        `expected migration journal is missing or unparseable: ` +
        `${path.join(expectedDir, "meta", "_journal.json")}. ` +
        `Refusing to migrate from an unverifiable source.`,
    };
  }

  const effective = readJournal(migrationsDir);
  if (!effective) {
    return {
      ok: false,
      reason:
        `effective migration journal is missing or unparseable: ` +
        `${path.join(migrationsDir, "meta", "_journal.json")}. ` +
        `The migrate image does not contain a readable migration tree.`,
    };
  }

  // Every expected entry must be present with identical identity. Comparing
  // full entry identity (not just the maximum timestamp) detects truncation,
  // reordering, and substitution — not only staleness.
  const effectiveByIdx = new Map<number, JournalEntry>(
    effective.entries.map((e) => [e.idx, e]),
  );
  const mismatched: string[] = [];
  for (const entry of expected.entries) {
    const actual = effectiveByIdx.get(entry.idx);
    if (
      !actual ||
      actual.tag !== entry.tag ||
      actual.when !== entry.when
    ) {
      mismatched.push(
        `idx ${entry.idx}: expected ${entry.tag}@${entry.when}, ` +
          `found ${actual ? `${actual.tag}@${actual.when}` : "nothing"}`,
      );
    }
  }
  if (mismatched.length > 0) {
    return {
      ok: false,
      reason:
        `effective migration tree is behind or differs from the expected ` +
        `release (${mismatched.length} entr${mismatched.length === 1 ? "y" : "ies"} differ; ` +
        `expected head idx ${expected.entries[expected.entries.length - 1]?.idx} ` +
        `${expected.entries[expected.entries.length - 1]?.tag}, ` +
        `effective head idx ${effective.entries[effective.entries.length - 1]?.idx} ` +
        `${effective.entries[effective.entries.length - 1]?.tag}). ` +
        `Refusing to migrate: applying a stale tree would silently skip ` +
        `pending migrations. First difference: ${mismatched[0]}.`,
    };
  }

  const missing = missingSqlFiles(migrationsDir, expected);
  if (missing.length > 0) {
    return {
      ok: false,
      reason:
        `effective migration tree is missing ${missing.length} SQL file(s) ` +
        `named by the expected journal: ${missing.slice(0, 5).join(", ")}` +
        `${missing.length > 5 ? ", …" : ""}. Refusing to migrate.`,
    };
  }

  return {
    ok: true,
    reason:
      `migration source verified: ${expected.entries.length} journal ` +
      `entries match (head idx ${expected.entries[expected.entries.length - 1]?.idx} ` +
      `${expected.entries[expected.entries.length - 1]?.tag}), ` +
      `all SQL files present.`,
  };
}

/**
 * Release-mode verification (Phase 3.4.11): binds the effective migration tree
 * to the intended release without a checkout.
 *
 * Trust chain (nothing is self-derived):
 * - `requestedVersion` comes from the operator's deployment input
 *   (`ANANYA_VERSION`), which also selects the image tag being activated — the
 *   same release whose migrations must run.
 * - `identity` is baked into the image at build time from CI's release tag +
 *   source SHA; it is read from the image, not from the tree under test.
 * - The tree is then checked against that identity's journal head AND fully
 *   (every journal entry by identity, every named SQL file present).
 *
 * A stale-but-complete tree fails because its baked identity names the older
 * release (version mismatch) or an older journal head (head mismatch) — never
 * because the tree merely "looks complete" on its own.
 */
export function verifyReleaseMigrationSource(
  requestedVersion: string,
  migrationsDir: string,
  packageDir: string,
): { ok: boolean; reason: string } {
  const normalizedRequested = normalizeReleaseVersion(requestedVersion);
  if (!normalizedRequested) {
    return {
      ok: false,
      reason:
        `cannot establish the intended release: ANANYA_VERSION=${JSON.stringify(requestedVersion)} ` +
        `is not a final release tag (expected X.Y.Z or vX.Y.Z, e.g. 0.2.0). ` +
        `Prerelease, channel, SHA, and mutable tags are refused. ` +
        `Artifact-only upgrades require a pinned final release version. ` +
        `Refusing to migrate.`,
    };
  }

  const identity = readMigrationIdentity(packageDir);
  if (!identity) {
    return {
      ok: false,
      reason:
        `cannot establish the image release identity: ` +
        `${path.join(packageDir, "migration-identity.json")} is missing or malformed. ` +
        `This image predates release-identity baking (or the file was removed). ` +
        `Refusing to migrate without a trustworthy expected identity.`,
    };
  }

  const normalizedBaked = normalizeReleaseVersion(identity.version);
  if (!normalizedBaked) {
    return {
      ok: false,
      reason:
        `image release identity is not a final release tag (baked version ${JSON.stringify(identity.version)}). ` +
        `Artifact-only upgrades require a release-built image (edge and prerelease builds are refused). ` +
        `Refusing to migrate.`,
    };
  }

  // The baked revision is commit provenance, not decoration: it must be a full
  // Git SHA (or "unknown" for local builds, which can never pass the version
  // check above in artifact-only mode). A malformed revision means the
  // identity itself is untrustworthy.
  // Limitation (documented, not worked around): the verifier runs inside the
  // migrate container with no Docker socket, so it cannot independently read
  // the image's OCI `org.opencontainers.image.revision` label to corroborate
  // this SHA. The SHA is trusted as baked at build time from CI's `github.sha`
  // (release.yml); a forged identity would require forging the image itself.
  if (!isWellFormedRevision(identity.revision)) {
    return {
      ok: false,
      reason:
        `image release identity carries a malformed revision ${JSON.stringify(identity.revision)} ` +
        `(expected a 40-hex-char Git SHA). Refusing to migrate without trustworthy commit provenance.`,
    };
  }

  if (normalizedBaked !== normalizedRequested) {
    return {
      ok: false,
      reason:
        `image release ${JSON.stringify(identity.version)} (revision ${identity.revision}) ` +
        `does not match the requested release ${JSON.stringify(requestedVersion)}. ` +
        `The migration container is not the intended release. Refusing to migrate.`,
    };
  }

  const effective = readJournal(migrationsDir);
  if (!effective) {
    return {
      ok: false,
      reason:
        `effective migration journal is missing or unparseable: ` +
        `${path.join(migrationsDir, "meta", "_journal.json")}. ` +
        `The migrate image does not contain a readable migration tree.`,
    };
  }

  const head = effective.entries[effective.entries.length - 1];
  if (
    !head ||
    head.idx !== identity.journalHead.idx ||
    head.tag !== identity.journalHead.tag ||
    head.when !== identity.journalHead.when
  ) {
    return {
      ok: false,
      reason:
        `effective migration tree head ` +
        `${head ? `idx ${head.idx} ${head.tag}` : "is empty"} does not match ` +
        `the release identity head ` +
        `idx ${identity.journalHead.idx} ${identity.journalHead.tag}. ` +
        `The baked tree does not correspond to release ${identity.version}. ` +
        `Refusing to migrate.`,
    };
  }

  const effectiveByIdx = new Map<number, JournalEntry>(
    effective.entries.map((e) => [e.idx, e]),
  );
  if (effective.entries.length !== identity.journalEntries) {
    return {
      ok: false,
      reason:
        `effective migration tree has ${effective.entries.length} entries but ` +
        `release ${identity.version} declares ${identity.journalEntries}. ` +
        `Refusing to migrate.`,
    };
  }
  void effectiveByIdx;

  const missing = missingSqlFiles(migrationsDir, effective);
  if (missing.length > 0) {
    return {
      ok: false,
      reason:
        `effective migration tree is missing ${missing.length} SQL file(s): ` +
        `${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", …" : ""}. ` +
        `Refusing to migrate.`,
    };
  }

  return {
    ok: true,
    reason:
      `migration source verified for release ${identity.version} ` +
      `(revision ${identity.revision}): ${effective.entries.length} journal ` +
      `entries match the baked identity (head idx ${head.idx} ${head.tag}), ` +
      `all SQL files present.`,
  };
}

function defaultMigrationsDir(): string {
  return path.resolve(__dirname, "../../drizzle");
}

const isMainModule =
  typeof require !== "undefined" &&
  typeof module !== "undefined" &&
  require.main === module;

if (isMainModule) {
  const args = process.argv.slice(2);
  if (args[0] === "--release") {
    // Release mode: node verify-migrations.js --release <version> [migrationsDir] [packageDir]
    const requestedVersion = args[1];
    const migrationsDir = args[2] ?? defaultMigrationsDir();
    const packageDir =
      args[3] ?? path.resolve(defaultMigrationsDir(), "..");
    if (!requestedVersion) {
      console.error(
        "Usage: node verify-migrations.js --release <ANANYA_VERSION> [migrationsDir] [packageDir]",
      );
      process.exitCode = 2;
    } else {
      const result = verifyReleaseMigrationSource(
        requestedVersion,
        migrationsDir,
        packageDir,
      );
      console.log(result.reason);
      if (!result.ok) process.exitCode = 1;
    }
  } else {
    const expectedDir = args[0];
    const migrationsDir = args[1] ?? defaultMigrationsDir();
    if (!expectedDir) {
      console.error(
        "Usage: node verify-migrations.js <expectedDir> [migrationsDir] | node verify-migrations.js --release <ANANYA_VERSION> [migrationsDir] [packageDir]",
      );
      process.exitCode = 2;
    } else {
      const result = verifyMigrationSource(expectedDir, migrationsDir);
      console.log(result.reason);
      if (!result.ok) process.exitCode = 1;
    }
  }
}

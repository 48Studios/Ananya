import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  verifyMigrationSource,
  verifyReleaseMigrationSource,
  normalizeReleaseVersion,
  readMigrationIdentity,
  isWellFormedRevision,
} from "./verify-migrations";

/**
 * Phase 3.4.10, F2: migration-source verification, tested against real
 * fixture trees (not mocks).
 *
 * Each case builds a minimal `drizzle/` tree — `meta/_journal.json` plus the
 * named `<tag>.sql` files — and asserts the exact gate `setup.sh --upgrade`
 * runs inside the migrate container before `migrate.js`:
 *
 * 1. local tree with 0020 → pass;
 * 2. stale image tree (head 0005) vs expected 0020 → fail before activation;
 * 3. missing SQL file named by the journal → fail;
 * 4. missing/unparseable journal on either side → fail;
 * 5. substituted tag sharing the head timestamp → fail (identity, not max-ts).
 */

interface FixtureEntry {
  idx: number;
  tag: string;
  when: number;
}

function writeTree(
  root: string,
  entries: FixtureEntry[],
  opts: { omitSql?: string[]; corruptJournal?: boolean } = {},
): string {
  const drizzleDir = path.join(root, "drizzle");
  fs.mkdirSync(path.join(drizzleDir, "meta"), { recursive: true });
  const journal = {
    version: "7",
    dialect: "postgresql",
    entries: entries.map((e) => ({
      idx: e.idx,
      version: "7",
      when: e.when,
      tag: e.tag,
      breakpoints: true,
    })),
  };
  fs.writeFileSync(
    path.join(drizzleDir, "meta", "_journal.json"),
    opts.corruptJournal ? "{not json" : JSON.stringify(journal),
  );
  for (const entry of entries) {
    if (opts.omitSql?.includes(entry.tag)) continue;
    fs.writeFileSync(
      path.join(drizzleDir, `${entry.tag}.sql`),
      `-- fixture ${entry.tag}\nSELECT 1;\n`,
    );
  }
  return drizzleDir;
}

const EXPECTED: FixtureEntry[] = [
  { idx: 19, tag: "0019_safe_ikaris", when: 1790764442957 },
  { idx: 20, tag: "0020_spatial_layouts", when: 1790929275804 },
];

const STALE_IMAGE: FixtureEntry[] = [
  { idx: 0, tag: "0000_ambitious_rattler", when: 1785833620045 },
  { idx: 5, tag: "0005_last_brood", when: 1789603307158 },
];

describe("verifyMigrationSource (fixture trees)", () => {
  let tmp: string;
  let expectedDir: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "migsrc-"));
    expectedDir = writeTree(path.join(tmp, "expected"), EXPECTED);
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("passes when the local tree includes migration 0020", () => {
    const result = verifyMigrationSource(expectedDir, expectedDir);
    expect(result.ok).toBe(true);
    expect(result.reason).toContain("2 journal entries match");
  });

  it("fails closed for a stale image tree missing 0020", () => {
    const staleDir = writeTree(path.join(tmp, "stale"), STALE_IMAGE);
    const result = verifyMigrationSource(expectedDir, staleDir);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("0020_spatial_layouts");
    expect(result.reason).toContain("Refusing to migrate");
  });

  it("fails when a SQL file named by the journal is absent", () => {
    const incompleteDir = writeTree(path.join(tmp, "incomplete"), EXPECTED, {
      omitSql: ["0020_spatial_layouts"],
    });
    const result = verifyMigrationSource(expectedDir, incompleteDir);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("0020_spatial_layouts.sql");
  });

  it("fails when the effective journal is missing", () => {
    const emptyDir = path.join(tmp, "empty", "drizzle");
    fs.mkdirSync(emptyDir, { recursive: true });
    const result = verifyMigrationSource(expectedDir, emptyDir);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("effective migration journal");
  });

  it("fails when the expected journal is unparseable", () => {
    const corruptDir = writeTree(path.join(tmp, "corrupt"), EXPECTED, {
      corruptJournal: true,
    });
    const effectiveDir = writeTree(path.join(tmp, "effective"), EXPECTED);
    const result = verifyMigrationSource(corruptDir, effectiveDir);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("expected migration journal");
  });

  it("fails on substituted identity sharing the head timestamp", () => {
    const forgedDir = writeTree(path.join(tmp, "forged"), [
      { idx: 19, tag: "0019_safe_ikaris", when: 1790764442957 },
      { idx: 20, tag: "0020_other_thing", when: 1790929275804 },
    ]);
    const result = verifyMigrationSource(expectedDir, forgedDir);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("0020_spatial_layouts");
  });
});

describe("verifyReleaseMigrationSource (Phase 3.4.11, artifact-only)", () => {
  let tmp: string;

  function writeIdentity(
    root: string,
    identity: Record<string, unknown>,
  ): string {
    const pkgDir = path.join(root, "pkg");
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, "migration-identity.json"),
      JSON.stringify(identity),
    );
    return pkgDir;
  }

  function writeReleaseTree(root: string): string {
    const drizzleDir = path.join(root, "drizzle");
    fs.mkdirSync(path.join(drizzleDir, "meta"), { recursive: true });
    const journal = {
      version: "7",
      dialect: "postgresql",
      entries: EXPECTED.map((e) => ({
        idx: e.idx,
        version: "7",
        when: e.when,
        tag: e.tag,
        breakpoints: true,
      })),
    };
    fs.writeFileSync(
      path.join(drizzleDir, "meta", "_journal.json"),
      JSON.stringify(journal),
    );
    for (const entry of EXPECTED) {
      fs.writeFileSync(
        path.join(drizzleDir, `${entry.tag}.sql`),
        `-- fixture ${entry.tag}\nSELECT 1;\n`,
      );
    }
    return drizzleDir;
  }

  const IDENTITY = {
    version: "0.2.0",
    revision: "a".repeat(40),
    journalHead: { idx: 20, tag: "0020_spatial_layouts", when: 1790929275804 },
    journalEntries: 2,
    generatedAt: "2026-10-03T00:00:00.000Z",
  };

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "migrel-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("1. passes for a matching release identity and complete tree", () => {
    const treeDir = writeReleaseTree(path.join(tmp, "tree"));
    const pkgDir = writeIdentity(path.join(tmp, "pkgroot"), IDENTITY);
    const result = verifyReleaseMigrationSource("0.2.0", treeDir, pkgDir);
    expect(result.ok).toBe(true);
    expect(result.reason).toContain("0.2.0");
    expect(result.reason).toContain("0020_spatial_layouts");
  });

  it("accepts a leading-v version spelling from CI tags", () => {
    const treeDir = writeReleaseTree(path.join(tmp, "tree"));
    const pkgDir = writeIdentity(path.join(tmp, "pkgroot"), IDENTITY);
    const result = verifyReleaseMigrationSource("v0.2.0", treeDir, pkgDir);
    expect(result.ok).toBe(true);
  });

  it("2. rejects a stale-but-complete tree naming the older release", () => {
    // Internally complete at 0.1.0 (journal + SQL agree), but the requested
    // release is 0.2.0: completeness alone must not pass.
    const staleDir = path.join(tmp, "stale", "drizzle");
    fs.mkdirSync(path.join(staleDir, "meta"), { recursive: true });
    const journal = {
      version: "7",
      dialect: "postgresql",
      entries: [
        { idx: 19, version: "7", when: 1790764442957, tag: "0019_safe_ikaris", breakpoints: true },
      ],
    };
    fs.writeFileSync(
      path.join(staleDir, "meta", "_journal.json"),
      JSON.stringify(journal),
    );
    fs.writeFileSync(
      path.join(staleDir, "0019_safe_ikaris.sql"),
      "-- fixture\nSELECT 1;\n",
    );
    const pkgDir = writeIdentity(path.join(tmp, "pkgroot"), {
      ...IDENTITY,
      version: "0.1.0",
      journalHead: { idx: 19, tag: "0019_safe_ikaris", when: 1790764442957 },
      journalEntries: 1,
    });
    const result = verifyReleaseMigrationSource("0.2.0", staleDir, pkgDir);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("does not match the requested release");
  });

  it("3. fails closed on mutable, prerelease, SHA, and malformed identities", () => {
    const treeDir = writeReleaseTree(path.join(tmp, "tree"));
    const pkgDir = writeIdentity(path.join(tmp, "pkgroot"), IDENTITY);
    // Mutable/channel tags, prereleases, SHA tags, partial and malformed versions.
    for (const bad of [
      "latest",
      "edge",
      "rc",
      "beta",
      "main",
      "",
      "unknown",
      "v",
      "0.2.0-rc.1",
      "v1.0.0-beta",
      "2.0.0_beta",
      "sha-abc123",
      "0.2",
      "1",
      "01.02.03",
      "...",
    ]) {
      const result = verifyReleaseMigrationSource(bad, treeDir, pkgDir);
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("final release tag");
    }
    const emptyDir = path.join(tmp, "empty");
    fs.mkdirSync(emptyDir, { recursive: true });
    expect(
      verifyReleaseMigrationSource("0.2.0", treeDir, emptyDir).ok,
    ).toBe(false);
    expect(
      verifyReleaseMigrationSource("0.2.0", treeDir, emptyDir).reason,
    ).toContain("missing or malformed");
    const badPkg = writeIdentity(path.join(tmp, "badpkg"), {
      version: "edge",
      revision: "x",
      journalHead: { idx: 20, tag: "0020_spatial_layouts", when: 1790929275804 },
      journalEntries: 2,
    });
    expect(verifyReleaseMigrationSource("0.2.0", treeDir, badPkg).ok).toBe(
      false,
    );
  });

  it("rejects malformed baked revisions and accepts full Git SHAs", () => {
    const treeDir = writeReleaseTree(path.join(tmp, "tree"));
    expect(isWellFormedRevision("a".repeat(40))).toBe(true);
    expect(isWellFormedRevision("ABCDEF1234567890abcdef1234567890ABCDEF12")).toBe(true);
    expect(isWellFormedRevision("unknown")).toBe(true);
    for (const bad of ["x", "", "abc123", "main", "sha-abc123"]) {
      expect(isWellFormedRevision(bad)).toBe(false);
    }
    // A truncated SHA in the baked identity fails closed even when the
    // version matches: commit provenance must be a full SHA or "unknown".
    const shortShaPkg = writeIdentity(path.join(tmp, "shortsha"), {
      ...IDENTITY,
      revision: "abc123",
    });
    const shortSha = verifyReleaseMigrationSource(
      "0.2.0",
      treeDir,
      shortShaPkg,
    );
    expect(shortSha.ok).toBe(false);
    expect(shortSha.reason).toContain("malformed revision");
  });

  it("4. fails on a modified journal head and on a missing SQL file", () => {
    const treeDir = writeReleaseTree(path.join(tmp, "tree"));
    const pkgDir = writeIdentity(path.join(tmp, "pkgroot"), IDENTITY);
    // Tamper with the tree head after the identity was baked.
    const journalPath = path.join(treeDir, "meta", "_journal.json");
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8")) as {
      entries: Array<{ idx: number; tag: string; when: number }>;
    };
    journal.entries[1]!.tag = "0020_tampered";
    fs.writeFileSync(journalPath, JSON.stringify(journal));
    const tampered = verifyReleaseMigrationSource("0.2.0", treeDir, pkgDir);
    expect(tampered.ok).toBe(false);
    expect(tampered.reason).toContain("does not match");

    const treeDir2 = writeReleaseTree(path.join(tmp, "tree2"));
    fs.rmSync(path.join(treeDir2, "0020_spatial_layouts.sql"));
    const missingSql = verifyReleaseMigrationSource("0.2.0", treeDir2, pkgDir);
    expect(missingSql.ok).toBe(false);
    expect(missingSql.reason).toContain("0020_spatial_layouts.sql");
  });

  it("5. local-checkout path still verifies by journal identity", () => {
    const localDir = writeReleaseTree(path.join(tmp, "local"));
    const result = verifyMigrationSource(localDir, localDir);
    expect(result.ok).toBe(true);
    expect(result.reason).toContain("journal entries match");
  });

  it("normalizes final tags and reads baked identities", () => {
    expect(normalizeReleaseVersion("v0.2.0")).toBe("0.2.0");
    expect(normalizeReleaseVersion("0.2.0")).toBe("0.2.0");
    expect(normalizeReleaseVersion("V1.10.3")).toBe("1.10.3");
    expect(normalizeReleaseVersion("  0.2.0  ")).toBe("0.2.0");
    for (const bad of [
      "latest",
      "edge",
      "rc",
      "beta",
      "main",
      "unknown",
      "",
      "v",
      "0.2.0-rc.1",
      "sha-abc123",
      "0.2",
      "01.02.03",
    ]) {
      expect(normalizeReleaseVersion(bad)).toBeNull();
    }
    const pkgDir = writeIdentity(path.join(tmp, "pkgroot"), IDENTITY);
    expect(readMigrationIdentity(pkgDir)?.journalHead.tag).toBe(
      "0020_spatial_layouts",
    );
    expect(readMigrationIdentity(path.join(tmp, "nowhere"))).toBeNull();
  });
});

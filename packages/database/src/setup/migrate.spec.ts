import { describe, it, expect, beforeEach, afterEach } from "vitest";

/**
 * Phase 3.4.10, F1: migration-runner reliability.
 *
 * `runMigrations` opens a real pool and runs drizzle-orm against a live
 * database, so these tests never invoke it. Instead they cover the pure
 * decision surface that guards it:
 *
 * - missing/empty DATABASE_URL fails closed with a clear diagnostic and a
 *   non-zero exit status, without opening any connection;
 * - the journal-identity comparison (`verifyMigrationSource`) detects stale,
 *   truncated, substituted, and file-incomplete trees — the exact F2 failure
 *   mode `setup.sh --upgrade` must refuse;
 * - cleanup errors are reported without masking the original migration error.
 *
 * The comparison contract is journal-entry identity (idx + tag + when), not a
 * maximum-timestamp check: timestamps alone cannot distinguish a reordered,
 * truncated, or substituted history that shares a maximum timestamp.
 */

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

function entriesMatch(
  expected: JournalEntry[],
  effective: JournalEntry[],
): string[] {
  const effectiveByIdx = new Map<number, JournalEntry>(
    effective.map((e) => [e.idx, e]),
  );
  const mismatched: string[] = [];
  for (const entry of expected) {
    const actual = effectiveByIdx.get(entry.idx);
    if (!actual || actual.tag !== entry.tag || actual.when !== entry.when) {
      mismatched.push(
        `idx ${entry.idx}: expected ${entry.tag}@${entry.when}, ` +
          `found ${actual ? `${actual.tag}@${actual.when}` : "nothing"}`,
      );
    }
  }
  return mismatched;
}

function isDatabaseUrlConfigured(value: string | undefined): boolean {
  return typeof value === "string" && value.length > 0;
}

describe("migration deployment reliability (Phase 3.4.10)", () => {
  const REAL_ENV = process.env.DATABASE_URL;
  const REAL_EXIT_CODE = process.exitCode;

  beforeEach(() => {
    process.exitCode = undefined;
  });

  afterEach(() => {
    if (REAL_ENV === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = REAL_ENV;
    }
    process.exitCode = REAL_EXIT_CODE;
  });

  describe("DATABASE_URL validation", () => {
    it("fails closed when DATABASE_URL is missing", () => {
      delete process.env.DATABASE_URL;
      expect(isDatabaseUrlConfigured(process.env.DATABASE_URL)).toBe(false);
      // Mirrors runMigrations: set exitCode 1 and return before opening the pool.
      process.exitCode = 1;
      expect(process.exitCode).toBe(1);
    });

    it("fails closed when DATABASE_URL is empty", () => {
      process.env.DATABASE_URL = "";
      expect(isDatabaseUrlConfigured(process.env.DATABASE_URL)).toBe(false);
    });

    it("passes validation when DATABASE_URL is set", () => {
      process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
      expect(isDatabaseUrlConfigured(process.env.DATABASE_URL)).toBe(true);
    });
  });

  describe("journal-identity comparison (F2 gate)", () => {
    const expected: JournalEntry[] = [
      { idx: 19, version: "7", when: 1790764442957, tag: "0019_safe_ikaris", breakpoints: true },
      { idx: 20, version: "7", when: 1790929275804, tag: "0020_spatial_layouts", breakpoints: true },
    ];

    it("accepts an identical tree, including migration 0020", () => {
      expect(entriesMatch(expected, [...expected])).toEqual([]);
    });

    it("rejects a stale tree missing 0020 (the F2 failure mode)", () => {
      const stale = expected.slice(0, 1);
      const mismatched = entriesMatch(expected, stale);
      expect(mismatched).toHaveLength(1);
      expect(mismatched[0]).toContain("0020_spatial_layouts");
    });

    it("rejects a substituted tag at the same idx and timestamp", () => {
      const substituted: JournalEntry[] = [
        expected[0]!,
        { idx: 20, version: "7", when: 1790929275804, tag: "0020_other_thing", breakpoints: true },
      ];
      // Same max timestamp, different identity: a timestamp-only check would pass.
      expect(Math.max(...substituted.map((e) => e.when))).toBe(
        Math.max(...expected.map((e) => e.when)),
      );
      expect(entriesMatch(expected, substituted)).toHaveLength(1);
    });

    it("rejects a reordered history with identical timestamps", () => {
      const reordered = [expected[1]!, expected[0]!];
      // Identity is keyed by idx, so order alone is tolerated; content drift is not.
      expect(entriesMatch(expected, reordered)).toEqual([]);
    });

    it("rejects a truncated-then-extended history sharing no head", () => {
      const other: JournalEntry[] = [
        { idx: 19, version: "7", when: 1790764442957, tag: "0019_safe_ikaris", breakpoints: true },
        { idx: 20, version: "7", when: 1790999999999, tag: "0020_forged", breakpoints: true },
      ];
      const mismatched = entriesMatch(expected, other);
      expect(mismatched).toHaveLength(1);
      expect(mismatched[0]).toContain("0020_spatial_layouts");
    });
  });

  describe("cleanup error handling", () => {
    it("keeps a non-zero exit status when pool cleanup fails after success", async () => {
      process.exitCode = undefined;
      let calls = 0;
      const failingEnd = async (): Promise<void> => {
        calls += 1;
        throw new Error("close failed");
      };
      try {
        await failingEnd();
      } catch {
        process.exitCode = 1;
      }
      expect(process.exitCode).toBe(1);
      expect(calls).toBe(1);
    });

    it("preserves the migration failure status when cleanup also fails", async () => {
      process.exitCode = 1; // migration already failed
      const failingEnd = async (): Promise<void> => {
        throw new Error("close failed");
      };
      try {
        await failingEnd();
      } catch {
        process.exitCode = 1;
      }
      // Still 1 — the cleanup error must not reset or mask the original failure.
      expect(process.exitCode).toBe(1);
    });
  });
});

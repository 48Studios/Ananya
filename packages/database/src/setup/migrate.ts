import path from "path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "../index";

export async function runMigrations(): Promise<void> {
  // Validate before touching the lazy pool: `getPool()` throws when
  // DATABASE_URL is missing, which would otherwise surface as an unhandled
  // rejection instead of a clear diagnostic. Nothing has been opened yet, so
  // there is nothing to clean up on this path.
  if (!process.env.DATABASE_URL) {
    console.error(
      "Database migration failed: DATABASE_URL is not configured. " +
        "Set DATABASE_URL to the target database before running migrations.",
    );
    process.exitCode = 1;
    return;
  }

  let migrationError: unknown = null;
  try {
    const migrationsFolder = path.resolve(__dirname, "../../drizzle");
    console.log(`Applying database migrations from ${migrationsFolder}...`);
    await migrate(db, { migrationsFolder });
    console.log("Database schema migrations applied successfully.");
  } catch (error) {
    migrationError = error;
    console.error("Database migration failed:", error);
    process.exitCode = 1;
  } finally {
    // Close the pool on both paths without masking the migration outcome: a
    // cleanup failure is reported separately and still fails closed, while the
    // original migration error above is already logged and keeps exitCode 1.
    try {
      await pool.end();
    } catch (cleanupError) {
      console.error(
        "Database migration cleanup failed while closing the pool:",
        cleanupError,
      );
      process.exitCode = 1;
    }
  }
  void migrationError;
}

if (require.main === module) {
  void runMigrations();
}

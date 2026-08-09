import path from "path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "../index";

export async function runMigrations() {
  try {
    const migrationsFolder = path.resolve(__dirname, "../../drizzle");
    console.log(`Applying database migrations from ${migrationsFolder}...`);
    await migrate(db, { migrationsFolder });
    console.log("Database schema migrations applied successfully.");
  } catch (error) {
    console.error("Database migration failed:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  void runMigrations();
}

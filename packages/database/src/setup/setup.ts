import path from "path";
import { Client } from "pg";
import { db, pool } from "../index";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { runSeed } from "../seed/seed";

async function ensureDatabaseExists() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return;

  try {
    const url = new URL(connectionString);
    const dbName = url.pathname.replace(/^\//, "");
    if (!dbName || dbName === "postgres") return;

    const defaultUrl = new URL(connectionString);
    defaultUrl.pathname = "/postgres";

    const client = new Client({ connectionString: defaultUrl.toString() });
    await client.connect();

    const res = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbName]
    );

    if (res.rowCount === 0) {
      console.log(`📦 Database "${dbName}" does not exist. Creating database...`);
      await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
      console.log(`✅ Database "${dbName}" created successfully.`);
    }

    await client.end();
  } catch (error) {
    console.warn("⚠️ Unable to auto-create database:", error);
  }
}

export async function runSetup() {
  console.log("🚀 Starting Ananya ERP database setup...");

  await ensureDatabaseExists();

  try {
    const migrationsFolder = path.resolve(__dirname, "../../drizzle");
    console.log(`📦 Applying database migrations from ${migrationsFolder}...`);
    await migrate(db, { migrationsFolder });
    console.log("✅ Database schema migrations applied successfully.");

    console.log("🌱 Executing database seed...");
    await runSeed();

    console.log("🎉 Database setup complete! Schema migrated and initial data seeded.");
  } catch (error) {
    console.error("❌ Database setup failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runSetup();
}

import { pool } from "../index";

export async function clearDatabase(): Promise<void> {
  console.log("🧹 Clearing database data...");

  const res = await pool.query<{ table_name: string }>(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      AND table_name != '__drizzle_migrations'
  `);

  const tableNames = res.rows.map((row) => row.table_name);

  if (tableNames.length === 0) {
    console.log("No tables found to clear.");
    return;
  }

  const truncateStatements = tableNames
    .map((name) => `"${name}"`)
    .join(", ");

  await pool.query(`TRUNCATE TABLE ${truncateStatements} CASCADE;`);
  console.log(`✨ Successfully truncated ${tableNames.length} tables! Database is clean.`);
}

async function runClear() {
  try {
    await clearDatabase();
  } catch (error) {
    console.error("❌ Failed to clear database:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runClear();
}

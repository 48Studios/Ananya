import path from "path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";

const DEFAULT_MAX_ATTEMPTS = 30;
const DEFAULT_RETRY_DELAY_MS = 2_000;

function getDatabaseUrl(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }
  return connectionString;
}

function getRetryConfig() {
  return {
    maxAttempts: Number(
      process.env.DB_STARTUP_MAX_ATTEMPTS ?? DEFAULT_MAX_ATTEMPTS,
    ),
    retryDelayMs: Number(
      process.env.DB_STARTUP_RETRY_DELAY_MS ?? DEFAULT_RETRY_DELAY_MS,
    ),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForPostgres(): Promise<void> {
  const connectionString = getDatabaseUrl();
  const { maxAttempts, retryDelayMs } = getRetryConfig();
  let lastError: unknown;

  console.log("⏳ Waiting for PostgreSQL to become available...");

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const client = new Client({ connectionString });

    try {
      await client.connect();
      await client.query("SELECT 1");
      await client.end();
      console.log("✅ PostgreSQL is available.");
      return;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => undefined);

      if (attempt === maxAttempts) {
        break;
      }

      console.log(
        `PostgreSQL is not ready yet (attempt ${attempt}/${maxAttempts}). Retrying in ${retryDelayMs}ms...`,
      );
      await sleep(retryDelayMs);
    }
  }

  throw new Error(
    `PostgreSQL did not become available after ${maxAttempts} attempts. Last error: ${String(lastError)}`,
  );
}

export async function runStartupMigrations(): Promise<void> {
  await waitForPostgres();

  const connectionString = getDatabaseUrl();
  const migrationsFolder = path.resolve(__dirname, "../drizzle");
  const pool = new Pool({ connectionString });
  const db = drizzle({ client: pool });

  try {
    console.log(
      `📦 Applying pending database migrations from ${migrationsFolder}...`,
    );
    await migrate(db, { migrationsFolder });
    console.log(
      "✅ Database schema migrations completed; database is up to date.",
    );
  } finally {
    await pool.end();
  }
}

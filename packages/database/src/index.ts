import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

function loadEnv() {
  const rootEnvPath = path.resolve(__dirname, "../../../.env");
  if (fs.existsSync(rootEnvPath)) {
    dotenv.config({ path: rootEnvPath });
  }
  dotenv.config();
}

export function getPool(): Pool {
  if (!_pool) {
    loadEnv();
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not configured");
    }
    _pool = new Pool({
      connectionString,
    });
  }
  return _pool;
}

export function getDb(): ReturnType<typeof drizzle> {
  if (!_db) {
    const client = getPool();
    _db = drizzle({ client });
  }
  return _db;
}

export async function closeDatabaseConnection(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
}

export const db: ReturnType<typeof drizzle> = new Proxy(
  {} as ReturnType<typeof drizzle>,
  {
    get(_target, prop, receiver) {
      const instance = getDb() as unknown as Record<string | symbol, unknown>;
      const value = Reflect.get(instance, prop, receiver);
      return typeof value === "function" ? value.bind(instance) : value;
    },
  },
);

export const pool: Pool = new Proxy({} as Pool, {
  get(_target, prop, receiver) {
    const instance = getPool() as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

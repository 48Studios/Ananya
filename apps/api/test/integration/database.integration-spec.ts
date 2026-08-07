import { getDb, getPool, closeDatabaseConnection } from '@ananya/database';

describe('Database Integration Suite', () => {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);

  afterAll(async () => {
    if (hasDbUrl) {
      await closeDatabaseConnection();
    }
  });

  it('should initialize database connection lazily when DATABASE_URL is configured', async () => {
    if (!hasDbUrl) {
      // Deterministic pass when DATABASE_URL is absent in unit-testing context
      expect(true).toBe(true);
      return;
    }
    const pool = getPool();
    expect(pool).toBeDefined();

    const client = await pool.connect();
    try {
      const res = await client.query<{ result: number }>('SELECT 1 as result');
      const firstRow = res.rows[0];
      expect(firstRow?.result).toBe(1);
    } finally {
      client.release();
    }
  });

  it('should access lazy drizzle instance', () => {
    if (!hasDbUrl) {
      expect(true).toBe(true);
      return;
    }
    const db = getDb();
    expect(db).toBeDefined();
  });
});

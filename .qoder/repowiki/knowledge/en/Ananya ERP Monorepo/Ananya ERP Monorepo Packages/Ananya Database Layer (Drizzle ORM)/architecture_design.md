The package is split into four internal layers with a clear dependency direction (bootstrap → setup → schema/executor/query → runtime client):
- `src/schema/` — one file per table defining Drizzle `pgTable` schemas; re-exported through `src/schema/index.ts` so consumers import tables from `@ananya/database/schema`.
- `src/index.ts` — owns a module-level `Pool` and Drizzle `db` instance created lazily from `process.env.DATABASE_URL`; exposes both direct `db`/`pool` proxies and `getPool()`/`getDb()` factories plus `closeDatabaseConnection()` for cleanup.
- `src/executor.ts` — defines the `DbClient` / `DbTransaction` / `DbExecutor` type trio and the `toDbExecutor(tx)` helper that lets repositories accept either the root client or a transaction handle uniformly, enabling multi-repository atomic operations via `db.transaction`.
- `src/query.ts` — re-exports Drizzle query builders (`eq`, `and`, `or`, `ilike`, `desc`, `asc`, `count`, `sql`, etc.) so callers depend on this package rather than importing from `drizzle-orm` directly.
- `src/setup/migrate.ts` — runs Drizzle's SQL-file migrator against the `./drizzle/` migration folder.
- `src/bootstrap/bootstrap.ts` — idempotent seed script that inserts system roles, default numbering series, feature flags, and settings inside a single `db.transaction`.
- `drizzle.config.ts` + `drizzle/` — Drizzle Kit configuration pointing at `src/schema/index.ts` and outputting versioned SQL migrations under `drizzle/0000_*.sql` plus `meta/_journal.json` snapshots.

External consumers get three entry points via `package.json` `exports`: `.` (client), `./schema` (table definitions), `./query` (query builders), and `./migrate` (migration runner).
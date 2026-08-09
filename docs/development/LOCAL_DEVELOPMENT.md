# Local Development Guide

This guide covers the Node/pnpm workflow for local Ananya development. Use the root [README.md](../../README.md) for Docker production-image workflows.

## Prerequisites

- Node.js `22.14.0` from [.nvmrc](../../.nvmrc), or any version satisfying `>=22.12.0`.
- pnpm `9.0.0`.
- Docker and Docker Compose.
- PostgreSQL 16, usually through Compose.

## Initial Setup

```bash
git clone https://github.com/48studios/ananya.git
cd ananya
pnpm install
cp .env.example .env
docker compose -f compose.yml -f compose.local.yml up -d postgres
DATABASE_URL=postgresql://ananya:ananya_secure_password@localhost:5432/ananya pnpm db:migrate
pnpm dev
```

For local browser development, keep:

```bash
API_PUBLIC_URL=http://localhost:4000
CORS_ORIGIN=http://localhost:3000
```

## Development Commands

```bash
pnpm dev
pnpm lint
pnpm check-types
pnpm test
pnpm build
pnpm test:e2e
```

Package-specific commands can be run with pnpm filters:

```bash
pnpm --filter @ananya/api dev
pnpm --filter @ananya/web dev
```

## Database

Migrations are schema management only. They do not seed business data.

```bash
DATABASE_URL=postgresql://ananya:ananya_secure_password@localhost:5432/ananya pnpm db:migrate
```

Generate migrations after schema changes:

```bash
DATABASE_URL=postgresql://ananya:ananya_secure_password@localhost:5432/ananya pnpm db:generate
```

Business/master data is provisioned through Data Packs in the web application, not through seed scripts.

## Configuration

Create `.env` from [.env.example](../../.env.example). Important local values:

- `DATABASE_URL`: required for direct pnpm database commands; use `localhost:5432` from the host.
- `API_PUBLIC_URL`: browser-facing API URL, normally `http://localhost:4000`.
- `CORS_ORIGIN`: web origin allowed by the API, normally `http://localhost:3000`.
- `JWT_SECRET`: local development secret.

Inside Compose, services use `postgres:5432`; in the browser and host shell, use host-reachable URLs.

## Troubleshooting

- Database connection errors: ensure PostgreSQL is running with `docker compose -f compose.yml ps postgres`.
- Port conflicts: web defaults to `3000`, API defaults to `4000`, and worker health defaults to `4001`.
- Type errors: run `pnpm check-types`.
- Lint errors: run `pnpm lint`.

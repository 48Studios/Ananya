# Ananya ERP

Ananya ERP is a modern operations platform for inventory, procurement, manufacturing, warehouse operations, projects, sales, finance, CRM, service, MRP, reporting, authentication/RBAC, documents, imports, and administrator-managed Data Packs.

[![Continuous Integration](https://github.com/48studios/ananya/actions/workflows/ci.yml/badge.svg)](https://github.com/48studios/ananya/actions/workflows/ci.yml)
[![Docker Publishing](https://github.com/48studios/ananya/actions/workflows/docker.yml/badge.svg)](https://github.com/48studios/ananya/actions/workflows/docker.yml)
[![Latest Release](https://img.shields.io/github/v/release/48studios/ananya?color=green&label=Release)](https://github.com/48studios/ananya/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GHCR](https://img.shields.io/badge/GHCR-ghcr.io%2F48studios-blue)](https://github.com/48studios/ananya/pkgs/container/ananya-web)

## Navigation

- [Get Started](#get-started)
- [Updating Ananya](#updating-ananya)
- [Backups](#backups)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Architecture](#architecture)
- [Contributing](#contributing)
- [License](#license)

# Get Started

This guide is for administrators and users installing and running Ananya ERP. You do not need to understand Node.js, pnpm, Turborepo, or full codebase internals.

## Requirements

- A Linux server or workstation capable of running Docker containers.
- Docker and Docker Compose (v2).
- Enough disk space for PostgreSQL data and uploaded files.
- Domain names (e.g. `erp.example.com` and `api.erp.example.com`) for HTTPS access, or `localhost` for evaluation.
- A reverse proxy (e.g. Caddy, Nginx, Traefik) for production HTTPS routing.

## 1. Download Ananya

Clone or download the Ananya ERP repository files:

```bash
git clone https://github.com/48studios/ananya.git
cd ananya
```

## 2. Configure Environment

Copy `.env.example` to `.env` and set your deployment parameters:

```bash
cp .env.example .env
```

Key configuration variables:

```env
ANANYA_VERSION=0.1.0

POSTGRES_DB=ananya
POSTGRES_USER=ananya
POSTGRES_PASSWORD=replace-with-a-strong-password

JWT_SECRET=replace-with-a-long-random-secret
CORS_ORIGIN=https://erp.example.com
API_PUBLIC_URL=https://api.erp.example.com

WEB_PORT=3000
API_PORT=4000
WORKER_PORT=4001
```

> **Note on Web Image Build**: The Web application is compiled with the public API address (`API_PUBLIC_URL`) configured for your deployment. The setup script automatically compiles the Web image for your domain while pulling pre-built API and Worker images from GitHub Container Registry.

## 3. Run Automated Setup

Run the automated setup script:

```bash
./setup.sh
```

The setup script automatically:
1. Validates your Docker & Docker Compose installation.
2. Compiles the Web image with your configured `API_PUBLIC_URL`.
3. Pulls published API and Worker container images from GHCR.
4. Starts PostgreSQL and waits for healthy status.
5. Executes database schema migrations using the published API image.
6. Starts the application stack (`web`, `api`, `worker`).
7. Probes service health and displays your access URLs.

## 4. Reverse Proxy & HTTPS Setup

Route public HTTPS requests to the host ports exposed by Docker:

```text
https://erp.example.com      -> Web container (host port 3000)
https://api.erp.example.com  -> API container (host port 4000)
```

| Public Endpoint               | Route To Target  |
| ----------------------------- | ---------------- |
| `https://erp.example.com`     | `localhost:3000` |
| `https://api.erp.example.com` | `localhost:4000` |

## 5. Install Data Packs

Database migrations prepare the schema structure only. Data Packs provision business master data (e.g., initial system roles, default categories, numbering series).

After opening `https://erp.example.com` in your browser, sign in as administrator and navigate to **Settings -> Data Packs** to install initial business data.

# Updating Ananya

To upgrade your installation to a newer release:

```bash
./setup.sh --upgrade
```

The upgrade script automatically:
1. Re-builds the Web image with your `API_PUBLIC_URL`.
2. Pulls updated published API and Worker images from GHCR.
3. Applies pending database schema migrations.
4. Safely updates running application containers.

Existing PostgreSQL database data, uploaded files, and `.env` credentials are preserved. No data volumes are deleted.

6. Verify health.

   ```bash
   docker compose -f compose.yml -f compose.prod.yml --profile worker ps
   docker compose -f compose.yml -f compose.prod.yml logs --tail=100 api
   docker compose -f compose.yml -f compose.prod.yml logs --tail=100 web
   docker compose -f compose.yml -f compose.prod.yml logs --tail=100 worker
   ```

Rollback depends on the release and any migrations already applied. Before upgrading, back up PostgreSQL data and uploaded files. If a release includes irreversible schema changes, restore from backup rather than assuming an older image can safely run against the upgraded database.

# Backups

Ananya stores durable state in two places:

- PostgreSQL data.
- Uploaded files in the `ananya_uploads_data` Docker volume.

Back up PostgreSQL:

```bash
docker compose -f compose.yml -f compose.prod.yml exec -T postgres pg_dump -U ananya ananya > ananya-postgres.sql
```

If you changed `POSTGRES_USER` or `POSTGRES_DB`, replace `ananya` in the command above.

Back up uploaded files:

```bash
docker run --rm -v ananya_uploads_data:/volume -v "$PWD:/backup" alpine tar czf /backup/ananya-uploads.tgz -C /volume .
```

Store backups outside the application server and test restoration before relying on them.

# Troubleshooting

Check service status:

```bash
docker compose -f compose.yml -f compose.prod.yml --profile worker ps
```

View logs:

```bash
docker compose -f compose.yml -f compose.prod.yml logs --tail=100 postgres
docker compose -f compose.yml -f compose.prod.yml logs --tail=100 api
docker compose -f compose.yml -f compose.prod.yml logs --tail=100 web
docker compose -f compose.yml -f compose.prod.yml logs --tail=100 worker
```

Common first-install issues:

| Problem                     | What to check                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------- |
| PostgreSQL is not healthy   | Check `POSTGRES_PASSWORD`, disk space, and `postgres` logs.                            |
| Migration fails             | Read the migration command output and confirm PostgreSQL is healthy.                   |
| API is unavailable          | Check `api` logs, `JWT_SECRET`, database connectivity, and `CORS_ORIGIN`.              |
| Web is unavailable          | Check `web` logs and confirm the reverse proxy routes to `WEB_PORT`.                   |
| Browser cannot call the API | Confirm `API_PUBLIC_URL` is a public browser-reachable URL, not a Docker service name. |
| Data Packs fail to install  | Check `api` logs and verify migrations completed successfully first.                   |

# Development

This section is for contributors and developers working on Ananya source code.

## Requirements

- Node.js `22.14.0` from [.nvmrc](.nvmrc), or any version satisfying `>=22.12.0`.
- pnpm `9.0.0`.
- Docker and Docker Compose.

## Clone Repository

```bash
git clone https://github.com/48studios/ananya.git
cd ananya
```

## Install Dependencies

```bash
pnpm install
```

## Environment

```bash
cp .env.example .env
```

For local browser development, keep:

```bash
API_PUBLIC_URL=http://localhost:4000
CORS_ORIGIN=http://localhost:3000
```

## Start Development Database

```bash
docker compose -f compose.yml -f compose.local.yml up -d postgres
```

`compose.local.yml` exposes PostgreSQL on `POSTGRES_PORT`, which defaults to `5432`.

## Run Migrations

```bash
DATABASE_URL=postgresql://ananya:ananya_secure_password@localhost:5432/ananya pnpm db:migrate
```

## Start Development Applications

```bash
pnpm dev
```

The web app runs on `http://localhost:3000`; the API runs on `http://localhost:4000`.

## Testing

Use only the root commands that exist in this repository:

```bash
pnpm lint
pnpm check-types
pnpm test
pnpm build
pnpm test:e2e
pnpm test:accessibility
pnpm test:visual
pnpm qa
```

## Local Docker Testing

Build and test the production Dockerfiles locally without pulling application images from GHCR:

```bash
docker compose -f compose.yml -f compose.local.yml up -d postgres
docker compose -f compose.yml -f compose.local.yml run --build --rm migrate
docker compose -f compose.yml -f compose.local.yml --profile worker up --build -d
docker compose -f compose.yml -f compose.local.yml --profile worker ps
```

# Architecture

Ananya is a DDD-oriented modular monolith.

```text
Browser
  -> Web
  -> API
  -> Domain / application packages
  -> PostgreSQL
```

The worker runs separately from the API process. It uses the API application context, exposes a health endpoint, and performs periodic background-task checks. Redis is not part of the current Compose stack.

Repository layout:

- `apps/web`: Next.js frontend.
- `apps/api`: NestJS REST API and worker entrypoint.
- `packages/database`: Drizzle/PostgreSQL schema and migrations.
- `packages/*`: domain, shared, lint, and TypeScript packages.
- `docker/*`: production Dockerfiles.
- `compose.yml`, `compose.local.yml`, `compose.prod.yml`: Compose configuration.

# Contributing

Before contributing, read:

- [AGENTS.md](AGENTS.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [DESIGN.md](DESIGN.md)
- [docs/development/LOCAL_DEVELOPMENT.md](docs/development/LOCAL_DEVELOPMENT.md)

Keep changes scoped, preserve module boundaries, and run the relevant checks before opening a pull request.

# License

Ananya ERP is licensed under the [MIT License](LICENSE).

Made with <3 in Kolkata, India.

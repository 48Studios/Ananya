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

This guide is for users and administrators who want to install and run Ananya ERP. You do not need to understand Node.js, pnpm, Turborepo, or the source-code architecture to follow it.

## Requirements

- A Linux server or workstation that can run Docker containers.
- Docker and Docker Compose.
- Enough disk space for PostgreSQL data and uploaded files.
- A domain name if you want browser access over HTTPS.
- A reverse proxy such as Caddy, Nginx, or Traefik for production HTTPS routing.

For local evaluation, a domain is optional and you can use `http://localhost:3000` for the web app and `http://localhost:4000` for the API.

## 1. Download Ananya

Choose the version you want to run, then download the production Compose files for that release.

```bash
mkdir ananya
cd ananya

export ANANYA_VERSION=0.1.0
export ANANYA_SOURCE_REF=v${ANANYA_VERSION}

curl -fsSLO https://raw.githubusercontent.com/48studios/ananya/${ANANYA_SOURCE_REF}/compose.yml
curl -fsSLO https://raw.githubusercontent.com/48studios/ananya/${ANANYA_SOURCE_REF}/compose.prod.yml
curl -fsSLo .env.example https://raw.githubusercontent.com/48studios/ananya/${ANANYA_SOURCE_REF}/.env.example
cp .env.example .env
```

This deployment uses published images from GitHub Container Registry. You do not need to clone the source repository for a normal installation.

## 2. Configure Environment

Edit `.env` and set your own values.

```bash
ANANYA_VERSION=0.1.0

POSTGRES_DB=ananya
POSTGRES_USER=ananya
POSTGRES_PASSWORD=replace-with-a-strong-database-password

JWT_SECRET=replace-with-a-long-random-secret
CORS_ORIGIN=https://erp.example.com
API_PUBLIC_URL=https://api.erp.example.com

WEB_PORT=3000
API_PORT=4000
WORKER_PORT=4001
```

Important variables:

| Variable             | What it means                                                                |
| -------------------- | ---------------------------------------------------------------------------- |
| `ANANYA_VERSION`     | The container image tag to run, such as `0.1.0` or `latest`.                 |
| `POSTGRES_*`         | PostgreSQL database name, user, and password used by the Compose stack.      |
| `JWT_SECRET`         | Secret used by the API for authentication. Use a long random value.          |
| `CORS_ORIGIN`        | The public web URL allowed to call the API.                                  |
| `API_PUBLIC_URL`     | The public API URL that the user's browser can reach.                        |
| `WEB_PORT`           | Host port routed to the web container.                                       |
| `API_PORT`           | Host port routed to the API container.                                       |
| `WORKER_PORT`        | Worker health-check port inside the worker container.                        |
| `STORAGE_DRIVER`     | Current file storage driver. The default local driver stores uploaded files. |
| `STORAGE_LOCAL_PATH` | Upload path inside the API and worker containers.                            |

Do not use Docker service names such as `api`, `ananya-api`, or `postgres` as browser-facing URLs. They only work inside the Docker network.

## 3. Configure the Database

PostgreSQL runs as part of the Docker deployment. You do not need to create tables manually.

Database tables are created and updated by the migration step below. Business data is added later through Data Packs.

## 4. Configure the Domain

A production installation normally has two public endpoints:

```text
https://erp.example.com      -> Web container, host port 3000
https://api.erp.example.com  -> API container, host port 4000
```

Use your reverse proxy to route those public domains to the host ports exposed by Docker Compose.

| Public endpoint               | Route to         |
| ----------------------------- | ---------------- |
| `https://erp.example.com`     | `localhost:3000` |
| `https://api.erp.example.com` | `localhost:4000` |

The reverse proxy configuration lives outside this repository's Compose stack.

## 5. Start PostgreSQL

```bash
docker compose -f compose.yml -f compose.prod.yml up -d postgres
```

## 6. Run Database Migrations

Run migrations explicitly before starting Ananya.

```bash
docker compose -f compose.yml -f compose.prod.yml run --rm migrate
```

Migrations create or update the PostgreSQL schema. They do not seed business data, install demo data, or install Data Packs.

Run migrations during first installation and again when upgrading to a release that contains schema changes.

## 7. Start Ananya

Start the web app, API, and worker:

```bash
docker compose -f compose.yml -f compose.prod.yml --profile worker up -d
```

If you do not want to run the worker process:

```bash
docker compose -f compose.yml -f compose.prod.yml up -d api web
```

## 8. Open Ananya

Open the application URL you configured:

```text
https://erp.example.com
```

For local evaluation without a reverse proxy, open:

```text
http://localhost:3000
```

## 9. Install Data Packs

Data Packs provision business and master data through the application.

```text
Database migrations = database schema
Data Packs          = business/application data
```

Data Packs do not install automatically. After the application is running, sign in as an administrator and install the Data Packs your organization needs from Settings -> Data Packs.

# Updating Ananya

Use this process when moving to a newer release.

1. Select the new version.

   ```bash
   export ANANYA_VERSION=0.1.1
   ```

2. Update `.env` so it uses the same version.

   ```bash
   ANANYA_VERSION=0.1.1
   ```

3. Pull the new images.

   ```bash
   docker compose -f compose.yml -f compose.prod.yml pull
   ```

4. Run migrations.

   ```bash
   docker compose -f compose.yml -f compose.prod.yml run --rm migrate
   ```

5. Recreate the application services.

   ```bash
   docker compose -f compose.yml -f compose.prod.yml --profile worker up -d
   ```

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

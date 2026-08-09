# Ananya ERP Docker Guide

This guide covers the Compose and container workflow for Ananya ERP. The root [README.md](../README.md) is the entry point; this file keeps the Docker-specific operational detail.

## Compose Files

Ananya uses three Compose files:

| File                                        | Purpose                                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [`compose.yml`](../compose.yml)             | Canonical/base stack: PostgreSQL, API, migration service, worker, web, pgAdmin profile, volumes, and network. |
| [`compose.local.yml`](../compose.local.yml) | Local override that builds application images from the repository Dockerfiles.                                |
| [`compose.prod.yml`](../compose.prod.yml)   | Production override that runs published GHCR images.                                                          |

Use `compose.yml` with one application override. Do not run `compose.prod.yml` by itself.

## Application Images

| Image                             | Container       | Purpose                                                                              |
| --------------------------------- | --------------- | ------------------------------------------------------------------------------------ |
| `ghcr.io/48studios/ananya-web`    | `ananya-web`    | Next.js standalone web app on port `3000`.                                           |
| `ghcr.io/48studios/ananya-api`    | `ananya-api`    | NestJS REST API on port `4000`; also used by the one-shot migration service.         |
| `ghcr.io/48studios/ananya-worker` | `ananya-worker` | Background worker using `apps/api/src/worker.ts`, with health checks on port `4001`. |

The Dockerfiles build non-root images using the `ananya` user with UID/GID `10001`.

## Required Deployment Order

Production and production-equivalent Docker runs should follow this order:

```text
PostgreSQL -> database migrations -> API / Worker / Web -> Data Packs when required
```

Migrations are explicit. The API container does not run migrations on startup.

## Local Production-Equivalent Build

Build and run the application Dockerfiles locally:

```bash
docker compose -f compose.yml -f compose.local.yml up -d postgres
docker compose -f compose.yml -f compose.local.yml run --build --rm migrate
docker compose -f compose.yml -f compose.local.yml --profile worker up --build -d
docker compose -f compose.yml -f compose.local.yml --profile worker ps
```

Shut down and remove local volumes:

```bash
docker compose -f compose.yml -f compose.local.yml --profile worker down -v --remove-orphans
```

## Production Deployment

Configure `.env` first:

```bash
ANANYA_VERSION=0.1.0
POSTGRES_DB=ananya
POSTGRES_USER=ananya
POSTGRES_PASSWORD=change-me
JWT_SECRET=change-me
CORS_ORIGIN=https://erp.example.com
API_PUBLIC_URL=https://api.erp.example.com
```

Then run:

```bash
docker compose -f compose.yml -f compose.prod.yml pull
docker compose -f compose.yml -f compose.prod.yml up -d postgres
docker compose -f compose.yml -f compose.prod.yml run --rm migrate
docker compose -f compose.yml -f compose.prod.yml --profile worker up -d
```

For deployments without the worker:

```bash
docker compose -f compose.yml -f compose.prod.yml up -d api web
```

## Upgrades

Pin the target version, pull images, run migrations, then update services:

```bash
ANANYA_VERSION=0.1.1 docker compose -f compose.yml -f compose.prod.yml pull
ANANYA_VERSION=0.1.1 docker compose -f compose.yml -f compose.prod.yml run --rm migrate
ANANYA_VERSION=0.1.1 docker compose -f compose.yml -f compose.prod.yml --profile worker up -d
```

Migrations modify schema only. Business/master data is installed separately through Data Packs in the web application.

## Image Tags

Current GitHub Actions behavior:

| Source                              | Tags                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------- |
| Push to `main` after CI passes      | `edge`, `sha-<short-sha>`                                              |
| Prerelease tag such as `v0.1.0-RC1` | `0.1.0-RC1`, lowercase prerelease channel such as `rc`                 |
| Stable tag such as `v0.1.0`         | `latest`, `0.1.0`, `0.1`; major tag when major version is at least `1` |

Use exact tags for production pinning:

```bash
ANANYA_VERSION=0.1.0
```

Use `latest` only when intentionally tracking the latest stable release:

```bash
ANANYA_VERSION=latest
```

## Networking

The browser uses public URLs:

```text
Browser -> https://erp.example.com -> Web
Browser -> https://api.erp.example.com -> API
```

Containers use Docker DNS only inside the Compose network:

```text
API / Worker / migrate -> postgres:5432
```

`API_PUBLIC_URL` must be browser-reachable. Do not set it to Docker service names such as `http://api:4000` or `http://ananya-api:4000`.

The production reverse proxy, such as Caddy, lives outside this Compose stack and should route:

```text
https://erp.example.com -> host/container port 3000
https://api.erp.example.com -> host/container port 4000
```

## Configuration Notes

- `DATABASE_URL` is constructed by Compose for API, worker, and migration containers using `postgres:5432`.
- Direct host commands, such as `pnpm db:migrate`, need a host-reachable `DATABASE_URL`, usually `localhost:5432`.
- Redis is not part of the current Docker stack.
- PostgreSQL has no host port mapping in the base/production stack; `compose.local.yml` publishes it through `POSTGRES_PORT` for host-side development.

## Health Checks

| Service    | Probe                                               |
| ---------- | --------------------------------------------------- |
| Web        | `http://localhost:3000/api/health`                  |
| API        | `http://localhost:4000/health` inside the container |
| Worker     | `http://localhost:4001/health` inside the container |
| PostgreSQL | `pg_isready`                                        |

---
kind: build_system
name: Turborepo Monorepo Build, Dockerized CI/CD & Release Pipeline
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - turbo.json
    - pnpm-workspace.yaml
    - .github/workflows/ci.yml
    - .github/workflows/_quality-gates.yml
    - .github/workflows/release.yml
    - docker/Dockerfile.api
    - docker/Dockerfile.web
    - docker/Dockerfile.worker
    - docker/Dockerfile.ml
    - docker/README.md
    - compose.yml
    - apps/api/package.json
    - apps/web/package.json
    - apps/ml/pyproject.toml
---

## Build System Overview

Ananya ERP is a **pnpm workspaces + Turborepo monorepo** that builds four services — NestJS API (`@ananya/api`), Next.js Web (`@ananya/web`), FastAPI ML service (`apps/ml`), and shared workspace packages under `packages/*` — through a single top-level entry point. The build pipeline is orchestrated by Turborepo tasks, containerized via multi-stage Dockerfiles, validated in GitHub Actions quality gates, and released as multi-architecture images to GHCR.

## Core Orchestration

- **Workspace definition**: `pnpm-workspace.yaml` declares `apps/*` and `packages/*` as workspaces; the root `package.json` pins `packageManager: pnpm@9.0.0` and `engines.node >=22.12.0`.
- **Top-level scripts** in `package.json` delegate to Turborepo: `build`, `dev`, `lint`, `check-types`, `test`, plus DB tooling (`db:generate`, `db:migrate`, `db:setup`, `db:bootstrap`) routed via `pnpm --filter @ananya/database ...` and an ML dev helper (`ml:dev` runs uvicorn from `apps/ml/.venv`).
- **Turborepo config** (`turbo.json`) defines global env vars (e.g. `DATABASE_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_COMMIT_SHA`), task dependency graphs using `dependsOn: ["^build"]` / `"^lint"` / `"^check-types"` so downstream apps rebuild only when their dependencies change, caches `.next/**` excluding cache/dev dirs, and marks `dev` as persistent with caching disabled.
- **Per-app scripts**: `apps/api/package.json` uses Nest CLI (`nest build`, `nest start`, `jest`); `apps/web/package.json` uses Next (`next build`, `next typegen && tsc --noEmit`, `vitest run`); `apps/ml/pyproject.toml` declares Python ≥3.11 with FastAPI/uvicorn/scikit-learn and optional pytest deps.

## Containerization

Each service has a hardened **four-stage Alpine Dockerfile** under `docker/` following the same pattern:

1. **Pruner** — copies repo, runs `npx turbo prune --scope=@ananya/<service> --docker` to produce a minimal workspace snapshot.
2. **Builder** — installs dependencies from pruned lockfile, runs `pnpm turbo run build --filter=@ananya/<service>...`, then strips non-runtime source files (`.ts`, `.tsx`, test dirs) from `packages/*`.
3. **Production Dependencies** — re-installs `--prod` (or `--frozen-lockfile --prod` for web) without build tooling.
4. **Runner** — creates a non-root `ananya` user/group with fixed UID/GID `10001`, copies only runtime artifacts, asserts deterministic outputs (e.g. `apps/api/dist/src/main.js`, `apps/web/server.js`, `packages/database/drizzle`), exposes health endpoints, and sets `HEALTHCHECK` probes.

The base Compose stack (`compose.yml`) defines `db` (PostgreSQL 16), `api`, `migrate` (one-shot migration runner), `worker`, `web`, `ml`, and optional `pgadmin` behind an internal bridge network. Overrides are layered: `compose.local.yml` builds from source Dockerfiles, `compose.prod.yml` pulls published GHCR images. Profiles (`all`, `worker`, `ml`, `tools`) let operators compose subsets of services. Migrations are explicit and not auto-run on API startup.

## CI/CD Pipelines

- **Continuous Integration** (`.github/workflows/ci.yml`): triggers on push to `main` and `release/*`, and pull requests against those branches. Delegates to reusable workflow `_quality-gates.yml` which checks out code, sets up Node via `.nvmrc`, restores pnpm/Turbo/Next.js caches keyed on `pnpm-lock.yaml` + `github.sha`, runs `pnpm install --frozen-lockfile`, then sequentially executes `turbo run lint`, `turbo run check-types`, `turbo run build`, `turbo run test` with grouped output logs and a step summary table.
- **Release Pipeline** (`.github/workflows/release.yml`): triggered on `v*` tags. Runs quality gates first, then a smoke test job using `_docker-smoke-test.yml` with the `worker` profile, then publishes multi-architecture images (`linux/amd64, linux/arm64`) for all four services via `docker/build-push-action@v6` with GHA cache scopes per service. Tag computation derives semantic tags: prerelease tags like `v0.1.0-RC1` get both the full tag and a lowercase channel alias (`rc`); stable tags get `latest`, `<version>`, `<major>.<minor>`, and `<major>` (when major ≥ 1). OCI metadata labels are attached via `docker/metadata-action`. A final job creates a GitHub Release with generated notes and `prerelease: true` when the tag contains `-`.
- **Docker publishing** is gated by `workflow_run` on the CI name `Monorepo Quality Gates` (renaming it would break image publishing from main, as documented in `ci.yml`).

## Versioning & Environment Strategy

- **Image tagging** follows SemVer conventions documented in `docker/README.md`: `edge` + `sha-<short-sha>` for pushes to `main`; prerelease channels (`rc`, etc.) for pre-release tags; `latest`, version, minor, and major tags for stable releases.
- **Web image immutability**: the `ananya-web` image carries no environment-specific API URL; at container boot `/app/docker-entrypoint-web.sh` generates `/app/apps/web/public/runtime-config.js` from `API_PUBLIC_URL`, so the browser calls the public API directly without Next.js proxying.
- **Build-time env injection**: Turborepo's `globalEnv` lists variables propagated into every task (including `NEXT_PUBLIC_*` values consumed by the Next.js build).
- **Node version pinning**: `.nvmrc` plus `engines.node` in root `package.json` ensure consistent toolchain across local dev and CI.

## Conventions Observed

- Every new app or package must expose standard Turborepo tasks (`build`, `lint`, `check-types`, `test`) in its own `package.json` so the monorepo-wide `turbo run <task>` works.
- Dependency direction is enforced by Turborepo's `^build` ordering: leaf apps depend on workspace packages but never the reverse.
- Production containers never run as root and validate their built artifacts before exposing ports.
- Database migrations are decoupled from application deployment and executed via a dedicated `migrate` Compose service.
- Health endpoints are standardized per service (`/health` for API/worker, `/api/health` for web, `/health` for ML) and used by both Compose healthchecks and Docker `HEALTHCHECK` directives.
- All CI jobs use `concurrency` groups keyed on `${{ github.workflow }}-${{ github.ref }}` to cancel in-progress runs on the same ref.
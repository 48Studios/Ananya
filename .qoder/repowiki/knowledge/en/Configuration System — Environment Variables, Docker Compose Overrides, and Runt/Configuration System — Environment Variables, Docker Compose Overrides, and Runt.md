---
kind: configuration_system
name: Configuration System — Environment Variables, Docker Compose Overrides, and Runtime Settings
category: configuration_system
scope:
    - '**'
source_files:
    - apps/api/src/main.ts
    - apps/ml/app/config.py
    - apps/ml/app/main.py
    - packages/database/drizzle.config.ts
    - compose.yml
    - compose.local.yml
    - compose.prod.yml
    - docker/Dockerfile.api
    - apps/api/src/settings/settings.module.ts
    - apps/api/src/settings/settings.service.ts
---

## Overview

The Ananya ERP monorepo uses a layered configuration approach that combines environment variables (`.env` via `dotenv`, Docker Compose variable interpolation), per-service typed settings objects, and runtime-persisted application settings stored in the database. There is no centralized config file format (no YAML/JSON config for the NestJS API); instead, each service reads its own environment and composes it into typed settings.

## Layer 1: Environment Variables

**NestJS API (`apps/api/src/main.ts`)**
- Loads `.env` at process start via `dotenv.config()` before any module bootstrap.
- Reads `PORT` (default `4000`) and `CORS_ORIGIN` (comma-separated list parsed into an array; default `true`).
- Other services consume env directly: `ML_SERVICE_URL` / `ML_SERVICE_ENABLED` in `ml-client.service.ts`, `HTTP_ACCESS_LOGGING` / `HTTP_ERROR_LOGGING` in the HTTP logging interceptor.

**ML Service (`apps/ml/app/config.py`)**
- Defines a Pydantic `Settings(BaseModel)` class that maps environment variables to typed fields with defaults:
  - `MODEL_DIR`, `CATEGORY_MODEL_PATH`, `CATEGORY_KNOWLEDGE_PATH`, `MANUFACTURER_KNOWLEDGE_PATH`, `ENABLE_ONNX_EMBEDDINGS`, `ONNX_MODEL_PATH`, `ONNX_TOKENIZER_PATH`, `max_request_size_bytes`.
  - Missing model paths fall back to relative paths under the package's `models/` directory.
- A singleton `settings = Settings()` is imported by `main.py` and used to seed FastAPI metadata (`service_name`, `service_version`).

**Database migrations (`packages/database/drizzle.config.ts`)**
- Uses `dotenv` to load `.env` from the repo root if present, then again from the current working directory.
- Throws a hard error when `DATABASE_URL` is missing, enforcing that the DB connection string must be provided before any migration or schema tooling runs.

## Layer 2: Docker Compose as the Configuration Source of Truth

`compose.yml` is the base stack and declares every service's environment through Docker Compose variable interpolation with defaults, so operators only need to set values they want to override:

| Service | Key vars | Notes |
|---|---|---|
| `db` | `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Defaults seeded inline |
| `api` | `NODE_ENV`, `PORT`, `DATABASE_URL`, `CORS_ORIGIN`, `JWT_SECRET`, `ML_SERVICE_URL`, `ML_SERVICE_ENABLED` | Health probe hits `/health` on port 4000 |
| `worker` | `NODE_ENV`, `WORKER_PORT`, `DATABASE_URL`, `WORKER_CONCURRENCY` | Profile-gated (`worker` / `all`) |
| `web` | `NODE_ENV`, `PORT`, `API_PUBLIC_URL` | Comment explicitly forbids Docker service names here; browser-facing URLs must be public |
| `ml` | `PORT` | Profile-gated (`ml` / `all`) |
| `pgadmin` | `PGADMIN_DEFAULT_EMAIL`, `PGADMIN_DEFAULT_PASSWORD`, `PGADMIN_PORT` | Profile-gated (`tools` / `admin` / `all`) |

Override files layer on top:
- `compose.local.yml` — switches all services to build from local Dockerfiles and exposes the Postgres port.
- `compose.prod.yml` — pins images to GHCR (`ghcr.io/48studios/ananya-*:${ANANYA_VERSION:-latest}`) and enforces `API_PUBLIC_URL` as a required build arg for the web image.

## Layer 3: Container Image Defaults

Each Dockerfile sets baseline `ENV` values that match the compose defaults:
- `docker/Dockerfile.api`: `NODE_ENV=production`, `PORT=4000`.
- The runner stage runs as a non-root user `ananya` (UID/GID 10001) and includes a healthcheck hitting `/health`.

## Layer 4: Runtime-Persisted Application Settings (Database)

Beyond process-level configuration, the API persists tenant/runtime settings in PostgreSQL via the `SettingsModule` (`apps/api/src/settings/settings.module.ts`, `settings.service.ts`):

- **Organization profile** (`organizationProfile` table): company name, tax ID, timezone, address — created with defaults on first read.
- **System settings** (`systemSettings` table): base currency, supported currencies, fiscal year start month, date format — defaults seeded on first read.
- **Numbering series** (`numberingSeries` table): document code prefixes and sequences per entity type (PurchaseOrder, WorkOrder, Component).
- **Feature flags** (`featureFlags` table): keys like `MFA_REQUIRED`, `EXPERIMENTAL_AI_FORECAST`, `BARCODE_STUDIO` with `isEnabled` toggles, category, and description — seeded on first read.

All mutations are recorded through `ActivityService` and `SecurityAuditService`, so changes to these settings are auditable.

## Conventions and Constraints Observed

1. **Environment-first, typed fallbacks**: Each service defines its own typed settings object (Pydantic for ML; direct `process.env` access for NestJS). No shared config library is used across services.
2. **No secrets in source control**: Sensitive values (`JWT_SECRET`, `POSTGRES_PASSWORD`, `DATABASE_URL`) are supplied via Compose variable interpolation with safe defaults intended for local/dev use only.
3. **Compose overrides separate concerns**: Base stack (`compose.yml`) holds shared service definitions; `compose.local.yml` adds build directives; `compose.prod.yml` pins published images and enforces required args.
4. **Web app never embeds internal service names**: The `web` service comment explicitly states Docker service names must never appear in `API_PUBLIC_URL`; the URL must be reachable by the browser.
5. **DB URL is mandatory for tooling**: Drizzle config throws if `DATABASE_URL` is unset, preventing accidental operation against wrong databases.
6. **Runtime settings are bootstrapped with defaults**: If tables are empty, `SettingsService` inserts sensible defaults (company info, currencies, feature flags) on first access rather than failing.
7. **Feature flags are persisted, not env-driven**: Feature toggles live in the `featureFlags` table and are managed through the API, not via environment variables.
8. **Health endpoints double as configuration probes**: Every service exposes `/health` (and `/ready` for ML) so Compose can gate startup order based on readiness.
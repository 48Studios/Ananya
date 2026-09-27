---
kind: dependency_management
name: pnpm Monorepo with Turborepo, Private Workspace Packages, and Dual Python/Node Dependency Management
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - pnpm-workspace.yaml
    - pnpm-lock.yaml
    - apps/web/pnpm-lock.yaml
    - turbo.json
    - .npmrc
    - apps/api/package.json
    - apps/web/package.json
    - apps/ml/pyproject.toml
    - apps/ml/requirements.txt
    - packages/database/package.json
    - packages/core/package.json
    - packages/shared/package.json
    - packages/typescript-config/package.json
    - compose.yml
---

# Dependency Management in Ananya ERP Monorepo

## Approach Overview

The repository is a **Turborepo + pnpm workspace monorepo** that manages three distinct dependency surfaces:

1. **Node.js (TypeScript)** — pnpm workspaces under `apps/*` and `packages/*`, orchestrated by Turborepo.
2. **Python (ML service)** — `apps/ml` uses both `pyproject.toml` (primary) and `requirements.txt` (legacy/install script).
3. **Container images** — Docker Compose pins base images (`postgres:16-alpine`, `dpage/pgadmin4:latest`) and multi-stage Dockerfiles build each service.

There is no vendoring of third-party code; all packages are resolved from the public npm registry and PyPI.

## Key Files

- Root manifest: `package.json` — declares root scripts, `packageManager: "pnpm@9.0.0"`, Node engine `>=22.12.0`, and dev-only tooling (`turbo`, `prettier`, `typescript`, `vitest`, `drizzle-kit`).
- Workspace definition: `pnpm-workspace.yaml` — registers `apps/*` and `packages/*` as workspaces.
- Lockfile: `pnpm-lock.yaml` (root-level) plus `apps/web/pnpm-lock.yaml` (web app has its own lockfile).
- Build orchestration: `turbo.json` — defines task graph (`build`, `lint`, `check-types`, `test`, `dev`) with `dependsOn: ["^build"]` / `"^lint"` / `"^check-types"` so downstream packages must build before dependents.
- Registry config: `.npmrc` — sets `shamefully-hoist=true` for flat node_modules resolution.
- Python manifests: `apps/ml/pyproject.toml` (primary, PEP 621), `apps/ml/requirements.txt` (used by the root `ml:setup` script).
- Container stack: `compose.yml` pins `postgres:16-alpine` and `dpage/pgadmin4:latest`; per-service Dockerfiles live under `docker/`.

## Workspace Package Layout

Private packages live under `packages/` and follow a consistent shape:

| Package | Role | Version strategy |
|---|---|---|
| `@ananya/core` | Shared primitives | `0.0.1`, private, dual `main`/`types` exports |
| `@ananya/database` | Drizzle ORM layer, migrations, bootstrap | `0.0.0`, private, subpath exports (`./schema`, `./query`, `./migrate`) with `typesVersions` |
| `@ananya/shared` | Runtime-shared TS types | `0.0.0`, ESM-only, points directly at `src/index.ts` |
| `@ananya/typescript-config` | Shared tsconfig presets | `0.0.0`, private, `publishConfig.access: "public"` |
| `@ananya/eslint-config` | Shared ESLint preset | consumed via `workspace:*` |
| Domain packages (`inventory`, `finance`, `crm`, `procurement`, `manufacturing`, `warehouse`, `sales`, `projects`, `service`, `mrp`) | Bounded-context domain models | All `private: true`, versioned independently |

All inter-package references use the pnpm workspace protocol:
- `workspace:^` — used by `apps/api` for runtime dependencies (allows minor/patch upgrades within the same major).
- `workspace:*` — used by apps and packages for dev/build-time deps such as `@ananya/typescript-config` and `@ananya/eslint-config`.

No package is published to a registry; every package is marked `"private": true` (except `@ananya/typescript-config` which is publishable but not published). There is no `.npmignore` or custom publish workflow in this snapshot.

## Versioning Conventions

- **Workspace packages**: versions are intentionally low/stable (`0.0.0` or `0.0.1`) because they are internal only; consumers pin them via `workspace:^` / `workspace:*` rather than semver ranges against a registry.
- **Third-party Node packages**: pinned with caret ranges (`^11.0.1`, `^19.2.0`, `^5.9.2`, etc.) — updated via `pnpm up`.
- **Third-party Python packages**: declared with minimum-version constraints in `pyproject.toml` (e.g. `fastapi>=0.115.0`, `numpy>=1.26.0,<2.0.0`); `requirements.txt` mirrors these constraints for the legacy install path.
- **Node runtime**: enforced via `engines.node >= 22.12.0` in root `package.json` and `packageManager: "pnpm@9.0.0"` (enforced by pnpm's integrity check on install).

## Build & Install Orchestration

Root `package.json` scripts delegate everything through Turborepo:

```json
"build": "turbo run build",
"lint": "turbo run lint",
"check-types": "turbo run check-types",
"test": "turbo run test"
```

`turbo.json` enforces ordering:
- `build` depends on `^build` (all upstream packages build first).
- `test` depends on `^build`.
- `dev` is uncached and persistent.
- Global env vars (including `DATABASE_URL`, `JWT_SECRET`, `NEXT_PUBLIC_*`) are propagated into tasks.

Python ML setup is separate: the root script `ml:setup` creates a venv and installs from `apps/ml/requirements.txt`:
```bash
python3 -m venv apps/ml/.venv && ./apps/ml/.venv/bin/pip install -r apps/ml/requirements.txt
```

## Docker & CI Integration

`compose.yml` composes four services (`db`, `api`, `web`, `ml`) plus optional `pgadmin`. Base image tags are explicit (`postgres:16-alpine`, `dpage/pgadmin4:latest`). Per-service Dockerfiles under `docker/` (`Dockerfile.api`, `Dockerfile.web`, `Dockerfile.ml`, `Dockerfile.worker`) perform multi-stage builds using the already-installed `node_modules` / `.venv` from the host.

## Constraints Observed

- All Node dependencies are resolved via pnpm workspaces; there is no `yarn.lock` or `package-lock.json` usage for application code (the root `package-lock.json` appears to be a leftover artifact alongside `pnpm-lock.yaml`).
- No private npm registry or `.npmrc` auth tokens are configured beyond `shamefully-hoist=true`; packages come from the public npm registry.
- No vendored third-party source code exists under `vendor/`, `third_party/`, or similar directories.
- The web app (`apps/web`) carries its own `pnpm-lock.yaml` in addition to the root lockfile, suggesting a split lockfile strategy for the Next.js app.
- Python dependencies are duplicated between `pyproject.toml` and `requirements.txt`; the two files should be kept in sync manually.
- `turbo.json` does not declare any remote cache configuration — caching is local unless a remote cache is added later.
- `packageManager: "pnpm@9.0.0"` in root `package.json` means pnpm will enforce that exact version when installing.
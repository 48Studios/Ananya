# Ananya ERP — Operations Platform for 48 Studios

> **Ananya ERP** is an internal operations platform for **48 Studios**, built as a Modular Monolith with Domain-Driven Design (DDD) principles.

---

## 🚀 Production Deployment via GitHub Container Registry (GHCR)

Ananya ERP is fully containerized and automatically published to **GitHub Container Registry (GHCR)** as multi-architecture container images (`linux/amd64`, `linux/arm64`).

### Quick Start
```bash
# 1. Clone repository & prepare environment
cp .env.example .env

# 2. Pull production container images from GHCR
docker compose -f compose.prod.yaml pull

# 3. Launch production stack (Web, API, Worker, PostgreSQL, Redis)
docker compose -f compose.prod.yaml up -d
```

- **Web Application**: [http://localhost:3000](http://localhost:3000) (Healthcheck: `/api/health`)
- **API Server**: [http://localhost:4000](http://localhost:4000) (Healthcheck: `/health`)
- **Worker Process**: [http://localhost:4001](http://localhost:4001) (Healthcheck: `/health`)

Detailed release pipeline, tag matrices (`edge`, `sha-<commit>`, `vX.Y.Z`, `latest`), rollback procedures, and Home Lab deployment documentation are available in [docker/README.md](file:///Users/jrsarath/Documents/GitHub/ananya/docker/README.md).

---

## 🔄 Release Engineering Lifecycle

```
Developer Push (main) ──► CI Quality Gates ──► Buildx Multi-Arch ──► GHCR edge / sha-<commit>
                                                                            │
Daily Driver Update ◄───────────────────────────────────────────────────────┘
         │
Git Release Tag (v0.1.0) ──► Publish Release Images (v0.1.0, latest) ──► GitHub Release
```

---

## 📦 Workspace Architecture

Ananya ERP is managed as a pnpm Turborepo monorepo:

### Applications (`apps/`)
- `web`: Next.js 15 App Router web application
- `api`: NestJS modular backend REST API & background worker

### Core Domain Packages (`packages/`)
- `@ananya/shared`: Shared contracts, interfaces, and DTO types
- `@ananya/core`: Base domain entities, DomainError primitives, value objects
- `@ananya/database`: Drizzle ORM schema, migrations, and system bootstrap
- `@ananya/inventory`: Component, serial, batch, allocation & inventory ledger aggregates
- `@ananya/procurement`: Purchase orders, suppliers, goods receipts & vendor management
- `@ananya/manufacturing`: Work orders, BOMs, routing & production execution
- `@ananya/warehouse`: Warehouses, bins, cycle counts, inter-facility transfers
- `@ananya/projects`: Project material tracking, milestones & allocations

---

## 🛠 Local Development Commands

```bash
# Install dependencies
pnpm install

# Run database setup & system bootstrap
pnpm db:setup

# Start development dev servers
pnpm dev

# Run quality gates (Lint, Check-Types, Test, Build)
pnpm qa
```

# Ananya ERP — Operations Platform for 48 Studios

> **Ananya ERP** is an internal operations platform for **48 Studios**, built as a Modular Monolith with Domain-Driven Design (DDD) principles.

---

## 🚀 Docker Production Deployment

Ananya ERP is fully containerized and production-ready for Docker Hub, self-hosting, home labs, and cloud environments.

### Quick Start

```bash
# 1. Clone & prepare environment
cp .env.example .env

# 2. Launch production stack (Web, API, Worker, PostgreSQL, Redis)
docker compose -f compose.prod.yaml up -d
```

- **Web Application**: [http://localhost:3000](http://localhost:3000)
- **API Server**: [http://localhost:4000](http://localhost:4000)
- **Worker Process**: [http://localhost:4001](http://localhost:4001)

Detailed building, scaling, backup, and Docker Hub publishing documentation is available in [docker/README.md](file:///Users/jrsarath/Documents/GitHub/ananya/docker/README.md).

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

# Run quality gates
pnpm qa
```

# Project Structure

This document describes how the Ananya repository is organized and where new code should be added.

## Repository Layout

```text
apps/
packages/
docs/
tests/
.agents/
.github/
```

---

## apps/

Deployable applications and services.

```text
apps/
├── api         # NestJS REST API server (HTTP controllers, services, guards)
├── ml          # FastAPI lightweight Python ML microservice (CPU-first intelligence)
└── web         # Next.js 16 App Router web frontend (React 19, Tailwind, shadcn)
```

### api (`apps/api`)

NestJS application responsible for exposing the HTTP API to web and mobile clients.

Responsibilities:

- REST controllers and route guards (`AuthGuard`, `PermissionGuard`)
- Request validation via class-validator DTOs
- Application service orchestration
- Drizzle repository implementations and database transaction boundaries
- Audit logging (`SecurityAuditService`)

### ml (`apps/ml`)

FastAPI microservice executing CPU-first component classification, attribute extraction, and candidate model evaluation.

Responsibilities:

- FastText & TF-IDF model pipelines
- Prefix-based deterministic manufacturer and datasheet property parsers
- Vector embeddings and semantic deduplication
- Model registry and offline training pipeline

### web (`apps/web`)

Next.js web application providing the responsive ERP interface.

Responsibilities:

- Next.js App Router pages and client state
- High-density Tailwind CSS and Radix/shadcn components
- Standalone `/scan` PWA camera surface
- Global search / command palette (`⌘K`)
- Frontend onboarding and settings management

---

## packages/

Shared domain packages and infrastructure libraries used across the applications.

```text
packages/
├── core               # Shared domain primitives (DomainError, ObjectId)
├── database           # Drizzle ORM schema, migrations, connection pool
├── shared             # Common utility functions and shared types
├── eslint-config      # Shared ESLint configuration
├── typescript-config  # Shared TypeScript compiler configuration
│
├── inventory          # Inventory domain model, transactions, ledger, batches
├── procurement        # Suppliers, purchase orders, goods receipts, purchase invoices
├── manufacturing      # Bills of materials (BOM), production orders, material consumption
├── warehouse          # Warehouse layout, bin locations, internal transfers, stock counts
├── sales              # Customers, quotations, sales orders, fulfillment, shipping
├── finance            # Chart of accounts, general ledger, AR/AP, payment tracking
├── crm                # Leads, accounts, contacts, opportunities, CRM-to-sales pipeline
├── projects           # Projects, milestones, deliverables, tasks, timesheets
├── service            # Service requests, work orders, warranty, RMA
└── mrp                # Material Requirements Planning calculations and recommendations
```

### Core Infrastructure Packages

- **`@ananya/core`**: Framework-independent primitives (`DomainError`, `ObjectId`).
- **`@ananya/database`**: Drizzle schema definitions, database connection clients, migration runner, and infrastructure bootstrap.
- **`@ananya/shared`**: Cross-package utilities and types without domain logic.
- **`@ananya/typescript-config`**: Monorepo TypeScript configuration presets.
- **`@ananya/eslint-config`**: Shared ESLint rules.

### Domain Context Packages

Each domain context owns its entities, aggregate roots, domain use cases, repository interfaces, and invariant rules. No domain package may import NestJS, Next.js, or Drizzle directly.

---

## docs/

Authoritative system documentation.

- **`architecture/`**: High-level design, DDD standards, AI agent guidelines, project structure.
- **`rfcs/`**: Sequential Request for Comments (RFC-0001 through RFC-0061).
- **`security/`**: Authorization matrix, public endpoint perimeter, and threat boundaries.
- **`development/`**: Local environment setup, development workflows, testing guide.
- **`standards/`**: Engineering standards, coding guidelines, package creation rules.
- **`archive/`**: Preserved historical audits, superseded analyses, and deprecated proposals.

---

## Dependency Direction

```text
UI (web)
   ↓
API (api)
   ↓
Domain Packages (@ananya/inventory, @ananya/procurement, ...)
   ↓
Core Primitives (@ananya/core)
```

- Applications depend on packages.
- Domain packages depend only on `@ananya/core` and peer domain interfaces where strictly specified.
- Persistence implementations in `@ananya/database` implement interfaces defined by the domain.
- Framework-independent packages remain fully testable without external services.

---

## Adding New Features

When introducing a new business capability:

1. Define or extend the domain model inside the relevant `packages/*` domain package.
2. Define repository interfaces in the domain package.
3. Implement persistence mapping in `@ananya/database` or `apps/api`.
4. Expose functionality through thin NestJS controllers in `apps/api`.
5. Implement UI pages and components in `apps/web`.

Business mutation logic must never originate in UI components or API controllers.

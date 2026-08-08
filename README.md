<div align="center">

# 📦 Ananya ERP

### Next-Generation Internal Operations & Enterprise Resource Planning Platform

_Built for **48 Studios** as an open-source, production-first Modular Monolith using Domain-Driven Design (DDD) principles._

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Continuous Integration](https://github.com/48studios/ananya/actions/workflows/ci.yml/badge.svg)](https://github.com/48studios/ananya/actions/workflows/ci.yml)
[![Docker Publishing](https://github.com/48studios/ananya/actions/workflows/docker.yml/badge.svg)](https://github.com/48studios/ananya/actions/workflows/docker.yml)
[![Latest Release](https://img.shields.io/github/v/release/48studios/ananya?color=green&label=Release)](https://github.com/48studios/ananya/releases)
[![GHCR Container Images](https://img.shields.io/badge/GHCR-ghcr.io%2F48studios-blue)](https://github.com/48studios/ananya/pkgs/container/ananya-web)
[![Next.js 15](https://img.shields.io/badge/Next.js-15.0-black?logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19.0-61dafb?logo=react)](https://react.dev/)
[![TypeScript 5.9](https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![Node.js 20 LTS](https://img.shields.io/badge/Node.js-20_LTS-339933?logo=nodedotjs)](https://nodejs.org/)
[![pnpm 9](https://img.shields.io/badge/pnpm-9.0-f69220?logo=pnpm)](https://pnpm.io/)
[![Turborepo](https://img.shields.io/badge/Turborepo-2.10-ef4444?logo=turborepo)](https://turbo.build/)
[![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-latest-black)](https://ui.shadcn.com/)
[![PostgreSQL 16](https://img.shields.io/badge/PostgreSQL-16-4169e1?logo=postgresql)](https://www.postgresql.org/)
[![Docker Ready](https://img.shields.io/badge/Docker-Ready-2496ed?logo=docker)](https://www.docker.com/)
[![Multi-Arch](https://img.shields.io/badge/Platforms-linux%2Famd64%20%7C%20linux%2Farm64-blue)](https://github.com/48studios/ananya/pkgs/container/ananya-web)
[![Open Source](https://img.shields.io/badge/Open%20Source-❤️-red)](https://github.com/48studios/ananya)

---

</div>

> _Ananya ERP provides high-density operational views, keyboard-first ⌘K global search, vector barcode & QR tag generation, live stock ledgers, and web-first data lifecycle administration._

---

## 📑 Table of Contents

- [Introduction](#-introduction)
- [Why Ananya?](#-why-ananya)
- [Key Features](#-key-features)
- [ERP Capability Matrix](#-erp-capability-matrix)
- [Architecture](#-architecture)
- [Monorepo Structure](#-monorepo-structure)
- [Technology Stack](#-technology-stack)
- [Quick Start](#-quick-start)
- [Docker Containerization](#-docker-containerization)
- [Deployment via GHCR](#-deployment-via-ghcr)
- [Environment Variables](#-environment-variables)
- [Continuous Integration & Delivery (CI/CD)](#-continuous-integration--delivery-cicd)
- [Project Directory Layout](#-project-directory-layout)
- [Development Workflow & Coding Standards](#-development-workflow--coding-standards)
- [UI & Design System Standards](#-ui--design-system-standards)
- [Authentication & RBAC Security](#-authentication--rbac-security)
- [Web-First Data Lifecycle Management](#-web-first-data-lifecycle-management)
- [Automated QA & Testing Suite](#-automated-qa--testing-suite)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)
- [Security Policy](#-security-policy)
- [Performance & Optimization](#-performance--optimization)
- [License](#-license)
- [Credits](#-credits)

---

## 💡 Introduction

### The Problem

Traditional Enterprise Resource Planning (ERP) systems suffer from bloated legacy user interfaces, complex CLI maintenance requirements, fragile seeding scripts, slow monolithic deployment steps, and poorly bounded codebases where business rules are scattered across UI views and database hooks.

### The Vision

**Ananya ERP** is engineered as a modern, high-performance, web-first operations management platform. Built strictly following **Domain-Driven Design (DDD)** principles as a **Modular Monolith**, Ananya isolates domain logic into zero-dependency TypeScript packages while delivering a responsive, keyboard-optimized UI powered by Next.js 15, React 19, and NestJS.

### Scope & Target Users

Ananya is designed for hardware manufacturing studios, electronics assembly operations, engineering project teams, and enterprise logistics managers requiring strict inventory ledger immutability, precise bill-of-materials (BOM) management, material reservation controls, and automated background job processing.

---

## 🌟 Why Ananya?

- **Domain-Driven Design (DDD)**: Business logic lives strictly inside framework-independent domain packages (`@ananya/inventory`, `@ananya/procurement`, `@ananya/manufacturing`, etc.). Controllers only orchestrate; domain services enforce invariants.
- **Immutable Inventory Ledgers**: Inventory stock mutations never overwrite physical balances directly. Every stock movement creates an immutable transaction entry inside database transactions.
- **Web-First Administration Model**: Zero CLI database seed, clear, or reset scripts. Operational data management happens strictly inside the Web UI via Data Packs Studio (`/settings/data-packs`) and secure 3-step Organization Reset (`/settings/danger-zone`).
- **Production-Ready & Docker-First**: Ships with multi-stage, non-root (`ananya` user, `UID/GID 10001`), standalone Next.js container images published automatically to GitHub Container Registry (GHCR).
- **Hardened 9-Stage CI/CD Pipeline**: Automated GitHub Actions workflows enforce monorepo quality gates, Playwright E2E browser tests, container boot smoke tests, Trivy vulnerability audits, and SPDX SBOM generation before image publication.

---

## ⚡ Key Features

### 📦 Inventory & Logistics

- **Components & Master Entities**: Centralized catalog with searchable, inline-creatable entity selectors for Units of Measure, Categories, Manufacturers, Suppliers, Warehouses, and Locations.
- **Immutable Stock Ledger**: Auditable, directional transaction history for inbound receipts, outbound issues, transfers, and adjustments.
- **Material Reservations**: Available vs Reserved holds (`Available = On Hand - Reserved`), preventing over-reservation with hold date locks.
- **Serial & Batch Tracking**: Lot-tracked serial number assignment, expiration holds, and full batch traceability.
- **Cycle Counting & Audit**: Facility inventory counts with record variance calculation (`Match`, `Shortage`, `Surplus`) generating compensating stock adjustments upon approval.
- **Warehouse Transfers**: Inter-facility stock dispatch and receipt workflows with compensating return logic on cancellation.

### 🏭 Manufacturing Execution

- **Bill of Materials (BOM)**: Version-controlled multi-level component trees with scrap factors, circular dependency checks, and release published guards.
- **Work Orders**: Manufacturing job dispatching with automated BOM line material requirement calculations and yield progress tracking.
- **Production Output & Scrap**: Real-time batch output execution recording finished goods receipts and proportional raw material deductions within single database transactions.

### 🛍️ Procurement & Vendor Management

- **Purchase Orders (PO)**: Vendor order tracking with line item totals calculation, status progress bar (`DRAFT` &rarr; `SUBMITTED` &rarr; `PARTIALLY_RECEIVED` &rarr; `FULFILLED` / `CANCELLED`), and print-ready views.
- **Goods Receipts (GRN)**: Partial and complete warehouse delivery receipts linked directly to open Purchase Orders with over-receiving protection.
- **Supplier Returns & Invoicing**: Supplier return tracking and purchase invoice three-way matching.

### 📐 Projects & Material Allocation

- **Project Operations**: Project milestone management, priority tracking, owner assignments, and chronological activity audit trails.
- **Material Allocation**: Component reservation holds assigned directly to active projects with issue to usage and return back to stock.

### 🔧 Service, Maintenance & RMA

- **Service Requests & Work Orders**: Maintenance ticketing, scheduled recurring preventive maintenance, and service notes logging.
- **Warranty & RMA**: Customer warranty claim validation and Return Merchandise Authorization (RMA) tracking.

### 📊 Reporting & Analytics

- **Domain Reports**: Dedicated dashboards for Inventory, Procurement, Manufacturing, Projects, and Stock Valuation.
- **Dynamic Quick Stats**: Real-time sidebar metric cards wired to backend reporting APIs.

### 🛠 System Administration & Security

- **Identity & RBAC**: Granular permissions matrix supporting system roles (`Admin`, `Manager`, `Member`, `Viewer`) with permission-aware navigation.
- **Command Palette & Global Search**: Platform-wide `⌘K` keyboard command palette for navigation, entity lookups, and quick actions.
- **Barcode & QR Studio**: Vector SVG barcode (`Code 128`, `EAN-13`) and QR tag renderer (`ANANYA:V1:TYPE:ID`) with printable label templates and USB/Bluetooth hardware keypress scanner buffering.
- **Data Packs Studio**: Web-based installation packages for Base Units, Core Logistics, Default Categories, and Demo datasets.

---

## 📊 ERP Capability Matrix

| Module             | Feature                    | Status      | Implementation Details                                                   |
| :----------------- | :------------------------- | :---------- | :----------------------------------------------------------------------- |
| **Inventory**      | Component Master Catalog   | 🟢 Verified | CRUD, Category/Manufacturer/Unit comboboxes, barcode integration         |
| **Inventory**      | Stock Transactions         | 🟢 Verified | Immutable ledger, directional audit trail, location timeline             |
| **Inventory**      | Reservations & Allocations | 🟢 Verified | Available stock calculation lock, release, fulfillment workflows         |
| **Inventory**      | Cycle Counting             | 🟢 Verified | Variance calculation modal, automatic Stock Adjustment generation        |
| **Inventory**      | Warehouse Transfers        | 🟢 Verified | Dispatch/receipt state machine, TransferOut/TransferIn ledgers           |
| **Procurement**    | Purchase Orders            | 🟢 Verified | Line editor, real-time totals, submission/cancellation state machine     |
| **Procurement**    | Goods Receipts (GRN)       | 🟢 Verified | PO line prefilling, partial delivery receipt, over-receive guard         |
| **Procurement**    | Suppliers Catalog          | 🟢 Verified | Vendor contact management, PO dependency protections                     |
| **Manufacturing**  | Bill of Materials (BOM)    | 🟢 Verified | Multi-level lines, scrap factor %, circular dependency check             |
| **Manufacturing**  | Work Orders                | 🟢 Verified | BOM auto calculation, progress tracking, status state machine            |
| **Manufacturing**  | Production Execution       | 🟢 Verified | Partial output recording, proportional scrap & material issue            |
| **Projects**       | Project Management         | 🟢 Verified | Milestone tracking, priority management, activity audit feed             |
| **Projects**       | Material Allocation        | 🟢 Verified | Project reservation holds, material issue, return back to stock          |
| **Reporting**      | Reports Hub                | 🟢 Verified | Read-only reporting service, charts, dynamic trend metrics               |
| **Security**       | Auth & RBAC                | 🟢 Verified | Granular permission matrix, Bearer session context, middleware edge auth |
| **Administration** | Data Packs Studio          | 🟢 Verified | Web-based data pack installer, pre-import validation engine              |
| **Administration** | Organization Reset         | 🟢 Verified | 3-step security purge, system tenant preservation, audit logging         |
| **Studio**         | Barcode & QR Operations    | 🟢 Verified | SVG vector previewers, compact/shelf bin labels, quick scan dialog       |

---

## 🏗 Architecture

### Layered Architecture & Data Flow

```mermaid
graph TD
    subgraph UI ["UI Layer (apps/web)"]
        Web["Next.js 15 App Router / React 19"]
        Shell["DashboardLayout & Context Navigation"]
        Form["React Hook Form + Zod Contracts"]
    end

    subgraph API ["API Layer (apps/api)"]
        Controllers["NestJS Controllers & ValidationPipes"]
        DTOs["Request / Response DTO Contracts"]
        Worker["Dedicated Background Worker (src/worker.ts)"]
    end

    subgraph Domain ["Domain Services Layer (packages/*)"]
        InvDomain["@ananya/inventory"]
        ProcDomain["@ananya/procurement"]
        MfgDomain["@ananya/manufacturing"]
        ProjDomain["@ananya/projects"]
        CoreDomain["@ananya/core & @ananya/shared"]
    end

    subgraph Persistence ["Persistence Layer (packages/database)"]
        Repo["Repository Interfaces & Implementations"]
        Drizzle["Drizzle ORM 0.44 Schemas"]
        DB[(PostgreSQL 16 Engine)]
    end

    Web -->|HTTP / REST APIs| Controllers
    Shell -->|Bearer Token Context| Controllers
    Controllers -->|Validate DTOs| DTOs
    Controllers -->|Orchestrate Requests| InvDomain
    Controllers -->|Orchestrate Requests| ProcDomain
    Controllers -->|Orchestrate Requests| MfgDomain
    Controllers -->|Orchestrate Requests| ProjDomain
    InvDomain -->|Execute Transactions| Repo
    ProcDomain -->|Execute Transactions| Repo
    MfgDomain -->|Execute Transactions| Repo
    ProjDomain -->|Execute Transactions| Repo
    Worker -->|Process Background Queues| InvDomain
    Repo -->|Persist Invariants| Drizzle
    Drizzle -->|SQL Queries| DB
```

### Monorepo Package Dependencies

```mermaid
graph BT
    shared["@ananya/shared"]
    core["@ananya/core"]
    db["@ananya/database"]

    inv["@ananya/inventory"]
    proc["@ananya/procurement"]
    mfg["@ananya/manufacturing"]
    wh["@ananya/warehouse"]
    proj["@ananya/projects"]
    sales["@ananya/sales"]
    fin["@ananya/finance"]
    crm["@ananya/crm"]
    service["@ananya/service"]
    mrp["@ananya/mrp"]

    api["apps/api"]
    web["apps/web"]

    core --> shared
    db --> core
    inv --> db
    proc --> db
    mfg --> db
    wh --> db
    proj --> db
    sales --> db
    fin --> db
    crm --> db
    service --> db
    mrp --> db

    api --> inv
    api --> proc
    api --> mfg
    api --> wh
    api --> proj
    api --> sales
    api --> fin
    api --> crm
    api --> service
    api --> mrp

    web -->|REST API Contracts| shared
```

---

## 📁 Monorepo Structure

```
ananya/
├── apps/
│   ├── api/                  # NestJS REST API server & background worker runner (src/worker.ts)
│   └── web/                  # Next.js 15 App Router web application UI
├── packages/
│   ├── core/                 # Framework-independent domain aggregates & DomainError hierarchy
│   ├── crm/                  # CRM leads, accounts, and opportunities domain package
│   ├── database/             # Drizzle ORM schemas, database migrator, & System Bootstrap
│   ├── eslint-config/        # Shared ESLint configuration presets
│   ├── finance/              # Chart of Accounts, journal entries, and financial ledgers package
│   ├── inventory/            # Component, serial, batch, reservation, and inventory ledgers package
│   ├── manufacturing/        # Work Order, BOM, scrap factor, and output execution package
│   ├── mrp/                  # Material Requirements Planning and capacity engine package
│   ├── procurement/          # Purchase Order, Supplier, Goods Receipt (GRN), and Invoice package
│   ├── projects/             # Project, milestone, time entry, and material allocation package
│   ├── sales/                # Customer, Quotation, Sales Order, and Fulfillment package
│   ├── service/              # Maintenance schedule, Warranty, RMA, and Service Order package
│   ├── shared/               # Shared TypeScript interfaces, contracts, and DTO types
│   ├── typescript-config/    # Shared TypeScript tsconfig.json configurations
│   └── warehouse/            # Warehouse, location, bin, cycle count, and transfer package
├── docker/
│   ├── Dockerfile.api        # Multi-stage NestJS API production Dockerfile
│   ├── Dockerfile.web        # Multi-stage Next.js Standalone web production Dockerfile
│   ├── Dockerfile.worker     # Multi-stage background worker production Dockerfile
│   ├── docker-entrypoint.sh  # Auto-migration entrypoint handler
│   └── README.md             # Docker & Release Engineering operational guide
├── tests/
│   ├── accessibility/        # Playwright axe-core accessibility audit suite
│   ├── e2e/                  # Modular Playwright E2E integration test suites
│   ├── fixtures/             # Test fixtures and POM helpers
│   └── page-objects/         # Page Object Models (LoginPage, DashboardPage, etc.)
├── compose.yaml              # Canonical local development Compose stack (source builds, PostgreSQL, pgAdmin)
├── compose.prod.yaml         # Production GHCR image overlay definition
├── package.json              # Monorepo root configuration & scripts
├── pnpm-workspace.yaml       # pnpm workspace definition
└── turbo.json                # Turborepo build pipeline configuration
```

---

## 🛠 Technology Stack

### Core Platform Technologies

| Layer                  | Technology         | Version | Purpose                                       |
| :--------------------- | :----------------- | :------ | :-------------------------------------------- |
| **Frontend Framework** | Next.js App Router | `15.x`  | React 19 Server & Client Component rendering  |
| **Backend Framework**  | NestJS             | `11.x`  | Modular REST API controllers & DTO validation |
| **Language**           | TypeScript         | `5.9`   | Strict typing across monorepo packages        |
| **Database ORM**       | Drizzle ORM        | `0.44`  | Type-safe PostgreSQL queries & migrations     |
| **Database Engine**    | PostgreSQL         | `16.x`  | Relational ACID database store                |
| **Package Manager**    | pnpm               | `9.0`   | Workspace package management & linking        |
| **Build System**       | Turborepo          | `2.10`  | High-speed monorepo build caching             |

### UI & Testing Technologies

| Category            | Library / Tool               | Purpose                                            |
| :------------------ | :--------------------------- | :------------------------------------------------- |
| **UI Components**   | shadcn/ui & Radix Primitives | Accessible UI component foundations                |
| **Styling**         | Vanilla Tailwind CSS         | Utility-first design system styling                |
| **Form Management** | React Hook Form & Zod        | Form state management and schema validation        |
| **Icons & Visuals** | Lucide React                 | Modern vector SVG icons                            |
| **E2E Testing**     | Playwright                   | Multi-browser headless & visual regression testing |
| **Unit Testing**    | Vitest & Jest                | Domain package unit and NestJS service testing     |
| **Accessibility**   | `@axe-core/playwright`       | Automated WCAG accessibility auditing              |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js**: `>=22.14.0` (managed via `.nvmrc`)
- **pnpm**: `9.0.0`
- **Docker & Docker Compose**: (optional for containerized setup)

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/48studios/ananya.git
cd ananya

# Install dependencies using frozen lockfile
pnpm install
```

### 2. Configure Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Start PostgreSQL & pgAdmin, then run system setup:

```bash
# Launch development datastores (or run 'docker compose up --build' to run full stack)
docker compose up -d postgres pgadmin

# Run database setup & system bootstrap
pnpm db:setup
```

### 4. Local Development Options

**Option A: Full Container Stack (Build from local source)**
```bash
docker compose up --build
```
Runs Web (port 3000), API (port 4000), Worker (port 4001), PostgreSQL (port 5432), and pgAdmin (port 5050) built directly from local source files without depending on GHCR.

**Option B: Local Node/pnpm Development**
```bash
# Run NestJS API, Next.js Web, & Worker concurrently
pnpm dev
```

- **Web UI**: `http://localhost:3000`
- **NestJS API**: `http://localhost:4000`

### 5. Execute Quality Gates

```bash
# Execute full quality gate suite
pnpm qa

# Or execute individual tasks
pnpm lint           # Run ESLint across all 17 packages
pnpm check-types    # Run TypeScript type check across all 17 packages
pnpm test           # Run Vitest unit & Jest API test suites
pnpm build          # Run Turborepo production build
pnpm test:e2e       # Run Playwright E2E integration tests
```

---

## 🐳 Docker Containerization

Ananya ERP is containerized using multi-stage Dockerfiles that leverage Turborepo dependency pruning (`turbo prune`) for ultra-minimal production image footprints.

- **Non-Root Isolation**: All containers run under standard unprivileged user `ananya` (`UID/GID 10001`).
- **Next.js Standalone**: `apps/web` builds using Next.js `output: 'standalone'` mode, copying only bundled server runtime dependencies.
- **Dedicated Background Worker**: `apps/api/src/worker.ts` runs background queue tasks independently with its own health probe on port 4001.

### Build Production Docker Images Locally

```bash
# Build API container image
docker build -f docker/Dockerfile.api -t ghcr.io/48studios/ananya-api:latest .

# Build Web container image
docker build -f docker/Dockerfile.web -t ghcr.io/48studios/ananya-web:latest .

# Build Worker container image
docker build -f docker/Dockerfile.worker -t ghcr.io/48studios/ananya-worker:latest .
```

---

## 🚢 Deployment via GHCR

Production multi-architecture container images (`linux/amd64`, `linux/arm64`) are published automatically to **GitHub Container Registry (GHCR)**.

Production deployments merge the canonical `compose.yaml` base with the `compose.prod.yaml` overlay to pull published multi-architecture images from GHCR:

```bash
# 1. Pull latest production images from GHCR
docker compose -f compose.yaml -f compose.prod.yaml pull

# 2. Start full production stack (Web, API, Worker, PostgreSQL)
docker compose -f compose.yaml -f compose.prod.yaml up -d
```

### Image Tag Reference Matrix

| Tag Type              | Image Tag Pattern           | Trigger Event              | `latest` Tag Behavior                         |
| :-------------------- | :-------------------------- | :------------------------- | :-------------------------------------------- |
| **Edge Build**        | `edge`, `sha-<commit-sha>`  | Push to `main` branch      | ❌ `latest` NOT modified                      |
| **Release Candidate** | `rc1`, `rc2`, ...           | Push to `release/*` branch | ❌ `latest` NOT modified                      |
| **Official Release**  | `vX.Y.Z`, `X.Y.Z`, `latest` | Git release tag `v*.*.*`   | ✅ `latest` updated ONLY on official releases |

### Updating Production Containers

```bash
docker compose -f compose.yaml -f compose.prod.yaml pull
docker compose -f compose.yaml -f compose.prod.yaml up -d --remove-orphans
```

### Rolling Back to a Specific Git Commit SHA

```bash
ANANYA_VERSION=sha-a1b2c3d docker compose -f compose.yaml -f compose.prod.yaml up -d
```

### Docker Resource Naming & Maintenance

Ananya ERP configures explicit Docker resource names to ensure clean, predictable naming without autogenerated project prefixes:

- **Containers**: `ananya-api`, `ananya-web`, `ananya-worker`, `ananya-postgres`, `ananya-pgadmin`
- **Named Volumes**: `ananya_postgres_data`, `ananya_uploads_data`, `ananya_pgadmin_data`
- **Network**: `ananya`

```bash
# Inspect active Docker volumes
docker volume ls

# Inspect active Docker network
docker network ls

# Reset local development environment (stop containers & remove volumes)
docker compose down -v
```

> [!NOTE]
> **Volume Migration Note**: Explicit volume naming eliminates redundant autogenerated prefixes (`ananya_ananya_postgres_data` &rarr; `ananya_postgres_data`). For local development, run `docker compose down -v && docker volume prune` to clean up legacy volumes.

---

## 🔐 Environment Variables

| Variable              | Required | Default                                                            | Description                                                |
| :-------------------- | :------- | :----------------------------------------------------------------- | :--------------------------------------------------------- |
| `DATABASE_URL`        | Yes      | `postgresql://ananya:ananya_secure_password@localhost:5432/ananya` | Primary PostgreSQL database connection string              |
| `POSTGRES_DB`         | Yes      | `ananya`                                                           | Database name for PostgreSQL container                     |
| `POSTGRES_USER`       | Yes      | `ananya`                                                           | Database user for PostgreSQL container                     |
| `POSTGRES_PASSWORD`   | Yes      | `ananya_secure_password`                                           | Database password for PostgreSQL container                 |
| `PORT`                | No       | `4000`                                                             | HTTP port for NestJS API server                            |
| `WORKER_PORT`         | No       | `4001`                                                             | HTTP port for Background Worker health check server        |
| `WEB_PORT`            | No       | `3000`                                                             | HTTP port for Next.js Web application                      |
| `CORS_ORIGIN`         | No       | `http://localhost:3000`                                            | Allowed CORS origin URLs                                   |
| `JWT_SECRET`          | Yes      | `ananya_jwt_production_secret_change_me`                           | Secret key for JWT token signing                           |
| `RUN_MIGRATIONS`      | No       | `true`                                                             | Executes `pnpm db:setup` on API container boot when `true` |
| `NEXT_PUBLIC_API_URL` | Yes      | `http://localhost:4000`                                            | Public API endpoint URL consumed by Next.js web client     |
| `ANANYA_REGISTRY`     | No       | `ghcr.io/48studios`                                                | Container registry namespace                               |
| `ANANYA_VERSION`      | No       | `edge`                                                             | Deployment container version tag                           |

---

## 🔄 Continuous Integration & Delivery (CI/CD)

Ananya ERP utilizes a layered quality strategy designed for fast, deterministic CI execution while maintaining comprehensive local and containerized quality gates:

```
Developer Push / PR (main / release/*)
        │
        ▼
Mandatory CI Quality Gates (ci.yml)
├── ESLint Audit (pnpm lint)
├── TypeScript Type Check (pnpm check-types)
├── Unit & Domain Test Suite (pnpm test)
└── Production Build Validation (pnpm build)

Gated Docker Publishing (docker.yml)
├── 1. Mandatory Quality Gates (needs: none)
├── 2. Container Startup & Health Smoke Test (needs: quality-gates)
│      (Boots Web, API, Worker containers & probes /health endpoints)
└── 3. Multi-Arch GHCR Publication (needs: [quality-gates, smoke-test])

On-Demand Playwright E2E Gate (playwright.yml)
└── Manual Trigger (workflow_dispatch)

Production Release Pipeline (release.yml)
├── 1. Mandatory Quality Gates
├── 2. Container Startup & Health Smoke Test
├── 3. GHCR Multi-Arch Release Tag Publication (vX.Y.Z, latest)
└── 4. GitHub Release Creation with Release Notes
```

### Workflow Specifications

- **[ci.yml](file:///.github/workflows/ci.yml)**: Fast, deterministic CI quality gates running ESLint, TypeScript compilation check, Vitest unit tests, and production build validation on every push and pull request. Node and pnpm versions are read dynamically from repository configuration (`.nvmrc` and `package.json` `packageManager`). Concurrency automatically cancels obsolete builds.
- **[docker.yml](file:///.github/workflows/docker.yml)**: Dependency-gated workflow (`needs: [quality-gates, smoke-test]`). Executes mandatory quality gates, boots local container instances of Web, API, and Worker, probes `/health` & `/api/health` endpoints, and pushes multi-arch images (`linux/amd64`, `linux/arm64`) with expanded OCI metadata to GHCR on `main` and `release/*` pushes.
- **[release.yml](file:///.github/workflows/release.yml)**: Triggered on official Git version tags (`v*.*.*`). Reruns mandatory quality gates, validates container boot smoke tests, pushes release tags (`vX.Y.Z`, `X.Y`, `latest`) to GHCR, and creates a GitHub Release.
- **[playwright.yml](file:///.github/workflows/playwright.yml)**: Dedicated manual workflow (`workflow_dispatch`) for executing Playwright E2E integration tests in GitHub Actions on demand.

### Local Playwright Developer Quality Gate

Playwright E2E tests are intentionally decoupled from automatic CI triggers to keep CI fast and reliable. Developers must run Playwright E2E tests locally prior to merging significant features or creating release candidates:

```bash
# Execute local Playwright E2E integration test suite
pnpm test:e2e

# Execute UI interactive mode
pnpm test:e2e:ui
```

---

## 📐 UI & Design System Standards

Ananya ERP adheres strictly to the [`DESIGN.md`](file:///DESIGN.md) specification:

- **No Generic ERP Cards**: High-density operational density without unnecessary white card borders or oversized typography.
- **Color System**: Curated HSL dark/light modes with slate backgrounds (`bg-background`), muted borders (`border-border/60`), and subtle input highlights (`bg-input/70`).
- **Standard Header Action Primitive**: Reusable `HeaderAction` component (`h-8`, `rounded-lg`, `border-border/60`, `[svg]:size-3.5`) across all top header controls.
- **Searchable Combobox Selector**: Reusable `EntitySelector` component replacing free-text inputs with inline API creation capability.

---

## 🔐 Authentication & RBAC Security

Ananya ERP enforces robust role-based access control (RBAC):

- **Role Matrix**: Granular permissions system mapping users to default system roles (`Admin`, `Manager`, `Member`, `Viewer`).
- **Edge Middleware Isolation**: `apps/web/middleware.ts` enforces edge-level route protection, redirecting unauthenticated requests to `/login`.
- **Session Synchronization**: Synchronized Bearer tokens attached automatically to API requests with cookie session management.
- **Security Audit Log**: Centralized activity center recording immutable authentication events, permission modifications, data pack installations, and organization resets.

---

## ⚙️ Web-First Data Lifecycle Management

In accordance with [`ARCHITECTURE.md`](file:///ARCHITECTURE.md), Ananya ERP completely eliminates CLI seeding and database reset scripts (`db:seed`, `db:clear`).

```
                  ┌────────────────────────────────────────┐
                  │          Database Migration            │
                  │           (pnpm db:migrate)            │
                  └───────────────────┬────────────────────┘
                                      │
                  ┌───────────────────▼────────────────────┐
                  │            System Bootstrap            │
                  │          (runBootstrap script)         │
                  └───────────────────┬────────────────────┘
                                      │
                  ┌───────────────────▼────────────────────┐
                  │     Organization Onboarding Setup      │
                  │             (/setup page)              │
                  └───────────────────┬────────────────────┘
                                      │
                  ┌───────────────────▼────────────────────┐
                  │      Administrator Data Packs          │
                  │         (/settings/data-packs)         │
                  └───────────────────┬────────────────────┘
                                      │
                  ┌───────────────────▼────────────────────┐
                  │       Data Migration Framework         │
                  │          (Import Module UI/API)        │
                  └────────────────────────────────────────┘
```

1. **System Bootstrap (`runBootstrap`)**: Executed during platform setup (`pnpm db:setup`). Initializes **ONLY** system infrastructure (Roles, System Settings, Default Numbering Series, Feature Flags). Zero synthetic business data is created.
2. **Data Packs Studio (`/settings/data-packs`)**: Web interface allowing administrators to install Base Units, Core Logistics, Default Categories, and Demo datasets processing strictly through the production Import Framework (`ImportExportService`).
3. **Organization Reset (`/settings/danger-zone`)**: Web-based destructive purge under Danger Zone. Requires 3-step confirmation (Warning screen, text verification `RESET MY ORGANIZATION`, and administrator password re-authentication), preserving system tenant profiles while recording security audit log `ORGANIZATION_DATA_RESET`.

---

## 🧪 Automated QA & Testing Suite

Ananya ERP maintains a multi-layered testing architecture:

- **Unit & Domain Tests**: Vitest suite verifying aggregate domain invariants in `@ananya/*` packages.
- **API Tests**: Jest suite validating NestJS controllers, services, and DTO contracts.
- **Playwright E2E Tests**: Modular E2E suites (`tests/e2e/`) covering authentication, session security, navigation, master data creation, purchase orders, work orders, projects, notifications, and import/export pipelines.
- **Accessibility Audit**: Automated WCAG compliance testing via `@axe-core/playwright` (`tests/accessibility/`).

---

## 🗺️ Roadmap

- [x] **Release Candidate 1 (RC1) Stabilization Sprint**
- [x] **Production Containerization & Multi-Stage Dockerfiles**
- [x] **9-Stage CI/CD Release Engineering Pipeline (GHCR & Buildx)**
- [x] **Web-First Data Lifecycle & Data Packs Studio**
- [x] **Barcodes & Vector QR Tag Studio**
- [ ] **Release Candidate 2 (RC2) Multi-Tenant Workspace Isolation**
- [ ] **Advanced AI-Powered Demand Forecasting Engine**
- [ ] **Mobile Warehouse Scanner PWA Application**

---

## 🤝 Contributing

We welcome contributions from the community! Please follow these standards:

1. **Repository Rules**: Read [`AGENTS.md`](file:///AGENTS.md) and [`ARCHITECTURE.md`](file:///ARCHITECTURE.md) before making structural or domain edits.
2. **Domain Boundaries**: Keep domain packages (`packages/*`) framework-independent. Place NestJS code in `apps/api` and React code in `apps/web`.
3. **Quality Gates**: Ensure `pnpm qa` passes cleanly before submitting Pull Requests.

---

## 🛡️ Security Policy

### Container & Infrastructure Security

- Containers run as an unprivileged non-root user (`ananya`, `UID/GID 10001`).
- Datastores (PostgreSQL) are isolated on private internal container networks.
- Every release build undergoes automated Trivy vulnerability scanning.

### Reporting Vulnerabilities

If you discover a security vulnerability within Ananya ERP, please disclose it responsibly by emailing `security@48studios.com` instead of opening a public issue.

---

## ⚡ Performance & Optimization

- **Turborepo Remote Caching**: High-speed task pipeline caching across monorepo packages.
- **Next.js Standalone Runtime**: Pruned production web image sizes.
- **Drizzle ORM Efficiency**: Minimal query overhead with explicit PostgreSQL index configurations.
- **React 19 Server Components**: Reduced client-side JavaScript bundle sizes.

---

## 📄 License

Ananya ERP is open-source software licensed under the **[MIT License](file:///LICENSE)**.

---

## 🏢 Credits

Engineered and maintained with ❤️ by **[48 Studios](https://github.com/48studios)**.

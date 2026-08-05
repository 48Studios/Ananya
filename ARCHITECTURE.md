# System Architecture — Ananya ERP

> **Canonical Reference**: This document defines the high-level system architecture and production deployment principles for Ananya ERP.

---

# Core Architectural Principles

Ananya ERP is an enterprise operations platform built as a **Modular Monolith** using Domain-Driven Design (DDD) principles.

## Layered Architecture & Dependency Rule

```
┌─────────────────────────────────────────────────────────┐
│                     UI Layer                            │
│           (Next.js App Router, React 19)                │
└───────────────────────────┬─────────────────────────────┘
                            │ HTTP / REST APIs
┌───────────────────────────▼─────────────────────────────┐
│                    API Layer                            │
│           (NestJS Controllers, DTO Validation)          │
└───────────────────────────┬─────────────────────────────┘
                            │ Domain Interfaces
┌───────────────────────────▼─────────────────────────────┐
│                 Domain Services                         │
│   (@ananya/inventory, @ananya/core, @ananya/shared)     │
└───────────────────────────┬─────────────────────────────┘
                            │ Repositories
┌───────────────────────────▼─────────────────────────────┐
│               Database & Persistence                    │
│      (Drizzle ORM, PostgreSQL, Database Package)        │
└─────────────────────────────────────────────────────────┘
```

1. **Dependency Direction**: Code dependencies ALWAYS point downward: UI &rarr; API &rarr; Domain &rarr; Database.
2. **Framework Independence**: Core domain logic lives in `@ananya/*` packages and remains framework-independent.
3. **Database Boundaries**: All database mutations execute inside transactions. Inventory ledgers are strictly immutable.

---

# Production Data Management Architecture

Ananya ERP enforces a strict web-first administration model. Operational data management happens **INSIDE** the web application interface.

The CLI is strictly limited to:

- **Building** (`pnpm build`)
- **Testing** (`pnpm test`, `pnpm test:e2e`)
- **Running** (`pnpm dev`, `pnpm start`)
- **Database Migrations** (`pnpm db:generate`, `pnpm db:push`, `pnpm db:migrate`, `pnpm db:setup`)

> [!CAUTION]
> **Zero Utility Scripts**: The concept of CLI seed scripts (`db:seed`), clear scripts (`db:clear`), clean scripts, reset scripts, and developer data generators is completely removed from the repository. Production and development data workflows exercise the exact same production application features.

```
                  ┌────────────────────────────────────────┐
                  │          Database Migration            │
                  │           (pnpm db:migrate)            │
                  └───────────────────┬────────────────────┘
                                      │
                  ┌───────────────────▼────────────────────┐
                  │            System Bootstrap            │
                  │           (pnpm db:bootstrap)          │
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

## The Three Production Data Mechanisms

### 1. System Bootstrap (`bootstrap.ts`)

Executed during platform setup (`pnpm db:setup` or `pnpm db:bootstrap`).
Initializes **ONLY** platform infrastructure:

- **System Roles & Permissions Matrix** (`Admin`, `Manager`, `Member`, `Viewer`)
- **System Settings Defaults** (Base Currency: `INR`, Supported: `['INR', 'USD', 'EUR']`, Date Format: `YYYY-MM-DD`, Fiscal Start Month: `4`)
- **Default Numbering Series** (`PO-`, `WO-`, `CMP-`, `PRJ-`, `GRN-`, `TX-`, `SO-`, `QT-`, `AST-`, `EQP-`, `MNT-`, `SRV-`, `WRN-`, `RMA-`)
- **Default Feature Flags** (`MFA_REQUIRED`, `EXPERIMENTAL_AI_FORECAST`, `BARCODE_STUDIO`)

> [!IMPORTANT]
> System Bootstrap **NEVER** creates business data or lookup data (Base Units, Categories, Components, Suppliers, Customers, Projects, BOMs, Purchase Orders, Warehouses, Inventory, Employees, Assets, Sample records).

### 2. Data Packs

Data Packs replace synthetic seeding with administrator-driven, web-based installation packages (`Settings` &rarr; `Data Packs` or `/settings/data-packs`).

- **Base Units Pack**: Standard physical units (`pcs`, `kg`, `g`, `mg`, `m`, `cm`, `mm`, `L`, `mL`, `box`, `roll`, `set`, `hr`)
- **Default Categories Pack**: Electronics, Mechanical, Raw Materials, Assemblies, Consumables
- **Core ERP Pack**: Default Central Warehouse & Bins
- **Demo Data Packs**: Demo Inventory, Demo Manufacturing, Demo Projects

Every Data Pack processes strictly through the production **Import Framework** (`ImportExportService`) with full pre-import validation, column mapping, duplicate detection, background execution, and audit logging (`DATA_PACK_INSTALLED`).

### 3. Organization Reset

Organization Reset replaces "clear database" CLI scripts with a secure administrator feature in the Web Application (`Settings` &rarr; `Danger Zone` or `/settings/danger-zone`).

- **Destructive Purge**: Purges ONLY operational business data (Components, Inventory, Suppliers, Customers, Manufacturing, Projects, BOMs, Purchase Orders, Work Orders, Warehouses, Assets, Equipment, Service Requests, Warranty, RMA).
- **Tenant Preservation**: Preserves Organization Profile, Setup Status, Root Administrator, Users, User Sessions, Roles, Permissions, System Settings, Feature Flags, and Security Audit Logs.
- **Confirmation UX**: Requires 3-step confirmation (Warning screen, text verification `RESET MY ORGANIZATION`, and administrator password re-authentication). Every reset records audit event `ORGANIZATION_DATA_RESET`.

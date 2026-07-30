# PROJECT_STATUS.md

# Ananya ERP — Project Status

> This document is the single source of truth for the current state of the project.
>
> All AI coding agents (GitHub Copilot, ChatGPT, Claude, etc.) should read this document together with `DESIGN.md` before making any code changes.

---

# Current Focus

## Current Milestone

**Core Inventory Management**

## Current Vertical Slice

**Stock Ledger**

## Current Sprint Goal

Implement the core inventory management experience and establish the foundational inventory modules.

## Current Branch

`main`

## Current Status

🟡 In Progress

---

# Overall Progress

## Foundation

- [x] Monorepo
- [x] Next.js Web
- [x] NestJS API
- [x] PostgreSQL
- [x] Drizzle ORM
- [x] Shared TypeScript Configuration
- [x] Core Package
- [x] Shared Package
- [x] UI Foundation
- [x] Application Shell
- [x] Theme Support
- [x] Dashboard Layout

---

## Inventory

- [x] Locations
- [x] Components
- [x] Manufacturers
- [ ] Brands
- [x] Categories
- [x] Suppliers
- [ ] Stock Ledger
- [x] Inventory Transactions
- [x] Purchase Orders
- [x] Goods Receipts

---

## Manufacturing

- [ ] Bill of Materials (BOM)
- [ ] Work Orders
- [ ] Production

---

## Projects

- [ ] Projects
- [ ] Project Inventory
- [ ] Project Costing

---

## Reporting

- [ ] Inventory Reports
- [ ] Purchase Reports
- [ ] Stock Valuation
- [ ] Dashboard Analytics

---

# Current Task

Only the active work should appear here.

## Active

- [ ] Stock Ledger Module

Completed work should immediately move into the **Completed** section.

---

# Next Vertical Slice

After the current slice is complete, implement:

## Stock Ledger Management

Requirements

- List Stock Balances by Location and Component
- View Component Stock History
- Record Manual Stock Adjustments / Stock Takes
- Low Stock & Reorder Level Warnings

Reuse:

- DashboardLayout
- PageHeader
- EntityDataTable
- StatCard
- EmptyState
- LoadingState

Do not redesign the application shell.

---

# Completed

## 2026-07-30

- Complete UI foundation rebuild
- Integrate new v0 application shell
- Establish DashboardLayout
- Implement Sidebar with nested navigation
- Implement shared Header
- Implement shared Footer
- Integrate Light & Dark mode
- Complete Inventory Transactions immutable audit trail module (List /transactions, View /transactions/[id], Component Timeline /components/transactions/component-timeline.tsx, Direction indicators + Inbound / - Outbound, Transaction type badges, Filtering by component, location, transaction type, and reference search, API Integration GET /inventory-transactions, Drizzle ORM persistence)
- Complete Goods Receipts (GRN) module (List /goods-receipts, View /goods-receipts/[id], Create Goods Receipt from open Purchase Order, Receive Partial Deliveries, Receive Complete Deliveries, GoodsReceiptForm with React Hook Form + Zod & PO line prefilling, Destination location selector, Over-receiving validation, Immutable Inventory Ledger transaction creation, Automatic PO status transition PARTIALLY_RECEIVED / FULFILLED, Print-friendly view, API Integration GET/POST /goods-receipts, Drizzle ORM persistence)
- Complete Purchase Orders transactional document module (List /purchase-orders, View /purchase-orders/[id], Create, Edit Draft, Submit PO, Cancel PO, Delete with ConfirmDialog, PurchaseOrderForm with React Hook Form + Zod & dynamic line items editor, real-time totals calculation, Status Timeline progress bar, Print-friendly view, API Integration GET/POST/PUT/DELETE /purchase-orders, Domain aggregate updateHeader() & clearLines(), line item invariants, Drizzle ORM line item synchronization persistence)
- Complete Suppliers Management module (List /suppliers, View /suppliers/[id], Create, Edit, Delete with ConfirmDialog, SupplierForm with React Hook Form + Zod, API Integration GET/POST/PUT/DELETE /suppliers, Domain aggregate update(), purchase order dependency protection, Drizzle ORM persistence)
- Complete Categories Management module (List /categories, View /categories/[id], Create, Edit, Delete with ConfirmDialog, CategoryForm with React Hook Form + Zod, parent category selector, hierarchical tree, API Integration GET/POST/PUT/DELETE /categories, Domain aggregate update(), self-parenting invariant, child category & component reference protections, Drizzle ORM persistence)
- Complete Manufacturers Management module (List /manufacturers, View /manufacturers/[id], Create, Edit, Delete with ConfirmDialog, ManufacturerForm with React Hook Form + Zod, API Integration GET/POST/PUT/DELETE /manufacturers, Domain aggregate update(), component reference protection, Drizzle ORM persistence)
- Complete Components Management module (List /components, View /components/[id], Create, Edit, Delete with ConfirmDialog, ComponentForm with React Hook Form + Zod, API Integration GET/POST/PUT/DELETE /components, Domain aggregate update(), Drizzle ORM persistence)
- Complete Location Management reference CRUD module (List /locations, View /locations/[id], Create, Edit, Delete, ConfirmDialog, PageHeader, StatCard, EmptyState, LoadingState, ErrorState, EntityDataTable)
- React Hook Form integration
- Zod validation
- API integration (GET, POST, PUT, DELETE /locations)
- Domain implementation (Location aggregate update(), UpdateLocation, DeleteLocation, child protection invariants)
- Database implementation (Drizzle ORM update, delete, findByParentId)

## 2026-07-15

- Shared TypeScript configuration completed
- Workspace package architecture finalized
- Locations module completed
- Error handling standardized

---

# Architecture Decisions

This is a summary of important engineering decisions.

It is **not** a replacement for ADRs.

- Modular Monolith architecture
- Domain-Driven Design (DDD)
- Repository pattern for persistence
- Shared TypeScript configurations
- NestJS only in the API layer
- Drizzle ORM for persistence
- PostgreSQL as the system database
- Domain packages remain framework independent
- Shared contracts in `@ananya/shared`
- Shared engineering concepts in `@ananya/core`
- UI built with Next.js App Router
- UI built on shadcn/ui
- Single shared DashboardLayout across the application

---

# UI Standards

The UI foundation is considered stable.

Future work must reuse the existing design system.

Always:

- Use DashboardLayout
- Use shared Sidebar
- Use shared Header
- Use shared Footer
- Use shadcn/ui
- Use EntityDataTable
- Use shared PageHeader
- Follow DESIGN.md

Do not redesign the application shell.

Do not introduce new design languages.

Compose existing shared components.

---

# Development Workflow

Every feature is implemented as a **vertical slice**.

Each slice should include:

- Domain
- Repository
- Database
- API
- UI
- Validation
- Loading State
- Error State
- Empty State
- Tests
- Documentation

Do not partially implement multiple slices.

Finish one slice before beginning another.

---

# Shared Components

## Layout

- DashboardLayout
- Sidebar
- Header
- Footer

## Navigation

- Breadcrumb
- Command Palette
- Search
- Theme Toggle

## Data

- EntityDataTable
- Pagination

## Display

- PageHeader
- StatCard
- EmptyState
- LoadingState
- ErrorState

## Forms

- EntityForm
- ConfirmDialog

All future pages should compose these shared components.

---

# Do Not Modify

Unless explicitly instructed, do not modify:

- DashboardLayout
- Sidebar
- Header
- Footer
- Theme Provider
- Shared UI Components
- DESIGN.md
- Shared TypeScript Configuration
- Repository Architecture
- Domain Architecture

Extend the existing system rather than replacing it.

---

# Technical Debt

Known work intentionally postponed.

- Authentication
- Authorization
- Search Indexing
- Import / Export
- Barcode Scanning
- QR Code Labels
- File Attachments
- Activity Feed
- Audit Dashboard

---

# Backlog

Priority order.

1. Component Details
2. Create Component
3. Edit Component
4. Archive Component
5. Brands
6. Categories
7. Suppliers
8. Stock Ledger
9. Inventory Transactions
10. Purchase Orders
11. Goods Receipts
12. BOM
13. Work Orders
14. Projects
15. Reporting

---

# Definition of Done

A vertical slice is complete only when:

- [ ] Domain implemented
- [ ] Repository implemented
- [ ] Database complete
- [ ] API complete
- [ ] UI complete
- [ ] Validation implemented
- [ ] Loading state implemented
- [ ] Empty state implemented
- [ ] Error state implemented
- [ ] Shared components reused
- [ ] No duplicated code
- [ ] Lint passes
- [ ] Type-check passes
- [ ] Build passes
- [ ] Tests pass
- [ ] Documentation updated

Only then should work begin on the next slice.

---

# AI Notes

## Engineering Standards

- Strong TypeScript typing throughout the codebase
- DomainError hierarchy for consistent error handling
- Repository pattern for all persistence operations
- Explicit dependency direction:
  - Web → API → Domain → Database → PostgreSQL
- Prefer composition over inheritance
- Favor reusable abstractions over duplication

---

## Repository Conventions

- Modular Monolith architecture
- Packages under `packages/`
- Applications under `apps/`
- Shared contracts in `@ananya/shared`
- Core engineering concepts in `@ananya/core`
- UI components should remain reusable and framework-consistent

---

## Architectural Constraints

- Domain packages must remain framework independent.
- Business rules belong in the domain layer.
- API controllers orchestrate requests but do not contain business logic.
- Database code persists state only.
- Repositories abstract persistence concerns.
- All inventory mutations execute inside a database transaction.
- Inventory ledger transactions are immutable and must never be deleted.

---

# Instructions for AI Coding Agents

Before making any changes:

1. Read `PROJECT_STATUS.md`.
2. Read `DESIGN.md`.
3. Understand the current vertical slice.
4. Reuse existing shared components.
5. Follow the established architecture.
6. Do not redesign the application shell.
7. Do not introduce new UI patterns.
8. Complete one vertical slice before starting another.
9. Ensure lint, type-check, and build all pass before considering the task complete.
10. Update this document when milestones, completed work, or project status change.
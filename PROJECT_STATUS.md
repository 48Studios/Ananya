# PROJECT_STATUS.md

# Ananya ERP — Project Status

> This document is the single source of truth for the current state of the project.
>
> All AI coding agents (GitHub Copilot, ChatGPT, Claude, etc.) should read this document together with `DESIGN.md` before making any code changes.

---

# Current Focus

## Current Milestone

**Release Candidate Stabilization**

## Current Vertical Slice

**RC1 Engineering Stabilization & Verification Pass**

## Current Sprint Goal

Perform full repository health audit, end-to-end user journey verification, security hardening, performance profiling, and release candidate preparation.

## Current Branch

`main`

## Current Status

🟢 Dashboard Personalization & Saved Views Complete — Feature Freeze Reached! Moving to Release Candidate Stabilization Sprint.

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
- [x] Authentication & Authorization (RBAC)
- [x] User Management & User Directory
- [x] Role Management & Permission Matrix
- [x] Security Audit Log
- [x] Global Search & Command Center (⌘K / Ctrl+K)
- [x] Activity Center & Audit Explorer
- [x] Import / Export Framework
- [x] Document & Attachment Management
- [x] Notification Center & Workflow Automation
- [x] Organization & System Administration
- [x] Dashboard Personalization & Saved Views

---

## Inventory

- [x] Locations
- [x] Components
- [x] Manufacturers
- [ ] Brands
- [x] Categories
- [x] Suppliers
- [x] Stock Adjustments
- [x] Inventory Transactions
- [x] Warehouse Transfers
- [x] Cycle Counting
- [x] Inventory Reservations & Allocations
- [x] Purchase Orders
- [x] Goods Receipts

---

## Manufacturing

- [x] Bill of Materials (BOM)
- [x] Work Orders
- [x] Production

---

## Projects

- [x] Projects
- [x] Project Inventory (Material Allocation, Issue, Return)
- [ ] Project Costing

---

## Reporting

- [x] Inventory Reports
- [x] Purchase Reports
- [x] Stock Valuation
- [x] Dashboard Analytics

---

# Current Task

Only the active work should appear here.

## Active

- [ ] Release Candidate Stabilization Sprint

Completed work should immediately move into the **Completed** section.

---

# Completed

## 2026-08-01

- Complete Dashboard Personalization & Saved Views platform capability (Database schema userDashboardLayouts, userSavedViews, userFavorites, and userWorkspacePreferences tables in packages/database/src/schema/preferences.ts, NestJS PreferencesModule, PreferencesController, and PreferencesService in apps/api/src/preferences, preferencesApi client, DashboardGrid widget layout renderer, WidgetPicker modal drawer, FavoritesPanel pinned items component, SavedViewDialog filter preset modal, integrated /dashboard page customization mode, NestJS unit tests in preferences.service.spec.ts)
- Complete Organization & System Administration platform capability (Database schema organizationProfile, systemSettings, numberingSeries, and featureFlags tables in packages/database/src/schema/settings.ts, NestJS SettingsModule, SettingsController, and SettingsService in apps/api/src/settings, settingsApi client, NumberingSeriesEditor with live code preview, FeatureFlagTable toggle table, Centralized Administration Hub /settings wrapped in PermissionGuard, NestJS unit tests in settings.service.spec.ts)
- Complete Notification Center & Workflow Automation platform capability (Database schema notifications, notificationPreferences, workflows, and workflowExecutions tables in packages/database/src/schema/notifications.ts, NestJS NotificationsModule, NotificationsController, NotificationsService, and WorkflowEngineService in apps/api/src/notifications, notificationsApi client, TopHeader NotificationBell popover, NotificationCard component, Global Notification Center page /notifications, Workflow Automation Rule Builder modal WorkflowBuilder, Enterprise Workflow Management page /workflows, navigation context integration, NestJS unit tests in notifications.service.spec.ts)
- Complete Document & Attachment Management platform capability (Database schema documents and documentVersions tables in packages/database/src/schema/documents.ts, NestJS DocumentsModule, DocumentsController, DocumentsService, and StorageService in apps/api/src/documents, documentsApi client, reusable FileUploader with drag & drop and clipboard image paste, DocumentViewer inline previewer supporting PDF, images, text, and CAD file metadata, VersionHistoryDialog versioning modal, AttachmentPanel embedded component, NestJS unit tests in documents.service.spec.ts)
- Complete Import / Export Framework platform capability (Database schema importExportJobs table in packages/database/src/schema/import-export.ts, NestJS ImportExportModule, ImportExportController, and ImportExportService in apps/api/src/import-export, importExportApi client, reusable ExportDialog supporting CSV, Excel, and JSON, reusable 7-step ImportWizard modal with pre-import validation engine and column mapping, floating BulkActionToolbar for batch operations in EntityDataTable, template download generators, NestJS unit tests in import-export.service.spec.ts)
- Complete Activity Center & Audit Explorer platform capability (Database schema activityEvents table in packages/database/src/schema/activity.ts, NestJS ActivityModule, ActivityController, and ActivityService in apps/api/src/activity, activityApi client, reusable ActivityTimeline, ActivityCard, ActivityBadge, ActivityIcon, ActivityFilters, and AuditTable UI components in apps/web/components/ui/activity-timeline.tsx, Global Activity Feed page /activity, Enterprise Audit Explorer page /audit, navigation context integration in navigation-config.tsx, NestJS unit tests in activity.service.spec.ts)
- Complete Global Search & Command Center capability (Platform-wide ⌘K / Ctrl+K keyboard shortcut listener, shadcn/ui command primitives in /components/ui/command.tsx, global CommandPalette modal component, NestJS SearchModule, SearchController, and SearchService with modular bounded context search providers InventorySearchProvider, ProcurementSearchProvider, ManufacturingSearchProvider, ProjectsSearchProvider, and AdministrationSearchProvider, searchApi client, quick action command shortcuts, recent searches and recent pages history cached in localStorage, TopHeader search bar trigger integration)
- Production Engineering Verification & Quality Assurance Pass (Repository health assessment, cleaned stray compiled JS artifacts in package src/ causing stale Vitest test execution, fixed Reservation aggregate unit test assertions in @ananya/inventory, refactored Dashboard page to use shared StatCard and PageHeader primitives, verified zero explicit any / @ts-ignore / @ts-expect-error annotations, verified 100% test pass rate across all 25 test tasks, confirmed pnpm lint, pnpm check-types, pnpm test, and pnpm build clean success across all 17 monorepo packages)
- Complete Authentication & Authorization (RBAC) capability (Database schema for users, roles, user_sessions, password_reset_tokens, and security_audit_logs, NestJS AuthModule, UsersModule, RolesModule, PermissionsModule, SecurityAuditModule, Granular permissions matrix & default system roles, AuthContext provider with token handling and PermissionGuard UI component to hide unauthorized actions, Login page /login, Profile & Security page /profile, User Directory page /users & /users/[id], Roles & Permissions page /roles & /roles/[id], Security Audit Log page /settings/security, TopHeader profile menu & logout integration, Navigation config updates)
- Complete Barcode & QR Operations capability (Barcode & QR Operations Studio /barcodes, Vector SVG BarcodeViewer supporting Code 128, Code 39, EAN-13, and UPC-A, Vector SVG QRCodeViewer for versioned payloads ANANYA:V1:TYPE:ID, Printable LabelPreview with Compact, Standard, Detailed, and Shelf Bin Tag templates, Global ScanDialog modal with hardware USB/Bluetooth scanner keypress buffering and camera simulation stream, BatchPrintDialog studio, Centralized NestJS BarcodesModule & BarcodesController & BarcodesService lookup resolving barcodes, QR payloads, SKUs, PO #s, WO #s, Location codes, Project #s, and UUIDs to entity details & target URLs, Type-safe barcodesApi client, Quick Scan header button trigger, Navigation integration)
- Complete Reporting & Analytics capability (Reports Hub /reports, Inventory Reports /reports/inventory, Procurement Reports /reports/procurement, Manufacturing Reports /reports/manufacturing, Project Reports /reports/projects, Transaction Reports /reports/transactions, Reusable chart components ChartCard, AreaChartWidget, BarChartWidget, DonutChartWidget, TrendCard, ReportFilters bar, Read-only NestJS ReportingModule & ReportingController & ReportingService, Type-safe reportingApi client, Navigation module integration, Drill-down entity navigation links)
- Complete Projects & Material Allocation module (List /projects, View /projects/[id], Create & Edit project with ProjectForm, Project lifecycle PLANNING -> ACTIVE -> ON_HOLD -> COMPLETED / ARCHIVED / CANCELLED, Project metadata manager with type/priority/manager/owner/dates, Material Allocation to reserve components for project usage, Material Issue from allocated stock for active projects, Material Return back to warehouse inventory, Milestone management with completion tracking, Activity log with chronological audit trail, Project stat cards for materials/milestones/allocations, Domain aggregate with addMilestone() completeMilestone() allocateMaterial() issueMaterial() returnMaterial() lifecycle methods, ProjectExceptionFilter for domain error handling, API Integration GET/POST/PUT /projects with material & milestone sub-endpoints, Drizzle ORM multi-table persistence for projects/milestones/materials/activities)
- Complete UI foundation rebuild
- Integrate new v0 application shell
- Establish DashboardLayout
- Implement Sidebar with nested navigation
- Implement shared Header
- Implement shared Footer
- Integrate Light & Dark mode
- Complete Inventory Reservations & Allocations module (List /reservations, View /reservations/[id], Create & Edit draft/active reservation with ReservationForm React Hook Form + Zod, Multi-item line reservation manager, Purpose selection WORK_ORDER / PROJECT / PURCHASE_REQUEST / SALES_ORDER, Expiration lock hold date, Live available inventory calculation Available = On Hand - Reserved, Over-reservation prevention guard Reserved <= Available, Manual release workflow restoring Available stock instantly without physical inventory moves, Fulfillment workflow upon material issuance, Lifecycle state machine DRAFT -> ACTIVE -> FULFILLED / RELEASED / EXPIRED / CANCELLED, Print report view, API Integration GET/POST/PUT/DELETE /reservations, Drizzle ORM persistence)
- Complete Cycle Counting physical inventory audit module (List /cycle-counts, View /cycle-counts/[id], Create & Edit draft cycle count with CycleCountForm React Hook Form + Zod, Facility location selection, Assigned counter user assignment, Dynamic component scope manager, Physical count recording modal RecordCountsModal with live variance calculation Match/Shortage/Surplus, Discrepancy summary metrics, Lifecycle state machine DRAFT -> ASSIGNED -> COUNTING -> REVIEW -> APPROVED / CANCELLED, Automated Stock Adjustment generation upon approval posting immutable Inventory Ledger transactions, Print report view, API Integration GET/POST/PUT/DELETE /cycle-counts, Drizzle ORM persistence)
- Complete Warehouse Transfers inter-facility stock movement module (List /warehouse-transfers, View /warehouse-transfers/[id], Create & Edit draft transfer with WarehouseTransferForm React Hook Form + Zod, Source/destination location pickers preventing identical locations, Dynamic component line items manager, Lifecycle state machine DRAFT -> SUBMITTED -> DISPATCHED -> RECEIVED / CANCELLED, Automatic Inventory Ledger posting TransferOut (Issue) on dispatch and TransferIn (Receipt) on receipt, Compensating return transactions on cancellation of dispatched transfers, Linked inventory transactions audit log, Print report view, API Integration GET/POST/PUT/DELETE /warehouse-transfers, Drizzle ORM persistence)
- Complete Production Execution workflow (Work Order Summary dashboard, Material Requirements table with shortage indicators, Yield & completion progress bar, Record partial batch output runs, Proportional raw material issues via InventoryTransaction, Finished goods receipt via InventoryTransaction, Record raw material & product scrap via InventoryTransaction, Pause & Resume production job execution, Chronological production activity timeline, Print report view, API Integration POST /work-orders/:id/record-output, POST /work-orders/:id/record-scrap, POST /work-orders/:id/pause, POST /work-orders/:id/resume, GET /work-orders/:id/timeline, Drizzle ORM persistence)
- Complete Work Orders manufacturing execution module (List /work-orders, View /work-orders/[id], Create & Edit draft Work Order with WorkOrderForm React Hook Form + Zod, BOM selection & auto material requirement calculation, Location assignment, Priority levels URGENT/HIGH/NORMAL/LOW, Lifecycle state machine DRAFT -> RELEASED -> IN_PROGRESS -> COMPLETED / CANCELLED, Automatic Inventory Ledger posting ProductionIssue for raw materials and ProductionOutput for finished goods receipt, Production progress tracking bar, Linked inventory transactions audit trail, Print order report view, API Integration GET/POST/PUT/DELETE /work-orders, Drizzle ORM persistence)
- Complete Bill of Materials (BOM) module (List /boms, View /boms/[id], Create & Edit draft BOM with BomForm React Hook Form + Zod, Dynamic component line items manager, Unit & scrap factor % inputs, Revision management v1.0 -> v1.1, Release/Publish revision guard enforcing single active RELEASED BOM per finished product, Duplication revision workflow copying line items, Invariants against self-reference circular dependencies and duplicate component lines, Print report view, API Integration GET/POST/PUT/DELETE /boms, Drizzle ORM persistence)
- Complete Stock Adjustments reconciliation module (List /stock-adjustments, View /stock-adjustments/[id], Create Adjustment with StockAdjustmentForm React Hook Form + Zod, Automatic difference calculation Counted - Current, Non-negative counted quantity validation, Approval workflow PENDING -> APPROVED, Cancellation for pending adjustments, Single DB transaction posting Adjustment inventory ledger entries, Updating stock projections, Print report view, API Integration GET/POST /stock-adjustments, Drizzle ORM persistence)
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
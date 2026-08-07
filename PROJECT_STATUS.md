# PROJECT_STATUS.md

# Ananya ERP — Project Status

> This document is the single source of truth for the current state of the project.
>
> All AI coding agents (GitHub Copilot, ChatGPT, Claude, etc.) should read this document together with `DESIGN.md` before making any code changes.

---

# Current Focus

## Current Milestone

**Release Candidate 1 (RC1)**

## Current Vertical Slice

**Repository-wide Import Framework Reliability & UX Audit**

## Current Sprint Goal

Establish a single authoritative FileUploader component (`apps/web/components/ui/file-uploader.tsx`) and unified 5-step import pipeline (`apps/web/components/ui/import-wizard.tsx`) across all Ananya ERP modules (Components, Suppliers, Manufacturers, Warehouses, Inventory, Customers, Projects, Data Packs, Attachments). Fix root cause DOM event duplication bug (`<label><button>`), implement quote-aware CSV & JSON parser in NestJS API (`apps/api/src/import-export/import-export.service.ts`), add Playwright E2E test suite (`tests/e2e/import-export/import-export.spec.ts`), and pass all monorepo quality gates.

## Current Branch

`main`

## Current Status

🟢 Repository-wide Import Framework Reliability & UX Audit 100% Complete — Refactored `FileUploader` to serve as the single shared uploader across Ananya ERP with drag & drop, click-to-browse, paste, keyboard navigation, and progress controls. Embedded `FileUploader` into `ImportWizard` across all module tables. Enhanced NestJS `import-export.service.ts` with quote-aware CSV line parsing and JSON row support. Added Playwright E2E tests covering CSV/XLSX imports and error validation. Updated `docs/DATA_LIFECYCLE.md` and `PROJECT_STATUS.md`. Passed all quality gates.

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
- [x] Notification Center & Workflow Automation
- [x] Organization & System Administration
- [x] Dashboard Personalization & Saved Views
- [x] Identity, Authentication & Onboarding Platform
- [x] Automated QA & E2E Testing Platform
- [x] Authentication & Authorization Security Architecture Remediation
- [x] Application Shell Auth Isolation & Hardening
- [x] Database Automated Setup & Migration Script (`pnpm db:setup`)
- [x] UI Data Integrity Audit & Backend API Data Synchronization
- [x] Critical Authentication Session Restoration & Permission-Aware Navigation
- [x] Reporting Service Database Query Fix (`reserved_quantity` column alias)
- [x] Dynamic Navigation Sidebar Quick Stats API Wiring
- [x] Quick Stats & Quick Actions Layout Polish
- [x] Command Palette `cmdk` Store Context Provider Fix
- [x] Top Header UI Consistency Audit & `HeaderAction` Standardization
- [x] Navigation Architecture Audit & IA Assessment (`docs/NAVIGATION_AUDIT.md`)

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

- [x] Release Candidate 1 (RC1) Production Release

Completed work should immediately move into the **Completed** section.

---

# Completed

## 2026-08-06

- Complete Repository-wide Import Framework Reliability & UX Audit (Refactored single shared FileUploader component apps/web/components/ui/file-uploader.tsx resolving DOM event duplication bug. Embedded FileUploader into ImportWizard apps/web/components/ui/import-wizard.tsx for all module tables across Ananya ERP. Implemented quote-aware CSV line parsing and JSON row support in NestJS import-export.service.ts. Created Playwright E2E test suite in tests/e2e/import-export/import-export.spec.ts. Updated docs/DATA_LIFECYCLE.md and PROJECT_STATUS.md)
- Complete Global Creatable Entity Selector Pattern (Implemented unified EntitySelector component apps/web/components/ui/entity-selector.tsx and unitsApi client. Replaced free-text inputs for Units of Measure, Categories, Manufacturers, Suppliers, Warehouses, Locations, Customers, and Projects with a searchable, creatable combobox. Enabled inline API creation with auto-selection and RBAC permission checks across all master entities. Updated DESIGN.md and PROJECT_STATUS.md)
- Complete Production Data Management Architecture Refactor (Completely removed all CLI database seed, clear, clean, and reset scripts. Deleted packages/database/src/dev/. Refactored System Bootstrap to initialize platform infrastructure ONLY. Implemented web-based Data Packs Studio at /settings/data-packs for Base Units, Categories, Core Logistics, and Demo Datasets processing through the production Import Framework. Implemented web-based Organization Reset under Danger Zone at /settings/danger-zone with 3-step confirmation and security audit logging DATA_PACK_INSTALLED and ORGANIZATION_DATA_RESET. Updated ARCHITECTURE.md and docs/DATA_LIFECYCLE.md)

## 2026-08-01

- Complete Navigation Architecture Audit & IA Assessment (Generated docs/NAVIGATION_AUDIT.md cataloging 13 top-level modules, 34 sidebar sections, 78 submenu items, 84 app routes, 22 detail/form pages, operational density classification, cross-module data flow dependencies, RBAC permission boundary mapping, rail overload health assessment, and strategic recommendations for future 5-domain IA consolidation)
- Complete Top Header UI Consistency Audit (Created apps/web/components/ui/header-action.tsx specifying canonical h-8 height, rounded-lg radius, border-border/60 border, bg-input/70 hover:bg-input background, [&_svg]:size-3.5 icon size enforcement, and focus-visible ring; migrated Search trigger, Quick Scan button, Theme Switcher, NotificationBell, User Menu button, and Mobile Drawer trigger in top-header.tsx and notification-bell.tsx)
- Complete Global Command Palette cmdk Context & Runtime Fix (Resolved TypeError: Cannot read properties of undefined (reading 'subscribe') in CommandInput by updating CommandDialog in apps/web/components/ui/command.tsx to wrap dialog contents inside a Command context provider, added backdrop click dismiss listener)
- Complete Quick Stats & Quick Actions Equal Top/Bottom Vertical Spacing Polish (Updated SectionHeader to h-6 in apps/web/lib/navigation/components/sidebar-section-header.tsx, set SidebarQuickStats and SidebarQuickActions grid padding to px-3 py-0, updated SidebarSection container wrappers for quick_stats and quick_actions with symmetrical py-2 border-b border-sidebar-border/50 space-y-1.5, updated context-sidebar.tsx isAfterBorderSection evaluation)
- Complete Dynamic Navigation Sidebar Quick Stats API Wiring & Bottom Separator Polish (Updated SidebarSection in apps/web/lib/navigation/components/sidebar-section.tsx to apply bottom border separator pb-2.5 mb-2.5 border-b border-sidebar-border/50 under quick_stats, updated context-sidebar.tsx firstVisibleIndex evaluation for quick_stats, wired up SidebarQuickStats to reportingApi endpoints)
- Complete RC1 Production Bug Remediation (Removed static quick_stats sections from Inventory, Procurement, and Manufacturing submenus in apps/web/lib/navigation/navigation-config.tsx, removed static fallback numbers 850/45 in Manufacturing Reports graph in apps/web/app/reports/manufacturing/page.tsx using nullish coalescing summary.totalProductionOutput ?? 0, resolved 500 error in ReportingService.getInventorySummary by querying reservedQuantity from inventoryReservationLines joined with inventoryReservations status ACTIVE, added getTransactionSummary method to ReportingService)
- Complete Critical Authentication Session Restoration & Permission-Aware Navigation (Discovered and fixed root cause of browser refresh logouts in apps/web/lib/api-client.ts by automatically attaching stored Authorization: Bearer tokens to all outgoing fetch requests, updated AuthProvider in apps/web/lib/auth/auth-context.tsx with synchronized cookie max-age and session restoration, removed hardcoded user tooltip 'J. Sarath (48 Studios)' in NavigationRail, enforced permission array evaluation in NavigationRail, SidebarItem, and SidebarAccordion, added E2E session refresh test in login.spec.ts)
- Complete UI Data Integrity Audit & Backend API Data Synchronization (Replaced hardcoded dashboard stat cards, categories list, and PO activity status in apps/web/app/dashboard/page.tsx with live API calls to componentsApi, purchaseOrdersApi, notificationsApi, workOrdersApi, categoriesApi, and activityApi, refactored barcodes/page.tsx sample label generator to derive title, SKU, and locations dynamically from backend API data, updated reports/page.tsx trend velocity to derive dynamically from transaction metrics, removed hardcoded fallback user name/email strings in top-header.tsx, removed hardcoded quickStats in navigation-config.tsx)
- Complete Database Automated Setup & Migration Script (Implemented packages/database/src/setup/setup.ts leveraging drizzle-orm/node-postgres/migrator to apply SQL schema migrations automatically and run initial database seeding, added pnpm db:setup and pnpm db:push scripts to package.json)
- Complete Application Shell Auth Isolation & Hardening (Refactored DashboardLayout in apps/web/components/dashboard-layout.tsx to isolate public auth routes /login, /forgot-password, /reset-password, /onboarding, /setup, /maintenance and unauthenticated loading states from ERP chrome NavigationRail, ContextSidebar, TopHeader, AppFooter, CommandPalette, updated login.spec.ts to verify 0 layout chrome leakage)
- Complete Authentication & Authorization Security Architecture Remediation (Implemented apps/web/middleware.ts enforcing global edge-level route protection for all protected ERP pages, updated auth-context.tsx with SameSite=Lax cookie synchronization, added automated Playwright security redirect tests in tests/e2e/authentication/login.spec.ts, verified unauthenticated navigation redirects to /login)
- Complete Automated QA & E2E Testing Platform (Configured playwright.config.ts for multi-browser Chromium, Firefox, WebKit, Mobile Chrome, and Mobile Safari, built Page Object Models LoginPage, DashboardPage, ComponentsPage, SettingsPage, implemented custom fixtures with automatic console/runtime exception listeners, created modular E2E test suites in tests/e2e/, integrated axe-core accessibility auditing in tests/accessibility/accessibility.spec.ts, created visual regression test suite tests/e2e/visual-regression.spec.ts, added pnpm test:e2e, pnpm test:accessibility, pnpm test:visual, and consolidated pnpm qa script in package.json, documented architecture in docs/testing.md)
- Complete Release Candidate 1 (RC1) Stabilization Sprint (Passed comprehensive 15-phase audit across 17 monorepo packages, verified 0 lint errors/warnings, verified clean tsc --noEmit, verified 100% Vitest pass rate, verified 14/14 Next.js/Turborepo production builds, audited security, performance, accessibility, DDD boundaries, and user workspace isolation)
- Complete Identity, Authentication & Onboarding platform capability (Database schema userSessions, userInvitations, and organizationSetupStatus tables in packages/database/src/schema/auth.ts, NestJS AuthModule, AuthController, AuthService, InvitationsService, and OnboardingService in apps/api/src/auth, authApi client, AuthProvider state context, modern split-layout login page /login, account recovery pages /forgot-password & /reset-password, invited user onboarding wizard /onboarding, first-launch Organization Setup Wizard /setup, NestJS unit tests in auth.service.spec.ts)
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

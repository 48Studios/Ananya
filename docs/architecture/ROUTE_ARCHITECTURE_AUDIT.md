# Ananya ERP — Route & Navigation Architecture Audit

**Status:** Implemented (2026-10-03) — see §13 for the post-implementation record. The Phase 1 proposal and its evidence are retained below for the audit trail; where a proposal was deliberately deviated from, §13 says so.  
**Date:** 2026-10-03  
**Scope:** `apps/web` routing, navigation shell, and every consumer of route paths (`apps/api` search, tests, docs, scripts)  
**Method:** Read-only repository inspection. Four navigation-related Vitest specs were executed as a baseline; no application code, routes, files, or data were modified.

> This document is Phase 1 of a planned navigational refactor: audit + target architecture + migration plan. **Nothing in it has been implemented.**

---

## 1. Executive Summary

Ananya's web application is a **Next.js 16 App Router** app with **128 page routes**, **2 route handlers**, and exactly **one layout** (`app/layout.tsx`). There are **no route groups**, no nested layouts, no `loading.tsx`/`error.tsx`/`not-found.tsx` boundaries, and no parallel/intercepting routes. Every authenticated page is wrapped by the same client-side shell (`components/dashboard-layout.tsx`), which decides between the ERP chrome (rail + contextual sidebar + header) and a bare surface for public and standalone routes.

**84 of 128 pages (66%) are mounted directly at the root**, one path segment deep. The existing 7-module rail (Dashboard, Inventory, Procurement, Manufacturing, Projects & Services, Analytics, Administration) already groups navigation conceptually, but **URLs do not follow that grouping**: `/components`, `/purchase-orders`, `/work-orders`, `/tasks`, `/users` and ~70 others sit at the root beside `/dashboard` and `/login`. Two further domains that exist as code — **Sales & CRM** (`/sales`, `/crm`, `/customers`, `/leads`, `/opportunities`, `/quotations`, `/sales-orders`, `/fulfillment`, `/customer-returns`, `/activities`) and **Finance/Accounting** (`/finance`, `/accounts`, `/chart-of-accounts`, `/journal-entries`, `/accounts-payable`, `/accounts-receivable`, `/payments`, `/bank-accounts`, `/bank-reconciliation`) — have no namespace in the rail or the URL at all, while **Service/Maintenance** (`/service`, `/warranty`, `/rma` under Projects; `/maintenance`, `/equipment` under Manufacturing) is split across two modules. Sales/CRM and the finance ledger pages are fixture-backed (documented in [README.md](../../README.md) and [PROJECT_STATUS.md](../../PROJECT_STATUS.md)) and are absent from the rail.

### Highest-impact confirmed findings

1. **Every "create" entry point in the navigation and command palette is broken.** Navigation config, the command palette, the dashboard operations pipeline, and the barcode scanner link to `/components/new`, `/purchase-orders/new`, `/goods-receipts/new`, `/work-orders/new`, `/transactions/new`, `/boms/new`, `/warehouse-transfers/new`, and `/components/new?sku=…`. **None of these pages exists.** Each URL falls through to the sibling `[id]` dynamic route with `id === "new"`, and no `[id]` page contains `new`-mode handling (verified by exhaustive search), so users land on a "Not Found" state. Creation actually happens in dialogs on the list pages.
2. **Rail visibility is broken for three modules.** `navigation-config.tsx` gates Procurement with `Procurement.Read`, Manufacturing with `Manufacturing.Read`, and Analytics with `Reporting.Read` — **none of these permission codes exist** in the API catalog ([permissions.service.ts](../../apps/api/src/permissions/permissions.service.ts)). Non-administrator roles (e.g. Purchasing Agent) therefore never see those rail modules.
3. **Server-generated URLs hardcode frontend routes.** All five search providers in `apps/api/src/search/providers/` return `href` values such as `/components/${id}`, `/purchase-orders/${id}`, `/settings/security`, `/reports/*`. Any route rename must change the API in the same release.
4. **Duplicate routes and pages**: `/chart-of-accounts` re-exports `/accounts`; `/import-history` re-exports `/data-operations`; `/warehouse`, `/warehouses`, and `/warehouse-bins` all redirect to `/locations`; `/settings/security` redirects to `/audit`; `/equipment` redirects to `/maintenance`. `/activity` (API-backed) and `/activities` (fixture data) describe nearly the same concept.
5. **Duplicate navigation ownership**: `/activity`, `/audit`, and `/barcodes` appear in two modules each. `getModuleForPath()` skips the Dashboard module when matching, so visiting `/activity` or `/audit` highlights **Administration** in the rail and breadcrumbs read "Administration › Activity Center" / "Administration › Audit Explorer", even though both pages are also listed under Dashboard. `/barcodes` resolves to Inventory by the same ordering.
6. **A breadcrumb ordering bug**: under "Warehouses & Storage", the child `/spatial` is tested before `/spatial/builder`, so `/spatial/builder` breadcrumbs read "Inventory → Warehouses & Storage → Spatial Inventory" instead of "… → Inventory Builder" ([top-header.tsx](../../apps/web/lib/navigation/components/top-header.tsx)).
7. **`/reset-password` is declared public in middleware, the layout, and the security docs, but no page exists**; `/forgot-password` is a static form that calls no API.
8. **Fixture-backed screens are a documented known limit**; 12 routes render in-code sample records ([README.md](../../README.md#L88), [PROJECT_STATUS.md](../../PROJECT_STATUS.md)).

### Proposed direction (detail in §5–§8)

Keep the seven rail modules and the single shell. Introduce **domain-prefixed namespaces that match the existing module IDs and default routes** — `/inventory/*`, `/procurement/*`, `/manufacturing/*`, `/projects/*`, `/settings/*` — add `/sales/*` and `/finance/*` for the un-homed domains, keep `/dashboard`, `/reports/*`, `/notifications`, `/profile`, the auth routes, and `/scan` where they are, and add the missing `/new` create routes. Every legacy path receives a permanent redirect. The change is staged domain-by-domain using thin re-export shims so the app is never half-migrated.

---

## 2. Verified Routing Architecture and Conventions

All statements below are **VERIFIED** from repository files unless marked otherwise.

### 2.1 Framework and route mechanism

| Concern            | Verified finding                                                     | Evidence                                                                          |
| ------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Framework          | Next.js `16.3.3`, React `19.2.0`, App Router                         | [apps/web/package.json](../../apps/web/package.json)                              |
| Route mechanism    | File-based: `app/**/page.tsx`; route handlers via `route.ts`         | 128 `page.tsx`, 2 `route.ts`                                                      |
| Route groups       | **None** (no `(group)` directories)                                  | exhaustive directory scan                                                         |
| Layouts            | **One**: `app/layout.tsx` (server)                                   | [app/layout.tsx](../../apps/web/app/layout.tsx)                                   |
| Shell              | `DashboardLayout` client component decides chrome vs bare surface    | [components/dashboard-layout.tsx](../../apps/web/components/dashboard-layout.tsx) |
| Dynamic segments   | `[id]` only; **29 routes**; no catch-all or optional catch-all       | exhaustive scan                                                                   |
| Loading/error/404  | **None** (`0` loading/error/not-found/global-error/template files)   | exhaustive scan                                                                   |
| Static assets      | `app/manifest.ts`, `public/sw.js`, `public/site.webmanifest`         | file scan                                                                         |
| Redirect mechanism | Page-level `redirect()` in 6 pages + middleware redirect to `/login` | [middleware.ts](../../apps/web/middleware.ts)                                     |

### 2.2 Application shell

`RootLayout` wraps everything in `ThemeProvider → AuthProvider → DashboardLayout`, with `PwaRegister`. `DashboardLayout` returns bare `<main>{children}</main>` for:

- public routes: `/login`, `/forgot-password`, `/reset-password`, `/onboarding`, `/welcome`, `/setup`;
- standalone routes: `/scan`;
- unauthenticated or still-loading sessions.

Everything else gets `NavigationProvider → AuthenticatedShell`, containing the fixed 60px **NavigationRail**, the 280/72px **ContextSidebar**, the **TopHeader** (breadcrumbs, search trigger, scan, notifications, theme, profile), the **MobileDrawer**, the **CommandPalette**, and the `AppFooter`. The shell publishes `--content-area-left` from `NAV_WIDTHS_PX` for fixed overlays. `navigation-metrics.spec.ts` pins these tokens.

### 2.3 Navigation sources

| Source                | File                                                                                                                                        | Behaviour                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Module rail           | [navigation-rail.tsx](../../apps/web/lib/navigation/components/navigation-rail.tsx)                                                         | 7 modules; filters by `module.permissions` via `hasPermission`                              |
| Contextual sidebar    | [context-sidebar.tsx](../../apps/web/lib/navigation/components/context-sidebar.tsx)                                                         | Sections: favorites/recent, quick stats, quick actions, nav accordions                      |
| Nav configuration     | [navigation-config.tsx](../../apps/web/lib/navigation/navigation-config.tsx)                                                                | 7 `NavigationModule`s, 59 valid `href`s + 6 **dead `/new` hrefs**                           |
| Module resolution     | `getModuleForPath()` (same file)                                                                                                            | Prefix match over default routes and item/child `href`s; **skips the dashboard module**     |
| Active state          | [sidebar-item.tsx](../../apps/web/lib/navigation/components/sidebar-item.tsx)                                                               | `===` or `startsWith(href + "/")`; hardcodes `exact` for `/reports` and `/`                 |
| Accordion auto-expand | [navigation-context.tsx](../../apps/web/lib/navigation/navigation-context.tsx)                                                              | Path prefix match; persists to `localStorage`                                               |
| Breadcrumbs           | [top-header.tsx](../../apps/web/lib/navigation/components/top-header.tsx)                                                                   | Semantic: module → item → child → URL-segment fallback                                      |
| Command palette       | [components/command-palette.tsx](../../apps/web/components/command-palette.tsx)                                                             | 11 hardcoded quick actions + API search results; permission-filtered; `router.push(href)`   |
| Favorites/recent      | [sidebar-favorites-recent.tsx](../../apps/web/lib/navigation/components/sidebar-favorites-recent.tsx)                                       | Raw path strings persisted in `localStorage` (`ananya_pinned_items`, `ananya_recent_items`) |
| Scanner surface       | [scanner-app.tsx](../../apps/web/components/scanner/scanner-app.tsx), [scan-dialog.tsx](../../apps/web/components/barcodes/scan-dialog.tsx) | `/scan` standalone; scan dialog links to `/components/new?sku=…`                            |
| Global header links   | `top-header.tsx`, `notification-bell.tsx`                                                                                                   | `/profile`, `/notifications`, `/audit`, `/dashboard`                                        |

### 2.4 Authorization and gating

- **Edge middleware** ([middleware.ts](../../apps/web/middleware.ts)): cookie/token presence check. Public allow-list: `/login`, `/forgot-password`, `/reset-password`, `/onboarding`, `/welcome`, `/setup`, `/api/health`. Unauthenticated users are redirected to `/login?from=<path>`; authenticated users hitting `/login` or `/forgot-password` are sent to `/dashboard`.
- **API-level RBAC** is authoritative. `ALL_PERMISSIONS` defines 36 codes in 9 categories: Inventory, Procurement, Manufacturing, Projects, Reporting, Administration, Sales, Accounting, Maintenance ([permissions.service.ts](../../apps/api/src/permissions/permissions.service.ts)). Ten seeded roles exist.
- **Client-side guards are sparse.** Only these pages contain permission checks: `/audit`, `/settings`, `/workflows` (whole-page `Administration.Security`/`Administration.Settings`), `/intelligence` (whole-page `Administration.Roles`), `/roles` + `/users` (action-level), `/components/[id]` (action-level `Inventory.Update`/`Inventory.Read`). Every other page relies on API 401/403 handling and nav filtering. `PermissionGuard` without a fallback renders nothing — an unauthorized deep link to a guarded page is blank, not a 403 page.
- **Three nav permission codes are invalid** (`Procurement.Read`, `Manufacturing.Read`, `Reporting.Read`) — see Finding F3.

### 2.5 Query-driven state and parameters

Only nine query parameters are read anywhere in `app/**` (verified by exhaustive scan):

| Route                          | Parameters                                | Purpose                                       |
| ------------------------------ | ----------------------------------------- | --------------------------------------------- |
| `/login`                       | `from`, `expired`                         | Post-login destination; session-expiry banner |
| `/onboarding/join`             | `token`                                   | Invitation token                              |
| `/spatial`, `/spatial/builder` | `location`, `mode`                        | Focused location; builder mode                |
| `/locations/[id]`              | `view`, `focusLocation`, `focusComponent` | Detail view state and focus                   |
| `/scan`                        | _(PWA launch)_                            | Scanner surface                               |

No route syncs filters, pagination, or tabs to the URL; those are component state (a `data-table-pagination.ts` helper exists in `lib/`).

### 2.6 Cross-boundary URL generation (critical)

`apps/api/src/search/providers/*` return frontend `href`s that are the only server-side URL generation found:

| Provider       | Generated paths                                                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| inventory      | `/components/:id`, `/locations/:id`, `/manufacturers/:id`, `/categories/:id`, `/stock-adjustments/:id`, `/reservations/:id`, `/warehouse-transfers/:id`    |
| procurement    | `/suppliers/:id`, `/purchase-orders/:id`, `/goods-receipts/:id`, `/supplier-returns/:id`                                                                   |
| manufacturing  | `/boms/:id`, `/work-orders/:id`                                                                                                                            |
| projects       | `/projects/:id`                                                                                                                                            |
| administration | `/users/:id`, `/roles/:id`, `/settings/security`, `/profile`, `/reports`, `/reports/inventory`, `/reports/procurement`, plus static platform-route matches |

Search results are consumed by the command palette (`item.href` → `router.push`). No email templates, notification payloads, or integration callbacks storing frontend URLs were found in `apps/api` (searched `href`, `link`, `url`, `actionUrl`, `redirectUrl` in notifications/auth/settings/users).

---

## 3. Complete Route Inventory

**Legend**

- **Type:** `L` landing/hub · `List` · `Det` detail `[id]` · `WF` workflow · `Util` utility · `Auth` · `Redir` redirect stub
- **Layout:** `Shell` = global ERP chrome via `DashboardLayout`; `Bare` = public/standalone bare `<main>`; `n/a` = route handler
- **Nav:** sidebar/menu entry (module › group › item); `—` = reachable but not in navigation
- **Access:** `Auth` = session required by middleware; a permission code means a client guard exists; `Public` = middleware allow-list
- **Risk:** migration risk of the _proposed_ move — L/M/H + reason; `—` = unchanged

The inventory is split into two tables (identity/purpose and navigation/risk) so each stays reviewable. Route sources are relative to `apps/web/`.

### 3.1 Identity and purpose

| Current path                 | Route source                             | Page purpose                                                   | Domain         | Type     |
| ---------------------------- | ---------------------------------------- | -------------------------------------------------------------- | -------------- | -------- |
| `/accounts-payable`          | `app/accounts-payable/page.tsx`          | Accounts payable view                                          | Finance        | List     |
| `/accounts-receivable`       | `app/accounts-receivable/page.tsx`       | Accounts receivable view                                       | Finance        | List     |
| `/accounts/[id]`             | `app/accounts/[id]/page.tsx`             | Ledger account detail                                          | Finance        | Det      |
| `/accounts`                  | `app/accounts/page.tsx`                  | Ledger / chart-of-accounts view                                | Finance        | List     |
| `/activities`                | `app/activities/page.tsx`                | System activity log with fixture records                       | Sales          | List     |
| `/activity`                  | `app/activity/page.tsx`                  | Global API-backed activity/audit feed with filters             | Dashboard      | List     |
| `/attributes`                | `app/attributes/page.tsx`                | Attribute library and review queue                             | Inventory      | List     |
| `/audit`                     | `app/audit/page.tsx`                     | Security audit log explorer                                    | Administration | List     |
| `/bank-accounts`             | `app/bank-accounts/page.tsx`             | Bank accounts                                                  | Finance        | List     |
| `/bank-reconciliation`       | `app/bank-reconciliation/page.tsx`       | Bank reconciliation workflow                                   | Finance        | WF       |
| `/barcodes`                  | `app/barcodes/page.tsx`                  | Barcode/QR studio: label design, scan, print                   | Inventory      | Util     |
| `/batches`                   | `app/batches/page.tsx`                   | Batches and lots (traceability)                                | Inventory      | List     |
| `/boms/[id]`                 | `app/boms/[id]/page.tsx`                 | BOM detail and revision management                             | Manufacturing  | Det      |
| `/boms`                      | `app/boms/page.tsx`                      | Bill of materials list                                         | Manufacturing  | List     |
| `/categories/[id]`           | `app/categories/[id]/page.tsx`           | Category detail with attribute bindings                        | Inventory      | Det      |
| `/categories`                | `app/categories/page.tsx`                | Category master list                                           | Inventory      | List     |
| `/chart-of-accounts`         | `app/chart-of-accounts/page.tsx`         | Re-export of /accounts                                         | Finance        | List     |
| `/components/[id]`           | `app/components/[id]/page.tsx`           | Component detail: attributes, documents, usage, locations      | Inventory      | Det      |
| `/components`                | `app/components/page.tsx`                | Component catalog list with create/edit/delete dialogs         | Inventory      | List     |
| `/crm`                       | `app/crm/page.tsx`                       | CRM and sales pipeline hub (fixture data)                      | Sales          | L        |
| `/customer-returns/[id]`     | `app/customer-returns/[id]/page.tsx`     | Return detail (hardcoded sample entity)                        | Sales          | Det      |
| `/customer-returns`          | `app/customer-returns/page.tsx`          | Customer return list (fixture data)                            | Sales          | List     |
| `/customers/[id]`            | `app/customers/[id]/page.tsx`            | Customer detail (hardcoded sample entity)                      | Sales          | Det      |
| `/customers`                 | `app/customers/page.tsx`                 | Customer account list (fixture data)                           | Sales          | List     |
| `/cycle-counts/[id]`         | `app/cycle-counts/[id]/page.tsx`         | Cycle count worksheet and review                               | Inventory      | WF       |
| `/cycle-counts`              | `app/cycle-counts/page.tsx`              | ABC cycle count list                                           | Inventory      | List     |
| `/dashboard`                 | `app/dashboard/page.tsx`                 | Operations dashboard: KPIs, pipeline, quick actions            | Dashboard      | L        |
| `/data-operations`           | `app/data-operations/page.tsx`           | Import/export operations and job history                       | Administration | Util     |
| `/data-packs`                | `app/data-packs/page.tsx`                | Data packs and extensions                                      | Administration | Util     |
| `/equipment`                 | `app/equipment/page.tsx`                 | Legacy redirect to /maintenance                                | Manufacturing  | Redir    |
| `/finance`                   | `app/finance/page.tsx`                   | Finance summary (reporting API)                                | Finance        | L        |
| `/finished-goods`            | `app/finished-goods/page.tsx`            | Finished goods inventory                                       | Manufacturing  | List     |
| `/forgot-password`           | `app/forgot-password/page.tsx`           | Static password-recovery form; submit is UI-only               | Platform       | Auth     |
| `/fulfillment`               | `app/fulfillment/page.tsx`               | Order fulfillment and shipments (fixture data)                 | Sales          | List     |
| `/goods-receipts/[id]`       | `app/goods-receipts/[id]/page.tsx`       | Goods receipt detail (links to PO)                             | Procurement    | Det      |
| `/goods-receipts`            | `app/goods-receipts/page.tsx`            | Goods receipt list                                             | Procurement    | List     |
| `/import-history`            | `app/import-history/page.tsx`            | Re-export of /data-operations                                  | Administration | Redir    |
| `/intelligence`              | `app/intelligence/page.tsx`              | ML & intelligence control plane                                | Administration | Settings |
| `/inventory`                 | `app/inventory/page.tsx`                 | Inventory overview landing                                     | Inventory      | L        |
| `/journal-entries`           | `app/journal-entries/page.tsx`           | General journal entries (fixture data)                         | Finance        | List     |
| `/leads/[id]`                | `app/leads/[id]/page.tsx`                | Lead detail (hardcoded sample entity)                          | Sales          | Det      |
| `/leads`                     | `app/leads/page.tsx`                     | Lead list (fixture data)                                       | Sales          | List     |
| `/locations/[id]`            | `app/locations/[id]/page.tsx`            | Location detail with ?view / focusLocation / focusComponent    | Inventory      | Det      |
| `/locations`                 | `app/locations/page.tsx`                 | Storage locations and bins list, labels, spatial links         | Inventory      | List     |
| `/login`                     | `app/login/page.tsx`                     | Email/password sign-in; handles ?from= and ?expired=true       | Platform       | Auth     |
| `/maintenance`               | `app/maintenance/page.tsx`               | Equipment maintenance schedules and visits                     | Manufacturing  | List     |
| `/manufacturers/[id]`        | `app/manufacturers/[id]/page.tsx`        | Manufacturer detail                                            | Inventory      | Det      |
| `/manufacturers`             | `app/manufacturers/page.tsx`             | Manufacturer master list                                       | Inventory      | List     |
| `/manufacturing`             | `app/manufacturing/page.tsx`             | Manufacturing and shop-floor overview                          | Manufacturing  | L        |
| `/material-consumption`      | `app/material-consumption/page.tsx`      | Material consumption and issue log                             | Manufacturing  | List     |
| `/mrp/capacity`              | `app/mrp/capacity/page.tsx`              | Capacity planning                                              | Manufacturing  | List     |
| `/mrp/materials`             | `app/mrp/materials/page.tsx`             | Material shortage matrix                                       | Manufacturing  | List     |
| `/mrp`                       | `app/mrp/page.tsx`                       | Material requirements planning hub                             | Manufacturing  | L        |
| `/mrp/production`            | `app/mrp/production/page.tsx`            | Production recommendations                                     | Manufacturing  | List     |
| `/mrp/purchases`             | `app/mrp/purchases/page.tsx`             | Purchase recommendations                                       | Manufacturing  | List     |
| `/mrp/runs/[id]`             | `app/mrp/runs/[id]/page.tsx`             | Planning run detail and messages                               | Manufacturing  | Det      |
| `/mrp/runs`                  | `app/mrp/runs/page.tsx`                  | Planning run list                                              | Manufacturing  | List     |
| `/notifications`             | `app/notifications/page.tsx`             | Notification center list                                       | Notifications  | List     |
| `/onboarding/create`         | `app/onboarding/create/page.tsx`         | Organization creation form                                     | Platform       | Auth     |
| `/onboarding/join`           | `app/onboarding/join/page.tsx`           | Invite acceptance form reading ?token=                         | Platform       | Auth     |
| `/onboarding`                | `app/onboarding/page.tsx`                | Choice between creating an organization and joining via invite | Platform       | Auth     |
| `/opportunities/[id]`        | `app/opportunities/[id]/page.tsx`        | Opportunity detail (hardcoded sample entity)                   | Sales          | Det      |
| `/opportunities`             | `app/opportunities/page.tsx`             | Opportunity list (fixture data)                                | Sales          | List     |
| `/`                          | `app/page.tsx`                           | Root entry redirect to the dashboard                           | Root           | Util     |
| `/payments`                  | `app/payments/page.tsx`                  | Payments list                                                  | Finance        | List     |
| `/procurement`               | `app/procurement/page.tsx`               | Procurement overview landing                                   | Procurement    | L        |
| `/production-orders`         | `app/production-orders/page.tsx`         | Production orders and scheduling                               | Manufacturing  | List     |
| `/profile`                   | `app/profile/page.tsx`                   | User profile and security settings                             | Profile        | Settings |
| `/projections`               | `app/projections/page.tsx`               | Demand projections                                             | Inventory      | List     |
| `/projects/[id]`             | `app/projects/[id]/page.tsx`             | Project detail (1.7k lines) with tasks, materials, time        | Projects       | Det      |
| `/projects`                  | `app/projects/page.tsx`                  | Project portfolio list                                         | Projects       | List     |
| `/purchase-invoices/[id]`    | `app/purchase-invoices/[id]/page.tsx`    | Invoice detail (matches receipt/PO)                            | Procurement    | Det      |
| `/purchase-invoices`         | `app/purchase-invoices/page.tsx`         | Purchase invoice list                                          | Procurement    | List     |
| `/purchase-orders/[id]`      | `app/purchase-orders/[id]/page.tsx`      | Purchase order detail (receipts, invoices, shipment tracking)  | Procurement    | Det      |
| `/purchase-orders`           | `app/purchase-orders/page.tsx`           | Purchase order list                                            | Procurement    | List     |
| `/quotations/[id]`           | `app/quotations/[id]/page.tsx`           | Quotation detail (hardcoded sample entity)                     | Sales          | Det      |
| `/quotations`                | `app/quotations/page.tsx`                | Quotation list (fixture data)                                  | Sales          | List     |
| `/reports/inventory`         | `app/reports/inventory/page.tsx`         | Inventory reports                                              | Analytics      | List     |
| `/reports/manufacturing`     | `app/reports/manufacturing/page.tsx`     | Manufacturing reports                                          | Analytics      | List     |
| `/reports`                   | `app/reports/page.tsx`                   | Reports hub                                                    | Analytics      | L        |
| `/reports/procurement`       | `app/reports/procurement/page.tsx`       | Procurement reports                                            | Analytics      | List     |
| `/reports/projects`          | `app/reports/projects/page.tsx`          | Project reports                                                | Analytics      | List     |
| `/reports/transactions`      | `app/reports/transactions/page.tsx`      | Transaction reports                                            | Analytics      | List     |
| `/reservations/[id]`         | `app/reservations/[id]/page.tsx`         | Reservation detail                                             | Inventory      | Det      |
| `/reservations`              | `app/reservations/page.tsx`              | Stock reservations                                             | Inventory      | List     |
| `/rma`                       | `app/rma/page.tsx`                       | RMA returns                                                    | Projects       | List     |
| `/roles/[id]`                | `app/roles/[id]/page.tsx`                | Role detail and permission matrix                              | Administration | Det      |
| `/roles`                     | `app/roles/page.tsx`                     | Roles and permissions list                                     | Administration | List     |
| `/sales-orders/[id]`         | `app/sales-orders/[id]/page.tsx`         | Sales order detail (hardcoded sample entity)                   | Sales          | Det      |
| `/sales-orders`              | `app/sales-orders/page.tsx`              | Sales order list (fixture data)                                | Sales          | List     |
| `/sales`                     | `app/sales/page.tsx`                     | Sales dashboard (fixture data)                                 | Sales          | L        |
| `/scan`                      | `app/scan/page.tsx`                      | Standalone installed scanner PWA (no shell chrome)             | Platform       | Util     |
| `/serials`                   | `app/serials/page.tsx`                   | Serial numbers                                                 | Inventory      | List     |
| `/service/[id]`              | `app/service/[id]/page.tsx`              | Service ticket detail (API-backed)                             | Projects       | Det      |
| `/service`                   | `app/service/page.tsx`                   | Service request list (links to maintenance)                    | Projects       | List     |
| `/settings`                  | `app/settings/page.tsx`                  | Organization profile, numbering series, feature flags          | Administration | Settings |
| `/settings/security`         | `app/settings/security/page.tsx`         | Legacy security/session page that redirects to /audit          | Administration | Redir    |
| `/setup`                     | `app/setup/page.tsx`                     | First-run bootstrap wizard                                     | Platform       | Auth     |
| `/spatial-models`            | `app/spatial-models/page.tsx`            | Spatial models and anchor management                           | Inventory      | List     |
| `/spatial/builder`           | `app/spatial/builder/page.tsx`           | Inventory builder workspace (?location=&mode=)                 | Inventory      | WF       |
| `/spatial`                   | `app/spatial/page.tsx`                   | 2D/3D spatial inventory workspace (?location=)                 | Inventory      | WF       |
| `/stock-adjustments/[id]`    | `app/stock-adjustments/[id]/page.tsx`    | Adjustment detail and approval (posts transaction)             | Inventory      | Det      |
| `/stock-adjustments`         | `app/stock-adjustments/page.tsx`         | Quantity adjustment list                                       | Inventory      | List     |
| `/stock-counts`              | `app/stock-counts/page.tsx`              | Physical stock count runs                                      | Inventory      | List     |
| `/supplier-returns/[id]`     | `app/supplier-returns/[id]/page.tsx`     | Supplier return detail                                         | Procurement    | Det      |
| `/supplier-returns`          | `app/supplier-returns/page.tsx`          | Supplier return list                                           | Procurement    | List     |
| `/suppliers/[id]`            | `app/suppliers/[id]/page.tsx`            | Supplier detail                                                | Procurement    | Det      |
| `/suppliers`                 | `app/suppliers/page.tsx`                 | Supplier directory                                             | Procurement    | List     |
| `/tasks/[id]`                | `app/tasks/[id]/page.tsx`                | Task detail (API-backed)                                       | Projects       | Det      |
| `/tasks`                     | `app/tasks/page.tsx`                     | Task list                                                      | Projects       | List     |
| `/time`                      | `app/time/page.tsx`                      | Timesheets and labor logs                                      | Projects       | List     |
| `/traceability`              | `app/traceability/page.tsx`              | Lot and serial genealogy (fixture data)                        | Manufacturing  | List     |
| `/transactions/[id]`         | `app/transactions/[id]/page.tsx`         | Transaction detail                                             | Inventory      | Det      |
| `/transactions`              | `app/transactions/page.tsx`              | Stock ledger and movement list                                 | Inventory      | List     |
| `/units`                     | `app/units/page.tsx`                     | Units of measure                                               | Inventory      | List     |
| `/users/[id]`                | `app/users/[id]/page.tsx`                | User detail: roles, audit, sessions                            | Administration | Det      |
| `/users`                     | `app/users/page.tsx`                     | Users directory                                                | Administration | List     |
| `/warehouse-bins`            | `app/warehouse-bins/page.tsx`            | Legacy redirect to /locations (asserted by Playwright)         | Inventory      | Redir    |
| `/warehouse-policies`        | `app/warehouse-policies/page.tsx`        | Storage/picking policy list                                    | Inventory      | List     |
| `/warehouse-transfers/[id]`  | `app/warehouse-transfers/[id]/page.tsx`  | Transfer detail and posting (links to transactions)            | Inventory      | Det      |
| `/warehouse-transfers`       | `app/warehouse-transfers/page.tsx`       | Internal warehouse transfer list                               | Inventory      | List     |
| `/warehouse`                 | `app/warehouse/page.tsx`                 | Legacy redirect to /locations                                  | Inventory      | Redir    |
| `/warehouses`                | `app/warehouses/page.tsx`                | Legacy redirect to /locations                                  | Inventory      | Redir    |
| `/warranty`                  | `app/warranty/page.tsx`                  | Warranty claims                                                | Projects       | List     |
| `/welcome`                   | `app/welcome/page.tsx`                   | Post-onboarding welcome screen linking to join                 | Platform       | Auth     |
| `/api/health`                | `app/api/health/route.ts`                | Health-check route handler used by Docker healthchecks         | Platform       | Util     |
| `/scan/manifest.webmanifest` | `app/scan/manifest.webmanifest/route.ts` | Scanner PWA manifest route handler                             | Platform       | Util     |
| `/work-orders/[id]`          | `app/work-orders/[id]/page.tsx`          | Work order detail and execution                                | Manufacturing  | WF       |
| `/work-orders`               | `app/work-orders/page.tsx`               | Work order list                                                | Manufacturing  | List     |
| `/workflows`                 | `app/workflows/page.tsx`                 | Workflow automation rules                                      | Administration | List     |

### 3.2 Navigation, access, and migration risk

| Current path                 | Parent → proposed parent          | Layout            | Navigation entry                                                   | Access control                                                  | Inbound links (evidence)            | Outbound links                                             | Current concerns                                                        | Proposed path                         | Risk                                                                         |
| ---------------------------- | --------------------------------- | ----------------- | ------------------------------------------------------------------ | --------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------- |
| `/accounts-payable`          | root → /finance                   | Shell             | —                                                                  | Session (middleware)                                            | —                                   | —                                                          | —                                                                       | `/finance/accounts-payable`           | M — fixture-ish empty state                                                  |
| `/accounts-receivable`       | root → /finance                   | Shell             | —                                                                  | Session (middleware)                                            | —                                   | —                                                          | —                                                                       | `/finance/accounts-receivable`        | M — fixture-ish empty state                                                  |
| `/accounts/[id]`             | /accounts → /finance              | Shell             | —                                                                  | Session (middleware)                                            | list page                           | —                                                          | —                                                                       | `/finance/chart-of-accounts/[id]`     | H — duplicate route family                                                   |
| `/accounts`                  | root → /finance                   | Shell             | —                                                                  | Session (middleware)                                            | list page                           | —                                                          | Name collides with CRM accounts and AR/AP                               | `/finance/chart-of-accounts`          | H — duplicate route with /chart-of-accounts; ambiguous name                  |
| `/activities`                | root → /sales                     | Shell             | —                                                                  | Session (middleware)                                            | —                                   | —                                                          | Conceptual duplicate of /activity; fixture-backed                       | `/sales/activities`                   | M — overlaps /activity; ownership decision required                          |
| `/activity`                  | root → /dashboard                 | Shell             | Dashboard › Operational Activity; Administration › Activity Center | Session (middleware)                                            | nav; 1 static link                  | —                                                          | Listed in Dashboard and Administration; rail highlights Administration  | `/dashboard/activity`                 | M — duplicate nav owner; module resolution already maps it to Administration |
| `/attributes`                | root → /inventory                 | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; 1 static link                  | /data-packs                                                | —                                                                       | `/inventory/attributes`               | M — nav; links to data packs                                                 |
| `/audit`                     | root → /settings                  | Shell             | Dashboard › Audit Explorer; Administration › Audit Explorer        | Session + Administration.Security page guard                    | nav                                 | —                                                          | Administration.Security guard; duplicate nav entry; two-hop legacy path | `/settings/audit`                     | H — search provider href + docs + /settings/security redirect                |
| `/bank-accounts`             | root → /finance                   | Shell             | —                                                                  | Session (middleware)                                            | —                                   | —                                                          | —                                                                       | `/finance/bank-accounts`              | M — fixture-ish empty state                                                  |
| `/bank-reconciliation`       | root → /finance                   | Shell             | —                                                                  | Session (middleware)                                            | —                                   | —                                                          | —                                                                       | `/finance/bank-reconciliation`        | M — fixture-ish empty state                                                  |
| `/barcodes`                  | root → /inventory                 | Shell             | Dashboard › Barcode & QR Studio; Inventory › Barcode & QR Studio   | Session (middleware)                                            | nav                                 | —                                                          | Listed in Dashboard and Inventory                                       | `/inventory/barcodes`                 | M — duplicate nav owner; inventory operations tool                           |
| `/batches`                   | root → /inventory                 | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; tests                          | —                                                          | —                                                                       | `/inventory/batches`                  | M — nav; test reference                                                      |
| `/boms/[id]`                 | /boms → /manufacturing            | Shell             | —                                                                  | Session (middleware)                                            | API search href                     | /boms/ /boms                                               | —                                                                       | `/manufacturing/boms/[id]`            | H — search href, many inbound refs                                           |
| `/boms`                      | root → /manufacturing             | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav                                 | —                                                          | Create path /boms/new missing                                           | `/manufacturing/boms`                 | H — search href, nav, command palette, create link dead                      |
| `/categories/[id]`           | /categories → /inventory          | Shell             | —                                                                  | Session (middleware)                                            | API search href                     | /categories                                                | —                                                                       | `/inventory/categories/[id]`          | H — search href, inbound refs                                                |
| `/categories`                | root → /inventory                 | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; 1 static link; tests           | —                                                          | —                                                                       | `/inventory/categories`               | H — search href, many inbound refs                                           |
| `/chart-of-accounts`         | root → /finance                   | Shell             | —                                                                  | Session (middleware)                                            | —                                   | —                                                          | Duplicate of /accounts                                                  | `/finance/chart-of-accounts`          | M — duplicate route; becomes redirect                                        |
| `/components/[id]`           | /components → /inventory          | Shell             | —                                                                  | Session + Inventory.Update / Inventory.Read action guards       | API search href                     | /components /goods-receipts /warehouse-transfers           | Action-level Inventory.Update / Inventory.Read guards                   | `/inventory/components/[id]`          | H — search href, many inbound refs, action guards                            |
| `/components`                | root → /inventory                 | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; 1 static link; tests           | /components/                                               | Create entry points point at dead /components/new                       | `/inventory/components`               | H — search href, 31 dynamic inbound refs, nav, command palette, tests        |
| `/crm`                       | root → /sales                     | Shell             | —                                                                  | Session (middleware)                                            | —                                   | —                                                          | Fixture-backed                                                          | `/sales/crm`                          | M — fixture-backed; not in rail                                              |
| `/customer-returns/[id]`     | /customer-returns → /sales        | Shell             | —                                                                  | Session (middleware)                                            | list page                           | —                                                          | Fixture-backed                                                          | `/sales/customer-returns/[id]`        | M — inbound from list                                                        |
| `/customer-returns`          | root → /sales                     | Shell             | —                                                                  | Session (middleware)                                            | list page                           | —                                                          | Fixture-backed                                                          | `/sales/customer-returns`             | M — fixture-backed                                                           |
| `/customers/[id]`            | /customers → /sales               | Shell             | —                                                                  | Session (middleware)                                            | list page                           | —                                                          | Fixture-backed                                                          | `/sales/customers/[id]`               | M — inbound from list                                                        |
| `/customers`                 | root → /sales                     | Shell             | —                                                                  | Session (middleware)                                            | list page                           | —                                                          | Fixture-backed                                                          | `/sales/customers`                    | M — fixture-backed; search provider has no customers href                    |
| `/cycle-counts/[id]`         | /cycle-counts → /inventory        | Shell             | —                                                                  | Session (middleware)                                            | list page                           | /cycle-counts                                              | —                                                                       | `/inventory/cycle-counts/[id]`        | M — inbound from list                                                        |
| `/cycle-counts`              | root → /inventory                 | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav                                 | —                                                          | —                                                                       | `/inventory/cycle-counts`             | M — nav; inbound from stock-counts                                           |
| `/dashboard`                 | root → unchanged                  | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; tests                          | /activity                                                  | —                                                                       | `/dashboard`                          | L — unchanged                                                                |
| `/data-operations`           | root → /settings                  | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav                                 | —                                                          | Duplicate route with /import-history                                    | `/settings/data-operations`           | M — nav; command palette; duplicate with /import-history                     |
| `/data-packs`                | root → /settings                  | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; 1 static link                  | /attributes /categories                                    | —                                                                       | `/settings/data-packs`                | M — nav; referenced from attributes                                          |
| `/equipment`                 | root → /manufacturing             | Shell             | —                                                                  | Session (middleware)                                            | —                                   | —                                                          | Becomes a direct redirect                                               | `/manufacturing/maintenance`          | L — update redirect target                                                   |
| `/finance`                   | root → unchanged                  | Shell             | —                                                                  | Session (middleware)                                            | —                                   | —                                                          | —                                                                       | `/finance`                            | L — unchanged                                                                |
| `/finished-goods`            | root → /manufacturing             | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; tests                          | —                                                          | —                                                                       | `/manufacturing/finished-goods`       | M — nav                                                                      |
| `/forgot-password`           | root → unchanged                  | Bare (public)     | —                                                                  | Public (middleware allow-list)                                  | 1 static link                       | /login                                                     | No API call; /reset-password has no page                                | `/forgot-password`                    | L — unchanged                                                                |
| `/fulfillment`               | root → /sales                     | Shell             | —                                                                  | Session (middleware)                                            | —                                   | —                                                          | Fixture-backed                                                          | `/sales/fulfillment`                  | M — fixture-backed                                                           |
| `/goods-receipts/[id]`       | /goods-receipts → /procurement    | Shell             | —                                                                  | Session (middleware)                                            | API search href                     | —                                                          | —                                                                       | `/procurement/goods-receipts/[id]`    | H — search href, cross-domain                                                |
| `/goods-receipts`            | root → /procurement               | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav                                 | —                                                          | Create path /goods-receipts/new missing                                 | `/procurement/goods-receipts`         | H — search href, nav, dashboard create link, tests                           |
| `/import-history`            | root → /settings                  | Shell             | —                                                                  | Session (middleware)                                            | —                                   | —                                                          | Duplicate of /data-operations                                           | `/settings/data-operations`           | L — duplicate route; becomes redirect                                        |
| `/intelligence`              | root → /settings                  | Shell             | Sidebar/nav item                                                   | Session + Administration.Roles page guard (EmptyState fallback) | nav                                 | —                                                          | Page guard with EmptyState fallback                                     | `/settings/intelligence`              | M — nav; Administration.Roles guard; docs                                    |
| `/inventory`                 | root → unchanged                  | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav                                 | /components                                                | —                                                                       | `/inventory`                          | L — unchanged                                                                |
| `/journal-entries`           | root → /finance                   | Shell             | —                                                                  | Session (middleware)                                            | —                                   | —                                                          | Fixture-backed                                                          | `/finance/journal-entries`            | M — fixture-backed                                                           |
| `/leads/[id]`                | /leads → /sales                   | Shell             | —                                                                  | Session (middleware)                                            | list page                           | —                                                          | Fixture-backed                                                          | `/sales/leads/[id]`                   | M — inbound from list                                                        |
| `/leads`                     | root → /sales                     | Shell             | —                                                                  | Session (middleware)                                            | list page                           | —                                                          | Fixture-backed                                                          | `/sales/leads`                        | M — fixture-backed                                                           |
| `/locations/[id]`            | /locations → /inventory           | Shell             | —                                                                  | Session (middleware)                                            | API search href; tests (20 refs)    | /locations/ /locations /spatial/builder?mode=map&location= | —                                                                       | `/inventory/locations/[id]`           | H — query-driven deep links from spatial views                               |
| `/locations`                 | root → /inventory                 | Shell             | Inventory › Warehouses & Storage › Storage Locations & Bins        | Session (middleware)                                            | nav; 1 static link                  | —                                                          | 4 URLs denote locations today                                           | `/inventory/locations`                | H — absorbs 3 redirect stubs; spatial deep links; tests                      |
| `/login`                     | root → unchanged                  | Bare (public)     | —                                                                  | Public (middleware allow-list)                                  | 2 static links; tests               | /forgot-password /onboarding                               | —                                                                       | `/login`                              | L — unchanged                                                                |
| `/maintenance`               | root → /manufacturing             | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; 1 static link; tests           | —                                                          | Concept also owned by service domain                                    | `/manufacturing/maintenance`          | M — nav; /equipment and /service link here                                   |
| `/manufacturers/[id]`        | /manufacturers → /inventory       | Shell             | —                                                                  | Session (middleware)                                            | API search href                     | /manufacturers                                             | —                                                                       | `/inventory/manufacturers/[id]`       | H — search href                                                              |
| `/manufacturers`             | root → /inventory                 | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav                                 | —                                                          | —                                                                       | `/inventory/manufacturers`            | H — search href, barcode flows                                               |
| `/manufacturing`             | root → unchanged                  | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav                                 | —                                                          | —                                                                       | `/manufacturing`                      | L — unchanged                                                                |
| `/material-consumption`      | root → /manufacturing             | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; tests                          | —                                                          | —                                                                       | `/manufacturing/material-consumption` | M — nav                                                                      |
| `/mrp/capacity`              | /mrp → /manufacturing             | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; tests                          | —                                                          | —                                                                       | `/manufacturing/mrp/capacity`         | M — nav; test reference                                                      |
| `/mrp/materials`             | /mrp → /manufacturing             | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; tests                          | —                                                          | —                                                                       | `/manufacturing/mrp/materials`        | M — nav; test reference                                                      |
| `/mrp`                       | root → /manufacturing             | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; tests                          | —                                                          | —                                                                       | `/manufacturing/mrp`                  | M — nav accordion root                                                       |
| `/mrp/production`            | /mrp → /manufacturing             | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; tests                          | —                                                          | —                                                                       | `/manufacturing/mrp/production`       | M — nav; test reference                                                      |
| `/mrp/purchases`             | /mrp → /manufacturing             | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; tests                          | —                                                          | —                                                                       | `/manufacturing/mrp/purchases`        | M — nav; test reference                                                      |
| `/mrp/runs/[id]`             | /mrp → /manufacturing             | Shell             | —                                                                  | Session (middleware)                                            | —                                   | —                                                          | —                                                                       | `/manufacturing/mrp/runs/[id]`        | M — inbound from MRP list                                                    |
| `/mrp/runs`                  | /mrp → /manufacturing             | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; tests                          | —                                                          | —                                                                       | `/manufacturing/mrp/runs`             | M — nav; test reference                                                      |
| `/notifications`             | root → unchanged                  | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; tests                          | —                                                          | In dashboard nav but matches no module; falls back to Dashboard         | `/notifications`                      | L — unchanged (header-owned)                                                 |
| `/onboarding/create`         | /onboarding → unchanged           | Bare (public)     | —                                                                  | Public (middleware allow-list)                                  | 2 static links; tests               | /onboarding /dashboard                                     | —                                                                       | `/onboarding/create`                  | L — unchanged                                                                |
| `/onboarding/join`           | /onboarding → unchanged           | Bare (public)     | —                                                                  | Public (middleware allow-list)                                  | 2 static links; tests               | /onboarding /onboarding/create /dashboard                  | —                                                                       | `/onboarding/join`                    | L — unchanged                                                                |
| `/onboarding`                | root → unchanged                  | Bare (public)     | —                                                                  | Public (middleware allow-list)                                  | 7 static links; tests               | /onboarding/create /onboarding/join /login                 | —                                                                       | `/onboarding`                         | L — unchanged                                                                |
| `/opportunities/[id]`        | /opportunities → /sales           | Shell             | —                                                                  | Session (middleware)                                            | list page                           | —                                                          | Fixture-backed                                                          | `/sales/opportunities/[id]`           | M — inbound from list                                                        |
| `/opportunities`             | root → /sales                     | Shell             | —                                                                  | Session (middleware)                                            | list page                           | —                                                          | Fixture-backed                                                          | `/sales/opportunities`                | M — fixture-backed                                                           |
| `/`                          | root → unchanged                  | Shell             | —                                                                  | Session (middleware)                                            | tests (entry)                       | —                                                          | Root duplicates /dashboard by design                                    | `/`                                   | L — keep redirect (PWA start_url, tests)                                     |
| `/payments`                  | root → /finance                   | Shell             | —                                                                  | Session (middleware)                                            | —                                   | —                                                          | —                                                                       | `/finance/payments`                   | M — fixture-ish empty state                                                  |
| `/procurement`               | root → unchanged                  | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav                                 | —                                                          | —                                                                       | `/procurement`                        | L — unchanged                                                                |
| `/production-orders`         | root → /manufacturing             | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; tests                          | —                                                          | —                                                                       | `/manufacturing/production-orders`    | M — nav; MRP links                                                           |
| `/profile`                   | root → unchanged                  | Shell             | —                                                                  | Session (middleware)                                            | API search href                     | —                                                          | —                                                                       | `/profile`                            | L — unchanged (header-owned)                                                 |
| `/projections`               | root → /inventory                 | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; tests                          | —                                                          | —                                                                       | `/inventory/projections`              | M — nav; test reference                                                      |
| `/projects/[id]`             | /projects → unchanged             | Shell             | —                                                                  | Session (middleware)                                            | API search href                     | —                                                          | —                                                                       | `/projects/[id]`                      | H — search href, many inbound refs                                           |
| `/projects`                  | root → unchanged                  | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; tests                          | —                                                          | —                                                                       | `/projects`                           | H — search href, nav, command palette                                        |
| `/purchase-invoices/[id]`    | /purchase-invoices → /procurement | Shell             | —                                                                  | Session (middleware)                                            | list page                           | /purchase-invoices                                         | —                                                                       | `/procurement/purchase-invoices/[id]` | M — inbound refs                                                             |
| `/purchase-invoices`         | root → /procurement               | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; 1 static link; tests           | /purchase-invoices/                                        | —                                                                       | `/procurement/purchase-invoices`      | M — nav; test reference                                                      |
| `/purchase-orders/[id]`      | /purchase-orders → /procurement   | Shell             | —                                                                  | Session (middleware)                                            | API search href                     | /purchase-orders                                           | —                                                                       | `/procurement/purchase-orders/[id]`   | H — search href, many inbound refs                                           |
| `/purchase-orders`           | root → /procurement               | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; tests                          | /purchase-orders/                                          | Create path /purchase-orders/new missing                                | `/procurement/purchase-orders`        | H — search href, nav, command palette, dashboard, tests, create link dead    |
| `/quotations/[id]`           | /quotations → /sales              | Shell             | —                                                                  | Session (middleware)                                            | list page                           | —                                                          | Fixture-backed                                                          | `/sales/quotations/[id]`              | M — inbound from list                                                        |
| `/quotations`                | root → /sales                     | Shell             | —                                                                  | Session (middleware)                                            | list page                           | —                                                          | Fixture-backed                                                          | `/sales/quotations`                   | M — fixture-backed                                                           |
| `/reports/inventory`         | /reports → unchanged              | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; API search href                | —                                                          | —                                                                       | `/reports/inventory`                  | L — unchanged                                                                |
| `/reports/manufacturing`     | /reports → unchanged              | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav                                 | —                                                          | —                                                                       | `/reports/manufacturing`              | L — unchanged                                                                |
| `/reports`                   | root → unchanged                  | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; API search href                | —                                                          | Hardcoded exact-match in sidebar-item                                   | `/reports`                            | L — unchanged                                                                |
| `/reports/procurement`       | /reports → unchanged              | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; API search href                | —                                                          | —                                                                       | `/reports/procurement`                | L — unchanged                                                                |
| `/reports/projects`          | /reports → unchanged              | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav                                 | —                                                          | —                                                                       | `/reports/projects`                   | L — unchanged                                                                |
| `/reports/transactions`      | /reports → unchanged              | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav                                 | —                                                          | —                                                                       | `/reports/transactions`               | L — unchanged                                                                |
| `/reservations/[id]`         | /reservations → /inventory        | Shell             | —                                                                  | Session (middleware)                                            | API search href                     | /reservations                                              | —                                                                       | `/inventory/reservations/[id]`        | M — search href                                                              |
| `/reservations`              | root → /inventory                 | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav                                 | —                                                          | —                                                                       | `/inventory/reservations`             | M — search href, nav                                                         |
| `/rma`                       | root → /projects                  | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; tests                          | —                                                          | —                                                                       | `/projects/rma`                       | M — nav                                                                      |
| `/roles/[id]`                | /roles → /settings                | Shell             | —                                                                  | Session (middleware)                                            | API search href                     | —                                                          | —                                                                       | `/settings/roles/[id]`                | H — search href                                                              |
| `/roles`                     | root → /settings                  | Shell             | Sidebar/nav item                                                   | Session + Administration.Roles action guard                     | nav                                 | —                                                          | Action-level Administration.Roles guard                                 | `/settings/roles`                     | H — search href, nav, action guard                                           |
| `/sales-orders/[id]`         | /sales-orders → /sales            | Shell             | —                                                                  | Session (middleware)                                            | list page                           | —                                                          | Fixture-backed                                                          | `/sales/orders/[id]`                  | M — inbound from list                                                        |
| `/sales-orders`              | root → /sales                     | Shell             | —                                                                  | Session (middleware)                                            | list page                           | —                                                          | Fixture-backed                                                          | `/sales/orders`                       | M — fixture-backed; rename includes resource rename                          |
| `/sales`                     | root → unchanged                  | Shell             | —                                                                  | Session (middleware)                                            | —                                   | —                                                          | Fixture-backed                                                          | `/sales`                              | L — unchanged path; new namespace only                                       |
| `/scan`                      | root → unchanged                  | Bare (standalone) | —                                                                  | Session; shell suppressed (standalone PWA)                      | —                                   | —                                                          | Shell deliberately suppressed                                           | `/scan`                               | L — unchanged (manifest/tests pin it)                                        |
| `/serials`                   | root → /inventory                 | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; tests                          | —                                                          | —                                                                       | `/inventory/serials`                  | M — nav; test reference                                                      |
| `/service/[id]`              | /service → /projects              | Shell             | —                                                                  | Session (middleware)                                            | list page                           | —                                                          | —                                                                       | `/projects/service/[id]`              | M — inbound from list                                                        |
| `/service`                   | root → /projects                  | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; tests                          | /maintenance                                               | Service/maintenance split across two modules                            | `/projects/service`                   | M — nav; cross-link to maintenance                                           |
| `/settings`                  | root → unchanged                  | Shell             | Sidebar/nav item                                                   | Session + Administration.Settings page guard                    | nav; tests                          | —                                                          | Whole-page Administration.Settings guard                                | `/settings`                           | L — unchanged                                                                |
| `/settings/security`         | /settings → /settings             | Shell             | —                                                                  | Session (middleware)                                            | API search href                     | —                                                          | Two-hop legacy redirect                                                 | `/settings/audit`                     | M — search provider and docs still reference it                              |
| `/setup`                     | root → unchanged                  | Bare (public)     | —                                                                  | Public (middleware allow-list)                                  | tests                               | /login                                                     | —                                                                       | `/setup`                              | L — unchanged                                                                |
| `/spatial-models`            | root → /inventory                 | Shell             | Inventory › Warehouses & Storage › Spatial Models & Anchors        | Session (middleware)                                            | nav; 1 static link                  | —                                                          | —                                                                       | `/inventory/spatial-models`           | M — nav child                                                                |
| `/spatial/builder`           | /spatial → /inventory             | Shell             | Inventory › Warehouses & Storage › Inventory Builder               | Session (middleware)                                            | nav; 1 static link; tests (28 refs) | —                                                          | Breadcrumb renders 'Spatial Inventory' (child order)                    | `/inventory/spatial/builder`          | H — 28 Playwright references; breadcrumb bug                                 |
| `/spatial`                   | root → /inventory                 | Shell             | Inventory › Warehouses & Storage › Spatial Inventory               | Session (middleware)                                            | nav; 1 static link                  | /spatial/builder /spatial-models /locations ?              | —                                                                       | `/inventory/spatial`                  | M — nav child; breadcrumb bug                                                |
| `/stock-adjustments/[id]`    | /stock-adjustments → /inventory   | Shell             | —                                                                  | Session (middleware)                                            | API search href                     | /transactions                                              | —                                                                       | `/inventory/stock-adjustments/[id]`   | M — search href, cross-domain                                                |
| `/stock-adjustments`         | root → /inventory                 | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav                                 | —                                                          | —                                                                       | `/inventory/stock-adjustments`        | M — search href, nav                                                         |
| `/stock-counts`              | root → /inventory                 | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; tests                          | —                                                          | —                                                                       | `/inventory/stock-counts`             | M — nav; test reference                                                      |
| `/supplier-returns/[id]`     | /supplier-returns → /procurement  | Shell             | —                                                                  | Session (middleware)                                            | API search href                     | —                                                          | —                                                                       | `/procurement/supplier-returns/[id]`  | M — search href                                                              |
| `/supplier-returns`          | root → /procurement               | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; tests                          | —                                                          | —                                                                       | `/procurement/supplier-returns`       | M — search href, nav; test reference                                         |
| `/suppliers/[id]`            | /suppliers → /procurement         | Shell             | —                                                                  | Session (middleware)                                            | API search href                     | /suppliers                                                 | —                                                                       | `/procurement/suppliers/[id]`         | H — search href                                                              |
| `/suppliers`                 | root → /procurement               | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; tests                          | —                                                          | —                                                                       | `/procurement/suppliers`              | H — search href, nav, command palette, tests                                 |
| `/tasks/[id]`                | /tasks → /projects                | Shell             | —                                                                  | Session (middleware)                                            | list page                           | —                                                          | —                                                                       | `/projects/tasks/[id]`                | M — inbound from list                                                        |
| `/tasks`                     | root → /projects                  | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; tests                          | —                                                          | —                                                                       | `/projects/tasks`                     | M — nav                                                                      |
| `/time`                      | root → /projects                  | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; tests                          | —                                                          | —                                                                       | `/projects/time`                      | M — nav                                                                      |
| `/traceability`              | root → /manufacturing             | Shell             | —                                                                  | Session (middleware)                                            | —                                   | —                                                          | Fixture-backed; could belong to inventory                               | `/manufacturing/traceability`         | M — ownership decision; fixture-backed                                       |
| `/transactions/[id]`         | /transactions → /inventory        | Shell             | —                                                                  | Session (middleware)                                            | list page                           | —                                                          | —                                                                       | `/inventory/transactions/[id]`        | H — inbound refs from adjustments/transfers/work orders                      |
| `/transactions`              | root → /inventory                 | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; 3 static links                 | —                                                          | Create path /transactions/new missing                                   | `/inventory/transactions`             | H — nav quick action, many inbound refs                                      |
| `/units`                     | root → /inventory                 | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav                                 | —                                                          | —                                                                       | `/inventory/units`                    | M — nav master data                                                          |
| `/users/[id]`                | /users → /settings                | Shell             | —                                                                  | Session + Administration.Users action guard                     | API search href                     | —                                                          | —                                                                       | `/settings/users/[id]`                | H — search href, action guard                                                |
| `/users`                     | root → /settings                  | Shell             | Sidebar/nav item                                                   | Session + Administration.Users action guard                     | nav                                 | —                                                          | Action-level Administration.Users guard                                 | `/settings/users`                     | H — search href, nav, action guard                                           |
| `/warehouse-bins`            | root → /inventory                 | Shell             | —                                                                  | Session (middleware)                                            | test asserts redirect               | —                                                          | Test asserts this redirect                                              | `/inventory/locations`                | L — update redirect target                                                   |
| `/warehouse-policies`        | root → /inventory                 | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; tests                          | —                                                          | —                                                                       | `/inventory/warehouse-policies`       | M — nav; test reference                                                      |
| `/warehouse-transfers/[id]`  | /warehouse-transfers → /inventory | Shell             | —                                                                  | Session (middleware)                                            | API search href                     | /transactions /warehouse-transfers                         | —                                                                       | `/inventory/warehouse-transfers/[id]` | H — search href, cross-domain writes                                         |
| `/warehouse-transfers`       | root → /inventory                 | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav                                 | —                                                          | Create path /warehouse-transfers/new missing                            | `/inventory/warehouse-transfers`      | H — search href, nav, create link missing                                    |
| `/warehouse`                 | root → /inventory                 | Shell             | —                                                                  | Session (middleware)                                            | —                                   | —                                                          | Becomes a direct redirect                                               | `/inventory/locations`                | L — update redirect target                                                   |
| `/warehouses`                | root → /inventory                 | Shell             | —                                                                  | Session (middleware)                                            | —                                   | —                                                          | Becomes a direct redirect                                               | `/inventory/locations`                | L — update redirect target                                                   |
| `/warranty`                  | root → /projects                  | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; tests                          | —                                                          | —                                                                       | `/projects/warranty`                  | M — nav                                                                      |
| `/welcome`                   | root → unchanged                  | Bare (public)     | —                                                                  | Public (middleware allow-list)                                  | —                                   | /onboarding/join                                           | —                                                                       | `/welcome`                            | L — unchanged                                                                |
| `/api/health`                | root → unchanged                  | n/a               | —                                                                  | Public (middleware allow-list)                                  | Docker healthcheck                  | —                                                          | —                                                                       | `/api/health`                         | L — unchanged                                                                |
| `/scan/manifest.webmanifest` | /scan → unchanged                 | n/a               | —                                                                  | Public (static-path bypass)                                     | scanner manifest test               | —                                                          | —                                                                       | `/scan/manifest.webmanifest`          | L — unchanged                                                                |
| `/work-orders/[id]`          | /work-orders → /manufacturing     | Shell             | —                                                                  | Session (middleware)                                            | API search href                     | /transactions /work-orders                                 | —                                                                       | `/manufacturing/work-orders/[id]`     | H — search href, cross-domain posting                                        |
| `/work-orders`               | root → /manufacturing             | Shell             | Sidebar/nav item                                                   | Session (middleware)                                            | nav; tests                          | —                                                          | Create path /work-orders/new missing                                    | `/manufacturing/work-orders`          | H — search href, nav, MRP, dashboard create link                             |
| `/workflows`                 | root → /settings                  | Shell             | Sidebar/nav item                                                   | Session + Administration.Security page guard                    | nav                                 | —                                                          | —                                                                       | `/settings/workflows`                 | M — nav; Administration.Security guard                                       |

**Counts:** 128 pages + 2 route handlers = 130 addressable routes; 84 pages at the root (one segment); 29 dynamic `[id]` routes; 6 redirect stubs; 7 referenced-but-missing `/new` routes.

---

## 4. Findings and Evidence

### Confirmed defects

**F1 — Root-level sprawl (architectural finding).** 84/128 pages mount at `/` with no domain prefix. Inventory resources alone occupy 20+ root segments (`/components`, `/transactions`, `/locations`, `/batches`, `/serials`, `/reservations`, `/units`, …) even though the rail already presents them as one Inventory workspace.

**F2 — All create entry points are broken (HIGH).** Seven `/new` routes are missing, referenced through eight distinct URLs by navigation, the command palette, the dashboard pipeline, and the scanner:

| Target                     | Referenced from                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| `/components/new`          | nav (×2), command palette, dashboard quick actions, `/components/new?sku=` from `scan-dialog.tsx:841` |
| `/purchase-orders/new`     | nav, command palette, `dashboard-operations-pipeline.tsx:240`                                         |
| `/goods-receipts/new`      | nav, command palette, `dashboard-operations-pipeline.tsx:272` (`?poId=`)                              |
| `/work-orders/new`         | nav, `dashboard-operations-pipeline.tsx:153`                                                          |
| `/transactions/new`        | nav quick action                                                                                      |
| `/boms/new`                | nav quick action, command palette                                                                     |
| `/warehouse-transfers/new` | nav quick action                                                                                      |
| `/components/new?sku=`     | scan dialog                                                                                           |

No `app/**/new/page.tsx` exists; no `[id]` page checks for `"new"`. Creation is implemented in dialogs on list pages (`DialogShell`, `setIsFormOpen`). Result: every primary "create" affordance leads to a Not-Found detail state. (The `/components/new?sku=` reference is a query variant of the same missing path.)

**F3 — Invalid rail permission codes (HIGH).** `Procurement.Read`, `Manufacturing.Read`, `Reporting.Read` are not in `ALL_PERMISSIONS`. `hasPermission` returns false for them unless the user has `*` or a `<Domain>.*` wildcard. Consequence: only administrators see the Procurement, Manufacturing, and Analytics modules in the rail; e.g. the seeded `Purchasing Agent` role cannot.

**F4 — Duplicate/overlapping routes.**

- `/accounts` and `/chart-of-accounts` render the same page (the latter re-exports the former).
- `/data-operations` and `/import-history` render the same page (re-export).
- `/warehouses`, `/warehouse`, `/warehouse-bins` are three redirect stubs to `/locations`.
- `/settings/security` redirects to `/audit`, yet is still referenced by the API search provider and `docs/architecture/INFORMATION_ARCHITECTURE.md`.
- `/activity` (API-backed feed) vs `/activities` (fixture-backed log) overlap conceptually.

**F5 — Duplicate nav ownership + module-resolution bug.** `/activity`, `/audit`, and `/barcodes` appear in two modules. `getModuleForPath()` skips the Dashboard module entirely, so `/activity` and `/audit` resolve to Administration (their second owner) — the rail highlight contradicts the Dashboard menu entry. `/notifications` matches no module and falls back to Dashboard by accident.

**F6 — Breadcrumb mis-ordering.** Child order in the "Warehouses & Storage" accordion is `/locations`, `/spatial`, `/spatial/builder`, `/spatial-models`, so `/spatial/builder` matches `/spatial` first and breadcrumbs show the wrong leaf ([navigation-config.tsx](../../apps/web/lib/navigation/navigation-config.tsx), [top-header.tsx](../../apps/web/lib/navigation/components/top-header.tsx)).

**F7 — Server-generated search URLs.** Five search providers embed frontend paths (see §2.6). `/settings/security` is a legacy redirect target — search results route through an extra hop.

**F8 — Missing `/reset-password` (MEDIUM).** Declared public in [middleware.ts](../../apps/web/middleware.ts), [dashboard-layout.tsx](../../apps/web/components/dashboard-layout.tsx), [navigation-context.tsx](../../apps/web/lib/navigation/navigation-context.tsx) and documented in [AUTHENTICATION.md](../../docs/security/AUTHENTICATION.md), but no page exists. `/forgot-password` fakes submission (`setSubmitted(true)`, no API call).

**F9 — No route boundaries (MEDIUM).** Zero `loading.tsx`, `error.tsx`, or `not-found.tsx`. Route-level failures fall back to Next.js defaults; unauthorized `PermissionGuard` pages render blank.

**F10 — Minor public-route drift.** Middleware's public list includes `/api/health`; the shell's list does not (harmless because the handler is excluded from rendering, but the two lists are maintained separately).

### Confirmed duplication in navigation configuration

- `/barcodes` is listed under Dashboard "Operations Hub" **and** Inventory "Workspace".
- `/activity` and `/audit` are listed under Dashboard **and** Administration.
- Quick actions are not permission-filtered in the sidebar (the command palette equivalent _is_ filtered): a user without `PurchaseOrders.Create` still sees "Create Purchase Order" if they can see any module.

### Fixture-backed screens (documented known limit, not defects)

`/activities`, `/crm`, `/customer-returns`, `/customers`, `/fulfillment`, `/journal-entries`, `/leads`, `/opportunities`, `/quotations`, `/sales`, `/sales-orders`, `/traceability` render in-code sample records; several detail pages (`/customers/[id]`, `/quotations/[id]`, `/sales-orders/[id]`, `/leads/[id]`, `/opportunities/[id]`, `/customer-returns/[id]`, `/accounts/[id]`) hardcode sample entities (ACME/COMP-1001 etc.). These are already outside the rail and are called out in [README.md](../../README.md) and [PROJECT_STATUS.md](../../PROJECT_STATUS.md). The audit treats their URLs as real routes that must still be mapped.

### Fragile couplings a migration must respect

- **`localStorage` stores raw paths** (`ananya_pinned_items`, `ananya_recent_items`) with no versioning or alias translation — renamed routes will render dead favorites/recents until re-visited.
- **Playwright tests assert paths**, including `/warehouse-bins` → `/locations` and 28 references to `/spatial/builder`.
- **PWA manifest `start_url` is `/`**, and `/` redirects to `/dashboard`; installed apps depend on that redirect surviving.
- **`sidebar-item.tsx` hardcodes `/reports` as exact-match**, so any Analytics restructuring must update that special case.
- **Nav `href`s and API search `href`s are independent copies** of the same path strings.

---

## 5. Proposed Target Route Tree

The target reuses the existing seven module IDs, names, and default routes, and adds two URL namespaces for domains that already exist in code. **No new business capability is proposed.**

```
/                                   → redirect to /dashboard        [unchanged]

Auth & first-run (root, unchanged)  /login  /forgot-password  /reset-password (NEW PAGE)  /welcome  /setup
                                    /onboarding  /onboarding/create  /onboarding/join
Standalone PWA (root, unchanged)    /scan  /scan/manifest.webmanifest
Framework handler (root, unchanged) /api/health

/dashboard                          Dashboard module landing        [unchanged]
  /dashboard/activity               Operational activity feed       (was /activity; single owner)
  /notifications                    Global notification center      [unchanged, header-owned]
  /profile                          User profile & security         [unchanged, header-owned]

/inventory                          Inventory landing               [unchanged]
  /inventory/components             Component catalog               (was /components)
  /inventory/components/[id]        Component detail                (was /components/[id])
  /inventory/components/new         Create component                (NEW; fixes dead links)
  /inventory/transactions           Stock ledger                    (was /transactions)
  /inventory/transactions/[id]      Transaction detail              (was /transactions/[id])
  /inventory/transactions/new       Record movement                 (NEW; fixes dead links)
  /inventory/locations              Storage locations & bins        (was /locations)
  /inventory/locations/[id]         Location detail                 (was /locations/[id])
  /inventory/spatial                Spatial inventory workspace     (was /spatial)
  /inventory/spatial/builder        Inventory builder               (was /spatial/builder)
  /inventory/spatial-models         Spatial models & anchors        (was /spatial-models)
  /inventory/warehouse-policies     Storage policies                (was /warehouse-policies)
  /inventory/warehouse-transfers    Internal transfers              (was /warehouse-transfers)
  /inventory/warehouse-transfers/[id]  Transfer detail              (was /warehouse-transfers/[id])
  /inventory/warehouse-transfers/new   Create transfer              (NEW; fixes dead links)
  /inventory/stock-counts           Physical stock counts           (was /stock-counts)
  /inventory/cycle-counts           ABC cycle counts                (was /cycle-counts)
  /inventory/cycle-counts/[id]      Cycle count worksheet           (was /cycle-counts/[id])
  /inventory/stock-adjustments      Quantity adjustments            (was /stock-adjustments)
  /inventory/stock-adjustments/[id] Adjustment detail              (was /stock-adjustments/[id])
  /inventory/batches                Batches & lots                  (was /batches)
  /inventory/serials                Serial numbers                  (was /serials)
  /inventory/reservations           Stock reservations              (was /reservations)
  /inventory/reservations/[id]      Reservation detail              (was /reservations/[id])
  /inventory/projections            Demand projections              (was /projections)
  /inventory/barcodes               Barcode & QR studio             (was /barcodes; single owner)
  /inventory/categories             Categories                      (was /categories)
  /inventory/categories/[id]        Category detail                 (was /categories/[id])
  /inventory/manufacturers          Manufacturers                   (was /manufacturers)
  /inventory/manufacturers/[id]     Manufacturer detail             (was /manufacturers/[id])
  /inventory/units                  Units of measure                (was /units)
  /inventory/attributes             Attribute library               (was /attributes)

/procurement                        Procurement landing             [unchanged]
  /procurement/purchase-orders      Purchase orders                 (was /purchase-orders)
  /procurement/purchase-orders/[id] PO detail                       (was /purchase-orders/[id])
  /procurement/purchase-orders/new  Create PO                       (NEW; fixes dead links)
  /procurement/goods-receipts       Goods receipts                  (was /goods-receipts)
  /procurement/goods-receipts/[id]  Receipt detail                  (was /goods-receipts/[id])
  /procurement/goods-receipts/new   Receive stock                   (NEW; fixes dead links)
  /procurement/purchase-invoices    Purchase invoices               (was /purchase-invoices)
  /procurement/purchase-invoices/[id] Invoice detail                (was /purchase-invoices/[id])
  /procurement/supplier-returns     Supplier returns                (was /supplier-returns)
  /procurement/supplier-returns/[id] Return detail                  (was /supplier-returns/[id])
  /procurement/suppliers            Suppliers directory             (was /suppliers)
  /procurement/suppliers/[id]       Supplier detail                 (was /suppliers/[id])

/manufacturing                      Manufacturing landing           [unchanged]
  /manufacturing/boms               Bills of materials              (was /boms)
  /manufacturing/boms/[id]          BOM detail                      (was /boms/[id])
  /manufacturing/boms/new           Create BOM                      (NEW; fixes dead links)
  /manufacturing/production-orders  Production orders               (was /production-orders)
  /manufacturing/work-orders        Work orders                     (was /work-orders)
  /manufacturing/work-orders/[id]   Work order detail               (was /work-orders/[id])
  /manufacturing/work-orders/new    Create work order               (NEW; fixes dead links)
  /manufacturing/material-consumption  Material consumption         (was /material-consumption)
  /manufacturing/finished-goods     Finished goods                  (was /finished-goods)
  /manufacturing/maintenance        Equipment maintenance           (was /maintenance)
  /manufacturing/mrp                MRP hub                         (was /mrp)
  /manufacturing/mrp/runs           Planning runs                   (was /mrp/runs)
  /manufacturing/mrp/runs/[id]      Run detail                      (was /mrp/runs/[id])
  /manufacturing/mrp/materials      Material shortages              (was /mrp/materials)
  /manufacturing/mrp/purchases      Purchase recommendations        (was /mrp/purchases)
  /manufacturing/mrp/production     Production recommendations      (was /mrp/production)
  /manufacturing/mrp/capacity       Capacity planning               (was /mrp/capacity)
  /manufacturing/traceability       Lot & serial genealogy          (was /traceability)   [DECISION]

/projects                           Projects landing                [unchanged]
  /projects/[id]                    Project detail                  [unchanged]
  /projects/tasks                   Tasks                           (was /tasks)
  /projects/tasks/[id]              Task detail                     (was /tasks/[id])
  /projects/time                    Timesheets                      (was /time)
  /projects/service                 Service requests                (was /service)
  /projects/service/[id]            Ticket detail                   (was /service/[id])
  /projects/warranty                Warranty tracking               (was /warranty)
  /projects/rma                     RMA returns                     (was /rma)

/sales            Sales & CRM namespace (URL now; rail module only when API-backed)   [DECISION]
  /sales                            Sales dashboard                 [unchanged]
  /sales/crm                        CRM & pipeline hub              (was /crm)
  /sales/customers                  Customers                       (was /customers)
  /sales/customers/[id]             Customer detail                 (was /customers/[id])
  /sales/leads                      Leads                           (was /leads)
  /sales/leads/[id]                 Lead detail                     (was /leads/[id])
  /sales/opportunities              Opportunities                   (was /opportunities)
  /sales/opportunities/[id]         Opportunity detail              (was /opportunities/[id])
  /sales/quotations                 Quotations                      (was /quotations)
  /sales/quotations/[id]            Quotation detail                (was /quotations/[id])
  /sales/orders                     Sales orders                    (was /sales-orders)
  /sales/orders/[id]                Sales order detail              (was /sales-orders/[id])
  /sales/fulfillment                Fulfillment & shipments         (was /fulfillment)
  /sales/customer-returns           Customer returns                (was /customer-returns)
  /sales/customer-returns/[id]      Return detail                   (was /customer-returns/[id])
  /sales/activities                 CRM activities                  (was /activities)     [DECISION]

/finance          Finance & accounting namespace (URL now; rail module only when API-backed)  [DECISION]
  /finance                          Finance summary                 [unchanged]
  /finance/chart-of-accounts        Chart of accounts / ledger      (was /accounts + /chart-of-accounts)
  /finance/chart-of-accounts/[id]   Ledger account detail           (was /accounts/[id])
  /finance/journal-entries          Journal entries                 (was /journal-entries)
  /finance/accounts-payable         Accounts payable                (was /accounts-payable)
  /finance/accounts-receivable      Accounts receivable             (was /accounts-receivable)
  /finance/payments                 Payments                        (was /payments)
  /finance/bank-accounts            Bank accounts                   (was /bank-accounts)
  /finance/bank-reconciliation      Bank reconciliation             (was /bank-reconciliation)

/reports                            Analytics module (unchanged)     [unchanged]
  /reports  /reports/inventory  /reports/procurement  /reports/manufacturing
  /reports/projects  /reports/transactions

/settings                           Administration landing          [unchanged]
  /settings/users                   Users directory                 (was /users)
  /settings/users/[id]              User detail                     (was /users/[id])
  /settings/roles                   Roles & permissions             (was /roles)
  /settings/roles/[id]              Role detail                     (was /roles/[id])
  /settings/workflows               Workflow automation             (was /workflows)
  /settings/data-operations         Data operations & imports       (was /data-operations)
  /settings/data-packs              Data packs & extensions         (was /data-packs)
  /settings/intelligence            ML & intelligence control plane (was /intelligence)
  /settings/audit                   Audit explorer                  (was /audit)
```

### What stays at the root, and why

| Root path                                                          | Justification                                                                                                   |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `/`                                                                | PWA `start_url` and test entry point; remains a redirect to `/dashboard`                                        |
| `/login`, `/forgot-password`, `/welcome`, `/setup`, `/onboarding*` | Pre-auth and first-run surfaces; must not sit under an authenticated namespace                                  |
| `/reset-password`                                                  | Declared public today; page must be created (Finding F8)                                                        |
| `/scan`                                                            | Installed standalone PWA whose manifest and tests pin the root path; shell chrome must stay suppressed          |
| `/api/health`                                                      | Framework route handler used by Docker healthchecks                                                             |
| `/dashboard`, `/notifications`, `/profile`                         | Module landing and header-owned global surfaces (not domain resources)                                          |
| `/reports/*`                                                       | Already domain-prefixed, documented, tested and referenced by API search; renaming to `/analytics` buys nothing |

### Naming and convention decisions (proposed)

1. **Resource names are preserved and only prefixed** (`/components` → `/inventory/components`), which keeps API/domain vocabulary and search providers aligned. The two exceptions are deliberate: `/sales-orders` → `/sales/orders` (avoids "sales/sales-") and the `/accounts` + `/chart-of-accounts` merge.
2. **Details** use `/<namespace>/<resource>/[id]`; IDs remain opaque UUIDs (no slugs are used anywhere today).
3. **Creation** uses a static `/new` segment, matching the URLs the navigation and command palette already assume; `/new` is shadow-free because record IDs are UUIDs. Where a create flow needs prefill, use query parameters (`?poId=`, `?sku=`), consistent with today's attempted links.
4. **Tabs and filters remain component state** for this refactor; no URL synchronisation is proposed. The existing nine parameters in §2.5 keep their names.
5. **Redirects are permanent (308)** and implemented in `next.config` so query strings are preserved; each redirect is asserted by a test.
6. **Rail count stays 7.** `/sales` and `/finance` are URL namespaces only until their APIs replace fixture data; adding rail modules is a separate, explicit decision (Q1).

---

## 6. Full Old-to-New Path Mapping

`—` means the path is unchanged. `N/A` means the route is new (no previous path). Redirects are listed in §8.

| Old path                     | New path                              | Notes                                                                   |
| ---------------------------- | ------------------------------------- | ----------------------------------------------------------------------- |
| `/accounts-payable`          | `/finance/accounts-payable`           | Prefix under finance                                                    |
| `/accounts-receivable`       | `/finance/accounts-receivable`        | Prefix under finance                                                    |
| `/accounts/[id]`             | `/finance/chart-of-accounts/[id]`     | Prefix under finance                                                    |
| `/accounts`                  | `/finance/chart-of-accounts`          | Name collides with CRM accounts and AR/AP                               |
| `/activities`                | `/sales/activities`                   | Conceptual duplicate of /activity; fixture-backed                       |
| `/activity`                  | `/dashboard/activity`                 | Listed in Dashboard and Administration; rail highlights Administration  |
| `/attributes`                | `/inventory/attributes`               | Prefix under inventory                                                  |
| `/audit`                     | `/settings/audit`                     | Administration.Security guard; duplicate nav entry; two-hop legacy path |
| `/bank-accounts`             | `/finance/bank-accounts`              | Prefix under finance                                                    |
| `/bank-reconciliation`       | `/finance/bank-reconciliation`        | Prefix under finance                                                    |
| `/barcodes`                  | `/inventory/barcodes`                 | Listed in Dashboard and Inventory                                       |
| `/batches`                   | `/inventory/batches`                  | Prefix under inventory                                                  |
| `/boms/[id]`                 | `/manufacturing/boms/[id]`            | Prefix under manufacturing                                              |
| `/boms`                      | `/manufacturing/boms`                 | Create path /boms/new missing                                           |
| `/categories/[id]`           | `/inventory/categories/[id]`          | Prefix under inventory                                                  |
| `/categories`                | `/inventory/categories`               | Prefix under inventory                                                  |
| `/chart-of-accounts`         | `/finance/chart-of-accounts`          | Duplicate of /accounts                                                  |
| `/components/[id]`           | `/inventory/components/[id]`          | Action-level Inventory.Update / Inventory.Read guards                   |
| `/components`                | `/inventory/components`               | Create entry points point at dead /components/new                       |
| `/crm`                       | `/sales/crm`                          | Fixture-backed                                                          |
| `/customer-returns/[id]`     | `/sales/customer-returns/[id]`        | Fixture-backed                                                          |
| `/customer-returns`          | `/sales/customer-returns`             | Fixture-backed                                                          |
| `/customers/[id]`            | `/sales/customers/[id]`               | Fixture-backed                                                          |
| `/customers`                 | `/sales/customers`                    | Fixture-backed                                                          |
| `/cycle-counts/[id]`         | `/inventory/cycle-counts/[id]`        | Prefix under inventory                                                  |
| `/cycle-counts`              | `/inventory/cycle-counts`             | Prefix under inventory                                                  |
| `/dashboard`                 | — (unchanged)                         | No change                                                               |
| `/data-operations`           | `/settings/data-operations`           | Duplicate route with /import-history                                    |
| `/data-packs`                | `/settings/data-packs`                | Prefix under settings                                                   |
| `/equipment`                 | `/manufacturing/maintenance`          | Becomes a direct redirect                                               |
| `/finance`                   | — (unchanged)                         | No change                                                               |
| `/finished-goods`            | `/manufacturing/finished-goods`       | Prefix under manufacturing                                              |
| `/forgot-password`           | — (unchanged)                         | No change                                                               |
| `/fulfillment`               | `/sales/fulfillment`                  | Fixture-backed                                                          |
| `/goods-receipts/[id]`       | `/procurement/goods-receipts/[id]`    | Prefix under procurement                                                |
| `/goods-receipts`            | `/procurement/goods-receipts`         | Create path /goods-receipts/new missing                                 |
| `/import-history`            | `/settings/data-operations`           | Duplicate of /data-operations                                           |
| `/intelligence`              | `/settings/intelligence`              | Page guard with EmptyState fallback                                     |
| `/inventory`                 | — (unchanged)                         | No change                                                               |
| `/journal-entries`           | `/finance/journal-entries`            | Fixture-backed                                                          |
| `/leads/[id]`                | `/sales/leads/[id]`                   | Fixture-backed                                                          |
| `/leads`                     | `/sales/leads`                        | Fixture-backed                                                          |
| `/locations/[id]`            | `/inventory/locations/[id]`           | Prefix under inventory                                                  |
| `/locations`                 | `/inventory/locations`                | 4 URLs denote locations today                                           |
| `/login`                     | — (unchanged)                         | No change                                                               |
| `/maintenance`               | `/manufacturing/maintenance`          | Concept also owned by service domain                                    |
| `/manufacturers/[id]`        | `/inventory/manufacturers/[id]`       | Prefix under inventory                                                  |
| `/manufacturers`             | `/inventory/manufacturers`            | Prefix under inventory                                                  |
| `/manufacturing`             | — (unchanged)                         | No change                                                               |
| `/material-consumption`      | `/manufacturing/material-consumption` | Prefix under manufacturing                                              |
| `/mrp/capacity`              | `/manufacturing/mrp/capacity`         | Prefix under manufacturing                                              |
| `/mrp/materials`             | `/manufacturing/mrp/materials`        | Prefix under manufacturing                                              |
| `/mrp`                       | `/manufacturing/mrp`                  | Prefix under manufacturing                                              |
| `/mrp/production`            | `/manufacturing/mrp/production`       | Prefix under manufacturing                                              |
| `/mrp/purchases`             | `/manufacturing/mrp/purchases`        | Prefix under manufacturing                                              |
| `/mrp/runs/[id]`             | `/manufacturing/mrp/runs/[id]`        | Prefix under manufacturing                                              |
| `/mrp/runs`                  | `/manufacturing/mrp/runs`             | Prefix under manufacturing                                              |
| `/notifications`             | — (unchanged)                         | No change                                                               |
| `/onboarding/create`         | — (unchanged)                         | No change                                                               |
| `/onboarding/join`           | — (unchanged)                         | No change                                                               |
| `/onboarding`                | — (unchanged)                         | No change                                                               |
| `/opportunities/[id]`        | `/sales/opportunities/[id]`           | Fixture-backed                                                          |
| `/opportunities`             | `/sales/opportunities`                | Fixture-backed                                                          |
| `/`                          | — (unchanged)                         | Root redirect retained                                                  |
| `/payments`                  | `/finance/payments`                   | Prefix under finance                                                    |
| `/procurement`               | — (unchanged)                         | No change                                                               |
| `/production-orders`         | `/manufacturing/production-orders`    | Prefix under manufacturing                                              |
| `/profile`                   | — (unchanged)                         | No change                                                               |
| `/projections`               | `/inventory/projections`              | Prefix under inventory                                                  |
| `/projects/[id]`             | — (unchanged)                         | No change                                                               |
| `/projects`                  | — (unchanged)                         | No change                                                               |
| `/purchase-invoices/[id]`    | `/procurement/purchase-invoices/[id]` | Prefix under procurement                                                |
| `/purchase-invoices`         | `/procurement/purchase-invoices`      | Prefix under procurement                                                |
| `/purchase-orders/[id]`      | `/procurement/purchase-orders/[id]`   | Prefix under procurement                                                |
| `/purchase-orders`           | `/procurement/purchase-orders`        | Create path /purchase-orders/new missing                                |
| `/quotations/[id]`           | `/sales/quotations/[id]`              | Fixture-backed                                                          |
| `/quotations`                | `/sales/quotations`                   | Fixture-backed                                                          |
| `/reports/inventory`         | — (unchanged)                         | No change                                                               |
| `/reports/manufacturing`     | — (unchanged)                         | No change                                                               |
| `/reports`                   | — (unchanged)                         | No change                                                               |
| `/reports/procurement`       | — (unchanged)                         | No change                                                               |
| `/reports/projects`          | — (unchanged)                         | No change                                                               |
| `/reports/transactions`      | — (unchanged)                         | No change                                                               |
| `/reservations/[id]`         | `/inventory/reservations/[id]`        | Prefix under inventory                                                  |
| `/reservations`              | `/inventory/reservations`             | Prefix under inventory                                                  |
| `/rma`                       | `/projects/rma`                       | Prefix under projects                                                   |
| `/roles/[id]`                | `/settings/roles/[id]`                | Prefix under settings                                                   |
| `/roles`                     | `/settings/roles`                     | Action-level Administration.Roles guard                                 |
| `/sales-orders/[id]`         | `/sales/orders/[id]`                  | Fixture-backed                                                          |
| `/sales-orders`              | `/sales/orders`                       | Fixture-backed                                                          |
| `/sales`                     | — (unchanged)                         | No change                                                               |
| `/scan`                      | — (unchanged)                         | No change                                                               |
| `/serials`                   | `/inventory/serials`                  | Prefix under inventory                                                  |
| `/service/[id]`              | `/projects/service/[id]`              | Prefix under projects                                                   |
| `/service`                   | `/projects/service`                   | Service/maintenance split across two modules                            |
| `/settings`                  | — (unchanged)                         | No change                                                               |
| `/settings/security`         | `/settings/audit`                     | Two-hop legacy redirect                                                 |
| `/setup`                     | — (unchanged)                         | No change                                                               |
| `/spatial-models`            | `/inventory/spatial-models`           | Prefix under inventory                                                  |
| `/spatial/builder`           | `/inventory/spatial/builder`          | Breadcrumb renders 'Spatial Inventory' (child order)                    |
| `/spatial`                   | `/inventory/spatial`                  | Prefix under inventory                                                  |
| `/stock-adjustments/[id]`    | `/inventory/stock-adjustments/[id]`   | Prefix under inventory                                                  |
| `/stock-adjustments`         | `/inventory/stock-adjustments`        | Prefix under inventory                                                  |
| `/stock-counts`              | `/inventory/stock-counts`             | Prefix under inventory                                                  |
| `/supplier-returns/[id]`     | `/procurement/supplier-returns/[id]`  | Prefix under procurement                                                |
| `/supplier-returns`          | `/procurement/supplier-returns`       | Prefix under procurement                                                |
| `/suppliers/[id]`            | `/procurement/suppliers/[id]`         | Prefix under procurement                                                |
| `/suppliers`                 | `/procurement/suppliers`              | Prefix under procurement                                                |
| `/tasks/[id]`                | `/projects/tasks/[id]`                | Prefix under projects                                                   |
| `/tasks`                     | `/projects/tasks`                     | Prefix under projects                                                   |
| `/time`                      | `/projects/time`                      | Prefix under projects                                                   |
| `/traceability`              | `/manufacturing/traceability`         | Fixture-backed; could belong to inventory                               |
| `/transactions/[id]`         | `/inventory/transactions/[id]`        | Prefix under inventory                                                  |
| `/transactions`              | `/inventory/transactions`             | Create path /transactions/new missing                                   |
| `/units`                     | `/inventory/units`                    | Prefix under inventory                                                  |
| `/users/[id]`                | `/settings/users/[id]`                | Prefix under settings                                                   |
| `/users`                     | `/settings/users`                     | Action-level Administration.Users guard                                 |
| `/warehouse-bins`            | `/inventory/locations`                | Test asserts this redirect                                              |
| `/warehouse-policies`        | `/inventory/warehouse-policies`       | Prefix under inventory                                                  |
| `/warehouse-transfers/[id]`  | `/inventory/warehouse-transfers/[id]` | Prefix under inventory                                                  |
| `/warehouse-transfers`       | `/inventory/warehouse-transfers`      | Create path /warehouse-transfers/new missing                            |
| `/warehouse`                 | `/inventory/locations`                | Becomes a direct redirect                                               |
| `/warehouses`                | `/inventory/locations`                | Becomes a direct redirect                                               |
| `/warranty`                  | `/projects/warranty`                  | Prefix under projects                                                   |
| `/welcome`                   | — (unchanged)                         | No change                                                               |
| `/api/health`                | — (unchanged)                         | No change                                                               |
| `/scan/manifest.webmanifest` | — (unchanged)                         | No change                                                               |
| `/work-orders/[id]`          | `/manufacturing/work-orders/[id]`     | Prefix under manufacturing                                              |
| `/work-orders`               | `/manufacturing/work-orders`          | Create path /work-orders/new missing                                    |
| `/workflows`                 | `/settings/workflows`                 | Prefix under settings                                                   |

### New routes (no previous path)

| New path                             | Purpose                                      | Replaces (dead link)                 |
| ------------------------------------ | -------------------------------------------- | ------------------------------------ |
| `/inventory/components/new`          | Create component (reuse catalog dialog/form) | /components/new (dead link)          |
| `/inventory/transactions/new`        | Record stock movement                        | /transactions/new (dead link)        |
| `/inventory/warehouse-transfers/new` | Create internal transfer                     | /warehouse-transfers/new (dead link) |
| `/procurement/purchase-orders/new`   | Create purchase order                        | /purchase-orders/new (dead link)     |
| `/procurement/goods-receipts/new`    | Receive stock; supports ?poId=               | /goods-receipts/new (dead link)      |
| `/manufacturing/boms/new`            | Create BOM                                   | /boms/new (dead link)                |
| `/manufacturing/work-orders/new`     | Create work order                            | /work-orders/new (dead link)         |

---

## 7. Navigation, Layout, Breadcrumb, and Access-Control Implications

### Navigation configuration

| Change                 | Work required                                                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All moved resources    | Update every `href` in [navigation-config.tsx](../../apps/web/lib/navigation/navigation-config.tsx) (59 valid + 6 dead)                                                                                                         |
| `/components/new` etc. | Point quick actions at the canonical list route **or** the new `/new` route once created; remove the 8 dead links either way                                                                                                    |
| Duplicate entries      | Choose a single owner for `/activity` (Dashboard), `/audit` (Administration), `/barcodes` (Inventory) and delete the duplicates                                                                                                 |
| Invalid permissions    | Replace `Procurement.Read` → `PurchaseOrders.Read` (or a new `Procurement.Read` code), `Manufacturing.Read` → `BOM.Read`, `Reporting.Read` → `Reports.Read` — **decision required** whether to add codes to the catalog instead |
| Quick actions          | Add permission filtering to sidebar quick actions for parity with the command palette                                                                                                                                           |
| Command palette        | Update the 11 hardcoded `ALL_QUICK_ACTIONS` hrefs; update recent-pages behaviour for renamed paths                                                                                                                              |
| Favorites/recents      | Add an alias map for stored paths or clear old entries on first load after migration                                                                                                                                            |

### Module resolution and active state

- `getModuleForPath()` must be updated or, preferably, driven by the new prefixes so every moved path maps to exactly one module. Today it **skips Dashboard** and relies on declaration order; with prefix-based ownership this ambiguity disappears.
- `sidebar-item.tsx`'s hardcoded `/reports` exact-match special case should be replaced with `item.exact` metadata only.
- Accordion auto-expand persists `item.id` keys, which are stable across path renames; no migration needed there.

### Breadcrumbs

- Breadcrumbs derive from the nav tree, not the URL, so **moving a page without updating the nav tree breaks breadcrumbs**. Nav and routes must land in the same phase.
- Fix the child-order bug by moving `/spatial/builder` and `/spatial-models` handling to longest-prefix-wins matching instead of first-match (`top-header.tsx` and `getModuleForPath`).
- Add a breadcrumb assertion test for every nested accordion path.

### Access control

- Moving a page must move its guard with it. The guarded pages are `/audit` → `/settings/audit`, `/settings`, `/workflows` → `/settings/workflows`, `/intelligence` → `/settings/intelligence`, `/roles` → `/settings/roles`, `/users` → `/settings/users`, `/components/[id]` → `/inventory/components/[id]`.
- Middleware public list contains no moved path, so auth behaviour is unaffected by prefixing. `/settings/*` stays authenticated.
- **Do not rely on URLs for authorization.** API guards remain authoritative; keep client guards as presentational only.
- `PermissionGuard`'s silent-null fallback should get an explicit unauthorized state so deep links are not blank pages (out of scope but recommended in the same effort).

### Layout

- No layout changes are required: the single shell keeps working because all moved routes remain authenticated. `/scan` and public routes are unaffected.
- Because there are no route groups today, this refactor does **not** need route groups either; introducing `(auth)`/`(app)` groups would be a separate, optional step. (Marked as a non-goal.)

---

## 8. Redirect and Compatibility Policy

### Policy

1. Every renamed path gets a **308 permanent redirect** to its canonical target, existing for at least one full release cycle; removal requires a follow-up decision.
2. Redirects are declared centrally in `apps/web/next.config.*` (or middleware) rather than as one-off page files, so a path list can be tested in one place.
3. Redirects must **preserve query strings** (`?location=`, `?view=`, `?poId=`, `?token=`, `?focusLocation=` …); each gets a test.
4. **No redirect chains**: legacy stubs point directly at final targets (e.g. `/equipment` → `/manufacturing/maintenance`, not via `/maintenance`; `/settings/security` → `/settings/audit`, not via `/audit`).
5. Reads-only for old paths during the compatibility window; old paths never render two competing versions of a page.
6. Auth and standalone surfaces are **not** redirected.

### Proposed redirects

| Old path                    | New path                              | Type | Note                                                                    |
| --------------------------- | ------------------------------------- | ---- | ----------------------------------------------------------------------- |
| `/accounts-payable`         | `/finance/accounts-payable`           | 308  | Add to centralized redirect map                                         |
| `/accounts-receivable`      | `/finance/accounts-receivable`        | 308  | Add to centralized redirect map                                         |
| `/accounts/[id]`            | `/finance/chart-of-accounts/[id]`     | 308  | Add to centralized redirect map                                         |
| `/accounts`                 | `/finance/chart-of-accounts`          | 308  | Name collides with CRM accounts and AR/AP                               |
| `/activities`               | `/sales/activities`                   | 308  | Conceptual duplicate of /activity; fixture-backed                       |
| `/activity`                 | `/dashboard/activity`                 | 308  | Listed in Dashboard and Administration; rail highlights Administration  |
| `/attributes`               | `/inventory/attributes`               | 308  | Add to centralized redirect map                                         |
| `/audit`                    | `/settings/audit`                     | 308  | Administration.Security guard; duplicate nav entry; two-hop legacy path |
| `/bank-accounts`            | `/finance/bank-accounts`              | 308  | Add to centralized redirect map                                         |
| `/bank-reconciliation`      | `/finance/bank-reconciliation`        | 308  | Add to centralized redirect map                                         |
| `/barcodes`                 | `/inventory/barcodes`                 | 308  | Listed in Dashboard and Inventory                                       |
| `/batches`                  | `/inventory/batches`                  | 308  | Add to centralized redirect map                                         |
| `/boms/[id]`                | `/manufacturing/boms/[id]`            | 308  | Add to centralized redirect map                                         |
| `/boms`                     | `/manufacturing/boms`                 | 308  | Create path /boms/new missing                                           |
| `/categories/[id]`          | `/inventory/categories/[id]`          | 308  | Add to centralized redirect map                                         |
| `/categories`               | `/inventory/categories`               | 308  | Add to centralized redirect map                                         |
| `/chart-of-accounts`        | `/finance/chart-of-accounts`          | 308  | Duplicate of /accounts                                                  |
| `/components/[id]`          | `/inventory/components/[id]`          | 308  | Action-level Inventory.Update / Inventory.Read guards                   |
| `/components`               | `/inventory/components`               | 308  | Create entry points point at dead /components/new                       |
| `/crm`                      | `/sales/crm`                          | 308  | Fixture-backed                                                          |
| `/customer-returns/[id]`    | `/sales/customer-returns/[id]`        | 308  | Fixture-backed                                                          |
| `/customer-returns`         | `/sales/customer-returns`             | 308  | Fixture-backed                                                          |
| `/customers/[id]`           | `/sales/customers/[id]`               | 308  | Fixture-backed                                                          |
| `/customers`                | `/sales/customers`                    | 308  | Fixture-backed                                                          |
| `/cycle-counts/[id]`        | `/inventory/cycle-counts/[id]`        | 308  | Add to centralized redirect map                                         |
| `/cycle-counts`             | `/inventory/cycle-counts`             | 308  | Add to centralized redirect map                                         |
| `/data-operations`          | `/settings/data-operations`           | 308  | Duplicate route with /import-history                                    |
| `/data-packs`               | `/settings/data-packs`                | 308  | Add to centralized redirect map                                         |
| `/equipment`                | `/manufacturing/maintenance`          | 308  | Becomes a direct redirect                                               |
| `/finished-goods`           | `/manufacturing/finished-goods`       | 308  | Add to centralized redirect map                                         |
| `/fulfillment`              | `/sales/fulfillment`                  | 308  | Fixture-backed                                                          |
| `/goods-receipts/[id]`      | `/procurement/goods-receipts/[id]`    | 308  | Add to centralized redirect map                                         |
| `/goods-receipts`           | `/procurement/goods-receipts`         | 308  | Create path /goods-receipts/new missing                                 |
| `/import-history`           | `/settings/data-operations`           | 308  | Duplicate of /data-operations                                           |
| `/intelligence`             | `/settings/intelligence`              | 308  | Page guard with EmptyState fallback                                     |
| `/journal-entries`          | `/finance/journal-entries`            | 308  | Fixture-backed                                                          |
| `/leads/[id]`               | `/sales/leads/[id]`                   | 308  | Fixture-backed                                                          |
| `/leads`                    | `/sales/leads`                        | 308  | Fixture-backed                                                          |
| `/locations/[id]`           | `/inventory/locations/[id]`           | 308  | Add to centralized redirect map                                         |
| `/locations`                | `/inventory/locations`                | 308  | 4 URLs denote locations today                                           |
| `/maintenance`              | `/manufacturing/maintenance`          | 308  | Concept also owned by service domain                                    |
| `/manufacturers/[id]`       | `/inventory/manufacturers/[id]`       | 308  | Add to centralized redirect map                                         |
| `/manufacturers`            | `/inventory/manufacturers`            | 308  | Add to centralized redirect map                                         |
| `/material-consumption`     | `/manufacturing/material-consumption` | 308  | Add to centralized redirect map                                         |
| `/mrp/capacity`             | `/manufacturing/mrp/capacity`         | 308  | Add to centralized redirect map                                         |
| `/mrp/materials`            | `/manufacturing/mrp/materials`        | 308  | Add to centralized redirect map                                         |
| `/mrp`                      | `/manufacturing/mrp`                  | 308  | Add to centralized redirect map                                         |
| `/mrp/production`           | `/manufacturing/mrp/production`       | 308  | Add to centralized redirect map                                         |
| `/mrp/purchases`            | `/manufacturing/mrp/purchases`        | 308  | Add to centralized redirect map                                         |
| `/mrp/runs/[id]`            | `/manufacturing/mrp/runs/[id]`        | 308  | Add to centralized redirect map                                         |
| `/mrp/runs`                 | `/manufacturing/mrp/runs`             | 308  | Add to centralized redirect map                                         |
| `/opportunities/[id]`       | `/sales/opportunities/[id]`           | 308  | Fixture-backed                                                          |
| `/opportunities`            | `/sales/opportunities`                | 308  | Fixture-backed                                                          |
| `/payments`                 | `/finance/payments`                   | 308  | Add to centralized redirect map                                         |
| `/production-orders`        | `/manufacturing/production-orders`    | 308  | Add to centralized redirect map                                         |
| `/projections`              | `/inventory/projections`              | 308  | Add to centralized redirect map                                         |
| `/purchase-invoices/[id]`   | `/procurement/purchase-invoices/[id]` | 308  | Add to centralized redirect map                                         |
| `/purchase-invoices`        | `/procurement/purchase-invoices`      | 308  | Add to centralized redirect map                                         |
| `/purchase-orders/[id]`     | `/procurement/purchase-orders/[id]`   | 308  | Add to centralized redirect map                                         |
| `/purchase-orders`          | `/procurement/purchase-orders`        | 308  | Create path /purchase-orders/new missing                                |
| `/quotations/[id]`          | `/sales/quotations/[id]`              | 308  | Fixture-backed                                                          |
| `/quotations`               | `/sales/quotations`                   | 308  | Fixture-backed                                                          |
| `/reservations/[id]`        | `/inventory/reservations/[id]`        | 308  | Add to centralized redirect map                                         |
| `/reservations`             | `/inventory/reservations`             | 308  | Add to centralized redirect map                                         |
| `/rma`                      | `/projects/rma`                       | 308  | Add to centralized redirect map                                         |
| `/roles/[id]`               | `/settings/roles/[id]`                | 308  | Add to centralized redirect map                                         |
| `/roles`                    | `/settings/roles`                     | 308  | Action-level Administration.Roles guard                                 |
| `/sales-orders/[id]`        | `/sales/orders/[id]`                  | 308  | Fixture-backed                                                          |
| `/sales-orders`             | `/sales/orders`                       | 308  | Fixture-backed                                                          |
| `/serials`                  | `/inventory/serials`                  | 308  | Add to centralized redirect map                                         |
| `/service/[id]`             | `/projects/service/[id]`              | 308  | Add to centralized redirect map                                         |
| `/service`                  | `/projects/service`                   | 308  | Service/maintenance split across two modules                            |
| `/settings/security`        | `/settings/audit`                     | 308  | Two-hop legacy redirect                                                 |
| `/spatial-models`           | `/inventory/spatial-models`           | 308  | Add to centralized redirect map                                         |
| `/spatial/builder`          | `/inventory/spatial/builder`          | 308  | Breadcrumb renders 'Spatial Inventory' (child order)                    |
| `/spatial`                  | `/inventory/spatial`                  | 308  | Add to centralized redirect map                                         |
| `/stock-adjustments/[id]`   | `/inventory/stock-adjustments/[id]`   | 308  | Add to centralized redirect map                                         |
| `/stock-adjustments`        | `/inventory/stock-adjustments`        | 308  | Add to centralized redirect map                                         |
| `/stock-counts`             | `/inventory/stock-counts`             | 308  | Add to centralized redirect map                                         |
| `/supplier-returns/[id]`    | `/procurement/supplier-returns/[id]`  | 308  | Add to centralized redirect map                                         |
| `/supplier-returns`         | `/procurement/supplier-returns`       | 308  | Add to centralized redirect map                                         |
| `/suppliers/[id]`           | `/procurement/suppliers/[id]`         | 308  | Add to centralized redirect map                                         |
| `/suppliers`                | `/procurement/suppliers`              | 308  | Add to centralized redirect map                                         |
| `/tasks/[id]`               | `/projects/tasks/[id]`                | 308  | Add to centralized redirect map                                         |
| `/tasks`                    | `/projects/tasks`                     | 308  | Add to centralized redirect map                                         |
| `/time`                     | `/projects/time`                      | 308  | Add to centralized redirect map                                         |
| `/traceability`             | `/manufacturing/traceability`         | 308  | Fixture-backed; could belong to inventory                               |
| `/transactions/[id]`        | `/inventory/transactions/[id]`        | 308  | Add to centralized redirect map                                         |
| `/transactions`             | `/inventory/transactions`             | 308  | Create path /transactions/new missing                                   |
| `/units`                    | `/inventory/units`                    | 308  | Add to centralized redirect map                                         |
| `/users/[id]`               | `/settings/users/[id]`                | 308  | Add to centralized redirect map                                         |
| `/users`                    | `/settings/users`                     | 308  | Action-level Administration.Users guard                                 |
| `/warehouse-bins`           | `/inventory/locations`                | 308  | Test asserts this redirect                                              |
| `/warehouse-policies`       | `/inventory/warehouse-policies`       | 308  | Add to centralized redirect map                                         |
| `/warehouse-transfers/[id]` | `/inventory/warehouse-transfers/[id]` | 308  | Add to centralized redirect map                                         |
| `/warehouse-transfers`      | `/inventory/warehouse-transfers`      | 308  | Create path /warehouse-transfers/new missing                            |
| `/warehouse`                | `/inventory/locations`                | 308  | Becomes a direct redirect                                               |
| `/warehouses`               | `/inventory/locations`                | 308  | Becomes a direct redirect                                               |
| `/warranty`                 | `/projects/warranty`                  | 308  | Add to centralized redirect map                                         |
| `/work-orders/[id]`         | `/manufacturing/work-orders/[id]`     | 308  | Add to centralized redirect map                                         |
| `/work-orders`              | `/manufacturing/work-orders`          | 308  | Create path /work-orders/new missing                                    |
| `/workflows`                | `/settings/workflows`                 | 308  | Add to centralized redirect map                                         |

### Paths that must NOT be redirected

| Path                                                                 | Reason                                                                                                                           |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `/reset-password`                                                    | Public route declared in middleware/docs with no page; it must be **created**, not aliased                                       |
| `/login?from=…`, `/login?expired=true`                               | Security-sensitive round trip; `from` is validated by `postLoginDestination` and must not pass through a generic redirect        |
| `/scan`, `/scan/manifest.webmanifest`                                | Installed PWA identity; manifest `start_url` and tests pin these                                                                 |
| `/api/health`                                                        | Infrastructure healthcheck contract                                                                                              |
| API-only prefixes (`/crm-accounts`, `/notes`, `/ml/attributes/*`, …) | No frontend route exists; never alias an API prefix into a frontend namespace                                                    |
| `/warehouse-policies` vs `/inventory/warehouse-policies`             | Same semantics (safe to redirect); but **`/accounts` must not be redirected to `/sales/*`** — it is the ledger, not CRM accounts |

### `localStorage` compatibility

`ananya_pinned_items` and `ananya_recent_items` store raw paths. Mitigation options (choose one):

- **Recommended:** ship a small `LEGACY_PATH_ALIASES` map used by favorites/recents rendering to translate old paths; entries expire naturally as users re-visit.
- Alternative: clear the keys once on first load after migration (loses user data, simplest).

---

## 9. Phased Migration Plan

**Guiding technique:** for each domain phase, first create the new route paths as thin **re-export shims** of the existing page modules (the pattern already used by `/import-history` → `../data-operations/page` and `/chart-of-accounts` → `../accounts/page`). Both URL trees then serve identical code; links are flipped; only then are old paths converted to redirects. This avoids partially migrated states without a big-bang rename.

| Phase                                            | Work                                                                                                                                                                                                                                                   | Depends on                | Rollback                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | ------------------------------------------------- |
| **0. Decisions & guardrails**                    | Resolve Q1–Q10 (§11). Update `INFORMATION_ARCHITECTURE.md` with the approved tree. Add a route-path constants module (`lib/routes.ts`) and a Vitest test that asserts every nav href resolves to a real `page.tsx`.                                    | Approval                  | Revert docs/constants commit                      |
| **1. Defect fixes (no moves)**                   | Fix the 6 invalid nav permission codes (F3); fix breadcrumb longest-prefix matching (F6); remove duplicate nav entries and decide `/activity`, `/audit`, `/barcodes` ownership (F5); add `/reset-password` (F8); add `error.tsx`/`not-found.tsx` (F9). | —                         | Independent, individually revertable              |
| **2. Create routes & dead links**                | Add the 7 `/new` routes (thin pages reusing existing dialogs/forms, including `?poId=`/`?sku=` prefill) **or**, if Q4 chooses query-based create, repoint all 8 dead links to list routes with `?new=1`.                                               | Q4                        | Revert route files; no URL removed                |
| **3. Shared surfaces**                           | Move `/profile` (unchanged), `/notifications` (unchanged), `/activity` → `/dashboard/activity`; collapse `/settings/security` and `/import-history` and `/chart-of-accounts` to direct redirects; add redirect tests.                                  | Phase 1                   | Revert pages; redirects additive                  |
| **4. Inventory** (largest)                       | Shims for `/inventory/*`; update nav, quick actions, command palette, breadcrumbs, cross-domain links (`/components/[id]` → transfers/receipts, scanner `?sku=`), API inventory search hrefs, Playwright specs. Convert old paths to redirects.        | Phase 2, 3                | Revert phase commit; old paths were still serving |
| **5. Procurement**                               | Same pattern for `/procurement/*`; update API procurement search hrefs and PO/receipt workflows.                                                                                                                                                       | Phase 4                   | Phase commit                                      |
| **6. Manufacturing**                             | `/manufacturing/*` including `/mrp/*`, `/maintenance`, `/traceability` (pending Q3); update dashboard pipeline, API manufacturing search hrefs, tests.                                                                                                 | Phase 5                   | Phase commit                                      |
| **7. Projects**                                  | `/projects/*`; update `/service` → `/maintenance` cross-link and API projects search hrefs.                                                                                                                                                            | Phase 6                   | Phase commit                                      |
| **8. Sales, Finance, Administration, Dashboard** | `/sales/*`, `/finance/*`, `/settings/*`; update API administration search hrefs (`/users/:id`, `/roles/:id`, `/settings/security`, `/reports/*`); update README/PROJECT_STATUS route lists; add rail modules later only if Q1 approves.                | Phase 7                   | Phase commit                                      |
| **9. Cleanup**                                   | Remove compatibility redirects after the agreed window; delete shim files; delete the alias map when analytics show no old-path traffic.                                                                                                               | One release after Phase 8 | Re-add redirects                                  |

**Dependency order notes**

- API search providers ship in the same monorepo/release; each phase must update the matching provider or search results will 404. If web and API can be deployed independently, add a temporary alias/redirect for the previous provider output (the redirect table already covers it).
- Documentation (`INFORMATION_ARCHITECTURE.md`, `AUTHENTICATION.md`, `SCANNER_APP.md`, `README.md`, `PROJECT_STATUS.md`, RFC references) must be updated in the same phase as the paths it names.
- Test path constants (`tests/page-objects/*`, `tests/e2e/master-data-planning.spec.ts`) move with each phase, never afterwards.

---

## 10. Test and Acceptance Plan

### Commands available in the repository

| Purpose                 | Command                          | Notes                                                                              |
| ----------------------- | -------------------------------- | ---------------------------------------------------------------------------------- |
| Web unit tests (Vitest) | `pnpm --filter @ananya/web test` | `vitest run`; 33 root specs + 18 spatial specs                                     |
| All unit tests          | `pnpm test`                      | Turborepo, builds first                                                            |
| Types                   | `pnpm check-types`               | `next typegen && tsc --noEmit` per package                                         |
| Lint                    | `pnpm lint`                      | `eslint --max-warnings 0`                                                          |
| Build                   | `pnpm build`                     | Turborepo                                                                          |
| E2E                     | `pnpm test:e2e`                  | Playwright, `testDir: ./tests`, `webServer: pnpm dev` on :3000, 5 browser projects |
| Accessibility           | `pnpm test:accessibility`        | `tests/accessibility`                                                              |
| Visual regression       | `pnpm test:visual`               | `tests/e2e/visual-regression.spec.ts`                                              |
| Full gate               | `pnpm qa`                        | lint → types → test → build → e2e                                                  |

### Baseline actually run in this audit

`npx vitest run lib/navigation/navigation-metrics.spec.ts lib/post-login-destination.spec.ts lib/pwa-structure.spec.ts lib/scanner-app-structure.spec.ts` in `apps/web` → **4 files, 40 tests passed** (2026-10-03). No full suite, type-check, lint, build, or Playwright run was performed in this phase.

### Acceptance checklist per phase

1. **Every route loads at its intended path** — a generated route table test asserts each intended path has a `page.tsx`.
2. **Every old path has an explicit keep / redirect / retire decision** — the §8 table is the source of truth; a test iterates redirects.
3. **Redirects preserve path parameters and query strings** — Playwright cases for `?location=`, `?view=`, `?focusLocation=`, `?focusComponent=`, `?token=`, `?poId=`, `?sku=`, `?from=`.
4. **No redirect loops or conflicting patterns** — unit test walks the redirect map for cycles and shadowed paths.
5. **Sidebar links and active states work on nested routes** — for each nav item, assert click lands on the path and the item is highlighted; assert no two modules claim the same path.
6. **Breadcrumbs reflect the intended hierarchy** — assert the full trail for every accordion child, including `/spatial/builder` and `/mrp/runs`.
7. **Create/edit/detail workflows still navigate correctly** — component → receipts/transfers; PO → goods receipt (`?poId=`); stock adjustment → transaction; location → spatial builder; scanner → component create.
8. **Role/permission restrictions unchanged** — matrix test across the 10 seeded roles that rail items, guards, and 403 behaviour match pre-migration expectations (and that F3 is fixed).
9. **Deep links and refresh work** — direct navigation (not client-side) to every renamed path and every redirect; hard refresh on detail pages.
10. **Not-found and unauthorized behaviour remain correct** — unknown paths render the 404 boundary; guarded pages show an unauthorized state, not blank content.
11. **Existing tests pass** — `pnpm test`, targeted Playwright suites; new route-mapping/redirect tests added; E2E specs updated to the new paths in the same phase.
12. **No stale references** — ripgrep gate for each retired path across `apps/`, `tests/`, `docs/`, `README.md`, `PROJECT_STATUS.md`, allowing only the redirect map.

---

## 11. Risks, Assumptions, Unresolved Questions, and Required Decisions

### Risk register

| ID  | Risk                                                          | Likelihood | Impact | Mitigation                                                                                                         |
| --- | ------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------ |
| R1  | API search hrefs desync from web routes                       | Medium     | High   | Update provider in the same phase; redirects cover the gap                                                         |
| R2  | Bookmarks/external deep links break                           | Medium     | Medium | 308 redirects for one release; analytics on old-path hits                                                          |
| R3  | `localStorage` favorites/recents show dead paths              | High       | Low    | Alias map (recommended) or one-time clear                                                                          |
| R4  | Playwright/unit specs assert old paths                        | High       | Medium | Update spec path constants inside each phase; run targeted suites                                                  |
| R5  | Guard/layout semantics accidentally changed by moving a route | Low        | High   | Move guard with page; explicit tests for guarded routes                                                            |
| R6  | Breadcrumbs/nav mismatch during partial migration             | Medium     | Medium | Nav + routes land in the same phase; shims keep both URL trees alive                                               |
| R7  | Redirect chains (e.g. `/equipment` → `/maintenance` → new)    | Medium     | Low    | Point legacy stubs at final targets; loop/chain test                                                               |
| R8  | PWA `start_url` `/` breaks installed apps                     | Low        | High   | Keep `/` → `/dashboard`; never redirect root elsewhere                                                             |
| R9  | Fixture-backed pages confuse users during migration           | Medium     | Low    | Keep the documented "sample records" notice; visible banner recommended                                            |
| R10 | Two independent path copies (nav vs API) drift over time      | High       | Medium | Single `lib/routes.ts` source + test; search providers import shared constants if feasible across package boundary |

### Assumptions (not verified)

- **A1:** External systems/bookmarks may reference current paths; no evidence of stored URLs was found in the repo besides API search.
- **A2:** Web and API deploy together (compose builds both); if not, R1 mitigation is required.
- **A3:** The 7-module rail cap in `INFORMATION_ARCHITECTURE.md` is still a product constraint.
- **A4:** No analytics tool tracking path-based funnels was found; unknown external impact.

### Unresolved questions (UNKNOWN)

- **U1:** Real-world bookmark/deep-link usage and any external documentation linking to Ananya URLs.
- **U2:** Whether the installed `/scan` PWA and root `/` start URL can be considered immutable long-term.
- **U3:** Whether `/reset-password` should be implemented now or removed from the public lists and docs.
- **U4:** Whether Sales/CRM and Finance pages will be API-integrated within this refactor's window.

### Decisions required before implementation

| #       | Decision                                   | Options                                                                                                                  | Recommendation                                                                       |
| ------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| **Q1**  | Rail treatment for `/sales` and `/finance` | (a) URL namespaces only until API-backed; (b) add 8th/9th rail modules now; (c) fold into existing modules               | **(a)** — matches the documented 7-module cap and fixture-backed status              |
| **Q2**  | Create-flow convention                     | (a) add `/new` routes matching existing links; (b) keep dialogs and use `?new=1` on list routes; (c) remove create links | **(a)** — links already assume it; bookmarkable; `?sku=`/`?poId=` prefill preserved  |
| **Q3**  | Ownership of `/traceability`               | (a) `/manufacturing/traceability`; (b) `/inventory/traceability`; (c) leave at root                                      | **(a)** — RFC-0020 `manufacturing-traceability`; flag if it is actually lots/serials |
| **Q4**  | Fate of `/activities`                      | (a) `/sales/activities` (CRM per RFC-0039); (b) redirect to `/dashboard/activity` (duplicate today); (c) retire          | **(b) is the honest reading of current code; (a) matches RFC intent** — product call |
| **Q5**  | Analytics namespace                        | (a) keep `/reports`; (b) rename `/analytics`                                                                             | **(a)** — already domain-scoped, documented, tested                                  |
| **Q6**  | `/activity` location                       | (a) `/dashboard/activity`; (b) `/settings/activity`; (c) keep `/activity`                                                | **(a)** if it stays a dashboard feed; **(b)** if it is a system log                  |
| **Q7**  | Invalid permission codes                   | (a) fix nav to existing codes; (b) add `Procurement.Read`/`Manufacturing.Read`/`Reporting.Read` to the API catalog       | **(a)** — smallest change, no new RBAC surface (add `Reports.Read` mapping)          |
| **Q8**  | Redirect lifetime                          | (a) one release; (b) permanent; (c) time-boxed 6 months                                                                  | **(a)** with analytics check                                                         |
| **Q9**  | Route groups `(auth)`/`(app)`              | (a) not now; (b) introduce during refactor                                                                               | **(a)** — single shell already works; separate concern                               |
| **Q10** | Sales order path                           | (a) `/sales/orders`; (b) `/sales/sales-orders`                                                                           | **(a)** — avoids stutter; redirect covers old path                                   |

---

## 12. Appendix — Inspected Files and Searches

### Primary evidence files

| Area               | Files                                                                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routing root       | `apps/web/app/**` (128 `page.tsx`, 2 `route.ts`, 1 `layout.tsx`, `manifest.ts`)                                                                                                                                           |
| Shell              | `apps/web/components/dashboard-layout.tsx`, `app/layout.tsx`, `components/app-footer.tsx`, `components/pwa-register.tsx`                                                                                                  |
| Navigation         | `apps/web/lib/navigation/navigation-config.tsx`, `navigation-context.tsx`, `types.ts`, `tokens.ts`, `components/*` (16 files)                                                                                             |
| Command surface    | `apps/web/components/command-palette.tsx`, `components/ui/notification-bell.tsx`, `components/barcodes/scan-dialog.tsx`, `components/scanner/*`                                                                           |
| Auth               | `apps/web/middleware.ts`, `lib/auth/auth-context.tsx`, `lib/post-login-destination.ts`, `lib/api-client.ts`                                                                                                               |
| API URL generation | `apps/api/src/search/search.service.ts`, `search.types.ts`, `providers/*.ts`                                                                                                                                              |
| Permissions        | `apps/api/src/permissions/permissions.service.ts`                                                                                                                                                                         |
| Tests              | `tests/e2e/**`, `tests/accessibility/**`, `tests/page-objects/**`, `tests/fixtures/**`, `playwright.config.ts`, `apps/web/lib/*.spec.ts`                                                                                  |
| Docs               | `docs/architecture/INFORMATION_ARCHITECTURE.md`, `docs/architecture/README.md`, `docs/README.md`, `docs/security/AUTHENTICATION.md`, `docs/archive/NAVIGATION_AUDIT.md`, RFCs 0026–0068, `README.md`, `PROJECT_STATUS.md` |
| Config             | `apps/web/next.config.*`, `apps/web/package.json`, root `package.json`, `turbo.json`, `playwright.config.ts`, `.env.example`, `compose*.yml`, `docker/*`                                                                  |

### Searches performed (representative)

- Enumerated all `page.tsx` / `layout.tsx` / `route.ts` / boundary files; counted route groups, dynamic segments, catch-alls.
- Extracted every `href` literal, `router.push/replace`, `redirect()`, and `window.location` assignment across `app/`, `components/`, `lib/`, `src/` (483 files) and aggregated by destination pattern.
- Extracted every `useSearchParams` / `.get()` parameter read.
- Compared all nav `permissions` arrays against `ALL_PERMISSIONS` code set.
- Extracted every nav `href` and compared against the page tree — found the 6 dead `/new` targets.
- Traced `getModuleForPath`, active-state matching, accordion auto-expand, breadcrumb construction, and favorites/recents persistence.
- Scanned `tests/` and `tools/` for `goto`, `toHaveURL`, and path literals; scanned `docs/`, `README.md`, `PROJECT_STATUS.md` for route references.
- Scanned `apps/api` for frontend URL storage/return (`href`, `link`, `url`, `actionUrl`, `redirectUrl`).
- Detected fixture-backed pages by `mock*` state initialisers and sample-record literals; cross-checked against the documented list.
- Ran the navigation/PWA/scanner/post-login Vitest specs (40 tests) as a baseline.

---

_End of audit. Implementation must wait for explicit approval of the target tree and the decisions in §11._

---

## 13. Post-Implementation Record (2026-10-03)

The refactor was implemented in full. This section records what actually shipped, the deviations from the Phase 1 proposal, and the evidence used to verify it.

### 13.1 What changed

| Area                      | Result                                                                                                                                                                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain namespaces         | All 19 inventory resources, 5 procurement resources, 8 manufacturing resources, 5 project resources, 9 sales resources, 8 finance resources, and 7 administration resources moved under their domain roots                                         |
| Existing domains          | `/dashboard`, `/inventory`, `/procurement`, `/manufacturing`, `/projects`, `/reports`, `/settings`, `/sales`, `/finance`, `/notifications`, `/profile`, auth routes, and `/scan` kept their paths                                                  |
| Dedicated creation routes | 6 added: `/inventory/components/new` (with `?sku=`), `/inventory/warehouse-transfers/new`, `/procurement/purchase-orders/new`, `/procurement/goods-receipts/new` (with `?poId=`), `/manufacturing/work-orders/new`, `/manufacturing/boms/new`      |
| Compatibility redirects   | 74 entries in [`apps/web/lib/navigation/legacy-redirects.ts`](../../apps/web/lib/navigation/legacy-redirects.ts), issued as **308** by [`apps/web/middleware.ts`](../../apps/web/middleware.ts) before the auth gate, with query strings preserved |
| Duplicate routes retired  | `/accounts`, `/chart-of-accounts`, `/import-history`, `/warehouse`, `/warehouses`, `/warehouse-bins`, `/equipment`, `/settings/security` pages removed; each now redirects                                                                         |
| Navigation ownership      | `/activity` → Dashboard only; `/audit` → Administration only; `/barcodes` → Inventory only. `getModuleForPath()` now includes Dashboard and picks the **longest** matching href, so every path has one intentional owner                           |
| Permission codes          | Sidebar modules now use codes that exist in the API catalog: Procurement → `PurchaseOrders.Read`, Manufacturing → `BOM.Read`, Analytics → `Reports.Read`                                                                                           |
| Breadcrumbs               | Extracted to [`apps/web/lib/navigation/breadcrumbs.ts`](../../apps/web/lib/navigation/breadcrumbs.ts); most-specific child wins, so `/spatial/builder` no longer breadcrumbs as "Spatial Inventory"                                                |
| Shared path helper        | [`apps/web/lib/navigation/route-paths.ts`](../../apps/web/lib/navigation/route-paths.ts) exposes the canonical domain roots and a validated `canonicalPath()` builder for cross-domain links                                                       |

### 13.2 Deviations from the Phase 1 proposal

| #   | Proposal                                                                                           | Actual decision                                                                                                                                          | Reason                                                                                                                                                                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `/transactions` → `/inventory/transactions`; add `/finance/transactions/new` per the approval note | Implemented as **`/inventory/transactions`**                                                                                                             | The approval note also listed `/transactions/new → /finance/transactions/new`, which contradicts the verified audit mapping (stock ledger belongs to Inventory). The implementation followed the verified source behaviour, per the "smallest safe adjustment" rule |
| 2   | Add `/…/transactions/new` create route                                                             | **Not added.** Inventory quick action "Issue Stock" points at `/inventory/stock-adjustments`; `/transactions/new` redirects to `/inventory/transactions` | The ledger is an immutable audit trail and no create form or mutation path exists to reuse; movements originate from receipts, transfers, adjustments, and work orders. Creating a form would have invented a new ledger-write path                                 |
| 3   | `/activities` → `/sales/activities`                                                                | **Retained at `/activities`**                                                                                                                            | The approval gated the redirect on audit confirmation that it is the CRM activities page. The audit found it is a fixture-backed system log, so merging it with `/dashboard/activity` or the reserved `/sales/activities` would merge distinct behaviours           |
| 4   | Sales/Finance rail modules                                                                         | URL namespaces only, no rail module                                                                                                                      | Approved decision; the IA spec now states a domain can exist as a namespace before it earns a module                                                                                                                                                                |
| 5   | Analytics → `/analytics` option                                                                    | `/reports` kept                                                                                                                                          | Approved decision                                                                                                                                                                                                                                                   |
| 6   | `/signup`-style route groups                                                                       | Not introduced                                                                                                                                           | Approved decision; the single shell already covers auth/public separation                                                                                                                                                                                           |

### 13.3 Verification evidence

| Check                                                                                                                         | Command                                                | Result                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Web unit suite (including navigation, redirect, PWA, scanner, and source-reading specs)                                       | `pnpm --filter @ananya/web test`                       | **60 files, 1453 tests passed**                                                                                                                                                      |
| Navigation conventions (route coverage, single ownership, breadcrumbs, redirect map, migration completeness, stale-link gate) | `npx vitest run lib/navigation` in `apps/web`          | **2 files, 20 tests passed**                                                                                                                                                         |
| Lint                                                                                                                          | `pnpm --filter @ananya/web lint`                       | Passed (`--max-warnings 0`)                                                                                                                                                          |
| Web type-check                                                                                                                | `pnpm --filter @ananya/web check-types`                | Passed                                                                                                                                                                               |
| API type-check (search providers updated)                                                                                     | `pnpm --filter @ananya/api check-types`                | Passed                                                                                                                                                                               |
| Production build                                                                                                              | `pnpm --filter @ananya/web build`                      | Passed; route table shows the canonical tree                                                                                                                                         |
| Live redirect behaviour                                                                                                       | Temporary `next start` on port 3100 (production build) | `308` for legacy paths, query strings preserved (`/components/new?sku=ABC` → `/inventory/components/new?sku=ABC`); canonical and retained paths not redirected; `/login` still `200` |
| Playwright E2E                                                                                                                | `pnpm test:e2e`                                        | **Not run** — requires the API, Postgres, and seeded data; the browser-facing redirect checks above were executed instead against the production build                               |

### 13.4 Documentation updated

- [`docs/architecture/INFORMATION_ARCHITECTURE.md`](INFORMATION_ARCHITECTURE.md) — canonical paths, permission codes, creation-route and redirect conventions, Sales/Finance namespace note, corrected section numbering.
- [`README.md`](../../README.md) and [`PROJECT_STATUS.md`](../../PROJECT_STATUS.md) — fixture-backed screen lists now use canonical paths.
- [`docs/development/ML_OPERATIONS.md`](../development/ML_OPERATIONS.md) and [`tools/spatial-demo-dataset/README.md`](../../tools/spatial-demo-dataset/README.md) — operator instructions point at canonical paths.
- **Historical documents were intentionally not rewritten** (RFCs 0001–0068, `docs/archive/`). They record the decisions and URLs as they were at the time; the redirect map is the compatibility contract for their links.
- [`docs/security/authorization-matrix.md`](../security/authorization-matrix.md) and [`docs/api/README.md`](../api/README.md) describe **API** endpoints, which did not move.

### 13.5 Remaining risks and follow-ups

1. **Sales/CRM and Finance pages are still fixture-backed** and remain outside the rail; their namespaces are ready for API integration.
2. **`/activities` has no canonical successor** until the CRM activities question is settled; it is excluded from redirects on purpose.
3. **No `/inventory/transactions/new`** exists by design; if operators need direct ledger entry, that is a domain decision requiring a ledger-safe workflow.
4. **Compatibility redirects are permanent until a follow-up decision removes them**; analytics on legacy-path hits should drive the removal window.
5. **Playwright E2E was not executed** in this environment; the redirect spec coverage is unit-level plus the live production-build probe described above.

### 13.6 Follow-up: most-specific sidebar active state (2026-10-03)

After the migration, prefix matching made every ancestor look active: the module
`Overview` lit up on every page inside the module (all resources now share the
module prefix), and `Spatial Inventory` lit up alongside `Inventory Builder`.

Fix: [`apps/web/lib/navigation/active-route.ts`](../../apps/web/lib/navigation/active-route.ts)
resolves the **single most specific** navigation entry for the current path;
`NavigationProvider` exposes it as `activeHref`, and the sidebar item, accordion,
pinned, and favorites/recent widgets compare against it instead of doing their
own prefix tests. Detail routes still light their list entry because the list
href is the longest configured prefix.

Verified live on the running app: `/inventory/spatial/builder` highlights only
`Inventory Builder`, `/inventory` only `Overview`, and `/inventory/components`
only `Components Catalog`. Unit coverage lives in `navigation-conventions.spec.ts`
(25 navigation tests; whole web suite 1458 tests).

### 13.7 Follow-up: nested group URLs (2026-10-03)

Nested navigation groups now nest their URLs, using the MRP group as the
pattern: the group base path is its default child, remaining children sit one
segment beneath it, and compound child names are a single hyphenated segment.

| Group                      | Canonical paths                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Warehouses & Storage       | `/inventory/locations`, `/inventory/locations/spatial`, `/inventory/locations/spatial-builder`, `/inventory/locations/spatial-models`, `/inventory/locations/policies`                      |
| Stock Counts & Adjustments | `/inventory/stock-counts`, `/inventory/stock-counts/cycle-counts`, `/inventory/stock-counts/adjustments`                                                                                    |
| Traceability & Allocations | `/inventory/batches`, `/inventory/batches/serials`, `/inventory/batches/reservations`, `/inventory/batches/projections`                                                                     |
| Master Data                | `/inventory/categories`, `/inventory/categories/manufacturers`, `/inventory/categories/units`, `/inventory/categories/attributes`                                                           |
| MRP & Material Planning    | `/manufacturing/mrp`, `/manufacturing/mrp/runs`, `/manufacturing/mrp/materials`, `/manufacturing/mrp/purchases`, `/manufacturing/mrp/production`, `/manufacturing/mrp/capacity` (unchanged) |

Static child segments (`spatial`, `policies`, `serials`, …) take precedence over
the sibling `[id]` route, and record ids are UUIDs, so no detail route is
shadowed. Every previous path — both the pre-refactor roots (`/spatial`,
`/manufacturers`, …) and the intermediate domain paths (`/inventory/spatial`,
`/inventory/manufacturers`, …) — has a one-hop 308 redirect to the final path,
with query strings preserved (verified live on a production build). The redirect
map and navigation tests were updated together; the nav suite remains green.

### 13.8 Follow-up: Master Data namespace (2026-10-03)

Master Data groups now use a shared `/module/master/<type>` namespace:

| Module      | Canonical paths                                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Inventory   | `/inventory/master/categories`, `/inventory/master/manufacturers`, `/inventory/master/units`, `/inventory/master/attributes` |
| Procurement | `/procurement/master/suppliers`                                                                                              |

`/inventory/master` and `/procurement/master` are thin redirect pages to their
default child. Every previous path (`/categories`, `/manufacturers`, `/units`,
`/attributes`, `/suppliers`, `/inventory/categories[/…]`, `/inventory/units`,
`/inventory/attributes`, `/procurement/suppliers`) has a one-hop 308 to the final
path, with query strings and detail ids preserved (verified live on a production
build). Navigation hrefs, command-palette actions, cross-module links (goods
receipts, purchase invoices, POs, data packs, attribute tooling), the inventory
and procurement search providers, and the source-reading specs were updated in
the same pass; the navigation suite remains green.

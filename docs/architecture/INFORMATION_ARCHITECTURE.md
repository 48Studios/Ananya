# Information Architecture (IA) & Navigation Specification

**Target Platform**: Ananya ERP (`@ananya/web` & `@ananya/api`)  
**Sprint**: RC1 Stabilization Sprint — Major Architectural Milestone  
**Status**: Implemented & Production Ready

---

## 1. Navigation Philosophy

Ananya ERP is an enterprise operations system designed for high-density workflow efficiency. Previous navigation versions structured menus around source code packages rather than real-world operational tasks. The **Information Architecture (IA) Refactor** aligns application navigation directly with business user mental models and operational workflows.

### Core Principles

1. **Zero Primary Rail Scrolling**: The primary left module navigation rail is strictly capped at **7 primary modules**, ensuring zero vertical scrolling across standard desktop displays (1080p, 13"-16" screens).
2. **Workflow-Based Grouping**: Related operational tasks belong together in a single domain. For example, stock balances, storage locations, internal transfers, cycle counts, and lot traceability are unified inside **Inventory**.
3. **Contextual Master Data**: Master data tables (Categories, Manufacturers, Units, Locations, Suppliers) reside contextually within their parent domain workspace rather than being isolated into an abstract global master data app.
4. **Dedicated Analytics & Reporting**: Operational modules focus purely on transactional execution. All analytics, domain reports, exports, and saved views are centralized in **Analytics**.
5. **Clean Administrative Scope**: **Administration** strictly contains organization-level governance (Users, Roles, Security, Workflows, Audit Explorer). Personal user preferences and account controls reside in the top header User Profile menu.

---

## 2. Primary Navigation Modules (7-Module Specification)

```
+---------------------------------------------------------------------------------------+
| Primary Module    | Default Route | Core Business Scope                              |
+-------------------+---------------+--------------------------------------------------+
| 🏠 Dashboard      | /dashboard    | Workspace overview, KPI stat grid, activity feed |
| 📦 Inventory      | /inventory    | Components, stock, warehouses, transfers, counts |
| 🛒 Procurement    | /procurement  | Purchase orders, receiving, invoices, suppliers  |
| 🏭 Manufacturing  | /manufacturing| BOMs, production orders, work orders, MRP        |
| 📁 Projects       | /projects     | Projects, tasks, timesheets, service, warranty   |
| 📊 Analytics      | /reports      | Reports hub, inventory/PO/mfg analytics, exports |
| ⚙ Administration | /settings     | Organization profile, users, roles, audit logs   |
+---------------------------------------------------------------------------------------+
```

---

## 3. Detailed Module Breakdown & Submenu Trees

### 3.1 🏠 Dashboard (`dashboard`)

- **Route**: `/dashboard` (the root `/` permanently redirects here, preserving the installed-PWA `start_url`)
- **Scope**: Platform landing page, high-level operational metrics, activity feed, pinned shortcuts.
- **Workspace Navigation Tree**:
  - `Overview` (`/dashboard`)
  - `Operational Activity` (`/dashboard/activity`)
  - `Notification Center` (`/notifications`)

### 3.2 📦 Inventory Workspace (`inventory`)

- **Default Route**: `/inventory`
- **Permissions**: `Inventory.Read`
- **Quick Actions**: `New Component` (`/inventory/components/new`), `Receive Stock` (`/procurement/goods-receipts/new`), `Issue Stock` (`/inventory/stock-adjustments`), `Transfer Stock` (`/inventory/warehouse-transfers/new`)
- **Workspace Navigation Tree**:
  - `Overview` (`/inventory`)
  - `Components Catalog` (`/inventory/components`)
  - `Ledger & Stock Movements` (`/inventory/transactions`)
  - `Warehouses & Storage` (`/inventory/locations` — Submenu: Storage Locations & Bins (`/inventory/locations`), Spatial Inventory (`/inventory/locations/spatial`), Inventory Builder (`/inventory/locations/spatial-builder`), Spatial Models & Anchors (`/inventory/locations/spatial-models`), Storage Policies (`/inventory/locations/policies`))
  - `Internal Transfers` (`/inventory/warehouse-transfers`)
  - `Stock Counts & Adjustments` (`/inventory/stock-counts` — Submenu: Physical Stock Counts (`/inventory/stock-counts`), ABC Cycle Counts (`/inventory/stock-counts/cycle-counts`), Quantity Adjustments (`/inventory/stock-counts/adjustments`))
  - `Traceability & Allocations` (`/inventory/batches` — Submenu: Batches & Lots (`/inventory/batches`), Serial Numbers (`/inventory/batches/serials`), Stock Reservations (`/inventory/batches/reservations`), Demand Projections (`/inventory/batches/projections`))
  - `Barcode & QR Studio` (`/inventory/barcodes`)
  - `Master Data` (`/inventory/master/categories` — Submenu: Categories (`/inventory/master/categories`), Manufacturers (`/inventory/master/manufacturers`), Units of Measure (`/inventory/master/units`), Attribute Library (`/inventory/master/attributes`))

### 3.3 🛒 Procurement Workspace (`procurement`)

- **Default Route**: `/procurement`
- **Permissions**: `PurchaseOrders.Read`
- **Quick Actions**: `Create Purchase Order` (`/procurement/purchase-orders/new`)
- **Workspace Navigation Tree**:
  - `Overview` (`/procurement`)
  - `Purchase Orders` (`/procurement/purchase-orders`)
  - `Goods Receipts` (`/procurement/goods-receipts`)
  - `Purchase Invoices` (`/procurement/purchase-invoices`)
  - `Supplier Returns` (`/procurement/supplier-returns`)
  - `Master Data` (`/procurement/master/suppliers` — Submenu: Suppliers Directory)

### 3.4 🏭 Manufacturing Workspace (`manufacturing`)

- **Default Route**: `/manufacturing`
- **Permissions**: `BOM.Read`
- **Quick Actions**: `New BOM` (`/manufacturing/boms/new`)
- **Workspace Navigation Tree**:
  - `Overview` (`/manufacturing`)
  - `Bills of Materials (BOM)` (`/manufacturing/boms`)
  - `Production Orders` (`/manufacturing/production-orders`)
  - `Work Orders` (`/manufacturing/work-orders`)
  - `Material Consumption` (`/manufacturing/material-consumption`)
  - `Finished Goods` (`/manufacturing/finished-goods`)
  - `Equipment Maintenance` (`/manufacturing/maintenance`)
  - `MRP & Material Planning` (`/manufacturing/mrp` — Submenu: Planning Overview, Planning Runs, Material Shortages, Purchase Recommendations, Production Recommendations, Capacity Planning)

### 3.5 📁 Projects & Services Workspace (`projects`)

- **Default Route**: `/projects`
- **Permissions**: `Projects.Read`
- **Workspace Navigation Tree**:
  - `Projects` (`/projects`)
  - `Tasks` (`/projects/tasks`)
  - `Timesheets` (`/projects/time`)
  - `Service Requests` (`/projects/service`)
  - `Warranty Tracking` (`/projects/warranty`)
  - `RMA Returns` (`/projects/rma`)

### 3.6 📊 Analytics Destination (`analytics`)

- **Default Route**: `/reports`
- **Permissions**: `Reports.Read`
- **Workspace Navigation Tree**:
  - `Reports Hub` (`/reports`)
  - `Inventory Reports` (`/reports/inventory`)
  - `Procurement Reports` (`/reports/procurement`)
  - `Manufacturing Reports` (`/reports/manufacturing`)
  - `Project Reports` (`/reports/projects`)
  - `Transaction Reports` (`/reports/transactions`)

### 3.7 ⚙ Administration Hub (`settings`)

- **Default Route**: `/settings`
- **Permissions**: `Administration.Security`
- **Workspace Navigation Tree**:
  - `Organization Profile` (`/settings`)
  - `ML & Intelligence` (`/settings/intelligence`, requires `Administration.Roles`)
  - `Users Directory` (`/settings/users`)
  - `Roles & Permissions` (`/settings/roles`)
  - `Workflow Automation` (`/settings/workflows`)
  - `Data Operations & Imports` (`/settings/data-operations`)
  - `Data Packs & Extensions` (`/settings/data-packs`)
  - `Audit Explorer` (`/settings/audit`)

---

## 4. Top Header & User Profile Integration

Personal user controls are decoupled from system administration and centralized in the top header User Profile dropdown:

- **My Profile** (`/profile`): User account details, contact info, password change.
- **Notification Center** (`/notifications`): System notifications and workflow alerts.
- **Audit Log** (`/settings/audit`): Security audit trail and session events.
- **Appearance Mode**: Instant Light/Dark theme switcher toggle.
- **Sign Out**: Secure session destruction and redirect to `/login`.

---

## 5. Favorites & Recent Sidebar Mechanics

The top of the contextual sidebar features a dynamic `SidebarFavoritesRecent` widget:

- ⭐ **Favorites**: Users can pin/unpin any frequently visited route. Favorites persist in `localStorage` under `ananya_pinned_items`.
- 🕒 **Recent**: Automatically tracks up to 5 recently visited ERP routes (excluding auth/setup paths). Persists in `localStorage` under `ananya_recent_items`.

---

## 6. Workflow Breadcrumb Architecture

Breadcrumbs dynamically compute semantic business hierarchy rather than URL segments:

- **Example**: Visiting `/inventory/manufacturers` generates:  
  `Inventory` > `Master Data` > `Manufacturers`
- **Example**: Visiting `/manufacturing/mrp/runs` generates:  
  `Manufacturing` > `MRP & Material Planning` > `Planning Runs`

---

## 7. Domain-Prefixed Routing & Compatibility

Every authenticated resource page lives under a domain root that matches its module id and default route. This keeps URLs, the sidebar tree, breadcrumbs, and the API permission categories aligned.

| Domain root      | Canonical resources (examples)                                                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/dashboard`     | overview, `/dashboard/activity`                                                                                                                                                                                           |
| `/inventory`     | components, transactions, locations, spatial, transfers, stock counts, cycle counts, adjustments, batches, serials, reservations, projections, barcodes, categories, manufacturers, units, attributes, warehouse policies |
| `/procurement`   | purchase orders, goods receipts, purchase invoices, supplier returns, suppliers                                                                                                                                           |
| `/manufacturing` | BOMs, production orders, work orders, material consumption, finished goods, maintenance, MRP, traceability                                                                                                                |
| `/projects`      | projects, tasks, timesheets, service requests, warranty, RMA                                                                                                                                                              |
| `/reports`       | reports hub and the five domain report pages (Analytics)                                                                                                                                                                  |
| `/settings`      | organization profile, ML & intelligence, users, roles, workflows, data operations, data packs, audit                                                                                                                      |
| `/sales`         | sales dashboard, CRM, customers, leads, opportunities, quotations, orders, fulfillment, customer returns                                                                                                                  |
| `/finance`       | finance summary, chart of accounts, journal entries, payables, receivables, payments, bank accounts, bank reconciliation                                                                                                  |

Conventions:

1. **Detail pages** use `/<domain>/<resource>/[id]` with opaque record ids (no slugs).
2. **Creation pages** use a static `/new` segment, e.g. `/inventory/components/new`, `/procurement/purchase-orders/new`. Static `new` takes precedence over the sibling `[id]` route, and query prefill is preserved (`?sku=`, `?poId=`).
3. **The stock ledger has no create route.** Movement records originate from domain operations (receipts, transfers, adjustments, work orders); `/inventory/transactions` is a read-only audit trail, and the legacy `/transactions/new` redirects to it.
4. **Query-driven state** keeps its existing parameter names (`?location=`, `?view=`, `?from=`, `?expired=`, `?token=`); tabs and filters remain component state.
5. **Compatibility redirects**: every previous path permanently (308) redirects to its canonical successor, preserving path parameters and query strings. The authoritative map lives in [`apps/web/lib/navigation/legacy-redirects.ts`](../../apps/web/lib/navigation/legacy-redirects.ts) and is asserted by `navigation-conventions.spec.ts`.
6. **Nested groups nest their URLs.** An accordion group's base path is its default child, and the remaining children live one segment beneath it, exactly like `MRP & Material Planning` (`/manufacturing/mrp`, `/manufacturing/mrp/runs`): `Warehouses & Storage` → `/inventory/locations`, `/inventory/locations/spatial`, `/inventory/locations/spatial-builder`, `/inventory/locations/spatial-models`, `/inventory/locations/policies`; `Stock Counts & Adjustments` → `/inventory/stock-counts`, `/inventory/stock-counts/cycle-counts`, `/inventory/stock-counts/adjustments`; `Traceability & Allocations` → `/inventory/batches`, `/inventory/batches/serials`, `/inventory/batches/reservations`, `/inventory/batches/projections`. Compound child names use one hyphenated segment (`spatial-builder`), not extra path depth.
7. **Master Data groups use `/module/master/<type>`.** `Master Data` is a shared namespace in every module that has one: `/inventory/master/categories`, `/inventory/master/manufacturers`, `/inventory/master/units`, `/inventory/master/attributes`, and `/procurement/master/suppliers`. `/inventory/master` and `/procurement/master` redirect to their default child.
8. **`/activities` is intentionally retained** at its current path: the audit could not confirm it is the CRM activities page (its implementation is a fixture-backed system log), so it is not merged with `/dashboard/activity` or the reserved `/sales/activities`.
9. **Sales and Finance are URL namespaces, not rail modules.** They stay out of the primary navigation until their functionality, permissions, and API-backed product intent justify a module.

---

## 8. Future Expansion Strategy

Should future modules be introduced to Ananya ERP (e.g., Quality Management, Sales & Distribution, Field Service), they must be incorporated into the existing 7 primary module domains as sub-workspaces or accordion groups rather than expanding the left navigation rail beyond 7 items. A domain may exist as a URL namespace (as `/sales` and `/finance` do) before it earns a rail module.

---

## 9. Layout Architecture & Single Shell Principle

Ananya ERP strictly adheres to the **Single Shell Principle**:

- **Global Application Shell**: Managed strictly by `RootLayout` (`app/layout.tsx`) wrapping `DashboardLayout` (`components/dashboard-layout.tsx`).
- **Global Chrome Ownership**:
  - `NavigationRail`: Primary 7-module vertical navigation rail.
  - `ContextSidebar`: Secondary module workspace tree + ⭐ Favorites & 🕒 Recent widget.
  - `TopHeader`: Semantic breadcrumbs, Barcode Scan trigger, Quick Actions, System Notifications, Theme Switcher, and User Profile menu.
  - `CommandPalette`: Global search and shortcut engine (`⌘K`).
  - `AppFooter`: Global copyright & system version footer.
- **Strict Composition Hierarchy**:
  ```
  App -> Authenticated Layout (DashboardLayout) -> Page -> Section -> Card -> Content
  ```
- **Page Rules**:
  - NO page inside `app/` may render `DashboardLayout` or import global chrome components (`TopHeader`, `ContextSidebar`, `NavigationRail`, `NavigationProvider`).
  - NO page inside `app/` may render in-page breadcrumbs or duplicate navigation landmarks; breadcrumb navigation is owned exclusively by `TopHeader`.
  - Every page renders standardized primitives (`PageHeader`, `StatCard`, `SectionHeader`, etc.) inside the container provided by `DashboardLayout`.

---

**End of Information Architecture Document**

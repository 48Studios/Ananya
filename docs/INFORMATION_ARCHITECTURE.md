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
| 🏠 Dashboard      | /             | Workspace overview, KPI stat grid, activity feed |
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

- **Route**: `/`
- **Scope**: Platform landing page, high-level operational metrics, activity feed, pinned shortcuts.

### 3.2 📦 Inventory Workspace (`inventory`)

- **Default Route**: `/inventory`
- **Permissions**: `Inventory.Read`
- **Quick Actions**: `New Component` (`/components/new`), `Receive Stock` (`/goods-receipts/new`), `Issue Stock` (`/transactions/new`), `Transfer Stock` (`/warehouse-transfers/new`)
- **Workspace Navigation Tree**:
  - `Overview` (`/inventory`)
  - `Components Catalog` (`/components`)
  - `Ledger & Stock Movements` (`/transactions`)
  - `Warehouses & Storage` (`/warehouses` — Submenu: Facilities Directory, Storage Bins, Storage Policies, Locations Directory)
  - `Internal Transfers` (`/warehouse-transfers`)
  - `Stock Counts & Adjustments` (`/stock-counts` — Submenu: Physical Stock Counts, ABC Cycle Counts, Quantity Adjustments)
  - `Traceability & Allocations` (`/batches` — Submenu: Batches & Lots, Serial Numbers, Stock Reservations, Demand Projections)
  - `Barcode & QR Studio` (`/barcodes`)
  - `Master Data` (`/categories` — Submenu: Categories, Manufacturers, Units of Measure)

### 3.3 🛒 Procurement Workspace (`procurement`)

- **Default Route**: `/procurement`
- **Permissions**: `Procurement.Read`
- **Quick Actions**: `Create Purchase Order` (`/purchase-orders/new`)
- **Workspace Navigation Tree**:
  - `Overview` (`/procurement`)
  - `Purchase Orders` (`/purchase-orders`)
  - `Goods Receipts` (`/goods-receipts`)
  - `Purchase Invoices` (`/purchase-invoices`)
  - `Supplier Returns` (`/supplier-returns`)
  - `Master Data` (`/suppliers` — Submenu: Suppliers Directory)

### 3.4 🏭 Manufacturing Workspace (`manufacturing`)

- **Default Route**: `/manufacturing`
- **Permissions**: `Manufacturing.Read`
- **Quick Actions**: `New BOM` (`/boms/new`)
- **Workspace Navigation Tree**:
  - `Overview` (`/manufacturing`)
  - `Bills of Materials (BOM)` (`/boms`)
  - `Production Orders` (`/production-orders`)
  - `Work Orders` (`/work-orders`)
  - `Material Consumption` (`/material-consumption`)
  - `Finished Goods` (`/finished-goods`)
  - `MRP & Material Planning` (`/mrp` — Submenu: Planning Overview, Planning Runs, Material Shortages, Purchase Recommendations, Production Recommendations, Capacity Planning)

### 3.5 📁 Projects & Services Workspace (`projects`)

- **Default Route**: `/projects`
- **Permissions**: `Projects.Read`
- **Workspace Navigation Tree**:
  - `Projects` (`/projects`)
  - `Tasks` (`/tasks`)
  - `Timesheets` (`/time`)
  - `Service Requests` (`/service`)
  - `Equipment Maintenance` (`/maintenance`)
  - `Warranty Tracking` (`/warranty`)
  - `RMA Returns` (`/rma`)

### 3.6 📊 Analytics Destination (`analytics`)

- **Default Route**: `/reports`
- **Permissions**: `Reporting.Read`
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
  - `Users Directory` (`/users`)
  - `Roles & Permissions` (`/roles`)
  - `Workflow Automation` (`/workflows`)
  - `Activity Center` (`/activity`)
  - `Audit Explorer` (`/audit`)
  - `Security Audit Log` (`/settings/security`)

---

## 4. Top Header & User Profile Integration

Personal user controls are decoupled from system administration and centralized in the top header User Profile dropdown:

- **My Profile** (`/profile`): User account details, contact info, password change.
- **Notification Center** (`/notifications`): System notifications and workflow alerts.
- **Security Sessions** (`/settings/security`): Active user session tokens and devices.
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

- **Example**: Visiting `/manufacturers` generates:  
  `Inventory` > `Master Data` > `Manufacturers`
- **Example**: Visiting `/mrp/runs` generates:  
  `Manufacturing` > `MRP & Material Planning` > `Planning Runs`

---

## 7. Future Expansion Strategy

Should future modules be introduced to Ananya ERP (e.g., Quality Management, Sales & Distribution, Field Service), they must be incorporated into the existing 7 primary module domains as sub-workspaces or accordion groups rather than expanding the left navigation rail beyond 7 items.

---

## 7. Layout Architecture & Single Shell Principle

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

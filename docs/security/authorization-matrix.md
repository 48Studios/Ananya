# Ananya ERP — Complete Authorization & Access Matrix

**Document Version:** 2.0  
**Phase:** Phase 3 Authorization & Object-Level Remediation  
**Date:** September 2026  
**Status:** Remediated & Verified  

---

## 1. Executive Summary & Authorization Architecture

Ananya ERP employs a four-layer fail-closed defense-in-depth authorization architecture:
1. **Layer 1: Global Authentication Perimeter (`AuthGuard`)**  
   Registered globally as `APP_GUARD` in `apps/api/src/auth/auth.module.ts`. Every endpoint requires a valid database session token via `Authorization: Bearer <session-token>` unless explicitly decorated with `@Public()`.
2. **Layer 2: Route-Level RBAC Guards (`createPermissionGuard`)**  
   Route-level guards evaluated at controller/method level, verifying that `req.user.permissions` contains the required permission string or wildcard `*`.
3. **Layer 3: In-Service Business & Role Authorization**  
   Programmatic verification for high-risk operations (e.g. self-approval prevention on time entries, checking `req.user.roleName === 'Administrator'` for organization reset, restricting wildcard permission grants).
4. **Layer 4: Authoritative Identity Attribution & Object Ownership (BOLA/IDOR Defense)**  
   Identity and actor attribution are authoritatively bound to `req.user.id` on the server. Client-supplied `userId`, `actorId`, `createdBy`, and `approverId` values are ignored/rejected for actor identification.

---

## 2. Roles, Hierarchy & System Permissions

### 2.1 Seeded System Roles

| Role Name | System Role? | Wildcard (`*`) | Key Capabilities |
| :--- | :---: | :---: | :--- |
| **Administrator** | Yes | Yes (`*`) | Root authority across all domains, user administration, role management, system settings, destructive resets. |
| **Inventory Manager** | Yes | No | Full CRUD on components, categories, stock adjustments, counts, locations, units. |
| **Warehouse Operator** | Yes | No | View inventory, goods receipts, transfer execution. |
| **Purchasing Agent** | Yes | No | Full access to suppliers, purchase orders, goods receipts, procurement reports. |
| **Manufacturing Lead**| Yes | No | BOM definitions and revisions, work order management, production execution. |
| **Project Manager** | Yes | No | Projects, task allocation, cross-user time entry creation and approval. |
| **Auditor** | Yes | No | Read-only analytics and `Administration.Security` for security audit trails. |
| **Standard User / Operator** | No | No | Self-service time entries, personal dashboard and preferences, notifications. |

### 2.2 Domain Permissions Catalog

* **Administration:** `Administration.Users`, `Administration.Roles`, `Administration.Security`, `Administration.Settings`
* **Inventory:** `Inventory.Read`, `Inventory.Create`, `Inventory.Update`, `Inventory.Delete`, `Inventory.Adjust`, `Inventory.Transfer`, `Inventory.Reserve`
* **Attributes:** `Attributes.Read`, `Attributes.Create`, `Attributes.Update`, `Attributes.Delete`
* **Documents:** `Documents.Read`, `Documents.Create`, `Documents.Delete`
* **BOM:** `BOM.Read`, `BOM.Manage`
* **Work Orders:** `WorkOrders.Read`, `WorkOrders.Manage`, `Manufacturing.Execute`
* **Purchase Orders:** `PurchaseOrders.Read`, `PurchaseOrders.Create`, `PurchaseOrders.Update`, `PurchaseOrders.Approve`, `GoodsReceipts.Receive`
* **Projects:** `Projects.Read`, `Projects.Manage`, `Projects.Allocate`
* **Reports:** `Reports.Read`, `Reports.Export`
* **ML:** `ML.Read`, `ML.Manage`

---

## 3. Comprehensive Controller Authorization Matrix

The table below catalogs key controllers, endpoint routes, required authentication, permission guards, ownership validation, tenant boundaries, and Phase 3 remediation status:

| Controller | Route Prefix | Auth Req? | Route Guard / Permission | Ownership & Identity Check | Phase 3 Status |
| :--- | :--- | :---: | :--- | :---: | :--- |
| **AppController** | `/` | Yes (except `/health`) | Public: `GET /health` | N/A | Remediated (Phase 1) |
| **AuthController** | `/auth` | Hybrid | Mixed: `@Public()` on login, reset-pw, invite accept/verify. Protected: `POST /auth/invitations` (`Administration.Users`). | Session token | Remediated (Phase 1 & 2) |
| **UsersController** | `/users` | Yes | `createPermissionGuard('Administration.Users')` | Admin only; session revocation on reset | Remediated (Phase 1 & 2) |
| **RolesController** | `/roles` | Yes | `createPermissionGuard('Administration.Roles')` | System role & wildcard protection | Remediated (Phase 1 & 2) |
| **SecurityAuditController**| `/security-audit` | Yes | `createPermissionGuard('Administration.Security')` | Auditor/Admin only; tokens masked | Remediated (Phase 1 & 2) |
| **SettingsController** | `/settings` | Yes | `Administration.Settings` on all mutations (`PUT /organization`, `PUT /system`, `PUT /numbering`, `PATCH /feature-flags`). Reset: `Administration.Roles` + admin role check. | Server-side caller identity | **REMEDIATED (Phase 3C)** |
| **PreferencesController** | `/preferences` | Yes | Authenticated Session (`AuthGuard`) | Strictly bound to `req.user.id`. Client `userId` param removed. | **REMEDIATED (Phase 3A)** |
| **NotificationsController**| `/notifications` | Yes | Authenticated Session (`AuthGuard`) | Strictly bound to `req.user.id`. Recipient check on read. | **REMEDIATED (Phase 3A)** |
| **TimeEntriesController** | `/time-entries` | Yes | Authenticated Session (`AuthGuard`) | Actor bound to `req.user.id`. Cross-user logging restricted to managers. Self-approval blocked. | **REMEDIATED (Phase 3A)** |
| **InventoryTransactionsController**| `/inventory-transactions`| Yes | `Inventory.Update` (POST), `Inventory.Read` (GET) | `createdBy` authoritatively bound to `req.user.id`. | **REMEDIATED (Phase 3A)** |
| **SearchController** | `/search` | Yes | Authenticated Session (`AuthGuard`) | `AdministrationSearchProvider` partitioned; requires admin permissions. | **REMEDIATED (Phase 3F)** |
| **ImportExportController** | `/import-export` | Yes | Partitioned by entity: `User` $\to$ `Administration.Users`, `Role` $\to$ `Administration.Roles`, `BOM` $\to$ `BOM.Manage`, `PO` $\to$ `PurchaseOrders.Update`, `Component` $\to$ `Inventory.Update`. Fail closed on unknown. | Jobs restricted to caller unless admin. | **REMEDIATED (Phase 3B)** |
| **BulkActionsController** | `/import-export` | Yes | Entity-specific: `Administration.Roles`, `PurchaseOrders.Update`, `BOM.Manage`, `WorkOrders.Manage`, `Inventory.Delete`/`Update`. Fail closed on unknown. | Batch size capped $\le 100$. | **REMEDIATED (Phase 3H)** |
| **PurchaseOrdersController**| `/purchase-orders` | Yes | `PurchaseOrders.Read` (GET), `PurchaseOrders.Create` (POST), `PurchaseOrders.Update` (PUT/PATCH/lines/submit/cancel), `PurchaseOrders.Approve` (approve/issue). | Route guards active | **REMEDIATED (Phase 3D)** |
| **BomsController** | `/boms` | Yes | `BOM.Read` (GET), `BOM.Manage` (POST/PUT/DELETE/lines/release/obsolete). | Route guards active | **REMEDIATED (Phase 3D)** |
| **WorkOrdersController** | `/work-orders` | Yes | `WorkOrders.Manage` (POST/assign/start/pause/hours/complete/cancel/GET). | Route guards active | **REMEDIATED (Phase 3D)** |
| **SuppliersController** | `/suppliers` | Yes | `PurchaseOrders.Read` (GET), `PurchaseOrders.Create` (POST), `PurchaseOrders.Update` (PUT/DELETE/contacts/components). | Route guards active | **REMEDIATED (Phase 3D)** |
| **CategoriesController** | `/categories` | Yes | `Inventory.Read` (GET), `Inventory.Create` (POST), `Inventory.Update` (PUT), `Inventory.Delete` (DELETE). | Route guards active | **REMEDIATED (Phase 3D)** |
| **LocationsController** | `/locations` | Yes | `Inventory.Read` (GET), `Inventory.Create` (POST), `Inventory.Update` (PUT), `Inventory.Delete` (DELETE). | Route guards active | **REMEDIATED (Phase 3D)** |
| **ComponentsController** | `/components` | Yes | `Inventory.Read` (GET), `Inventory.Create` (POST), `Inventory.Update` (PATCH), `Inventory.Delete` (DELETE) | Route guards active | Remediated (Phase 2) |
| **AttributesController** | `/attributes` | Yes | `Attributes.Read` (GET), `Attributes.Create` (POST), `Attributes.Update` (PUT/PATCH), `Attributes.Delete` (DELETE) | Route guards active | Remediated (Phase 2) |
| **DocumentsController** | `/documents` | Yes | `Documents.Read` (GET), `Documents.Create` (POST), `Documents.Delete` (DELETE) | Path traversal protection | Remediated (Phase 2) |
| **MlController** | `/ml` | Yes (except `/ml/health`) | Public: `GET /ml/health`. Protected: `ML.Read` (GET), `ML.Manage` (POST) | Internal network isolation | Remediated (Phase 1 & 2) |

---

## 4. Multi-Tenancy & Data Isolation Model

* **Architecture:** Dedicated single-organization instance per deployment.
* **Database Isolation:** Database schema intentionally does not include `tenant_id` or `organization_id` on entity tables; multi-tenancy is established at the container and database level.
* **Cross-User Data Separation:** User-scoped entities (preferences, notifications, time-entry visibility) enforce row-level ownership based on authenticated `req.user.id`.

---

## 5. Object-Level & Ownership Authorization (BOLA/IDOR) Defense

| Domain | Prior Vulnerability Pattern | Remediated Implementation | Verification Test |
| :--- | :--- | :--- | :--- |
| **User Preferences** | Accepted `?userId=<uuid>` query param and fell back to `users.limit(1)`. | Removed `?userId=`. Strictly derive identity from `req.user.id`. Validates UUID. | `security-remediation.integration-spec.ts` & `preferences.controller.spec.ts` |
| **Notifications** | Accepted `?userId=<uuid>`, fell back to `users.limit(1)`, and allowed reading any notification. | Bound to `req.user.id`. `markAsRead` verifies `where(and(eq(id), eq(userId)))`, throwing 404 on mismatch. | `security-remediation.integration-spec.ts` & `notifications.controller.spec.ts` |
| **Time Tracking** | Client-supplied `userId` and `approverId`. Allowed unauthorized logging and forged supervisor approval. | Actor identity derived from `req.user.id`. Cross-user logging requires `Projects.Manage` or `Administrator`. Self-approval prohibited. Approver bound to session. | `time-entries.controller.spec.ts` |
| **Inventory Ledger** | Client-supplied `createdBy` allowed spoofing ledger audit attribution. | `createdBy` is authoritatively bound to `req.user.id` on server. | `inventory-transactions.controller.spec.ts` |
| **Data Importers** | Single broad permission allowed importing `User` and `Role` records. | Explicit entity-based partitioning (`User` $\to$ `Administration.Users`, `Role` $\to$ `Administration.Roles`). Fails closed on unknown entities. | `import-export.controller.spec.ts` |
| **Global Search** | Unauthenticated ordinary users could enumerate users and roles. | `AdministrationSearchProvider` filtered out unless caller holds administrative permissions. | `security-remediation.integration-spec.ts` |

---

## 6. Phase 3.5 — Operational & Business Domain Controller Matrix

The table below catalogs the remaining operational domain controllers comprehensively guarded in Phase 3.5:

| Domain | Controller | Route Prefix | Queries (GET) | Mutations (POST / PUT / PATCH / DELETE) | Guard Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Accounting** | `AccountsController` | `/accounts` | `Accounting.Read` | `Accounting.Create`, `Accounting.Update` (activate/deactivate) | **REMEDIATED (Phase 3.5)** |
| **Accounting** | `JournalEntriesController` | `/journal-entries` | `Accounting.Read` | `Accounting.Create` (draft/lines), `Accounting.Post` (post/reverse/void) | **REMEDIATED (Phase 3.5)** |
| **Accounting** | `PaymentsController` | `/payments` | `Accounting.Read` | `Accounting.Create` (draft), `Accounting.Post` (post/cancel) | **REMEDIATED (Phase 3.5)** |
| **Accounting** | `PayableInvoicesController` | `/payable-invoices` | `Accounting.Read` | `Accounting.Create` (draft), `Accounting.Post` (post/cancel) | **REMEDIATED (Phase 3.5)** |
| **Accounting** | `ReceivableInvoicesController` | `/receivable-invoices` | `Accounting.Read` | `Accounting.Create` (draft), `Accounting.Post` (post/cancel) | **REMEDIATED (Phase 3.5)** |
| **Accounting** | `BankReconciliationsController` | `/bank-reconciliations`| `Accounting.Read` | `Accounting.Create`, `Accounting.Update` (lines/match), `Accounting.Post` (complete) | **REMEDIATED (Phase 3.5)** |
| **Accounting** | `BankAccountsController` | `/bank-accounts` | `Accounting.Read` | N/A | **REMEDIATED (Phase 3.5)** |
| **Sales** | `SalesOrdersController` | `/sales-orders` | `Sales.Read` | `Sales.Create` (create/convert), `Sales.Update` (lines/approve/release/cancel) | **REMEDIATED (Phase 3.5)** |
| **Sales** | `CustomersController` | `/customers` | `Sales.Read` | `Sales.Create`, `Sales.Update` (activate/suspend/contacts/addresses) | **REMEDIATED (Phase 3.5)** |
| **Sales** | `CrmAccountsController` | `/crm-accounts` | `Sales.Read` | `Sales.Create`, `Sales.Update` (contacts/archive) | **REMEDIATED (Phase 3.5)** |
| **Sales** | `QuotationsController` | `/quotations` | `Sales.Read` | `Sales.Create`, `Sales.Update` (lines/send/accept/cancel) | **REMEDIATED (Phase 3.5)** |
| **Sales** | `LeadsController` | `/leads` | `Sales.Read` | `Sales.Create`, `Sales.Update` (assign/qualify/disqualify/convert) | **REMEDIATED (Phase 3.5)** |
| **Sales** | `OpportunitiesController` | `/opportunities` | `Sales.Read` | `Sales.Create`, `Sales.Update` (advance/win/lose) | **REMEDIATED (Phase 3.5)** |
| **Sales** | `CustomerReturnsController` | `/customer-returns` | `Sales.Read` | `Sales.Create`, `Sales.Update` (lines/approve/receive/inspect/restock/reject/close) | **REMEDIATED (Phase 3.5)** |
| **Sales** | `FulfillmentRequestsController`| `/fulfillment` | `Sales.Read` | `Sales.Create`, `Sales.Update` (lines/accept/pick/pack/ship/complete/cancel) | **REMEDIATED (Phase 3.5)** |
| **Sales** | `ActivitiesController` | `/activities` | `Sales.Read` | `Sales.Create`, `Sales.Update` (complete/cancel) | **REMEDIATED (Phase 3.5)** |
| **Sales** | `NotesController` | `/notes` | `Sales.Read` | `Sales.Create` | **REMEDIATED (Phase 3.5)** |
| **Service** | `MaintenanceSchedulesController`| `/maintenance-schedules`| `Maintenance.Read` | `Maintenance.Manage` (create/pause/resume/complete-visit/complete-plan/cancel) | **REMEDIATED (Phase 3.5)** |
| **Service** | `ServiceRequestsController` | `/service-requests` | `Maintenance.Read` | `Maintenance.Manage` (create/assign/diagnose/waiting-parts/start/complete/close/cancel) | **REMEDIATED (Phase 3.5)** |
| **Service** | `ServiceNotesController` | `/service-notes` | `Maintenance.Read` | `Maintenance.Manage` (create) | **REMEDIATED (Phase 3.5)** |
| **Service** | `WarrantyClaimsController` | `/warranty-claims` | `Maintenance.Read` | `Maintenance.Manage` (create/review/approve/reject) | **REMEDIATED (Phase 3.5)** |
| **Service** | `RmaRequestsController` | `/rma-requests` | `Maintenance.Read` | `Maintenance.Manage` (create/approve/receive/inspect/process/close/reject) | **REMEDIATED (Phase 3.5)** |
| **Procurement** | `GoodsReceiptsController` | `/goods-receipts` | `PurchaseOrders.Read` | `GoodsReceipts.Receive` (create/lines/post) | **REMEDIATED (Phase 3.5)** |
| **Procurement** | `PurchaseInvoicesController` | `/purchase-invoices` | `PurchaseOrders.Read` | `PurchaseOrders.Create`, `PurchaseOrders.Update` (lines/match/approve/pay/cancel/status) | **REMEDIATED (Phase 3.5)** |
| **Procurement** | `SupplierReturnsController` | `/supplier-returns` | `PurchaseOrders.Read` | `PurchaseOrders.Create`, `PurchaseOrders.Update` (lines/approve/dispatch/complete/cancel/update/delete) | **REMEDIATED (Phase 3.5)** |
| **Procurement** | `PurchaseRecommendationsController`| `/purchase-recommendations`| `PurchaseOrders.Read` | `PurchaseOrders.Create`, `PurchaseOrders.Update` (accept/reject/implement) | **REMEDIATED (Phase 3.5)** |
| **Procurement** | `ProcurementPoliciesController`| `/procurement-policies`| `PurchaseOrders.Read` | `PurchaseOrders.Update` (create) | **REMEDIATED (Phase 3.5)** |
| **Warehouse** | `StockAdjustmentsController` | `/stock-adjustments` | `Inventory.Read` | `Inventory.Adjust` (create/approve/cancel) | **REMEDIATED (Phase 3.5)** |
| **Warehouse** | `StockCountsController` | `/stock-counts` | `Inventory.Read` | `Inventory.Adjust` (create/assign/lines/submit/approve/post/cancel) | **REMEDIATED (Phase 3.5)** |
| **Warehouse** | `CycleCountsController` | `/cycle-counts` | `Inventory.Read` | `Inventory.Adjust` (create/update/delete/assign/start/record-counts/approve/cancel) | **REMEDIATED (Phase 3.5)** |
| **Warehouse** | `WarehouseTransfersController`| `/warehouse-transfers`| `Inventory.Read` | `Inventory.Transfer` (create/update/delete/lines/submit/dispatch/receive/cancel) | **REMEDIATED (Phase 3.5)** |
| **Warehouse** | `WarehousesController` | `/warehouses` | `Inventory.Read` | `Inventory.Update` (create/add-bin/update-bin) | **REMEDIATED (Phase 3.5)** |
| **Warehouse** | `WarehousePoliciesController`| `/warehouse-policies`| `Inventory.Read` | `Inventory.Update` (save-policy) | **REMEDIATED (Phase 3.5)** |
| **Warehouse** | `BatchesController` | `/batches` | `Inventory.Read` | `Inventory.Update` (create) | **REMEDIATED (Phase 3.5)** |
| **Warehouse** | `SerialsController` | `/serials` | `Inventory.Read` | `Inventory.Update` (create) | **REMEDIATED (Phase 3.5)** |
| **Warehouse** | `ReservationsController` | `/reservations` | `Inventory.Read` | `Inventory.Reserve` (create/update/fulfill/release/cancel/delete) | **REMEDIATED (Phase 3.5)** |
| **Warehouse** | `UnitsController` | `/units` | `Inventory.Read` | `Inventory.Create`, `Inventory.Update` (update/patch/delete) | **REMEDIATED (Phase 3.5)** |
| **Warehouse** | `ManufacturersController` | `/manufacturers` | `Inventory.Read` | `Inventory.Create`, `Inventory.Update` (update/delete) | **REMEDIATED (Phase 3.5)** |
| **Warehouse** | `BarcodesController` | `/barcodes` | `Inventory.Read` | `Inventory.Update` (generate/batch-labels) | **REMEDIATED (Phase 3.5)** |
| **Warehouse** | `InventoryProjectionsController`| `/inventory-projections`| `Inventory.Read` | `Inventory.Adjust` (rebuild) | **REMEDIATED (Phase 3.5)** |
| **Manufacturing**| `ProductionOrdersController` | `/production-orders` | `WorkOrders.Manage` | `WorkOrders.Manage` (release/start/pause/resume/close/cancel/delete), `Manufacturing.Execute` (record-output/record-scrap/complete) | **REMEDIATED (Phase 3.5)** |
| **Manufacturing**| `ProductionRecommendationsController`| `/production-recommendations`| `WorkOrders.Manage` | `WorkOrders.Manage` (create/accept/reject/implement) | **REMEDIATED (Phase 3.5)** |
| **Manufacturing**| `MaterialConsumptionsController`| `/material-consumptions`| `Manufacturing.Execute`| `Manufacturing.Execute` (create/lines/post) | **REMEDIATED (Phase 3.5)** |
| **Manufacturing**| `MaterialRequirementsController`| `/material-requirements`| `WorkOrders.Manage` | `WorkOrders.Manage` (create/calculate) | **REMEDIATED (Phase 3.5)** |
| **Manufacturing**| `CapacityPlansController` | `/capacity-plans` | `WorkOrders.Manage` | `WorkOrders.Manage` (create/calculate) | **REMEDIATED (Phase 3.5)** |
| **Manufacturing**| `PlanningRunsController` | `/planning-runs` | `WorkOrders.Manage` | `WorkOrders.Manage` (create/execute/cancel) | **REMEDIATED (Phase 3.5)** |
| **Manufacturing**| `PlanningMessagesController` | `/planning-messages` | `WorkOrders.Manage` | `WorkOrders.Manage` (create) | **REMEDIATED (Phase 3.5)** |
| **Manufacturing**| `FinishedGoodsController` | `/finished-goods` | `Manufacturing.Execute`| `Manufacturing.Execute` (create/lines/post) | **REMEDIATED (Phase 3.5)** |
| **Projects** | `ProjectsController` | `/projects` | `Projects.Read` | `Projects.Manage` (create/update/start/pause/complete/archive/cancel/milestones), `Projects.Allocate` (allocate/issue/return) | **REMEDIATED (Phase 3.5)** |
| **Projects** | `TasksController` | `/tasks` | `Projects.Read` | `Projects.Manage` (create/assign/start/block/complete/cancel) | **REMEDIATED (Phase 3.5)** |
| **Projects** | `ActivityController` | `/activity` | `Reports.Read`, `Administration.Security` (audit)| `Projects.Manage` (create) | **REMEDIATED (Phase 3.5)** |
| **Admin** | `DataPacksController` | `/data-packs` | `Administration.Settings` | `Administration.Settings` (install) | **REMEDIATED (Phase 3.5)** |
| **Admin** | `NotificationsController` | `/notifications` / `/workflows`| Scoped to session / `Administration.Settings` | `Administration.Users` (arbitrary notifications), `Administration.Settings` (workflows) | **REMEDIATED (Phase 3.5)** |


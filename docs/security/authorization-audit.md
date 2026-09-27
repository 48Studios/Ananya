# Ananya ERP — Authorization Completeness & Remediation Audit

**Document Version:** 2.0  
**Phase:** Phase 3 Authorization Completeness, IDOR/BOLA & Identity Attribution  
**Date:** September 2026  
**Auditor:** Antigravity Agentic Security Team  
**Scope:** Complete Codebase Authorization & Permissions Boundary Verification  

---

## 1. Global Authentication Guard Verification

### Verification Target
* `apps/api/src/auth/auth.guard.ts`
* `apps/api/src/auth/public.decorator.ts`
* `apps/api/src/auth/auth.module.ts`
* `apps/api/src/common/context/request-context.ts`

### Findings & Status: VERIFIED & FAIL-CLOSED
* `AuthGuard` is registered globally as `APP_GUARD` in `AuthModule`. Every incoming HTTP request enters `AuthGuard.canActivate()` prior to controller routing.
* Metadata inspection checks for `IS_PUBLIC_KEY` (`@Public()`). Only explicitly decorated handlers bypass authentication.
* Extracts the bearer token from `Authorization: Bearer <token>`.
* Validates token against database table `user_sessions`. Ensures session exists, is not expired (`expiresAt > now()`), and user account is `ACTIVE`.
* Attaches authenticated user identity (`req.user = { id, email, roleName, permissions }`) and sets asynchronous execution context via `RequestContext.run()`.
* **Negative Test Results:**
  - Anonymous request without token $\to$ `401 Unauthorized`.
  - Malformed/invalid token $\to$ `401 Unauthorized`.
  - Expired token $\to$ `401 Unauthorized`.
  - Revoked/deleted session token $\to$ `401 Unauthorized`.
  - Header/query parameter spoofing attempts (e.g. `x-user-id`, `?userId=`) cannot bypass `AuthGuard`.

---

## 2. Audit of Every @Public() Endpoint

A full repository scan identifies exactly 10 route handlers decorated with `@Public()`. No controllers are decorated with `@Public()` at the class level.

| Method | Route | Controller | Functional Justification | Safe? |
| :--- | :--- | :--- | :--- | :---: |
| `GET` | `/health` | `AppController` | Orchestration liveness and readiness probe. Exposes only service status and uptime. | **YES** |
| `POST` | `/auth/login` | `AuthController` | Primary credential authentication endpoint. Returns session token. | **YES** |
| `POST` | `/auth/reset-password-request` | `AuthController` | Initiates self-service password reset. Rate-limited, generates expiring token. | **YES** |
| `POST` | `/auth/reset-password` | `AuthController` | Consumes single-use reset token and invalidates active sessions. | **YES** |
| `GET` | `/auth/invitations/verify/:token` | `AuthController` | Validates token before displaying invite acceptance screen. | **YES** |
| `POST` | `/auth/invitations/accept` | `AuthController` | Consumes invitation token and establishes user account. | **YES** |
| `GET` | `/auth/setup-status` | `AuthController` | Returns boolean setup flag to frontend onboarding wizard. | **YES** |
| `GET` | `/auth/bootstrap-status` | `AuthController` | Backward-compatibility alias for `/auth/setup-status`. | **YES** |
| `POST` | `/auth/setup-organization` | `AuthController` | One-time root tenant initialization. Rejects execution once initialized. | **YES** |
| `GET` | `/ml/health` | `MlController` | Cluster readiness check for ML service. Read-only proxy. | **YES** |

---

## 3. PermissionGuard Fail-Closed Behavior Verification

### Verification Target
* `apps/api/src/auth/permission.guard.ts`
* `apps/api/src/permissions/permissions.service.ts`

### Findings & Status: VERIFIED
* If permission metadata is missing or malformed, guard fails closed $\to$ `403 Forbidden`.
* Missing `req.user` $\to$ `401 Unauthorized`.
* Empty permissions list without matching permission $\to$ `403 Forbidden`.
* Matches required permission against user permissions or wildcard (`*`).
* Database errors or unhandled exceptions re-throw (500) and never fail open.

---

## 4. Complete Controller Authorization Inventory

Across `apps/api/src`, 83 controller classes exist:
* **Guarded by Fine-Grained RBAC Guards:**
  - `UsersController` (`Administration.Users`)
  - `RolesController` (`Administration.Roles`)
  - `SecurityAuditController` (`Administration.Security`)
  - `SettingsController` (`Administration.Settings`, `Administration.Roles`)
  - `ComponentsController` (`Inventory.Read`, `Inventory.Create`, `Inventory.Update`, `Inventory.Delete`)
  - `AttributesController` (`Attributes.Read`, `Attributes.Create`, `Attributes.Update`, `Attributes.Delete`)
  - `DocumentsController` (`Documents.Read`, `Documents.Create`, `Documents.Delete`)
  - `PurchaseOrdersController` (`PurchaseOrders.Read`, `PurchaseOrders.Create`, `PurchaseOrders.Update`, `PurchaseOrders.Approve`)
  - `BomsController` (`BOM.Read`, `BOM.Manage`)
  - `WorkOrdersController` (`WorkOrders.Manage`)
  - `SuppliersController` (`PurchaseOrders.Read`, `PurchaseOrders.Create`, `PurchaseOrders.Update`)
  - `CategoriesController` (`Inventory.Read`, `Inventory.Create`, `Inventory.Update`, `Inventory.Delete`)
  - `LocationsController` (`Inventory.Read`, `Inventory.Create`, `Inventory.Update`, `Inventory.Delete`)
  - `InventoryTransactionsController` (`Inventory.Read`, `Inventory.Update`)
  - `MlController` (`ML.Read`, `ML.Manage`)
  - `ImportExportController` (Entity-partitioned permissions)
  - `BulkActionsController` (Entity-specific permissions)
* **Guarded by User Identity & Ownership Boundaries:**
  - `PreferencesController` (Strictly bound to `req.user.id`)
  - `NotificationsController` (Strictly bound to `req.user.id`)
  - `TimeEntriesController` (Actor bound to `req.user.id`, supervisor validation)
  - `SearchController` (Partitioned by caller permissions)

---

## 5. Mutation Route Authorization

* User, Role, and Security mutations $\to$ Protected by `Administration.*` guards.
* Destructive Organization Reset $\to$ Protected by `Administration.Roles` guard, `Administrator` role verification, phrase match, and password verification.
* System Settings Mutations (`PUT /settings/organization`, `PUT /settings/system`, `PUT /settings/numbering`, `PATCH /settings/feature-flags`) $\to$ Protected by `Administration.Settings` guard.
* Inventory, BOM, PO, Work Order mutations $\to$ Protected by domain RBAC guards.
* Bulk mutations $\to$ Entity-specific permission verification with fail-closed default.

---

## 6. Sensitive Operations Authorization

* **Organization Business Data Reset (`POST /settings/organization/reset`):**
  - Requires `Administration.Roles` guard.
  - Requires caller role `Administrator`.
  - Requires exact phrase `"RESET MY ORGANIZATION"`.
  - Requires caller's active password.
  - Derives identity strictly from `req.user.id`.
* **Administrative Password Reset (`POST /users/:id/reset-password`):**
  - Requires `Administration.Users` guard.
  - Non-administrators cannot reset Administrator accounts.
  - Instantly revokes all active sessions for the target user.

---

## 7. Administrative Boundaries & System Roles

* System roles (`isSystem = true`) cannot be edited or deleted.
* Granting wildcard `*` permissions is restricted to Administrators.
* Root admin initialization uses canonical system role `'Administrator'`.
* Non-administrators cannot invite users with the `'Administrator'` role.

---

## 8. Multi-Tenancy / Organization Boundary Audit

* Architecture is single-tenant per deployment (dedicated database/container per organization).
* Data isolation across organizations is enforced at the deployment boundary.
* Cross-user data isolation within the organization is enforced via row-level ownership checks (`req.user.id`).

---

## 9. IDOR / Broken Object Level Authorization (BOLA) Remediation

### Remediated Issues (Phase 3A)
1. **PreferencesController:**
   - **Fix:** Removed `@Query('userId')`. Derived identity exclusively from `req.user.id`.
   - **Service:** Removed `resolveUserId` and fallback to `users.limit(1)`. Enforced UUID validation.
   - **Ownership:** `removeFavorite` verifies `where(and(eq(id), eq(userId)))`, throwing `NotFoundException` on access violation.
2. **NotificationsController:**
   - **Fix:** Removed `@Query('userId')`. Derived identity exclusively from `req.user.id`.
   - **Service:** Removed `resolveUserId` and fallback to `users.limit(1)`.
   - **Ownership:** `markAsRead` verifies `where(and(eq(id), eq(userId)))`, preventing cross-user status tampering.
3. **TimeEntriesController:**
   - **Actor Identity:** Derived exclusively from `req.user.id`.
   - **Target Employee:** If logging on behalf of another user, strictly requires `Projects.Manage` or `Administrator`.
   - **Self-Approval:** Prohibited for non-administrators.
   - **Approver Identity:** Authoritatively bound to `req.user.id`.
4. **InventoryTransactionsController:**
   - **Attribution:** `createdBy` is authoritatively bound to `req.user.id` on server; client input is ignored.

---

## 10. Mass Assignment & DTO Authorization

* `ValidationPipe` is active with `{ whitelist: true, forbidNonWhitelisted: true }`.
* Identity fields (`userId`, `approverId`, `createdBy`) are either stripped from client input or ignored and overwritten by server-side session identity.

---

## 11. Search / Query / Read Authorization

* **Search Privacy (Phase 3F):**
  - `SearchController` passes caller permissions to `SearchService`.
  - `SearchService` filters out `AdministrationSearchProvider` unless the user possesses `*`, `Administration.Users`, `Administration.Roles`, or `Administration.Security`.
  - Ordinary users cannot enumerate user accounts or security policies via global search.

---

## 12. Bulk Operations Authorization

* **BulkActionsController (Phase 3H):**
  - Entity types are normalized to lower-case.
  - Entity-specific permissions enforced (`Administration.Roles`, `PurchaseOrders.Update`, `BOM.Manage`, `WorkOrders.Manage`, `Inventory.Delete`/`Update`, `Attributes.Delete`/`Update`).
  - **Fails Closed:** Unknown entity types throw `BadRequestException`.
  - Maximum IDs per request capped at 100.

---

## 13. File Upload / Download / Document Authorization

* `DocumentsController` guarded by `Documents.Read`, `Documents.Create`, `Documents.Delete`.
* File storage provider validates file paths against directory traversal attacks.

---

## 14. ML Service Authorization

* ML service host port 5001 unmapped from host in Docker Compose.
* Private network access only via authenticated NestJS API proxy guarded by `ML.Read` and `ML.Manage`.

---

## 15. Import / Export Privilege Partitioning (Phase 3B)

* **Entity-Specific Authorization Map:**
  - `User` $\to$ `Administration.Users`
  - `Role`, `Permission` $\to$ `Administration.Roles`
  - `PurchaseOrder` $\to$ `PurchaseOrders.Update` (Import) / `PurchaseOrders.Read` (Export)
  - `BOM` $\to$ `BOM.Manage` (Import) / `BOM.Read` (Export)
  - `WorkOrder` $\to$ `WorkOrders.Manage` (Import) / `WorkOrders.Read` (Export)
  - `AttributeDefinition` $\to$ `Attributes.Update`
  - Inventory entities $\to$ `Inventory.Update`
  - Unknown entity types $\to$ **Fail Closed** (`BadRequestException`).
* `previewImport`, `executeImport`, `getTemplate`, and `reverseImport` enforce entity permissions.
* `getJobs` restricts ordinary users strictly to their own import jobs.

---

## 16. Background Jobs / Workers / Queue Authorization

* `worker.ts` operates in a headless NestJS context executing internal scheduled tasks.
* Worker does not expose external mutation routes; health check exposes only status/uptime.

---

## 17. WebSockets / SSE / Realtime Authorization

* No active WebSocket/SSE listeners configured in API.

---

## 18. Server Actions / Frontend-Backend Boundary

* Next.js web application forwards `Authorization: Bearer <token>` on all API requests.
* All authorization controls reside server-side in the NestJS API.

---

## 19. Privilege Escalation Paths

* All discovered privilege escalation vectors (unauthenticated admin invite, unauthenticated password reset, system role alteration, wildcard permission assignment, bulk action casing mismatch, importer entity privilege escalation) are **RESOLVED**.

---

## 20. Insecure Direct References to Cryptographic Material

* Password reset tokens hashed with SHA-256 before storage.
* Audit logs store only 8-character token fingerprints (`tokenFingerprint`).
* Invitation tokens generated with `crypto.randomBytes(32)`.

---

## 21. Session Revocation Propagation

* Password reset (self-service or admin) instantly deletes all active sessions in `user_sessions`.
* Logout destroys the active database session.
* `AuthGuard` queries database on every request, ensuring instant revocation enforcement.

---

## 22. Audit Logging Authorization & Completeness

* `SecurityAuditController` guarded by `Administration.Security`.
* Plaintext credentials purged from logs.
* Sensitive operations recorded with timestamps, user IDs, and client IP metadata.

---

## 23. Negative Authorization Regression Test Suite

Comprehensive regression suite running against the API:
* `apps/api/test/integration/security-remediation.integration-spec.ts` (27/27 passed)
* `apps/api/src/import-export/import-export.controller.spec.ts` (7/7 passed)
* `apps/api/src/import-export/bulk-actions.controller.spec.ts` (5/5 passed)
* `apps/api/src/time-entries/time-entries.controller.spec.ts` (5/5 passed)
* `apps/api/src/inventory-transactions/inventory-transactions.controller.spec.ts` (1/1 passed)
* `apps/api/src/preferences/preferences.controller.spec.ts` (3/3 passed)
* `apps/api/src/notifications/notifications.controller.spec.ts` (3/3 passed)

---

## 24. Prioritized Remediation Summary & Remaining Work

### Phase 3 Remediations Completed:
1. **Preferences IDOR & Fallback:** Fully eliminated; bound to `req.user.id`.
2. **Notifications IDOR & Ownership:** Fully eliminated; cross-user read/update blocked.
3. **Time Entries Attribution:** Actor identity bound to session; cross-user logging guarded; self-approval blocked.
4. **Inventory Transactions Attribution:** `createdBy` server-derived.
5. **Import/Export Privilege Partitioning:** Entity-specific checks enforced; unknown entities fail closed.
6. **Settings Mutations:** Guarded by `Administration.Settings`.
7. **High-Risk Domain RBAC:** Applied across Purchase Orders, BOMs, Work Orders, Suppliers, Categories, Locations.
8. **Search Privacy:** User/role enumeration blocked for non-admin callers.
9. **Bulk Actions:** Unknown entities fail closed.

### Deferred to Phase 4 (Cryptographic & Infrastructure Hardening):
1. Password hashing algorithm migration (SHA-256 $\to$ Argon2id).
2. Session token storage & cookie hardening (`HttpOnly`, `SameSite=Strict`, `Secure`).
3. Dependency vulnerability updates (`next` upgrade).
4. Rate limiting installation (`@nestjs/throttler`).

---

## 25. Phase 3.5 — Complete RBAC Domain Coverage & Privilege Boundary Verification

### Overview
In Phase 3.5, all remaining business mutation and operational endpoints were audited and protected with granular route-level RBAC guards. Authentication is never conflated with authorization: possessing a valid session token grants access only to operations explicitly permitted by the role's assigned permissions.

### Domain Coverage Breakdown:
1. **Accounting & Finance:**
   - `AccountsController`: `Accounting.Create` on create, `Accounting.Update` on activate/deactivate, `Accounting.Read` on queries.
   - `JournalEntriesController`: `Accounting.Create` on draft & line addition, `Accounting.Post` on post, reverse, and void.
   - `PaymentsController`: `Accounting.Create` on draft, `Accounting.Post` on post and cancel.
   - `PayableInvoicesController`: `Accounting.Create` on draft, `Accounting.Post` on post and cancel.
   - `ReceivableInvoicesController`: `Accounting.Create` on draft, `Accounting.Post` on post and cancel.
   - `BankReconciliationsController`: `Accounting.Create` on draft, `Accounting.Update` on lines/match, `Accounting.Post` on complete.
   - `BankAccountsController`: `Accounting.Read` on queries.

2. **Sales & CRM:**
   - `SalesOrdersController`: `Sales.Create` on create/convert, `Sales.Update` on lines, approve, release, and cancel.
   - `CustomersController`: `Sales.Create` on create, `Sales.Update` on activate, suspend, contacts, addresses.
   - `CrmAccountsController`: `Sales.Create` on create, `Sales.Update` on contacts, archive.
   - `QuotationsController`: `Sales.Create` on create, `Sales.Update` on lines, send, accept, cancel.
   - `LeadsController`: `Sales.Create` on create, `Sales.Update` on assign, qualify, disqualify, convert.
   - `OpportunitiesController`: `Sales.Create` on create, `Sales.Update` on advance, win, lose.
   - `CustomerReturnsController`: `Sales.Create` on create, `Sales.Update` on lines, approve, receive, inspect, restock, reject, close.
   - `FulfillmentRequestsController`: `Sales.Create` on create, `Sales.Update` on lines, accept, pick, pack, ship, complete, cancel.
   - `ActivitiesController`: `Sales.Create` on create, `Sales.Update` on complete, cancel.
   - `NotesController`: `Sales.Create` on create, `Sales.Read` on queries.

3. **Maintenance & Service:**
   - `MaintenanceSchedulesController`: `Maintenance.Manage` on all mutations (create, pause, resume, complete visit, complete plan, cancel).
   - `ServiceRequestsController`: `Maintenance.Manage` on all mutations (create, assign, diagnose, waiting parts, start repair, complete, close, cancel).
   - `ServiceNotesController`: `Maintenance.Manage` on create.
   - `WarrantyClaimsController`: `Maintenance.Manage` on all mutations (create, review, approve, reject).
   - `RmaRequestsController`: `Maintenance.Manage` on all mutations (create, approve, receive, inspect, process, close, reject).

4. **Procurement & Warehousing:**
   - `GoodsReceiptsController`: `GoodsReceipts.Receive` on create, add line, and post receipt.
   - `PurchaseInvoicesController`: `PurchaseOrders.Create` on draft, `PurchaseOrders.Update` on lines, match, approve, pay, cancel, status.
   - `SupplierReturnsController`: `PurchaseOrders.Create` on draft, `PurchaseOrders.Update` on lines, approve, dispatch, complete, cancel, update, delete.
   - `PurchaseRecommendationsController`: `PurchaseOrders.Create` on create, `PurchaseOrders.Update` on accept, reject, implement.
   - `ProcurementPoliciesController`: `PurchaseOrders.Update` on create.
   - `StockAdjustmentsController`: `Inventory.Adjust` on create, approve, cancel.
   - `StockCountsController`: `Inventory.Adjust` on create, assign, lines, submit, approve, post, cancel.
   - `CycleCountsController`: `Inventory.Adjust` on create, update, delete, assign, start, record counts, approve, cancel.
   - `WarehouseTransfersController`: `Inventory.Transfer` on create, update, delete, lines, submit, dispatch, receive, cancel.
   - `WarehousesController`: `Inventory.Update` on create, add bin, update bin.
   - `WarehousePoliciesController`: `Inventory.Update` on save policy.
   - `BatchesController`: `Inventory.Update` on create batch.
   - `SerialsController`: `Inventory.Update` on create serial.
   - `ReservationsController`: `Inventory.Reserve` on create, update, fulfill, release, cancel, delete.
   - `UnitsController`: `Inventory.Create` on create, `Inventory.Update` on update, patch, delete.
   - `ManufacturersController`: `Inventory.Create` on create, `Inventory.Update` on update, delete.
   - `BarcodesController`: `Inventory.Update` on generate, batch-labels; `Inventory.Read` on lookup.
   - `InventoryProjectionsController`: `Inventory.Adjust` on rebuild projections.

5. **Manufacturing & MRP:**
   - `ProductionOrdersController`: `WorkOrders.Manage` on create, update, release, start, pause, resume, close, cancel, delete; `Manufacturing.Execute` on record output, record scrap, complete.
   - `ProductionRecommendationsController`: `WorkOrders.Manage` on create, accept, reject, implement.
   - `MaterialConsumptionsController`: `Manufacturing.Execute` on create, lines, post.
   - `MaterialRequirementsController`: `WorkOrders.Manage` on create/calculate.
   - `CapacityPlansController`: `WorkOrders.Manage` on create/calculate.
   - `PlanningRunsController`: `WorkOrders.Manage` on create, execute, cancel.
   - `PlanningMessagesController`: `WorkOrders.Manage` on create message.
   - `FinishedGoodsController`: `Manufacturing.Execute` on create, lines, post.

6. **Projects & Automation:**
   - `ProjectsController`: `Projects.Manage` on create, update, start, pause, complete, archive, cancel, milestones; `Projects.Allocate` on material allocation, issuance, return.
   - `TasksController`: `Projects.Manage` on create, assign, start, block, complete, cancel.
   - `ActivityController`: `Administration.Security` on audit log; `Reports.Read` on queries; `Projects.Manage` on event creation.
   - `DataPacksController`: `Administration.Settings` on catalog and pack installation.
   - `NotificationsController`: `Administration.Settings` on workflow creation and trigger evaluation; `Administration.Users` on arbitrary user notification creation.

### Automated Verification:
- Automated introspection test (`apps/api/test/integration/authorization-audit.integration-spec.ts`):
  - **343** total mutation endpoints inspected.
  - **321** route/class guarded via explicit RBAC guards.
  - **5** explicit `@Public()` endpoints.
  - **17** audited handler/self-service endpoints (strictly bound to `req.user.id` or dynamic per-entity evaluators).
  - **0** unguarded mutations remaining.
- Integration tests in `security-remediation.integration-spec.ts`: 31/31 passed.


# Comprehensive Security & Permissions Audit — Ananya ERP

> **Document Version:** 1.0.0  
> **Date:** September 27, 2026  
> **Audit Type:** Full Repository Security, Authentication, Authorization, Permissions & Attack Surface Review  
> **Status:** REMEDIATION IN PROGRESS — Phase 1 & 2 Completed & Verified (Integration Tests Passing)  

---

## 1. Executive Summary

A comprehensive, defense-in-depth security audit was conducted on the entire **Ananya ERP** codebase, encompassing:
- The **NestJS API** (`apps/api`)
- The **Next.js Web Frontend** (`apps/web`)
- The **Python FastAPI ML Service** (`apps/ml`)
- The **Database & Shared Domain Packages** (`packages/database`, `packages/core`, etc.)
- **Docker & Compose Infrastructure** (`compose.yml`, `compose.prod.yml`, `compose.local.yml`, `docker/`)
- **CI/CD Workflows** (`.github/workflows/`)
- **Dependency supply chain** (`pnpm-lock.yaml`, `requirements.txt`)

### Key Audit Findings Overview

While certain recently developed features (specifically `components`, `attributes`, `documents`, and parts of `ml`) exhibit strong defensive patterns such as dedicated guards and strict path-traversal sanitization, the audit uncovered **critical systemic vulnerabilities** in the overarching authentication, authorization, and data-boundary architecture:

1. **Unprotected API Attack Surface (90%+ Unauthenticated):**  
   Out of ~65 NestJS controllers in the API, **only 4 controllers** implement any authorization or authentication guards (`@UseGuards`). There is **no global authentication guard** (`APP_GUARD`) registered in `app.module.ts` or `main.ts`. Consequently, sensitive domain modules—including `users`, `roles`, `settings`, `purchase-orders`, `sales-orders`, `payments`, `journal-entries`, `boms`, `work-orders`, `inventory-transactions`, `warehouses`, `search`, and `import-export`—are **completely exposed to unauthenticated anonymous HTTP requests**.

2. **Unauthenticated Account Takeover & Admin Password Reset:**  
   The endpoint `POST /users/:id/reset-password` lacks authentication guards and takes `{ "newPassword": "..." }`, allowing any unauthenticated caller to reset the password of any user—including the system administrator. Additionally, `POST /auth/reset-password-request` logs the generated reset token in plaintext to `security_audit_logs`, which is readable by anyone via the completely unauthenticated `GET /security/audit` endpoint.

3. **Unauthenticated Admin Account Creation via Invitations:**  
   The `POST /auth/invitations` endpoint catches and ignores authentication failures, allowing anonymous callers to generate invitations with arbitrary role assignments (e.g., `Administrator`). The response immediately returns the plaintext invitation token, which can be redeemed at `POST /auth/invitations/accept` to create a new active Administrator account.

4. **Unauthenticated Entire Database Truncation:**  
   The endpoint `POST /settings/organization/reset` has no authentication guard. When called anonymously, the request user defaults to `'system'`, which fails UUID validation and causes the service to fall back to the first user in the database. Combined with unauthenticated password resets or newly created users, an attacker can issue a single HTTP request to truncate all 40 core business tables via `CASCADE`.

5. **Insecure Password Hashing:**  
   Passwords across all authentication and onboarding pathways are hashed using **unsalted single-round SHA-256** (`crypto.createHash('sha256').update(password).digest('hex')`). This algorithm provides zero computational work-factor or salt protection, making passwords trivial to crack via rainbow tables or GPU cracking (billions of guesses per second).

6. **Public ML Service Exposure & Unauthenticated Pickle Deserialization:**  
   The FastAPI ML service is bound to host port 5001 (`0.0.0.0:5001`) with wildcard CORS (`allow_origins=["*"]`) and zero authentication. Model checkpoints are loaded using Python's `pickle.load()`. Any unauthorized manipulation of model artifacts or invocation of reload endpoints poses an arbitrary code execution risk.

7. **Bypasses in Guarded Resources via Bulk Actions:**  
   While individual deletions on components and attributes are protected by guards, `POST /import-export/bulk-action` is completely unguarded and delegates deletion/archiving of components, attributes, BOMs, purchase orders, locations, and roles directly to domain services without authorization checks.

### Vulnerability Count Summary

| Severity | Count | Primary Impact Areas |
|:---|:---:|:---|
| **CRITICAL** | **7** | Global Guard Absence, Pre-Auth Password Reset, Reset Token Leakage, Unauthenticated Admin Creation, Database Wipe, Unsalted SHA-256 Passwords, Public ML Pickle Load |
| **HIGH** | **6** | Bulk Action Guard Bypass, Unauthenticated Import/Export & Impersonation, Plaintext DB Session Tokens / Weak Cookies, System Role Privilege Tampering, Root Admin Initialization Bug, Permissive CORS Default |
| **MEDIUM** | **5** | Unauthenticated Global Search / Barcode Leakage, Stored XSS via Inline SVG Preview, Missing Rate Limiting, Suppressed TypeScript Checks in Production Build, Known High/Critical Dependencies |
| **LOW** | **3** | Unpinned GitHub Actions, Vestigial Dead Configurations (`JWT_SECRET`), Hardcoded Admin Email References |

---

## 2. Architecture & Security Boundaries

```
                 Internet / External Network
                             │
            ┌────────────────┴────────────────┐
            │                                 │
     Port 3000 (HTTP)                  Port 4000 (HTTP)
            ▼                                 ▼
   ┌─────────────────┐               ┌─────────────────┐
   │ Next.js Web App │ (Client-side) │   NestJS API    │ ◄─── Port 5001 (Host Exposure!)
   │   (apps/web)    │──────────────►│   (apps/api)    │       FastAPI ML (apps/ml)
   └─────────────────┘               └────────┬────────┘
                                              │ (Drizzle ORM)
                                              ▼
                                     ┌─────────────────┐
                                     │   PostgreSQL    │
                                     │  (ananya-db)    │
                                     └─────────────────┘
```

### Security Boundary Analysis

1. **Browser to Next.js Frontend:**  
   - Frontend route gating in `apps/web/middleware.ts` only checks whether the cookie or header `ananya_auth_token` exists.  
   - The token is **never verified or validated cryptographically by the Next.js middleware**. A client providing an arbitrary string (e.g., `Cookie: ananya_auth_token=foo`) bypasses the middleware redirect and loads any page.
   - Frontend gating is strictly cosmetic UX.

2. **Browser to NestJS API:**  
   - The browser communicates directly with the NestJS API at `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`).  
   - The NestJS API is responsible for being the **authoritative security boundary**.  
   - However, the API lacks a global guard (`APP_GUARD`) and lacks route-level guards on ~90% of its endpoints.

3. **NestJS API to Python ML Service:**  
   - Intended as an internal backend-to-backend communication channel via `ML_SERVICE_URL=http://ml:5001`.  
   - In reality, `compose.yml` maps port 5001 directly to the host (`ports: - "5001:5001"`).  
   - The ML service has no API key, mutual TLS, or bearer token authentication. Any client on the network or any browser via CORS (`*`) can talk directly to the ML control plane.

4. **Data Layer (PostgreSQL):**  
   - Managed via Drizzle ORM (`packages/database`).  
   - No multi-tenant row-level security (RLS) or tenant isolation is implemented in PostgreSQL. All data resides in shared tables without organization IDs or tenant partitions.

---

## 3. Authentication Model

### Identity Establishment & Propagation
1. **Login:** Handled at `POST /auth/login`.  
   - Takes `email`, `password`, and optional `rememberMe`.
   - Compares the unsalted SHA-256 hash of the input password against `users.password_hash`.
   - On success, creates a 32-byte hex random string (`crypto.randomBytes(32).toString('hex')`) in the `user_sessions` table.
   - Session duration: 30 days if `rememberMe: true`, 1 day (24 hours) otherwise.
2. **Token Format:** Opaque hex random string (not a signed JWT, despite `JWT_SECRET` being defined in configuration).
3. **Token Transmission & Storage:**  
   - Sent to the client in the JSON response body.
   - Stored in browser `localStorage` under key `ananya_auth_token`.
   - Set in browser cookie via client-side JavaScript (`document.cookie = ananya_auth_token=...; path=/; max-age=604800; SameSite=Lax`).
   - **Flaw:** The cookie is **not HttpOnly** and **not Secure**. Storing tokens in `localStorage` and readable cookies exposes them to immediate theft via any Cross-Site Scripting (XSS) vulnerability.
4. **Token Storage in Database:**  
   - Stored as **plaintext** in `user_sessions.token`. If the database is dumped or accessed, all active user sessions are immediately compromised.
5. **Propagation in API:**  
   - In protected routes, `permission.guard.ts` extracts the Bearer token from the `Authorization` header, retrieves the session via `AuthService.getMeByToken()`, and attaches `request.user = { id, email, roleName, permissions }`.
   - In unprotected routes (the majority), `request.user` is undefined.

---

## 4. Authorization / RBAC Model

### Permission Structure
- System roles are defined in `apps/api/src/permissions/permissions.service.ts`:
  - `Administrator`: Wildcard permission `['*']`.
  - `Inventory Manager`: `Inventory.Read`, `Inventory.Create`, `Inventory.Update`, `Inventory.Adjust`, `Inventory.Transfer`, `Inventory.Reserve`, `GoodsReceipts.Receive`, `Reports.Read`.
  - `Warehouse Operator`: `Inventory.Read`, `GoodsReceipts.Receive`, `Inventory.Transfer`.
  - `Purchasing Agent`: `PurchaseOrders.*`, `GoodsReceipts.Receive`, `Reports.Read`.
  - `Manufacturing Lead`: `BOM.*`, `WorkOrders.Manage`, `Manufacturing.Execute`, `Inventory.Read`.
  - `Project Manager`: `Projects.*`, `Inventory.Read`.
  - `Auditor`: `Reports.Read`, `Reports.Export`, `Administration.Security`.

### Permission Evaluation Logic
In `PermissionsService.hasPermission(userPermissions, requiredPermission)`:
- Returns `true` if `userPermissions` includes `'*'`.
- Returns `true` if `userPermissions` includes the exact string (e.g. `'Inventory.Read'`).
- Supports domain wildcards (e.g. `'Inventory.*'`).

### Implementation Reality
Although the RBAC vocabulary and evaluation methods are well-crafted, **they are scarcely applied**:
- `PermissionsService` is only called by `permission.guard.ts`.
- `permission.guard.ts` is only instantiated by `components.controller.ts`, `attributes.controller.ts`, `documents.controller.ts`, and `ml.controller.ts`.
- **None of the remaining 60+ controllers check permissions at all.**

---

## 5. Role / Permission Matrix

The table below reflects the **actual enforcement in code today** versus the intended policy:

| Operation / Area | Intended Role | Actual Code Enforcement | Vulnerability Status |
|:---|:---|:---|:---|
| **View Catalog Components** | `Inventory.Read` | Enforced via `ComponentReadGuard` | PROTECTED |
| **Edit Catalog Components** | `Inventory.Update` | Enforced via `ComponentWriteGuard` | PROTECTED |
| **Delete Components (Single)** | `Inventory.Delete` | Enforced via `ComponentDeleteGuard` | PROTECTED |
| **Delete Components (Bulk)** | `Inventory.Delete` | **None** (`BulkActionsController`) | **BYPASS (CRITICAL)** |
| **Manage Users** | `Administration.Users` | **None** (`UsersController`) | **EXPOSED (CRITICAL)** |
| **Reset User Passwords** | `Administration.Users` | **None** (`UsersController`) | **EXPOSED (CRITICAL)** |
| **Manage Roles & Permissions** | `Administration.Roles` | **None** (`RolesController`) | **EXPOSED (CRITICAL)** |
| **Read Security Audit Logs** | `Administration.Security` | **None** (`SecurityAuditController`)| **EXPOSED (CRITICAL)** |
| **Truncate ERP Tables** | Root Admin Only | **None** (`SettingsController`) | **EXPOSED (CRITICAL)** |
| **Create/Approve Purchase Orders**| `PurchaseOrders.Approve`| **None** (`PurchaseOrdersController`) | **EXPOSED (HIGH)** |
| **Post/Cancel Payments** | Finance Lead | **None** (`PaymentsController`) | **EXPOSED (HIGH)** |
| **Execute Stock Adjustments** | `Inventory.Adjust` | **None** (`StockAdjustmentsController`)| **EXPOSED (HIGH)** |
| **Import / Export Business Data**| `Administration.*` | **None** (`ImportExportController`) | **EXPOSED (HIGH)** |
| **Trigger ML Training / Deploy**| `Administration.Roles` | API has guard; **ML port 5001 is open**| **BYPASS (CRITICAL)** |

---

## 6. Complete Endpoint Inventory & Guard Coverage

An exhaustive scan of all controller files in `apps/api/src` revealed 84 controller endpoints classes. The audit categorization:

### Guarded Controllers (Only 4 Modules)
1. `AttributesController` (`src/attributes/attributes.controller.ts`) — Uses `AttributeReadGuard`, `AttributeWriteGuard`, `AttributeDeleteGuard`.
2. `ComponentsController` (`src/components/components.controller.ts`) — Uses `ComponentReadGuard`, `ComponentWriteGuard`, `ComponentDeleteGuard`.
3. `DocumentsController` (`src/documents/documents.controller.ts`) — Uses `DocumentReadGuard`, `DocumentWriteGuard`.
4. `MlController` & Review Queues (`src/ml/*`) — Uses `MlReadGuard`, `MlWriteGuard`, `MlAdminGuard`.

### Completely Unguarded Controllers (Exposed to Anonymous Callers)
- **Identity & Access Management:** `UsersController`, `RolesController`, `SecurityAuditController`.
- **System Administration & Settings:** `SettingsController`, `PreferencesController`, `DataPacksController`.
- **Data Transfer & Bulk Execution:** `ImportExportController`, `BulkActionsController`.
- **Procurement:** `PurchaseOrdersController`, `SuppliersController`, `GoodsReceiptsController`, `SupplierReturnsController`, `PurchaseInvoicesController`, `ProcurementPoliciesController`, `ProcurementReportingController`.
- **Sales & CRM:** `CustomersController`, `QuotationsController`, `SalesOrdersController`, `FulfillmentRequestsController`, `CustomerReturnsController`, `LeadsController`, `OpportunitiesController`, `CrmAccountsController`.
- **Finance & Accounting:** `AccountsController`, `JournalEntriesController`, `ReceivableInvoicesController`, `PayableInvoicesController`, `PaymentsController`, `BankAccountsController`, `BankReconciliationsController`.
- **Inventory & Warehousing:** `WarehousesController`, `LocationsController`, `StockCountsController`, `StockAdjustmentsController`, `CycleCountsController`, `WarehouseTransfersController`, `WarehousePoliciesController`, `InventoryTransactionsController`, `InventoryProjectionsController`, `ReservationsController`, `BatchesController`, `SerialsController`.
- **Manufacturing & Production:** `BomsController`, `ProductionOrdersController`, `WorkOrdersController`, `MaterialConsumptionsController`, `FinishedGoodsController`, `ManufacturingTraceabilityController`, `CapacityPlansController`, `MaterialRequirementsController`, `PlanningRunsController`, `PlanningMessagesController`.
- **Field Service & Projects:** `ProjectsController`, `TasksController`, `TimeEntriesController`, `ServiceRequestsController`, `WarrantyClaimsController`, `RmaRequestsController`, `MaintenanceSchedulesController`, `ServiceNotesController`.
- **Common & Lookup Utilities:** `SearchController`, `BarcodesController`, `CategoriesController`, `UnitsController`, `ManufacturersController`, `ActivityController`, `NotificationsController`, `ReportingController`.

---

## 7. Resource Ownership & Multi-Tenancy Model

1. **Multi-Tenancy:**
   - Ananya ERP is currently designed as a single-tenant or shared-schema architecture without tenant-level isolation columns (`organization_id` or `tenant_id`) in business tables.
   - `organization_profile` has a single row storing the company profile.
2. **Resource Ownership Checks:**
   - In all unguarded controllers, endpoints such as `GET /:id`, `PUT /:id`, `DELETE /:id` query the database using solely `where(eq(table.id, id))` without checking resource ownership or creator identity.
   - Any user who knows or guesses a UUID can view, modify, or delete the corresponding record across all business domains.

---

## 8. Detailed Findings & Vulnerability Profiles

---

### Finding SEC-01: Global Absence of Authentication & Authorization Guards
- **ID:** SEC-01
- **Severity:** CRITICAL
- **Area:** Authorization / Architecture
- **Affected Component:** Entire NestJS API (`apps/api`)
- **Affected Endpoints:** ~80 controllers (e.g., `/users/*`, `/roles/*`, `/settings/*`, `/purchase-orders/*`, `/payments/*`, `/journal-entries/*`, `/inventory-transactions/*`, etc.)
- **Description:**  
  There is no global `APP_GUARD` configured in `AppModule` or `main.ts`. While a custom `createPermissionGuard` factory exists, it is only applied to 4 controllers (`components`, `attributes`, `documents`, `ml`). Over 90% of the API has zero authentication or permission checks.
- **Attack Scenario:**  
  An unauthenticated remote attacker connects directly to `http://api.erp.example.com/payments` or `http://api.erp.example.com/purchase-orders` and executes full CRUD operations, creates financial records, approves orders, or downloads full business databases without sending any credentials or headers.
- **Impact:** Complete system compromise, unauthorized financial and inventory manipulation, data exfiltration.
- **Evidence:**  
  `apps/api/src/main.ts:28-36`, `apps/api/src/app.module.ts:83-170`. Grep confirms `@UseGuards` only appears in 4 modules.
- **Recommended Fix:**  
  Implement a global authentication guard (e.g., `JwtAuthGuard` or `SessionAuthGuard`) bound via `APP_GUARD` in `AppModule`. Require explicit `@Public()` metadata decorator to opt out.
- **Regression Test:**  
  Automated e2e test verifying that every endpoint in the API returns `401 Unauthorized` when requested without an `Authorization` header.

---

### Finding SEC-02: Unauthenticated Password Reset for Any User Account
- **ID:** SEC-02
- **Severity:** CRITICAL
- **Area:** Authentication / Account Takeover
- **Affected Component:** `UsersController`, `UsersService`
- **Affected Endpoint:** `POST /users/:id/reset-password`
- **Description:**  
  The `UsersController.adminResetPassword` route accepts a target user ID in the path and `{ "newPassword": "..." }` in the body. It contains no `@UseGuards` decorator, performs no caller verification, and directly updates the user's password in the database.
- **Attack Scenario:**  
  1. Attacker calls `GET /users` (also unauthenticated) to list all users and copies the administrator's UUID.
  2. Attacker sends `POST /users/<admin-uuid>/reset-password` with `{"newPassword": "AttackerPassword123!"}`.
  3. Attacker logs in as the administrator with full privileges.
- **Impact:** Immediate, total account takeover of any user or administrator in seconds.
- **Evidence:**  
  `apps/api/src/users/users.controller.ts:43-49`, `apps/api/src/users/users.service.ts:227-246`.
- **Recommended Fix:**  
  Protect `POST /users/:id/reset-password` with `createPermissionGuard('Administration.Users', 'reset user passwords')` and require that callers cannot reset passwords of users with equal or higher roles without current password confirmation.
- **Regression Test:**  
  Issue `POST /users/:id/reset-password` without credentials; verify `401 Unauthorized` is returned.

---

### Finding SEC-03: Password Reset Token Leakage via Security Audit Log
- **ID:** SEC-03
- **Severity:** CRITICAL
- **Area:** Authentication / Information Disclosure
- **Affected Component:** `AuthService`, `SecurityAuditController`
- **Affected Endpoints:** `POST /auth/reset-password-request`, `GET /security/audit`, `POST /auth/reset-password`
- **Description:**  
  When requesting a password reset, `AuthService.requestPasswordReset` writes the generated reset token directly into the `security_audit_logs` table (`details: { resetToken }`). Meanwhile, `SecurityAuditController.getAuditLogs` (`GET /security/audit`) is completely unauthenticated and returns the full JSON details of all audit logs.
- **Attack Scenario:**  
  1. Attacker calls `POST /auth/reset-password-request` with `{"email": "admin@company.com"}`.
  2. Attacker calls `GET /security/audit?category=SECURITY`.
  3. Attacker extracts `resetToken` from the most recent `PASSWORD_RESET_REQUESTED` log entry.
  4. Attacker calls `POST /auth/reset-password` with the stolen token and sets a new password.
- **Impact:** Unauthenticated remote account takeover of any user whose email is known.
- **Evidence:**  
  `apps/api/src/auth/auth.service.ts:231-237`, `apps/api/src/security-audit/security-audit.controller.ts:8-14`.
- **Recommended Fix:**  
  1. Never log secrets, reset tokens, or passwords to audit logs or console logs.
  2. Guard `SecurityAuditController` with `Administration.Security` permission.
  3. Hash reset tokens before storing them in `password_reset_tokens`.
- **Regression Test:**  
  Request a password reset; verify that audit log records contain no token in the `details` payload.

---

### Finding SEC-04: Unauthenticated Admin Creation via Flawed Invitations Flow
- **ID:** SEC-04
- **Severity:** CRITICAL
- **Area:** Authentication / Privilege Escalation
- **Affected Component:** `AuthController`, `InvitationsService`
- **Affected Endpoints:** `POST /auth/invitations`, `POST /auth/invitations/accept`
- **Description:**  
  `AuthController.createInvitation` wraps the caller identity lookup in a `try/catch` block that swallows any authentication error (`// optional`), allowing unauthenticated requests. It accepts `roleId` directly from the request body. Furthermore, `createInvitation` returns the complete invitation record—including the plaintext invitation `token`—in the HTTP response. The token generation also uses insecure `Math.random()`.
- **Attack Scenario:**  
  1. Attacker calls `GET /roles` (unauthenticated) to get the Administrator `roleId`.
  2. Attacker sends `POST /auth/invitations` with `{"email": "evil@attacker.com", "roleId": "<admin-role-id>"}`.
  3. The API responds with the created invitation including `"token": "..."`.
  4. Attacker sends `POST /auth/invitations/accept` with the token, names, and password.
  5. The API creates an active Administrator account and returns a valid session token.
- **Impact:** Unauthenticated remote creation of active Administrator accounts.
- **Evidence:**  
  `apps/api/src/auth/auth.controller.ts:73-87`, `apps/api/src/auth/invitations.service.ts:42-68, 90-138`.
- **Recommended Fix:**  
  1. Require `Administration.Users` permission on `POST /auth/invitations`.
  2. Never return the token in the API response (send it only via out-of-band email).
  3. Generate tokens using `crypto.randomBytes(32).toString('hex')`.
- **Regression Test:**  
  Call `POST /auth/invitations` anonymously; verify `401 Unauthorized` is returned.

---

### Finding SEC-05: Unauthenticated Organization & Complete Database Truncation
- **ID:** SEC-05
- **Severity:** CRITICAL
- **Area:** Authorization / Disaster Recovery
- **Affected Component:** `SettingsController`, `OrganizationResetService`
- **Affected Endpoint:** `POST /settings/organization/reset`
- **Description:**  
  The endpoint `POST /settings/organization/reset` has no guards. `req.user?.id` resolves to `undefined`, defaulting to `'system'`. In `organization-reset.service.ts`, if `userId` is not a valid UUID, the code falls back to `db.select().from(users).limit(1)` (the first user in the database). An attacker who resets the first user's password (via SEC-02) or knows any credentials can supply `passwordConfirm` and `"confirmText": "RESET MY ORGANIZATION"`. This executes `TRUNCATE TABLE ... RESTART IDENTITY CASCADE` across all 40 core business tables.
- **Attack Scenario:**  
  1. Attacker resets user 1's password via `POST /users/<user1-id>/reset-password`.
  2. Attacker calls `POST /settings/organization/reset` with the new password and confirmation string.
  3. All inventory, procurement, manufacturing, accounting, CRM, and project data is permanently erased.
- **Impact:** Complete irreversible data destruction and permanent denial of service.
- **Evidence:**  
  `apps/api/src/settings/settings.controller.ts:38-45`, `apps/api/src/settings/organization-reset.service.ts:33-53, 104-112`.
- **Recommended Fix:**  
  1. Protect the route with strict Administrator-only guard.
  2. Remove the fallback to `users.limit(1)`.
  3. Implement multi-party confirmation or dual-custody authorization for destructive operations.
- **Regression Test:**  
  Call `POST /settings/organization/reset` anonymously; verify `401 Unauthorized` is returned.

---

### Finding SEC-06: Insecure Password Hashing (Unsalted Single-Round SHA-256)
- **ID:** SEC-06
- **Severity:** CRITICAL
- **Area:** Cryptography / Authentication
- **Affected Component:** `AuthService`, `InvitationsService`, `OnboardingService`, `UsersService`, `OrganizationResetService`
- **Affected Endpoints:** All password storage and verification paths
- **Description:**  
  Passwords throughout the codebase are hashed using `crypto.createHash('sha256').update(password).digest('hex')`. There is no salt, no key stretching, and no work factor. Modern GPUs can calculate over 30 billion SHA-256 hashes per second.
- **Attack Scenario:**  
  If the `users` table is extracted via database backup, SQL injection, or unauthenticated API export, all user passwords can be cracked almost instantaneously using precomputed rainbow tables or dictionary attacks.
- **Impact:** Trivial offline cracking of all user and administrative passwords.
- **Evidence:**  
  `apps/api/src/auth/auth.service.ts:25-27`, `apps/api/src/users/users.service.ts:15-17`, `apps/api/src/auth/onboarding.service.ts:22-24`.
- **Recommended Fix:**  
  Migrate to `argon2id` (or `bcrypt` with work factor >= 12). Implement seamless transparent migration upon successful login.
- **Regression Test:**  
  Unit test verifying that password verification uses a salted, slow hashing algorithm.

---

### Finding SEC-07: Unauthenticated Public Exposure of ML Service & Pickle Loading
- **ID:** SEC-07
- **Severity:** CRITICAL
- **Area:** Infrastructure / ML Service / Arbitrary Code Execution
- **Affected Component:** `apps/ml`, `compose.yml`
- **Affected Endpoints:** `http://<host>:5001/v1/*` (`/v1/training/runs`, `/v1/models/deploy`, `/v1/models/rollback`, `/v1/models/reload`)
- **Description:**  
  The Python FastAPI ML service is exposed directly on host port 5001 via `compose.yml`. It has no authentication middleware and uses wildcard CORS (`allow_origins=["*"]`). Model artifacts are deserialized using `pickle.load()` in `category_classifier.py`.
- **Attack Scenario:**  
  An attacker accesses the ML service directly on port 5001, triggering model retraining or deployment of unvalidated artifacts. If a malicious `.pkl` file is supplied or deployed, `pickle.load()` executes arbitrary Python code in the container.
- **Impact:** Remote Code Execution (RCE) inside the ML container, model poisoning, unauthorized access to training datasets.
- **Evidence:**  
  `compose.yml:156-157`, `apps/ml/app/main.py:74-80`, `apps/ml/app/services/category_classifier.py:117-119`.
- **Recommended Fix:**  
  1. Remove host port binding `5001:5001` in `compose.yml`; keep `ml` purely internal on the Docker `internal` network.
  2. Implement shared service-to-service secret token authentication between NestJS API and FastAPI.
  3. Replace Python `pickle` with safe serialization formats such as ONNX, safetensors, or JSON weight dictionaries.
- **Regression Test:**  
  Ensure ML service is unreachable from outside the Docker internal network.

---

### Finding SEC-08: Authorization Bypass on Protected Operations via Unprotected Bulk Actions
- **ID:** SEC-08
- **Severity:** HIGH
- **Area:** Authorization / IDOR
- **Affected Component:** `BulkActionsController`, `BulkActionService`
- **Affected Endpoint:** `POST /import-export/bulk-action`
- **Description:**  
  `ComponentsController` enforces `ComponentDeleteGuard`, and `AttributesController` enforces `AttributeDeleteGuard`. However, `POST /import-export/bulk-action` has no guards. It accepts `{ "entityType": "Component", "action": "DELETE", "ids": [...] }` and calls `componentsService.delete(id)` directly.
- **Attack Scenario:**  
  A non-admin user (or anonymous attacker) denied access to `DELETE /components/:id` simply calls `POST /import-export/bulk-action` with the component IDs and deletes them without permission. Custom roles, categories, and locations can be similarly destroyed.
- **Impact:** Complete bypass of deletion and archiving permission controls across 11 core entity types.
- **Evidence:**  
  `apps/api/src/import-export/bulk-actions.controller.ts:30-33`, `apps/api/src/import-export/bulk-action-registry.ts:22-62`.
- **Recommended Fix:**  
  Protect `BulkActionsController` with guards matching the entity type and requested action, or verify that the caller holds the appropriate permission for each item before dispatching.
- **Regression Test:**  
  Attempt to execute a bulk delete without credentials; verify `401 Unauthorized` is returned.

---

### Finding SEC-09: Unauthenticated Import/Export Data Exfiltration and Injection
- **ID:** SEC-09
- **Severity:** HIGH
- **Area:** Data Access / Authorization
- **Affected Component:** `ImportExportController`, `ImportExportService`
- **Affected Endpoints:** `POST /import-export/export`, `POST /import-export/import/execute`, `POST /import-export/jobs/:id/reverse`
- **Description:**  
  The entire import/export module has zero authentication. Any caller can export entire datasets (customers, inventory, purchase orders) or upload CSV files to inject records. Furthermore, `executeImport` trusts client-supplied user identity from `@Body('userId')` or the `x-user-id` header without validation.
- **Attack Scenario:**  
  An attacker exports the full supplier and customer directory via `POST /import-export/export`. Then, the attacker uploads a CSV to inject malicious components, setting `userId` to the Administrator's ID in the request body.
- **Impact:** Mass data exfiltration, audit log spoofing, unauthorized mass record creation/tampering.
- **Evidence:**  
  `apps/api/src/import-export/import-export.controller.ts:83-145`.
- **Recommended Fix:**  
  Apply `Administration.*` or relevant domain permissions to export/import endpoints. Always derive `userId` from the authenticated session principal (`req.user.id`).
- **Regression Test:**  
  Attempt to export data without credentials; verify `401 Unauthorized` is returned.

---

### Finding SEC-10: Plaintext Database Session Tokens & Insecure Cookie Handling
- **ID:** SEC-10
- **Severity:** HIGH
- **Area:** Session Management / Browser Security
- **Affected Component:** `user_sessions` table, `AuthService`, `apps/web/lib/auth/auth-context.tsx`
- **Affected Endpoints:** `/auth/login`, all authenticated routes
- **Description:**  
  Session tokens are stored in the database in plaintext (`user_sessions.token`). In the web app, tokens are stored in `localStorage` and written to cookies via client-side JavaScript (`document.cookie = ananya_auth_token=...`) with no `HttpOnly` and no `Secure` flags.
- **Attack Scenario:**  
  Any minor XSS flaw on `apps/web` executes JavaScript that reads `localStorage.getItem("ananya_auth_token")` or `document.cookie` and sends the active session token to an attacker server.
- **Impact:** Session hijacking, lateral movement, persistent account takeover.
- **Evidence:**  
  `packages/database/src/schema/auth.ts:69`, `apps/api/src/auth/auth.service.ts:108-117`, `apps/web/lib/auth/auth-context.tsx:140`.
- **Recommended Fix:**  
  1. Store SHA-256 hashes of tokens in `user_sessions.token_hash`.
  2. Set session cookies server-side using `Set-Cookie` with `HttpOnly; Secure; SameSite=Strict`.
  3. Cease storing auth tokens in `localStorage`.
- **Regression Test:**  
  Verify session cookies cannot be read via `document.cookie` in browser console.

---

### Finding SEC-11: System Role Tampering & Privilege Escalation
- **ID:** SEC-11
- **Severity:** HIGH
- **Area:** Authorization / Role Management
- **Affected Component:** `RolesController`, `RolesService`
- **Affected Endpoints:** `PUT /roles/:id`, `POST /roles`, `DELETE /roles/:id`
- **Description:**  
  `RolesController` has no authentication guards. While `RolesService.update` prevents renaming system roles (`dto.name !== role.name`), it **does not prevent updating permissions on system roles**.
- **Attack Scenario:**  
  An unauthenticated attacker sends `PUT /roles/<viewer-role-id>` with `{"permissions": ["*"]}`, elevating all Viewer accounts to full Administrators, or strips all permissions from the Administrator role.
- **Impact:** System-wide privilege escalation and irreversible administrative lockout.
- **Evidence:**  
  `apps/api/src/roles/roles.controller.ts:32-35`, `apps/api/src/roles/roles.service.ts:102-117`.
- **Recommended Fix:**  
  1. Protect `RolesController` with `Administration.Roles` permission.
  2. Disallow updating permissions of `isSystem: true` roles, or restrict updates strictly to verified root administrators.
- **Regression Test:**  
  Attempt to modify role permissions anonymously; verify `401 Unauthorized` is returned.

---

### Finding SEC-12: Root Administrator Created Without Role on Initial Setup
- **ID:** SEC-12
- **Severity:** HIGH
- **Area:** Authorization / Onboarding Logic
- **Affected Component:** `OnboardingService`
- **Affected Endpoint:** `POST /auth/setup-organization`
- **Description:**  
  In `OnboardingService.setupOrganization` line 70, the query searches for `roles.name = 'Admin'`. However, `SYSTEM_ROLE_PERMISSIONS` and `roles.service.ts` initialize the role with name `'Administrator'`. Because the name does not match, `adminRole` is `undefined`, and the initial admin user is inserted with `roleId: null`.
- **Attack Scenario:**  
  When an organization completes initial onboarding, the newly created admin account has `roleId: null` and zero permissions.
- **Impact:** Administrative malfunction, broken access control on initial installation.
- **Evidence:**  
  `apps/api/src/auth/onboarding.service.ts:66-84`, `apps/api/src/permissions/permissions.service.ts:173-174`.
- **Recommended Fix:**  
  Align the role name check in `OnboardingService` to `'Administrator'`.
- **Regression Test:**  
  Run setup organization e2e test and assert `user.roleName === 'Administrator'` and `user.permissions.includes('*')`.

---

### Finding SEC-13: Insecure CORS Default & Missing Web Security Headers
- **ID:** SEC-13
- **Severity:** HIGH
- **Area:** Browser Security / CORS
- **Affected Component:** `apps/api/src/main.ts`, `apps/web/next.config.mjs`
- **Affected Endpoints:** Entire API and Web application
- **Description:**  
  In `main.ts`, if `CORS_ORIGIN` is not defined in the environment, it evaluates `corsOrigin = true` with `credentials: true`. In Express CORS middleware, `origin: true` echoes back whatever `Origin` header the client sends along with `Access-Control-Allow-Credentials: true`. In addition, `next.config.mjs` configures no security headers (`Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`).
- **Attack Scenario:**  
  A victim user visits a malicious website while logged into Ananya ERP. The attacker's page issues credentialed requests to `http://localhost:4000`, reading sensitive ERP data.
- **Impact:** Cross-Origin data exfiltration and Cross-Site Request Forgery.
- **Evidence:**  
  `apps/api/src/main.ts:18-26`, `apps/web/next.config.mjs:10-26`.
- **Recommended Fix:**  
  1. Disallow `origin: true` when `credentials: true`. Require explicit, valid origin lists.
  2. Add strict security headers and CSP in `next.config.mjs`.
- **Regression Test:**  
  Verify CORS rejects requests from unauthorized origins with credentials.

---

### Finding SEC-14: Unauthenticated Information Disclosure in Search & Barcodes
- **ID:** SEC-14
- **Severity:** MEDIUM
- **Area:** Information Disclosure
- **Affected Component:** `SearchController`, `BarcodesController`
- **Affected Endpoints:** `GET /search`, `GET /barcodes/lookup`
- **Description:**  
  `GET /search` and `GET /barcodes/lookup` require no authentication. `SearchController` searches across users (revealing full names, emails, and departments) and roles. `BarcodesController` decodes QR codes and reveals full component details, inventory levels, storage locations, and purchase orders.
- **Attack Scenario:**  
  An unauthenticated actor iterates over common terms (`GET /search?q=a`) to enumerate all employee names, emails, and inventory items.
- **Impact:** Account enumeration, corporate intelligence leakage, internal structure disclosure.
- **Evidence:**  
  `apps/api/src/search/search.controller.ts:8-14`, `apps/api/src/barcodes/barcodes.controller.ts:52-55`.
- **Recommended Fix:**  
  Apply `Inventory.Read` or basic authentication guards to search and barcode lookup routes.
- **Regression Test:**  
  Attempt `GET /search?q=admin` anonymously; verify `401 Unauthorized`.

---

### Finding SEC-15: Potential Stored XSS via Inline SVG Document Previews
- **ID:** SEC-15
- **Severity:** MEDIUM
- **Area:** Browser Security / XSS
- **Affected Component:** `DocumentsController`, `document-file.ts`
- **Affected Endpoints:** `GET /documents/:id/preview`
- **Description:**  
  `document-file.ts` accepts `svg: 'image/svg+xml'`. When previewing a document, `DocumentsController.previewDocument` returns the file with `Content-Type: image/svg+xml` and `Content-Disposition: inline`. Browsers execute JavaScript embedded in inline SVG files if rendered directly in the tab/origin.
- **Attack Scenario:**  
  An attacker uploads an SVG containing `<script>fetch('/users').then(...)</script>` as a component datasheet. When a manager previews the datasheet, the script executes in the manager's browser session.
- **Impact:** Stored Cross-Site Scripting (XSS), session hijacking.
- **Evidence:**  
  `apps/api/src/documents/documents.controller.ts:113-125, 177-196`, `apps/api/src/documents/document-file.ts:56`.
- **Recommended Fix:**  
  Serve SVG files with `Content-Disposition: attachment`, or enforce `Content-Security-Policy: default-src 'none'` on the preview response, or sanitize SVG uploads with DOMPurify/xml-crypto.
- **Regression Test:**  
  Preview an uploaded SVG containing `<script>`; verify script does not execute or file is forced as download.

---

### Finding SEC-16: Missing Rate Limiting Across Entire API
- **ID:** SEC-16
- **Severity:** MEDIUM
- **Area:** Network & API Security
- **Affected Component:** Entire API
- **Affected Endpoints:** `/auth/login`, `/auth/reset-password-request`, `/auth/invitations/*`, all API routes
- **Description:**  
  Neither `@nestjs/throttler` nor express rate-limiting is installed or configured. Login, password reset, and scanning endpoints can be hammered without throttling.
- **Attack Scenario:**  
  Attacker launches a credential-stuffing attack against `POST /auth/login` at 5,000 requests/second until passwords match.
- **Impact:** Brute-force compromise of user accounts, denial of service.
- **Evidence:**  
  `apps/api/package.json:21-41`, `apps/api/src/main.ts`.
- **Recommended Fix:**  
  Install `@nestjs/throttler`. Configure a global limit (e.g. 100 req/min) and strict limits on auth routes (e.g. 5 attempts/min).
- **Regression Test:**  
  Send 10 rapid failed login requests; assert `429 Too Many Requests` is returned.

---

### Finding SEC-17: Ignored TypeScript Build Errors in Production
- **ID:** SEC-17
- **Severity:** MEDIUM
- **Area:** Build & Code Quality
- **Affected Component:** `apps/web/next.config.mjs`
- **Affected Endpoints:** Next.js build pipeline
- **Description:**  
  `next.config.mjs` specifies `typescript: { ignoreBuildErrors: true }`. This prevents the compiler from failing production builds when type errors occur, potentially allowing broken auth checks or data handling bugs into production.
- **Attack Scenario:**  
  A developer accidentally introduces a type error in auth gating; CI passes and ships vulnerable code to production.
- **Impact:** Deployment of defective or insecure client-side code.
- **Evidence:**  
  `apps/web/next.config.mjs:4-6`.
- **Recommended Fix:**  
  Remove `ignoreBuildErrors: true` and resolve any outstanding type errors in `apps/web`.
- **Regression Test:**  
  `pnpm --filter @ananya/web build` fails on type errors.

---

### Finding SEC-18: Known Critical Vulnerabilities in Next.js Dependency
- **ID:** SEC-18
- **Severity:** MEDIUM
- **Area:** Dependencies / Supply Chain
- **Affected Component:** `apps/web` (`next@16.2.6`)
- **Affected Endpoints:** Next.js runtime
- **Description:**  
  `pnpm audit` identifies 55 vulnerabilities across dependencies, including 2 critical advisories in `next@16.2.6`:
  - GHSA-p293-qw3h-jr36 (RCE on windows-hosted servers)
  - GHSA-2xp9-vwfh-vxw4 (RCE in Image Optimization API when AVIF files are used)
- **Impact:** Remote code execution if deployed on Windows or if AVIF image optimization is enabled.
- **Evidence:**  
  `pnpm audit --audit-level critical` output.
- **Recommended Fix:**  
  Upgrade `next` to `>=16.3.3` in `apps/web/package.json`.
- **Regression Test:**  
  `pnpm audit` reports 0 critical vulnerabilities.

---

## 9. Security Test Matrix

| Area / Operation | Anonymous | Normal User (Viewer) | Elevated (Manager) | Administrator |
|:---|:---:|:---:|:---:|:---:|
| **Read Own Profile (`/auth/me`)** | ❌ (401) | ✅ | ✅ | ✅ |
| **Read Other Users (`GET /users`)** | ⚠️ ALLOWED (VULN) | ⚠️ ALLOWED | ⚠️ ALLOWED | ✅ |
| **Reset Any Password (`/users/:id/reset`)**| ⚠️ ALLOWED (CRIT) | ⚠️ ALLOWED | ⚠️ ALLOWED | ✅ |
| **Create Roles (`POST /roles`)** | ⚠️ ALLOWED (CRIT) | ⚠️ ALLOWED | ⚠️ ALLOWED | ✅ |
| **Tamper System Roles (`PUT /roles/:id`)** | ⚠️ ALLOWED (CRIT) | ⚠️ ALLOWED | ⚠️ ALLOWED | ⚠️ SHOULD RESTRICT |
| **Truncate Database (`/settings/reset`)** | ⚠️ ALLOWED (CRIT) | ⚠️ ALLOWED | ⚠️ ALLOWED | ⚠️ SHOULD RESTRICT |
| **Read Catalog Components** | ❌ (401) | ✅ | ✅ | ✅ |
| **Delete Catalog Components (Single)** | ❌ (401) | ❌ (403) | ❌ (403) | ✅ |
| **Delete Components (Bulk Action)** | ⚠️ ALLOWED (CRIT) | ⚠️ ALLOWED | ⚠️ ALLOWED | ✅ |
| **Create Purchase Order** | ⚠️ ALLOWED (VULN) | ⚠️ ALLOWED | ✅ | ✅ |
| **Approve Purchase Order** | ⚠️ ALLOWED (VULN) | ⚠️ ALLOWED | ✅ | ✅ |
| **Post Financial Payments** | ⚠️ ALLOWED (VULN) | ⚠️ ALLOWED | ✅ | ✅ |
| **Execute Stock Adjustment** | ⚠️ ALLOWED (VULN) | ⚠️ ALLOWED | ✅ | ✅ |
| **Data Export (`POST /import-export/export`)**| ⚠️ ALLOWED (VULN) | ⚠️ ALLOWED | ⚠️ ALLOWED | ✅ |
| **ML Inference (`/v1/predict/*` via 5001)**| ⚠️ ALLOWED (CRIT) | ⚠️ ALLOWED | ⚠️ ALLOWED | ✅ |
| **ML Model Reload / Deploy (via 5001)**| ⚠️ ALLOWED (CRIT) | ⚠️ ALLOWED | ⚠️ ALLOWED | ✅ |

---

## 10. Attack Scenarios & Exploit Chains

### Scenario 1: Zero-Authentication Full ERP Takeover & Destruction (Kill Chain)
1. **Reconnaissance:** Attacker queries `GET /search?q=admin` or `GET /users` without authentication. Learns the administrator's UUID and email.
2. **Account Takeover (Method A):** Attacker sends `POST /users/<admin-uuid>/reset-password` with `{"newPassword": "HackedPassword123!"}`.
3. **Account Takeover (Method B):** Attacker sends `POST /auth/reset-password-request` with the admin's email, queries `GET /security/audit`, grabs the plaintext `resetToken`, and submits `POST /auth/reset-password`.
4. **Administrative Verification:** Attacker logs in at `POST /auth/login` and receives a session token.
5. **Complete Data Destruction:** Attacker calls `POST /settings/organization/reset` with `"confirmText": "RESET MY ORGANIZATION"` and the new password, wiping all 40 business tables in PostgreSQL.

### Scenario 2: Unauthenticated Shadow Administrator Creation
1. Attacker calls `GET /roles` (unauthenticated) to get the UUID of the `'Administrator'` role.
2. Attacker calls `POST /auth/invitations` with `{"email": "shadow@attacker.com", "roleId": "<admin-uuid>"}`.
3. The API catches the missing authorization header, proceeds anonymously, creates the invitation, and returns the secret token in the response body.
4. Attacker calls `POST /auth/invitations/accept` with the token.
5. Attacker now possesses a legitimate, active Administrator user session.

### Scenario 3: Bypassing Deletion Controls via Bulk Actions
1. A disgruntled employee with a read-only `Viewer` account attempts to delete critical components via `DELETE /components/:id`. The API blocks the request with `403 Forbidden` (`ComponentDeleteGuard`).
2. The employee instead issues `POST /import-export/bulk-action` with:
   ```json
   {
     "entityType": "Component",
     "action": "DELETE",
     "ids": ["<critical-component-1>", "<critical-component-2>"]
   }
   ```
3. Because `BulkActionsController` has no guards, the request succeeds and deletes the components from the catalog.

---

## 11. Prioritized Remediation Plan

To systematically resolve these vulnerabilities without destabilizing operational workflows, remediation should proceed in four strictly ordered phases:

### Phase 1: Immediate Critical Containment (Stop the Bleeding)
1. **Bind ML to Internal Docker Network Only:**  
   In `compose.yml`, remove host port binding `"${ML_PORT:-5001}:5001"`. Ensure the ML service is strictly internal.
2. **Remove Token from Audit Logs:**  
   In `apps/api/src/auth/auth.service.ts:236`, remove `{ resetToken }` from the audit payload.
3. **Immediately Guard User Management & Reset Endpoints:**  
   Add `@UseGuards(createPermissionGuard('Administration.Users', 'manage users'))` to `UsersController` and `RolesController`.
4. **Enforce Authentication on Invitations & Organization Reset:**  
   Remove the error swallowing in `AuthController.createInvitation` and ensure only administrators can issue invitations or reset organizations.

### Phase 2: Global API Authentication & Defensive Perimeter
1. **Implement Global Auth Guard:**  
   Register a global authentication guard in `AppModule` using `APP_GUARD`. Require all routes to be authenticated by default; introduce a `@Public()` decorator for `/auth/login`, `/auth/reset-password`, and `/health`.
2. **Implement Route-Level RBAC across all Controllers:**  
   Apply specific permission guards to each domain controller (Procurement, Finance, Manufacturing, Warehousing, CRM).
3. **Guard Bulk Actions & Import/Export:**  
   Add authorization verification in `BulkActionsController` and `ImportExportController`.
4. **Fix Root Admin Role Name in Onboarding:**  
   Change `'Admin'` to `'Administrator'` in `onboarding.service.ts:70`.

### Phase 3: Cryptographic & Session Hardening
1. **Upgrade Password Hashing:**  
   Replace unsalted SHA-256 with `argon2id` (or `bcrypt`). Add dual-hash verification during the transition period so existing passwords seamlessly upgrade upon login.
2. **Hash Stored Session Tokens:**  
   Store `crypto.createHash('sha256').update(token).digest('hex')` in `user_sessions.token_hash`.
3. **Harden Cookies & Web Storage:**  
   Move auth tokens out of `localStorage`. Issue `HttpOnly; Secure; SameSite=Strict` cookies from the API.
4. **Fix CORS & Security Headers:**  
   Configure strict whitelist origins in `main.ts`. Add CSP, HSTS, and frame protection in `next.config.mjs`.

### Phase 4: Dependency, CI/CD & Defense-in-Depth Hardening
1. **Dependency Upgrades:**  
   Upgrade `next` to `>=16.3.3` to resolve critical RCE advisories.
2. **Rate Limiting:**  
   Install `@nestjs/throttler` and apply strict rate limits to auth, export, and search endpoints.
3. **SVG Sanitization:**  
   Enforce download disposition or sanitize inline SVGs to prevent stored XSS.
4. **Pin GitHub Actions:**  
   Pin actions to full commit SHAs and introduce automated container vulnerability scanning (Trivy) into CI workflows.

---

## 12. Open Questions & Accepted Risks

### Open Questions
1. **Multi-Tenancy Intent:** Does Ananya ERP plan to remain single-tenant per deployment (one company per instance), or is multi-tenant logical partitioning required in the future?
2. **Worker & Background Jobs:** Does the background worker (`apps/api/src/worker.ts`) require elevated administrative access, and how will internal job authentication be passed?

### Accepted Risks / Intentional Behavior
---

## 13. Remediation Status Record — Phases 1 & 2 Completed

The following table summarizes the status of security vulnerabilities remediated during Phase 1 (Critical Containment) and Phase 2 (Defensive Perimeter & Authorization):

| Vulnerability ID | Description | Severity | Status | Remediated In / Mechanism | Verification |
| :--- | :--- | :---: | :---: | :--- | :--- |
| **SEC-01** | Global API Fail-Closed Authentication | **CRITICAL** | **RESOLVED** | Registered `AuthGuard` via `APP_GUARD` in `AuthModule`. Every endpoint requires authentication by default; only handlers decorated with `@Public()` opt out. Public endpoint inventory created at `docs/security/public-endpoints.md`. | Verified via `test/integration/security-remediation.integration-spec.ts` (401 on unauthenticated access across all modules). |
| **SEC-02** | Unauthenticated Pre-Auth Password Reset | **CRITICAL** | **RESOLVED** | `POST /users/:id/reset-password` guarded by `Administration.Users`. Non-admins prevented from resetting Administrator accounts. All active sessions invalidated upon password reset. Self-service reset strictly requires cryptographic token. | Verified: unauthenticated reset denied (401), non-admin denied (403), active sessions revoked. |
| **SEC-03** | Reset Token Leak in Audit Logs & Open Audit API | **CRITICAL** | **RESOLVED** | Removed plaintext `resetToken` from audit details; now records only 8-character `tokenFingerprint`. Plaintext tokens hashed with SHA-256 before storage. Guarded `GET /security/audit` with `createPermissionGuard('Administration.Security')`. | Verified: non-auditors denied (403), auditors allowed (200), zero plaintext tokens logged. |
| **SEC-04** | Unauthenticated Admin Account Creation via Invitations | **CRITICAL** | **RESOLVED** | `POST /auth/invitations` guarded with `createPermissionGuard('Administration.Users')`. Removed error-swallowing. Enforced that non-Administrators cannot invite users with the `'Administrator'` role. Token generated via `crypto.randomBytes(32)`. | Verified: anonymous calls rejected (401), non-admin cannot invite admin (403). |
| **SEC-05** | Unauthenticated Database Wipe via Organization Reset | **CRITICAL** | **RESOLVED** | `POST /settings/organization/reset` guarded with `createPermissionGuard('Administration.Roles')`. Caller ID derived strictly from `req.user.id`. Removed fallback to `users.limit(1)`. Service verifies caller role is `'Administrator'`. | Verified: anonymous denied (401), non-admin denied (403), auditor denied (403). |
| **SEC-07** | ML Service Host Port Exposure | **CRITICAL** | **RESOLVED** | Removed host port mapping `"${ML_PORT:-5001}:5001"` in `compose.yml`. ML service is strictly private to the `internal` Docker network; access mediated exclusively by authenticated API proxy. | Verified: port removed from base stack; proxy configuration confirmed. |
| **SEC-08** | Unauthenticated Import/Export & Identity Spoofing | **HIGH** | **RESOLVED** | Guarded `ImportExportController` endpoints with `Inventory.Read`, `Inventory.Update`, and `Reports.Export`. Removed `@Body('userId')` and `x-user-id` header spoofing; caller identity taken strictly from `req.user.id`. | Verified: anonymous requests rejected (401); caller ID bound to verified session. |
| **SEC-09** | Bulk Actions Authorization Bypass | **HIGH** | **RESOLVED** | `BulkActionsController` checks entity-level permissions before execution (`Administration.Roles` for roles, `PurchaseOrders.Update` for purchase orders, `Inventory.Delete`/`Update` for components). | Verified: non-admin bulk delete on roles and components rejected (403). |
| **SEC-11** | System Role Privilege Escalation & Wildcard Permissions | **HIGH** | **RESOLVED** | `RolesController` guarded with `createPermissionGuard('Administration.Roles')`. `RolesService` rejects modifying permissions on system roles (`isSystem: true`) and prevents non-Administrators from granting wildcard (`*`) permissions. | Verified: system role permissions immutable (400), wildcard escalation denied (403). |
| **SEC-12** | Root Admin Initialization Role Mismatch Bug | **HIGH** | **RESOLVED** | In `onboarding.service.ts`, changed lookup from `'Admin'` to `'Administrator'` and throw error if system role not found, ensuring bootstrap admin has root privileges and wildcard permissions. | Verified: unit tests pass; query resolves canonical system role. |

---
*Report updated autonomously following Phase 1 & 2 remediation completion.*

# Ananya ERP — Public Endpoints Inventory & Threat Boundary

**Document Version:** 1.0  
**Last Updated:** September 2026  
**Security Classification:** Confidential — Internal Security Architecture  

---

## 1. Executive Security Architecture

Ananya ERP operates on a **fail-closed default-deny API security perimeter**.

By default, every API controller and route handler is guarded by the global NestJS `AuthGuard` registered via `APP_GUARD`. Requests without a valid `Authorization: Bearer <session-token>` header are rejected with `401 Unauthorized` before controller invocation.

Only route handlers explicitly decorated with `@Public()` (`apps/api/src/auth/public.decorator.ts`) are permitted to bypass authentication. Entire controllers are **never** marked public.

---

## 2. Public Endpoints Inventory

The following table documents every authenticated opt-out (`@Public()`) endpoint in the Ananya ERP API, its functional requirement, exposed data surface, and defensive controls:

| Method | Endpoint Route | Controller | Justification | Exposed Data Surface | Security Controls & Defense-in-Depth |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/health` | `AppController` | Container orchestration, Docker healthchecks, and load balancer liveness probes. | Service status (`"ok"`), uptime, ISO timestamp. | Read-only. Does not reveal database credentials, internal IPs, or environment variables. |
| `POST` | `/auth/login` | `AuthController` | Authenticates existing users with credentials. | Session token, user identity (`id`, `email`, `firstName`, `lastName`, `role`). | SHA-256 password hash comparison. Validates account status (`ACTIVE`). Rejects `DISABLED` accounts. Creates tracked database session. Records `USER_LOGIN` audit event. |
| `POST` | `/auth/reset-password-request` | `AuthController` | Allows users who forgot their credentials to initiate a self-service password reset. | Generic confirmation message. | Rate limited. Token generated via `crypto.randomBytes(32)`. Tokens are hashed via SHA-256 before database storage. Audit logs record only an 8-character token fingerprint (`tokenFingerprint`), never plaintext tokens. 1-hour expiry. |
| `POST` | `/auth/reset-password` | `AuthController` | Allows users in possession of a valid reset token to finalize password reset. | Generic success confirmation. | Hashes input token with SHA-256 before verification. Enforces single-use consumption (`used = true`). Validates expiration. **Immediately terminates all active sessions** for the targeted account in `user_sessions`. Records `PASSWORD_RESET` audit log. |
| `GET` | `/auth/invitations/verify/:token` | `AuthController` | Displays invitation acceptance form with user's invited email address. | Invitee email address, organization name, role name. | Token validated against database. Returns 404/400 if expired or already accepted. Never reveals invitation secrets or internal IDs beyond invitee context. |
| `POST` | `/auth/invitations/accept` | `AuthController` | Allows new invitees to set their name and password to activate their user account. | Created user record without sensitive hashes. | Validates token expiration and single-use status. Creates user with the pre-assigned role specified by the authorized admin when invited. Marks invitation `ACCEPTED`. |
| `GET` | `/auth/setup-status` | `AuthController` | Allows frontend setup wizard to detect if initial onboarding is needed. | Boolean `isCompleted`, `bootstrapped`, `allowBootstrap`, completion timestamp. | Read-only boolean state. Does not leak admin credentials or sensitive tenant profile. |
| `GET` | `/auth/bootstrap-status` | `AuthController` | Compatibility alias for `/auth/setup-status`. | Boolean `isCompleted`, `bootstrapped`, `allowBootstrap`. | Same as `/auth/setup-status`. |
| `POST` | `/auth/setup-organization` | `AuthController` | First-time system initialization to establish company profile and root Administrator account. | Created admin user, organization profile, initial settings. | **Strictly one-time execution**: Checked against `organization_setup_status`. If already completed, immediately aborts with `400 Bad Request`. Automatically assigns system `'Administrator'` role with wildcard permissions (`*`). |
| `GET` | `/ml/health` | `MlController` | Web client checks if ML recommendation capabilities are available in the cluster. | ML service status and model availability. | Read-only proxy to internal Python ML service. Does not accept inputs or trigger background training. |

---

## 3. Explicitly Non-Public Endpoints (Guarded Endpoints)

The following high-risk endpoints were previously unauthenticated or under-guarded and have been remediated:

* **Security Audit Trail (`GET /security-audit`, `GET /security-audit/export`, etc.):**  
  Guarded by `createPermissionGuard('Administration.Security', 'view security audit logs')`. Plaintext reset tokens removed.
* **User Management (`/users/*`):**  
  Controller-level guard `createPermissionGuard('Administration.Users', 'manage user accounts')`. Administrative password reset (`POST /users/:id/reset-password`) strictly requires administrative authentication and invalidates all active sessions for the targeted user. Privilege escalation prevented: non-Administrators cannot assign the `'Administrator'` role or modify Administrator accounts.
* **Role & Permission Management (`/roles/*`):**  
  Controller-level guard `createPermissionGuard('Administration.Roles', 'manage roles and permissions')`. Modifying permissions on system roles (`isSystem = true`) is prohibited. Granting wildcard (`*`) permissions is restricted strictly to Administrators.
* **Organization Business Data Reset (`POST /settings/organization/reset`):**  
  Guarded by `createPermissionGuard('Administration.Roles', 'reset organization data')`. Caller identity is strictly taken from `req.user.id`. Insecure fallback to `users.limit(1)` is completely removed. Service verifies caller holds the `'Administrator'` role and requires exact password confirmation and `"RESET MY ORGANIZATION"` confirmation text.
* **User Invitations Creation (`POST /auth/invitations`):**  
  Guarded by `createPermissionGuard('Administration.Users', 'create user invitations')`. Invitation tokens generated with `crypto.randomBytes(32)`. Non-administrators cannot issue invitations for the `'Administrator'` role.
* **Import & Export Operations (`/import-export/*`):**  
  Guarded with domain permissions (`Inventory.Read`, `Inventory.Update`, `Reports.Export`). Caller identity derived solely from `req.user.id`; header and body spoofing (`x-user-id`, `@Body('userId')`) eliminated.
* **Bulk Operations (`POST /import-export/bulk-action`):**  
  Fine-grained permission check verifies caller has the specific permission required for the target entity (e.g. `Administration.Roles` for roles, `PurchaseOrders.Update` for purchase orders, `Inventory.Delete`/`Inventory.Update` for components).
* **ML Service Network Isolation:**  
  Host port 5001 unmapped in base `compose.yml`. ML service is accessible strictly over internal Docker network `internal` via authenticated NestJS API proxy.

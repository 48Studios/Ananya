# Authentication & Organization Onboarding Architecture

This document defines the authentication model, organization creation workflows, invitation mechanics, and multi-tenant membership architecture for **Ananya ERP**.

---

## 1. Core Authentication Principles

1. **Separation of Organization Creation & Membership**: Creating a brand new organization and joining an existing organization are two distinct product workflows.
2. **No Invitations Required for New Organizations**: A new user can register and initialize their own organization without requiring an invitation token.
3. **Automatic Owner Role Assignment**: The first user who creates an organization automatically becomes the **Organization Owner** (`Owner` role) with full system administration permissions (`Admin` system role).
4. **Invitations Strictly for Joining Existing Workspaces**: Invitation tokens are ONLY required when joining an established organization (`/onboarding/join`).

---

## 2. Onboarding Scenarios

### Scenario 1 — Create a New Organization (Primary Flow)
- **Route**: `/onboarding/create`
- **Flow**:
  1. **User Account Credentials**: First Name, Last Name, Email, Password.
  2. **Organization Profile**: Organization Name, Legal Name, Workspace Slug, Country, Timezone, Base Currency, Support Phone, Website.
  3. **Initialization & Login**: Automatically creates the organization profile, inserts the root user as `Owner`, creates a valid session token, and redirects to `/dashboard`.

### Scenario 2 — Join an Existing Organization
- **Route**: `/onboarding/join` or `/onboarding/join?token=<TOKEN>`
- **Flow**:
  1. **Token Validation**: Validates invitation token status (must be active, non-expired, unrevoked, and unaccepted).
  2. **Workspace Details**: Displays organization name and invited role details.
  3. **Credential Setup**: User creates password and completes name profile to join the workspace (`POST /auth/invitations/accept`).

### Scenario 3 — Existing User Sign In
- **Route**: `/login`
- **Flow**:
  1. Authenticates email and password (`POST /auth/login`).
  2. Restores session via `GET /auth/me`.
  3. Loads permissions and active organization membership.
  4. Redirects to `/dashboard`.

---

## 3. Data & Membership Model

```
User (id, email, passwordHash)
  │
  └─── OrganizationMembership (userId, organizationId, roleId, joinedAt)
         │
         └─── Organization (id, companyName, legalName, taxId, timezone, currency)
```

- Users are NOT hardcoded to a single organization.
- Memberships map users to organizations with specific RBAC roles and permission scopes.
- Switching active organizations requires updating the active membership scope without forcing re-authentication.

---

## 4. Security & Guard Boundaries

- **Public Onboarding Routes**: `/onboarding`, `/onboarding/create`, `/onboarding/join`, `/login`, `/forgot-password`, `/reset-password`.
- **Global 401 Interceptor**: Any HTTP 401 response purges local tokens/cookies, broadcasts `SESSION_EXPIRED` across browser tabs via `BroadcastChannel`, and redirects to `/login?expired=true`.

---
kind: error_handling
name: Domain Error Types with Per-Controller Exception Filters in NestJS API
category: error_handling
scope:
    - '**'
source_files:
    - packages/core/src/errors/domain-error.ts
    - packages/inventory/src/categories/category.errors.ts
    - packages/inventory/src/components/component.errors.ts
    - apps/api/src/common/utils/postgres-error.ts
    - apps/api/src/locations/location-exception.filter.ts
    - apps/api/src/boms/bom-exception.filter.ts
    - apps/api/src/categories/category-exception.filter.ts
    - apps/api/src/components/component-exception.filter.ts
    - apps/api/src/cycle-counts/cycle-count-exception.filter.ts
    - apps/api/src/goods-receipts/gr-exception.filter.ts
    - apps/api/src/main.ts
---

## Overview

The Ananya ERP monorepo uses a layered error-handling strategy centered on **domain-specific error classes** defined in shared packages and translated into HTTP responses by **per-controller `ExceptionFilter` implementations** in the NestJS API. The pattern keeps business-rule violations out of the transport layer while still producing consistent, typed JSON error responses.

## Architecture

### Domain errors live in domain packages

Each bounded context package under `packages/` defines its own error types that extend a common base:

- `packages/core/src/errors/domain-error.ts` exports `DomainError extends Error`, documented as "the base error class for all domain errors".
- Domain packages re-export their errors (e.g. `@ananya/inventory` exposes `CategoryCodeAlreadyExistsError`, `ComponentNotFoundError`, `InvalidUnitError`; `@ananya/manufacturing` exposes `BomNotFoundError`, `CircularBomDependencyError`; `@ananya/warehouse` exposes `ImmutableCycleCountError`; `@ananya/procurement` exposes `GoodsReceiptNotFoundError`).
- Errors are thrown from service/repository code inside those packages when invariants are violated (e.g. duplicate SKU, invalid status transition, missing parent location).

### API controllers throw Nest built-ins for transport-layer concerns

Controllers and services in `apps/api/src/*` use Nest's built-in exceptions for request-level problems:
- `BadRequestException`, `NotFoundException`, `UnauthorizedException`, `ForbiddenException` — thrown directly in auth guards (`auth/permission.guard.ts`), auth service (`auth/auth.service.ts`), and feature services (e.g. `accounts.service.ts`, `attributes.service.ts`).
- These are handled by Nest's default exception pipeline; they do not go through custom filters.

### Per-domain `ExceptionFilter`s translate domain errors to HTTP

Every feature module that can throw domain errors registers a controller-scoped filter via the `@UseFilters(...)` decorator:

| Controller | Filter | Domain package |
|---|---|---|
| `boms.controller.ts` | `BomExceptionFilter` | `@ananya/manufacturing` |
| `categories.controller.ts` | `CategoryExceptionFilter` | `@ananya/inventory` |
| `components.controller.ts` | `ComponentExceptionFilter` | `@ananya/inventory` + local `pending-component-entity.errors` |
| `cycle-counts.controller.ts` | `CycleCountExceptionFilter` | `@ananya/warehouse` |
| `goods-receipts.controller.ts` | `GrExceptionFilter` | `@ananya/procurement` |
| `locations.controller.ts` | `LocationExceptionFilter` | `@ananya/inventory` |
| `manufacturers.controller.ts` | `ManufacturerExceptionFilter` | `@ananya/inventory` |
| `production-orders.controller.ts` | `ProductionOrderExceptionFilter` | `@ananya/manufacturing` |
| `projects.controller.ts` | `ProjectExceptionFilter` | `@ananya/projects` |
| `purchase-orders.controller.ts` | `PoExceptionFilter` | `@ananya/procurement` |
| `reservations.controller.ts` | `ReservationExceptionFilter` | `@inventory` |
| `stock-adjustments.controller.ts` | `AdjustmentExceptionFilter` | `@inventory` |
| `suppliers.controller.ts` | `SupplierExceptionFilter` | `@inventory` |
| `units.controller.ts` | `UnitExceptionFilter` | `@inventory` |
| `warehouse-transfers.controller.ts` | `WarehouseTransferExceptionFilter` | `@inventory` |

Each filter follows the same shape: `@Catch(A, B, C)`, then an `if/else if` chain mapping each error type to an `HttpStatus` and echoing `exception.message` back in a uniform JSON body `{ statusCode, error, message }`.

### Global fallback: `LocationExceptionFilter`

`apps/api/src/main.ts` registers `LocationExceptionFilter` as a **global filter** via `app.useGlobalFilters(new LocationExceptionFilter())`. This filter is intentionally broad — it uses `@Catch()` without arguments and additionally handles:
- Postgres constraint violations via `common/utils/postgres-error.ts` (`isPostgresErrorCode`, constants `POSTGRES_UNIQUE_VIOLATION = '23505'`, `POSTGRES_FOREIGN_KEY_VIOLATION = '23503'`), unwrapping Drizzle's `cause` chain up to depth 5 to find the SQLSTATE code.
- Any `HttpException` already produced by Nest (e.g. validation pipe failures), extracting either a string or the `message` field (including arrays joined with commas).

This makes it the catch-all for unhandled domain and database errors across the application.

## Conventions

1. **Domain logic throws typed `DomainError` subclasses**, never raw `Error` or strings. Each error carries a human-readable message constructed in its constructor.
2. **Transport-layer problems** (bad input, auth failures) use Nest's built-in `*Exception` classes so the global validation pipe and default handler can process them uniformly.
3. **Each feature module owns its filter** colocated next to the controller (`x-exception.filter.ts`) and declares exactly which error types it knows about via `@Catch(...)`.
4. **HTTP status mapping is explicit per error**: `NotFound` → 404, `Conflict` (duplicate / referenced-by) → 409, `BadRequest` (invalid state / value) → 400, unknown → 500.
5. **Response envelope is uniform**: `{ statusCode, error: HttpStatus[status], message }` — clients can rely on this shape.
6. **Database errors are not surfaced raw**: `postgres-error.ts` centralizes SQLSTATE inspection so repository code can throw domain errors instead of leaking driver errors, and the global filter translates foreign-key violations to 409 Conflict with a stable user-facing message.
7. **No panics / no `try/catch` bubbles**: errors propagate up to the nearest filter; there is no `process.exit` or `throw new Error('unreachable')` pattern observed in production paths.

## Key files

- `packages/core/src/errors/domain-error.ts` — base `DomainError`
- `packages/inventory/src/categories/category.errors.ts`, `packages/inventory/src/components/component.errors.ts`, `packages/inventory/src/.../*.errors.ts` — domain error definitions
- `apps/api/src/common/utils/postgres-error.ts` — Drizzle/pg error unwrapping and SQLSTATE helpers
- `apps/api/src/locations/location-exception.filter.ts` — global catch-all filter
- `apps/api/src/boms/bom-exception.filter.ts`, `category-exception.filter.ts`, `component-exception.filter.ts`, `cycle-count-exception.filter.ts`, `gr-exception.filter.ts` — per-domain filters
- `apps/api/src/main.ts` — bootstraps global filter, validation pipe, logging interceptor
- Feature controllers using `@UseFilters(...)` — e.g. `boms.controller.ts`, `categories.controller.ts`, `components.controller.ts`, `locations.controller.ts`, etc.
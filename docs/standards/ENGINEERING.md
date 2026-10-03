# Engineering Standards

## Overview

This document outlines the engineering standards and conventions used in the Ananya codebase. These standards ensure consistency, maintainability, and scalability across all modules.

## TypeScript Conventions

### Naming Conventions

- Use PascalCase for classes, interfaces, and types
- Use camelCase for variables and functions
- Use UPPER_CASE for constants
- Prefix abstract classes with `Abstract`
- Suffix error classes with `Error`

### Error Handling

All domain errors should extend the `DomainError` class from `@ananya/core`. This ensures consistent error handling across the application.

### Type Safety

Prefer explicit typing over inference where it improves readability. Use interfaces for object shapes and types for primitive values.

## Package Structure

### Core Packages

- `@ananya/core`: Contains shared engineering concepts like DomainError hierarchy and ObjectId value object
- `@ananya/database`: Database schema and persistence infrastructure
- `@ananya/inventory`: Inventory domain logic
- `@ananya/shared`: Shared contracts and utilities

### Domain Packages

- `@ananya/procurement`: Procurement bounded context (suppliers, purchase orders, goods receipts)
- `@ananya/manufacturing`: Manufacturing bounded context (BOMs, production orders, material consumption)
- `@ananya/warehouse`: Warehouse bounded context (bins, transfers, stock counts)
- `@ananya/sales`: Sales bounded context (customers, quotations, sales orders, shipping)
- `@ananya/finance`: Finance bounded context (chart of accounts, GL, AR, AP, payments)
- `@ananya/crm`: CRM bounded context (leads, accounts, opportunities)
- `@ananya/projects`: Projects bounded context (tasks, milestones, time tracking)
- `@ananya/service`: Field service bounded context (service requests, repairs, warranty)
- `@ananya/mrp`: Material Requirements Planning bounded context (gross/net calculations, supply planning)

### Workspace Package Boundaries

Every internal workspace package must be explicitly declared as a dependency by any workspace that consumes it, including tooling packages used via `extends`. Never rely on implicit transitive hoisting.

## Code Organization

### Modules

Each module should have a clear boundary and responsibility. Modules should not directly depend on other modules in the same layer.

### Dependency Direction

```
Web Application → API Layer → Domain Modules → Database Abstractions → PostgreSQL
```

### Repository Pattern

- Repositories are interfaces that define data access contracts
- Implementations are provided by database packages
- No direct database access in domain modules

## Testing

All domain logic must be unit tested. Integration tests should cover repository implementations and API endpoints.

## Documentation

Documentation is treated as part of the codebase.

Documentation should:

- Describe the current implementation.
- Avoid duplicating information.
- Avoid documenting planned features.
- Link to related documents instead of repeating content.
- Be updated alongside code changes.

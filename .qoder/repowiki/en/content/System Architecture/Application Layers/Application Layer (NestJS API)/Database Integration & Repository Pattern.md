# Database Integration & Repository Pattern

<cite>
**Referenced Files in This Document**
- [packages/database/src/index.ts](file://packages/database/src/index.ts)
- [packages/database/src/executor.ts](file://packages/database/src/executor.ts)
- [packages/database/src/query.ts](file://packages/database/src/query.ts)
- [packages/database/src/schema/index.ts](file://packages/database/src/schema/index.ts)
- [packages/database/src/schema/components.ts](file://packages/database/src/schema/components.ts)
- [packages/database/src/schema/sales-orders.ts](file://packages/database/src/schema/sales-orders.ts)
- [packages/database/src/schema/inventory-transactions.ts](file://packages/database/src/schema/inventory-transactions.ts)
- [packages/database/drizzle.config.ts](file://packages/database/drizzle.config.ts)
- [apps/api/src/database/database.module.ts](file://apps/api/src/database/database.module.ts)
- [apps/api/src/database/database.constants.ts](file://apps/api/src/database/database.constants.ts)
- [apps/api/src/infrastructure/repositories/drizzle-component.repository.ts](file://apps/api/src/infrastructure/repositories/drizzle-component.repository.ts)
- [apps/api/src/infrastructure/repositories/drizzle-sales-order.repository.ts](file://apps/api/src/infrastructure/repositories/drizzle-sales-order.repository.ts)
- [apps/api/src/infrastructure/repositories/drizzle-inventory-transaction.repository.ts](file://apps/api/src/infrastructure/repositories/drizzle-inventory-transaction.repository.ts)
- [apps/api/test/integration/database.integration-spec.ts](file://apps/api/test/integration/database.integration-spec.ts)
- [docs/database/README.md](file://docs/database/README.md)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)

## Introduction
This document explains how Ananya ERP integrates with PostgreSQL using Drizzle ORM and implements a repository pattern for database access. It covers schema management, migrations, connection pooling, transaction handling, query building, entity relationships, and performance strategies. The repository layer abstracts persistence details from domain services while preserving type safety through Drizzle-generated types and shared query helpers.

The database package owns schema definitions, migrations, and database connections. Domain code defines repository interfaces; the API layer provides Drizzle-backed implementations.

**Section sources**
- [docs/database/README.md:1-85](file://docs/database/README.md#L1-L85)

## Project Structure
Ananya’s database integration is split between a shared database package and API-specific repository implementations:

- Database package (`packages/database`)
  - Schema definitions under `src/schema`
  - Connection and pool initialization under `src/index.ts`
  - Transaction executor abstraction under `src/executor.ts`
  - Query helper re-exports under `src/query.ts`
  - Drizzle configuration under `drizzle.config.ts`
- API application (`apps/api`)
  - NestJS module exposing Drizzle client and pool as global providers
  - Repository implementations under `src/infrastructure/repositories`

```mermaid
graph TB
subgraph "Database Package"
IDX["packages/database/src/index.ts"]
EXEC["packages/database/src/executor.ts"]
QUERY["packages/database/src/query.ts"]
SCHEMA_IDX["packages/database/src/schema/index.ts"]
CFG["packages/database/drizzle.config.ts"]
end
subgraph "API Application"
MOD["apps/api/src/database/database.module.ts"]
CONST["apps/api/src/database/database.constants.ts"]
REPO_COMP["apps/api/src/infrastructure/repositories/drizzle-component.repository.ts"]
REPO_SALES["apps/api/src/infrastructure/repositories/drizzle-sales-order.repository.ts"]
REPO_INVTX["apps/api/src/infrastructure/repositories/drizzle-inventory-transaction.repository.ts"]
end
CFG --> IDX
IDX --> MOD
MOD --> CONST
MOD --> REPO_COMP
MOD --> REPO_SALES
MOD --> REPO_INVTX
SCHEMA_IDX --> REPO_COMP
SCHEMA_IDX --> REPO_SALES
SCHEMA_IDX --> REPO_INVTX
QUERY --> REPO_COMP
QUERY --> REPO_SALES
QUERY --> REPO_INVTX
EXEC --> REPO_COMP
EXEC --> REPO_INVTX
```

**Diagram sources**
- [packages/database/src/index.ts:1-61](file://packages/database/src/index.ts#L1-L61)
- [packages/database/src/executor.ts:1-62](file://packages/database/src/executor.ts#L1-L62)
- [packages/database/src/query.ts:1-17](file://packages/database/src/query.ts#L1-L17)
- [packages/database/src/schema/index.ts:1-61](file://packages/database/src/schema/index.ts#L1-L61)
- [packages/database/drizzle.config.ts:1-23](file://packages/database/drizzle.config.ts#L1-L23)
- [apps/api/src/database/database.module.ts:1-20](file://apps/api/src/database/database.module.ts#L1-L20)
- [apps/api/src/database/database.constants.ts:1-3](file://apps/api/src/database/database.constants.ts#L1-L3)
- [apps/api/src/infrastructure/repositories/drizzle-component.repository.ts:1-157](file://apps/api/src/infrastructure/repositories/drizzle-component.repository.ts#L1-L157)
- [apps/api/src/infrastructure/repositories/drizzle-sales-order.repository.ts:1-154](file://apps/api/src/infrastructure/repositories/drizzle-sales-order.repository.ts#L1-L154)
- [apps/api/src/infrastructure/repositories/drizzle-inventory-transaction.repository.ts:1-114](file://apps/api/src/infrastructure/repositories/drizzle-inventory-transaction.repository.ts#L1-L114)

**Section sources**
- [packages/database/src/index.ts:1-61](file://packages/database/src/index.ts#L1-L61)
- [packages/database/src/executor.ts:1-62](file://packages/database/src/executor.ts#L1-L62)
- [packages/database/src/query.ts:1-17](file://packages/database/src/query.ts#L1-L17)
- [packages/database/src/schema/index.ts:1-61](file://packages/database/src/schema/index.ts#L1-L61)
- [packages/database/drizzle.config.ts:1-23](file://packages/database/drizzle.config.ts#L1-L23)
- [apps/api/src/database/database.module.ts:1-20](file://apps/api/src/database/database.module.ts#L1-L20)
- [apps/api/src/database/database.constants.ts:1-3](file://apps/api/src/database/database.constants.ts#L1-L3)

## Core Components
- Connection and pooling
  - Lazy initialization of a PostgreSQL connection pool and Drizzle client
  - Global proxies expose `db` and `pool` without requiring explicit instantiation
  - Graceful shutdown via `closeDatabaseConnection()`
- Transaction executor abstraction
  - `DbExecutor` unifies root client and transaction handles
  - `toDbExecutor(tx)` enables repositories to participate in multi-repository transactions
- Query helpers
  - Re-exported Drizzle operators for filtering, ordering, aggregation, and raw SQL fragments
- Schema registry
  - Central index exports all table schemas used by repositories

Key responsibilities:
- Provide a single source of truth for database connectivity
- Keep repository implementations independent of connection lifecycle
- Enable atomic operations across multiple repositories

**Section sources**
- [packages/database/src/index.ts:1-61](file://packages/database/src/index.ts#L1-L61)
- [packages/database/src/executor.ts:1-62](file://packages/database/src/executor.ts#L1-L62)
- [packages/database/src/query.ts:1-17](file://packages/database/src/query.ts#L1-L17)
- [packages/database/src/schema/index.ts:1-61](file://packages/database/src/schema/index.ts#L1-L61)

## Architecture Overview
The system follows a layered architecture:

- Domain layer defines repository interfaces
- Infrastructure layer implements repositories using Drizzle
- Database package manages schema, migrations, and connections
- NestJS exposes Drizzle client and pool globally

```mermaid
sequenceDiagram
participant Service as "Domain Service"
participant Repo as "Drizzle Repository"
participant DB as "Drizzle Client (db)"
participant Pool as "PostgreSQL Pool"
participant PG as "PostgreSQL"
Service->>Repo : Call repository method
Repo->>DB : Build query using Drizzle
DB->>Pool : Acquire connection
Pool-->>DB : Return connection
DB->>PG : Execute SQL
PG-->>DB : Return rows
DB-->>Repo : Rows
Repo-->>Service : Domain model(s)
```

**Diagram sources**
- [packages/database/src/index.ts:1-61](file://packages/database/src/index.ts#L1-L61)
- [apps/api/src/infrastructure/repositories/drizzle-component.repository.ts:1-157](file://apps/api/src/infrastructure/repositories/drizzle-component.repository.ts#L1-L157)
- [apps/api/src/infrastructure/repositories/drizzle-sales-order.repository.ts:1-154](file://apps/api/src/infrastructure/repositories/drizzle-sales-order.repository.ts#L1-L154)
- [apps/api/src/infrastructure/repositories/drizzle-inventory-transaction.repository.ts:1-114](file://apps/api/src/infrastructure/repositories/drizzle-inventory-transaction.repository.ts#L1-L114)

## Detailed Component Analysis

### Connection Management and Pooling
- Lazy pool creation ensures environment variables are available before connecting
- Global `db` proxy defers Drizzle initialization until first use
- Test suite verifies lazy initialization and connection closure

```mermaid
flowchart TD
Start(["Process start"]) --> CheckEnv["Check DATABASE_URL"]
CheckEnv --> HasUrl{"DATABASE_URL set?"}
HasUrl --> |No| ThrowErr["Throw configuration error"]
HasUrl --> |Yes| CreatePool["Create pg.Pool"]
CreatePool --> CreateDb["Create drizzle(client)"]
CreateDb --> ProxyDb["Expose db proxy"]
ProxyDb --> Ready(["Ready for queries"])
```

**Diagram sources**
- [packages/database/src/index.ts:1-61](file://packages/database/src/index.ts#L1-L61)
- [apps/api/test/integration/database.integration-spec.ts:1-39](file://apps/api/test/integration/database.integration-spec.ts#L1-L39)

**Section sources**
- [packages/database/src/index.ts:1-61](file://packages/database/src/index.ts#L1-L61)
- [apps/api/test/integration/database.integration-spec.ts:1-39](file://apps/api/test/integration/database.integration-spec.ts#L1-L39)

### Transaction Handling and Atomic Operations
- Repositories accept a `DbExecutor`, defaulting to the global client
- Multi-repository operations can be wrapped in `db.transaction(...)` and pass a shared executor
- This design prevents partial updates during complex workflows such as component consolidation

```mermaid
sequenceDiagram
participant Orchestrator as "Orchestrating Service"
participant Tx as "db.transaction"
participant Exec as "DbExecutor (tx)"
participant RepoA as "Component Repository"
participant RepoB as "Inventory Transaction Repository"
Orchestrator->>Tx : Begin transaction
Tx-->>Orchestrator : Callback with tx
Orchestrator->>Exec : toDbExecutor(tx)
Orchestrator->>RepoA : Save with executor
Orchestrator->>RepoB : Save with executor
RepoA->>Exec : Commit-scoped query
RepoB->>Exec : Commit-scoped query
Exec-->>Orchestrator : Success or rollback
```

**Diagram sources**
- [packages/database/src/executor.ts:1-62](file://packages/database/src/executor.ts#L1-L62)
- [apps/api/src/infrastructure/repositories/drizzle-component.repository.ts:1-157](file://apps/api/src/infrastructure/repositories/drizzle-component.repository.ts#L1-L157)
- [apps/api/src/infrastructure/repositories/drizzle-inventory-transaction.repository.ts:1-114](file://apps/api/src/infrastructure/repositories/drizzle-inventory-transaction.repository.ts#L1-L114)

**Section sources**
- [packages/database/src/executor.ts:1-62](file://packages/database/src/executor.ts#L1-L62)

### Repository Pattern Implementation

#### Component Repository
Responsibilities:
- Find components by ID or SKU
- List components
- Create, update, and delete components
- Map database rows to domain models and back
- Handle unique constraint violations with domain errors

```mermaid
classDiagram
class DrizzleComponentRepository {
+findById(id) Promise~Component|null~
+findBySku(sku) Promise~Component|null~
+findMany() Promise~Component[]~
+save(component) Promise~Component~
+update(component) Promise~Component~
+delete(id) Promise~void~
}
class ComponentAggregate {
+rehydrate(data) Component
}
DrizzleComponentRepository --> ComponentAggregate : "maps rows to domain"
```

**Diagram sources**
- [apps/api/src/infrastructure/repositories/drizzle-component.repository.ts:1-157](file://apps/api/src/infrastructure/repositories/drizzle-component.repository.ts#L1-L157)

**Section sources**
- [apps/api/src/infrastructure/repositories/drizzle-component.repository.ts:1-157](file://apps/api/src/infrastructure/repositories/drizzle-component.repository.ts#L1-L157)

#### Sales Order Repository
Responsibilities:
- Load orders with lines
- Filter orders by customer and status
- Upsert orders and lines using conflict resolution
- Generate next order number using aggregation

```mermaid
classDiagram
class DrizzleSalesOrderRepository {
+findById(id) Promise~SalesOrder|null~
+findByOrderNumber(orderNumber) Promise~SalesOrder|null~
+findMany(options) Promise~SalesOrder[]~
+save(salesOrder) Promise~void~
+generateNextOrderNumber() Promise~string~
}
```

**Diagram sources**
- [apps/api/src/infrastructure/repositories/drizzle-sales-order.repository.ts:1-154](file://apps/api/src/infrastructure/repositories/drizzle-sales-order.repository.ts#L1-L154)

**Section sources**
- [apps/api/src/infrastructure/repositories/drizzle-sales-order.repository.ts:1-154](file://apps/api/src/infrastructure/repositories/drizzle-sales-order.repository.ts#L1-L154)

#### Inventory Transaction Repository
Responsibilities:
- Find transactions by filters including component, location, type, creator, and search text
- Insert new inventory transactions
- Map rows to domain models

```mermaid
classDiagram
class DrizzleInventoryTransactionRepository {
+findById(id) Promise~InventoryTransaction|null~
+findMany(options) Promise~InventoryTransaction[]~
+save(transaction) Promise~InventoryTransaction~
}
```

**Diagram sources**
- [apps/api/src/infrastructure/repositories/drizzle-inventory-transaction.repository.ts:1-114](file://apps/api/src/infrastructure/repositories/drizzle-inventory-transaction.repository.ts#L1-L114)

**Section sources**
- [apps/api/src/infrastructure/repositories/drizzle-inventory-transaction.repository.ts:1-114](file://apps/api/src/infrastructure/repositories/drizzle-inventory-transaction.repository.ts#L1-L114)

### Entity Relationships and Schema Design
Key relationships:
- Sales orders belong to customers and optionally originate from quotations
- Sales order lines reference components
- Inventory transactions reference components and locations
- Components may be consolidated into canonical components

```mermaid
erDiagram
CUSTOMERS {
uuid id PK
}
QUOTATIONS {
uuid id PK
}
SALES_ORDERS {
uuid id PK
varchar order_number UK
uuid customer_id FK
timestamp order_date
timestamp required_date
varchar status
uuid quotation_id FK
}
SALES_ORDER_LINES {
uuid id PK
uuid sales_order_id FK
uuid component_id FK
numeric quantity
numeric unit_price
numeric discount
numeric tax
numeric total_price
numeric reserved_quantity
numeric fulfilled_quantity
}
COMPONENTS {
uuid id PK
varchar sku UK
varchar manufacturer_part_number
varchar name
varchar description
uuid manufacturer_id
uuid category_id
uuid default_location_id
varchar unit
boolean is_active
uuid consolidated_into_component_id
uuid consolidation_id
timestamp consolidated_at
}
LOCATIONS {
uuid id PK
}
INVENTORY_TRANSACTIONS {
uuid id PK
uuid component_id FK
varchar transaction_type
integer quantity
varchar unit_of_measure
uuid source_location_id FK
uuid destination_location_id FK
varchar reference
varchar reason
varchar created_by
}
CUSTOMERS ||--o{ SALES_ORDERS : "has many"
QUOTATIONS ||--o{ SALES_ORDERS : "referenced by"
SALES_ORDERS ||--o{ SALES_ORDER_LINES : "contains"
COMPONENTS ||--o{ SALES_ORDER_LINES : "referenced by"
COMPONENTS ||--o{ INVENTORY_TRANSACTIONS : "tracked by"
LOCATIONS ||--o{ INVENTORY_TRANSACTIONS : "source/destination"
```

**Diagram sources**
- [packages/database/src/schema/sales-orders.ts:1-83](file://packages/database/src/schema/sales-orders.ts#L1-L83)
- [packages/database/src/schema/components.ts:1-130](file://packages/database/src/schema/components.ts#L1-L130)
- [packages/database/src/schema/inventory-transactions.ts:1-79](file://packages/database/src/schema/inventory-transactions.ts#L1-L79)

**Section sources**
- [packages/database/src/schema/sales-orders.ts:1-83](file://packages/database/src/schema/sales-orders.ts#L1-L83)
- [packages/database/src/schema/components.ts:1-130](file://packages/database/src/schema/components.ts#L1-L130)
- [packages/database/src/schema/inventory-transactions.ts:1-79](file://packages/database/src/schema/inventory-transactions.ts#L1-L79)

### Migrations and Schema Management
- Drizzle configuration reads `DATABASE_URL` and points to the schema entry point
- Migrations live under `packages/database/drizzle`
- Schema changes must include corresponding migration files

```mermaid
flowchart TD
Dev["Developer modifies schema"] --> Kit["Run Drizzle Kit commands"]
Kit --> Migration["Generate migration file"]
Migration --> Apply["Apply migration to database"]
Apply --> Verify["Verify schema and indexes"]
```

**Diagram sources**
- [packages/database/drizzle.config.ts:1-23](file://packages/database/drizzle.config.ts#L1-L23)

**Section sources**
- [packages/database/drizzle.config.ts:1-23](file://packages/database/drizzle.config.ts#L1-L23)
- [docs/database/README.md:59-65](file://docs/database/README.md#L59-L65)

### Query Building Patterns
Common patterns observed in repositories:
- Single-row lookups with `select().from(...).where(eq(...)).limit(1)`
- Filtering with optional conditions using builder composition
- Ordering results with `desc` or `asc`
- Aggregation with `count()`
- Case normalization and string matching with `ilike`

Examples:
- Component lookup by ID or SKU
- Sales order listing with optional filters
- Inventory transaction search across reference and reason fields

**Section sources**
- [apps/api/src/infrastructure/repositories/drizzle-component.repository.ts:68-95](file://apps/api/src/infrastructure/repositories/drizzle-component.repository.ts#L68-L95)
- [apps/api/src/infrastructure/repositories/drizzle-sales-order.repository.ts:46-93](file://apps/api/src/infrastructure/repositories/drizzle-sales-order.repository.ts#L46-L93)
- [apps/api/src/infrastructure/repositories/drizzle-inventory-transaction.repository.ts:58-99](file://apps/api/src/infrastructure/repositories/drizzle-inventory-transaction.repository.ts#L58-L99)

### Data Access Abstraction
- Repositories encapsulate persistence logic behind domain-oriented methods
- Mapping functions convert between database rows and domain aggregates
- Shared query helpers keep filter expressions consistent and readable

Benefits:
- Decouples business logic from database specifics
- Enables testing with alternative executors or mocks
- Improves maintainability and clarity

**Section sources**
- [apps/api/src/infrastructure/repositories/drizzle-component.repository.ts:26-63](file://apps/api/src/infrastructure/repositories/drizzle-component.repository.ts#L26-L63)
- [apps/api/src/infrastructure/repositories/drizzle-sales-order.repository.ts:15-44](file://apps/api/src/infrastructure/repositories/drizzle-sales-order.repository.ts#L15-L44)
- [apps/api/src/infrastructure/repositories/drizzle-inventory-transaction.repository.ts:13-43](file://apps/api/src/infrastructure/repositories/drizzle-inventory-transaction.repository.ts#L13-L43)

## Dependency Analysis
NestJS exposes Drizzle client and pool as global providers so modules can inject them consistently.

```mermaid
graph LR
DBMOD["DatabaseModule"] --> DC["DATABASE_CONNECTION"]
DBMOD --> DP["DATABASE_POOL"]
DC --> DRIZZLE["drizzle client"]
DP --> POOL["pg.Pool"]
```

**Diagram sources**
- [apps/api/src/database/database.module.ts:1-20](file://apps/api/src/database/database.module.ts#L1-L20)
- [apps/api/src/database/database.constants.ts:1-3](file://apps/api/src/database/database.constants.ts#L1-L3)

**Section sources**
- [apps/api/src/database/database.module.ts:1-20](file://apps/api/src/database/database.module.ts#L1-L20)
- [apps/api/src/database/database.constants.ts:1-3](file://apps/api/src/database/database.constants.ts#L1-L3)

## Performance Considerations
Indexing strategy:
- Unique constraints on identifiers and business keys
- Indexes on foreign keys and frequently filtered columns
- Partial and functional indexes for normalized searches and active-record filtering

Query optimization tips:
- Use targeted `where` clauses and avoid unnecessary joins
- Prefer pagination and limiting result sets
- Use aggregation functions like `count` for counters instead of loading full rows
- Normalize data at the repository layer to reduce repeated transformations

Connection tuning:
- Ensure `DATABASE_URL` is configured correctly
- Monitor pool usage and adjust pool size based on workload
- Close connections gracefully in tests and long-running processes

**Section sources**
- [packages/database/src/schema/components.ts:90-125](file://packages/database/src/schema/components.ts#L90-L125)
- [packages/database/src/schema/sales-orders.ts:35-77](file://packages/database/src/schema/sales-orders.ts#L35-L77)
- [packages/database/src/schema/inventory-transactions.ts:61-73](file://packages/database/src/schema/inventory-transactions.ts#L61-L73)
- [apps/api/test/integration/database.integration-spec.ts:1-39](file://apps/api/test/integration/database.integration-spec.ts#L1-L39)

## Troubleshooting Guide
Common issues and resolutions:
- Missing `DATABASE_URL`
  - Cause: Environment variable not set
  - Resolution: Configure `DATABASE_URL` before starting the application
- Unique constraint violations
  - Cause: Duplicate values inserted
  - Resolution: Catch Postgres error codes and map to domain errors
- Lazy initialization failures
  - Cause: Attempting to use `db` or `pool` before configuration
  - Resolution: Ensure environment is ready and test cleanup calls `closeDatabaseConnection`

Operational checks:
- Validate that Drizzle migrations are applied
- Confirm indexes exist for high-cardinality and frequently filtered columns
- Review repository methods for N+1 queries and consider batching or joins where appropriate

**Section sources**
- [packages/database/src/index.ts:7-18](file://packages/database/src/index.ts#L7-L18)
- [apps/api/src/infrastructure/repositories/drizzle-component.repository.ts:97-115](file://apps/api/src/infrastructure/repositories/drizzle-component.repository.ts#L97-L115)
- [apps/api/test/integration/database.integration-spec.ts:1-39](file://apps/api/test/integration/database.integration-spec.ts#L1-L39)

## Conclusion
Ananya ERP’s database integration centers on a clean separation between domain logic and persistence. Drizzle ORM provides type-safe schema definitions and query building, while the repository pattern encapsulates data access. Connection pooling and transaction support ensure reliable and efficient operations. With careful indexing, query construction, and error handling, the system scales effectively and remains maintainable as new domains are added.
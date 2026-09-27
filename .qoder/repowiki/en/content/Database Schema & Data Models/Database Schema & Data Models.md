# Database Schema & Data Models

<cite>
**Referenced Files in This Document**
- [packages/database/src/schema/index.ts](file://packages/database/src/schema/index.ts)
- [packages/database/src/schema/components.ts](file://packages/database/src/schema/components.ts)
- [packages/database/src/schema/inventory-transactions.ts](file://packages/database/src/schema/inventory-transactions.ts)
- [packages/database/src/schema/sales-orders.ts](file://packages/database/src/schema/sales-orders.ts)
- [packages/database/src/schema/auth.ts](file://packages/database/src/schema/auth.ts)
- [packages/database/src/schema/journal-entries.ts](file://packages/database/src/schema/journal-entries.ts)
- [packages/database/src/schema/customers.ts](file://packages/database/src/schema/customers.ts)
- [packages/database/src/schema/warehouses.ts](file://packages/database/src/schema/warehouses.ts)
- [packages/database/src/schema/purchase-orders.ts](file://packages/database/src/schema/purchase-orders.ts)
- [packages/database/src/schema/accounts.ts](file://packages/database/src/schema/accounts.ts)
- [packages/database/src/schema/payments.ts](file://packages/database/src/schema/payments.ts)
- [packages/database/src/schema/bank-reconciliations.ts](file://packages/database/src/schema/bank-reconciliations.ts)
- [packages/database/src/index.ts](file://packages/database/src/index.ts)
- [packages/database/drizzle.config.ts](file://packages/database/drizzle.config.ts)
- [packages/database/src/setup/migrate.ts](file://packages/database/src/setup/migrate.ts)
- [apps/api/src/infrastructure/repositories/drizzle-sales-order.repository.ts](file://apps/api/src/infrastructure/repositories/drizzle-sales-order.repository.ts)
- [docs/database/README.md](file://docs/database/README.md)
</cite>

## Table of Contents
1. Introduction
2. Project Structure
3. Core Components
4. Architecture Overview
5. Detailed Component Analysis
6. Dependency Analysis
7. Performance Considerations
8. Troubleshooting Guide
9. Conclusion
10. Appendices

## Introduction
This document describes the PostgreSQL database schema and data models for Ananya ERP, focusing on entity relationships, field definitions, data types, keys, indexes, constraints, and validation rules across key domains: Components, Transactions, Orders, Users, and Financial records. It also explains how Drizzle ORM is used to access data, outlines repository patterns, and provides guidance on migrations, backups, performance tuning, data lifecycle, security, and privacy.

## Project Structure
The persistence layer is centralized in the database package. Schema files define tables, columns, constraints, and indexes using Drizzle’s PostgreSQL dialect. The package exposes a shared database client and pool, migration utilities, and an index that re-exports all domain schemas.

```mermaid
graph TB
subgraph "Database Package"
IDX["Schema Index<br/>packages/database/src/schema/index.ts"]
C["Components<br/>components.ts"]
IT["Inventory Transactions<br/>inventory-transactions.ts"]
SO["Sales Orders<br/>sales-orders.ts"]
AUTH["Auth & Security<br/>auth.ts"]
JN["Journal Entries<br/>journal-entries.ts"]
CU["Customers<br/>customers.ts"]
WH["Warehouses<br/>warehouses.ts"]
PO["Purchase Orders<br/>purchase-orders.ts"]
AC["Accounts<br/>accounts.ts"]
PM["Payments<br/>payments.ts"]
BR["Bank Reconciliations<br/>bank-reconciliations.ts"]
end
IDX --> C
IDX --> IT
IDX --> SO
IDX --> AUTH
IDX --> JN
IDX --> CU
IDX --> WH
IDX --> PO
IDX --> AC
IDX --> PM
IDX --> BR
```

**Diagram sources**
- [packages/database/src/schema/index.ts:1-61](file://packages/database/src/schema/index.ts#L1-L61)

**Section sources**
- [docs/database/README.md:1-85](file://docs/database/README.md#L1-L85)
- [packages/database/src/schema/index.ts:1-61](file://packages/database/src/schema/index.ts#L1-L61)

## Core Components
This section summarizes the primary entities, their fields, types, keys, indexes, and constraints as defined in the schema files.

- Components
  - Primary key: id (UUID)
  - Unique: sku
  - Foreign keys: manufacturerId, categoryId, defaultLocationId (locations), consolidatedIntoComponentId (self-reference), consolidationId (consolidations)
  - Notable fields: name, description, unit, isActive, consolidatedIntoComponentId, consolidationId, consolidatedAt, createdAt, updatedAt
  - Indexes: sku unique, manufacturerId, categoryId, defaultLocationId, unit, consolidatedIntoComponentId, consolidationId, normalized MPN expression index, normalized name expression index
  - Validation notes: SKU uniqueness enforced; self-referential consolidation uses RESTRICT delete to preserve history; soft-delete via isActive and consolidation pointers

- Inventory Transactions
  - Primary key: id (UUID)
  - Foreign keys: componentId (components), sourceLocationId (locations), destinationLocationId (locations)
  - Fields: transactionType, quantity (integer), unitOfMeasure, reference, reason, createdBy, timestamps
  - Indexes: componentId, sourceLocationId, destinationLocationId, transactionType, createdAt
  - Validation notes: quantity is integer; foreign keys cascade or set null per referenced table behavior

- Sales Orders and Lines
  - sales_orders: id (UUID), orderNumber (unique), customerId (customers), orderDate, requiredDate, status (default DRAFT), quotationId (quotations), timestamps
  - sales_order_lines: id (UUID), salesOrderId (cascade), componentId (components), quantity (numeric), unitPrice (numeric), discount (numeric), tax (numeric), totalPrice (numeric), reservedQuantity (numeric), fulfilledQuantity (numeric), timestamps
  - Indexes: customer_id, status, lines by order_id and component_id
  - Validation notes: numeric precision for monetary values; status defaults to DRAFT

- Users, Roles, Sessions, Invitations, Audit Logs
  - roles: id, name (unique), description, isSystem, permissions (JSONB), timestamps
  - users: id, email (unique), passwordHash, firstName, lastName, department, roleId (roles), secondaryRoleIds (JSONB), status, lastLoginAt, timestamps
  - user_sessions: id, userId (users, cascade), token (unique), ipAddress, userAgent, deviceInfo, expiresAt, isRevoked, timestamps
  - password_reset_tokens: id, userId (users, cascade), token (unique), expiresAt, isUsed, createdAt
  - security_audit_logs: id, userId (users, set null), userEmail, action, category, ipAddress, details (JSONB), createdAt
  - user_invitations: id, email, roleId (roles, cascade), department, token (unique), expiresAt, status, invitedById (users, set null), createdAt
  - organization_setup_status: id, isCompleted, completedAt, completedById (users, set null), createdAt
  - Indexes: role membership, status, token uniqueness, audit log filters

- Journal Entries and Lines
  - journal_entries: id (UUID), journalNumber (unique), date, description, reference, status (default DRAFT), timestamps
  - journal_entry_lines: id (UUID), journalEntryId (cascade), accountId (accounts), debit (numeric), credit (numeric), description, timestamps
  - Indexes: status, date, lines by entry_id and account_id

- Customers and Contacts/Addresses
  - customers: id (UUID), customerNumber (unique), name, email, phone, taxId, currency (default INR), status (default DRAFT), creditStatus (default OK), timestamps
  - customer_contacts: id, customerId (cascade), name, email, phone, role, isPrimary, timestamps
  - customer_addresses: id, customerId (cascade), addressType (default BILLING), street1, street2, city, state, postalCode, country, isDefault, timestamps
  - Indexes: status, email, contacts/addresses by customer_id

- Warehouses, Zones, Bins
  - warehouses: id, code (unique), name, description, status (default ACTIVE), timestamps
  - warehouse_zones: id, warehouseId (cascade), code, name, timestamps
  - warehouse_bins: id, warehouseId (cascade), code (unique), capacity (decimal), currentUtilization (decimal), purpose (default STORAGE), isActive (default true), timestamps
  - Indexes: status, zones/bin by warehouse_id, bins by purpose

- Purchase Orders and Lines
  - purchase_orders: id, poNumber (unique), supplierId (suppliers), status (default DRAFT), currency (default INR), subtotal/taxTotal/grandTotal (decimal), notes, issuedAt, expectedDeliveryDate, trackingNumber, carrier, shippingProvider, trackingUrl, timestamps
  - purchase_order_lines: id, purchaseOrderId (cascade), componentId (components), vendorPartNumber, unitPrice (decimal), quantityOrdered (integer), quantityReceived (integer), taxRate (decimal), lineTotal (decimal), timestamps
  - Indexes: po_number unique, supplier_id, status, lines by po_id and component_id

- Accounts, Payments, Bank Reconciliations
  - accounts: id (UUID), accountNumber (unique), name, accountType, parentAccountId, currency (default INR), isActive (default true), timestamps
  - payments: id (UUID), paymentNumber (unique), paymentType, paymentMethod, amount (numeric), reference, bankAccountId (bank_accounts), status (default DRAFT), timestamps
  - bank_accounts: id (UUID), accountName, accountNumber (unique), bankName, currency (default INR), isActive (default true), timestamps
  - bank_reconciliations: id (UUID), bankAccountId (bank_accounts), statementDate, openingBalance (numeric), closingBalance (numeric), status (default IN_PROGRESS), timestamps
  - bank_transactions: id (UUID), bankReconciliationId (cascade), transactionDate, description, amount (numeric), matchedPaymentId (payments), isMatched (default false), timestamps
  - Indexes: account_type, is_active, payment_type, bank_account_id, status, reconciliation/account links

**Section sources**
- [packages/database/src/schema/components.ts:15-126](file://packages/database/src/schema/components.ts#L15-L126)
- [packages/database/src/schema/inventory-transactions.ts:12-74](file://packages/database/src/schema/inventory-transactions.ts#L12-L74)
- [packages/database/src/schema/sales-orders.ts:14-78](file://packages/database/src/schema/sales-orders.ts#L14-L78)
- [packages/database/src/schema/auth.ts:12-167](file://packages/database/src/schema/auth.ts#L12-L167)
- [packages/database/src/schema/journal-entries.ts:13-61](file://packages/database/src/schema/journal-entries.ts#L13-L61)
- [packages/database/src/schema/customers.ts:12-88](file://packages/database/src/schema/customers.ts#L12-L88)
- [packages/database/src/schema/warehouses.ts:13-84](file://packages/database/src/schema/warehouses.ts#L13-L84)
- [packages/database/src/schema/purchase-orders.ts:15-90](file://packages/database/src/schema/purchase-orders.ts#L15-L90)
- [packages/database/src/schema/accounts.ts:11-32](file://packages/database/src/schema/accounts.ts#L11-L32)
- [packages/database/src/schema/payments.ts:11-34](file://packages/database/src/schema/payments.ts#L11-L34)
- [packages/database/src/schema/bank-reconciliations.ts:13-92](file://packages/database/src/schema/bank-reconciliations.ts#L13-L92)

## Architecture Overview
Ananya uses PostgreSQL with Drizzle ORM. The database package defines schemas, manages migrations, and exposes a typed database client. Application services use repository implementations that query through Drizzle against these schemas.

```mermaid
graph TB
API["API Services"]
REPO["Repository Implementations<br/>Drizzle-based"]
DBPKG["Database Package<br/>drizzle + pg"]
PG["PostgreSQL"]
API --> REPO
REPO --> DBPKG
DBPKG --> PG
```

**Diagram sources**
- [packages/database/src/index.ts:1-60](file://packages/database/src/index.ts#L1-L60)
- [apps/api/src/infrastructure/repositories/drizzle-sales-order.repository.ts:46-73](file://apps/api/src/infrastructure/repositories/drizzle-sales-order.repository.ts#L46-L73)

**Section sources**
- [docs/database/README.md:20-73](file://docs/database/README.md#L20-L73)
- [packages/database/src/index.ts:1-60](file://packages/database/src/index.ts#L1-L60)

## Detailed Component Analysis

### Components and Inventory Ledger
Components are master items with identity constraints (SKU unique) and optional consolidation into a canonical record. Inventory transactions record movements between locations tied to components.

```mermaid
erDiagram
COMPONENTS {
uuid id PK
varchar sku UK
varchar name
varchar description
uuid manufacturer_id FK
uuid category_id FK
uuid default_location_id FK
varchar unit
boolean is_active
uuid consolidated_into_component_id FK
uuid consolidation_id FK
timestamp consolidated_at
timestamp created_at
timestamp updated_at
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
timestamp created_at
timestamp updated_at
}
COMPONENTS ||--o{ INVENTORY_TRANSACTIONS : "has many"
```

**Diagram sources**
- [packages/database/src/schema/components.ts:28-126](file://packages/database/src/schema/components.ts#L28-L126)
- [packages/database/src/schema/inventory-transactions.ts:12-74](file://packages/database/src/schema/inventory-transactions.ts#L12-L74)

**Section sources**
- [packages/database/src/schema/components.ts:15-126](file://packages/database/src/schema/components.ts#L15-L126)
- [packages/database/src/schema/inventory-transactions.ts:12-74](file://packages/database/src/schema/inventory-transactions.ts#L12-L74)

### Sales Orders and Fulfillment
Sales orders link to customers and quotations, with line items referencing components and tracking quantities, pricing, discounts, taxes, reservations, and fulfillment progress.

```mermaid
erDiagram
SALES_ORDERS {
uuid id PK
varchar order_number UK
uuid customer_id FK
timestamp order_date
timestamp required_date
varchar status
uuid quotation_id FK
timestamp created_at
timestamp updated_at
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
timestamp created_at
timestamp updated_at
}
CUSTOMERS {
uuid id PK
varchar customer_number UK
varchar name
varchar email
varchar phone
varchar tax_id
varchar currency
varchar status
varchar credit_status
timestamp created_at
timestamp updated_at
}
SALES_ORDERS }o--|| CUSTOMERS : "belongs to"
SALES_ORDERS ||--o{ SALES_ORDER_LINES : "contains"
SALES_ORDER_LINES }o--|| COMPONENTS : "references"
```

**Diagram sources**
- [packages/database/src/schema/sales-orders.ts:14-78](file://packages/database/src/schema/sales-orders.ts#L14-L78)
- [packages/database/src/schema/customers.ts:12-39](file://packages/database/src/schema/customers.ts#L12-L39)
- [packages/database/src/schema/components.ts:28-126](file://packages/database/src/schema/components.ts#L28-L126)

**Section sources**
- [packages/database/src/schema/sales-orders.ts:14-78](file://packages/database/src/schema/sales-orders.ts#L14-L78)
- [packages/database/src/schema/customers.ts:12-39](file://packages/database/src/schema/customers.ts#L12-L39)

### Users, Roles, Sessions, and Audit
Authentication and authorization rely on roles, users, sessions, invitations, and audit logs. Sensitive tokens and hashes are stored securely; sessions track device and network context.

```mermaid
erDiagram
ROLES {
uuid id PK
varchar name UK
varchar description
boolean is_system
jsonb permissions
timestamp created_at
timestamp updated_at
}
USERS {
uuid id PK
varchar email UK
varchar password_hash
varchar first_name
varchar last_name
varchar department
uuid role_id FK
jsonb secondary_role_ids
varchar status
timestamp last_login_at
timestamp created_at
timestamp updated_at
}
USER_SESSIONS {
uuid id PK
uuid user_id FK
varchar token UK
varchar ip_address
varchar user_agent
varchar device_info
timestamp expires_at
boolean is_revoked
timestamp created_at
timestamp updated_at
}
SECURITY_AUDIT_LOGS {
uuid id PK
uuid user_id FK
varchar user_email
varchar action
varchar category
varchar ip_address
jsonb details
timestamp created_at
}
USERS ||--o{ USER_SESSIONS : "has many"
USERS ||--o{ SECURITY_AUDIT_LOGS : "logs"
ROLES ||--o{ USERS : "assigns"
```

**Diagram sources**
- [packages/database/src/schema/auth.ts:12-167](file://packages/database/src/schema/auth.ts#L12-L167)

**Section sources**
- [packages/database/src/schema/auth.ts:12-167](file://packages/database/src/schema/auth.ts#L12-L167)

### Financial Records: Accounts, Journal Entries, Payments, Bank Reconciliations
Financial operations center around chart-of-accounts, double-entry journaling, payments, and bank reconciliation with matching to payments.

```mermaid
erDiagram
ACCOUNTS {
uuid id PK
varchar account_number UK
varchar name
varchar account_type
uuid parent_account_id FK
varchar currency
boolean is_active
timestamp created_at
timestamp updated_at
}
JOURNAL_ENTRIES {
uuid id PK
varchar journal_number UK
timestamp date
text description
varchar reference
varchar status
timestamp created_at
timestamp updated_at
}
JOURNAL_ENTRY_LINES {
uuid id PK
uuid journal_entry_id FK
uuid account_id FK
numeric debit
numeric credit
text description
timestamp created_at
timestamp updated_at
}
PAYMENTS {
uuid id PK
varchar payment_number UK
varchar payment_type
varchar payment_method
numeric amount
varchar reference
uuid bank_account_id FK
varchar status
timestamp created_at
timestamp updated_at
}
BANK_ACCOUNTS {
uuid id PK
varchar account_name
varchar account_number UK
varchar bank_name
varchar currency
boolean is_active
timestamp created_at
timestamp updated_at
}
BANK_RECONCILIATIONS {
uuid id PK
uuid bank_account_id FK
timestamp statement_date
numeric opening_balance
numeric closing_balance
varchar status
timestamp created_at
timestamp updated_at
}
BANK_TRANSACTIONS {
uuid id PK
uuid bank_reconciliation_id FK
timestamp transaction_date
varchar description
numeric amount
uuid matched_payment_id FK
boolean is_matched
timestamp created_at
timestamp updated_at
}
JOURNAL_ENTRIES ||--o{ JOURNAL_ENTRY_LINES : "contains"
JOURNAL_ENTRY_LINES }o--|| ACCOUNTS : "posts to"
BANK_RECONCILIATIONS ||--o{ BANK_TRANSACTIONS : "includes"
BANK_TRANSACTIONS }o--|| PAYMENTS : "matches"
```

**Diagram sources**
- [packages/database/src/schema/accounts.ts:11-32](file://packages/database/src/schema/accounts.ts#L11-L32)
- [packages/database/src/schema/journal-entries.ts:13-61](file://packages/database/src/schema/journal-entries.ts#L13-L61)
- [packages/database/src/schema/payments.ts:11-34](file://packages/database/src/schema/payments.ts#L11-L34)
- [packages/database/src/schema/bank-reconciliations.ts:13-92](file://packages/database/src/schema/bank-reconciliations.ts#L13-L92)

**Section sources**
- [packages/database/src/schema/accounts.ts:11-32](file://packages/database/src/schema/accounts.ts#L11-L32)
- [packages/database/src/schema/journal-entries.ts:13-61](file://packages/database/src/schema/journal-entries.ts#L13-L61)
- [packages/database/src/schema/payments.ts:11-34](file://packages/database/src/schema/payments.ts#L11-L34)
- [packages/database/src/schema/bank-reconciliations.ts:13-92](file://packages/database/src/schema/bank-reconciliations.ts#L13-L92)

### Data Access Patterns with Drizzle ORM
Repositories implement domain interfaces using Drizzle queries. For example, sales order retrieval composes header and line reads and maps to domain objects.

```mermaid
sequenceDiagram
participant Client as "Client"
participant Repo as "DrizzleSalesOrderRepository"
participant DB as "Drizzle db"
participant Tables as "sales_orders / sales_order_lines"
Client->>Repo : findById(id)
Repo->>DB : select from sales_orders where id = ?
DB-->>Repo : row
Repo->>DB : select from sales_order_lines where sales_order_id = ?
DB-->>Repo : lines[]
Repo-->>Client : Domain object (toDomain)
```

**Diagram sources**
- [apps/api/src/infrastructure/repositories/drizzle-sales-order.repository.ts:46-73](file://apps/api/src/infrastructure/repositories/drizzle-sales-order.repository.ts#L46-L73)
- [packages/database/src/schema/sales-orders.ts:14-78](file://packages/database/src/schema/sales-orders.ts#L14-L78)

**Section sources**
- [apps/api/src/infrastructure/repositories/drizzle-sales-order.repository.ts:46-73](file://apps/api/src/infrastructure/repositories/drizzle-sales-order.repository.ts#L46-L73)

## Dependency Analysis
Schema dependencies are explicit via foreign keys and references. Key relationships include:
- Components referenced by inventory transactions and order lines
- Customers referenced by sales orders
- Accounts referenced by journal entry lines
- Bank accounts referenced by payments and reconciliations
- Self-referential consolidation in components

```mermaid
graph LR
COMPONENTS --> INVENTORY_TRANSACTIONS
COMPONENTS --> SALES_ORDER_LINES
CUSTOMERS --> SALES_ORDERS
ACCOUNTS --> JOURNAL_ENTRY_LINES
BANK_ACCOUNTS --> PAYMENTS
BANK_ACCOUNTS --> BANK_RECONCILIATIONS
BANK_RECONCILIATIONS --> BANK_TRANSACTIONS
BANK_TRANSACTIONS --> PAYMENTS
COMPONENTS -.-> COMPONENTS
```

**Diagram sources**
- [packages/database/src/schema/components.ts:28-126](file://packages/database/src/schema/components.ts#L28-L126)
- [packages/database/src/schema/inventory-transactions.ts:12-74](file://packages/database/src/schema/inventory-transactions.ts#L12-L74)
- [packages/database/src/schema/sales-orders.ts:14-78](file://packages/database/src/schema/sales-orders.ts#L14-L78)
- [packages/database/src/schema/journal-entries.ts:13-61](file://packages/database/src/schema/journal-entries.ts#L13-L61)
- [packages/database/src/schema/payments.ts:11-34](file://packages/database/src/schema/payments.ts#L11-L34)
- [packages/database/src/schema/bank-reconciliations.ts:13-92](file://packages/database/src/schema/bank-reconciliations.ts#L13-L92)

**Section sources**
- [packages/database/src/schema/index.ts:1-61](file://packages/database/src/schema/index.ts#L1-L61)

## Performance Considerations
- Indexing strategy
  - Use existing indexes for common filters: status, dates, foreign keys, and business keys (e.g., order_number, po_number, account_number).
  - Expression indexes support normalized lookups for duplicate detection (MPN and name normalization).
- Query optimization
  - Prefer selective WHERE clauses leveraging indexes.
  - Avoid SELECT *; fetch only needed columns.
  - Use pagination and limit for large result sets.
- Transactional integrity
  - Keep writes short and grouped within transactions to reduce lock contention.
- Storage considerations
  - Numeric precision chosen for financial fields prevents rounding errors but increases storage; ensure appropriate indexing strategies for range queries.
- Monitoring
  - Monitor slow queries and adjust indexes based on actual usage patterns.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
- Migration failures
  - Ensure DATABASE_URL is configured before running migrations.
  - Use the provided migration runner to apply changes and handle errors gracefully.
- Connection issues
  - Verify the database pool is initialized and closed properly to avoid resource leaks.
- Common schema errors
  - Unique constraint violations (e.g., SKU, order numbers, account numbers) indicate duplicate inputs; validate at application layer.
  - Foreign key violations suggest referential integrity issues; ensure related records exist before inserts.

**Section sources**
- [packages/database/drizzle.config.ts:1-23](file://packages/database/drizzle.config.ts#L1-L23)
- [packages/database/src/setup/migrate.ts:1-21](file://packages/database/src/setup/migrate.ts#L1-L21)
- [packages/database/src/index.ts:1-60](file://packages/database/src/index.ts#L1-L60)

## Conclusion
Ananya’s database schema is modeled with clear relational boundaries, strong constraints, and targeted indexes to support high-performance operations across inventory, sales, procurement, finance, and security domains. Drizzle ORM provides type-safe access, while repositories encapsulate data access patterns. Migrations manage evolution safely, and the design supports future enhancements such as projections and reporting models.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### Data Lifecycle, Retention, and Archival
- Soft deletes and archival
  - Components use isActive and consolidation pointers to retain historical identity without hard deletion.
- Session and token retention
  - User sessions and password reset tokens have expiration fields; implement periodic cleanup jobs to remove expired entries.
- Audit logs
  - Security audit logs capture actions; consider retention policies and archival to cold storage for compliance.
- Financial records
  - Journal entries and reconciliations are immutable once posted; maintain long-term retention for accounting compliance.

[No sources needed since this section provides general guidance]

### Security, Privacy, and Access Control
- Authentication and authorization
  - Passwords stored as hashes; roles and permissions control access.
  - Sessions track device and IP context; support revocation.
- Auditability
  - Security audit logs record actions with contextual metadata.
- Data minimization
  - Store only necessary PII; mask or tokenize sensitive fields where possible.
- Encryption
  - Use TLS for connections; encrypt sensitive data at rest if required by policy.

**Section sources**
- [packages/database/src/schema/auth.ts:12-167](file://packages/database/src/schema/auth.ts#L12-L167)

### Migrations, Backup, and Recovery
- Migrations
  - Drizzle-managed migrations under packages/database/drizzle; run via the migration utility.
- Backups
  - Schedule regular logical backups (e.g., pg_dump) and point-in-time recovery setups.
- Disaster recovery
  - Test restore procedures regularly; maintain offsite copies.

**Section sources**
- [packages/database/src/setup/migrate.ts:1-21](file://packages/database/src/setup/migrate.ts#L1-L21)
- [packages/database/drizzle.config.ts:1-23](file://packages/database/drizzle.config.ts#L1-L23)
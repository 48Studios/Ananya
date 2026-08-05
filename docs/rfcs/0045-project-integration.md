# RFC-0045: Project Integration

- **Status**: Accepted
- **Author**: Ananya ERP Core Team
- **Created**: 2026-07-25

## 1. Purpose

Define the integration boundary, data flow, and cross-context invariants between Projects (`@ananya/projects`) and external ERP bounded contexts (`Sales`, `Manufacturing`, `Procurement`, `Finance`).

## 2. Scope

Covers Sales Order handoff to Project creation, cross-context reference linking, and strict boundary enforcement.

## 3. Ubiquitous Language

- **Commercial Orchestration**: The operational transition where a confirmed `SalesOrder` in Sales initiates a delivery `Project` in Projects.
- **Cross-Context Linking**: Projects store `salesOrderId` and `customerId` as reference identifiers without directly modifying Sales, Inventory, or Finance tables.

## 4. Aggregate Roots

- Inter-boundary orchestration between `SalesOrder` (`@ananya/sales`) and `Project` (`@ananya/projects`).

## 5. Entities

- None.

## 6. Value Objects

- None.

## 7. Commands

- `CreateProjectFromSalesOrderCommand`: Initiates project delivery workspace from confirmed Sales Order.

## 8. Queries

- `GetProjectSalesOrderQuery`

## 9. Domain Services

- `SalesOrderProjectHandoffService`: Orchestrates Sales Order to Project creation.

## 10. Application Services

- `ProjectsService`: Invokes `SalesOrdersService` to validate Sales Order confirmation before project initialization.

## 11. Repository Contracts

- Domain aggregate abstraction interfaces.

## 12. Domain Invariants

- Projects NEVER directly mutate `sales_orders`, `inventory_transactions`, `purchase_orders`, or `journal_entries`.
- Projects reference external entity IDs for tracking only.
- Only confirmed Sales Orders can initiate a Project.

## 13. State Machine

```text
Sales Order: [ CONFIRMED ] ──(Initiate)──> Project: [ PLANNING ] ──> [ ACTIVE ]
```

## 14. Sequence Diagram

```text
Sales UI / API ──> ProjectsController.create() ──> ProjectsService
               ──> SalesOrdersService.findOne() ──> ProjectRepository.save()
```

## 15. Cross-Module Integration

- `@ananya/projects` references `@ananya/sales` interfaces via application layer orchestration.
- Projects link task operational items to Manufacturing Work Orders and Procurement Purchase Orders via reference IDs when needed.

## 16. Database Schema

No duplicate tables. Table `projects` stores foreign reference string `sales_order_id` and `customer_id`.

## 17. API Design

- `POST /projects` (accepts `salesOrderId` and `customerId`)

## 18. UI Workflow

- On `/sales-orders/[id]`, user can click "Create Delivery Project" which navigates to `/projects` with pre-filled `salesOrderId` and `customerId`.

## 19. Validation Rules

- `salesOrderId` must refer to a valid, confirmed Sales Order.

## 20. Future Extensions

- Automated project template generation based on Sales Order line item product categories.

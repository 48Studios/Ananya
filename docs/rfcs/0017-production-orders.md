# RFC-0017: Production Orders

**Status:** Accepted

**Author:** Ananya Contributors

**Created:** 2026-07-22

---

# 1. Purpose

This RFC defines the **Production Order** aggregate and manufacturing work-order lifecycle in Ananya ERP. A Production Order represents a formal authorization to manufacture a planned quantity of a finished product component using a specific released Bill of Materials (BOM).

---

# 2. Scope

- Production Order lifecycle (`DRAFT`, `RELEASED`, `MATERIAL_ALLOCATED`, `IN_PROGRESS`, `COMPLETED`, `CLOSED`, `CANCELLED`).
- Tracking planned, completed, and scrapped production quantities.
- Production operations / routing step tracking.
- Scheduling start and completion target dates.

---

# 3. Ubiquitous Language

- **Production Order (PO/WO)**: Work order authorizing a manufacturing run.
- **Production Number**: Unique sequential document identifier (e.g. `PRD-2026-0001`).
- **Planned Quantity**: Planned batch yield count.
- **Completed Quantity**: Actual acceptable finished product yield produced.
- **Scrapped Quantity**: Products rejected during manufacturing.
- **Material Allocation**: Reserving required raw materials in inventory prior to assembly.

---

# 4. Aggregate Roots

- **`ProductionOrder`**: Aggregate root managing production state transitions, quantity tracking, material allocation status, and operation step progress.

---

# 5. Entities

- **`ProductionOrderOperation`**: Workstation or routing step entity (`id`, `productionOrderId`, `operationName`, `sequence`, `status`, `completedAt`).

---

# 6. Value Objects

- **`ProductionNumber`**: Unique document number (e.g. `PRD-2026-0012`).
- **`ProductionOrderStatus`**: Enum (`DRAFT`, `RELEASED`, `MATERIAL_ALLOCATED`, `IN_PROGRESS`, `COMPLETED`, `CLOSED`, `CANCELLED`).

---

# 7. Commands

- `CreateProductionOrderCommand`: Initializes a new DRAFT production order for a released BOM.
- `ReleaseProductionOrderCommand`: Releases order for scheduling.
- `AllocateMaterialsCommand`: Reserves raw materials in Inventory.
- `StartProductionCommand`: Transitions status to IN_PROGRESS.
- `CompleteProductionCommand`: Transitions status to COMPLETED once yield is produced.
- `CloseProductionOrderCommand`: Closes work order after final reconciliation.
- `CancelProductionOrderCommand`: Cancels production order.

---

# 8. Queries

- `GetProductionOrderByIdQuery`: Retrieves production order aggregate.
- `ListProductionOrdersQuery`: Filters production orders by status, product component ID, or date range.

---

# 9. Domain Services

- **`ProductionOrderNumberGenerator`**: Generates sequential production work order numbers.
- **`MaterialRequirementCalculator`**: Computes total component quantities required based on BOM quantities and scrap factors.

---

# 10. Application Services

- **`ProductionOrderApplicationService`**: Orchestrates production order state transitions, material reservation requests to `@ananya/inventory`, and production completion tracking.

---

# 11. Repository Contracts

```typescript
export interface ProductionOrderRepository {
  findById(id: string): Promise<ProductionOrder | null>;
  findByProductionNumber(productionNumber: string): Promise<ProductionOrder | null>;
  findMany(options?: FindManyProductionOrdersOptions): Promise<ProductionOrder[]>;
  save(order: ProductionOrder): Promise<void>;
  generateNextProductionNumber(): Promise<string>;
}
```

---

# 12. Domain Invariants

- A Production Order must reference a valid `bomId` in `RELEASED` status.
- `quantityPlanned` must be strictly positive (`> 0`).
- A production order cannot be completed until at least one Finished Goods Receipt has been posted.
- A closed or cancelled production order cannot be edited or re-opened.

---

# 13. State Machines

```
[DRAFT] ---> [RELEASED] ---> [MATERIAL_ALLOCATED] ---> [IN_PROGRESS] ---> [COMPLETED] ---> [CLOSED]
   |             |                     |                    |
   v             v                     v                    v
[CANCELLED]  [CANCELLED]          [CANCELLED]          [CANCELLED]
```

---

# 14. Sequence Diagrams

```
User -> UI: Allocate Materials for PRD-2026-0001
UI -> API: POST /api/v1/production-orders/:id/allocate
API -> ProductionAppService: allocateMaterials(id)
ProductionAppService -> InventoryReservationService: createReservation(componentId, locationId, qtyRequired)
ProductionAppService -> ProductionOrder: order.markMaterialAllocated()
ProductionAppService -> ProductionRepo: save(order)
API -> UI: 200 OK (Updated ProductionOrder DTO)
```

---

# 15. Inventory Integration

- Interacts with `@ananya/inventory` Reservation Application Services to reserve stock during `MATERIAL_ALLOCATED` stage.

---

# 16. Database Schema

```sql
CREATE TABLE production_orders (
  id VARCHAR(36) PRIMARY KEY,
  production_number VARCHAR(64) NOT NULL UNIQUE,
  bom_id VARCHAR(36) NOT NULL REFERENCES bill_of_materials(id),
  component_id VARCHAR(36) NOT NULL REFERENCES components(id),
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  quantity_planned INT NOT NULL DEFAULT 1,
  quantity_completed INT NOT NULL DEFAULT 0,
  quantity_scrapped INT NOT NULL DEFAULT 0,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE production_order_operations (
  id VARCHAR(36) PRIMARY KEY,
  production_order_id VARCHAR(36) NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
  operation_name VARCHAR(128) NOT NULL,
  sequence INT NOT NULL DEFAULT 1,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

# 17. API Design

- `POST /api/v1/production-orders`: Create production order.
- `GET /api/v1/production-orders`: List production orders.
- `GET /api/v1/production-orders/:id`: Get order details.
- `POST /api/v1/production-orders/:id/release`: Release order.
- `POST /api/v1/production-orders/:id/allocate`: Request material allocation.
- `POST /api/v1/production-orders/:id/start`: Start production.
- `POST /api/v1/production-orders/:id/complete`: Complete order.
- `POST /api/v1/production-orders/:id/close`: Close order.

---

# 18. UI Workflow

1. **Production Orders Dashboard**: Grid of active work orders grouped by status (`Allocated`, `In Progress`, `Completed`).
2. **Work Order Detail View**: Planned vs completed progress bars, material requirements checklist, action buttons for state transitions.

---

# 19. Validation Rules

- `bomId` must refer to a Released BOM matching the order's product component.
- `quantityPlanned` must be `>= 1`.

---

# 20. Future Extensions

- Workstation capacity planning and shop-floor scheduling Gantt charts.

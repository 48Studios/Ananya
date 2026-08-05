# RFC-0018: Material Consumption

**Status:** Accepted

**Author:** Ananya Contributors

**Created:** 2026-07-22

---

# 1. Purpose

This RFC defines the **Material Consumption** aggregate in the Manufacturing Bounded Context. Material Consumption records the actual raw material usage during a production run, creating auditable Inventory Issue Transactions through `@ananya/inventory` Application Services. Manufacturing never manipulates inventory tables directly.

---

# 2. Scope

- Recording actual component quantities consumed during production.
- Tracking consumption against planned BOM requirements.
- Source location selection for material withdrawal.
- Batch and serial number tracking for consumed materials.
- Variance reporting between planned and actual consumption.

---

# 3. Ubiquitous Language

- **Material Consumption**: A record of raw materials physically withdrawn from inventory and consumed during a production run.
- **Consumption Line**: A single component withdrawal specifying component, location, quantity, and optional batch/serial.
- **Over-Consumption**: Consuming more material than the BOM specifies for the planned production quantity.
- **Back-flush**: Automatic consumption posting based on BOM quantities at production completion (future extension).

---

# 4. Aggregate Roots

- **`MaterialConsumption`**: Root entity managing consumption header, line item collection, and posting state.

---

# 5. Entities

- **`MaterialConsumptionLine`**: Entity representing a single component withdrawal (`id`, `consumptionId`, `componentId`, `locationId`, `quantityPlanned`, `quantityConsumed`, `batchNumber`, `serialNumbers`, `consumedAt`).

---

# 6. Value Objects

- **`ConsumptionNumber`**: Unique document identifier (e.g. `MC-2026-0001`).
- **`ConsumptionStatus`**: Enum (`DRAFT`, `POSTED`).

---

# 7. Commands

- `CreateMaterialConsumptionCommand`: Initializes a DRAFT consumption document against a production order.
- `AddConsumptionLineCommand`: Adds a component line to the consumption document.
- `PostMaterialConsumptionCommand`: Finalizes consumption, triggering Inventory Issue Transactions for each line.

---

# 8. Queries

- `GetMaterialConsumptionByIdQuery`: Retrieves consumption with all lines.
- `ListConsumptionsByProductionOrderQuery`: Lists all consumptions for a given production order.

---

# 9. Domain Services

- **`ConsumptionVarianceCalculator`**: Compares actual consumption quantities against BOM-planned quantities to compute variance.

---

# 10. Application Services

- **`MaterialConsumptionApplicationService`**: Orchestrates consumption creation, line management, and posting. On post, delegates to `InventoryTransactionsService.create({ transactionType: 'Issue' })` for each consumption line and calls `InventoryProjectionsService.rebuild()`.

---

# 11. Repository Contracts

```typescript
export interface MaterialConsumptionRepository {
  findById(id: string): Promise<MaterialConsumption | null>;
  findByProductionOrderId(
    productionOrderId: string,
  ): Promise<MaterialConsumption[]>;
  findMany(
    options?: FindManyConsumptionsOptions,
  ): Promise<MaterialConsumption[]>;
  save(consumption: MaterialConsumption): Promise<void>;
  generateNextConsumptionNumber(): Promise<string>;
}
```

---

# 12. Domain Invariants

- A Material Consumption must reference a valid Production Order in `IN_PROGRESS` status.
- `quantityConsumed` must be strictly positive (`> 0`).
- A `POSTED` consumption document is immutable.
- Each consumption line must reference a valid `componentId` and `locationId` from Inventory.

---

# 13. State Machines

```
[DRAFT] ---> [POSTED]
```

---

# 14. Sequence Diagrams

```
User -> UI: Post Material Consumption MC-2026-0001
UI -> API: POST /api/v1/material-consumptions/:id/post
API -> ConsumptionAppService: postConsumption(id)
ConsumptionAppService -> ConsumptionRepo: findById(id)
ConsumptionAppService -> Consumption: consumption.post()

loop for each consumption line
  ConsumptionAppService -> InventoryTransactionsService: create({
    transactionType: 'Issue',
    componentId: line.componentId,
    sourceLocationId: line.locationId,
    quantity: line.quantityConsumed,
    reference: consumption.consumptionNumber,
    reason: 'Material consumption for production order',
    createdBy: 'SYSTEM'
  })
end

ConsumptionAppService -> InventoryProjectionsService: rebuild()
ConsumptionAppService -> ConsumptionRepo: save(consumption)
API -> UI: 200 OK
```

---

# 15. Inventory Integration

- **Material Issue**: Each posted consumption line creates an Inventory Issue Transaction via `InventoryTransactionsService.create({ transactionType: 'Issue' })`.
- **Projection Rebuild**: `InventoryProjectionsService.rebuild()` is called after all lines are posted.
- **Batch Tracking**: `batchNumber` is recorded on consumption lines for traceability.
- **Serial Tracking**: `serialNumbers` array is recorded on consumption lines for traceability.
- Manufacturing **never** performs direct SQL against `inventory_ledger`, `inventory_projections`, `batches`, or `serials`.

---

# 16. Database Schema

```sql
CREATE TABLE material_consumptions (
  id VARCHAR(36) PRIMARY KEY,
  consumption_number VARCHAR(64) NOT NULL UNIQUE,
  production_order_id VARCHAR(36) NOT NULL REFERENCES production_orders(id),
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE material_consumption_lines (
  id VARCHAR(36) PRIMARY KEY,
  consumption_id VARCHAR(36) NOT NULL REFERENCES material_consumptions(id) ON DELETE CASCADE,
  component_id VARCHAR(36) NOT NULL REFERENCES components(id),
  location_id VARCHAR(36) NOT NULL REFERENCES locations(id),
  quantity_planned NUMERIC(12, 4) NOT NULL DEFAULT 0,
  quantity_consumed NUMERIC(12, 4) NOT NULL,
  batch_number VARCHAR(128),
  serial_numbers TEXT[],
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

# 17. API Design

- `POST /api/v1/material-consumptions`: Create consumption document.
- `GET /api/v1/material-consumptions`: List consumption documents.
- `GET /api/v1/material-consumptions/:id`: Get consumption details.
- `POST /api/v1/material-consumptions/:id/lines`: Add consumption line.
- `POST /api/v1/material-consumptions/:id/post`: Post consumption (triggers Inventory Issue).

---

# 18. UI Workflow

1. **Consumption Recording**: Select production order, add component lines with quantities withdrawn from specific storage locations.
2. **Post Confirmation**: Review all lines, confirm posting. Stock is deducted via Inventory Issue Transactions.
3. **Variance Display**: Show planned vs actual consumption per component.

---

# 19. Validation Rules

- Production Order must be in `IN_PROGRESS` status.
- `componentId` must exist in Inventory components.
- `locationId` must exist in Inventory locations.
- `quantityConsumed` must be `> 0`.

---

# 20. Future Extensions

- Automatic back-flush consumption based on BOM at production completion.
- Consumption approval workflow for over-consumption beyond tolerance thresholds.

# RFC-0019: Finished Goods Receipt

**Status:** Accepted

**Author:** Ananya Contributors

**Created:** 2026-07-22

---

# 1. Purpose

This RFC defines the **Finished Goods Receipt** aggregate in the Manufacturing Bounded Context. A Finished Goods Receipt records the production yield — finished products and scrap — entering inventory from a completed manufacturing run. Posting creates Inventory Receipt Transactions through `@ananya/inventory` Application Services.

---

# 2. Scope

- Recording finished product quantities produced by a production order.
- Recording scrap quantities separately.
- Destination storage location for finished goods.
- Finished product batch and serial number registration.
- Inventory Receipt Transaction creation upon posting.

---

# 3. Ubiquitous Language

- **Finished Goods Receipt (FGR)**: Document recording production output entering inventory.
- **Production Yield**: Quantity of acceptable finished products produced.
- **Scrap**: Quantity of rejected products that failed quality checks.
- **FGR Number**: Unique document identifier (e.g. `FGR-2026-0001`).

---

# 4. Aggregate Roots

- **`FinishedGoodsReceipt`**: Root entity managing finished goods header, line items, and posting lifecycle.

---

# 5. Entities

- **`FinishedGoodsReceiptLine`**: Entity representing a yield entry (`id`, `fgrId`, `componentId`, `locationId`, `quantityProduced`, `quantityScrapped`, `batchNumber`, `serialNumbers`).

---

# 6. Value Objects

- **`FgrNumber`**: Unique document number.
- **`FgrStatus`**: Enum (`DRAFT`, `POSTED`).

---

# 7. Commands

- `CreateFinishedGoodsReceiptCommand`: Initializes a DRAFT FGR against a production order.
- `AddFgrLineCommand`: Adds a finished product line with yield and scrap quantities.
- `PostFinishedGoodsReceiptCommand`: Finalizes the FGR, creating Inventory Receipt Transactions and updating production order quantities.

---

# 8. Queries

- `GetFgrByIdQuery`: Retrieves FGR with lines.
- `ListFgrsByProductionOrderQuery`: Lists all FGRs for a given production order.

---

# 9. Domain Services

- **`YieldValidator`**: Validates that total yield across all FGRs for a production order does not exceed planned quantity without explicit policy override.

---

# 10. Application Services

- **`FinishedGoodsReceiptApplicationService`**: Orchestrates FGR creation, line management, and posting. On post, delegates to `InventoryTransactionsService.create({ transactionType: 'Receipt' })` for each yield line and calls `InventoryProjectionsService.rebuild()`. Updates production order `quantityCompleted` and `quantityScrapped`.

---

# 11. Repository Contracts

```typescript
export interface FinishedGoodsReceiptRepository {
  findById(id: string): Promise<FinishedGoodsReceipt | null>;
  findByProductionOrderId(
    productionOrderId: string,
  ): Promise<FinishedGoodsReceipt[]>;
  findMany(options?: FindManyFgrsOptions): Promise<FinishedGoodsReceipt[]>;
  save(fgr: FinishedGoodsReceipt): Promise<void>;
  generateNextFgrNumber(): Promise<string>;
}
```

---

# 12. Domain Invariants

- An FGR must reference a valid Production Order in `IN_PROGRESS` or `COMPLETED` status.
- `quantityProduced` must be non-negative (`>= 0`).
- `quantityScrapped` must be non-negative (`>= 0`).
- At least one of `quantityProduced` or `quantityScrapped` must be positive per line.
- A `POSTED` FGR is immutable.
- Total `quantityProduced` across all FGRs for a production order cannot exceed `quantityPlanned` without policy approval.

---

# 13. State Machines

```
[DRAFT] ---> [POSTED]
```

---

# 14. Sequence Diagrams

```
User -> UI: Post Finished Goods Receipt FGR-2026-0001
UI -> API: POST /api/v1/finished-goods/:id/post
API -> FgrAppService: postFgr(id)
FgrAppService -> FgrRepo: findById(id)
FgrAppService -> FGR: fgr.post()

loop for each FGR line where quantityProduced > 0
  FgrAppService -> InventoryTransactionsService: create({
    transactionType: 'Receipt',
    componentId: line.componentId,
    destinationLocationId: line.locationId,
    quantity: line.quantityProduced,
    reference: fgr.fgrNumber,
    reason: 'Finished goods from production order',
    createdBy: 'SYSTEM'
  })
end

FgrAppService -> InventoryProjectionsService: rebuild()
FgrAppService -> ProductionOrderRepo: updateQuantities(orderId, completedDelta, scrappedDelta)
FgrAppService -> FgrRepo: save(fgr)
API -> UI: 200 OK
```

---

# 15. Inventory Integration

- **Stock Receipt**: Each posted FGR line with `quantityProduced > 0` creates an Inventory Receipt Transaction via `InventoryTransactionsService.create({ transactionType: 'Receipt' })`.
- **Projection Rebuild**: `InventoryProjectionsService.rebuild()` is called after posting.
- **Batch Registration**: `batchNumber` is stored on FGR lines for finished goods batching.
- **Serial Registration**: `serialNumbers` array is stored on FGR lines for finished goods serial tracking.
- Manufacturing **never** performs direct SQL against `inventory_ledger`, `inventory_projections`, `batches`, or `serials`.

---

# 16. Database Schema

```sql
CREATE TABLE finished_goods_receipts (
  id VARCHAR(36) PRIMARY KEY,
  fgr_number VARCHAR(64) NOT NULL UNIQUE,
  production_order_id VARCHAR(36) NOT NULL REFERENCES production_orders(id),
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE finished_goods_receipt_lines (
  id VARCHAR(36) PRIMARY KEY,
  fgr_id VARCHAR(36) NOT NULL REFERENCES finished_goods_receipts(id) ON DELETE CASCADE,
  component_id VARCHAR(36) NOT NULL REFERENCES components(id),
  location_id VARCHAR(36) NOT NULL REFERENCES locations(id),
  quantity_produced INT NOT NULL DEFAULT 0,
  quantity_scrapped INT NOT NULL DEFAULT 0,
  batch_number VARCHAR(128),
  serial_numbers TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

# 17. API Design

- `POST /api/v1/finished-goods`: Create FGR document.
- `GET /api/v1/finished-goods`: List FGR documents.
- `GET /api/v1/finished-goods/:id`: Get FGR details.
- `POST /api/v1/finished-goods/:id/lines`: Add FGR line.
- `POST /api/v1/finished-goods/:id/post`: Post FGR (triggers Inventory Receipt).

---

# 18. UI Workflow

1. **Finished Goods Recording**: Select production order, enter yield quantity and scrap quantity, specify destination storage location.
2. **Post Confirmation**: Review finished goods, confirm posting. Finished products enter inventory via Receipt Transaction.
3. **Production Order Update**: Production order completion progress bar updates automatically.

---

# 19. Validation Rules

- Production Order must exist and be in `IN_PROGRESS` or `COMPLETED` status.
- `componentId` must match the production order's product component.
- `locationId` must exist in Inventory locations.
- `quantityProduced + quantityScrapped` must be `> 0` per line.

---

# 20. Future Extensions

- Quality inspection hold status before posting finished goods to available inventory.
- Automatic production order completion when yield reaches planned quantity.

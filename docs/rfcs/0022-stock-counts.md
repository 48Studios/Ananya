# RFC-0022: Stock Counts

**Status:** Accepted

**Author:** Ananya Contributors

**Created:** 2026-07-25

---

# 1. Purpose

This RFC defines the **Stock Count** aggregate in the Warehouse Bounded Context. Stock Count models a physical audit of stock in specified warehouse bins. Posting an approved Stock Count generates Inventory Adjustment Transactions through `@ananya/inventory` Application Services to synchronize physical counts with the inventory ledger.

---

# 2. Scope

- Initializing physical stock counts for a warehouse.
- Assigning counters to count lines.
- Recording expected vs. actual counted quantities per component bin.
- Variance calculation (`variance = countedQuantity - expectedQuantity`).
- Review, approval, and posting lifecycle.

---

# 3. Ubiquitous Language

- **Stock Count**: A physical inventory count event.
- **Count Line**: A specific component + bin entry recording expected vs counted quantity.
- **Variance**: Difference between physical count and system inventory ledger.
- **Posting**: Executing Inventory Adjustment Transactions to reconcile variances.

---

# 4. Aggregate Roots

- **`StockCount`**: Root aggregate managing count lines, assignees, and posting state.

---

# 5. Entities

- **`StockCountLine`**: Individual component bin audit line (`id`, `stockCountId`, `componentId`, `binId`, `expectedQuantity`, `countedQuantity`, `variance`, `notes`).

---

# 6. Value Objects

- **`StockCountNumber`**: Unique document number (e.g. `SC-2026-0001`).
- **`StockCountStatus`**: Enum (`DRAFT`, `ASSIGNED`, `COUNTING`, `SUBMITTED`, `APPROVED`, `POSTED`, `CANCELLED`).

---

# 7. Commands

- `CreateStockCountCommand`: Creates a new stock count document.
- `AssignCounterCommand`: Assigns a warehouse operator.
- `RecordCountLineCommand`: Enters actual physical count for a line.
- `SubmitStockCountCommand`: Submits count for manager review.
- `ApproveStockCountCommand`: Approves calculated variances.
- `PostStockCountCommand`: Finalizes count, calling `InventoryTransactionsService.create({ transactionType: 'Adjustment' })`.

---

# 8. Queries

- `GetStockCountByIdQuery`: Retrieves count document with all lines.
- `ListStockCountsQuery`: Lists stock counts by warehouse, status, or assignee.

---

# 9. Domain Services

- **`VarianceCalculator`**: Computes discrepancy between expected stock and physical counted stock.

---

# 10. Application Services

- **`StockCountsApplicationService`**: Orchestrates stock count lifecycle. On post, iterates lines with non-zero variance and invokes `InventoryTransactionsService.create({ transactionType: 'Adjustment' })`, then triggers `InventoryProjectionsService.rebuild()`.

---

# 11. Repository Contracts

```typescript
export interface StockCountRepository {
  findById(id: string): Promise<StockCount | null>;
  findMany(options?: FindManyStockCountsOptions): Promise<StockCount[]>;
  save(stockCount: StockCount): Promise<void>;
  generateNextCountNumber(): Promise<string>;
}
```

---

# 12. Domain Invariants

- A `POSTED` or `CANCELLED` stock count cannot be modified.
- `countedQuantity` must be non-negative (`>= 0`).
- Posting is permitted only when status is `APPROVED`.

---

# 13. State Machines

```
[DRAFT] -> [ASSIGNED] -> [COUNTING] -> [SUBMITTED] -> [APPROVED] -> [POSTED]
   |
   +-----------------------------> [CANCELLED]
```

---

# 14. Sequence Diagrams

```
User -> UI: Post Stock Count SC-2026-0001
UI -> API: POST /api/v1/stock-counts/:id/post
API -> StockCountAppService: postStockCount(id)
StockCountAppService -> StockCountRepo: findById(id)
StockCountAppService -> StockCount: count.post()

loop for each line with non-zero variance
  StockCountAppService -> InventoryTransactionsService: create({
    transactionType: 'Adjustment',
    componentId: line.componentId,
    destinationLocationId: line.binId,
    quantity: line.variance,
    reference: count.countNumber,
    reason: 'Stock count physical adjustment',
    createdBy: 'SYSTEM'
  })
end

StockCountAppService -> InventoryProjectionsService: rebuild()
StockCountAppService -> StockCountRepo: save(count)
API -> UI: 200 OK
```

---

# 15. Inventory Integration

- Stock Count reconciles discrepancies by creating Inventory Adjustment Transactions (`transactionType: 'Adjustment'`) via `@ananya/inventory` Application Services.
- Warehouse **never** updates `inventory_ledger` directly.

---

# 16. Database Schema

```sql
CREATE TABLE stock_counts (
  id VARCHAR(36) PRIMARY KEY,
  count_number VARCHAR(64) NOT NULL UNIQUE,
  warehouse_id VARCHAR(36) NOT NULL REFERENCES warehouses(id),
  assigned_user VARCHAR(128),
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE stock_count_lines (
  id VARCHAR(36) PRIMARY KEY,
  stock_count_id VARCHAR(36) NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
  component_id VARCHAR(36) NOT NULL REFERENCES components(id),
  bin_id VARCHAR(36) NOT NULL REFERENCES warehouse_bins(id),
  expected_quantity NUMERIC(12, 4) NOT NULL DEFAULT 0,
  counted_quantity NUMERIC(12, 4) NOT NULL DEFAULT 0,
  variance NUMERIC(12, 4) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

# 17. API Design

- `POST /api/v1/stock-counts`: Create count document.
- `GET /api/v1/stock-counts`: List stock counts.
- `GET /api/v1/stock-counts/:id`: Get count details with lines.
- `POST /api/v1/stock-counts/:id/lines`: Add/update count line.
- `POST /api/v1/stock-counts/:id/submit`: Submit for approval.
- `POST /api/v1/stock-counts/:id/approve`: Approve count.
- `POST /api/v1/stock-counts/:id/post`: Post inventory adjustments.

---

# 18. UI Workflow

1. **Count Entry Sheet**: Operators record physical counts per component and bin.
2. **Variance Review Panel**: Managers inspect highlighted variances before approving and posting.

---

# 19. Validation Rules

- `countedQuantity` must be `>= 0`.
- Stock count must be `APPROVED` before posting.

---

# 20. Future Extensions

- Mobile barcode scanning UI for physical count capture.

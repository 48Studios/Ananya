# RFC-0024: Warehouse Transfers

**Status:** Accepted

**Author:** Ananya Contributors

**Created:** 2026-07-25

---

# 1. Purpose

This RFC defines the **Warehouse Transfer** aggregate in the Warehouse Bounded Context. A Warehouse Transfer coordinates the physical bin-to-bin movement of inventory within or between warehouses. Upon completion, it triggers an Inventory Transfer Transaction through `@ananya/inventory` Application Services.

---

# 2. Scope

- Internal bin-to-bin stock transfer requests.
- Specifying source bin and destination bin.
- Transfer line items specifying component, quantity, batch number, and serial numbers.
- Workflow: `DRAFT` → `APPROVED` → `IN_TRANSIT` → `COMPLETED`.
- Creating Inventory Transfer Transactions on completion.

---

# 3. Ubiquitous Language

- **Warehouse Transfer**: Document coordinating physical stock relocation.
- **Source Bin**: Originating bin location.
- **Destination Bin**: Target receiving bin location.
- **Transfer Line**: Individual item relocation specifying component, quantity, batch, serials.

---

# 4. Aggregate Roots

- **`WarehouseTransfer`**: Root aggregate managing transfer lines, source/destination bins, and movement state.

---

# 5. Entities

- **`WarehouseTransferLine`**: Entity representing a component line item (`id`, `transferId`, `componentId`, `quantity`, `batchNumber`, `serialNumbers`).

---

# 6. Value Objects

- **`TransferNumber`**: Unique document identifier (e.g. `WT-2026-0001`).
- **`TransferStatus`**: Enum (`DRAFT`, `APPROVED`, `IN_TRANSIT`, `COMPLETED`, `CANCELLED`).

---

# 7. Commands

- `CreateWarehouseTransferCommand`: Initializes a draft transfer document.
- `AddTransferLineCommand`: Adds a component line item to the transfer.
- `ApproveWarehouseTransferCommand`: Approves transfer movement.
- `DispatchWarehouseTransferCommand`: Marks transfer `IN_TRANSIT`.
- `CompleteWarehouseTransferCommand`: Completes transfer, executing Inventory Transfer Transactions.

---

# 8. Queries

- `GetWarehouseTransferByIdQuery`: Retrieves transfer with all lines.
- `ListWarehouseTransfersQuery`: Lists transfers filtered by source bin, destination bin, or status.

---

# 9. Domain Services

- **`TransferValidator`**: Ensures source bin and destination bin are distinct and that requested quantities are strictly positive.

---

# 10. Application Services

- **`WarehouseTransfersApplicationService`**: Orchestrates transfer workflow. On `complete()`, delegates to `InventoryTransactionsService.create({ transactionType: 'Transfer', sourceLocationId, destinationLocationId })` for each line item and rebuilds stock projections.

---

# 11. Repository Contracts

```typescript
export interface WarehouseTransferRepository {
  findById(id: string): Promise<WarehouseTransfer | null>;
  findMany(options?: FindManyTransfersOptions): Promise<WarehouseTransfer[]>;
  save(transfer: WarehouseTransfer): Promise<void>;
  generateNextTransferNumber(): Promise<string>;
}
```

---

# 12. Domain Invariants

- Source bin and destination bin **cannot** be identical.
- `quantity` must be strictly positive (`> 0`).
- Completed or cancelled transfers are **immutable**.

---

# 13. State Machines

```
[DRAFT] -> [APPROVED] -> [IN_TRANSIT] -> [COMPLETED]
   |
   +------------------------------> [CANCELLED]
```

---

# 14. Sequence Diagrams

```
User -> UI: Complete Transfer WT-2026-0001
UI -> API: POST /api/v1/warehouse-transfers/:id/complete
API -> TransferAppService: completeTransfer(id)
TransferAppService -> TransferRepo: findById(id)
TransferAppService -> Transfer: transfer.complete()

loop for each transfer line item
  TransferAppService -> InventoryTransactionsService: create({
    transactionType: 'Transfer',
    componentId: line.componentId,
    sourceLocationId: transfer.sourceBinId,
    destinationLocationId: transfer.destinationBinId,
    quantity: line.quantity,
    reference: transfer.transferNumber,
    reason: 'Internal bin-to-bin warehouse transfer',
    createdBy: 'SYSTEM'
  })
end

TransferAppService -> InventoryProjectionsService: rebuild()
TransferAppService -> TransferRepo: save(transfer)
API -> UI: 200 OK
```

---

# 15. Inventory Integration

- Completing a transfer creates Inventory Transfer Transactions (`transactionType: 'Transfer'`) via `@ananya/inventory` Application Services.
- Warehouse **never** writes directly to `inventory_ledger` or `inventory_projections`.

---

# 16. Database Schema

```sql
CREATE TABLE warehouse_transfers (
  id VARCHAR(36) PRIMARY KEY,
  transfer_number VARCHAR(64) NOT NULL UNIQUE,
  source_bin_id VARCHAR(36) NOT NULL REFERENCES warehouse_bins(id),
  destination_bin_id VARCHAR(36) NOT NULL REFERENCES warehouse_bins(id),
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE warehouse_transfer_lines (
  id VARCHAR(36) PRIMARY KEY,
  transfer_id VARCHAR(36) NOT NULL REFERENCES warehouse_transfers(id) ON DELETE CASCADE,
  component_id VARCHAR(36) NOT NULL REFERENCES components(id),
  quantity NUMERIC(12, 4) NOT NULL,
  batch_number VARCHAR(128),
  serial_numbers TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

# 17. API Design

- `POST /api/v1/warehouse-transfers`: Create transfer.
- `GET /api/v1/warehouse-transfers`: List transfers.
- `GET /api/v1/warehouse-transfers/:id`: Get transfer details.
- `POST /api/v1/warehouse-transfers/:id/lines`: Add line item.
- `POST /api/v1/warehouse-transfers/:id/approve`: Approve transfer.
- `POST /api/v1/warehouse-transfers/:id/complete`: Complete transfer (executes Inventory Transfer).

---

# 18. UI Workflow

1. **Transfer Request Form**: Select source bin, destination bin, component, and quantity.
2. **Transfer Dispatch & Confirmation**: Move stock physically and confirm arrival.

---

# 19. Validation Rules

- Source and destination bins must be distinct.
- Transfer quantity must be `> 0`.

---

# 20. Future Extensions

- Guided putaway optimization algorithms based on bin proximity.

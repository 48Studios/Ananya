# RFC-0020: Manufacturing Traceability

**Status:** Accepted

**Author:** Ananya Contributors

**Created:** 2026-07-22

---

# 1. Purpose

This RFC defines the **Manufacturing Traceability** aggregate in the Manufacturing Bounded Context. Traceability provides complete genealogy for any finished product, enabling forward tracing (finished product → consumed components → suppliers) and backward tracing (component batch → production orders → finished products shipped).

---

# 2. Scope

- Complete forward traceability: Finished Product → Production Order → Material Consumption → Component Batches/Serials → Supplier → Purchase Order → Goods Receipt.
- Complete backward traceability: Component Batch/Serial → Material Consumption → Production Order → Finished Product.
- Immutable audit records.
- Read-model queries optimized for genealogy traversal.

---

# 3. Ubiquitous Language

- **Traceability Record**: An immutable link recording the relationship between a production event and its inputs/outputs.
- **Forward Trace**: Starting from a finished product, walking down to consumed raw materials and their supply chain origin.
- **Backward Trace**: Starting from a raw material batch/serial, walking up to finished products that consumed it.
- **Genealogy Tree**: The complete hierarchy of production relationships for a single finished product.

---

# 4. Aggregate Roots

- **`ManufacturingTraceability`**: Root entity representing a single traceability link record.

---

# 5. Entities

None. Traceability records are flat, immutable link records. Genealogy is assembled by querying collections of records.

---

# 6. Value Objects

- **`TraceabilityEventType`**: Enum (`MATERIAL_CONSUMED`, `FINISHED_GOODS_PRODUCED`).
- **`TraceabilityDirection`**: Enum used in queries (`FORWARD`, `BACKWARD`).

---

# 7. Commands

- `RecordMaterialConsumptionTraceCommand`: Creates traceability links when material is consumed.
- `RecordFinishedGoodsTraceCommand`: Creates traceability links when finished goods are produced.

---

# 8. Queries

- `GetForwardTraceQuery`: Given a finished product batch/serial, returns the complete genealogy tree (consumed components, batches, serials, suppliers, POs, GRs).
- `GetBackwardTraceQuery`: Given a component batch/serial, returns all production orders and finished products that consumed it.
- `GetProductionOrderTraceQuery`: Returns all traceability records for a specific production order.

---

# 9. Domain Services

- **`TraceabilityRecorder`**: Creates traceability records during material consumption and finished goods posting. Called by `MaterialConsumptionApplicationService` and `FinishedGoodsReceiptApplicationService`.

---

# 10. Application Services

- **`ManufacturingTraceabilityApplicationService`**: Provides genealogy query APIs. Joins traceability records with Procurement data (Suppliers, POs, Goods Receipts) for complete supply chain visibility.

---

# 11. Repository Contracts

```typescript
export interface ManufacturingTraceabilityRepository {
  findByProductionOrderId(productionOrderId: string): Promise<ManufacturingTraceability[]>;
  findByFinishedGoodsComponentId(componentId: string): Promise<ManufacturingTraceability[]>;
  findByConsumedComponentId(componentId: string): Promise<ManufacturingTraceability[]>;
  findByBatchNumber(batchNumber: string): Promise<ManufacturingTraceability[]>;
  findBySerialNumber(serialNumber: string): Promise<ManufacturingTraceability[]>;
  save(record: ManufacturingTraceability): Promise<void>;
  saveMany(records: ManufacturingTraceability[]): Promise<void>;
}
```

---

# 12. Domain Invariants

- Traceability records are **immutable**. Once created, they cannot be updated or deleted.
- Every `MATERIAL_CONSUMED` record must reference a valid `productionOrderId`, `consumptionId`, and `componentId`.
- Every `FINISHED_GOODS_PRODUCED` record must reference a valid `productionOrderId`, `fgrId`, and `componentId`.

---

# 13. State Machines

None. Traceability records are append-only, immutable event logs.

---

# 14. Sequence Diagrams

```
MaterialConsumptionAppService -> TraceabilityRecorder: recordConsumption(productionOrderId, consumptionId, lines)

loop for each consumption line
  TraceabilityRecorder -> TraceabilityRepo: save({
    eventType: 'MATERIAL_CONSUMED',
    productionOrderId,
    consumptionId,
    componentId: line.componentId,
    locationId: line.locationId,
    quantity: line.quantityConsumed,
    batchNumber: line.batchNumber,
    serialNumbers: line.serialNumbers
  })
end
```

```
User -> UI: View Traceability for Finished Product Batch PROD-BATCH-001
UI -> API: GET /api/v1/traceability/forward?batchNumber=PROD-BATCH-001
API -> TraceabilityAppService: getForwardTrace('PROD-BATCH-001')
TraceabilityAppService -> TraceabilityRepo: findByBatchNumber('PROD-BATCH-001')
TraceabilityAppService -> TraceabilityRepo: findByProductionOrderId(orderId)
TraceabilityAppService: assemble genealogy tree
API -> UI: 200 OK (Genealogy tree JSON)
```

---

# 15. Inventory Integration

- Traceability records reference `componentId`, `locationId`, `batchNumber`, and `serialNumbers` from the Inventory domain.
- Traceability does **not** write to any inventory tables.
- Traceability is a **read-model consumer** of inventory data referenced during consumption and finished goods posting.

---

# 16. Database Schema

```sql
CREATE TABLE manufacturing_traceability (
  id VARCHAR(36) PRIMARY KEY,
  event_type VARCHAR(32) NOT NULL,
  production_order_id VARCHAR(36) NOT NULL REFERENCES production_orders(id),
  consumption_id VARCHAR(36) REFERENCES material_consumptions(id),
  fgr_id VARCHAR(36) REFERENCES finished_goods_receipts(id),
  component_id VARCHAR(36) NOT NULL REFERENCES components(id),
  location_id VARCHAR(36) REFERENCES locations(id),
  quantity NUMERIC(12, 4) NOT NULL,
  batch_number VARCHAR(128),
  serial_numbers TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

# 17. API Design

- `GET /api/v1/traceability/forward`: Forward trace from finished product (by batch or serial).
- `GET /api/v1/traceability/backward`: Backward trace from component (by batch or serial).
- `GET /api/v1/traceability/production-order/:id`: All traceability records for a production order.

---

# 18. UI Workflow

1. **Traceability Search**: Enter finished product batch number or serial number to initiate forward trace.
2. **Genealogy Tree View**: Hierarchical tree displaying Production Order → Consumed Components → Batches/Serials → Supplier → PO → GR.
3. **Backward Trace**: Enter raw material batch/serial to find all finished products that consumed it.

---

# 19. Validation Rules

- `productionOrderId` must exist.
- `componentId` must exist in Inventory.
- `eventType` must be one of `MATERIAL_CONSUMED` or `FINISHED_GOODS_PRODUCED`.

---

# 20. Future Extensions

- Regulatory compliance export (FDA 21 CFR Part 11, IPC-1782 component traceability).
- Automated recall impact analysis based on backward trace results.

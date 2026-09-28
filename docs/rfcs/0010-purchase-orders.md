# RFC-0010: Purchase Orders

**Status:** Accepted

**Author:** Ananya Contributors

**Created:** 2026-07-22

---

# 1. Purpose

This RFC defines the **Purchase Order (PO)** aggregate and domain rules in the Procurement Bounded Context of Ananya ERP. A Purchase Order represents a legally binding commercial contract issued by ACME Corporation to a Supplier requesting the supply of specified components at agreed prices, quantities, and delivery schedules.

---

# 2. Scope

- Purchase Order lifecycle (`DRAFT`, `SUBMITTED`, `APPROVED`, `ISSUED`, `PARTIALLY_RECEIVED`, `FULFILLED`, `CANCELLED`).
- Purchase Order Line entities (Component selection, Quantity ordered, Quantity received, Unit price, Tax rate, Expected delivery date).
- Financial totals calculation (Subtotal, Tax, Total Amount).
- State transitions and invariant enforcement.

---

# 3. Ubiquitous Language

- **Purchase Order (PO)**: Head entity representing a purchase contract.
- **PO Number**: Unique human-readable document number (e.g. `PO-2026-0001`).
- **PO Line Item**: Specific line item requesting quantity of a single component.
- **Ordered Quantity**: Quantity requested from vendor.
- **Received Quantity**: Cumulative quantity received across all associated Goods Receipts.
- **Fulfilled Line**: A line item where `Received Quantity >= Ordered Quantity`.

---

# 4. Domain Model

```
+--------------------------------------------------------------------+
|                      Purchase Order Aggregate                      |
|                                                                    |
| [Purchase Order ID] (PK)                                           |
|  - poNumber: string (unique, e.g. PO-2026-0001)                    |
|  - supplierId: string (FK to Supplier)                             |
|  - status: PurchaseOrderStatus (Enum)                              |
|  - currency: string (ISO 4217)                                     |
|  - subtotal: Money                                                 |
|  - taxTotal: Money                                                 |
|  - grandTotal: Money                                               |
|  - notes: string?                                                  |
|  - issuedAt: Date?                                                 |
|  - expectedDeliveryDate: Date?                                     |
|                                                                    |
|  +-- Lines: PurchaseOrderLine[] (Entities)                         |
+--------------------------------------------------------------------+
```

---

# 5. Aggregate Roots

- **`PurchaseOrder`**: Root entity managing line items, total calculations, state machine transitions, and supplier authorization checks.

---

# 6. Entities

- **`PurchaseOrderLine`**: Line item entity owned by PurchaseOrder (`id`, `purchaseOrderId`, `componentId`, `vendorPartNumber`, `unitPrice`, `quantityOrdered`, `quantityReceived`, `taxRate`, `lineTotal`).

---

# 7. Value Objects

- **`PoNumber`**: Auto-generated sequential business document identifier (e.g. `PO-2026-0042`).
- **`PurchaseOrderStatus`**: Immutable status enum (`DRAFT`, `SUBMITTED`, `APPROVED`, `ISSUED`, `PARTIALLY_RECEIVED`, `FULFILLED`, `CANCELLED`).

---

# 8. Commands

- `CreatePurchaseOrderCommand`: Initializes a new DRAFT Purchase Order.
- `AddPoLineCommand`: Appends a line item to a DRAFT Purchase Order.
- `UpdatePoLineCommand`: Modifies price or quantity on a DRAFT Purchase Order line.
- `RemovePoLineCommand`: Deletes a line item from a DRAFT Purchase Order.
- `SubmitPurchaseOrderCommand`: Transitions PO from DRAFT to SUBMITTED.
- `ApprovePurchaseOrderCommand`: Approves SUBMITTED PO.
- `IssuePurchaseOrderCommand`: Marks PO as ISSUED to vendor.
- `CancelPurchaseOrderCommand`: Cancels PO (allowed only prior to receiving).

---

# 9. Queries

- `GetPurchaseOrderByIdQuery`: Fetches PO aggregate by ID.
- `GetPurchaseOrderByNumberQuery`: Fetches PO by document number.
- `ListPurchaseOrdersQuery`: Filters POs by status, supplier ID, date range, search query.

---

# 10. Application Services

- **`PurchaseOrderApplicationService`**: Handles use cases for PO creation, approval workflow, status transition, and financial total recalculations.

---

# 11. Domain Services

- **`PoNumberGenerator`**: Generates atomic, sequential PO document numbers.
- **`PoApprovalPolicyService`**: Validates whether a PO requires high-level managerial approval based on total monetary value.

---

# 12. State Machines

```
[DRAFT] ---> [SUBMITTED] ---> [APPROVED] ---> [ISSUED] ---> [PARTIALLY_RECEIVED] ---> [FULFILLED]
   |             |                |              |
   v             v                v              v
[CANCELLED]  [CANCELLED]     [CANCELLED]    [CANCELLED]
```

---

# 13. Domain Invariants

- A Purchase Order must have a valid `supplierId`.
- At least one PO Line is required before a Purchase Order can be transitioned out of `DRAFT`.
- Line items cannot be added, edited, or removed once a PO is in `APPROVED`, `ISSUED`, `PARTIALLY_RECEIVED`, or `FULFILLED` state.
- `quantityOrdered` must be strictly positive (`> 0`).
- Total fields (`subtotal`, `taxTotal`, `grandTotal`) must be non-negative and mathematically equal to the sum of line totals.

---

# 14. Integration Points

- **`@ananya/procurement` (Suppliers)**: Validates supplier is active.
- **`@ananya/inventory` (Components)**: Validates component identity for line items.

---

# 15. Repository Contracts

```typescript
export interface PurchaseOrderRepository {
  findById(id: string): Promise<PurchaseOrder | null>;
  findByPoNumber(poNumber: string): Promise<PurchaseOrder | null>;
  findMany(options?: FindManyPurchaseOrdersOptions): Promise<PurchaseOrder[]>;
  save(po: PurchaseOrder): Promise<void>;
}
```

---

# 16. Database Schema

```sql
CREATE TABLE purchase_orders (
  id VARCHAR(36) PRIMARY KEY,
  po_number VARCHAR(64) NOT NULL UNIQUE,
  supplier_id VARCHAR(36) NOT NULL REFERENCES suppliers(id),
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  subtotal NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
  tax_total NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
  grand_total NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
  notes TEXT,
  issued_at TIMESTAMPTZ,
  expected_delivery_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE purchase_order_lines (
  id VARCHAR(36) PRIMARY KEY,
  purchase_order_id VARCHAR(36) NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  component_id VARCHAR(36) NOT NULL,
  vendor_part_number VARCHAR(128),
  unit_price NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
  quantity_ordered INT NOT NULL DEFAULT 1,
  quantity_received INT NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  line_total NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

# 17. API Specification

- `POST /api/v1/purchase-orders`: Create draft PO.
- `GET /api/v1/purchase-orders`: List purchase orders.
- `GET /api/v1/purchase-orders/:id`: Get PO details with lines.
- `POST /api/v1/purchase-orders/:id/lines`: Add line item.
- `DELETE /api/v1/purchase-orders/:id/lines/:lineId`: Remove line item.
- `POST /api/v1/purchase-orders/:id/submit`: Submit PO.
- `POST /api/v1/purchase-orders/:id/approve`: Approve PO.
- `POST /api/v1/purchase-orders/:id/issue`: Mark PO issued.
- `POST /api/v1/purchase-orders/:id/cancel`: Cancel PO.

---

# 18. UI Workflows

1. **PO Management List**: View POs with status filters (`Draft`, `Issued`, `Partial`, `Fulfilled`).
2. **PO Builder Interface**: Add components using quick component search, fetch vendor part number & default price, calculate tax and totals live.
3. **PO Detail Page**: Action buttons based on current state (Submit, Approve, Issue, Cancel, Create Goods Receipt).

---

# 19. Sequence Diagrams

```
User -> UI: Click "Approve PO"
UI -> API: POST /api/v1/purchase-orders/:id/approve
API -> PoAppService: approvePo(id)
PoAppService -> PoRepo: findById(id)
PoAppService -> PO Aggregate: po.approve()
PO Aggregate -> PO Aggregate: validateCanApprove() [State must be SUBMITTED]
PoAppService -> PoRepo: save(po)
API -> UI: 200 OK (Updated PO DTO)
```

---

# 20. Future Extensions

- Digital signature and PDF export generation for external vendor dispatch.
- Re-order alerts based on safety stock projections from Inventory.

# RFC-0013: Purchase Invoices

**Status:** Accepted

**Author:** Ananya Contributors

**Created:** 2026-07-22

---

# 1. Purpose

This RFC defines the **Purchase Invoice** aggregate and the **3-Way Matching Engine** in Procurement. Purchase Invoices register vendor bills and perform automated 3-way matching across the Purchase Order, Goods Receipt, and Vendor Invoice to authorize payment.

---

# 2. Scope

- Vendor Invoice recording (Vendor Invoice Number, Invoice Date, Due Date, Monetary amounts).
- 3-Way Matching verification (PO Price vs Invoice Price, Goods Received Quantity vs Invoice Billed Quantity).
- Invoice matching states (`DRAFT`, `MATCHED`, `VARIANCE_HOLD`, `APPROVED`, `PAID`, `CANCELLED`).

---

# 3. Ubiquitous Language

- **Purchase Invoice (PI)**: Accounts Payable document representing vendor bill.
- **3-Way Match**: Automated audit rule verifying that `PO Price == Invoice Price` AND `Received Qty >= Invoiced Qty`.
- **Price Variance**: Difference between PO unit price and invoice unit price.
- **Quantity Variance**: Billed quantity exceeding accepted Goods Receipt quantity.

---

# 4. Domain Model

```
+--------------------------------------------------------------------+
|                    Purchase Invoice Aggregate                      |
|                                                                    |
| [Purchase Invoice ID] (PK)                                         |
|  - invoiceNumber: string (unique e.g. PI-2026-0001)                |
|  - vendorInvoiceNumber: string                                     |
|  - supplierId: string (FK to Supplier)                             |
|  - purchaseOrderId: string (FK to PurchaseOrder)                   |
|  - goodsReceiptId: string? (FK to GoodsReceipt)                    |
|  - status: PurchaseInvoiceStatus                                   |
|  - matchStatus: ThreeWayMatchStatus (PENDING, MATCHED, VARIANCE)   |
|  - totalAmount: Money                                              |
|  - dueDate: Date                                                   |
|                                                                    |
|  +-- Lines: PurchaseInvoiceLine[] (Entities)                       |
+--------------------------------------------------------------------+
```

---

# 5. Aggregate Roots

- **`PurchaseInvoice`**: Root aggregate managing invoice lines, total validation, and 3-way matching state transitions.

---

# 6. Entities

- **`PurchaseInvoiceLine`**: Invoice line entity (`id`, `purchaseInvoiceId`, `componentId`, `quantityBilled`, `unitPrice`, `lineTotal`).

---

# 7. Value Objects

- **`InvoiceNumber`**: Internal tracking number (e.g. `PI-2026-0012`).
- **`ThreeWayMatchStatus`**: Match outcome enum (`PENDING`, `MATCHED`, `PRICE_VARIANCE`, `QUANTITY_VARIANCE`, `APPROVED`).

---

# 8. Commands

- `CreatePurchaseInvoiceCommand`: Registers a vendor invoice.
- `AddInvoiceLineCommand`: Appends line item details.
- `PerformThreeWayMatchCommand`: Executes automated matching against PO & Goods Receipts.
- `ApproveInvoiceForPaymentCommand`: Approves invoice for disbursement.

---

# 9. Queries

- `GetPurchaseInvoiceByIdQuery`: Retrieves invoice details and 3-way match audit log.
- `ListPurchaseInvoicesQuery`: Filters invoices by match status, payment status, supplier.

---

# 10. Application Services

- **`PurchaseInvoiceApplicationService`**: Manages invoice entry, triggers 3-way matching execution, and records variance approvals.

---

# 11. Domain Services

- **`ThreeWayMatcherDomainService`**: Compares PO line price, Goods Receipt line received qty, and Invoice line billed qty/price. Enforces zero-tolerance or threshold policy rules.

---

# 12. State Machines

```
[DRAFT] ---> [MATCHED] ---------> [APPROVED_FOR_PAYMENT] ---> [PAID]
   |            |
   +---------> [VARIANCE_HOLD] --+
```

---

# 13. Domain Invariants

- Invoice cannot be approved for payment if 3-way match fails with unapproved price or quantity variance.
- Total invoice amount must equal sum of line totals + tax/shipping fees.

---

# 14. Integration Points

- **`@ananya/procurement` (Purchase Orders & Goods Receipts)**: Reads PO prices and Goods Receipt quantities.

---

# 15. Repository Contracts

```typescript
export interface PurchaseInvoiceRepository {
  findById(id: string): Promise<PurchaseInvoice | null>;
  findMany(
    options?: FindManyPurchaseInvoicesOptions,
  ): Promise<PurchaseInvoice[]>;
  save(invoice: PurchaseInvoice): Promise<void>;
}
```

---

# 16. Database Schema

```sql
CREATE TABLE purchase_invoices (
  id VARCHAR(36) PRIMARY KEY,
  invoice_number VARCHAR(64) NOT NULL UNIQUE,
  vendor_invoice_number VARCHAR(128) NOT NULL,
  supplier_id VARCHAR(36) NOT NULL REFERENCES suppliers(id),
  purchase_order_id VARCHAR(36) NOT NULL REFERENCES purchase_orders(id),
  goods_receipt_id VARCHAR(36) REFERENCES goods_receipts(id),
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  match_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  total_amount NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
  due_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE purchase_invoice_lines (
  id VARCHAR(36) PRIMARY KEY,
  purchase_invoice_id VARCHAR(36) NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  component_id VARCHAR(36) NOT NULL,
  quantity_billed INT NOT NULL DEFAULT 1,
  unit_price NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
  line_total NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

# 17. API Specification

- `POST /api/v1/purchase-invoices`: Create vendor invoice.
- `GET /api/v1/purchase-invoices`: List invoices.
- `GET /api/v1/purchase-invoices/:id`: Get invoice details.
- `POST /api/v1/purchase-invoices/:id/match`: Execute 3-way match.
- `POST /api/v1/purchase-invoices/:id/approve`: Approve invoice.

---

# 18. UI Workflows

1. **Invoice Entry & Matching Dashboard**: Register vendor bill number and due date, select PO & Goods Receipt, run 3-way match engine, display green checkmarks for matching lines and red flags for price/qty variances.

---

# 19. Sequence Diagrams

```
User -> UI: Run 3-Way Match
UI -> API: POST /api/v1/purchase-invoices/:id/match
API -> InvoiceAppService: performMatch(id)
InvoiceAppService -> DomainService: ThreeWayMatcher.evaluate(invoice, po, gr)
DomainService -> InvoiceAppService: MatchResult { isMatch: true }
InvoiceAppService -> InvoiceRepo: save(invoice.markMatched())
API -> UI: 200 OK (Match Result)
```

---

# 20. Future Extensions

- Automated Accounts Payable (AP) export to external accounting suites.

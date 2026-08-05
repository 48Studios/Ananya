# RFC-0015: Procurement Reporting

**Status:** Accepted

**Author:** Ananya Contributors

**Created:** 2026-07-22

---

# 1. Purpose

This RFC defines the **Procurement Reporting & Read Models** in Ananya ERP. Procurement Reporting provides real-time visibility into supplier performance, purchasing spend, open PO fulfillment rates, and receiving velocity.

---

# 2. Scope

- Read models / projections for procurement operations.
- Key Performance Indicators (KPIs): Spend by Supplier, Spend by Component Category, On-Time In-Full (OTIF) Delivery Rate, Purchase Order Cycle Time.
- Open PO Aging queries.

---

# 3. Ubiquitous Language

- **OTIF (On-Time In-Full)**: Supplier metric measuring percentage of orders delivered on or before the expected date with complete ordered quantity.
- **Supplier Lead Time Variance**: Difference between vendor quoted lead time and actual receiving lead time.
- **Open PO Exposure**: Total monetary committed value of issued POs awaiting delivery.

---

# 4. Domain Model

- Read-model projections derived from `suppliers`, `purchase_orders`, and `goods_receipts`.

---

# 5. Aggregate Roots

- Read models only (no state mutation).

---

# 6. Entities

- Read DTO projections.

---

# 7. Value Objects

- Report filter criteria (`supplierId`, `dateRange`, `statusFilter`).

---

# 8. Commands

- None (Reporting is query-only).

---

# 9. Queries

- `GetProcurementMetricsQuery`: Fetches high-level KPIs (Total Spend, Open PO Count, OTIF Rate).
- `GetSupplierPerformanceQuery`: Calculates vendor ratings based on delivery timeliness and defect rates.
- `GetOpenPoAgingQuery`: Groups open PO lines by expected delivery age buckets (<7 days, 7-14 days, >14 days overdue).

---

# 10. Application Services

- **`ProcurementReportingApplicationService`**: Aggregates read models and computes analytics metrics.

---

# 11. Domain Services

- **`OtifCalculator`**: Computes OTIF percentages per vendor.

---

# 12. State Machines

- Read-only queries.

---

# 13. Domain Invariants

- Reporting queries must not perform database writes or state updates.

---

# 14. Integration Points

- Queries data across `suppliers`, `purchase_orders`, `goods_receipts`, and `@ananya/inventory` component references.

---

# 15. Repository Contracts

```typescript
export interface ProcurementReportingRepository {
  getSummaryMetrics(): Promise<ProcurementSummaryMetrics>;
  getSupplierPerformance(
    supplierId?: string,
  ): Promise<SupplierPerformanceMetric[]>;
  getOpenPoAging(): Promise<PoAgingBucket[]>;
}
```

---

# 16. Database Schema

- Optimized read queries leveraging existing tables and indexes on `supplier_id`, `created_at`, `status`.

---

# 17. API Specification

- `GET /api/v1/procurement/reporting/metrics`: High-level metrics.
- `GET /api/v1/procurement/reporting/supplier-performance`: Vendor OTIF & lead time metrics.
- `GET /api/v1/procurement/reporting/open-po-aging`: PO aging breakdown.

---

# 18. UI Workflows

1. **Procurement Operations Dashboard**: High-density operational dashboard showing total active spend, pending receipt items, supplier OTIF rankings, and overdue delivery alerts.

---

# 19. Sequence Diagrams

```
User -> UI: Open Procurement Dashboard
UI -> API: GET /api/v1/procurement/reporting/metrics
API -> ReportingAppService: getSummaryMetrics()
ReportingAppService -> ReportingRepo: getSummaryMetrics()
ReportingRepo -> Postgres: Aggregate query over POs & GRs
API -> UI: 200 OK (Metrics JSON)
```

---

# 20. Future Extensions

- Automated email digest for overdue PO deliveries to procurement managers.

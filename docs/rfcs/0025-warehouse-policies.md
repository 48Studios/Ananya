# RFC-0025: Warehouse Policies

**Status:** Accepted

**Author:** Ananya Contributors

**Created:** 2026-07-25

---

# 1. Purpose

This RFC defines the **Warehouse Policy** aggregate in the Warehouse Bounded Context. Warehouse Policies configure operational behavioral rules governing bin capacity enforcement, negative inventory allowance, directed putaway, directed picking, and default operational bins.

---

# 2. Scope

- Defining configurable operational policy parameters.
- Bin capacity enforcement rules.
- Negative inventory allowance settings.
- Directed putaway and directed picking rules.
- Default receiving, production, and shipping bin mapping.

---

# 3. Ubiquitous Language

- **Warehouse Policy**: Operational governance rule set for a warehouse facility.
- **Enforce Bin Capacity**: Policy toggle dictating whether putaway into a full bin is prohibited.
- **Allow Negative Inventory**: Policy toggle dictating whether inventory balance can drop below zero.

---

# 4. Aggregate Roots

- **`WarehousePolicy`**: Root aggregate holding policy rules for a warehouse.

---

# 5. Entities

None.

---

# 6. Value Objects

- **`PolicyType`**: Enum (`CAPACITY_ENFORCEMENT`, `NEGATIVE_INVENTORY`, `DIRECTED_PUTAWAY`, `DEFAULT_BINS`).

---

# 7. Commands

- `CreateWarehousePolicyCommand`: Creates a policy configuration.
- `UpdateWarehousePolicyCommand`: Modifies policy flags and default bin assignments.

---

# 8. Queries

- `GetPolicyByWarehouseIdQuery`: Retrieves active policy for a warehouse.
- `ListWarehousePoliciesQuery`: Lists all warehouse policies.

---

# 9. Domain Services

- **`PolicyEvaluator`**: Evaluates whether a proposed warehouse operation complies with active warehouse policies.

---

# 10. Application Services

- **`WarehousePoliciesApplicationService`**: Manages policy configuration and exposes evaluation contracts for transfer and putaway operations.

---

# 11. Repository Contracts

```typescript
export interface WarehousePolicyRepository {
  findById(id: string): Promise<WarehousePolicy | null>;
  findByWarehouseId(warehouseId: string): Promise<WarehousePolicy | null>;
  findMany(): Promise<WarehousePolicy[]>;
  save(policy: WarehousePolicy): Promise<void>;
}
```

---

# 12. Domain Invariants

- Only one active `WarehousePolicy` document per warehouse.
- Default bins referenced in policy must exist and be active.

---

# 13. State Machines

None. Policies are configurable state records.

---

# 14. Sequence Diagrams

```
User -> UI: Update Policy Rules for WH-MAIN
UI -> API: POST /api/v1/warehouse-policies
API -> PolicyAppService: createOrUpdatePolicy(dto)
PolicyAppService -> PolicyRepo: findByWarehouseId(dto.warehouseId)
PolicyAppService -> PolicyRepo: save(policy)
API -> UI: 200 OK
```

---

# 15. Inventory Integration

- Policies govern Warehouse execution rules before delegating transactions to `@ananya/inventory`.
- Warehouse **never** updates inventory tables directly.

---

# 16. Database Schema

```sql
CREATE TABLE warehouse_policies (
  id VARCHAR(36) PRIMARY KEY,
  warehouse_id VARCHAR(36) NOT NULL UNIQUE REFERENCES warehouses(id) ON DELETE CASCADE,
  allow_negative_inventory BOOLEAN NOT NULL DEFAULT FALSE,
  enforce_bin_capacity BOOLEAN NOT NULL DEFAULT TRUE,
  directed_putaway BOOLEAN NOT NULL DEFAULT FALSE,
  directed_picking BOOLEAN NOT NULL DEFAULT FALSE,
  default_receiving_bin_id VARCHAR(36) REFERENCES warehouse_bins(id),
  default_production_bin_id VARCHAR(36) REFERENCES warehouse_bins(id),
  default_shipping_bin_id VARCHAR(36) REFERENCES warehouse_bins(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

# 17. API Design

- `POST /api/v1/warehouse-policies`: Create/update warehouse policy.
- `GET /api/v1/warehouse-policies`: List all policies.
- `GET /api/v1/warehouse-policies/warehouse/:warehouseId`: Get policy by warehouse.

---

# 18. UI Workflow

1. **Policy Settings Console**: Configure capacity enforcement, negative inventory toggles, and assign default receiving/production/shipping bins.

---

# 19. Validation Rules

- `warehouseId` must exist.
- Assigned default bins must belong to the specified warehouse.

---

# 20. Future Extensions

- Dynamic replenishment trigger thresholds based on safety stock projections.

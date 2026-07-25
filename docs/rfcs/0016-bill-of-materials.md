# RFC-0016: Bill of Materials

**Status:** Accepted

**Author:** Ananya Contributors

**Created:** 2026-07-22

---

# 1. Purpose

This RFC defines the **Bill of Materials (BOM)** aggregate root and domain rules in the Manufacturing Bounded Context of Ananya ERP. A Bill of Materials defines the exact engineering recipe, component items, quantities, scrap allowances, and assembly instructions required to produce a specific finished product or sub-assembly at 48 Studios.

---

# 2. Scope

- BOM lifecycle management (`DRAFT`, `RELEASED`, `OBSOLETE`).
- Version and revision tracking (Major/Minor versioning, release authorization).
- Line item component specifications, quantities, unit of measure, and scrap factor percentage.
- Immutability of released BOMs.

---

# 3. Ubiquitous Language

- **Bill of Materials (BOM)**: Engineering document listing all component inputs required to manufacture one unit of a finished product.
- **BOM Revision**: Version number indicating design modifications (e.g. `v1.0`, `v1.1`, `v2.0`).
- **Scrap Factor**: Expected loss percentage of a component during manufacturing (e.g., 2% allowance for surface-mount passives on tape).
- **Released BOM**: An approved, immutable BOM version authorized for active production orders.

---

# 4. Aggregate Roots

- **`BillOfMaterials`**: Root entity managing BOM header details, line item collection, revision history, and release state transitions.

---

# 5. Entities

- **`BomLine`**: Entity representing a component requirement (`id`, `bomId`, `componentId`, `quantityPerUnit`, `unitOfMeasure`, `scrapFactorPercent`, `notes`).

---

# 6. Value Objects

- **`BomRevision`**: Immutable version object representing major/minor revision strings.
- **`BomStatus`**: Enum (`DRAFT`, `RELEASED`, `OBSOLETE`).

---

# 7. Commands

- `CreateBomCommand`: Initializes a new DRAFT BOM for a finished component product.
- `AddBomLineCommand`: Appends a component line item to a DRAFT BOM.
- `UpdateBomLineCommand`: Modifies quantity or scrap factor on a DRAFT BOM line.
- `RemoveBomLineCommand`: Removes a line item from a DRAFT BOM.
- `ReleaseBomCommand`: Transitions BOM from DRAFT to RELEASED, rendering it immutable.
- `CreateNewBomRevisionCommand`: Creates a new DRAFT revision cloned from an existing BOM.
- `ObsoleteBomCommand`: Marks a released BOM as OBSOLETE.

---

# 8. Queries

- `GetBomByIdQuery`: Retrieves BOM details with line items.
- `GetActiveBomByComponentQuery`: Retrieves the currently RELEASED BOM for a finished product component.
- `ListBomsQuery`: Lists BOMs with filtering by product component ID, status, and revision.

---

# 9. Domain Services

- **`BomRevisionManager`**: Enforces revision numbering logic during new version creation.
- **`BomCircularDependencyChecker`**: Ensures a component cannot contain itself in its own multi-level BOM hierarchy.

---

# 10. Application Services

- **`BillOfMaterialsApplicationService`**: Orchestrates BOM creation, line management, release approval, and revision cloning.

---

# 11. Repository Contracts

```typescript
export interface BillOfMaterialsRepository {
  findById(id: string): Promise<BillOfMaterials | null>;
  findActiveByComponentId(componentId: string): Promise<BillOfMaterials | null>;
  findMany(options?: FindManyBomsOptions): Promise<BillOfMaterials[]>;
  save(bom: BillOfMaterials): Promise<void>;
}
```

---

# 12. Domain Invariants

- A BOM must reference a valid finished product `componentId`.
- A BOM in `RELEASED` status is strictly immutable and cannot be updated, edited, or deleted.
- Modification of a released BOM requires creating a new revision in `DRAFT` status.
- `quantityPerUnit` must be strictly positive (`> 0`).
- `scrapFactorPercent` must be non-negative (`>= 0%`).

---

# 13. State Machines

```
[DRAFT] ---> [RELEASED] ---> [OBSOLETE]
```

---

# 14. Sequence Diagrams

```
User -> UI: Release BOM
UI -> API: POST /api/v1/boms/:id/release
API -> BomAppService: releaseBom(id)
BomAppService -> BomRepo: findById(id)
BomAppService -> BOM Aggregate: bom.release()
BOM Aggregate -> BOM Aggregate: validateLinesExist()
BomAppService -> BomRepo: save(bom)
API -> UI: 200 OK (Released BOM DTO)
```

---

# 15. Inventory Integration

- BOM line items reference `componentId` and default `unitOfMeasure` from `@ananya/inventory`.
- BOM scrap factors are evaluated when calculating total material requirements for Production Orders.

---

# 16. Database Schema

```sql
CREATE TABLE bill_of_materials (
  id VARCHAR(36) PRIMARY KEY,
  component_id VARCHAR(36) NOT NULL REFERENCES components(id),
  revision VARCHAR(32) NOT NULL DEFAULT 'v1.0',
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  notes TEXT,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bill_of_material_lines (
  id VARCHAR(36) PRIMARY KEY,
  bom_id VARCHAR(36) NOT NULL REFERENCES bill_of_materials(id) ON DELETE CASCADE,
  component_id VARCHAR(36) NOT NULL REFERENCES components(id),
  quantity_per_unit NUMERIC(12, 4) NOT NULL DEFAULT 1.0000,
  unit_of_measure VARCHAR(32) NOT NULL DEFAULT 'pcs',
  scrap_factor_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

# 17. API Design

- `POST /api/v1/boms`: Create draft BOM.
- `GET /api/v1/boms`: List BOMs.
- `GET /api/v1/boms/:id`: Get BOM details with lines.
- `POST /api/v1/boms/:id/lines`: Add BOM line item.
- `DELETE /api/v1/boms/:id/lines/:lineId`: Remove BOM line item.
- `POST /api/v1/boms/:id/release`: Release BOM (lock version).
- `POST /api/v1/boms/:id/revise`: Create new revision clone.

---

# 18. UI Workflow

1. **BOM Directory**: Filter by product SKU, view active released version vs draft revisions.
2. **BOM Editor**: Add component line items using component search, set quantity per unit, specify scrap factor percentage.
3. **BOM Release Modal**: Review revision details, confirm freeze, lock editing interface.

---

# 19. Validation Rules

- `componentId` must exist in Inventory.
- BOM must contain at least 1 line item to transition to `RELEASED`.
- Only one BOM per product component can be in `RELEASED` status at any given time.

---

# 20. Future Extensions

- Multi-level hierarchical BOM explosion viewer.
- Alternative component substitution rules for supply chain shortages.

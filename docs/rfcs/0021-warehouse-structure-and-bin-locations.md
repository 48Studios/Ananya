# RFC-0021: Warehouse Structure & Bin Locations

**Status:** Accepted

**Author:** Ananya Contributors

**Created:** 2026-07-25

---

# 1. Purpose

This RFC defines the **Warehouse Structure & Bin Locations** aggregate in the Warehouse Bounded Context. It models the physical storage hierarchy of 48 Studios (Warehouse → Zone → Aisle → Rack → Shelf → Bin). Bins are the smallest physical storage unit, owning capacity, utilization, and default operational purposes (e.g., default receiving bin, default production bin, default shipping bin).

---

# 2. Scope

- Modeling the 6-level physical hierarchy: Warehouse → Zone → Aisle → Rack → Shelf → Bin.
- Bin capacity enforcement and utilization tracking.
- Operational bin purpose configuration (Receiving, Storage, Production, Shipping, Quality Hold).
- Bin lifecycle management (Active, Disabled, Maintenance).

---

# 3. Ubiquitous Language

- **Warehouse**: Top-level physical facility (e.g. `WH-MAIN`, `WH-LAB`).
- **Zone**: Logical subdivision inside a warehouse (e.g. `ZONE-SMD`, `ZONE-[BULK]`).
- **Aisle**: Physical row in a zone (e.g. `AISLE-A1`).
- **Rack**: Storage rack structure along an aisle (e.g. `RACK-R01`).
- **Shelf**: Vertical shelf level on a rack (e.g. `SHELF-S3`).
- **Bin**: Addressable bin/container where components reside (e.g. `BIN-A1-R01-S3-B04`).

---

# 4. Aggregate Roots

- **`Warehouse`**: Root aggregate representing the warehouse facility and owning the child physical hierarchy (Zones, Aisles, Racks, Shelves, Bins).

---

# 5. Entities

- **`WarehouseZone`**: Sub-location area (`id`, `warehouseId`, `code`, `name`).
- **`WarehouseAisle`**: Row within zone (`id`, `zoneId`, `code`).
- **`WarehouseRack`**: Rack structure (`id`, `aisleId`, `code`).
- **`WarehouseShelf`**: Shelf level (`id`, `rackId`, `code`).
- **`WarehouseBin`**: Addressable storage bin (`id`, `shelfId`, `code`, `capacity`, `currentUtilization`, `purpose`, `isActive`).

---

# 6. Value Objects

- **`BinPurpose`**: Enum (`RECEIVING`, `STORAGE`, `PRODUCTION`, `SHIPPING`, `QUALITY_HOLD`).
- **`WarehouseStatus`**: Enum (`ACTIVE`, `INACTIVE`, `MAINTENANCE`).

---

# 7. Commands

- `CreateWarehouseCommand`: Defines a new warehouse facility.
- `CreateZoneCommand`: Adds a zone to a warehouse.
- `CreateBinCommand`: Adds a bin to a shelf with capacity and purpose.
- `UpdateBinCapacityCommand`: Modifies maximum capacity of a bin.
- `ToggleBinStateCommand`: Activates or disables a bin.

---

# 8. Queries

- `GetWarehouseHierarchyQuery`: Retrieves full hierarchy tree.
- `ListBinsQuery`: Lists bins filtered by warehouse, purpose, or utilization.
- `GetBinByIdQuery`: Retrieves details for a specific bin.

---

# 9. Domain Services

- **`BinCapacityCalculator`**: Verifies whether a bin can accommodate additional units given its maximum capacity and current utilization.

---

# 10. Application Services

- **`WarehousesApplicationService`**: Orchestrates warehouse creation, hierarchy traversal, bin capacity updates, and purpose mapping.

---

# 11. Repository Contracts

```typescript
export interface WarehouseRepository {
  findById(id: string): Promise<Warehouse | null>;
  findByCode(code: string): Promise<Warehouse | null>;
  findMany(): Promise<Warehouse[]>;
  findBinById(binId: string): Promise<WarehouseBin | null>;
  save(warehouse: Warehouse): Promise<void>;
}
```

---

# 12. Domain Invariants

- Warehouse codes and Bin codes must be unique across the organization.
- Bins cannot have negative capacity (`capacity >= 0`).
- Disabling a bin prevents assigning new incoming inventory transfers or putaways.

---

# 13. State Machines

```
[ACTIVE] <---> [DISABLED] / [MAINTENANCE]
```

---

# 14. Sequence Diagrams

```
User -> UI: Create Bin BIN-A1-R01-S3-B04
UI -> API: POST /api/v1/warehouses/:id/bins
API -> WarehouseAppService: addBinToWarehouse(id, binDto)
WarehouseAppService -> WarehouseRepo: findById(id)
WarehouseAppService -> Warehouse: warehouse.addBin(...)
WarehouseAppService -> WarehouseRepo: save(warehouse)
API -> UI: 201 Created
```

---

# 15. Inventory Integration

- Bins map to Inventory `Location` records when stock movement occurs.
- Warehouse coordinates physical bin addresses; `@ananya/inventory` tracks ledger stock at each location.
- Warehouse **never** updates `inventory_ledger` directly.

---

# 16. Database Schema

```sql
CREATE TABLE warehouses (
  id VARCHAR(36) PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE warehouse_zones (
  id VARCHAR(36) PRIMARY KEY,
  warehouse_id VARCHAR(36) NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE warehouse_bins (
  id VARCHAR(36) PRIMARY KEY,
  warehouse_id VARCHAR(36) NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  code VARCHAR(64) NOT NULL UNIQUE,
  capacity NUMERIC(12, 4) NOT NULL DEFAULT 1000.0000,
  current_utilization NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
  purpose VARCHAR(32) NOT NULL DEFAULT 'STORAGE',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

# 17. API Design

- `POST /api/v1/warehouses`: Create warehouse.
- `GET /api/v1/warehouses`: List warehouses.
- `GET /api/v1/warehouses/:id`: Get warehouse with hierarchy.
- `POST /api/v1/warehouses/:id/bins`: Create bin in warehouse.
- `GET /api/v1/warehouse-bins`: List bins across warehouses.

---

# 18. UI Workflow

1. **Warehouse Hierarchy Explorer**: Visual tree showing Warehouse → Zone → Aisle → Rack → Shelf → Bin.
2. **Bin Capacity & Purpose Manager**: Inspect bin utilization meters and toggle operational purposes.

---

# 19. Validation Rules

- Warehouse code cannot be empty.
- Bin capacity must be `>= 0`.

---

# 20. Future Extensions

- Automated 3D warehouse grid visualization.
- Temperature and environmental sensor logging per bin.

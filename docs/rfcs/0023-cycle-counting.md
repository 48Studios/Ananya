# RFC-0023: Cycle Counting

**Status:** Accepted

**Author:** Ananya Contributors

**Created:** 2026-07-25

---

# 1. Purpose

This RFC defines the **Cycle Counting** aggregate in the Warehouse Bounded Context. Cycle Counting provides automated, recurring schedule configuration (Daily, Weekly, Monthly, Quarterly) for auditing specific warehouse zones or bins without shutting down full operations.

---

# 2. Scope

- Defining recurring cycle count schedules.
- Target bin selection rules (Zone-based, ABC velocity-based, high-value components).
- Automated generation of `StockCount` documents on scheduled dates.
- Tracking next execution date and schedule status.

---

# 3. Ubiquitous Language

- **Cycle Count Schedule**: Configuration dictating recurring physical count generation.
- **Frequency**: Interval between counts (`DAILY`, `WEEKLY`, `MONTHLY`, `QUARTERLY`).
- **Bin Selection Rule**: Rule criteria specifying which bins are included in the cycle count.

---

# 4. Aggregate Roots

- **`CycleCount`**: Root aggregate managing schedule parameters, target warehouse, frequency, and execution triggers.

---

# 5. Entities

None. Bin selection criteria are stored as value objects or JSON configuration within the aggregate.

---

# 6. Value Objects

- **`CountFrequency`**: Enum (`DAILY`, `WEEKLY`, `MONTHLY`, `QUARTERLY`).
- **`CycleCountStatus`**: Enum (`ACTIVE`, `PAUSED`, `COMPLETED`).

---

# 7. Commands

- `CreateCycleCountScheduleCommand`: Defines a new recurring cycle count schedule.
- `TriggerCycleCountExecutionCommand`: Generates a `StockCount` document for the current schedule execution date.
- `PauseCycleCountCommand`: Suspends recurring schedule.
- `ResumeCycleCountCommand`: Resumes recurring schedule.

---

# 8. Queries

- `GetCycleCountByIdQuery`: Retrieves cycle count schedule.
- `ListCycleCountsQuery`: Lists schedules by warehouse or status.

---

# 9. Domain Services

- **`ScheduleCalculator`**: Computes the next scheduled execution date based on frequency.

---

# 10. Application Services

- **`CycleCountsApplicationService`**: Manages schedule configuration and triggers `StockCountsApplicationService.create()` when schedule executes.

---

# 11. Repository Contracts

```typescript
export interface CycleCountRepository {
  findById(id: string): Promise<CycleCount | null>;
  findMany(options?: FindManyCycleCountsOptions): Promise<CycleCount[]>;
  save(cycleCount: CycleCount): Promise<void>;
}
```

---

# 12. Domain Invariants

- Next scheduled date must be in the future when schedule is created.
- Execution requires an `ACTIVE` schedule.

---

# 13. State Machines

```
[ACTIVE] <---> [PAUSED]
```

---

# 14. Sequence Diagrams

```
Cron / User -> API: POST /api/v1/cycle-counts/:id/execute
API -> CycleCountAppService: executeCycleCount(id)
CycleCountAppService -> CycleCountRepo: findById(id)
CycleCountAppService -> StockCountAppService: createStockCount(...)
CycleCountAppService -> CycleCount: cycleCount.advanceSchedule()
CycleCountAppService -> CycleCountRepo: save(cycleCount)
API -> UI: 201 Created (New Stock Count)
```

---

# 15. Inventory Integration

- Cycle Counting generates `StockCount` documents. Reconciliations flow through `StockCount` posting into `InventoryTransactionsService.create({ transactionType: 'Adjustment' })`.
- Warehouse **never** updates inventory tables directly.

---

# 16. Database Schema

```sql
CREATE TABLE cycle_counts (
  id VARCHAR(36) PRIMARY KEY,
  warehouse_id VARCHAR(36) NOT NULL REFERENCES warehouses(id),
  name VARCHAR(128) NOT NULL,
  frequency VARCHAR(32) NOT NULL DEFAULT 'MONTHLY',
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  selection_rule JSONB,
  next_scheduled_date TIMESTAMPTZ NOT NULL,
  last_executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

# 17. API Design

- `POST /api/v1/cycle-counts`: Create schedule.
- `GET /api/v1/cycle-counts`: List schedules.
- `GET /api/v1/cycle-counts/:id`: Get schedule details.
- `POST /api/v1/cycle-counts/:id/execute`: Trigger count document generation.
- `POST /api/v1/cycle-counts/:id/pause`: Pause schedule.

---

# 18. UI Workflow

1. **Schedule Configurator**: Select warehouse, frequency, and bin criteria.
2. **Upcoming Audits List**: View next scheduled execution dates and trigger manual runs.

---

# 19. Validation Rules

- `nextScheduledDate` must be valid.
- `frequency` must be one of `DAILY`, `WEEKLY`, `MONTHLY`, `QUARTERLY`.

---

# 20. Future Extensions

- ABC inventory classification integration for automatic bin selection.

# RFC-0047: Work Orders & Repairs

- **Status**: Accepted
- **Author**: Ananya ERP Core Team
- **Created**: 2026-07-26

## 1. Purpose
Define the architectural design, ubiquitous language, state machine, and domain boundaries for Work Orders & Repairs within the Service Management bounded context of Ananya ERP.

## 2. Scope
Covers technical work order generation, technician dispatch, planned vs actual labor hours tracking, repair execution state, and completion reporting.

## 3. Ubiquitous Language
- **Work Order**: A technical task assignment specifying repair or maintenance instructions, assigned technician, and labor hours.
- **Work Order Number**: Human-readable unique identifier formatted as `WO-YYYY-XXXX`.
- **Planned Hours**: Estimated labor hours required to perform the repair operation.
- **Actual Hours**: Accumulated labor hours spent by technicians executing the work order.

## 4. Aggregate Roots
- `WorkOrder`: Aggregate root maintaining work order state, parent service request reference, assigned technician, labor hours, priority, and status lifecycle.

## 5. Entities
- None.

## 6. Value Objects
- `WorkOrderStatus`: `'CREATED' | 'ASSIGNED' | 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED' | 'CANCELLED'`
- `WorkOrderPriority`: `'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'`

## 7. Commands
- `CreateWorkOrderCommand`: Initializes a new WorkOrder in status `CREATED`.
- `AssignWorkOrderCommand`: Assigns a technician and transitions status to `ASSIGNED`.
- `StartWorkOrderCommand`: Transitions status to `IN_PROGRESS`.
- `PauseWorkOrderCommand`: Transitions status to `PAUSED`.
- `CompleteWorkOrderCommand`: Transitions status to `COMPLETED`.
- `CancelWorkOrderCommand`: Transitions status to `CANCELLED`.
- `LogWorkOrderHoursCommand`: Increments actual labor hours logged on the work order.

## 8. Queries
- `FindWorkOrderByIdQuery`
- `FindWorkOrderByNumberQuery`
- `ListWorkOrdersQuery` (filters by serviceRequestId, technician, status, priority)

## 9. Domain Services
- None.

## 10. Application Services
- `WorkOrdersService`: Application coordinator managing work order creation, assignment, execution, and hours logging.

## 11. Repository Contracts
- `WorkOrderRepository`: `findById()`, `findByNumber()`, `findMany()`, `save()`, `generateNextWorkOrderNumber()`.

## 12. Domain Invariants
- `serviceRequestId` and `title` are required.
- Planned hours cannot be negative.
- Actual hours logged must be greater than zero.
- Completed or Cancelled work orders cannot accept additional labor hours.

## 13. State Machine
```text
[ CREATED ] ──> (Assign) ──> [ ASSIGNED ] ──> (Start) ──> [ IN_PROGRESS ]
    │                            │                            │         │
    │                            │                            ├─(Pause)─┼─► [ PAUSED ]
    │                            │                            │         │      │
    │                            │                            │         ◄─(Resume)┘
    │                            │                            ▼
    │                            └───────────────────► [ COMPLETED ]
    │                                                         │
    └──> (Cancel) ────────────────────────────────────────────┴─> [ CANCELLED ]
```

## 14. Sequence Diagrams
```text
Technician -> WorkOrdersService: start(id)
WorkOrdersService -> WorkOrder: start()
WorkOrder -> WorkOrdersService: updated WorkOrder
WorkOrdersService -> WorkOrderRepository: save(workOrder)
```

## 15. Cross-Module Integration
- References `serviceRequestId` from `ServiceRequest`.
- Does NOT mutate Inventory or Finance directly; labor reporting remains scoped to WorkOrder state.

## 16. Database Schema
- Table `service_work_orders`: `id`, `work_order_number`, `service_request_id`, `assigned_technician`, `title`, `description`, `planned_hours`, `actual_hours`, `priority`, `status`, `created_at`, `updated_at`.

## 17. API Design
- `POST /work-orders`
- `GET /work-orders`
- `GET /work-orders/:id`
- `POST /work-orders/:id/assign`
- `POST /work-orders/:id/start`
- `POST /work-orders/:id/pause`
- `POST /work-orders/:id/complete`
- `POST /work-orders/:id/cancel`
- `POST /work-orders/:id/hours`

## 18. UI Workflow
- `/work-orders`: Kanban and list views of work orders filtered by technician and status.
- `/work-orders/[id]`: Work order execution detail page with time logging and status controls.

## 19. Validation Rules
- DTO validation via `class-validator`.

## 20. Future Extensions
- Mobile field technician dispatch and offline work order sync.

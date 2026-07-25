# RFC-0046: Service Requests

- **Status**: Accepted
- **Author**: Ananya ERP Core Team
- **Created**: 2026-07-26

## 1. Purpose
Define the architectural design, ubiquitous language, state machine, and domain boundaries for Service Requests within the Service Management bounded context of Ananya ERP.

## 2. Scope
Covers service request logging, customer reference linking, product/serial identification, priority/category classification, diagnostic workflow, and resolution lifecycle.

## 3. Ubiquitous Language
- **Service Request**: An operational record tracking a reported customer issue or request for technical support, repair, or maintenance post-delivery.
- **Service Number**: Human-readable unique identifier formatted as `SRV-YYYY-XXXX`.
- **Diagnostic Notes**: Technical findings documented during initial issue assessment.

## 4. Aggregate Roots
- `ServiceRequest`: Aggregate root maintaining service request state, customer reference, sales order reference, project reference, serial number, status, priority, and diagnostic notes.

## 5. Entities
- None.

## 6. Value Objects
- `ServiceRequestStatus`: `'OPEN' | 'ASSIGNED' | 'DIAGNOSING' | 'WAITING_PARTS' | 'REPAIRING' | 'COMPLETED' | 'CLOSED' | 'CANCELLED'`
- `ServicePriority`: `'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'`
- `ServiceCategory`: `'HARDWARE' | 'SOFTWARE' | 'MAINTENANCE' | 'INSTALLATION' | 'INSPECTION'`

## 7. Commands
- `CreateServiceRequestCommand`: Initializes a new Service Request in status `OPEN`.
- `AssignServiceRequestCommand`: Assigns a technician or team and transitions status to `ASSIGNED`.
- `DiagnoseServiceRequestCommand`: Records diagnostic details and transitions status to `DIAGNOSING`.
- `SetWaitingPartsCommand`: Transitions status to `WAITING_PARTS`.
- `StartRepairCommand`: Transitions status to `REPAIRING`.
- `CompleteServiceRequestCommand`: Transitions status to `COMPLETED`.
- `CloseServiceRequestCommand`: Transitions status to `CLOSED`.
- `CancelServiceRequestCommand`: Transitions status to `CANCELLED`.

## 8. Queries
- `FindServiceRequestByIdQuery`
- `FindServiceRequestByNumberQuery`
- `ListServiceRequestsQuery` (filters by status, customer, priority, category, search)

## 9. Domain Services
- None.

## 10. Application Services
- `ServiceRequestsService`: Application coordinator orchestrating service request creation, assignment, status transitions, and repository persistence.

## 11. Repository Contracts
- `ServiceRequestRepository`: `findById()`, `findByNumber()`, `findMany()`, `save()`, `generateNextServiceNumber()`.

## 12. Domain Invariants
- Only existing Customers may have Service Requests created.
- `customerId`, `title`, and `category` are required fields.
- Completed or Closed Service Requests cannot accept new diagnostic modifications.
- Cancelled Service Requests cannot be re-opened.

## 13. State Machine
```text
[ OPEN ] ──> (Assign) ──> [ ASSIGNED ] ──> (Diagnose) ──> [ DIAGNOSING ]
   │                            │                              │
   │                            │                              ├──> [ WAITING_PARTS ]
   │                            │                              │            │
   │                            └──────────────► [ REPAIRING ] ◄────────────┘
   │                                                 │
   │                                                 ▼
   │                                           [ COMPLETED ] ──> (Close) ──> [ CLOSED ]
   │                                                 │
   └──> (Cancel) ────────────────────────────────────┴─> [ CANCELLED ]
```

## 14. Sequence Diagrams
```text
Customer/Agent -> ServiceRequestsService: create(dto)
ServiceRequestsService -> ServiceRequest: create(props)
ServiceRequest -> ServiceRequestsService: ServiceRequest instance
ServiceRequestsService -> ServiceRequestRepository: save(request)
```

## 15. Cross-Module Integration
- References `customerId` from `@ananya/crm` / `@ananya/sales`.
- References `salesOrderId` from `@ananya/sales` (read-only reference).
- References `projectId` from `@ananya/projects` (read-only reference).
- References `componentId` / `serialNumber` from `@ananya/inventory` (read-only references).

## 16. Database Schema
- Table `service_requests`: `id`, `service_number`, `customer_id`, `sales_order_id`, `project_id`, `component_id`, `serial_number`, `title`, `description`, `priority`, `category`, `status`, `assigned_technician`, `diagnostic_notes`, `created_at`, `updated_at`.

## 17. API Design
- `POST /service-requests`
- `GET /service-requests`
- `GET /service-requests/:id`
- `POST /service-requests/:id/assign`
- `POST /service-requests/:id/diagnose`
- `POST /service-requests/:id/complete`
- `POST /service-requests/:id/close`
- `POST /service-requests/:id/cancel`

## 18. UI Workflow
- `/service`: List service requests with status pills and filter controls.
- `/service/[id]`: Detail workspace with status transition actions and diagnostic logs.

## 19. Validation Rules
- DTO validation via `class-validator` (`IsNotEmpty`, `IsString`, `IsEnum`, `IsOptional`).

## 20. Future Extensions
- Automated SLA escalation triggers and customer notification webhooks.

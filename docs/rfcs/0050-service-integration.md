# RFC-0050: Service Integration

- **Status**: Accepted
- **Author**: Ananya ERP Core Team
- **Created**: 2026-07-26

## 1. Purpose
Define the integration boundaries, dependency rules, and architectural contracts between the Service Management bounded context and other Ananya ERP modules (CRM, Sales, Projects, Inventory, Warehouse, Finance).

## 2. Scope
Specifies reference linking, anti-corruption layers, read-only references, and domain boundary enforcement.

## 3. Ubiquitous Language
- **Service Handoff**: Operational transition after customer delivery where post-sales service, warranty support, or repairs are initiated.
- **Read-Only Context Reference**: An immutable reference identifier (e.g. `customerId`, `salesOrderId`) belonging to an external bounded context.

## 4. Aggregate Roots
- Cross-module coordination involves `ServiceRequest`, `WorkOrder`, `WarrantyClaim`, `RmaRequest`, and `MaintenanceSchedule`.

## 5. Entities
- `ServiceNote`: Communication note attached to service requests, work orders, or warranty claims.

## 6. Value Objects
- Context reference IDs (`customerId`, `salesOrderId`, `projectId`, `componentId`, `shipmentId`).

## 7. Commands
- `AddServiceNoteCommand`: Attaches a note to a Service entity.

## 8. Queries
- `ListServiceNotesQuery`: Retrieves notes for a specific target entity.

## 9. Domain Services
- None.

## 10. Application Services
- `ServiceNotesService`: Manages service logs and technical collaboration notes.

## 11. Repository Contracts
- `ServiceNoteRepository`: `findById()`, `findMany()`, `save()`.

## 12. Domain Invariants
- Service MUST NOT directly mutate Customer, Sales Order, Project, Inventory, Warehouse, or Finance data.
- All cross-context references are stored as primitive UUID strings.
- Inventory receipts for RMAs or replacements must occur through established Warehouse / Customer Returns domain channels.

## 13. State Machine
```text
CRM Prospect ──► Sales Order ──► Warehouse Shipment ──► Delivery
                                                          │
                                                          ▼
                                                  Service Request
                                                          │
                                                  ├───────┼───────┐
                                                  ▼       ▼       ▼
                                             Work Order Warranty RMA
```

## 14. Sequence Diagrams
```text
Customer -> ServiceRequestsService: create(dto)
ServiceRequestsService -> CustomersService: findOne(customerId) [Validation Only]
ServiceRequestsService -> ServiceRequest: create()
ServiceRequest -> ServiceRequestRepository: save()
```

## 15. Cross-Module Integration
- **Sales & CRM**: References `customerId` and `salesOrderId`. Reads customer details for contact.
- **Projects**: References `projectId` for project-specific field deployments.
- **Inventory & Warehouse**: References `componentId`, `serialNumber`, and shipment IDs.
- **Finance**: Read-only reference; service does not record general ledger postings directly.

## 16. Database Schema
- Table `service_notes`: `id`, `service_request_id`, `work_order_id`, `warranty_claim_id`, `author`, `body`, `created_at`.

## 17. API Design
- `POST /service-notes`, `GET /service-notes`

## 18. UI Workflow
- Integrated notes timeline present across Service Request and Work Order details.

## 19. Validation Rules
- DTO validation via `class-validator`.

## 20. Future Extensions
- Enterprise Service Bus (ESB) event streaming for real-time customer portal updates.

# RFC-0028: Order Fulfillment Requests

## 1. Purpose
Define the domain model, persistence schema, API endpoints, and UI workflows for Order Fulfillment Requests. Fulfillment Requests bridge the Sales bounded context with Warehouse operations, translating commercial order releases into physical pick, pack, and dispatch tasks.

## 2. Scope
- Fulfillment Request Creation (`Pending`)
- Warehouse Acceptance & Picking Assignment
- Packing & Weight Verification
- Shipping & Hand-off to Carrier
- Sales Order Fulfillment Line Tracking

## 3. Ubiquitous Language
- **Fulfillment Request**: A formal instruction from Sales to Warehouse to pick, pack, and ship line items for a Sales Order.
- **Picking Request**: Warehouse task to gather items from storage bins.

## 4. Aggregate Roots
- `FulfillmentRequest` (`packages/sales/src/fulfillment/fulfillment-request.ts`)

## 5. Entities
- `FulfillmentRequestLine` (`id`, `salesOrderLineId`, `componentId`, `requestedQuantity`, `fulfilledQuantity`)

## 6. Value Objects
- `FulfillmentStatus` (`PENDING`, `ACCEPTED`, `PICKING`, `PACKED`, `SHIPPED`, `COMPLETED`, `CANCELLED`)

## 7. Commands
- `CreateFulfillmentRequestCommand`
- `AcceptFulfillmentRequestCommand`
- `StartPickingCommand`
- `PackFulfillmentRequestCommand`
- `ShipFulfillmentRequestCommand`
- `CompleteFulfillmentRequestCommand`

## 8. Queries
- `GetFulfillmentRequestByIdQuery`
- `ListFulfillmentRequestsQuery`

## 9. Domain Services
- `FulfillmentValidationService`: Ensures requested quantities do not exceed unfulfilled Sales Order line balances.

## 10. Application Services
- `FulfillmentRequestsService` (`apps/api/src/fulfillment/fulfillment-requests.service.ts`)

## 11. Repository Contracts
- `FulfillmentRequestRepository`

## 12. Domain Invariants
- Fulfillment Request must reference a `RELEASED` or `APPROVED` Sales Order.
- Requested quantities cannot exceed remaining unfulfilled order line quantities.
- Completion of fulfillment request triggers Sales Order line fulfillment status update.

## 13. State Machines
```
[PENDING] ──(accept)──> [ACCEPTED] ──(pick)──> [PICKING] ──(pack)──> [PACKED] ──(ship)──> [SHIPPED] ──(complete)──> [COMPLETED]
```

## 14. Sequence Diagrams
```
SalesOrdersService -> FulfillmentRequestsService: create(salesOrderId)
FulfillmentRequestsService -> FulfillmentRequest: FulfillmentRequest.create(props)
WarehouseOperator -> FulfillmentRequestsController: POST /fulfillment/:id/complete
FulfillmentRequestsService -> InventoryTransactionsService: execute stock deduction
FulfillmentRequestsService -> SalesOrdersService: updateLineFulfillment()
```

## 15. Warehouse Integration
Warehouse accepts fulfillment requests and performs picking/packing in addressable bins. On completion, Warehouse calls `InventoryTransactionsService.create({ transactionType: 'Issue' })` to record physical stock movement.

## 16. Database Schema
- Tables `fulfillment_requests`, `fulfillment_request_lines`.

## 17. API Design
- `POST /fulfillment-requests`
- `GET /fulfillment-requests`
- `POST /fulfillment-requests/:id/accept`
- `POST /fulfillment-requests/:id/pick`
- `POST /fulfillment-requests/:id/pack`
- `POST /fulfillment-requests/:id/ship`
- `POST /fulfillment-requests/:id/complete`

## 18. UI Workflow
- `/fulfillment`: Warehouse & Sales dispatch dashboard displaying pending, picking, packed, and shipped requests.

## 19. Validation Rules
- Valid Sales Order ID and line item references required.

## 20. Future Extensions
- Carrier API integrations for real-time waybill and tracking generation.

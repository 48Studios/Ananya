# RFC-0029: Shipping & Delivery

## 1. Purpose

Define the domain model, persistence schema, API endpoints, and UI workflows for Shipping and Delivery tracking. Manages carrier assignments, tracking numbers, dispatch dates, proof of delivery, and order status sync.

## 2. Scope

- Shipment Dispatch
- Carrier Information (Carrier Name, Tracking Number, Waybill ID)
- Proof of Delivery (POD) Confirmation
- Delivery Status Synchronization

## 3. Ubiquitous Language

- **Shipment**: The dispatch package associated with a fulfilled order.
- **Tracking Number**: Unique carrier tracking code provided to the customer.
- **Proof of Delivery (POD)**: Confirmation of receipt by customer at destination address.

## 4. Aggregate Roots

- `FulfillmentRequest` (Shipment state within fulfillment lifecycle)

## 5. Entities

- Shipment metadata within `FulfillmentRequest` (`carrierName`, `trackingNumber`, `shippedAt`, `deliveredAt`)

## 6. Value Objects

- `ShipmentStatus` (`PREPARING`, `DISPATCHED`, `IN_TRANSIT`, `DELIVERED`)

## 7. Commands

- `DispatchShipmentCommand`
- `ConfirmDeliveryCommand`

## 8. Queries

- `GetShipmentTrackingQuery`

## 9. Domain Services

- `DeliveryConfirmationService`: Updates Fulfillment Request status to `COMPLETED` upon POD confirmation.

## 10. Application Services

- `FulfillmentRequestsService` (`apps/api/src/fulfillment/fulfillment-requests.service.ts`)

## 11. Repository Contracts

- Integrated into `FulfillmentRequestRepository`.

## 12. Domain Invariants

- Tracking number must be provided when dispatching a shipment.
- Delivery confirmation requires a valid shipped package.

## 13. State Machines

```
[PREPARING] ──(dispatch)──> [DISPATCHED] ──(in-transit)──> [IN_TRANSIT] ──(deliver)──> [DELIVERED]
```

## 14. Sequence Diagrams

```
Operator -> FulfillmentRequestsController: POST /fulfillment/:id/ship { carrierName, trackingNumber }
FulfillmentRequestsController -> FulfillmentRequestsService: ship(id, dto)
FulfillmentRequestsService -> FulfillmentRequest: request.ship(dto)
```

## 15. Warehouse Integration

Warehouse packages items and inputs carrier tracking info before triggering dispatch.

## 16. Database Schema

- Columns on `fulfillment_requests` (`carrier_name`, `tracking_number`, `shipped_at`, `delivered_at`).

## 17. API Design

- `POST /fulfillment-requests/:id/ship`
- `POST /fulfillment-requests/:id/deliver`

## 18. UI Workflow

- Integrated into `/fulfillment` operational route.

## 19. Validation Rules

- Non-empty carrier name and tracking string required on dispatch.

## 20. Future Extensions

- Automated webhook integrations with FedEx, DHL, and UPS.

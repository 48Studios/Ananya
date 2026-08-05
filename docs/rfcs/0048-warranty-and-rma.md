# RFC-0048: Warranty & RMA

- **Status**: Accepted
- **Author**: Ananya ERP Core Team
- **Created**: 2026-07-26

## 1. Purpose

Define the architectural design, ubiquitous language, state machines, and domain boundaries for Warranty Claims and Return Merchandise Authorizations (RMAs) within the Service Management bounded context of Ananya ERP.

## 2. Scope

Covers warranty entitlement evaluation, claim adjudication, RMA authorization, return item receipt, inspection, and disposition decisioning.

## 3. Ubiquitous Language

- **Warranty Claim**: A formal entitlement claim submitted by a customer for repair or replacement of a covered product.
- **RMA (Return Merchandise Authorization)**: An authorized return request allowing a customer to ship defective or faulty items back for inspection and service.
- **Disposition**: The technical decision regarding a returned item (`REPAIR`, `REPLACE`, `SCRAP`, `RETURN`).

## 4. Aggregate Roots

- `WarrantyClaim`: Aggregate root tracking claim number, product, customer reference, purchase/expiry dates, decision status, and coverage terms.
- `RmaRequest`: Aggregate root tracking RMA number, customer reference, returned item details, reason, return status, and disposition.

## 5. Entities

- None.

## 6. Value Objects

- `WarrantyDecision`: `'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED'`
- `RmaStatus`: `'REQUESTED' | 'APPROVED' | 'RECEIVED' | 'INSPECTED' | 'PROCESSED' | 'CLOSED' | 'REJECTED'`
- `RmaDisposition`: `'REPAIR' | 'REPLACE' | 'SCRAP' | 'RETURN'`

## 7. Commands

- `SubmitWarrantyClaimCommand`: Initializes a new Warranty Claim.
- `ApproveWarrantyClaimCommand`: Transitions claim decision to `APPROVED`.
- `RejectWarrantyClaimCommand`: Transitions claim decision to `REJECTED`.
- `CreateRmaRequestCommand`: Initializes a new RMA in status `REQUESTED`.
- `ApproveRmaRequestCommand`: Transitions status to `APPROVED`.
- `ReceiveRmaItemCommand`: Transitions status to `RECEIVED`.
- `InspectRmaItemCommand`: Sets disposition (`REPAIR`, `REPLACE`, `SCRAP`, `RETURN`) and transitions status to `INSPECTED`.
- `CloseRmaRequestCommand`: Transitions status to `CLOSED`.

## 8. Queries

- `FindWarrantyClaimByIdQuery`, `ListWarrantyClaimsQuery`
- `FindRmaRequestByIdQuery`, `ListRmaRequestsQuery`

## 9. Domain Services

- None.

## 10. Application Services

- `WarrantyClaimsService`: Manages warranty claims and entitlement evaluations.
- `RmaRequestsService`: Manages RMA lifecycle, receipt, inspection, and disposition.

## 11. Repository Contracts

- `WarrantyClaimRepository`: `findById()`, `findByNumber()`, `findMany()`, `save()`, `generateNextWarrantyNumber()`.
- `RmaRequestRepository`: `findById()`, `findByNumber()`, `findMany()`, `save()`, `generateNextRmaNumber()`.

## 12. Domain Invariants

- Expiry date must be after purchase date for warranty claims.
- RMA disposition can only be set after item status reaches `RECEIVED` or `INSPECTED`.
- Warranty approval cannot modify Inventory or Finance directly; it authorizes downstream operational service.

## 13. State Machine

```text
Warranty Claim:
[ SUBMITTED ] ──> [ UNDER_REVIEW ] ──> (Approve) ──> [ APPROVED ]
                        │
                        ├──> (Reject) ──> [ REJECTED ]
                        │
                        └──> (Expire) ──> [ EXPIRED ]

RMA Request:
[ REQUESTED ] ──> [ APPROVED ] ──> [ RECEIVED ] ──> [ INSPECTED ] ──> [ PROCESSED ] ──> [ CLOSED ]
      │
      └──> (Reject) ──> [ REJECTED ]
```

## 14. Sequence Diagrams

```text
Customer -> RmaRequestsService: create(dto)
RmaRequestsService -> RmaRequest: create(props)
RmaRequestsService -> RmaRequestRepository: save(rma)
WarehouseTech -> RmaRequestsService: inspect(id, disposition)
RmaRequestsService -> RmaRequest: setDisposition(disposition)
```

## 15. Cross-Module Integration

- References `customerId` and `salesOrderId` as read-only identifiers.
- Customer returns or inventory receipts are executed through `@ananya/sales` / `@ananya/warehouse` interfaces, maintaining bounded context isolation.

## 16. Database Schema

- Table `warranty_claims`: `id`, `warranty_number`, `customer_id`, `product_id`, `serial_number`, `purchase_date`, `expiry_date`, `claim_reason`, `decision`, `decision_notes`, `created_at`, `updated_at`.
- Table `rma_requests`: `id`, `rma_number`, `customer_id`, `sales_order_id`, `item_description`, `serial_number`, `reason`, `status`, `disposition`, `inspection_notes`, `created_at`, `updated_at`.

## 17. API Design

- `POST /warranty-claims`, `GET /warranty-claims`, `GET /warranty-claims/:id`, `POST /warranty-claims/:id/approve`, `POST /warranty-claims/:id/reject`
- `POST /rma-requests`, `GET /rma-requests`, `GET /rma-requests/:id`, `POST /rma-requests/:id/approve`, `POST /rma-requests/:id/receive`, `POST /rma-requests/:id/inspect`, `POST /rma-requests/:id/close`

## 18. UI Workflow

- `/warranty`: Claims review list with entitlement details and approval controls.
- `/rma`: RMA requests tracking dashboard with inspection and disposition forms.

## 19. Validation Rules

- DTO validation via `class-validator`.

## 20. Future Extensions

- Automated vendor warranty claim back-to-back recovery workflows.

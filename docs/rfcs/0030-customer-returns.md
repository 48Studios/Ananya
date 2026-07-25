# RFC-0030: Customer Returns

## 1. Purpose
Define the domain model, persistence schema, API endpoints, and UI workflows for Customer Returns (RMA - Return Merchandise Authorization). Handles commercial return requests, inspection workflows, restocking approval, or rejection.

## 2. Scope
- Customer Return Authorization (`CustomerReturn`)
- Return Lines (Component, Return Quantity, Return Reason)
- Warehouse Receiving & Inspection Workflow
- Restocking vs Rejection Decisioning
- Credit/Refund Triggering

## 3. Ubiquitous Language
- **Customer Return (RMA)**: Formal document authorizing a customer to return delivered items.
- **Return Reason**: Commercial justification (`DEFECTIVE`, `WRONG_ITEM`, `DAMAGED_IN_TRANSIT`, `EXCESS_ORDER`).
- **Restock**: Returning inspected items into active warehouse inventory.

## 4. Aggregate Roots
- `CustomerReturn` (`packages/sales/src/returns/customer-return.ts`)

## 5. Entities
- `CustomerReturnLine` (`id`, `salesOrderLineId`, `componentId`, `quantity`, `reason`, `disposition`)

## 6. Value Objects
- `ReturnStatus` (`DRAFT`, `APPROVED`, `RECEIVED`, `INSPECTED`, `RESTOCKED`, `REJECTED`, `CLOSED`)
- `ReturnReason` (`DEFECTIVE`, `WRONG_ITEM`, `DAMAGED_IN_TRANSIT`, `EXCESS_ORDER`)
- `ReturnDisposition` (`RESTOCK`, `SCRAP`, `VENDOR_RETURN`)

## 7. Commands
- `CreateCustomerReturnCommand`, `ApproveCustomerReturnCommand`, `ReceiveCustomerReturnCommand`, `InspectCustomerReturnCommand`, `RestockCustomerReturnCommand`, `RejectCustomerReturnCommand`, `CloseCustomerReturnCommand`

## 8. Queries
- `GetCustomerReturnByIdQuery`, `ListCustomerReturnsQuery`

## 9. Domain Services
- `ReturnQuantityGuard`: Ensures returned line quantities do not exceed original shipped quantities on the Sales Order.

## 10. Application Services
- `CustomerReturnsService` (`apps/api/src/customer-returns/customer-returns.service.ts`)

## 11. Repository Contracts
- `CustomerReturnRepository`

## 12. Domain Invariants
- Customer Return must reference a valid Sales Order.
- Returned line item quantities cannot exceed previously shipped quantities for that Sales Order.
- Sales never updates inventory directly; approved restocking triggers Warehouse receiving requests, which issue Inventory Adjustment transactions.

## 13. State Machines
```
[DRAFT] ──(approve)──> [APPROVED] ──(receive)──> [RECEIVED] ──(inspect)──> [INSPECTED]
                                                                                │
                                                                   ┌────────────┴────────────┐
                                                                   ▼                         ▼
                                                              [RESTOCKED]               [REJECTED]
                                                                   │                         │
                                                                   └────────────┬────────────┘
                                                                                ▼
                                                                             [CLOSED]
```

## 14. Sequence Diagrams
```
User -> CustomerReturnsController: POST /customer-returns/:id/restock
CustomerReturnsController -> CustomerReturnsService: restock(id)
CustomerReturnsService -> InventoryTransactionsService: create({ transactionType: 'Adjustment', quantity: +qty })
CustomerReturnsService -> CustomerReturn: returnObj.restock()
```

## 15. Warehouse Integration
Warehouse receives returned shipments, performs quality inspection, and assigns inventory bin location upon restocking approval.

## 16. Database Schema
- Tables `customer_returns`, `customer_return_lines`.

## 17. API Design
- `POST /customer-returns`
- `GET /customer-returns`
- `GET /customer-returns/:id`
- `POST /customer-returns/:id/approve`
- `POST /customer-returns/:id/receive`
- `POST /customer-returns/:id/inspect`
- `POST /customer-returns/:id/restock`
- `POST /customer-returns/:id/reject`
- `POST /customer-returns/:id/close`

## 18. UI Workflow
- `/customer-returns` & `/customer-returns/[id]`: Return request creation, inspection log, and restocking disposition control.

## 19. Validation Rules
- Valid Sales Order ID, component ID, positive quantity, and valid reason required.

## 20. Future Extensions
- Automated credit memo generation in Accounting bounded context.

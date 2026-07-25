# RFC-0027: Quotations & Sales Orders

## 1. Purpose
Define the domain model, persistence schema, API endpoints, and UI workflows for Quotations and Sales Orders. Commercial documents establish legally binding price terms, promised delivery dates, and line item requirements.

## 2. Scope
- Quotations (Quote Number, Customer, Pricing, Validity, Lines)
- Sales Orders (Order Number, Customer, Order Date, Required Date, Line Items)
- Quotation to Sales Order Conversion
- Sales Order Approval & Release Workflow

## 3. Ubiquitous Language
- **Quotation**: A commercial proposal issued to a customer specifying pricing and terms.
- **Sales Order**: An accepted commercial contract ordering components/products.
- **Line Item**: An individual item row containing component ID, quantity, price, and discount.

## 4. Aggregate Roots
- `Quotation` (`packages/sales/src/quotations/quotation.ts`)
- `SalesOrder` (`packages/sales/src/sales-orders/sales-order.ts`)

## 5. Entities
- `QuotationLine` (`id`, `componentId`, `quantity`, `unitPrice`, `discount`, `totalPrice`)
- `SalesOrderLine` (`id`, `componentId`, `quantity`, `unitPrice`, `discount`, `fulfilledQuantity`, `reservedQuantity`)

## 6. Value Objects
- `QuotationStatus` (`DRAFT`, `SENT`, `ACCEPTED`, `EXPIRED`, `CANCELLED`)
- `SalesOrderStatus` (`DRAFT`, `APPROVED`, `RELEASED`, `ALLOCATED`, `PARTIALLY_FULFILLED`, `COMPLETED`, `CANCELLED`)

## 7. Commands
- `CreateQuotationCommand`, `AddQuotationLineCommand`, `SendQuotationCommand`, `AcceptQuotationCommand`
- `CreateSalesOrderCommand`, `AddSalesOrderLineCommand`, `ApproveSalesOrderCommand`, `ReleaseSalesOrderCommand`

## 8. Queries
- `GetQuotationByIdQuery`, `ListQuotationsQuery`
- `GetSalesOrderByIdQuery`, `ListSalesOrdersQuery`

## 9. Domain Services
- `QuotationConversionService`: Converts an `ACCEPTED` Quotation into a new `SalesOrder`.

## 10. Application Services
- `QuotationsService` (`apps/api/src/quotations/quotations.service.ts`)
- `SalesOrdersService` (`apps/api/src/sales-orders/sales-orders.service.ts`)

## 11. Repository Contracts
- `QuotationRepository`, `SalesOrderRepository`

## 12. Domain Invariants
- Customer must be `ACTIVE` to create quotations or sales orders.
- Accepted quotations are immutable.
- Only accepted quotations can be converted to sales orders.
- Sales Orders never issue inventory directly.

## 13. State Machines
```
Quotation:
[DRAFT] ──(send)──> [SENT] ──(accept)──> [ACCEPTED] ──(convert)──> Sales Order
                       │
                   (expire/cancel)
                       ▼
               [EXPIRED / CANCELLED]

Sales Order:
[DRAFT] ──(approve)──> [APPROVED] ──(release)──> [RELEASED] ──(fulfill)──> [COMPLETED]
```

## 14. Sequence Diagrams
```
User -> SalesOrdersController: POST /sales-orders/:id/approve
SalesOrdersController -> SalesOrdersService: approve(id)
SalesOrdersService -> SalesOrderAggregate: order.approve()
SalesOrdersService -> SalesOrderRepository: save(order)
```

## 15. Warehouse Integration
When a Sales Order is `RELEASED`, the Application Service notifies Warehouse by creating a `FulfillmentRequest`.

## 16. Database Schema
- Tables `quotations`, `quotation_lines`, `sales_orders`, `sales_order_lines`.

## 17. API Design
- Quotations: `POST /quotations`, `GET /quotations`, `POST /quotations/:id/accept`, `POST /quotations/:id/convert`
- Sales Orders: `POST /sales-orders`, `GET /sales-orders`, `POST /sales-orders/:id/approve`, `POST /sales-orders/:id/release`

## 18. UI Workflow
- `/quotations` & `/quotations/[id]`: Manage quotes, add lines, convert to orders.
- `/sales-orders` & `/sales-orders/[id]`: Order progress dashboard, line items, release for fulfillment.

## 19. Validation Rules
- Component ID and positive quantity required for lines.
- Unit price must be non-negative.

## 20. Future Extensions
- Automated price tier matrices and volume discounts.

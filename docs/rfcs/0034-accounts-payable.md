# RFC-0034: Accounts Payable

## 1. Purpose
Define vendor bill processing, payable invoices originating from Procurement Purchase Invoices, supplier payment schedules, and supplier aging within Ananya ERP.

## 2. Scope
Covers payable invoice creation, posting, supplier payment application, balance tracking, and supplier aging analysis.

## 3. Ubiquitous Language
- **Payable Invoice**: Financial liability document for supplier purchases.
- **Supplier Aging**: Categorization of unpaid vendor liabilities into 0-30, 31-60, 61-90, 90+ day buckets.

## 4. Aggregate Roots
- `PayableInvoice`: Master document tracking supplier payable balance and approval status.

## 5. Entities
- `PayableLine`: Itemized purchase expense line.

## 6. Value Objects
- `PayableStatus`: Enum (`DRAFT`, `POSTED`, `PARTIALLY_PAID`, `PAID`, `CANCELLED`).

## 7. Commands
- `CreatePayableInvoice`
- `PostPayableInvoice`
- `ApplySupplierPayment`

## 8. Queries
- `GetPayableInvoiceById`
- `FindPayableInvoices`
- `GetSupplierAgingReport`

## 9. Domain Services
- `PayableBalanceCalculator`: Tracks outstanding supplier liabilities and due dates.

## 10. Application Services
- `PayableInvoicesService`: Coordinates vendor bill recording and payment settlements.

## 11. Repository Contracts
- `PayableInvoiceRepository`: Methods `findById`, `findByNumber`, `findMany`, `save`.

## 12. Domain Invariants
- Payables originate from Procurement Purchase Invoices.
- Total payments applied cannot exceed total payable invoice balance.

## 13. State Machines
`DRAFT` → `POSTED` → `PARTIALLY_PAID` → `PAID` / `CANCELLED`.

## 14. Sequence Diagrams
Procurement Module → PayablesService → PayableInvoice Aggregate → PayableInvoiceRepository.

## 15. Cross-Module Integration
- Integrates with Procurement (Purchase Invoices) and posts expense/liability journal entries to General Ledger.

## 16. Database Schema
Tables `payable_invoices` and `payable_payments`.

## 17. API Design
- `POST /payable-invoices`
- `GET /payable-invoices`
- `GET /payable-invoices/:id`
- `POST /payable-invoices/:id/post`

## 18. UI Workflow
Page at `/accounts-payable` with vendor bill roster, supplier aging metrics, and payment allocation controls.

## 19. Validation Rules
- Supplier ID and Purchase Invoice reference required.
- Due date must be valid timestamp.

## 20. Future Extensions
Automated 3-way matching rules (PO vs GR vs Invoice) and early payment discount calculations.

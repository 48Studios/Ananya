# RFC-0033: Accounts Receivable

## 1. Purpose
Define customer billing, receivable invoices originating from Sales Orders, payment tracking, and customer aging within Ananya ERP.

## 2. Scope
Covers receivable invoice creation, posting, customer payment application, balance tracking, and customer aging analysis.

## 3. Ubiquitous Language
- **Receivable Invoice**: Commercial demand for payment issued to customer for goods/services.
- **Customer Aging**: Classification of open receivables into 0-30, 31-60, 61-90, 90+ day buckets.

## 4. Aggregate Roots
- `ReceivableInvoice`: Master document tracking customer invoice balance and payment status.

## 5. Entities
- `ReceivableLine`: Itemized billing line.

## 6. Value Objects
- `InvoiceStatus`: Enum (`DRAFT`, `POSTED`, `PARTIALLY_PAID`, `PAID`, `CANCELLED`).

## 7. Commands
- `CreateReceivableInvoice`
- `PostReceivableInvoice`
- `ApplyCustomerPayment`

## 8. Queries
- `GetReceivableInvoiceById`
- `FindReceivableInvoices`
- `GetCustomerAgingReport`

## 9. Domain Services
- `ReceivableBalanceCalculator`: Calculates open invoice balance and aging days.

## 10. Application Services
- `ReceivableInvoicesService`: Manages customer invoice creation, posting, and payment application.

## 11. Repository Contracts
- `ReceivableInvoiceRepository`: Methods `findById`, `findByNumber`, `findMany`, `save`.

## 12. Domain Invariants
- Receivables originate from commercial Sales Orders.
- Payments applied cannot exceed total invoice balance.

## 13. State Machines
`DRAFT` → `POSTED` → `PARTIALLY_PAID` → `PAID` / `CANCELLED`.

## 14. Sequence Diagrams
Sales Module → ReceivablesService → ReceivableInvoice Aggregate → ReceivableInvoiceRepository.

## 15. Cross-Module Integration
- Receives commercial order data from Sales module; posts revenue/receivable journal entries to General Ledger.

## 16. Database Schema
Tables `receivable_invoices` and `receivable_payments`.

## 17. API Design
- `POST /receivable-invoices`
- `GET /receivable-invoices`
- `GET /receivable-invoices/:id`
- `POST /receivable-invoices/:id/post`

## 18. UI Workflow
Page at `/accounts-receivable` with invoice roster, customer aging summary, and payment application forms.

## 19. Validation Rules
- Customer ID and Sales Order reference required.
- Total invoice amount must be greater than zero.

## 20. Future Extensions
Automated dunning letters and customer credit limit enforcement.

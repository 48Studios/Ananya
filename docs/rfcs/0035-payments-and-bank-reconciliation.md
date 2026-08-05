# RFC-0035: Payments & Bank Reconciliation

## 1. Purpose

Define financial cash movements, payment processing (Customer Payment, Supplier Payment, Internal Transfer, Refund), bank accounts, and statement bank reconciliation within Ananya ERP.

## 2. Scope

Covers payment recording, payment types, bank account balances, bank statement import, transaction matching, adjustments, and reconciliation completion.

## 3. Ubiquitous Language

- **Payment**: Financial transaction recording cash inflow, outflow, transfer, or refund.
- **Bank Reconciliation**: Matching process between bank statement transactions and internal payment ledger.
- **Matched Transaction**: Bank statement transaction paired with internal payment record.

## 4. Aggregate Roots

- `Payment`: Cash transaction aggregate root.
- `BankReconciliation`: Bank statement reconciliation session aggregate root.

## 5. Entities

- `BankTransaction`: Individual statement line imported from bank statement.

## 6. Value Objects

- `PaymentType`: Enum (`CUSTOMER_PAYMENT`, `SUPPLIER_PAYMENT`, `INTERNAL_TRANSFER`, `REFUND`).
- `PaymentMethod`: Enum (`WIRE_TRANSFER`, `CHECK`, `CREDIT_CARD`, `CASH`, `ACH`).
- `PaymentStatus`: Enum (`DRAFT`, `POSTED`, `RECONCILED`, `CANCELLED`).
- `ReconciliationStatus`: Enum (`IN_PROGRESS`, `COMPLETED`, `CANCELLED`).

## 7. Commands

- `CreatePayment`
- `PostPayment`
- `StartBankReconciliation`
- `MatchBankTransaction`
- `CompleteBankReconciliation`

## 8. Queries

- `GetPaymentById`
- `FindPayments`
- `GetBankReconciliation`

## 9. Domain Services

- `BankReconciliationMatcher`: Automatically matches statement transactions against posted payments by date and amount.

## 10. Application Services

- `PaymentsService`: Manages payment transactions and balance updates.
- `BankReconciliationsService`: Coordinates bank statement matching and reconciliation completion.

## 11. Repository Contracts

- `PaymentRepository`: Methods `findById`, `findByNumber`, `findMany`, `save`.
- `BankReconciliationRepository`: Methods `findById`, `findByBankAccount`, `findMany`, `save`.

## 12. Domain Invariants

- Payments must update Accounts Receivable or Accounts Payable balance upon posting.
- Completed bank reconciliations cannot be modified.
- Reconciliations cannot alter already posted General Ledger journal entries.

## 13. State Machines

Payment: `DRAFT` → `POSTED` → `RECONCILED` / `CANCELLED`.
BankReconciliation: `IN_PROGRESS` → `COMPLETED` / `CANCELLED`.

## 14. Sequence Diagrams

User → PaymentsController → PaymentsService → Payment Aggregate → PaymentRepository.

## 15. Cross-Module Integration

- Receives invoice details from Sales (Receivables) and Procurement (Payables); generates posted journal entries in General Ledger.

## 16. Database Schema

Tables `payments`, `bank_accounts`, `bank_reconciliations`, `bank_transactions`.

## 17. API Design

- `POST /payments`
- `GET /payments`
- `GET /payments/:id/post`
- `POST /bank-reconciliations`
- `POST /bank-reconciliations/:id/match`
- `POST /bank-reconciliations/:id/complete`

## 18. UI Workflow

Pages at `/payments`, `/bank-accounts`, and `/bank-reconciliation` with transaction rosters, matching drawer, and completion action.

## 19. Validation Rules

- Payment amount must be greater than zero.
- Bank account must be active.

## 20. Future Extensions

OFX/MT940 automated bank feed imports and AI-assisted fuzzy transaction matching.

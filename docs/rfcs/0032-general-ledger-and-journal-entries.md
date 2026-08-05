# RFC-0032: General Ledger & Journal Entries

## 1. Purpose

Define double-entry bookkeeping, journal entry lifecycle, debit/credit balance invariants, and general ledger posting within Ananya ERP.

## 2. Scope

Covers manual and automated journal creation, line items, double-entry balancing rules, posting to general ledger, reversing, and voiding.

## 3. Ubiquitous Language

- **Journal Entry**: Double-entry financial record containing balanced debits and credits.
- **Journal Entry Line**: Individual line specifying account, debit amount, or credit amount.
- **General Ledger**: Cumulative system of record for all posted financial transactions.

## 4. Aggregate Roots

- `JournalEntry`: Master journal document controlling financial balance and posting lifecycle.

## 5. Entities

- `JournalEntryLine`: Line item mapping account, debit, credit.

## 6. Value Objects

- `JournalStatus`: Enum (`DRAFT`, `POSTED`, `REVERSED`, `VOID`).
- `Money`: Financial currency amount.

## 7. Commands

- `CreateJournalEntry`
- `AddJournalLine`
- `PostJournalEntry`
- `ReverseJournalEntry`

## 8. Queries

- `GetJournalEntryById`
- `FindJournalEntries`
- `GetGeneralLedger`

## 9. Domain Services

- `DoubleEntryBalanceChecker`: Verifies `Sum(Debits) == Sum(Credits)`.

## 10. Application Services

- `JournalEntriesService`: Manages journal entries and ledger posting.

## 11. Repository Contracts

- `JournalEntryRepository`: Methods `findById`, `findByNumber`, `findMany`, `save`.

## 12. Domain Invariants

- Total Debits MUST equal Total Credits before a journal entry can be posted.
- Posted journal entries are strictly immutable.
- Adjustments to posted entries require creating a reversing journal entry.

## 13. State Machines

`DRAFT` → `POSTED` → `REVERSED` / `VOID`.

## 14. Sequence Diagrams

User/Module → JournalEntriesController → JournalEntriesService → JournalEntry Aggregate → JournalEntryRepository.

## 15. Cross-Module Integration

- Integrates with Sales (Receivables), Procurement (Payables), Payments, and Inventory Valuation.

## 16. Database Schema

Tables `journal_entries` and `journal_entry_lines`.

## 17. API Design

- `POST /journal-entries`
- `GET /journal-entries`
- `GET /journal-entries/:id`
- `POST /journal-entries/:id/lines`
- `POST /journal-entries/:id/post`
- `POST /journal-entries/:id/reverse`

## 18. UI Workflow

Page at `/journal-entries` with creation form, auto-calculating debit/credit balance indicator, and posting action.

## 19. Validation Rules

- Debit and credit values must be non-negative.
- Sum of debits minus sum of credits must equal 0.0000.

## 20. Future Extensions

Automated recurring journal entries and fiscal period closing procedures.

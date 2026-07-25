# RFC-0031: Chart of Accounts

## 1. Purpose
Define the Chart of Accounts structure, hierarchy, account classification, and rules governing active accounts for financial recordkeeping within Ananya ERP.

## 2. Scope
Covers account creation, hierarchy mapping (parent-child), account types (Asset, Liability, Equity, Revenue, Expense), activation/deactivation, and balance validation.

## 3. Ubiquitous Language
- **Account**: A financial bucket recording debits and credits.
- **Account Type**: Classification defining financial nature (Asset, Liability, Equity, Revenue, Expense).
- **Parent Account**: Parent node in hierarchical financial rollups.

## 4. Aggregate Roots
- `Account`: Primary entity holding account code, classification, currency, parent relation, and active status.

## 5. Entities
- `AccountNode`: Tree representation for hierarchical financial rollups.

## 6. Value Objects
- `AccountType`: Enum (`ASSET`, `LIABILITY`, `EQUITY`, `REVENUE`, `EXPENSE`).
- `AccountNumber`: Unique string identifier formatted per company convention.

## 7. Commands
- `CreateAccount`
- `UpdateAccount`
- `ActivateAccount`
- `DeactivateAccount`

## 8. Queries
- `GetAccountById`
- `GetChartOfAccounts`
- `GetAccountHierarchy`

## 9. Domain Services
- `AccountHierarchyValidator`: Enforces parent account type matching and cycle prevention.

## 10. Application Services
- `AccountsService`: Coordinates account master mutations and queries.

## 11. Repository Contracts
- `AccountRepository`: Methods `findById`, `findByNumber`, `findMany`, `save`.

## 12. Domain Invariants
- Account numbers must be unique across the chart of accounts.
- Inactive accounts cannot receive new journal entry postings.
- Parent account cannot be a child of itself (cycle prevention).

## 13. State Machines
`DRAFT` → `ACTIVE` → `INACTIVE`.

## 14. Sequence Diagrams
User → AccountsController → AccountsService → Account Aggregate → AccountRepository → PostgreSQL.

## 15. Cross-Module Integration
- Used by General Ledger, Accounts Receivable, Accounts Payable, Payments, and Inventory Valuation.

## 16. Database Schema
Table `accounts` (`id`, `account_number`, `name`, `account_type`, `parent_account_id`, `currency`, `is_active`).

## 17. API Design
- `POST /accounts`
- `GET /accounts`
- `GET /accounts/:id`
- `POST /accounts/:id/activate`
- `POST /accounts/:id/deactivate`

## 18. UI Workflow
Interactive page at `/chart-of-accounts` with tree view, account creation modal, and status toggles.

## 19. Validation Rules
- Account number required and unique.
- Name non-empty string.
- Account type must match valid `AccountType` enum.

## 20. Future Extensions
Multi-currency revaluation rules and multi-company consolidation rollups.

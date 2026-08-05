# RFC-0037: Accounts & Contacts

- **Status**: Accepted
- **Author**: Ananya ERP Core Team
- **Created**: 2026-07-25

## 1. Purpose

Define the domain model and persistence structure for pre-sales CRM Accounts and individual Contacts within the CRM context.

## 2. Scope

Covers corporate company profile management (`CrmAccount`) and individual stakeholders (`Contact`).

## 3. Ubiquitous Language

- **CRM Account**: A business organization or entity being cultivated in pre-sales.
- **Contact**: An individual person associated with a CRM Account (e.g. buyer, influencer, executive sponsor).

## 4. Aggregate Roots

- `CrmAccount`: Aggregate root representing the organization profile.

## 5. Entities

- `Contact`: Child entity owned by `CrmAccount`.

## 6. Value Objects

- `AccountStatus`: `'ACTIVE' | 'ARCHIVED'`
- `ContactRole`: `'DECISION_MAKER' | 'EVALUATOR' | 'EXECUTIVE' | 'TECHNICAL_BUYER' | 'OTHER'`

## 7. Commands

- `CreateCrmAccountCommand`: Registers a new CRM Account.
- `AddContactCommand`: Adds a contact person to a CRM Account.
- `ArchiveCrmAccountCommand`: Archives a CRM Account.

## 8. Queries

- `FindCrmAccountByIdQuery`
- `ListCrmAccountsQuery`

## 9. Domain Services

- None.

## 10. Application Services

- `CrmAccountsService`: Manages accounts and embedded contact personnel.

## 11. Repository Contracts

- `CrmAccountRepository`: `findById()`, `findMany()`, `save()`.

## 12. Domain Invariants

- Each Contact must be associated with a valid CRM Account.
- Primary contact flag per account can only be held by one contact person at a time.

## 13. State Machine

```text
[ ACTIVE ] ──> (Archive) ──> [ ARCHIVED ]
```

## 14. Sequence Diagram

```text
User ──> CrmAccountsController ──> CrmAccountsService ──> CrmAccount.addContact() ──> CrmAccountRepository.save()
```

## 15. Cross-Module Integration

Pre-sales `CrmAccount` can hand off to Sales `Customer` when commercial transactions commence.

## 16. Database Schema

- `crm_accounts` (id, company_name, industry, website, billing_address, shipping_address, is_archived, created_at, updated_at).
- `crm_contacts` (id, crm_account_id, first_name, last_name, email, phone, role, is_primary, created_at, updated_at).

## 17. API Design

- `POST /crm-accounts`
- `GET /crm-accounts`
- `GET /crm-accounts/:id`
- `POST /crm-accounts/:id/contacts`
- `POST /crm-accounts/:id/archive`

## 18. UI Workflow

- `/accounts`: CRM Account list.
- `/accounts/[id]`: Account overview, address details, and contact directory.

## 19. Validation Rules

- `companyName` is required for `CrmAccount`.
- `firstName`, `lastName`, and `email` are required for `Contact`.

## 20. Future Extensions

- Automated enrichment via third-party company database APIs (e.g. Clearbit, ZoomInfo).

# RFC-0036: Lead Management

- **Status**: Accepted
- **Author**: Ananya ERP Core Team
- **Created**: 2026-07-25

## 1. Purpose

Document the architectural design, ubiquitous language, state machine, and domain boundaries for Lead Management within the CRM bounded context of Ananya ERP.

## 2. Scope

Covers lead capture, assignment, qualification, disqualification, and conversion into CRM Accounts and Contacts.

## 3. Ubiquitous Language

- **Lead**: A prospective customer contact or organization that has expressed interest but is not yet qualified as a verified commercial account.
- **Lead Qualification**: The process of evaluating a lead's intent, authority, budget, and fit.
- **Lead Conversion**: Transitioning a qualified lead into a formal CRM Account, Contact, and optional initial Opportunity.

## 4. Aggregate Roots

- `Lead`: Aggregate root maintaining lead details, owner, source, status, and lifecycle transitions.

## 5. Entities

- None inside the Lead boundary.

## 6. Value Objects

- `LeadStatus`: `'NEW' | 'QUALIFIED' | 'DISQUALIFIED' | 'CONVERTED'`
- `LeadSource`: `'WEBSITE' | 'REFERRAL' | 'TRADE_SHOW' | 'COLD_OUTREACH' | 'INBOUND_PHONE'`

## 7. Commands

- `CreateLeadCommand`: Creates a new Lead in status `NEW`.
- `AssignLeadCommand`: Updates lead owner.
- `QualifyLeadCommand`: Transitions status to `QUALIFIED`.
- `DisqualifyLeadCommand`: Transitions status to `DISQUALIFIED` with reason.
- `ConvertLeadCommand`: Transitions status to `CONVERTED` and generates `CrmAccount` & `Contact`.

## 8. Queries

- `FindLeadByIdQuery`
- `ListLeadsQuery` (filters by status, source, owner)

## 9. Domain Services

- `LeadConversionService`: Orchestrates creation of `CrmAccount` and `Contact` upon lead conversion.

## 10. Application Services

- `LeadsService`: Application coordinator for lead actions.

## 11. Repository Contracts

- `LeadRepository`: `findById()`, `findByNumber()`, `findMany()`, `save()`, `generateNextLeadNumber()`.

## 12. Domain Invariants

- Only `QUALIFIED` leads may be converted.
- A lead cannot be re-qualified or re-converted once in status `CONVERTED` or `DISQUALIFIED`.

## 13. State Machine

```text
[ NEW ] ──> (Qualify) ──> [ QUALIFIED ] ──> (Convert) ──> [ CONVERTED ]
   │                            │
   └──> (Disqualify) ───────────┴─> [ DISQUALIFIED ]
```

## 14. Sequence Diagram

```text
User ──> LeadsController ──> LeadsService ──> Lead.qualify() ──> LeadRepository.save()
```

## 15. Cross-Module Integration

Lead conversion produces a `CrmAccount` and `Contact` in CRM.

## 16. Database Schema

Table: `crm_leads` (id, lead_number, name, company, email, phone, source, industry, owner, status, created_at, updated_at).

## 17. API Design

- `POST /leads`
- `GET /leads`
- `GET /leads/:id`
- `POST /leads/:id/qualify`
- `POST /leads/:id/disqualify`
- `POST /leads/:id/convert`

## 18. UI Workflow

- `/leads`: List of leads with status badges and filter controls.
- `/leads/[id]`: Detail view with qualification actions and conversion modal.

## 19. Validation Rules

- `name` and `company` are required.
- `email` must be valid email format if provided.

## 20. Future Extensions

- Automated lead scoring models based on web interaction analytics.

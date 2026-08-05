# RFC-0038: Opportunities & Pipeline

- **Status**: Accepted
- **Author**: Ananya ERP Core Team
- **Created**: 2026-07-25

## 1. Purpose

Define the deal pipeline, opportunity stage progression, estimated revenue calculation, and win/loss rules.

## 2. Scope

Covers Opportunity aggregate lifecycle from prospecting to won or lost.

## 3. Ubiquitous Language

- **Opportunity**: A tracked deal or potential revenue transaction with a CRM Account.
- **Pipeline Stage**: Milestone in the sales process reflecting deal probability and maturity.

## 4. Aggregate Roots

- `Opportunity`: Aggregate root managing stage, value, close date, and win probability.

## 5. Entities

- None inside Opportunity boundary.

## 6. Value Objects

- `OpportunityStage`: `'PROSPECTING' | 'QUALIFICATION' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST'`

## 7. Commands

- `CreateOpportunityCommand`: Initializes deal in stage `PROSPECTING`.
- `AdvanceOpportunityStageCommand`: Moves deal to next pipeline stage.
- `CloseOpportunityWonCommand`: Sets stage to `WON` (triggers Sales handoff).
- `CloseOpportunityLostCommand`: Sets stage to `LOST` with reason.

## 8. Queries

- `FindOpportunityByIdQuery`
- `ListOpportunitiesQuery` (filters by stage, account, owner)

## 9. Domain Services

- None.

## 10. Application Services

- `OpportunitiesService`: Manages pipeline transitions and triggers handoff upon `WON`.

## 11. Repository Contracts

- `OpportunityRepository`: `findById()`, `findByNumber()`, `findMany()`, `save()`, `generateNextOpportunityNumber()`.

## 12. Domain Invariants

- `estimatedValue` must be non-negative.
- `probability` must be between 0 and 100%.
- Closed opportunities (`WON` or `LOST`) cannot change stages.

## 13. State Machine

```text
[ PROSPECTING ] ──> [ QUALIFICATION ] ──> [ PROPOSAL ] ──> [ NEGOTIATION ] ──> [ WON ]
       │                     │                 │                  │
       └─────────────────────┴─────────────────┴──────────────────┴───────> [ LOST ]
```

## 14. Sequence Diagram

```text
User ──> OpportunitiesController ──> OpportunitiesService ──> Opportunity.closeWon() ──> SalesQuotationService.create()
```

## 15. Cross-Module Integration

When stage reaches `WON`, Opportunity triggers creation of a Sales Quotation draft in `@ananya/sales`.

## 16. Database Schema

Table: `crm_opportunities` (id, opportunity_number, lead_id, crm_account_id, name, estimated_value, expected_close_date, probability, stage, lost_reason, created_at, updated_at).

## 17. API Design

- `POST /opportunities`
- `GET /opportunities`
- `GET /opportunities/:id`
- `POST /opportunities/:id/advance`
- `POST /opportunities/:id/win`
- `POST /opportunities/:id/lose`

## 18. UI Workflow

- `/opportunities`: Drag-and-drop Kanban pipeline view & tabular list.
- `/opportunities/[id]`: Deal details, activity log, stage advancement control.

## 19. Validation Rules

- `name`, `crmAccountId`, `estimatedValue` are required.

## 20. Future Extensions

- Weighted pipeline revenue forecast reporting.

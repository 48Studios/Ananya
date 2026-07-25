# RFC-0040: CRM to Sales Integration

- **Status**: Accepted
- **Author**: Ananya ERP Core Team
- **Created**: 2026-07-25

## 1. Purpose
Define the integration boundary, data flow, and domain events connecting the CRM bounded context to the Sales bounded context (`@ananya/sales`).

## 2. Scope
Covers Opportunity Won event handling and conversion into Sales Quotations and Sales Customers.

## 3. Ubiquitous Language
- **Commercial Handoff**: The process where a pre-sales Opportunity is marked `WON` in CRM, triggering the creation of a commercial `Quotation` in Sales.
- **Customer Conversion**: Creating or linking a formal `Customer` in Sales when a `CrmAccount` enters active commercial transactions.

## 4. Aggregate Roots
- Cross-boundary interaction between `Opportunity` (`@ananya/crm`) and `Quotation` (`@ananya/sales`).

## 5. Entities
- None.

## 6. Value Objects
- None.

## 7. Commands
- `HandOffOpportunityToSalesCommand`: Triggers quotation creation in Sales context.

## 8. Queries
- `GetOpportunitySalesQuotationQuery`

## 9. Domain Services
- `CrmSalesHandoffService`: Orchestrates pre-sales to commercial sales transitions.

## 10. Application Services
- `OpportunitiesService`: Invokes `QuotationsService` upon stage transition to `WON`.

## 11. Repository Contracts
- Inter-context contracts using domain aggregate abstractions.

## 12. Domain Invariants
- CRM never directly modifies `sales_orders`, `quotation_lines`, or `customers`.
- Sales never directly modifies `crm_leads`, `crm_opportunities`, or `crm_activities`.
- Handoff occurs via application service invocation.

## 13. State Machine
```text
CRM Opportunity Stage: [ WON ] ──(Handoff)──> Sales Quotation: [ DRAFT ]
```

## 14. Sequence Diagram
```text
CRM UI ──> OpportunitiesController.win() ──> OpportunitiesService 
       ──> QuotationsService.create() ──> Sales DB (quotations)
```

## 15. Cross-Module Integration
- `@ananya/crm` depends on `@ananya/sales` interfaces via application layer orchestration.
- `QuotationsService.create()` in `apps/api/src/quotations/quotations.service.ts` creates draft commercial quotations from won opportunities.

## 16. Database Schema
No duplicate tables. CRM table `crm_opportunities` stores reference link to generated `sales_order_id` or `quotation_id` if applicable.

## 17. API Design
- `POST /opportunities/:id/win` (returns created Sales Quotation reference)

## 18. UI Workflow
- Upon clicking "Mark Won" on `/opportunities/[id]`, user is presented with a direct button link to view the created Sales Quotation in `/quotations/[id]`.

## 19. Validation Rules
- Opportunity must be in stage `NEGOTIATION` or `PROPOSAL` before being marked `WON`.

## 20. Future Extensions
- Automated price list and discount matrix application during CRM-to-Sales quotation handoff.

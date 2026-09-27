# Sales & CRM

<cite>
**Referenced Files in This Document**
- [customer.ts](file://packages/sales/src/customers/customer.ts)
- [crm-account.ts](file://packages/crm/src/accounts/crm-account.ts)
- [lead.ts](file://packages/crm/src/leads/lead.ts)
- [opportunity.ts](file://packages/crm/src/opportunities/opportunity.ts)
- [quotation.ts](file://packages/sales/src/quotations/quotation.ts)
- [sales-order.ts](file://packages/sales/src/sales-orders/sales-order.ts)
- [customer-return.ts](file://packages/sales/src/returns/customer-return.ts)
- [customers.controller.ts](file://apps/api/src/customers/customers.controller.ts)
- [customers.service.ts](file://apps/api/src/customers/customers.service.ts)
- [leads.controller.ts](file://apps/api/src/leads/leads.controller.ts)
- [leads.service.ts](file://apps/api/src/leads/leads.service.ts)
- [opportunities.controller.ts](file://apps/api/src/opportunities/opportunities.controller.ts)
- [opportunities.service.ts](file://apps/api/src/opportunities/opportunities.service.ts)
- [quotations.controller.ts](file://apps/api/src/quotations/quotations.controller.ts)
- [quotations.service.ts](file://apps/api/src/quotations/quotations.service.ts)
- [sales-orders.controller.ts](file://apps/api/src/sales-orders/sales-orders.controller.ts)
- [sales-orders.service.ts](file://apps/api/src/sales-orders/sales-orders.service.ts)
- [customer-returns.controller.ts](file://apps/api/src/customer-returns/customer-returns.controller.ts)
- [customer-returns.service.ts](file://apps/api/src/customer-returns/customer-returns.service.ts)
</cite>

## Table of Contents
1. Introduction
2. Project Structure
3. Core Components
4. Architecture Overview
5. Detailed Component Analysis
6. Dependency Analysis
7. Performance Considerations
8. Troubleshooting Guide
9. Conclusion

## Introduction
This document explains Ananya ERP’s Sales and CRM domain, covering customer management, lead and opportunity tracking, quotations, sales orders, and customer returns. It describes the data model, key workflows from lead generation through post-sale support, practical usage examples, package boundaries, and integration points with finance and inventory domains.

## Project Structure
The Sales & CRM functionality is implemented across two primary packages:
- CRM package: accounts (companies), leads, opportunities, activities, notes
- Sales package: customers, quotations, sales orders, returns, fulfillment requests

At the API layer, NestJS controllers and services expose endpoints for each domain entity, delegating to service logic that applies business rules via domain classes in the packages.

```mermaid
graph TB
subgraph "API Layer"
C1["Customers Controller"]
C2["Leads Controller"]
C3["Opportunities Controller"]
C4["Quotations Controller"]
C5["Sales Orders Controller"]
C6["Customer Returns Controller"]
end
subgraph "CRM Package"
R1["CrmAccount"]
R2["Lead"]
R3["Opportunity"]
end
subgraph "Sales Package"
S1["Customer"]
S2["Quotation"]
S3["SalesOrder"]
S4["CustomerReturn"]
end
C1 --> S1
C2 --> R2
C3 --> R3
C4 --> S2
C5 --> S3
C6 --> S4
R2 --> R3
R3 --> S2
S2 --> S3
S3 --> S4
```

**Diagram sources**
- [customers.controller.ts](file://apps/api/src/customers/customers.controller.ts)
- [leads.controller.ts](file://apps/api/src/leads/leads.controller.ts)
- [opportunities.controller.ts](file://apps/api/src/opportunities/opportunities.controller.ts)
- [quotations.controller.ts](file://apps/api/src/quotations/quotations.controller.ts)
- [sales-orders.controller.ts](file://apps/api/src/sales-orders/sales-orders.controller.ts)
- [customer-returns.controller.ts](file://apps/api/src/customer-returns/customer-returns.controller.ts)
- [crm-account.ts](file://packages/crm/src/accounts/crm-account.ts)
- [lead.ts](file://packages/crm/src/leads/lead.ts)
- [opportunity.ts](file://packages/crm/src/opportunities/opportunity.ts)
- [customer.ts](file://packages/sales/src/customers/customer.ts)
- [quotation.ts](file://packages/sales/src/quotations/quotation.ts)
- [sales-order.ts](file://packages/sales/src/sales-orders/sales-order.ts)
- [customer-return.ts](file://packages/sales/src/returns/customer-return.ts)

**Section sources**
- [customers.controller.ts](file://apps/api/src/customers/customers.controller.ts)
- [leads.controller.ts](file://apps/api/src/leads/leads.controller.ts)
- [opportunities.controller.ts](file://apps/api/src/opportunities/opportunities.controller.ts)
- [quotations.controller.ts](file://apps/api/src/quotations/quotations.controller.ts)
- [sales-orders.controller.ts](file://apps/api/src/sales-orders/sales-orders.controller.ts)
- [customer-returns.controller.ts](file://apps/api/src/customer-returns/customer-returns.controller.ts)

## Core Components
- Customer (Sales): Represents a selling customer with contacts, addresses, status, and credit status. Supports activation, suspension, archiving, and contact/address management.
- CrmAccount (CRM): Represents a company account with contacts and archival state.
- Lead (CRM): Tracks prospective buyers with lifecycle states and conversion to CRM Accounts.
- Opportunity (CRM): Tracks potential deals with stages, value, probability, and close outcomes.
- Quotation (Sales): Price proposals to customers with line items, validity, and acceptance flow.
- Sales Order (Sales): Firm orders derived from accepted quotations or created directly; supports approval, release, partial/full fulfillment, and completion.
- Customer Return (Sales): Post-sale return processing with receipt, inspection, disposition, restock/reject, and closure.

**Section sources**
- [customer.ts](file://packages/sales/src/customers/customer.ts)
- [crm-account.ts](file://packages/crm/src/accounts/crm-account.ts)
- [lead.ts](file://packages/crm/src/leads/lead.ts)
- [opportunity.ts](file://packages/crm/src/opportunities/opportunity.ts)
- [quotation.ts](file://packages/sales/src/quotations/quotation.ts)
- [sales-order.ts](file://packages/sales/src/sales-orders/sales-order.ts)
- [customer-return.ts](file://packages/sales/src/returns/customer-return.ts)

## Architecture Overview
End-to-end flow from lead to post-sale:
- Lead creation and qualification
- Conversion to CRM Account and creation of Opportunity
- Quotation creation and sending; acceptance triggers order creation
- Sales order approval, release, fulfillment updates
- Customer returns handling after delivery

```mermaid
sequenceDiagram
participant User as "User"
participant LeadsCtrl as "Leads Controller"
participant LeadsSvc as "Leads Service"
participant Lead as "Lead"
participant OppCtrl as "Opportunities Controller"
participant OppSvc as "Opportunities Service"
participant Opp as "Opportunity"
participant QuoteCtrl as "Quotations Controller"
participant QuoteSvc as "Quotations Service"
participant Quote as "Quotation"
participant SOCtrl as "Sales Orders Controller"
participant SOSvc as "Sales Orders Service"
participant SO as "SalesOrder"
participant RetCtrl as "Customer Returns Controller"
participant RetSvc as "Customer Returns Service"
participant Ret as "CustomerReturn"
User->>LeadsCtrl : Create Lead
LeadsCtrl->>LeadsSvc : create()
LeadsSvc->>Lead : create()
Note over Lead : Status NEW
User->>LeadsCtrl : Qualify Lead
LeadsCtrl->>Lead : qualify()
Note over Lead : Status QUALIFIED
User->>OppCtrl : Create Opportunity (linked to CRM Account)
OppCtrl->>OppSvc : create()
OppSvc->>Opp : create()
Note over Opp : Stage PROSPECTING
User->>QuoteCtrl : Create Quotation (for Customer)
QuoteCtrl->>QuoteSvc : create()
QuoteSvc->>Quote : create()
Note over Quote : Status DRAFT
User->>QuoteCtrl : Send Quotation
QuoteCtrl->>Quote : send()
Note over Quote : Status SENT
User->>QuoteCtrl : Accept Quotation
QuoteCtrl->>Quote : accept()
Note over Quote : Status ACCEPTED
User->>SOCtrl : Create Sales Order (from Quotation)
SOCtrl->>SOSvc : create()
SOSvc->>SO : create()
Note over SO : Status DRAFT
User->>SOCtrl : Approve / Release
SOCtrl->>SO : approve(), release()
Note over SO : Status APPROVED -> RELEASED
User->>SOCtrl : Fulfill Lines
SOCtrl->>SO : updateLineFulfillment()
Note over SO : PARTIALLY_FULFILLED -> COMPLETED
User->>RetCtrl : Create Return
RetCtrl->>RetSvc : create()
RetSvc->>Ret : create()
Note over Ret : Status DRAFT
User->>RetCtrl : Approve / Receive / Inspect / Restock or Reject / Close
RetCtrl->>Ret : approve(), receive(), inspect(), restock()/reject(), close()
Note over Ret : DRAFT -> ... -> CLOSED
```

**Diagram sources**
- [leads.controller.ts](file://apps/api/src/leads/leads.controller.ts)
- [leads.service.ts](file://apps/api/src/leads/leads.service.ts)
- [lead.ts](file://packages/crm/src/leads/lead.ts)
- [opportunities.controller.ts](file://apps/api/src/opportunities/opportunities.controller.ts)
- [opportunities.service.ts](file://apps/api/src/opportunities/opportunities.service.ts)
- [opportunity.ts](file://packages/crm/src/opportunities/opportunity.ts)
- [quotations.controller.ts](file://apps/api/src/quotations/quotations.controller.ts)
- [quotations.service.ts](file://apps/api/src/quotations/quotations.service.ts)
- [quotation.ts](file://packages/sales/src/quotations/quotation.ts)
- [sales-orders.controller.ts](file://apps/api/src/sales-orders/sales-orders.controller.ts)
- [sales-orders.service.ts](file://apps/api/src/sales-orders/sales-orders.service.ts)
- [sales-order.ts](file://packages/sales/src/sales-orders/sales-order.ts)
- [customer-returns.controller.ts](file://apps/api/src/customer-returns/customer-returns.controller.ts)
- [customer-returns.service.ts](file://apps/api/src/customer-returns/customer-returns.service.ts)
- [customer-return.ts](file://packages/sales/src/returns/customer-return.ts)

## Detailed Component Analysis

### CRM Accounts and Contacts
- Purpose: Represent companies and their stakeholders involved in sales.
- Key behaviors: Create account, add contacts with roles, archive accounts.
- Validation: Company name required; contact requires first/last name and email; primary contact enforced.

```mermaid
classDiagram
class CrmAccount {
+string id
+string companyName
+string? industry
+string? website
+string? billingAddress
+string? shippingAddress
+boolean isArchived
+ContactProps[] contacts
+Date createdAt
+Date updatedAt
+create(props) CrmAccount
+addContact(props) ContactProps
+archive() void
}
class ContactProps {
+string id
+string crmAccountId
+string firstName
+string lastName
+string email
+string? phone
+string role
+boolean isPrimary
+Date createdAt
+Date updatedAt
}
CrmAccount --> ContactProps : "has many"
```

**Diagram sources**
- [crm-account.ts](file://packages/crm/src/accounts/crm-account.ts)

**Section sources**
- [crm-account.ts](file://packages/crm/src/accounts/crm-account.ts)

### Leads and Conversion
- Purpose: Capture and manage prospective buyers until they are qualified or disqualified.
- Lifecycle: NEW → QUALIFIED → CONVERTED; DISQUALIFIED terminal.
- Business rules: Owner assignment blocked when converted/disqualified; qualification only from NEW; conversion requires QUALIFIED.

```mermaid
stateDiagram-v2
[*] --> NEW
NEW --> QUALIFIED : "qualify()"
NEW --> DISQUALIFIED : "disqualify(reason)"
QUALIFIED --> CONVERTED : "convert(accountId)"
DISQUALIFIED --> [*]
CONVERTED --> [*]
```

**Diagram sources**
- [lead.ts](file://packages/crm/src/leads/lead.ts)

**Section sources**
- [lead.ts](file://packages/crm/src/leads/lead.ts)

### Opportunities and Pipeline
- Purpose: Track potential deals linked to CRM Accounts, with stage progression and probability updates.
- Stages: PROSPECTING → QUALIFICATION → PROPOSAL → NEGOTIATION → WON/LOST.
- Rules: Closed stages cannot advance; probability set on stage transitions; lost reason captured.

```mermaid
flowchart TD
Start(["Create Opportunity"]) --> Prospecting["Stage: PROSPECTING"]
Prospecting --> Qualification{"Advance to QUALIFICATION?"}
Qualification --> |Yes| Proposal["Stage: PROPOSAL<br/>Probability updated"]
Qualification --> |No| Prospecting
Proposal --> Negotiation{"Advance to NEGOTIATION?"}
Negotiation --> |Yes| WonLost{"Close?"}
Negotiation --> |No| Proposal
WonLost --> |Won| Won["Stage: WON<br/>Probability 100%"]
WonLost --> |Lost| Lost["Stage: LOST<br/>Probability 0%, reason"]
Won --> End(["Done"])
Lost --> End
```

**Diagram sources**
- [opportunity.ts](file://packages/crm/src/opportunities/opportunity.ts)

**Section sources**
- [opportunity.ts](file://packages/crm/src/opportunities/opportunity.ts)

### Customers
- Purpose: Master records for selling customers with contacts and addresses.
- Behaviors: Activate, suspend, archive; update credit status; add contacts and addresses with defaults and primary flags.

```mermaid
classDiagram
class Customer {
+string id
+string customerNumber
+string name
+string email
+string? phone
+string? taxId
+string currency
+CustomerStatus status
+CreditStatus creditStatus
+CustomerContactProps[] contacts
+CustomerAddressProps[] addresses
+Date createdAt
+Date updatedAt
+create(input) Customer
+activate() void
+suspend() void
+archive() void
+updateCreditStatus(status) void
+addContact(input) CustomerContactProps
+addAddress(input) CustomerAddressProps
}
```

**Diagram sources**
- [customer.ts](file://packages/sales/src/customers/customer.ts)

**Section sources**
- [customer.ts](file://packages/sales/src/customers/customer.ts)

### Quotations
- Purpose: Formal price offers to customers with line items and validity period.
- Flow: DRAFT → SENT → ACCEPTED; can be expired or cancelled.
- Rules: Only DRAFT allows adding lines; must have lines to send; acceptance checks validity date.

```mermaid
stateDiagram-v2
[*] --> DRAFT
DRAFT --> SENT : "send()"
SENT --> ACCEPTED : "accept()"
SENT --> EXPIRED : "validUntil passed"
DRAFT --> CANCELLED : "cancel()"
ACCEPTED --> [*]
EXPIRED --> [*]
CANCELLED --> [*]
```

**Diagram sources**
- [quotation.ts](file://packages/sales/src/quotations/quotation.ts)

**Section sources**
- [quotation.ts](file://packages/sales/src/quotations/quotation.ts)

### Sales Orders
- Purpose: Firm orders for fulfillment, optionally derived from accepted quotations.
- Flow: DRAFT → APPROVED → RELEASED → PARTIALLY_FULFILLED → COMPLETED; can be cancelled.
- Rules: Approval requires lines; release only from approved; fulfillment updates auto-adjust status.

```mermaid
stateDiagram-v2
[*] --> DRAFT
DRAFT --> APPROVED : "approve()"
APPROVED --> RELEASED : "release()"
RELEASED --> PARTIALLY_FULFILLED : "fulfill some lines"
PARTIALLY_FULFILLED --> COMPLETED : "fulfill all lines"
DRAFT --> CANCELLED : "cancel()"
RELEASED --> CANCELLED : "cancel()"
PARTIALLY_FULFILLED --> CANCELLED : "cancel()"
COMPLETED --> [*]
```

**Diagram sources**
- [sales-order.ts](file://packages/sales/src/sales-orders/sales-order.ts)

**Section sources**
- [sales-order.ts](file://packages/sales/src/sales-orders/sales-order.ts)

### Customer Returns
- Purpose: Manage post-delivery returns with receipt, inspection, disposition, and closure.
- Flow: DRAFT → APPROVED → RECEIVED → INSPECTED → RESTOCKED or REJECTED → CLOSED.
- Rules: Each step enforces current state; inspection assigns per-line dispositions; closing requires final disposition.

```mermaid
stateDiagram-v2
[*] --> DRAFT
DRAFT --> APPROVED : "approve()"
APPROVED --> RECEIVED : "receive()"
RECEIVED --> INSPECTED : "inspect(dispositions)"
INSPECTED --> RESTOCKED : "restock()"
INSPECTED --> REJECTED : "reject()"
RESTOCKED --> CLOSED : "close()"
REJECTED --> CLOSED : "close()"
```

**Diagram sources**
- [customer-return.ts](file://packages/sales/src/returns/customer-return.ts)

**Section sources**
- [customer-return.ts](file://packages/sales/src/returns/customer-return.ts)

## Dependency Analysis
- CRM to Sales: Opportunities often originate from qualified leads; accepted quotations become sales orders.
- Sales to Inventory: Sales orders drive fulfillment and reservations; returns affect stock via restock/scrap.
- Sales to Finance: Accepted quotations and fulfilled orders typically trigger receivable invoices and revenue recognition downstream.

```mermaid
graph LR
Lead["Lead"] --> Opportunity["Opportunity"]
Opportunity --> Quotation["Quotation"]
Quotation --> SalesOrder["SalesOrder"]
SalesOrder --> Inventory["Inventory"]
SalesOrder --> Finance["Finance"]
SalesOrder --> CustomerReturn["CustomerReturn"]
CustomerReturn --> Inventory
```

[No diagram sources needed since this diagram shows conceptual relationships without mapping to specific files]

**Section sources**
- [lead.ts](file://packages/crm/src/leads/lead.ts)
- [opportunity.ts](file://packages/crm/src/opportunities/opportunity.ts)
- [quotation.ts](file://packages/sales/src/quotations/quotation.ts)
- [sales-order.ts](file://packages/sales/src/sales-orders/sales-order.ts)
- [customer-return.ts](file://packages/sales/src/returns/customer-return.ts)

## Performance Considerations
- Keep quotation and sales order line operations minimal and batched where possible to reduce repeated recalculations.
- Use read-only totals computed from line arrays efficiently; avoid unnecessary recomputation by caching totals when appropriate at the service layer.
- Enforce validation early in controllers/services to fail fast and minimize database round-trips.
- For high-volume pipelines, consider asynchronous processing for notifications and downstream integrations (e.g., invoicing, inventory reservation).

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common errors and how to resolve them:
- Cannot activate archived customer: Ensure the customer is not archived before activation.
- Only NEW leads can be qualified: Verify lead status before calling qualification.
- Converted leads cannot be disqualified: Reassign owner or handle conversion path instead.
- Only DRAFT quotations can be sent: Add line items and ensure status is DRAFT before sending.
- Quotation has expired: Extend validity or recreate quotation if past validUntil.
- Only DRAFT sales orders can be approved: Ensure no prior approvals and include line items.
- Only APPROVED sales orders can be released: Complete approval workflow first.
- Cannot cancel completed sales order: Cancel earlier in the process or use returns for corrections.
- Return steps require correct state: Follow DRAFT → APPROVED → RECEIVED → INSPECTED → RESTOCKED/REJECTED → CLOSED sequence.

**Section sources**
- [customer.ts](file://packages/sales/src/customers/customer.ts)
- [lead.ts](file://packages/crm/src/leads/lead.ts)
- [quotation.ts](file://packages/sales/src/quotations/quotation.ts)
- [sales-order.ts](file://packages/sales/src/sales-orders/sales-order.ts)
- [customer-return.ts](file://packages/sales/src/returns/customer-return.ts)

## Conclusion
Ananya ERP’s Sales & CRM domain provides a robust, state-driven model for managing the entire sales lifecycle—from leads and opportunities to quotations, orders, and returns. The clear separation between CRM and Sales packages, combined with explicit state machines in domain classes, ensures predictable behavior and strong invariants. Integration points with inventory and finance enable end-to-end order fulfillment and accounting while maintaining clean domain boundaries.
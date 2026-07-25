# Request for Comments (RFC)

The Request for Comments (RFC) process is used to capture the reasoning behind significant architectural and engineering decisions before implementation begins.

RFCs exist to:

- document why a decision was made,
- encourage discussion before implementation,
- record trade-offs and alternatives,
- preserve architectural history,
- establish a shared understanding across contributors.

RFCs are **not** implementation guides.

---

# Goals

RFCs should:

- Capture important design decisions.
- Encourage discussion before implementation.
- Establish a shared understanding before implementation.
- Document trade-offs honestly.
- Provide historical context for future contributors.
- Serve as the architectural reference for implementation.

---

# Lifecycle

Every RFC has one of the following statuses.

## Draft

The proposal is under discussion.

The design may change.

Implementation should not begin until the RFC is accepted.

---

## Accepted

The proposal has been reviewed and approved.

Implementation should follow the accepted architectural direction.

Future work should remain consistent with the accepted RFC.

---

## Superseded

A newer RFC replaces this RFC.

The previous RFC is retained for historical reference.

---

## Rejected

The proposal was considered but not adopted.

Rejected RFCs remain in the repository to preserve architectural history and design discussions.

---

# Standard RFC Structure

Every RFC should contain the following sections.

```text
Title

Status

Author

Created

Summary

Motivation

Design

Alternatives Considered

Trade-offs

Consequences

Future Extensions

Non-Goals
```

Not every RFC requires every section, but the reasoning behind the decision should always be documented.

---

# Writing Guidelines

An RFC should:

- Focus on the problem before the solution.
- Explain _why_, not just _what_.
- Document alternatives that were considered.
- Document trade-offs honestly.
- Remain implementation-independent whenever possible.
- Avoid framework- or library-specific details unless they directly influence the architecture.
- Be concise, but complete enough that future contributors can understand the decision without additional context.

---

# Numbering

RFCs use sequential numbering.

Examples:

```text
0001-inventory-ledger.md

0002-component-lifecycle.md

0003-stock-projection.md
```

Numbers are never reused, even if an RFC is rejected or superseded.

---

# Relationship to Implementation

RFCs describe architecture and long-term design decisions.

Implementation may evolve as long as it remains consistent with the accepted RFC.

If implementation requires changing an accepted architectural decision, the RFC should be updated or replaced with a new RFC.

---

# Repository Philosophy

Architecture should evolve intentionally.

Significant design decisions should be discussed once, documented once, and referenced by future implementations.

This keeps implementation focused while preserving the reasoning behind the system's design.

---

# When to Write an RFC

An RFC is recommended when a decision:

- affects multiple modules,
- changes the domain model,
- introduces a new architectural pattern,
- changes persistence or data flow,
- introduces a significant public API,
- or is expected to remain relevant for years.

Routine feature work, bug fixes, refactoring, implementation details, and small design changes do not require an RFC.

---

# RFC Index

| RFC  | Title                  | Status   |
| ---- | ---------------------- | -------- |
| 0001 | Inventory Ledger       | Accepted |
| 0002 | Inventory Domain Model | Draft    |
| 0003 | Inventory Ledger       | Accepted |
| 0004 | Inventory Projection   | Accepted |
| 0005 | Transaction Types      | Accepted |
| 0006 | Units of Measure       | Accepted |
| 0007 | Batch & Serial Tracking| Accepted |
| 0008 | Inventory Reservations | Accepted |
| 0009 | Supplier Management    | Accepted |
| 0010 | Purchase Orders        | Accepted |
| 0011 | Goods Receipt          | Accepted |
| 0012 | Supplier Returns       | Accepted |
| 0013 | Purchase Invoices      | Accepted |
| 0014 | Procurement Policies   | Accepted |
| 0015 | Procurement Reporting  | Accepted |
| 0016 | Bill of Materials      | Accepted |
| 0017 | Production Orders      | Accepted |
| 0018 | Material Consumption   | Accepted |
| 0019 | Finished Goods Receipt | Accepted |
| 0020 | Manufacturing Traceability | Accepted |
| 0021 | Warehouse Structure & Bin Locations | Accepted |
| 0022 | Stock Counts           | Accepted |
| 0023 | Cycle Counting         | Accepted |
| 0024 | Warehouse Transfers    | Accepted |
| 0025 | Warehouse Policies     | Accepted |
| 0026 | Customer Management    | Accepted |
| 0027 | Quotations & Sales Orders | Accepted |
| 0028 | Order Fulfillment Requests | Accepted |
| 0029 | Shipping & Delivery    | Accepted |
| 0030 | Customer Returns       | Accepted |
| 0031 | Chart of Accounts      | Accepted |
| 0032 | General Ledger & Journal Entries | Accepted |
| 0033 | Accounts Receivable    | Accepted |
| 0034 | Accounts Payable       | Accepted |
| 0035 | Payments & Bank Reconciliation | Accepted |
| 0036 | Lead Management        | Accepted |
| 0037 | Accounts & Contacts    | Accepted |
| 0038 | Opportunities & Pipeline | Accepted |
| 0039 | Activities & Notes     | Accepted |
| 0040 | CRM to Sales Integration | Accepted |






# RFC-0001: Inventory Ledger

**Status:** Superseded  
**Superseded by:** [RFC-0003: Inventory Ledger](0003-inventory-ledger.md)  
**Reason:** Refined and formalized in RFC-0003 to include dual-location movement semantics (`sourceLocationId`, `destinationLocationId`), positive quantity constraints, projection separation, and domain invariants matching `@ananya/inventory`.

**Author:** Ananya Contributors

**Created:** 2026-07-15

---

# Summary

This RFC defines the inventory accounting model used throughout Ananya.

Inventory is represented as an immutable ledger of transactions.

Current stock is **derived** from the ledger and is never treated as the source of truth.

---

# Motivation

Traditional inventory systems often store a mutable `quantity` field.

Example:

```
Component
---------
ESP32

Quantity = 147
```

Over time this value becomes difficult to trust because every feature modifies it independently.

Examples:

- Purchase
- Sale
- Consumption
- Transfer
- Adjustment
- Manufacturing
- Returns

Instead, Ananya records every inventory movement as an immutable transaction.

Current stock is calculated from transaction history.

This approach provides:

- Complete audit history
- Deterministic stock calculation
- Simpler business rules
- Easier debugging
- Future support for accounting and reporting

---

# Principles

## Inventory is Event Driven

Every inventory movement creates a transaction.

Inventory is never directly modified.

---

## Transactions are Immutable

Once created, inventory transactions cannot be edited.

If a mistake occurs:

- create a reversing transaction
- or create an adjustment transaction

History is never rewritten.

---

## Transactions are Never Deleted

Inventory history is permanent.

Soft-delete is not supported.

---

## Stock is Derived

Current stock is calculated.

Example:

```
+100 Receipt

-25 Issue

+10 Adjustment

-5 Transfer

----------------

Current Stock = 80
```

No table stores the value **80** as the source of truth.

---

## Positive Quantities Only

Quantity is always a positive number.

Direction is determined by transaction type.

Good

```
type = ISSUE

quantity = 5
```

Avoid

```
quantity = -5
```

---

# Inventory Transaction

Every inventory movement creates one inventory transaction.

Minimum fields:

```
id

componentId

locationId

type

quantity

reference

notes

performedAt

createdAt
```

---

# Transaction Types

Initial transaction types are:

```
INITIAL_BALANCE

RECEIPT

ISSUE

TRANSFER

ADJUSTMENT
```

Additional types may be introduced in future RFCs.

Examples:

- Manufacturing
- Purchase Receipt
- Sales Shipment
- Return
- Scrap
- Cycle Count

---

# Transfer

A transfer is a movement between two locations.

Business Concept:

```
Location A

↓

Location B
```

Internally this may become multiple ledger entries.

This is an implementation detail.

The domain model exposes a single Transfer operation.

---

# References

Transactions may optionally reference a business document.

Examples:

- Purchase Order
- Goods Receipt
- Project
- Manufacturing Order
- Manual Adjustment

The ledger is intentionally unaware of the semantics of these documents.

It stores only the reference.

---

# Stock Calculation

Current stock is calculated by summing all transactions.

Example:

```
Receipt      +100

Issue         -25

Adjustment    +10

Transfer       -5

------------------

Current = 80
```

Future implementations may introduce projections or cached balances for performance.

The ledger remains the source of truth.

---

# Future Extensions

The ledger must support future features without changing the accounting model.

Examples include:

- Lots
- Batch Tracking
- Serial Numbers
- Expiry Dates
- Manufacturing
- Purchase Orders
- Sales Orders
- Reservations
- Multi-Warehouse
- Projects
- Costing
- Cycle Counting

These features should extend the ledger rather than replace it.

---

# Non-Goals

This RFC does not define:

- Purchase Orders
- Suppliers
- Manufacturing
- Costing
- Reservations
- Batch Tracking
- Serial Numbers
- User Permissions

These will be covered by future RFCs.

---

# Consequences

By adopting a ledger model:

- Inventory history becomes fully auditable.
- Stock calculations are deterministic.
- Business operations become append-only.
- Future inventory features can build on a common foundation.
- Reporting can always be reproduced from historical transactions.

This model is considered a foundational architectural decision for Ananya.

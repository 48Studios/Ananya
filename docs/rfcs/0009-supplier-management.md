# RFC-0009: Supplier Management

**Status:** Accepted

**Author:** Ananya Contributors

**Created:** 2026-07-22

---

# 1. Purpose

This RFC defines the **Supplier Management** aggregate and domain services in the Procurement Bounded Context of Ananya ERP. Suppliers represent external vendors, component distributors, original equipment manufacturers (OEMs), and fabricators that provide physical components, raw materials, or assembly services to ACME Corporation.

---

# 2. Scope

- Supplier lifecycle management (Creation, Verification, Activation, Deactivation, Blacklisting).
- Primary & secondary contact information management.
- Supplier-component part catalog mapping (Vendor Part Numbers, Manufacturer Part Numbers, Lead Times, MOQ, Pricing).
- Supplier rating & performance metrics.
- Tax, Currency, and Payment Terms metadata.

---

# 3. Ubiquitous Language

- **Supplier**: An external business entity providing components, goods, or services.
- **Supplier Component Catalog**: Mapping between an internal Ananya Component and a Supplier's Vendor Part Number (VPN).
- **Minimum Order Quantity (MOQ)**: Minimum quantity required by a supplier per PO line.
- **Order Multiple**: Step quantity constraint enforced by a supplier.
- **Lead Time**: Vendor's estimated fulfillment timeframe in days.
- **Payment Terms**: Contractual payment agreement (e.g., `NET30`, `NET60`, `DUE_ON_RECEIPT`, `PREPAID`).

---

# 4. Domain Model

```
+-------------------------------------------------------------------+
|                        Supplier Aggregate                         |
|                                                                   |
| [Supplier ID] (PK)                                               |
|  - code: string (unique, uppercase e.g. SUP-DIGIKEY)              |
|  - name: string                                                   |
|  - taxId: string?                                                 |
|  - paymentTerms: PaymentTerms (Enum)                              |
|  - currency: string (ISO 4217)                                    |
|  - rating: SupplierRating (0.0 to 5.0)                            |
|  - isActive: boolean                                              |
|                                                                   |
|  +-- Contacts: SupplierContact[] (Entities)                       |
|  +-- Catalog: SupplierComponent[] (Entities)                      |
+-------------------------------------------------------------------+
```

---

# 5. Aggregate Roots

- **`Supplier`**: Root entity managing supplier identification, terms, contacts, catalog mappings, and lifecycle state.

---

# 6. Entities

- **`SupplierContact`**: Contact person entity owned by Supplier (`id`, `supplierId`, `name`, `email`, `phone`, `role`, `isPrimary`).
- **`SupplierComponent`**: Mapping entity owned by Supplier (`id`, `supplierId`, `componentId`, `vendorPartNumber`, `leadTimeDays`, `minimumOrderQuantity`, `orderMultiple`, `unitPrice`, `currency`).

---

# 7. Value Objects

- **`SupplierCode`**: Validated uppercase alphanumeric code string (e.g. `SUP-MOUSER`).
- **`PaymentTerms`**: Immutable value object defining terms (`NET15`, `NET30`, `NET60`, `IMMEDIATE`, `ADVANCE`).
- **`Money`**: Value object encapsulating amount and currency (`amount: number`, `currency: string`).

---

# 8. Commands

- `CreateSupplierCommand`: Registers a new supplier.
- `UpdateSupplierCommand`: Updates supplier profile, payment terms, or tax ID.
- `AddSupplierContactCommand`: Adds a contact person to a supplier.
- `UpdateSupplierContactCommand`: Updates a contact person's details.
- `RemoveSupplierContactCommand`: Removes a contact person.
- `MapSupplierComponentCommand`: Establishes or updates supplier catalog mapping for a component.
- `DeactivateSupplierCommand`: Deactivates supplier preventing new PO issuance.

---

# 9. Queries

- `GetSupplierByIdQuery`: Retrieves supplier profile with contacts.
- `GetSupplierByCodeQuery`: Retrieves supplier by code.
- `ListSuppliersQuery`: Filters suppliers with pagination, active status, search query.
- `GetSupplierCatalogQuery`: Retrieves all components mapped to a supplier with pricing & lead times.
- `GetComponentSuppliersQuery`: Retrieves all suppliers mapped to a specific component.

---

# 10. Application Services

- **`SupplierApplicationService`**: Orchestrates use cases for creating suppliers, managing contacts, updating vendor part catalogs, and validating supplier readiness for purchasing.

---

# 11. Domain Services

- **`SupplierCodeUniquenessChecker`**: Enforces that supplier codes are unique across the system.
- **`SupplierCatalogPricingService`**: Resolves preferred supplier and best pricing for a given component & order quantity.

---

# 12. State Machines

```
[DRAFT / NEW] ---> [ACTIVE] <---> [INACTIVE]
                       |
                       +---------> [BLACK-LISTED]
```

---

# 13. Domain Invariants

- Supplier code must be non-empty, trimmed, uppercase, and unique.
- Supplier name must be non-empty.
- A supplier can have at most one primary contact marked `isPrimary: true`.
- Supplier component MOQ and order multiple must be strictly positive integers (`> 0`).
- Deactivated or Blacklisted suppliers cannot be selected for new Purchase Orders.

---

# 14. Integration Points

- **`@ananya/inventory`**: `SupplierComponent` references `Component.id` from the Inventory bounded context.

---

# 15. Repository Contracts

```typescript
export interface SupplierRepository {
  findById(id: string): Promise<Supplier | null>;
  findByCode(code: string): Promise<Supplier | null>;
  findMany(options?: FindManySuppliersOptions): Promise<Supplier[]>;
  save(supplier: Supplier): Promise<void>;
  delete(id: string): Promise<void>;
}
```

---

# 16. Database Schema

```sql
CREATE TABLE suppliers (
  id VARCHAR(36) PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  tax_id VARCHAR(64),
  payment_terms VARCHAR(32) NOT NULL DEFAULT 'NET30',
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  rating NUMERIC(3, 2) DEFAULT 5.00,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE supplier_contacts (
  id VARCHAR(36) PRIMARY KEY,
  supplier_id VARCHAR(36) NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(64),
  role VARCHAR(64),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE supplier_components (
  id VARCHAR(36) PRIMARY KEY,
  supplier_id VARCHAR(36) NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  component_id VARCHAR(36) NOT NULL,
  vendor_part_number VARCHAR(128) NOT NULL,
  lead_time_days INT NOT NULL DEFAULT 7,
  minimum_order_quantity INT NOT NULL DEFAULT 1,
  order_multiple INT NOT NULL DEFAULT 1,
  unit_price NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

# 17. API Specification

- `POST /api/v1/suppliers`: Create supplier.
- `GET /api/v1/suppliers`: Search and list suppliers.
- `GET /api/v1/suppliers/:id`: Get supplier details with contacts & catalog.
- `PATCH /api/v1/suppliers/:id`: Update supplier metadata.
- `POST /api/v1/suppliers/:id/contacts`: Add contact.
- `DELETE /api/v1/suppliers/:id/contacts/:contactId`: Delete contact.
- `POST /api/v1/suppliers/:id/components`: Add supplier part mapping.
- `DELETE /api/v1/suppliers/:id/components/:componentMappingId`: Remove mapping.

---

# 18. UI Workflows

1. **Supplier Directory Page**: Search suppliers by code, name, status. Display primary contact and rating.
2. **Supplier Detail View**: Overview tab (terms, currency, tax ID), Contacts tab (contact management), Catalog tab (mapped components with lead time and unit price).
3. **New Supplier Form**: Guided form with code generation/validation and initial primary contact details.

---

# 19. Sequence Diagrams

```
User -> UI: Create Supplier ("SUP-DIGIKEY", "Digi-Key Electronics")
UI -> API: POST /api/v1/suppliers
API -> SupplierAppService: createSupplier(input)
SupplierAppService -> CodeUniquenessChecker: verifyUnique("SUP-DIGIKEY")
SupplierAppService -> Supplier Aggregate: Supplier.create(input)
SupplierAppService -> SupplierRepo: save(supplier)
SupplierRepo -> Postgres: INSERT INTO suppliers ...
API -> UI: 201 Created (Supplier DTO)
```

---

# 20. Future Extensions

- Automated vendor evaluation based on OTIF metrics from Goods Receipts.
- Vendor portal authentication and direct order confirmation APIs.
- Multi-currency conversion historical logs per supplier.

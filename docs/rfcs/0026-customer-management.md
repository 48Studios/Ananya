# RFC-0026: Customer Management

## 1. Purpose

Define the domain model, persistence schema, API endpoints, and UI workflows for Customer account management in Ananya ERP. The Customer bounded context owns all commercial relationships, contact details, address records, tax info, and credit risk statuses.

## 2. Scope

- Customer Master Data (Customer Number, Legal Name, Status, Credit Status, Tax ID, Currency)
- Customer Contact Persons (Name, Email, Phone, Role)
- Customer Addresses (Billing Address, Shipping Address, Location Type)
- Customer Status Lifecycle (`DRAFT` → `ACTIVE` → `SUSPENDED` → `ARCHIVED`)

## 3. Ubiquitous Language

- **Customer**: The commercial entity or enterprise purchasing products.
- **Customer Number**: A unique human-readable identifier (e.g. `CUST-2026-0001`).
- **Credit Status**: Creditworthiness indicator (`OK`, `ON_HOLD`, `CREDIT_EXCEEDED`).
- **Customer Address**: A physical or billing address linked to a customer account.

## 4. Aggregate Roots

- `Customer` (`packages/sales/src/customers/customer.ts`)

## 5. Entities

- `CustomerContact` (`id`, `name`, `email`, `phone`, `role`, `isPrimary`)
- `CustomerAddress` (`id`, `addressType`, `street1`, `street2`, `city`, `state`, `postalCode`, `country`, `isDefault`)

## 6. Value Objects

- `CustomerStatus` (`DRAFT`, `ACTIVE`, `SUSPENDED`, `ARCHIVED`)
- `CreditStatus` (`OK`, `ON_HOLD`, `CREDIT_EXCEEDED`)
- `AddressType` (`BILLING`, `SHIPPING`, `BOTH`)

## 7. Commands

- `CreateCustomerCommand`
- `UpdateCustomerCommand`
- `AddCustomerContactCommand`
- `AddCustomerAddressCommand`
- `ActivateCustomerCommand`
- `SuspendCustomerCommand`

## 8. Queries

- `GetCustomerByIdQuery`
- `GetCustomerByNumberQuery`
- `ListCustomersQuery`

## 9. Domain Services

- `CustomerStatusGuard`: Validates customer is `ACTIVE` before allowing commercial order creation.

## 10. Application Services

- `CustomersService` (`apps/api/src/customers/customers.service.ts`)

## 11. Repository Contracts

- `CustomerRepository` (`packages/sales/src/customers/customer.repository.ts`)

## 12. Domain Invariants

- Customer code/number must be unique across the tenant.
- Customer must have at least one primary contact or address to be activated.
- Inactive or suspended customers cannot accept quotations or place sales orders.

## 13. State Machines

```
[DRAFT] ──(activate)──> [ACTIVE] ──(suspend)──> [SUSPENDED]
                           │                         │
                        (archive)                 (reactivate)
                           ▼                         │
                      [ARCHIVED] <───────────────────┘
```

## 14. Sequence Diagrams

```
User -> CustomerController: POST /customers
CustomerController -> CustomersService: create(dto)
CustomersService -> CustomerAggregate: Customer.create(props)
CustomerAggregate -> CustomersService: Customer instance
CustomersService -> CustomerRepository: save(customer)
CustomerRepository -> Database: INSERT INTO customers
```

## 15. Warehouse Integration

None. Customer master data resides strictly within Sales.

## 16. Database Schema

- Table `customers`
- Table `customer_contacts`
- Table `customer_addresses`

## 17. API Design

- `POST /customers`
- `GET /customers`
- `GET /customers/:id`
- `POST /customers/:id/contacts`
- `POST /customers/:id/addresses`
- `POST /customers/:id/activate`
- `POST /customers/:id/suspend`

## 18. UI Workflow

- Route `/customers` lists all customer accounts with search & filter.
- Route `/customers/[id]` displays customer details, contact roster, address book, and order history.

## 19. Validation Rules

- `name` is required.
- `customerNumber` formatted as `CUST-YYYY-XXXX`.
- `email` must be valid email format.

## 20. Future Extensions

- Automated credit score integrations and payment term matrix.

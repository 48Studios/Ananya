# Production Data Management Architecture Specification

> **Status**: Production Standard (RC1 Sprint)  
> **Audience**: Platform Engineers, DevOps, System Administrators, AI Coding Agents

---

# Executive Overview

The **Production Data Management Architecture** defines the exact rules and workflows for initializing, populating, and managing operational data in Ananya ERP.

The primary architectural principles are:

> [!CAUTION]
> **Zero Utility Scripts**: The concept of CLI seed scripts (`db:seed`), clear scripts (`db:clear`), clean scripts, reset scripts, and developer data generators is completely eliminated from the monorepo.
>
> All operational data management occurs **INSIDE** the Web Application interface. Developers and administrators initialize and maintain environments through identical production paths.

---

# Data Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│ 1. System Bootstrap (Infrastructure Only)               │
│    pnpm db:setup (or pnpm db:bootstrap)                 │
│    Initializes Roles, Permission Matrix, Series & Flags │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│ 2. Organization Setup                                   │
│    First login at /setup                                │
│    Creates Organization Profile & Root Administrator    │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│ 3. Administrator Data Packs                             │
│    Web UI: /settings/data-packs                         │
│    Installs Base Units, Categories, Logistics, Demo     │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│ 4. Data Migration Framework                             │
│    Import Module UI / API                               │
│    Imports master & business data via CSV/Excel/JSON    │
└─────────────────────────────────────────────────────────┘
```

---

# System Bootstrap Specification

System Bootstrap (`packages/database/src/bootstrap/bootstrap.ts`) is executed during system setup (`pnpm db:setup` or `pnpm db:bootstrap`).

## Allowed Bootstrap Objects

Bootstrap creates **ONLY** platform infrastructure:

1. **System Roles & Permission Matrix**: `Admin`, `Manager`, `Member`, `Viewer`
2. **System Settings Defaults**: Base Currency (`INR`), Supported Currencies (`INR`, `USD`, `EUR`), Fiscal Start (`4`), Date Format (`YYYY-MM-DD`)
3. **Default Numbering Series**: `PurchaseOrder` (`PO-`), `WorkOrder` (`WO-`), `Component` (`CMP-`), `Project` (`PRJ-`), `GoodsReceipt` (`GRN-`), `InventoryTransaction` (`TX-`), `SalesOrder` (`SO-`), `Quotation` (`QT-`), `Asset` (`AST-`), `Equipment` (`EQP-`), `MaintenanceSchedule` (`MNT-`), `ServiceRequest` (`SRV-`), `Warranty` (`WRN-`), `RMA` (`RMA-`)
4. **Default Feature Flags**: `MFA_REQUIRED` (`false`), `EXPERIMENTAL_AI_FORECAST` (`false`), `BARCODE_STUDIO` (`true`)

## Forbidden Bootstrap Data

Bootstrap must **NEVER** create business data or lookup data:

- Base Units of Measure (delivered via Base Units Data Pack)
- Categories (delivered via Default Categories Data Pack)
- Components, SKUs, Products
- Suppliers & Vendor Contacts
- Customers
- Projects & Milestones
- BOMs & Line Items
- Purchase Orders & Goods Receipts
- Work Orders & Production Output
- Inventory Balances & Ledger Transactions

---

# Data Packs Specification

Data Packs replace synthetic seeding with administrator-driven, web-based installation packages (`Settings` &rarr; `Data Packs` or `/settings/data-packs`).

## Catalog of Data Packs

| Data Pack ID         | Name                       | Category       | Description                                                                                              | Entity      | Records |
| :------------------- | :------------------------- | :------------- | :------------------------------------------------------------------------------------------------------- | :---------- | :------ |
| `base-units`         | Base Units of Measure      | Core Lookup    | Standard physical units (`pcs`, `kg`, `g`, `mg`, `m`, `cm`, `mm`, `L`, `mL`, `box`, `roll`, `set`, `hr`) | `Unit`      | 13      |
| `default-categories` | Default Categories         | Core Lookup    | Standard component categories (`ELEC`, `MECH`, `RAW`, `ASSY`, `CONS`)                                    | `Category`  | 5       |
| `core-erp`           | Core Logistics Pack        | Infrastructure | Initial central warehouse, staging areas, and storage bins                                               | `Warehouse` | 1       |
| `demo-inventory`     | Demo Electronic Components | Demo Data      | Sample electronic component catalog with units and descriptions                                          | `Component` | 5       |

## Installation Workflow

Data Packs execute strictly through the production **Import Framework** (`ImportExportService`):

`Select Pack` &rarr; `Pre-Import Validation` &rarr; `Duplicate Check` &rarr; `Import Execution` &rarr; `Audit Log (DATA_PACK_INSTALLED)`.

---

# Organization Reset Specification

Organization Reset replaces CLI truncation scripts with a secure, audited administrator feature in the Web Application (`Settings` &rarr; `Danger Zone` or `/settings/danger-zone`).

## Reset Behavior

### Business Data Removed (Purged)

- Components, Inventory Balances, Ledger Transactions, Reservations
- Suppliers, Supplier Contacts, Supplier Returns
- Customers, Customer Contacts, Customer Addresses
- BOMs, BOM Line Items, Work Orders, Production Operations
- Projects, Project Materials, Milestones, Tasks, Timesheets, Activities
- Purchase Orders, Goods Receipts, Stock Adjustments, Transfers, Cycle Counts
- Assets, Equipment, Maintenance Schedules, Service Requests, Warranty, RMA

### Tenant Data Preserved (Survives)

- Organization Profile & Setup Status
- Root Administrator Account & User Directory
- User Sessions & Active Invitations
- System Roles & Permission Matrix
- System Defaults, Numbering Series & Feature Flags
- Security Audit Logs & Security History

## Confirmation UX & Security

1. **Warning Screen**: Clear display of purged vs preserved data.
2. **Text Verification**: Requires typing `RESET MY ORGANIZATION` exactly.
3. **Password Re-Authentication**: Requires entering current administrator password.
4. **Audit Logging**: Records audit event `ORGANIZATION_DATA_RESET` with user email, timestamp, and details.

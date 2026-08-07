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

# Unified Import Framework & FileUploader Architecture

The Ananya ERP platform enforces a single authoritative file upload and import architecture across all web application modules (Components, Suppliers, Manufacturers, Warehouses, Inventory, Customers, Projects, Data Packs, Attachments, Document Management).

### 1. Single Shared Upload Component (`FileUploader`)

- **Canonical Component**: `apps/web/components/ui/file-uploader.tsx`
- **User Interface**: Pure shadcn UI styling with drag & drop, click-to-browse, clipboard image/text paste, keyboard accessibility (`tabIndex={0}`), file extension filtering (`.csv,.xlsx,.json`, `image/*,.pdf`), maximum file size enforcement (default 50MB), progress state, error alerts, and retry/cancel controls.
- **Event Handling**: Eliminates nested HTML `<label><button>` event duplication bugs by using programmatic `inputRef.current?.click()` element targeting.

### 2. Standardized 5-Step Import Pipeline

Every module import follows the identical workflow executed via `ImportWizard` (`apps/web/components/ui/import-wizard.tsx`):

1. **Upload File**: File selection via `FileUploader` with CSV, XLSX, and JSON format validation. Stores actual `File` object in React state.
2. **Multipart Preview**: Sends `POST /import-export/import/preview` as `multipart/form-data` with `file` and `entityType`. Backend parses headers & returns sample rows for mapping.
3. **Column Mapping**: Auto-matches spreadsheet header columns against system entity schema fields.
4. **Multipart Execution**: Sends `POST /import-export/import/execute` as `multipart/form-data` with `file`, `entityType`, and `columnMapping` JSON. Backend `@UseInterceptors(FileInterceptor('file'))` parses 100% of rows from uploaded `file.buffer`.
5. **Transactional Execution & Read-Model Invalidation**: Inserts records inside a database transaction, performs post-write database verification, and triggers frontend `onRefreshData` / query invalidation, making imported records immediately visible in the UI without browser reload.

### 3. Multipart Request & Data Integrity Standards

- **HTTP Request Specification**: All import requests transmit binary or text file payloads as `multipart/form-data; boundary=...`. JSON-only metadata requests are prohibited.
- **Backend File Processing**: NestJS controllers consume uploaded files using `@UseInterceptors(FileInterceptor('file'))` and `@UploadedFile() file: Express.Multer.File`.
- **Data Integrity Invariant**: No import job reports status `COMPLETED` unless 100% of rows are parsed from the uploaded file, committed to the database, and verified as readable through the database repository read model.

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

---

# Canonical Schema Parity & Relational Resolution Principles

Every entity in Ananya ERP maintains a single canonical schema across Database, Domain, DTOs, API, UI Forms, Tables, and Import/Export templates.

### 1. 100% Relational Field Exposure
- **UI Forms**: All relationship fields must use the searchable, creatable `<EntitySelector>` component. Text inputs and native HTML selects for foreign key fields are strictly forbidden.
- **Import Templates**: Import templates include business key columns (`parentCode`, `categoryCode`, `manufacturerCode`, `warehouseCode`) for all entity relationships.
- **Business Key Resolution**: Import pipelines resolve business keys (`code`, `sku`, `number`) to database primary keys (`id`). Internal UUIDs are never required in import files.

### 2. Multi-Pass Hierarchy Resolution
- Hierarchical entities (e.g. Category, Location) support nested tree structures during import.
- The import engine uses multi-pass iterative processing. Parent records are inserted first, allowing child records defined anywhere in the import file to resolve their `parentId` cleanly.
- Self-parenting loops (`parentCode == code`) and unresolved parent codes are reported as structured row-level validation errors.

### 3. Round-Trip Export-Import Guarantee
- `executeExport` queries actual database records and maps foreign key UUIDs back to human-readable business key codes (`parentCode`, `categoryCode`, `manufacturerCode`).
- Data exported from the system can be re-imported into another workspace without data loss or broken relationships.

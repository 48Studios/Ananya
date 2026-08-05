# RFC-0049: Field Service & Maintenance

- **Status**: Accepted
- **Author**: Ananya ERP Core Team
- **Created**: 2026-07-26

## 1. Purpose

Define the architectural design, ubiquitous language, state machine, and domain boundaries for Maintenance Schedules and Field Service within the Service Management bounded context of Ananya ERP.

## 2. Scope

Covers preventive maintenance scheduling, customer asset servicing frequencies, next visit scheduling, technician assignments, and recurring service tracking.

## 3. Ubiquitous Language

- **Maintenance Schedule**: A recurring service plan defining scheduled inspection and preventive maintenance intervals for customer assets.
- **Schedule Number**: Human-readable unique identifier formatted as `SCH-YYYY-XXXX`.
- **Service Frequency**: Interval between maintenance visits (`MONTHLY`, `QUARTERLY`, `BIANNUAL`, `ANNUAL`).

## 4. Aggregate Roots

- `MaintenanceSchedule`: Aggregate root tracking schedule number, customer reference, asset details, service frequency, next visit date, assigned technician, and status.

## 5. Entities

- None.

## 6. Value Objects

- `MaintenanceStatus`: `'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED'`
- `ServiceFrequency`: `'MONTHLY' | 'QUARTERLY' | 'BIANNUAL' | 'ANNUAL'`

## 7. Commands

- `CreateMaintenanceScheduleCommand`: Initializes a new Maintenance Schedule.
- `PauseMaintenanceScheduleCommand`: Suspends recurring maintenance visits.
- `ResumeMaintenanceScheduleCommand`: Resumes active maintenance visits.
- `CompleteVisitCommand`: Records visit completion and calculates next scheduled visit date based on frequency.
- `CancelMaintenanceScheduleCommand`: Cancels the maintenance plan.

## 8. Queries

- `FindMaintenanceScheduleByIdQuery`
- `ListMaintenanceSchedulesQuery` (filters by customer, technician, status, frequency)

## 9. Domain Services

- None.

## 10. Application Services

- `MaintenanceSchedulesService`: Manages preventive maintenance plans and visit recurrences.

## 11. Repository Contracts

- `MaintenanceScheduleRepository`: `findById()`, `findByNumber()`, `findMany()`, `save()`, `generateNextScheduleNumber()`.

## 12. Domain Invariants

- `customerId` and `assetName` are required.
- Next visit date must be updated automatically upon visit completion based on `frequency`.
- Cancelled schedules cannot be re-activated.

## 13. State Machine

```text
[ ACTIVE ] ──> (Pause) ──> [ PAUSED ] ──> (Resume) ──> [ ACTIVE ]
    │                                                      │
    ├──> (Complete Plan) ──────────────────────────────────┼─► [ COMPLETED ]
    │                                                      │
    └──> (Cancel) ─────────────────────────────────────────┴─> [ CANCELLED ]
```

## 14. Sequence Diagrams

```text
Technician -> MaintenanceSchedulesService: completeVisit(id)
MaintenanceSchedulesService -> MaintenanceSchedule: completeVisit()
MaintenanceSchedule -> MaintenanceSchedule: calculateNextVisitDate()
MaintenanceSchedulesService -> MaintenanceScheduleRepository: save(schedule)
```

## 15. Cross-Module Integration

- References `customerId` from `@ananya/crm` / `@ananya/sales`.
- Generates work orders or service requests as needed via `ServiceRequestsService` / `WorkOrdersService`.

## 16. Database Schema

- Table `maintenance_schedules`: `id`, `schedule_number`, `customer_id`, `asset_name`, `serial_number`, `frequency`, `next_visit_date`, `assigned_technician`, `status`, `notes`, `created_at`, `updated_at`.

## 17. API Design

- `POST /maintenance-schedules`
- `GET /maintenance-schedules`
- `GET /maintenance-schedules/:id`
- `POST /maintenance-schedules/:id/pause`
- `POST /maintenance-schedules/:id/resume`
- `POST /maintenance-schedules/:id/complete-visit`
- `POST /maintenance-schedules/:id/cancel`

## 18. UI Workflow

- `/maintenance`: Preventive maintenance calendar, asset list, and visit completion trigger interface.

## 19. Validation Rules

- DTO validation via `class-validator`.

## 20. Future Extensions

- Automated IoT asset telemetry integration triggering predictive maintenance alerts.

# RFC-0044: Time Tracking

- **Status**: Accepted
- **Author**: Ananya ERP Core Team
- **Created**: 2026-07-25

## 1. Purpose
Define the TimeEntry aggregate root, daily/weekly hour logging, description attachment, and manager approval lifecycle.

## 2. Scope
Covers time entry submission against assigned tasks, hour validation, approval workflow, and actual hour aggregation.

## 3. Ubiquitous Language
- **Time Entry**: A record of actual hours worked by a user on a specific task on a specific date.
- **Approval Lifecycle**: Transition of logged hours from SUBMITTED to APPROVED or REJECTED.

## 4. Aggregate Roots
- `TimeEntry`: Aggregate root managing user, date, hours, task reference, description, and status.

## 5. Entities
- None.

## 6. Value Objects
- `TimeEntryStatus`: `'SUBMITTED' | 'APPROVED' | 'REJECTED'`

## 7. Commands
- `CreateTimeEntryCommand`: Creates a new TimeEntry in status `SUBMITTED`.
- `ApproveTimeEntryCommand`: Transitions status to `APPROVED` and updates task `actualHours`.
- `RejectTimeEntryCommand`: Transitions status to `REJECTED`.

## 8. Queries
- `FindTimeEntryByIdQuery`
- `ListTimeEntriesQuery` (filters by user, task, project, date range, status)

## 9. Domain Services
- None.

## 10. Application Services
- `TimeEntriesService`: Application coordinator for time entries and task hour aggregation.

## 11. Repository Contracts
- `TimeEntryRepository`: `findById()`, `findMany()`, `save()`.

## 12. Domain Invariants
- `hours` must be > 0 and <= 24 per entry.
- Time Entries require an existing Task in status `TODO`, `IN_PROGRESS`, or `BLOCKED`.
- Completed (`DONE`) or `CANCELLED` tasks cannot receive new time entries.

## 13. State Machine
```text
[ SUBMITTED ] ──> (Approve) ──> [ APPROVED ]
      │
      └──> (Reject) ─────> [ REJECTED ]
```

## 14. Sequence Diagram
```text
User ──> TimeEntriesController ──> TimeEntriesService ──> TimeEntry.approve() ──> Task.addActualHours() ──> TimeEntryRepository.save()
```

## 15. Cross-Module Integration
Approved time entries provide exact labor hour data for project post-mortems and commercial billing verification.

## 16. Database Schema
Table: `time_entries` (id, user_id, task_id, date, hours, description, status, approved_by, created_at, updated_at).

## 17. API Design
- `POST /time-entries`
- `GET /time-entries`
- `GET /time-entries/:id`
- `POST /time-entries/:id/approve`
- `POST /time-entries/:id/reject`

## 18. UI Workflow
- `/time`: Timesheet entry page with weekly calendar grid, task selection dropdown, hour input, and approval queue for team leads.

## 19. Validation Rules
- `taskId`, `userId`, and `date` are required.
- `hours` must be > 0.

## 20. Future Extensions
- Automated timer widget and mobile timesheet sync.

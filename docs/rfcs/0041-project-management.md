# RFC-0041: Project Management

- **Status**: Accepted
- **Author**: Ananya ERP Core Team
- **Created**: 2026-07-25

## 1. Purpose
Define the architectural design, ubiquitous language, state machine, and domain boundaries for Project Management within the Projects bounded context of Ananya ERP.

## 2. Scope
Covers project initiation, project manager assignment, status transitions, target date tracking, and operational work orchestration.

## 3. Ubiquitous Language
- **Project**: An operational workspace and container coordinating deliverable work, milestones, tasks, and time entries after a commercial sale.
- **Project Manager**: The designated team member responsible for project delivery.
- **Sales Order Reference**: The commercial transaction in `@ananya/sales` that initiated the project.

## 4. Aggregate Roots
- `Project`: Aggregate root maintaining project metadata, customer reference, sales order reference, dates, priority, and status lifecycle.

## 5. Entities
- `Milestone` (defined in RFC-0042).

## 6. Value Objects
- `ProjectStatus`: `'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED'`
- `ProjectPriority`: `'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'`

## 7. Commands
- `CreateProjectCommand`: Initializes a new Project in status `PLANNING`.
- `StartProjectCommand`: Transitions status to `ACTIVE`.
- `PauseProjectCommand`: Transitions status to `ON_HOLD`.
- `CompleteProjectCommand`: Transitions status to `COMPLETED`.
- `CancelProjectCommand`: Transitions status to `CANCELLED`.

## 8. Queries
- `FindProjectByIdQuery`
- `ListProjectsQuery` (filters by status, customer, project manager, priority)

## 9. Domain Services
- None.

## 10. Application Services
- `ProjectsService`: Application coordinator for project aggregate operations.

## 11. Repository Contracts
- `ProjectRepository`: `findById()`, `findByNumber()`, `findMany()`, `save()`, `generateNextProjectNumber()`.

## 12. Domain Invariants
- `name`, `customerId`, and `salesOrderId` are required.
- Target completion date must be on or after start date.
- Completed or Cancelled projects cannot be re-opened or receive new tasks.

## 13. State Machine
```text
[ PLANNING ] ──> (Start) ──> [ ACTIVE ] ──> (Complete) ──> [ COMPLETED ]
      │                         │
      │                         ├──> (Pause) ──> [ ON_HOLD ] ──> (Resume/Start) ──> [ ACTIVE ]
      │                         │
      └──> (Cancel) ────────────┴─> [ CANCELLED ]
```

## 14. Sequence Diagram
```text
User ──> ProjectsController ──> ProjectsService ──> Project.start() ──> ProjectRepository.save()
```

## 15. Cross-Module Integration
Projects reference `customerId` from `@ananya/sales` and `salesOrderId` from `@ananya/sales`.

## 16. Database Schema
Table: `projects` (id, project_number, name, customer_id, sales_order_id, project_manager, start_date, target_completion_date, priority, status, created_at, updated_at).

## 17. API Design
- `POST /projects`
- `GET /projects`
- `GET /projects/:id`
- `POST /projects/:id/start`
- `POST /projects/:id/pause`
- `POST /projects/:id/complete`
- `POST /projects/:id/cancel`

## 18. UI Workflow
- `/projects`: Project list view with status filter, manager filter, and project creation modal.
- `/projects/[id]`: Project detail workspace displaying milestones, task list, and status controls.

## 19. Validation Rules
- `name` is required.
- `customerId` and `salesOrderId` must be non-empty string UUIDs.

## 20. Future Extensions
- Project budget tracking and earn-value financial management.

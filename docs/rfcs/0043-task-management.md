# RFC-0043: Task Management

- **Status**: Accepted
- **Author**: Ananya ERP Core Team
- **Created**: 2026-07-25

## 1. Purpose

Define the Task aggregate root, user assignments, task status transitions, and hour estimation logic.

## 2. Scope

Covers standalone Task management across projects, assigned users, priority tracking, and status lifecycle.

## 3. Ubiquitous Language

- **Task**: A discrete unit of work assigned to a team member within a Project.
- **Assigned User**: The individual responsible for executing the task.
- **Estimated Hours**: Target work duration in hours.
- **Actual Hours**: Accumulated logged time from approved Time Entries.

## 4. Aggregate Roots

- `Task`: Aggregate root managing title, description, assigned user, status, priority, and logged hours.

## 5. Entities

- None.

## 6. Value Objects

- `TaskStatus`: `'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CANCELLED'`
- `TaskPriority`: `'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'`

## 7. Commands

- `CreateTaskCommand`: Initializes a new Task in status `TODO`.
- `AssignTaskCommand`: Updates assigned user.
- `StartTaskCommand`: Transitions status to `IN_PROGRESS`.
- `BlockTaskCommand`: Transitions status to `BLOCKED`.
- `CompleteTaskCommand`: Transitions status to `DONE`.
- `CancelTaskCommand`: Transitions status to `CANCELLED`.

## 8. Queries

- `FindTaskByIdQuery`
- `ListTasksQuery` (filters by project, assigned user, status, priority)

## 9. Domain Services

- None.

## 10. Application Services

- `TasksService`: Application service coordinating task operations.

## 11. Repository Contracts

- `TaskRepository`: `findById()`, `findByNumber()`, `findMany()`, `save()`, `generateNextTaskNumber()`.

## 12. Domain Invariants

- Task requires a valid `projectId` and `title`.
- `estimatedHours` must be non-negative.
- Completed (`DONE`) or `CANCELLED` tasks cannot receive new time entries.

## 13. State Machine

```text
[ TODO ] ──> (Start) ──> [ IN_PROGRESS ] ──> (Complete) ──> [ DONE ]
   │                           │
   │                           ├──> (Block) ──> [ BLOCKED ] ──> (Unblock/Start) ──> [ IN_PROGRESS ]
   │                           │
   └──> (Cancel) ──────────────┴─> [ CANCELLED ]
```

## 14. Sequence Diagram

```text
User ──> TasksController ──> TasksService ──> Task.start() ──> TaskRepository.save()
```

## 15. Cross-Module Integration

Tasks link operational work items to Project milestones and provide targets for time tracking.

## 16. Database Schema

Tables:

- `project_tasks` (id, task_number, project_id, title, description, assigned_user, estimated_hours, actual_hours, priority, status, created_at, updated_at).
- `task_assignments` (id, task_id, user_id, assigned_at).

## 17. API Design

- `POST /tasks`
- `GET /tasks`
- `GET /tasks/:id`
- `POST /tasks/:id/assign`
- `POST /tasks/:id/start`
- `POST /tasks/:id/block`
- `POST /tasks/:id/complete`
- `POST /tasks/:id/cancel`

## 18. UI Workflow

- `/tasks`: Cross-project Task Board (Kanban view & tabular list).
- `/tasks/[id]`: Task details, assignee selector, logged time log, and status controls.

## 19. Validation Rules

- `title` is required.
- `estimatedHours` must be >= 0.

## 20. Future Extensions

- Checklist sub-items per task and task dependencies.

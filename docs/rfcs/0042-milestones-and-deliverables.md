# RFC-0042: Milestones & Deliverables

- **Status**: Accepted
- **Author**: Ananya ERP Core Team
- **Created**: 2026-07-25

## 1. Purpose
Define the domain structure, lifecycle, and completion percentage calculation for Milestones embedded within Projects.

## 2. Scope
Covers Milestone entity creation, due date management, progress tracking, and contribution to overall project completion.

## 3. Ubiquitous Language
- **Milestone**: A key deliverable or checkpoint date within a Project.
- **Completion Percentage**: Weighted progress score assigned to a milestone (0 to 100%).

## 4. Aggregate Roots
- `Project`: Aggregate root that owns and encapsulates `Milestone` entities.

## 5. Entities
- `Milestone`: Child entity belonging to a `Project`.

## 6. Value Objects
- `MilestoneStatus`: `'OPEN' | 'COMPLETED'`

## 7. Commands
- `AddMilestoneCommand`: Adds a milestone deliverable to a project.
- `CompleteMilestoneCommand`: Marks milestone as completed (sets progress to 100%).
- `ReopenMilestoneCommand`: Reopens a completed milestone.

## 8. Queries
- `ListProjectMilestonesQuery`

## 9. Domain Services
- None.

## 10. Application Services
- `ProjectsService`: Manages milestone operations on the `Project` aggregate.

## 11. Repository Contracts
- Inter-entity persistence via `ProjectRepository`.

## 12. Domain Invariants
- Each milestone must have a valid non-empty `name` and `dueDate`.
- `completionPercentage` must be between 0 and 100.
- Milestones cannot be added to `COMPLETED` or `CANCELLED` projects.

## 13. State Machine
```text
[ OPEN ] ──> (Complete) ──> [ COMPLETED ] ──> (Reopen) ──> [ OPEN ]
```

## 14. Sequence Diagram
```text
User ──> ProjectsController ──> ProjectsService ──> Project.addMilestone() ──> ProjectRepository.save()
```

## 15. Cross-Module Integration
Milestones provide progress indicators for commercial delivery to Sales managers.

## 16. Database Schema
Table: `project_milestones` (id, project_id, name, due_date, status, completion_percentage, created_at, updated_at).

## 17. API Design
- `POST /projects/:id/milestones`
- `POST /projects/:id/milestones/:milestoneId/complete`
- `POST /projects/:id/milestones/:milestoneId/reopen`

## 18. UI Workflow
- Embedded Gantt-style milestone view on `/projects/[id]` with visual progress bar and completion checkmarks.

## 19. Validation Rules
- `name` is required.
- `dueDate` must be a valid date string.

## 20. Future Extensions
- Automated milestone dependencies and critical path calculation.

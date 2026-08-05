# RFC-0039: Activities & Notes

- **Status**: Accepted
- **Author**: Ananya ERP Core Team
- **Created**: 2026-07-25

## 1. Purpose

Define the activity logging, scheduling, task tracking, and rich text note attachment subsystem for CRM entities.

## 2. Scope

Covers Activity aggregate and Note entity across Leads, Accounts, Opportunities, and Activities.

## 3. Ubiquitous Language

- **Activity**: A scheduled or completed touchpoint (Call, Meeting, Email, Task, Demo) with a lead or account.
- **Note**: A freeform text comment or timestamped observation attached to a CRM record.

## 4. Aggregate Roots

- `Activity`: Aggregate root representing a scheduled or logged activity item.

## 5. Entities

- `Note`: Timestamped note entry.

## 6. Value Objects

- `ActivityType`: `'CALL' | 'MEETING' | 'EMAIL' | 'TASK' | 'DEMO'`
- `ActivityStatus`: `'SCHEDULED' | 'COMPLETED' | 'CANCELLED'`

## 7. Commands

- `CreateActivityCommand`: Schedules a new activity.
- `CompleteActivityCommand`: Marks activity as completed.
- `CreateNoteCommand`: Attaches a note to a CRM entity.

## 8. Queries

- `ListActivitiesQuery` (filters by type, owner, status, related record)
- `ListNotesQuery` (filters by entity type and entity ID)

## 9. Domain Services

- None.

## 10. Application Services

- `ActivitiesService`: Activity management.
- `NotesService`: Note attachment management.

## 11. Repository Contracts

- `ActivityRepository`: `findById()`, `findMany()`, `save()`.
- `NoteRepository`: `findById()`, `findMany()`, `save()`.

## 12. Domain Invariants

- An Activity must specify a valid owner and type.
- Notes must be associated with a non-empty body and valid parent entity reference (`leadId`, `crmAccountId`, `opportunityId`, or `activityId`).

## 13. State Machine

```text
[ SCHEDULED ] ──> (Complete) ──> [ COMPLETED ]
      │
      └──> (Cancel) ────> [ CANCELLED ]
```

## 14. Sequence Diagram

```text
User ──> ActivitiesController ──> ActivitiesService ──> Activity.complete() ──> ActivityRepository.save()
```

## 15. Cross-Module Integration

Activities and Notes provide audit and interaction timelines across CRM records.

## 16. Database Schema

- `crm_activities` (id, type, subject, due_date, owner, status, related_lead_id, related_opportunity_id, related_account_id, created_at, updated_at).
- `crm_notes` (id, author, body, lead_id, crm_account_id, opportunity_id, activity_id, created_at, updated_at).

## 17. API Design

- `POST /activities`
- `GET /activities`
- `POST /activities/:id/complete`
- `POST /notes`
- `GET /notes`

## 18. UI Workflow

- `/activities`: Activity calendar & task queue list.
- Embedded activity & note timeline widgets on `/leads/[id]`, `/accounts/[id]`, `/opportunities/[id]`.

## 19. Validation Rules

- `subject` and `type` required for Activity.
- `body` required for Note.

## 20. Future Extensions

- Automated calendar sync (iCal / Google Calendar integration).

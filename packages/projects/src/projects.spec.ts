import { describe, it, expect } from 'vitest';
import { Project } from './projects/project';
import { Task } from './tasks/task';
import { TimeEntry } from './time/time-entry';

describe('Projects Bounded Context Aggregates', () => {
  describe('Project Aggregate', () => {
    it('should create a project in PLANNING status and transition through lifecycle', () => {
      const project = Project.create({
        projectNumber: 'PRJ-2026-0001',
        name: 'Enterprise ERP Implementation',
        customerId: 'cust-100',
        salesOrderId: 'so-200',
        projectManager: 'pm-alice',
        startDate: new Date('2026-08-01'),
        targetCompletionDate: new Date('2026-12-31'),
        priority: 'HIGH',
      });

      expect(project.status).toBe('PLANNING');
      expect(project.milestones.length).toBe(0);

      project.start();
      expect(project.status).toBe('ACTIVE');

      const milestone = project.addMilestone({
        name: 'Phase 1: Architecture Review',
        dueDate: new Date('2026-09-01'),
        completionPercentage: 25,
      });

      expect(milestone.status).toBe('OPEN');
      expect(project.milestones.length).toBe(1);

      project.completeMilestone(milestone.id);
      expect(project.milestones[0]?.status).toBe('COMPLETED');
      expect(project.milestones[0]?.completionPercentage).toBe(100);

      project.complete();
      expect(project.status).toBe('COMPLETED');
    });

    it('should throw error when target completion date is before start date', () => {
      expect(() =>
        Project.create({
          projectNumber: 'PRJ-2026-0002',
          name: 'Invalid Dates Project',
          customerId: 'cust-100',
          salesOrderId: 'so-200',
          projectManager: 'pm-bob',
          startDate: new Date('2026-10-01'),
          targetCompletionDate: new Date('2026-09-01'),
        }),
      ).toThrow();
    });
  });

  describe('Task Aggregate', () => {
    it('should manage task assignments, status changes, and actual hours', () => {
      const task = Task.create({
        taskNumber: 'TSK-2026-0001',
        projectId: 'prj-10',
        title: 'Configure DB Schemas',
        assignedUser: 'dev-charlie',
        estimatedHours: 16,
      });

      expect(task.status).toBe('TODO');
      expect(task.actualHours).toBe(0);
      expect(task.assignments.length).toBe(1);

      task.start();
      expect(task.status).toBe('IN_PROGRESS');

      task.addActualHours(8);
      expect(task.actualHours).toBe(8);

      task.complete();
      expect(task.status).toBe('DONE');
    });

    it('should throw error when adding actual hours to a completed task', () => {
      const task = Task.create({
        taskNumber: 'TSK-2026-0002',
        projectId: 'prj-10',
        title: 'Draft Documentation',
        estimatedHours: 4,
      });

      task.complete();
      expect(() => task.addActualHours(2)).toThrow();
    });
  });

  describe('TimeEntry Aggregate', () => {
    it('should log time entry and process approval', () => {
      const timeEntry = TimeEntry.create({
        userId: 'dev-charlie',
        taskId: 'tsk-100',
        date: new Date('2026-08-05'),
        hours: 6.5,
        description: 'Implemented Drizzle schema migrations for Projects context.',
      });

      expect(timeEntry.status).toBe('SUBMITTED');
      expect(timeEntry.hours).toBe(6.5);

      timeEntry.approve('pm-alice');
      expect(timeEntry.status).toBe('APPROVED');
      expect(timeEntry.approvedBy).toBe('pm-alice');
    });

    it('should throw error when hours exceed 24 hours per entry', () => {
      expect(() =>
        TimeEntry.create({
          userId: 'dev-charlie',
          taskId: 'tsk-100',
          date: new Date('2026-08-05'),
          hours: 25,
        }),
      ).toThrow();
    });
  });
});

import { describe, it, expect } from "vitest";
import { Project } from "./projects/project";
import { Task } from "./tasks/task";
import { TimeEntry } from "./time/time-entry";

describe("Projects Bounded Context Aggregates", () => {
  describe("Project Aggregate", () => {
    it("should create a project in PLANNING status and transition through lifecycle", () => {
      const project = Project.create({
        projectNumber: "PRJ-2026-0001",
        name: "Enterprise ERP Implementation",
        customerId: "cust-100",
        salesOrderId: "so-200",
        projectManager: "pm-alice",
        startDate: new Date("2026-08-01"),
        targetCompletionDate: new Date("2026-12-31"),
        priority: "HIGH",
      });

      expect(project.status).toBe("PLANNING");
      expect(project.milestones.length).toBe(0);

      project.start();
      expect(project.status).toBe("ACTIVE");

      const milestone = project.addMilestone({
        name: "Phase 1: Architecture Review",
        dueDate: new Date("2026-09-01"),
        completionPercentage: 25,
      });

      expect(milestone.status).toBe("OPEN");
      expect(project.milestones.length).toBe(1);

      project.completeMilestone(milestone.id);
      expect(project.milestones[0]?.status).toBe("COMPLETED");
      expect(project.milestones[0]?.completionPercentage).toBe(100);

      project.complete();
      expect(project.status).toBe("COMPLETED");
    });

    it("should throw error when target completion date is before start date", () => {
      expect(() =>
        Project.create({
          projectNumber: "PRJ-2026-0002",
          name: "Invalid Dates Project",
          customerId: "cust-100",
          salesOrderId: "so-200",
          projectManager: "pm-bob",
          startDate: new Date("2026-10-01"),
          targetCompletionDate: new Date("2026-09-01"),
        }),
      ).toThrow();
    });
  });

  describe("Task Aggregate", () => {
    it("should manage task assignments, status changes, and actual hours", () => {
      const task = Task.create({
        taskNumber: "TSK-2026-0001",
        projectId: "prj-10",
        title: "Configure DB Schemas",
        assignedUser: "dev-charlie",
        estimatedHours: 16,
      });

      expect(task.status).toBe("TODO");
      expect(task.actualHours).toBe(0);
      expect(task.assignments.length).toBe(1);

      task.start();
      expect(task.status).toBe("IN_PROGRESS");

      task.addActualHours(8);
      expect(task.actualHours).toBe(8);

      task.complete();
      expect(task.status).toBe("DONE");
    });

    it("should throw error when adding actual hours to a completed task", () => {
      const task = Task.create({
        taskNumber: "TSK-2026-0002",
        projectId: "prj-10",
        title: "Draft Documentation",
        estimatedHours: 4,
      });

      task.complete();
      expect(() => task.addActualHours(2)).toThrow();
    });
  });

  describe("TimeEntry Aggregate", () => {
    it("should log time entry and process approval", () => {
      const timeEntry = TimeEntry.create({
        userId: "dev-charlie",
        taskId: "tsk-100",
        date: new Date("2026-08-05"),
        hours: 6.5,
        description:
          "Implemented Drizzle schema migrations for Projects context.",
      });

      expect(timeEntry.status).toBe("SUBMITTED");
      expect(timeEntry.hours).toBe(6.5);

      timeEntry.approve("pm-alice");
      expect(timeEntry.status).toBe("APPROVED");
      expect(timeEntry.approvedBy).toBe("pm-alice");
    });

    it("should throw error when hours exceed 24 hours per entry", () => {
      expect(() =>
        TimeEntry.create({
          userId: "dev-charlie",
          taskId: "tsk-100",
          date: new Date("2026-08-05"),
          hours: 25,
        }),
      ).toThrow();
    });
  });

  describe("Project Materials & Activity Log", () => {
    it("should record actual user in activity log on create, update, lifecycle, and material actions", () => {
      const project = Project.create({
        projectNumber: "PRJ-2026-0003",
        name: "Solar Farm Substation Control",
        projectManager: "Arun K",
        owner: "Sarath JR",
        startDate: new Date("2026-09-01"),
        targetCompletionDate: new Date("2026-12-01"),
        performedBy: "Sarath JR",
      });

      expect(project.activities[0]?.performedBy).toBe("Sarath JR");
      expect(project.activities[0]?.activityType).toBe("CREATED");

      project.update(
        { description: "High-priority installation" },
        "Sarath JR",
      );
      expect(
        project.activities[project.activities.length - 1]?.performedBy,
      ).toBe("Sarath JR");

      project.start("Sarath JR");
      expect(
        project.activities[project.activities.length - 1]?.performedBy,
      ).toBe("Sarath JR");

      project.allocateMaterial(
        "comp-1",
        "loc-bin-1",
        50,
        "pcs",
        "Initial reserve",
        "Sarath JR",
      );
      const allocActivity = project.activities[project.activities.length - 1];
      expect(allocActivity?.performedBy).toBe("Sarath JR");
      expect(allocActivity?.activityType).toBe("MATERIAL_ALLOCATED");

      project.issueMaterial("comp-1", "loc-bin-1", 30, "Sarath JR");
      const issueActivity = project.activities[project.activities.length - 1];
      expect(issueActivity?.performedBy).toBe("Sarath JR");
      expect(issueActivity?.activityType).toBe("MATERIAL_ISSUED");

      project.returnMaterial("comp-1", "loc-bin-1", 10, "Sarath JR");
      const returnActivity = project.activities[project.activities.length - 1];
      expect(returnActivity?.performedBy).toBe("Sarath JR");
      expect(returnActivity?.activityType).toBe("MATERIAL_RETURNED");

      const mat = project.materials[0];
      expect(mat?.allocatedQuantity).toBe(50);
      expect(mat?.issuedQuantity).toBe(30);
      expect(mat?.returnedQuantity).toBe(10);
    });

    it("should enforce quantity constraints on issue and return", () => {
      const project = Project.create({
        projectNumber: "PRJ-2026-0004",
        name: "Constraint Test Project",
        projectManager: "PM",
        startDate: new Date("2026-09-01"),
        targetCompletionDate: new Date("2026-12-01"),
      });

      project.start("User");
      project.allocateMaterial("comp-1", "loc-1", 20, "pcs", undefined, "User");

      // Cannot issue more than allocated (20)
      expect(() => project.issueMaterial("comp-1", "loc-1", 25, "User")).toThrow();

      // Issue 15
      project.issueMaterial("comp-1", "loc-1", 15, "User");

      // Cannot issue more than remaining unissued (20 - 15 = 5)
      expect(() => project.issueMaterial("comp-1", "loc-1", 10, "User")).toThrow();

      // Cannot return more than net issued (15)
      expect(() => project.returnMaterial("comp-1", "loc-1", 20, "User")).toThrow();

      // Return 5
      project.returnMaterial("comp-1", "loc-1", 5, "User");

      // Net issued is now 10, remaining unissued is now 20 - 10 = 10
      expect(() => project.issueMaterial("comp-1", "loc-1", 10, "User")).not.toThrow();
    });
  });
});

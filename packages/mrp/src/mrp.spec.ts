import { describe, it, expect } from "vitest";
import {
  PlanningRun,
  MaterialRequirement,
  PurchaseRecommendation,
  ProductionRecommendation,
  CapacityPlan,
  PlanningMessage,
} from "./index";

describe("MRP Domain Aggregates & Invariants", () => {
  it("should create and transition PlanningRun lifecycle", () => {
    const run = PlanningRun.create({
      runNumber: "MRP-2026-0001",
      horizonDays: 30,
      startedBy: "planner-alice",
    });

    expect(run.runNumber).toBe("MRP-2026-0001");
    expect(run.status).toBe("DRAFT");

    run.start();
    expect(run.status).toBe("RUNNING");

    run.complete();
    expect(run.status).toBe("COMPLETED");
    expect(run.completedAt).toBeDefined();
  });

  it("should calculate net shortage correctly in MaterialRequirement", () => {
    const req = MaterialRequirement.create({
      planningRunId: "run-123",
      componentId: "comp-microcontroller",
      requiredQuantity: 100,
      availableQuantity: 40,
      reservedQuantity: 10,
      requiredDate: new Date("2026-08-15"),
      source: "SALES_ORDER",
      sourceReferenceId: "so-99",
    });

    // Available (40) - Reserved (10) = Net Available (30)
    // Required (100) - Net Available (30) = Shortage (70)
    expect(req.shortageQuantity).toBe(70);
  });

  it("should manage PurchaseRecommendation acceptance", () => {
    const rec = PurchaseRecommendation.create({
      planningRunId: "run-123",
      componentId: "comp-microcontroller",
      supplierId: "supp-acme",
      suggestedQuantity: 70,
      requiredDate: new Date("2026-08-15"),
      recommendationReason: "Net shortage of 70 units derived from SO-99.",
    });

    expect(rec.status).toBe("PENDING");

    rec.accept();
    expect(rec.status).toBe("ACCEPTED");

    rec.markImplemented();
    expect(rec.status).toBe("IMPLEMENTED");
  });

  it("should manage ProductionRecommendation start & completion invariants", () => {
    const rec = ProductionRecommendation.create({
      planningRunId: "run-123",
      productId: "prod-controller-box",
      suggestedQuantity: 50,
      suggestedStart: new Date("2026-08-01"),
      suggestedCompletion: new Date("2026-08-10"),
      manufacturingRoute: "ROUTE-STANDARD-A",
    });

    expect(rec.status).toBe("PENDING");
    rec.accept();
    expect(rec.status).toBe("ACCEPTED");

    expect(() =>
      ProductionRecommendation.create({
        planningRunId: "run-123",
        productId: "prod-controller-box",
        suggestedQuantity: 50,
        suggestedStart: new Date("2026-08-10"),
        suggestedCompletion: new Date("2026-08-01"), // Invalid: start after completion
      }),
    ).toThrow();
  });

  it("should compute capacity utilization and flag overload in CapacityPlan", () => {
    const planNormal = CapacityPlan.create({
      planningRunId: "run-123",
      workCenterId: "wc-cnc-milling",
      workCenterName: "CNC Milling Line 1",
      availableCapacityHours: 160,
      plannedCapacityHours: 120,
    });

    expect(planNormal.utilizationPercentage).toBe(75);
    expect(planNormal.isOverloaded).toBe(false);

    const planOverloaded = CapacityPlan.create({
      planningRunId: "run-123",
      workCenterId: "wc-cnc-milling",
      workCenterName: "CNC Milling Line 1",
      availableCapacityHours: 160,
      plannedCapacityHours: 200,
    });

    expect(planOverloaded.utilizationPercentage).toBe(125);
    expect(planOverloaded.isOverloaded).toBe(true);
  });

  it("should log PlanningMessage entry", () => {
    const msg = PlanningMessage.create({
      planningRunId: "run-123",
      severity: "WARNING",
      message: "Work Center CNC Milling Line 1 is overloaded (125%).",
    });

    expect(msg.severity).toBe("WARNING");
    expect(msg.message).toContain("125%");
  });
});

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

/**
 * The API returns these aggregates directly from NestJS controllers, so
 * `JSON.stringify` output IS the wire contract. Private storage fields must
 * never leak and every public getter must be present.
 */
describe("MRP API serialization contract", () => {
  function jsonOf(entity: unknown): Record<string, unknown> {
    return JSON.parse(JSON.stringify(entity)) as Record<string, unknown>;
  }

  function expectPublicContract(
    entity: unknown,
    expectedKeys: string[],
  ): Record<string, unknown> {
    const json = jsonOf(entity);

    const leakedPrivateKeys = Object.keys(json).filter((key) =>
      key.startsWith("_"),
    );
    expect(leakedPrivateKeys).toEqual([]);

    for (const key of expectedKeys) {
      expect(json).toHaveProperty(key);
      expect(json[key]).not.toBeUndefined();
    }

    return json;
  }

  it("serializes a PlanningRun with public field names", () => {
    const run = PlanningRun.create({
      runNumber: "MRP-2026-0042",
      horizonDays: 30,
      startedBy: "planner-alice",
    });
    run.start();
    run.complete();

    const json = expectPublicContract(run, [
      "id",
      "runNumber",
      "horizonDays",
      "status",
      "startedBy",
      "completedAt",
      "createdAt",
      "updatedAt",
    ]);

    expect(json.runNumber).toBe("MRP-2026-0042");
    expect(json.horizonDays).toBe(30);
    expect(json.status).toBe("COMPLETED");
    expect(typeof json.completedAt).toBe("string");
  });

  it("serializes a PlanningMessage without blank fields", () => {
    const msg = PlanningMessage.create({
      planningRunId: "run-123",
      severity: "INFO",
      message: "Generated 3 requirements.",
    });

    const json = expectPublicContract(msg, [
      "id",
      "planningRunId",
      "severity",
      "message",
      "createdAt",
    ]);

    expect(json.severity).toBe("INFO");
    expect(json.message).toBe("Generated 3 requirements.");
    expect(typeof json.createdAt).toBe("string");
  });

  it("serializes a MaterialRequirement with netted quantities", () => {
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

    const json = expectPublicContract(req, [
      "id",
      "planningRunId",
      "componentId",
      "requiredQuantity",
      "availableQuantity",
      "reservedQuantity",
      "shortageQuantity",
      "requiredDate",
      "source",
      "sourceReferenceId",
      "createdAt",
    ]);

    expect(json.requiredQuantity).toBe(100);
    expect(json.shortageQuantity).toBe(70);
  });

  it("serializes a PurchaseRecommendation with reason and status", () => {
    const rec = PurchaseRecommendation.create({
      planningRunId: "run-123",
      componentId: "comp-microcontroller",
      suggestedQuantity: 70,
      requiredDate: new Date("2026-08-15"),
      recommendationReason: "Net shortage of 70 units derived from SO-99.",
    });

    const json = expectPublicContract(rec, [
      "id",
      "planningRunId",
      "componentId",
      "suggestedQuantity",
      "requiredDate",
      "recommendationReason",
      "status",
      "createdAt",
      "updatedAt",
    ]);

    expect(json.status).toBe("PENDING");
    expect(json.suggestedQuantity).toBe(70);
  });

  it("serializes a ProductionRecommendation with schedule fields", () => {
    const rec = ProductionRecommendation.create({
      planningRunId: "run-123",
      productId: "prod-controller-box",
      suggestedQuantity: 50,
      suggestedStart: new Date("2026-08-01"),
      suggestedCompletion: new Date("2026-08-10"),
    });

    const json = expectPublicContract(rec, [
      "id",
      "planningRunId",
      "productId",
      "suggestedQuantity",
      "suggestedStart",
      "suggestedCompletion",
      "status",
      "createdAt",
      "updatedAt",
    ]);

    expect(json.productId).toBe("prod-controller-box");
    expect(json.suggestedQuantity).toBe(50);
  });

  it("serializes a CapacityPlan with utilization fields", () => {
    const plan = CapacityPlan.create({
      planningRunId: "run-123",
      workCenterId: "wc-cnc-milling",
      workCenterName: "CNC Milling Line 1",
      availableCapacityHours: 160,
      plannedCapacityHours: 200,
    });

    const json = expectPublicContract(plan, [
      "id",
      "planningRunId",
      "workCenterId",
      "workCenterName",
      "availableCapacityHours",
      "plannedCapacityHours",
      "utilizationPercentage",
      "isOverloaded",
      "createdAt",
    ]);

    expect(json.utilizationPercentage).toBe(125);
    expect(json.isOverloaded).toBe(true);
  });
});

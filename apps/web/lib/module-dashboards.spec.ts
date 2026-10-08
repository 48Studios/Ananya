import { describe, it, expect } from "vitest";
import { navigationModules } from "./navigation/navigation-config";

describe("Module Dashboards Navigation Canonical Naming", () => {
  it("uses canonical dashboard titles in navigation config", () => {
    const invModule = navigationModules.find((m) => m.id === "inventory");
    const procModule = navigationModules.find((m) => m.id === "procurement");
    const mfgModule = navigationModules.find((m) => m.id === "manufacturing");

    expect(invModule).toBeDefined();
    expect(procModule).toBeDefined();
    expect(mfgModule).toBeDefined();

    const invDashboardItem = invModule?.sidebar
      .flatMap((s) => s.items || [])
      .find((item) => item.href === "/inventory");
    expect(invDashboardItem?.title).toBe("Inventory Dashboard");
    expect(invDashboardItem?.id).toBe("inv-overview");

    const procDashboardItem = procModule?.sidebar
      .flatMap((s) => s.items || [])
      .find((item) => item.href === "/procurement");
    expect(procDashboardItem?.title).toBe("Procurement Dashboard");
    expect(procDashboardItem?.id).toBe("proc-overview");

    const mfgDashboardItem = mfgModule?.sidebar
      .flatMap((s) => s.items || [])
      .find((item) => item.href === "/manufacturing");
    expect(mfgDashboardItem?.title).toBe("Manufacturing Dashboard");
    expect(mfgDashboardItem?.id).toBe("mfg-overview");
  });
});

describe("Inventory Dashboard Calculations", () => {
  it("calculates stock quantities correctly across transaction types", () => {
    const transactions = [
      { componentId: "c1", quantity: 50, transactionType: "InitialStock" },
      { componentId: "c1", quantity: 20, transactionType: "Receipt" },
      { componentId: "c1", quantity: 15, transactionType: "Issue" },
      { componentId: "c1", quantity: 5, transactionType: "Consumption" },
      { componentId: "c1", quantity: -2, transactionType: "Adjustment" },
      { componentId: "c2", quantity: 10, transactionType: "Receipt" },
      { componentId: "c2", quantity: 10, transactionType: "Issue" },
    ];

    const stockMap: Record<string, number> = {};
    for (const tx of transactions) {
      const qty = Number(tx.quantity) || 0;
      const current = stockMap[tx.componentId] ?? 0;
      if (["Receipt", "Return", "Production", "InitialStock"].includes(tx.transactionType)) {
        stockMap[tx.componentId] = current + qty;
      } else if (["Issue", "Consumption"].includes(tx.transactionType)) {
        stockMap[tx.componentId] = current - qty;
      } else if (tx.transactionType === "Adjustment") {
        stockMap[tx.componentId] = current + qty;
      }
    }

    // c1: 50 + 20 - 15 - 5 - 2 = 48
    expect(stockMap["c1"]).toBe(48);
    // c2: 10 - 10 = 0
    expect(stockMap["c2"]).toBe(0);
  });

  it("identifies out-of-stock and low-stock items based on threshold", () => {
    const stockMap: Record<string, number> = {
      "c-zero": 0,
      "c-negative": -1,
      "c-low": 4,
      "c-ten": 10,
      "c-plenty": 25,
    };

    const isOutOfStock = (id: string) => (stockMap[id] || 0) <= 0;
    const isLowStock = (id: string) => (stockMap[id] || 0) > 0 && (stockMap[id] || 0) <= 10;

    expect(isOutOfStock("c-zero")).toBe(true);
    expect(isOutOfStock("c-negative")).toBe(true);
    expect(isOutOfStock("c-low")).toBe(false);

    expect(isLowStock("c-low")).toBe(true);
    expect(isLowStock("c-ten")).toBe(true);
    expect(isLowStock("c-plenty")).toBe(false);
    expect(isLowStock("c-zero")).toBe(false);
  });
});

describe("Procurement Dashboard Lifecycle & Pipeline Calculations", () => {
  const sampleOrders = [
    { id: "po-1", poNumber: "PO-001", status: "DRAFT", grandTotal: 100 },
    { id: "po-2", poNumber: "PO-002", status: "SUBMITTED", grandTotal: 250 },
    { id: "po-3", poNumber: "PO-003", status: "APPROVED", grandTotal: 500 },
    { id: "po-4", poNumber: "PO-004", status: "ISSUED", grandTotal: 800, expectedDeliveryDate: "2020-01-01" },
    { id: "po-5", poNumber: "PO-005", status: "PARTIALLY_RECEIVED", grandTotal: 1200 },
    { id: "po-6", poNumber: "PO-006", status: "FULFILLED", grandTotal: 3000 },
  ];

  it("segments purchase orders into appropriate pipeline stages", () => {
    const stages = {
      draft: sampleOrders.filter((o) => o.status === "DRAFT").length,
      submitted: sampleOrders.filter((o) => o.status === "SUBMITTED").length,
      approved: sampleOrders.filter((o) => o.status === "APPROVED").length,
      issued: sampleOrders.filter((o) => o.status === "ISSUED").length,
      partiallyReceived: sampleOrders.filter((o) => o.status === "PARTIALLY_RECEIVED").length,
      fulfilled: sampleOrders.filter((o) => o.status === "FULFILLED").length,
    };

    expect(stages.draft).toBe(1);
    expect(stages.submitted).toBe(1);
    expect(stages.approved).toBe(1);
    expect(stages.issued).toBe(1);
    expect(stages.partiallyReceived).toBe(1);
    expect(stages.fulfilled).toBe(1);
  });

  it("detects overdue orders based on delivery date", () => {
    const now = new Date();
    const overdue = sampleOrders.filter(
      (o) =>
        o.expectedDeliveryDate &&
        new Date(o.expectedDeliveryDate) < now &&
        o.status !== "FULFILLED" &&
        o.status !== "CANCELLED",
    );

    expect(overdue.length).toBe(1);
    expect(overdue[0]?.poNumber).toBe("PO-004");
  });

  it("aggregates fulfilled and pending spend", () => {
    const fulfilledSpend = sampleOrders
      .filter((o) => o.status === "FULFILLED")
      .reduce((sum, o) => sum + o.grandTotal, 0);

    const pendingSpend = sampleOrders
      .filter((o) => ["ISSUED", "PARTIALLY_RECEIVED", "APPROVED"].includes(o.status))
      .reduce((sum, o) => sum + o.grandTotal, 0);

    expect(fulfilledSpend).toBe(3000);
    expect(pendingSpend).toBe(2500); // 500 + 800 + 1200
  });
});

describe("Manufacturing Dashboard Lifecycle & Calculations", () => {
  const sampleWorkOrders = [
    { id: "wo-1", productionNumber: "WO-001", status: "DRAFT", priority: "LOW", quantityPlanned: 10, quantityCompleted: 0 },
    { id: "wo-2", productionNumber: "WO-002", status: "RELEASED", priority: "NORMAL", quantityPlanned: 20, quantityCompleted: 5 },
    { id: "wo-3", productionNumber: "WO-003", status: "IN_PROGRESS", priority: "URGENT", quantityPlanned: 15, quantityCompleted: 10, endDate: "2020-01-01" },
    { id: "wo-4", productionNumber: "WO-004", status: "COMPLETED", priority: "HIGH", quantityPlanned: 50, quantityCompleted: 50 },
  ];

  it("classifies active work orders and computes progress", () => {
    const activeOrders = sampleWorkOrders.filter(
      (w) => w.status === "IN_PROGRESS" || w.status === "RELEASED",
    );
    expect(activeOrders.length).toBe(2);

    const wo3 = sampleWorkOrders.find((w) => w.id === "wo-3");
    const percentDone = Math.round(((wo3?.quantityCompleted || 0) / (wo3?.quantityPlanned || 1)) * 100);
    expect(percentDone).toBe(67);
  });

  it("detects delayed work orders accurately", () => {
    const now = new Date();
    const delayed = sampleWorkOrders.filter(
      (w) =>
        w.endDate &&
        new Date(w.endDate) < now &&
        w.status !== "COMPLETED" &&
        w.status !== "CANCELLED",
    );

    expect(delayed.length).toBe(1);
    expect(delayed[0]?.productionNumber).toBe("WO-003");
  });

  it("distributes work orders across priority tiers", () => {
    let urgent = 0;
    let high = 0;
    let normal = 0;
    let low = 0;

    for (const wo of sampleWorkOrders) {
      if (wo.status !== "CANCELLED") {
        if (wo.priority === "URGENT") urgent += 1;
        else if (wo.priority === "HIGH") high += 1;
        else if (wo.priority === "NORMAL") normal += 1;
        else low += 1;
      }
    }

    expect(urgent).toBe(1);
    expect(high).toBe(1);
    expect(normal).toBe(1);
    expect(low).toBe(1);
  });
});

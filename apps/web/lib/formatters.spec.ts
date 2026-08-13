import { describe, it, expect } from "vitest";
import { formatCurrency } from "./formatters";

describe("formatCurrency utility", () => {
  it("formats INR currency by default with ₹ symbol", () => {
    expect(formatCurrency(1250)).toContain("₹");
    expect(formatCurrency(1250)).toContain("1,250.00");
  });

  it("formats USD currency with $ symbol", () => {
    const formatted = formatCurrency(500, "USD");
    expect(formatted).toContain("$");
    expect(formatted).toContain("500.00");
  });

  it("formats EUR currency with € symbol without defaulting to $", () => {
    const formatted = formatCurrency(99.99, "EUR");
    expect(formatted).toContain("€");
    expect(formatted).not.toContain("$");
  });

  it("formats GBP currency with £ symbol", () => {
    const formatted = formatCurrency(150.5, "GBP");
    expect(formatted).toContain("£");
    expect(formatted).not.toContain("$");
  });

  it("handles null and undefined values safely", () => {
    expect(formatCurrency(null)).toBe("₹0.00");
    expect(formatCurrency(undefined)).toBe("₹0.00");
  });
});

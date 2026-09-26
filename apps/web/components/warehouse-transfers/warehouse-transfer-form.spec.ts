import { describe, it, expect } from "vitest";
import type { LocationDto } from "@/lib/api/locations-api";
import type { ComponentDto } from "@/lib/api/components-api";
import type { InventoryProjectionDto } from "@/lib/api/inventory-projections-api";

export function filterDestinationLocations(
  locations: LocationDto[],
  sourceLocationId?: string,
): LocationDto[] {
  if (!sourceLocationId) return locations;
  return locations.filter((loc) => loc.id !== sourceLocationId);
}

export function filterAvailableComponents(
  components: ComponentDto[],
  sourceProjections: Record<string, InventoryProjectionDto>,
  sourceLocationId?: string,
): ComponentDto[] {
  if (!sourceLocationId) return [];
  return components.filter((c) => {
    const proj = sourceProjections[c.id];
    return proj && proj.quantity > 0;
  });
}

export function validateTransferLineQuantity(
  quantity: number,
  componentId: string,
  sourceProjections: Record<string, InventoryProjectionDto>,
): { valid: boolean; error?: string } {
  if (!componentId) {
    return { valid: false, error: "Component is required" };
  }
  if (quantity <= 0) {
    return { valid: false, error: "Quantity must be greater than 0" };
  }
  const proj = sourceProjections[componentId];
  if (!proj) {
    return { valid: false, error: "Component has no stock at source location" };
  }
  if (quantity > proj.quantity) {
    return {
      valid: false,
      error: `Quantity (${quantity}) exceeds available stock (${proj.quantity} ${proj.unitOfMeasure || "pcs"})`,
    };
  }
  return { valid: true };
}

describe("Warehouse Transfer Form Logic", () => {
  const dummyLocations: LocationDto[] = [
    {
      id: "loc-src",
      organizationId: "org-1",
      code: "WH-SRC",
      name: "Source Warehouse",
      kind: "WAREHOUSE",
      isActive: true,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
    {
      id: "loc-dest",
      organizationId: "org-1",
      code: "WH-DST",
      name: "Destination Warehouse",
      kind: "WAREHOUSE",
      isActive: true,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
    {
      id: "loc-staging",
      organizationId: "org-1",
      code: "STG-1",
      name: "Staging Area",
      kind: "STAGING",
      isActive: true,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
  ];

  const dummyComponents: ComponentDto[] = [
    {
      id: "comp-1",
      organizationId: "org-1",
      name: "Resistor 10k",
      sku: "RES-10K",
      unit: "pcs",
      isDraft: false,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
    {
      id: "comp-2",
      organizationId: "org-1",
      name: "Capacitor 100uF",
      sku: "CAP-100U",
      unit: "pcs",
      isDraft: false,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
    {
      id: "comp-3",
      organizationId: "org-1",
      name: "Microcontroller",
      sku: "MCU-32",
      unit: "pcs",
      isDraft: false,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
  ];

  describe("filterDestinationLocations (Req 3)", () => {
    it("omits the selected source location from destination options", () => {
      const filtered = filterDestinationLocations(dummyLocations, "loc-src");
      expect(filtered).toHaveLength(2);
      expect(filtered.some((l) => l.id === "loc-src")).toBe(false);
      expect(filtered.map((l) => l.id)).toEqual(["loc-dest", "loc-staging"]);
    });

    it("returns all locations if no source location is selected", () => {
      const filtered = filterDestinationLocations(dummyLocations, undefined);
      expect(filtered).toHaveLength(3);
    });
  });

  describe("filterAvailableComponents (Req 1)", () => {
    it("returns only components with positive stock at the source location", () => {
      const projections: Record<string, InventoryProjectionDto> = {
        "comp-1": {
          id: "proj-1",
          organizationId: "org-1",
          componentId: "comp-1",
          locationId: "loc-src",
          quantity: 50,
          unitOfMeasure: "pcs",
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
        },
        "comp-2": {
          id: "proj-2",
          organizationId: "org-1",
          componentId: "comp-2",
          locationId: "loc-src",
          quantity: 0, // Zero stock
          unitOfMeasure: "pcs",
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
        },
      };

      const available = filterAvailableComponents(
        dummyComponents,
        projections,
        "loc-src",
      );

      // Only comp-1 has quantity > 0
      expect(available).toHaveLength(1);
      expect(available[0]?.id).toBe("comp-1");
    });

    it("returns empty array if no source location is selected", () => {
      const available = filterAvailableComponents(
        dummyComponents,
        {},
        undefined,
      );
      expect(available).toHaveLength(0);
    });
  });

  describe("validateTransferLineQuantity (Req 2)", () => {
    const projections: Record<string, InventoryProjectionDto> = {
      "comp-1": {
        id: "proj-1",
        organizationId: "org-1",
        componentId: "comp-1",
        locationId: "loc-src",
        quantity: 25,
        unitOfMeasure: "pcs",
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
    };

    it("accepts quantity less than or equal to available stock", () => {
      expect(validateTransferLineQuantity(10, "comp-1", projections).valid).toBe(
        true,
      );
      expect(validateTransferLineQuantity(25, "comp-1", projections).valid).toBe(
        true,
      );
    });

    it("rejects quantity exceeding available stock (ceiling enforcement)", () => {
      const result = validateTransferLineQuantity(26, "comp-1", projections);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exceeds available stock (25 pcs)");
    });

    it("rejects non-positive quantities", () => {
      expect(validateTransferLineQuantity(0, "comp-1", projections).valid).toBe(
        false,
      );
      expect(validateTransferLineQuantity(-5, "comp-1", projections).valid).toBe(
        false,
      );
    });
  });
});

import { describe, it, expect, vi } from "vitest";
import { DeleteLocation } from "./delete-location";
import { Location } from "./location";
import {
  LocationHasChildrenError,
  LocationInUseError,
  LocationNotFoundError,
} from "./location.errors";
import type { LocationRepository } from "./location.repository";

describe("DeleteLocation", () => {
  const createMockRepo = (overrides: Partial<LocationRepository> = {}): LocationRepository => ({
    findById: vi.fn().mockResolvedValue(null),
    findByCode: vi.fn().mockResolvedValue(null),
    findByParentId: vi.fn().mockResolvedValue([]),
    findMany: vi.fn().mockResolvedValue([]),
    save: vi.fn(),
    update: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
    isInUse: vi.fn().mockResolvedValue(false),
    ...overrides,
  });

  it("should successfully delete an existing, unreferenced location with no children", async () => {
    const loc = Location.create({
      code: "BIN-01",
      name: "Bin 01",
      kind: "bin",
    });

    const repo = createMockRepo({
      findById: vi.fn().mockResolvedValue(loc),
      findByParentId: vi.fn().mockResolvedValue([]),
      isInUse: vi.fn().mockResolvedValue(false),
      delete: vi.fn().mockResolvedValue(undefined),
    });

    const useCase = new DeleteLocation(repo);
    await useCase.execute(loc.id);

    expect(repo.delete).toHaveBeenCalledWith(loc.id);
  });

  it("should throw LocationNotFoundError if location does not exist", async () => {
    const repo = createMockRepo({
      findById: vi.fn().mockResolvedValue(null),
    });

    const useCase = new DeleteLocation(repo);
    await expect(useCase.execute("non-existent-id")).rejects.toThrow(
      LocationNotFoundError,
    );
  });

  it("should throw LocationHasChildrenError if location has child locations", async () => {
    const parent = Location.create({
      code: "AISLE-1",
      name: "Aisle 1",
      kind: "aisle",
    });
    const child = Location.create({
      code: "RACK-1",
      name: "Rack 1",
      kind: "rack",
      parentId: parent.id,
    });

    const repo = createMockRepo({
      findById: vi.fn().mockResolvedValue(parent),
      findByParentId: vi.fn().mockResolvedValue([child]),
    });

    const useCase = new DeleteLocation(repo);
    await expect(useCase.execute(parent.id)).rejects.toThrow(
      LocationHasChildrenError,
    );
  });

  it("should throw LocationInUseError if location is referenced by inventory or receipts", async () => {
    const loc = Location.create({
      code: "WRB",
      name: "Workbench",
      kind: "aisle",
    });

    const repo = createMockRepo({
      findById: vi.fn().mockResolvedValue(loc),
      findByParentId: vi.fn().mockResolvedValue([]),
      isInUse: vi.fn().mockResolvedValue(true),
    });

    const useCase = new DeleteLocation(repo);
    await expect(useCase.execute(loc.id)).rejects.toThrow(
      LocationInUseError,
    );
    await expect(useCase.execute(loc.id)).rejects.toThrow(
      "Cannot delete location 'WRB' because it is in use by inventory records, receipts, or transactions.",
    );
  });
});

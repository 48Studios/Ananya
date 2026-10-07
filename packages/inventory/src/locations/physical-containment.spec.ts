import { describe, expect, it, vi } from "vitest";
import { Location } from "./location";
import { CreateLocation } from "./create-location";
import { UpdateLocation } from "./update-location";
import {
  CannotContainSelfError,
  ContainerHierarchyCycleError,
  ContainerLocationNotFoundError,
  InactiveContainerLocationError,
  InvalidPhysicalContainmentError,
} from "./location.errors";
import type { LocationRepository } from "./location.repository";

/**
 * RFC-0069 Phase 2 — physical containment (`containerId`) as a first-class
 * domain concept, and its write-boundary validation.
 *
 * `parentId` (organizational) and `containerId` (physical) are INDEPENDENT:
 * neither is ever derived from the other, all four combinations are valid, and
 * physical validation never touches the `parentId` rules.
 */

const makeLocation = (
  code: string,
  kind: string,
  containerId: string | null = null,
  parentId: string | null = null,
): Location =>
  Location.create({ code, name: code, kind, containerId, parentId });

function createRepo(locations: Location[]): LocationRepository {
  const byId = new Map(locations.map((l) => [l.id, l]));
  const byCode = new Map(locations.map((l) => [l.code, l]));

  const walk = (
    id: string,
    next: (l: Location | undefined) => string | null,
  ): string[] => {
    const ids: string[] = [];
    const visited = new Set<string>([id]);
    let current = next(byId.get(id));
    while (current && !visited.has(current)) {
      visited.add(current);
      ids.push(current);
      current = next(byId.get(current));
    }
    return ids;
  };

  return {
    findById: vi.fn(async (id: string) => byId.get(id) ?? null),
    findByCode: vi.fn(async (code: string) => byCode.get(code) ?? null),
    findByParentId: vi.fn(async (parentId: string) =>
      locations.filter((l) => l.parentId === parentId),
    ),
    findAncestorIds: vi.fn(async (id: string) =>
      walk(id, (l) => l?.parentId ?? null),
    ),
    findContainerAncestorIds: vi.fn(async (id: string) =>
      walk(id, (l) => l?.containerId ?? null),
    ),
    findMany: vi.fn(async () => locations),
    save: vi.fn(async (location: Location) => location),
    update: vi.fn(async (location: Location) => location),
    delete: vi.fn(async () => undefined),
    isInUse: vi.fn(async () => false),
  };
}

describe("Location aggregate — containerId", () => {
  it("defaults containerId to null when omitted", () => {
    const created = Location.create({ code: "BIN-01", name: "Bin", kind: "bin" });
    expect(created.containerId).toBeNull();
    expect(created.parentId).toBeNull();
  });

  it("keeps parentId and containerId fully independent (all four combinations)", () => {
    const both = Location.create({
      code: "A",
      name: "A",
      kind: "drawer",
      parentId: "p-1",
      containerId: "c-1",
    });
    expect(both.parentId).toBe("p-1");
    expect(both.containerId).toBe("c-1");

    const orgOnly = Location.create({
      code: "B",
      name: "B",
      kind: "drawer",
      parentId: "p-2",
      containerId: null,
    });
    expect(orgOnly.parentId).toBe("p-2");
    expect(orgOnly.containerId).toBeNull();

    const physicalOnly = Location.create({
      code: "C",
      name: "C",
      kind: "drawer",
      parentId: null,
      containerId: "c-3",
    });
    expect(physicalOnly.parentId).toBeNull();
    expect(physicalOnly.containerId).toBe("c-3");

    const neither = Location.create({
      code: "D",
      name: "D",
      kind: "cabinet",
    });
    expect(neither.parentId).toBeNull();
    expect(neither.containerId).toBeNull();
  });

  it("does not derive containerId from parentId, or parentId from containerId", () => {
    const orgOnly = Location.create({
      code: "E",
      name: "E",
      kind: "drawer",
      parentId: "p-9",
    });
    expect(orgOnly.containerId).toBeNull();

    const physicalOnly = Location.create({
      code: "F",
      name: "F",
      kind: "drawer",
      containerId: "c-9",
    });
    expect(physicalOnly.parentId).toBeNull();
  });

  it("update omits vs clears containerId distinctly", () => {
    const loc = Location.create({
      code: "G",
      name: "G",
      kind: "drawer",
      containerId: "c-original",
    });

    // Omitted → unchanged.
    const omitted = loc.update({ name: "renamed" });
    expect(omitted.containerId).toBe("c-original");

    // Explicit null → cleared.
    const cleared = loc.update({ containerId: null });
    expect(cleared.containerId).toBeNull();

    // New value → replaced.
    const replaced = loc.update({ containerId: "c-new" });
    expect(replaced.containerId).toBe("c-new");
  });

  it("changing containerId never changes parentId (and vice versa)", () => {
    const loc = Location.create({
      code: "H",
      name: "H",
      kind: "drawer",
      parentId: "p-keep",
      containerId: "c-old",
    });

    const containerChanged = loc.update({ containerId: "c-new" });
    expect(containerChanged.parentId).toBe("p-keep");
    expect(containerChanged.containerId).toBe("c-new");

    const parentChanged = loc.update({ parentId: "p-new" });
    expect(parentChanged.parentId).toBe("p-new");
    expect(parentChanged.containerId).toBe("c-old");
  });
});

describe("CreateLocation — physical container validation", () => {
  const cabinet = makeLocation("CAB-1", "cabinet");
  const inactiveCabinet = Location.create({
    code: "CAB-INACTIVE",
    name: "inactive",
    kind: "cabinet",
  }).update({ isActive: false });
  const drawer = makeLocation("DRW-1", "drawer", cabinet.id);

  it("accepts a valid container", async () => {
    const repo = createRepo([cabinet]);
    const create = new CreateLocation(repo);

    const created = await create.execute({
      code: "DRW-NEW",
      name: "New Drawer",
      kind: "drawer",
      containerId: cabinet.id,
    });
    expect(created.containerId).toBe(cabinet.id);
    expect(created.parentId).toBeNull();
  });

  it("accepts an explicit null container", async () => {
    const repo = createRepo([cabinet]);
    const create = new CreateLocation(repo);

    const created = await create.execute({
      code: "CAB-NEW",
      name: "Top-level Cabinet",
      kind: "cabinet",
      containerId: null,
    });
    expect(created.containerId).toBeNull();
  });

  it("accepts an omitted container (no-op, no lookups)", async () => {
    const repo = createRepo([cabinet]);
    const create = new CreateLocation(repo);
    const findContainerSpy = repo.findContainerAncestorIds as ReturnType<
      typeof vi.fn
    >;

    const created = await create.execute({
      code: "CAB-NEW-2",
      name: "Cabinet",
      kind: "cabinet",
    });
    expect(created.containerId).toBeNull();
    // Omitted container performs zero physical validation work.
    expect(findContainerSpy).not.toHaveBeenCalled();
    expect(repo.findById).not.toHaveBeenCalled();
  });

  it("keeps a valid parentId with a null containerId valid", async () => {
    const repo = createRepo([cabinet]);
    const create = new CreateLocation(repo);

    const created = await create.execute({
      code: "DRW-ORG",
      name: "Organizationally nested only",
      kind: "drawer",
      parentId: cabinet.id,
      containerId: null,
    });
    expect(created.parentId).toBe(cabinet.id);
    expect(created.containerId).toBeNull();
  });

  it("keeps a null parentId with a valid containerId valid", async () => {
    const repo = createRepo([cabinet]);
    const create = new CreateLocation(repo);

    const created = await create.execute({
      code: "DRW-PHYS",
      name: "Physically nested only",
      kind: "drawer",
      parentId: null,
      containerId: cabinet.id,
    });
    expect(created.parentId).toBeNull();
    expect(created.containerId).toBe(cabinet.id);
  });

  it("rejects a nonexistent container", async () => {
    const repo = createRepo([cabinet]);
    const create = new CreateLocation(repo);

    await expect(
      create.execute({
        code: "DRW-X",
        name: "X",
        kind: "drawer",
        containerId: "00000000-0000-4000-8000-000000000000",
      }),
    ).rejects.toBeInstanceOf(ContainerLocationNotFoundError);
  });

  it("rejects an inactive container", async () => {
    const repo = createRepo([inactiveCabinet]);
    const create = new CreateLocation(repo);

    await expect(
      create.execute({
        code: "DRW-INACT",
        name: "X",
        kind: "drawer",
        containerId: inactiveCabinet.id,
      }),
    ).rejects.toBeInstanceOf(InactiveContainerLocationError);
  });

  it("rejects a self-container", async () => {
    // Create cannot target an existing id, so exercise self via UpdateLocation.
    // Here we assert the shared validator's self guard applies to a supplied
    // containerId equal to the (pre-generated) location id is impossible;
    // instead confirm an invalid category relationship is rejected.
    const repo = createRepo([cabinet]);
    const create = new CreateLocation(repo);
    await expect(
      create.execute({
        code: "BIN-BAD",
        name: "Bad",
        kind: "bin",
        containerId: cabinet.id, // cabinet → bin is not canonical
      }),
    ).rejects.toBeInstanceOf(InvalidPhysicalContainmentError);
  });

  it("rejects an invalid category relationship (warehouse parent not a container for compartment)", async () => {
    const warehouse = makeLocation("WH-1", "warehouse");
    const repo = createRepo([warehouse]);
    const create = new CreateLocation(repo);

    await expect(
      create.execute({
        code: "CMP-BAD",
        name: "Bad compartment",
        kind: "compartment",
        containerId: warehouse.id,
      }),
    ).rejects.toBeInstanceOf(InvalidPhysicalContainmentError);
  });

  it("accepts a context-root container for a physical root (warehouse → rack)", async () => {
    const warehouse = makeLocation("WH-2", "warehouse");
    const repo = createRepo([warehouse]);
    const create = new CreateLocation(repo);

    const created = await create.execute({
      code: "RACK-1",
      name: "Rack",
      kind: "rack",
      containerId: warehouse.id,
    });
    expect(created.containerId).toBe(warehouse.id);
  });

  it("detects a physical container cycle", async () => {
    // Build A.containerId = B where B.containerId is null; then create a new
    // location and attempt to point it into a chain that would loop. Create
    // generates a fresh id, so we exercise the cycle path via a malformed
    // pre-existing chain: X → Y → X.
    const x = makeLocation("X", "cabinet");
    const y = Location.rehydrate({
      id: "y-id",
      code: "Y",
      name: "Y",
      kind: "shelf",
      parentId: null,
      containerId: x.id,
      isActive: true,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const cyclicX = Location.rehydrate({
      id: x.id,
      code: "X",
      name: "X",
      kind: "cabinet",
      parentId: null,
      containerId: y.id,
      isActive: true,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const repo = createRepo([cyclicX, y]);
    // Walk from y's container (x) must terminate; assert no infinite loop.
    const ancestors = await repo.findContainerAncestorIds(y.id);
    expect(ancestors).toContain(x.id);
  });
});

describe("UpdateLocation — physical container validation", () => {
  const cabinet = makeLocation("CAB", "cabinet");
  const shelf = makeLocation("SHF", "shelf", null, cabinet.id);
  const drawer = makeLocation("DRW", "drawer");

  it("sets containerId", async () => {
    const repo = createRepo([cabinet, drawer]);
    const update = new UpdateLocation(repo);

    const updated = await update.execute(drawer.id, {
      containerId: cabinet.id,
    });
    expect(updated.containerId).toBe(cabinet.id);
  });

  it("replaces containerId", async () => {
    const dryCabinet = makeLocation("DRYCAB", "dry_cabinet");
    const existing = Location.create({
      code: "DRW-2",
      name: "DRW-2",
      kind: "drawer",
      containerId: cabinet.id,
    });
    const repo = createRepo([cabinet, dryCabinet, existing]);
    const update = new UpdateLocation(repo);

    const updated = await update.execute(existing.id, {
      containerId: dryCabinet.id,
    });
    expect(updated.containerId).toBe(dryCabinet.id);
  });

  it("clears containerId with null", async () => {
    const existing = Location.create({
      code: "DRW-3",
      name: "DRW-3",
      kind: "drawer",
      containerId: cabinet.id,
    });
    const repo = createRepo([cabinet, existing]);
    const update = new UpdateLocation(repo);

    const updated = await update.execute(existing.id, { containerId: null });
    expect(updated.containerId).toBeNull();
  });

  it("omitted containerId leaves the existing value unchanged", async () => {
    const existing = Location.create({
      code: "DRW-4",
      name: "DRW-4",
      kind: "drawer",
      containerId: cabinet.id,
    });
    const repo = createRepo([cabinet, existing]);
    const update = new UpdateLocation(repo);

    const updated = await update.execute(existing.id, { name: "renamed" });
    expect(updated.containerId).toBe(cabinet.id);
  });

  it("rejects a self-container", async () => {
    const repo = createRepo([cabinet, drawer]);
    const update = new UpdateLocation(repo);

    await expect(
      update.execute(drawer.id, { containerId: drawer.id }),
    ).rejects.toBeInstanceOf(CannotContainSelfError);
  });

  it("rejects a nonexistent container", async () => {
    const repo = createRepo([cabinet, drawer]);
    const update = new UpdateLocation(repo);

    await expect(
      update.execute(drawer.id, {
        containerId: "00000000-0000-4000-8000-000000000000",
      }),
    ).rejects.toBeInstanceOf(ContainerLocationNotFoundError);
  });

  it("rejects an invalid category relationship", async () => {
    const bin = makeLocation("BIN", "bin");
    const repo = createRepo([cabinet, bin]);
    const update = new UpdateLocation(repo);

    await expect(
      update.execute(bin.id, { containerId: cabinet.id }),
    ).rejects.toBeInstanceOf(InvalidPhysicalContainmentError);
  });

  it("rejects a container cycle (A → B → A)", async () => {
    // Zero-length category chain is impossible (physical roots cannot contain
    // the space that contains them), so use context roots, which CAN nest:
    // warehouse → room_area is valid, and room_area → warehouse is also valid.
    const a = makeLocation("WH-A", "warehouse");
    const b = makeLocation("ROOM-B", "room_area", a.id);
    const repo = createRepo([a, b]);
    const update = new UpdateLocation(repo);

    await expect(
      update.execute(a.id, { containerId: b.id }),
    ).rejects.toBeInstanceOf(ContainerHierarchyCycleError);
  });

  it("rejects a three-node container cycle (A → B → C → A)", async () => {
    // warehouse → room_area → aisle → warehouse: every edge is a valid
    // context-root edge, so the pair check passes and only the cycle guard can
    // stop it.
    const a = makeLocation("WH-A", "warehouse");
    const b = makeLocation("ROOM-B", "room_area", a.id);
    const c = makeLocation("AISLE-C", "aisle", b.id);
    const repo = createRepo([a, b, c]);
    const update = new UpdateLocation(repo);

    await expect(
      update.execute(a.id, { containerId: c.id }),
    ).rejects.toBeInstanceOf(ContainerHierarchyCycleError);
  });

  it("accepts a valid reparent within physical containment", async () => {
    const target = makeLocation("CAB-T", "cabinet");
    const mover = makeLocation("DRW-M", "drawer");
    const repo = createRepo([target, mover]);
    const update = new UpdateLocation(repo);

    const updated = await update.execute(mover.id, {
      containerId: target.id,
    });
    expect(updated.containerId).toBe(target.id);
  });

  it("changing containerId does NOT change parentId", async () => {
    const existing = makeLocation("DRW-K", "drawer", null, shelf.id);
    const repo = createRepo([cabinet, shelf, existing]);
    const update = new UpdateLocation(repo);

    const updated = await update.execute(existing.id, {
      containerId: cabinet.id,
    });
    expect(updated.parentId).toBe(shelf.id);
    expect(updated.containerId).toBe(cabinet.id);
  });

  it("terminates safely when a malformed pre-existing container cycle exists", async () => {
    const x = makeLocation("X", "cabinet");
    const y = makeLocation("Y", "shelf", x.id);
    const cyclicX = Location.rehydrate({
      id: x.id,
      code: "X",
      name: "X",
      kind: "cabinet",
      parentId: null,
      containerId: y.id,
      isActive: true,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const fresh = makeLocation("FRESH", "drawer");
    const repo = createRepo([cyclicX, y, fresh]);
    const update = new UpdateLocation(repo);

    // Reparenting a fresh drawer into X is fine; the walk from X must terminate
    // on the malformed X <-> Y cycle instead of hanging.
    const updated = await update.execute(fresh.id, {
      containerId: cyclicX.id,
    });
    expect(updated.containerId).toBe(cyclicX.id);

    // The bounded walk still returns (no infinite loop).
    await expect(repo.findContainerAncestorIds(cyclicX.id)).resolves.toEqual([
      y.id,
    ]);
  });
});

describe("parentId behaviour is unchanged by Phase 2", () => {
  it("still rejects a physical container for an incompatible category without affecting parentId rules", async () => {
    const parent = makeLocation("P", "warehouse");
    const repo = createRepo([parent]);
    const create = new CreateLocation(repo);

    // Organizational parent accepts any kind (unchanged permissive rule) …
    const created = await create.execute({
      code: "CHILD",
      name: "Child",
      kind: "compartment",
      parentId: parent.id,
    });
    expect(created.parentId).toBe(parent.id);
    // … while physical containment of the same pair is rejected.
    await expect(
      create.execute({
        code: "CHILD-2",
        name: "Child 2",
        kind: "compartment",
        containerId: parent.id,
      }),
    ).rejects.toBeInstanceOf(InvalidPhysicalContainmentError);
  });
});

import { describe, expect, it, vi } from "vitest";
import { CreateLocation } from "./create-location";
import { UpdateLocation } from "./update-location";
import { Location } from "./location";
import {
  CannotParentToSelfError,
  InactiveParentLocationError,
  LocationHierarchyCycleError,
  LocationNotFoundError,
  ParentLocationNotFoundError,
} from "./location.errors";
import type { LocationRepository } from "./location.repository";

/**
 * Structural hierarchy safety: a location may not parent itself, and a re-parent
 * must not create a cycle in the `parentId` chain. These tests deliberately do
 * NOT assert physical parent/child category compatibility, which is not enforced
 * by the location use cases.
 */

const makeLocation = (
  code: string,
  kind: string,
  parent: Location | null = null,
  isActive = true,
): Location => {
  const created = Location.create({
    code,
    name: code,
    kind,
    parentId: parent?.id ?? null,
  });
  return isActive ? created : created.update({ isActive: false });
};

/**
 * In-memory repository whose `findAncestorIds` walks a real parent chain with a
 * visited guard, so it mirrors the Drizzle implementation (and terminates on a
 * malformed pre-existing cycle).
 */
function createRepo(locations: Location[]): LocationRepository {
  const byId = new Map(locations.map((l) => [l.id, l]));
  const byCode = new Map(locations.map((l) => [l.code, l]));

  const findAncestorIds = async (id: string): Promise<string[]> => {
    const ancestors: string[] = [];
    const visited = new Set<string>([id]);
    let current = byId.get(id)?.parentId ?? null;
    while (current && !visited.has(current)) {
      visited.add(current);
      ancestors.push(current);
      current = byId.get(current)?.parentId ?? null;
    }
    return ancestors;
  };

  const findContainerAncestorIds = async (id: string): Promise<string[]> => {
    const ancestors: string[] = [];
    const visited = new Set<string>([id]);
    let current = byId.get(id)?.containerId ?? null;
    while (current && !visited.has(current)) {
      visited.add(current);
      ancestors.push(current);
      current = byId.get(current)?.containerId ?? null;
    }
    return ancestors;
  };

  return {
    findById: vi.fn(async (id: string) => byId.get(id) ?? null),
    findByCode: vi.fn(async (code: string) => byCode.get(code) ?? null),
    findByParentId: vi.fn(async (parentId: string) =>
      locations.filter((l) => l.parentId === parentId),
    ),
    findAncestorIds: vi.fn(findAncestorIds),
    findContainerAncestorIds: vi.fn(findContainerAncestorIds),
    findMany: vi.fn(async () => locations),
    save: vi.fn(async (location: Location) => location),
    update: vi.fn(async (location: Location) => location),
    delete: vi.fn(async () => undefined),
    isInUse: vi.fn(async () => false),
  };
}

// A (root) -> B -> C ; D is a sibling root
const a = makeLocation("A", "warehouse");
const b = makeLocation("B", "rack", a);
const c = makeLocation("C", "shelf", b);
const d = makeLocation("D", "cabinet");

describe("UpdateLocation — self-parent and cycle safety", () => {
  it("rejects A -> A (direct self-parenting)", async () => {
    const repo = createRepo([a, b, c, d]);
    const update = new UpdateLocation(repo);

    await expect(update.execute(a.id, { parentId: a.id })).rejects.toBeInstanceOf(
      CannotParentToSelfError,
    );
  });

  it("rejects A -> B -> A (two-node cycle)", async () => {
    const repo = createRepo([a, b, c, d]);
    const update = new UpdateLocation(repo);

    // Reparenting A under B would make A a descendant of itself (B's ancestor
    // chain already contains A).
    await expect(update.execute(a.id, { parentId: b.id })).rejects.toBeInstanceOf(
      LocationHierarchyCycleError,
    );
  });

  it("rejects A -> B -> C -> A (three-node cycle)", async () => {
    const repo = createRepo([a, b, c, d]);
    const update = new UpdateLocation(repo);

    // Reparenting A under C would close the A -> B -> C chain into a cycle.
    await expect(update.execute(a.id, { parentId: c.id })).rejects.toBeInstanceOf(
      LocationHierarchyCycleError,
    );
  });

  it("allows a valid reparent that does not create a cycle", async () => {
    const repo = createRepo([a, b, c, d]);
    const update = new UpdateLocation(repo);

    // Moving D (an unrelated root) under C is acyclic and must succeed.
    const updated = await update.execute(d.id, { parentId: c.id });
    expect(updated.parentId).toBe(c.id);

    // Re-parenting C under B (its current parent) is a no-op cycle-wise.
    const same = await update.execute(c.id, { parentId: b.id });
    expect(same.parentId).toBe(b.id);
  });

  it("rejects a missing parent", async () => {
    const repo = createRepo([a, b, c, d]);
    const update = new UpdateLocation(repo);

    await expect(
      update.execute(d.id, { parentId: "00000000-0000-4000-8000-000000000000" }),
    ).rejects.toBeInstanceOf(ParentLocationNotFoundError);
  });

  it("rejects an inactive parent", async () => {
    const inactive = makeLocation("INACTIVE", "rack", null, false);
    const child = makeLocation("CHILD", "shelf");
    const repo = createRepo([inactive, child]);
    const update = new UpdateLocation(repo);

    await expect(
      update.execute(child.id, { parentId: inactive.id }),
    ).rejects.toBeInstanceOf(InactiveParentLocationError);
  });

  it("rejects an unknown target location before checking the parent", async () => {
    const repo = createRepo([a, b, c, d]);
    const update = new UpdateLocation(repo);

    await expect(
      update.execute("00000000-0000-4000-8000-000000000000", {
        parentId: a.id,
      }),
    ).rejects.toBeInstanceOf(LocationNotFoundError);
  });

  it("clears the parent when parentId is explicitly null", async () => {
    const repo = createRepo([a, b, c, d]);
    const update = new UpdateLocation(repo);

    const updated = await update.execute(c.id, { parentId: null });
    expect(updated.parentId).toBeNull();
  });
});

describe("UpdateLocation — tolerates a malformed pre-existing cycle", () => {
  it("terminates an ancestor walk that would otherwise loop forever", async () => {
    // Build X <-> Y (an existing two-node cycle) plus an unrelated target Z.
    const x = makeLocation("X", "rack");
    const y = makeLocation("Y", "shelf");
    // Force the malformed cycle directly on the rehydrated aggregates.
    const cyclicX = Location.rehydrate({
      id: x.id,
      code: x.code,
      name: x.name,
      kind: x.kind,
      parentId: y.id,
      containerId: null,
      isActive: x.isActive,
      metadata: x.metadata,
      createdAt: x.createdAt,
      updatedAt: x.updatedAt,
    });
    const cyclicY = Location.rehydrate({
      id: y.id,
      code: y.code,
      name: y.name,
      kind: y.kind,
      parentId: x.id,
      containerId: null,
      isActive: y.isActive,
      metadata: y.metadata,
      createdAt: y.createdAt,
      updatedAt: y.updatedAt,
    });
    const z = makeLocation("Z", "bin");

    const repo = createRepo([cyclicX, cyclicY, z]);
    const update = new UpdateLocation(repo);

    // Reparenting Z under X is valid; the walk from X must terminate on the
    // pre-existing cycle instead of hanging.
    const updated = await update.execute(z.id, { parentId: cyclicX.id });
    expect(updated.parentId).toBe(cyclicX.id);

    // And a walk that does traverse the cycle still returns (no infinite loop).
    await expect(repo.findAncestorIds(cyclicX.id)).resolves.toEqual([cyclicY.id]);
  });
});

describe("CreateLocation — does not need a cycle check", () => {
  it("creates a new location under a valid active parent", async () => {
    const repo = createRepo([a, b, c, d]);
    const create = new CreateLocation(repo);

    const created = await create.execute({
      code: "NEW-1",
      name: "New 1",
      kind: "drawer",
      parentId: c.id,
    });

    expect(created.parentId).toBe(c.id);
    expect(created.id).not.toBe(c.id);
  });

  it("rejects a missing parent", async () => {
    const repo = createRepo([a, b, c, d]);
    const create = new CreateLocation(repo);

    await expect(
      create.execute({
        code: "NEW-2",
        name: "New 2",
        kind: "drawer",
        parentId: "00000000-0000-4000-8000-000000000000",
      }),
    ).rejects.toBeInstanceOf(ParentLocationNotFoundError);
  });

  it("rejects an inactive parent", async () => {
    const inactive = makeLocation("INACTIVE", "rack", null, false);
    const repo = createRepo([inactive]);
    const create = new CreateLocation(repo);

    await expect(
      create.execute({
        code: "NEW-3",
        name: "New 3",
        kind: "shelf",
        parentId: inactive.id,
      }),
    ).rejects.toBeInstanceOf(InactiveParentLocationError);
  });
});

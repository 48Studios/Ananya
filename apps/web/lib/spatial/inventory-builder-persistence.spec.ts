import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createDefaultSmdCabinetConfig,
  type SmdDrawerCabinetConfig,
} from "@ananya/inventory";
import {
  createInitialBuilderState,
  loadLayoutIntoWorkspace,
  resetWorkspaceToDraft,
  formatWorkspaceMappingsForApi,
  computeIsWorkspaceDirty,
  mapSlotToLocation,
  unmapSlot,
  updateParametricConfig,
} from "./inventory-builder-state";
import {
  spatialLayoutsApi,
  type SpatialLayoutDto,
  type SpatialLayoutRevisionDto,
} from "../api/spatial-layouts-api";
import { ApiError } from "../api-client";
import type { LocationDto } from "../api/locations-api";

describe("Phase 3.3: Inventory Builder Persistence & Concurrency Logic", () => {
  const mockParentLocation: LocationDto = {
    id: "loc-cabinet-01",
    code: "CAB-01",
    name: "Main SMD Storage Cabinet",
    kind: "warehouse",
    parentId: null,
    isActive: true,
    metadata: {},
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  const mockChildLocationA: LocationDto = {
    id: "loc-drawer-a01",
    code: "DRW-A01",
    name: "SMD Drawer A01 (0805 Resistors)",
    kind: "drawer",
    parentId: "loc-cabinet-01",
    isActive: true,
    metadata: {},
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  const mockChildLocationB: LocationDto = {
    id: "loc-drawer-a02",
    code: "DRW-A02",
    name: "SMD Drawer A02 (0603 Capacitors)",
    kind: "drawer",
    parentId: "loc-cabinet-01",
    isActive: true,
    metadata: {},
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  const allLocations: LocationDto[] = [
    mockParentLocation,
    mockChildLocationA,
    mockChildLocationB,
  ];

  const sampleConfig = createDefaultSmdCabinetConfig();

  const mockPersistedLayout: SpatialLayoutDto = {
    id: "lay-100",
    parentLocationId: "loc-cabinet-01",
    code: "LAYOUT-CAB-01",
    name: "Cabinet 01 Layout",
    description: "Standard 50-drawer matrix for surface-mount passives",
    status: "DRAFT",
    revision: 3,
    templateType: "SMD_DRAWER_CABINET",
    engineVersion: "1.0.0",
    config: sampleConfig,
    totalCompartments: 50,
    createdBy: "usr-1",
    updatedBy: "usr-1",
    metadata: { author: "jrsarath" },
    mappings: [
      {
        id: "map-1",
        slotId: "drawer_slot_r0_c0",
        slotCode: "A01",
        locationId: "loc-drawer-a01",
        logicalRow: 0,
        logicalCol: 0,
        isStale: false,
        staleReason: null,
        acknowledgedChangeSignature: null,
        mappedAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      },
    ],
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };

  function createMockFetch(status: number, data: unknown) {
    return vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => (data !== undefined ? JSON.stringify(data) : ""),
      json: async () => data,
    });
  }

  // --------------------------------------------------------------------------
  // 1. Loading Layouts into Workspace
  // --------------------------------------------------------------------------
  describe("loadLayoutIntoWorkspace", () => {
    it("loads layout identity, revision, and status into state", () => {
      const initial = createInitialBuilderState();
      const loaded = loadLayoutIntoWorkspace(initial, mockPersistedLayout, allLocations);

      expect(loaded.loadedLayoutId).toBe("lay-100");
      expect(loaded.loadedLayoutCode).toBe("LAYOUT-CAB-01");
      expect(loaded.loadedLayoutName).toBe("Cabinet 01 Layout");
      expect(loaded.loadedLayoutDescription).toBe("Standard 50-drawer matrix for surface-mount passives");
      expect(loaded.loadedRevision).toBe(3);
      expect(loaded.loadedStatus).toBe("DRAFT");
      expect(loaded.selectedParentLocationId).toBe("loc-cabinet-01");
    });

    it("restores slot-to-location mappings from the persisted payload", () => {
      const initial = createInitialBuilderState();
      const loaded = loadLayoutIntoWorkspace(initial, mockPersistedLayout, allLocations);

      expect(loaded.mappings.size).toBe(1);
      const record = loaded.mappings.get("drawer_slot_r0_c0");
      expect(record).toBeDefined();
      expect(record?.locationId).toBe("loc-drawer-a01");
      expect(record?.locationCode).toBe("DRW-A01");
      expect(record?.isStale).toBe(false);
    });

    it("flags mapping as stale if the server record indicated isStale", () => {
      const layoutWithStaleMapping: SpatialLayoutDto = {
        ...mockPersistedLayout,
        mappings: [
          {
            id: "map-1",
            slotId: "drawer_slot_r0_c0",
            slotCode: "A01",
            locationId: "loc-drawer-a01",
            logicalRow: 0,
            logicalCol: 0,
            isStale: true,
            staleReason: "DIMENSIONS_CHANGED",
            acknowledgedChangeSignature: null,
            mappedAt: new Date("2026-01-01T00:00:00Z"),
            updatedAt: new Date("2026-02-01T00:00:00Z"),
          },
        ],
      };

      const initial = createInitialBuilderState();
      const loaded = loadLayoutIntoWorkspace(initial, layoutWithStaleMapping, allLocations);

      const record = loaded.mappings.get("drawer_slot_r0_c0");
      expect(record?.isStale).toBe(true);
      expect(record?.staleReason).toBe("DIMENSIONS_CHANGED");
    });

    it("sets baseline snapshot so initial dirty check returns false", () => {
      const initial = createInitialBuilderState();
      const loaded = loadLayoutIntoWorkspace(initial, mockPersistedLayout, allLocations);

      expect(computeIsWorkspaceDirty(loaded, mockPersistedLayout)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Unsaved Changes & Workspace Dirty Detection
  // --------------------------------------------------------------------------
  describe("computeIsWorkspaceDirty", () => {
    it("returns false for pristine new draft workspace", () => {
      const initial = createInitialBuilderState();
      expect(computeIsWorkspaceDirty(initial, null)).toBe(false);
    });

    it("detects configuration modifications as dirty", () => {
      const initial = createInitialBuilderState();
      const loaded = loadLayoutIntoWorkspace(initial, mockPersistedLayout, allLocations);
      expect(computeIsWorkspaceDirty(loaded, mockPersistedLayout)).toBe(false);

      const smdConfig = loaded.config as SmdDrawerCabinetConfig;
      const modifiedConfig: SmdDrawerCabinetConfig = {
        ...smdConfig,
        rows: smdConfig.rows + 2,
      };
      const modified = updateParametricConfig(loaded, modifiedConfig);

      expect(computeIsWorkspaceDirty(modified, mockPersistedLayout)).toBe(true);
    });

    it("detects adding a new slot mapping as dirty", () => {
      const initial = createInitialBuilderState();
      const loaded = loadLayoutIntoWorkspace(initial, mockPersistedLayout, allLocations);
      expect(computeIsWorkspaceDirty(loaded, mockPersistedLayout)).toBe(false);

      const mapped = mapSlotToLocation(loaded, "drawer_slot_r0_c1", mockChildLocationB);
      expect(computeIsWorkspaceDirty(mapped, mockPersistedLayout)).toBe(true);
    });

    it("detects removing an existing slot mapping as dirty", () => {
      const initial = createInitialBuilderState();
      const loaded = loadLayoutIntoWorkspace(initial, mockPersistedLayout, allLocations);
      expect(computeIsWorkspaceDirty(loaded, mockPersistedLayout)).toBe(false);

      const unmapped = unmapSlot(loaded, "drawer_slot_r0_c0");
      expect(computeIsWorkspaceDirty(unmapped, mockPersistedLayout)).toBe(true);
    });

    it("clears dirty state when resetting workspace to draft", () => {
      const initial = createInitialBuilderState();
      const loaded = loadLayoutIntoWorkspace(initial, mockPersistedLayout, allLocations);
      const modified = mapSlotToLocation(loaded, "drawer_slot_r0_c1", mockChildLocationB);
      expect(computeIsWorkspaceDirty(modified, mockPersistedLayout)).toBe(true);

      const reset = resetWorkspaceToDraft(modified);
      expect(computeIsWorkspaceDirty(reset, null)).toBe(false);
      expect(reset.loadedLayoutId).toBeNull();
      expect(reset.mappings.size).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Mapping Serialization for API Requests
  // --------------------------------------------------------------------------
  describe("formatWorkspaceMappingsForApi", () => {
    it("serializes workspace mappings into the exact DTO shape required by the API", () => {
      const initial = createInitialBuilderState();
      const loaded = loadLayoutIntoWorkspace(initial, mockPersistedLayout, allLocations);
      const mapped = mapSlotToLocation(loaded, "drawer_slot_r0_c1", mockChildLocationB);

      const apiMappings = formatWorkspaceMappingsForApi(
        mapped.mappings,
        mapped.generatedResult,
      );

      expect(apiMappings).toHaveLength(2);
      expect(apiMappings).toContainEqual(
        expect.objectContaining({
          slotId: "drawer_slot_r0_c0",
          locationId: "loc-drawer-a01",
          slotCode: "A01",
          isStale: false,
        }),
      );
      expect(apiMappings).toContainEqual(
        expect.objectContaining({
          slotId: "drawer_slot_r0_c1",
          locationId: "loc-drawer-a02",
          slotCode: "A02",
          isStale: false,
        }),
      );
    });

    it("propagates acknowledgedChangeSignature when operator acknowledged stale warning", () => {
      const state = createInitialBuilderState();
      const loaded = loadLayoutIntoWorkspace(state, mockPersistedLayout, allLocations);

      // Mutate mapping to be acknowledged
      const record = loaded.mappings.get("drawer_slot_r0_c0")!;
      loaded.mappings.set("drawer_slot_r0_c0", {
        ...record,
        isStale: false,
        acknowledgedChangeSignature: "sig-acknowledged-test",
      });

      const apiMappings = formatWorkspaceMappingsForApi(
        loaded.mappings,
        loaded.generatedResult,
      );
      expect(apiMappings[0]!.acknowledgedChangeSignature).toBe("sig-acknowledged-test");
    });
  });

  // --------------------------------------------------------------------------
  // 4. API Client: Save, Update, Publish, Archive, History & Error Handling
  // --------------------------------------------------------------------------
  describe("spatialLayoutsApi Client", () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      vi.restoreAllMocks();
    });

    it("fetches layouts for a parent location", async () => {
      globalThis.fetch = createMockFetch(200, [mockPersistedLayout]);

      const result = await spatialLayoutsApi.getByParent("loc-cabinet-01");
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("lay-100");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/spatial/layouts/parent/loc-cabinet-01"),
        expect.any(Object),
      );
    });

    it("creates a new draft layout with expected payload", async () => {
      globalThis.fetch = createMockFetch(201, mockPersistedLayout);

      const createDto = {
        parentLocationId: "loc-cabinet-01",
        code: "LAYOUT-CAB-01",
        name: "Cabinet 01 Layout",
        templateType: "SMD_DRAWER_CABINET" as const,
        config: sampleConfig as unknown as Record<string, unknown>,
        mappings: [
          {
            slotId: "drawer_slot_r0_c0",
            slotCode: "A01",
            locationId: "loc-drawer-a01",
          },
        ],
      };

      const result = await spatialLayoutsApi.create(createDto);
      expect(result.id).toBe("lay-100");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/spatial/layouts"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(createDto),
        }),
      );
    });

    it("updates an existing layout with expectedRevision for optimistic concurrency", async () => {
      globalThis.fetch = createMockFetch(200, { ...mockPersistedLayout, revision: 4 });

      const updateDto = {
        name: "Cabinet 01 Layout Renamed",
        expectedRevision: 3,
        changeDescription: "Added second row drawer mappings",
      };

      const result = await spatialLayoutsApi.update("lay-100", updateDto);
      expect(result.revision).toBe(4);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/spatial/layouts/lay-100"),
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify(updateDto),
        }),
      );
    });

    it("throws ApiError with HTTP 409 on revision conflict", async () => {
      const conflictPayload = {
        statusCode: 409,
        error: "REVISION_CONFLICT",
        message: "Revision conflict: current revision is 4, expected 3",
        currentRevision: 4,
        expectedRevision: 3,
      };

      globalThis.fetch = createMockFetch(409, conflictPayload);

      await expect(
        spatialLayoutsApi.update("lay-100", {
          name: "Conflict update",
          expectedRevision: 3,
        }),
      ).rejects.toSatisfy((err) => {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).statusCode).toBe(409);
        expect((err as ApiError).details).toEqual(conflictPayload);
        return true;
      });
    });

    it("publishes a layout and sends overwriteManualSpatialNodes flag when specified", async () => {
      globalThis.fetch = createMockFetch(200, { ...mockPersistedLayout, status: "PUBLISHED", revision: 4 });

      const result = await spatialLayoutsApi.publish("lay-100", {
        expectedRevision: 3,
        overwriteManualSpatialNodes: true,
        changeDescription: "Publishing verified SMD rack layout",
      });

      expect(result.status).toBe("PUBLISHED");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/spatial/layouts/lay-100/publish"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            expectedRevision: 3,
            overwriteManualSpatialNodes: true,
            changeDescription: "Publishing verified SMD rack layout",
          }),
        }),
      );
    });

    it("handles 409 PUBLISHED_LAYOUT_ALREADY_EXISTS conflict on publish", async () => {
      const conflictPayload = {
        statusCode: 409,
        error: "PUBLISHED_LAYOUT_ALREADY_EXISTS",
        message: "Another layout is already PUBLISHED for this parent location",
        conflictingLayoutId: "lay-published-prior",
      };

      globalThis.fetch = createMockFetch(409, conflictPayload);

      await expect(
        spatialLayoutsApi.publish("lay-100", { expectedRevision: 3 }),
      ).rejects.toSatisfy((err) => {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).statusCode).toBe(409);
        expect((err as ApiError).details).toEqual(conflictPayload);
        return true;
      });
    });

    it("handles 409 SPATIAL_NODE_OWNERSHIP_CONFLICT when manual CAD nodes exist", async () => {
      const conflictPayload = {
        statusCode: 409,
        error: "SPATIAL_NODE_OWNERSHIP_CONFLICT",
        message: "Manual spatial nodes exist and overwrite was not confirmed",
      };

      globalThis.fetch = createMockFetch(409, conflictPayload);

      await expect(
        spatialLayoutsApi.publish("lay-100", { expectedRevision: 3 }),
      ).rejects.toSatisfy((err) => {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).statusCode).toBe(409);
        expect((err as ApiError).details).toEqual(conflictPayload);
        return true;
      });
    });

    it("surfaces 422 INACTIVE_LAYOUT_PARENT distinctly from hierarchy errors", async () => {
      const inactiveParentPayload = {
        statusCode: 422,
        error: "INACTIVE_LAYOUT_PARENT",
        message:
          "Cannot publish layout because its parent container location 'loc-cabinet-01' is inactive.",
        parentLocationId: "loc-cabinet-01",
      };

      globalThis.fetch = createMockFetch(422, inactiveParentPayload);

      await expect(
        spatialLayoutsApi.publish("lay-100", { expectedRevision: 3 }),
      ).rejects.toSatisfy((err) => {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).statusCode).toBe(422);
        const details = (err as ApiError).details as Record<string, unknown>;
        // Distinct error code (not a hierarchy-validation code) plus the
        // parent id the dialog renders — this is what the workspace branches on.
        expect(details.error).toBe("INACTIVE_LAYOUT_PARENT");
        expect(details.error).not.toBe("CONCURRENT_HIERARCHY_MUTATION");
        expect(details.error).not.toBe("INACTIVE_LOCATION_MAPPED");
        expect(details.parentLocationId).toBe("loc-cabinet-01");
        return true;
      });
    });

    it("archives an active layout", async () => {
      globalThis.fetch = createMockFetch(200, { ...mockPersistedLayout, status: "ARCHIVED" });

      const result = await spatialLayoutsApi.archive("lay-100", {
        expectedRevision: 3,
        changeDescription: "Replaced by larger cabinet layout",
      });

      expect(result.status).toBe("ARCHIVED");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/spatial/layouts/lay-100/archive"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            expectedRevision: 3,
            changeDescription: "Replaced by larger cabinet layout",
          }),
        }),
      );
    });

    it("retrieves immutable revision history snapshots", async () => {
      const mockRevisions: SpatialLayoutRevisionDto[] = [
        {
          id: "rev-1",
          layoutId: "lay-100",
          revisionNumber: 1,
          configSnapshot: sampleConfig,
          mappingsSnapshot: [],
          diffSummary: {},
          changeDescription: "Initial creation",
          authorId: "usr-1",
          createdAt: new Date("2026-01-01T00:00:00Z"),
        },
        {
          id: "rev-2",
          layoutId: "lay-100",
          revisionNumber: 2,
          configSnapshot: sampleConfig,
          mappingsSnapshot: [
            {
              slotId: "drawer_slot_r0_c0",
              slotCode: "A01",
              locationId: "loc-drawer-a01",
              locationCode: "DRW-A01",
              isStale: false,
            },
          ],
          diffSummary: {},
          changeDescription: "Mapped drawer 1",
          authorId: "usr-1",
          createdAt: new Date("2026-01-02T00:00:00Z"),
        },
      ];

      globalThis.fetch = createMockFetch(200, mockRevisions);

      const revisions = await spatialLayoutsApi.getRevisions("lay-100");
      expect(revisions).toHaveLength(2);
      expect(revisions[0]!.revisionNumber).toBe(1);
      expect(revisions[1]!.revisionNumber).toBe(2);
    });
  });
});

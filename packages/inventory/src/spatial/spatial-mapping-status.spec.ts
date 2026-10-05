import { describe, expect, it } from "vitest";
import {
  computeSpatialMappingStatus,
  resolveSpatialContainerStatus,
} from "./spatial-mapping-status";

describe("Spatial Mapping Status — authoritative semantics", () => {
  it("reports a placed location with no children as MAPPED", () => {
    const result = computeSpatialMappingStatus({
      parentId: "cabinet-1",
      hasSpatialNode: true,
      directChildCount: 0,
      mappedDirectChildCount: 0,
    });

    expect(result.status).toBe("MAPPED");
    expect(result.isMappingEligible).toBe(true);
    expect(result.unmappedDirectChildCount).toBe(0);
  });

  it("reports a placed location with partially mapped children as PARTIAL", () => {
    const result = computeSpatialMappingStatus({
      parentId: "warehouse-1",
      hasSpatialNode: true,
      directChildCount: 4,
      mappedDirectChildCount: 3,
    });

    expect(result.status).toBe("PARTIAL");
    expect(result.unmappedDirectChildCount).toBe(1);
  });

  it("reports an unplaced location with a parent as UNMAPPED", () => {
    const result = computeSpatialMappingStatus({
      parentId: "cabinet-1",
      hasSpatialNode: false,
      directChildCount: 2,
      mappedDirectChildCount: 2,
    });

    expect(result.status).toBe("UNMAPPED");
    expect(result.isMappingEligible).toBe(true);
  });

  it("never reports a top-level facility as UNMAPPED", () => {
    const result = computeSpatialMappingStatus({
      parentId: null,
      hasSpatialNode: false,
      directChildCount: 3,
      mappedDirectChildCount: 3,
    });

    expect(result.status).toBe("ROOT");
    expect(result.isMappingEligible).toBe(false);
  });

  it("keeps a node-only location MAPPED without inventing an anchor or model requirement", () => {
    const result = computeSpatialMappingStatus({
      parentId: "warehouse-1",
      hasSpatialNode: true,
      directChildCount: 0,
      mappedDirectChildCount: 0,
    });

    expect(result.status).toBe("MAPPED");
    expect(result.hasSpatialNode).toBe(true);
  });

  it("resolves container status with published taking precedence over draft", () => {
    expect(resolveSpatialContainerStatus([])).toBe("NONE");
    expect(resolveSpatialContainerStatus(["ARCHIVED"])).toBe("ARCHIVED");
    expect(resolveSpatialContainerStatus(["DRAFT", "ARCHIVED"])).toBe("DRAFT");
    expect(resolveSpatialContainerStatus(["DRAFT", "PUBLISHED"])).toBe(
      "PUBLISHED",
    );
  });

  it("reports container status independently of the location's own placement", () => {
    const result = computeSpatialMappingStatus({
      parentId: null,
      hasSpatialNode: false,
      directChildCount: 0,
      mappedDirectChildCount: 0,
      layoutStatuses: ["PUBLISHED"],
    });

    expect(result.status).toBe("ROOT");
    expect(result.containerStatus).toBe("PUBLISHED");
  });

  it("clamps a negative unmapped child count defensively", () => {
    const result = computeSpatialMappingStatus({
      parentId: "warehouse-1",
      hasSpatialNode: true,
      directChildCount: 1,
      mappedDirectChildCount: 3,
    });

    expect(result.unmappedDirectChildCount).toBe(0);
    expect(result.status).toBe("MAPPED");
  });
});

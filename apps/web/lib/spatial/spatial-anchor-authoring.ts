import type {
  SpatialAnchorDto,
  SpatialModelDto,
  BulkSaveSpatialAnchorsPayload,
} from "@/lib/api/spatial-api";
import {
  resolveChildPosition,
  resolveChildRotation,
  type SceneChildLayout,
  type Vector3D,
} from "./spatial-3d-layout";

export interface DraftAnchor {
  id: string;
  modelId: string;
  code: string;
  name: string;
  anchorType: string;
  localPositionX: number; // mm
  localPositionY: number; // mm
  localPositionZ: number; // mm
  localRotationX: number; // degrees
  localRotationY: number; // degrees
  localRotationZ: number; // degrees
  boundingWidthMm: number | null; // mm
  boundingHeightMm: number | null; // mm
  boundingDepthMm: number | null; // mm
  metadata: Record<string, unknown>;
  isNew?: boolean;
  isModified?: boolean;
}

export interface AnchorValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface AnchorBoundsResult {
  withinBounds: boolean;
  warning?: string;
}

export interface AnchorDiff {
  added: DraftAnchor[];
  updated: DraftAnchor[];
  deletedIds: string[];
  hasChanges: boolean;
}

/**
 * Converts a persisted SpatialAnchorDto into an editable DraftAnchor in memory.
 */
export function fromSpatialAnchor(anchor: SpatialAnchorDto): DraftAnchor {
  return {
    id: anchor.id,
    modelId: anchor.modelId,
    code: anchor.code,
    name: anchor.name,
    anchorType: anchor.anchorType || "SLOT",
    localPositionX: Number(anchor.localPositionX ?? 0),
    localPositionY: Number(anchor.localPositionY ?? 0),
    localPositionZ: Number(anchor.localPositionZ ?? 0),
    localRotationX: Number(anchor.localRotationX ?? 0),
    localRotationY: Number(anchor.localRotationY ?? 0),
    localRotationZ: Number(anchor.localRotationZ ?? 0),
    boundingWidthMm:
      anchor.boundingWidthMm != null ? Number(anchor.boundingWidthMm) : null,
    boundingHeightMm:
      anchor.boundingHeightMm != null ? Number(anchor.boundingHeightMm) : null,
    boundingDepthMm:
      anchor.boundingDepthMm != null ? Number(anchor.boundingDepthMm) : null,
    metadata: anchor.metadata ? { ...anchor.metadata } : {},
    isNew: false,
    isModified: false,
  };
}

/**
 * Creates a sensible new draft anchor within parent model boundaries.
 */
export function createDefaultDraftAnchor(
  modelId: string,
  existingAnchors: DraftAnchor[],
  model?: SpatialModelDto | null,
): DraftAnchor {
  // Generate a distinct sequential code
  let candidateCode = `A0${existingAnchors.length + 1}`;
  let count = 1;
  while (
    existingAnchors.some(
      (a) => a.code.toUpperCase() === candidateCode.toUpperCase(),
    )
  ) {
    count++;
    candidateCode = `A${count < 10 ? `0${count}` : count}`;
  }

  const modelWidth = model ? Number(model.widthMm) : 600;
  const modelHeight = model ? Number(model.heightMm) : 600;
  const modelDepth = model ? Number(model.depthMm) : 400;

  // Place in center of carcass by default
  const posX = Math.round(modelWidth / 2);
  const posY = Math.round(modelHeight / 2);
  const posZ = 0;

  const defaultBw = Math.min(180, Math.round(modelWidth * 0.4));
  const defaultBh = Math.min(120, Math.round(modelHeight * 0.3));
  const defaultBd = Math.min(300, Math.round(modelDepth * 0.8));

  return {
    id: `draft-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    modelId,
    code: candidateCode,
    name: `Anchor ${candidateCode}`,
    anchorType: "SLOT",
    localPositionX: posX,
    localPositionY: posY,
    localPositionZ: posZ,
    localRotationX: 0,
    localRotationY: 0,
    localRotationZ: 0,
    boundingWidthMm: defaultBw > 0 ? defaultBw : 100,
    boundingHeightMm: defaultBh > 0 ? defaultBh : 100,
    boundingDepthMm: defaultBd > 0 ? defaultBd : 100,
    metadata: {},
    isNew: true,
    isModified: true,
  };
}

/**
 * Validates a draft anchor against API rules and duplicate code constraints.
 */
export function validateAnchor(
  anchor: DraftAnchor,
  allAnchors: DraftAnchor[],
): AnchorValidationResult {
  const errors: string[] = [];

  const trimmedCode = anchor.code.trim();
  if (!trimmedCode) {
    errors.push("Anchor code is required.");
  } else if (trimmedCode.length > 64) {
    errors.push("Anchor code cannot exceed 64 characters.");
  } else {
    const isDuplicate = allAnchors.some(
      (a) =>
        a.id !== anchor.id &&
        a.code.trim().toUpperCase() === trimmedCode.toUpperCase(),
    );
    if (isDuplicate) {
      errors.push(`Anchor code "${trimmedCode}" is already in use on this model.`);
    }
  }

  const trimmedName = anchor.name.trim();
  if (!trimmedName) {
    errors.push("Anchor name is required.");
  } else if (trimmedName.length > 128) {
    errors.push("Anchor name cannot exceed 128 characters.");
  }

  if (isNaN(anchor.localPositionX)) errors.push("Position X must be a valid number.");
  if (isNaN(anchor.localPositionY)) errors.push("Position Y must be a valid number.");
  if (isNaN(anchor.localPositionZ)) errors.push("Position Z must be a valid number.");

  if (isNaN(anchor.localRotationX)) errors.push("Rotation X must be a valid number.");
  if (isNaN(anchor.localRotationY)) errors.push("Rotation Y must be a valid number.");
  if (isNaN(anchor.localRotationZ)) errors.push("Rotation Z must be a valid number.");

  if (anchor.boundingWidthMm != null && anchor.boundingWidthMm <= 0) {
    errors.push("Bounding width must be greater than 0 mm.");
  }
  if (anchor.boundingHeightMm != null && anchor.boundingHeightMm <= 0) {
    errors.push("Bounding height must be greater than 0 mm.");
  }
  if (anchor.boundingDepthMm != null && anchor.boundingDepthMm <= 0) {
    errors.push("Bounding depth must be greater than 0 mm.");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Evaluates whether an anchor fits inside its parent model envelope.
 */
export function validateAnchorBounds(
  anchor: DraftAnchor,
  model: SpatialModelDto | null | undefined,
): AnchorBoundsResult {
  if (!model) {
    return { withinBounds: true };
  }

  const widthMm = Number(model.widthMm);
  const heightMm = Number(model.heightMm);
  const depthMm = Number(model.depthMm);

  if (widthMm <= 0 || heightMm <= 0 || depthMm <= 0) {
    return { withinBounds: true };
  }

  const bw = anchor.boundingWidthMm ?? 0;
  const bh = anchor.boundingHeightMm ?? 0;
  const bd = anchor.boundingDepthMm ?? 0;

  const halfW = bw / 2;
  const halfH = bh / 2;
  const halfD = bd / 2;

  // Vertical boundary check: bottom >= 0 and top <= heightMm
  const yMin = anchor.localPositionY - halfH;
  const yMax = anchor.localPositionY + halfH;
  if (yMin < -1 || yMax > heightMm + 1) {
    return {
      withinBounds: false,
      warning: `Anchor extends outside model height (vertical extent ${Math.round(yMin)}mm to ${Math.round(yMax)}mm, model height ${heightMm}mm).`,
    };
  }

  // Horizontal X boundary check
  // Supports either corner [0, W] or centered [-W/2, W/2]
  const xMin = anchor.localPositionX - halfW;
  const xMax = anchor.localPositionX + halfW;
  const withinCorner = xMin >= -1 && xMax <= widthMm + 1;
  const withinCenter = xMin >= -widthMm / 2 - 1 && xMax <= widthMm / 2 + 1;

  if (!withinCorner && !withinCenter) {
    return {
      withinBounds: false,
      warning: `Anchor extends outside model width (horizontal extent ${Math.round(xMin)}mm to ${Math.round(xMax)}mm, model width ${widthMm}mm).`,
    };
  }

  // Depth Z boundary check
  const zMin = anchor.localPositionZ - halfD;
  const zMax = anchor.localPositionZ + halfD;
  const withinZCorner = zMin >= -1 && zMax <= depthMm + 1;
  const withinZCenter = zMin >= -depthMm / 2 - 1 && zMax <= depthMm / 2 + 1;

  if (!withinZCorner && !withinZCenter) {
    return {
      withinBounds: false,
      warning: `Anchor extends outside model depth (depth extent ${Math.round(zMin)}mm to ${Math.round(zMax)}mm, model depth ${depthMm}mm).`,
    };
  }

  return { withinBounds: true };
}

/**
 * Computes live preview transforms for child locations when their attached anchors move.
 */
export function computeAnchorPreviewLayout(
  initialChildrenLayout: SceneChildLayout[],
  draftAnchors: DraftAnchor[],
  parentDimensions: Vector3D | null | undefined,
): SceneChildLayout[] {
  const anchorMap = new Map<string, DraftAnchor>();
  for (const a of draftAnchors) {
    anchorMap.set(a.id, a);
  }

  return initialChildrenLayout.map((child) => {
    const anchorId = child.rawChild.anchor?.id;
    if (!anchorId) return child;

    const draft = anchorMap.get(anchorId);
    if (!draft) return child;

    // Convert draft to a duck-typed SpatialAnchorDto for layout resolution
    const syntheticAnchor: SpatialAnchorDto = {
      id: draft.id,
      modelId: draft.modelId,
      code: draft.code,
      name: draft.name,
      anchorType: draft.anchorType,
      localPositionX: draft.localPositionX,
      localPositionY: draft.localPositionY,
      localPositionZ: draft.localPositionZ,
      localRotationX: draft.localRotationX,
      localRotationY: draft.localRotationY,
      localRotationZ: draft.localRotationZ,
      boundingWidthMm: draft.boundingWidthMm ?? null,
      boundingHeightMm: draft.boundingHeightMm ?? null,
      boundingDepthMm: draft.boundingDepthMm ?? null,
      metadata: draft.metadata,
    };

    const newPosition = resolveChildPosition(
      child.rawChild.node,
      syntheticAnchor,
      parentDimensions,
    );
    const newRotation = resolveChildRotation(
      child.rawChild.node,
      syntheticAnchor,
    );

    return {
      ...child,
      position: newPosition,
      rotation: newRotation,
      anchorCode: draft.code,
      rawChild: {
        ...child.rawChild,
        anchor: syntheticAnchor,
      },
    };
  });
}

/**
 * Calculates differences between initial persisted anchors and current drafts.
 */
export function getAnchorDiff(
  initialAnchors: SpatialAnchorDto[],
  currentDrafts: DraftAnchor[],
): AnchorDiff {
  const initialMap = new Map<string, SpatialAnchorDto>();
  for (const a of initialAnchors) {
    initialMap.set(a.id, a);
  }

  const currentIds = new Set<string>();
  const added: DraftAnchor[] = [];
  const updated: DraftAnchor[] = [];

  for (const draft of currentDrafts) {
    currentIds.add(draft.id);

    if (draft.isNew || !initialMap.has(draft.id)) {
      added.push(draft);
      continue;
    }

    const init = initialMap.get(draft.id)!;
    const isModified =
      init.code !== draft.code ||
      init.name !== draft.name ||
      (init.anchorType || "SLOT") !== (draft.anchorType || "SLOT") ||
      Number(init.localPositionX ?? 0) !== draft.localPositionX ||
      Number(init.localPositionY ?? 0) !== draft.localPositionY ||
      Number(init.localPositionZ ?? 0) !== draft.localPositionZ ||
      Number(init.localRotationX ?? 0) !== draft.localRotationX ||
      Number(init.localRotationY ?? 0) !== draft.localRotationY ||
      Number(init.localRotationZ ?? 0) !== draft.localRotationZ ||
      (init.boundingWidthMm != null ? Number(init.boundingWidthMm) : null) !==
        draft.boundingWidthMm ||
      (init.boundingHeightMm != null ? Number(init.boundingHeightMm) : null) !==
        draft.boundingHeightMm ||
      (init.boundingDepthMm != null ? Number(init.boundingDepthMm) : null) !==
        draft.boundingDepthMm;

    if (isModified) {
      updated.push(draft);
    }
  }

  const deletedIds: string[] = [];
  for (const init of initialAnchors) {
    if (!currentIds.has(init.id)) {
      deletedIds.push(init.id);
    }
  }

  const hasChanges =
    added.length > 0 || updated.length > 0 || deletedIds.length > 0;

  return {
    added,
    updated,
    deletedIds,
    hasChanges,
  };
}

/**
 * Converts local authoring diff into transactional bulk save payload.
 */
export function buildBulkSavePayload(
  diff: AnchorDiff,
  expectedModelUpdatedAt?: string,
): BulkSaveSpatialAnchorsPayload {
  return {
    expectedModelUpdatedAt,
    creates: diff.added.map((a) => ({
      code: a.code.trim(),
      name: a.name.trim(),
      anchorType: a.anchorType || "SLOT",
      localPositionX: a.localPositionX,
      localPositionY: a.localPositionY,
      localPositionZ: a.localPositionZ,
      localRotationX: a.localRotationX,
      localRotationY: a.localRotationY,
      localRotationZ: a.localRotationZ,
      boundingWidthMm: a.boundingWidthMm ?? undefined,
      boundingHeightMm: a.boundingHeightMm ?? undefined,
      boundingDepthMm: a.boundingDepthMm ?? undefined,
      metadata: a.metadata,
    })),
    updates: diff.updated.map((u) => ({
      id: u.id,
      code: u.code.trim(),
      name: u.name.trim(),
      anchorType: u.anchorType || "SLOT",
      localPositionX: u.localPositionX,
      localPositionY: u.localPositionY,
      localPositionZ: u.localPositionZ,
      localRotationX: u.localRotationX,
      localRotationY: u.localRotationY,
      localRotationZ: u.localRotationZ,
      boundingWidthMm: u.boundingWidthMm ?? undefined,
      boundingHeightMm: u.boundingHeightMm ?? undefined,
      boundingDepthMm: u.boundingDepthMm ?? undefined,
      metadata: u.metadata,
    })),
    deleteIds: diff.deletedIds,
  };
}

/**
 * Formats save errors clearly, identifying concurrency conflicts while preserving draft state.
 */
export function formatSaveAnchorError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes("409") ||
      msg.includes("conflict") ||
      msg.includes("modified by another")
    ) {
      return "Conflict: This model or its anchors have been modified by another operation. Your unsaved draft has been preserved. Please review or save again.";
    }
    return error.message;
  }
  return "Failed to save anchors. Your unsaved draft has been preserved.";
}

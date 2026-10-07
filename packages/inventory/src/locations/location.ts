import { ObjectId } from "@ananya/core";
import {
  SPATIAL_LOCATION_CATEGORIES,
  normalizeLocationCategory,
} from "../spatial/location-model";
import {
  InvalidLocationCodeError,
  InvalidLocationNameError,
  InvalidLocationKindError,
} from "./location.errors";

/** Legacy spellings accepted on write and canonicalized. */
export const LEGACY_LOCATION_KIND_ALIASES = [
  "room",
  "area",
  "tray",
  "tube",
  "rail",
  "ic_tube",
] as const;

/**
 * Canonicalizes a location kind for persistence.
 *
 * The canonical taxonomy is authoritative: a legacy alias (`room`, `area`,
 * `tray`, `tube`, `rail`, `ic_tube`) is accepted and normalized to its canonical
 * category, and an unknown value (`pallet`, or a free-form string) is rejected.
 * Only canonical categories are ever persisted.
 */
function resolveCanonicalKind(rawKind: string): string {
  const trimmed = rawKind.trim();
  if (!trimmed) {
    throw new InvalidLocationKindError("Location kind is required");
  }
  const category = normalizeLocationCategory(trimmed);
  if (category === null) {
    throw new InvalidLocationKindError(
      `Unknown location kind '${trimmed}'. Expected one of: ${SPATIAL_LOCATION_CATEGORIES.join(
        ", ",
      )}. Legacy aliases (${LEGACY_LOCATION_KIND_ALIASES.join(", ")}) are accepted.`,
    );
  }
  return category;
}

/**
 * Canonicalizes a location kind for persistence. Exposed so callers that need
 * the canonical value without constructing an aggregate (e.g. validating a
 * prospective update) share the exact same normalization.
 */
export function canonicalizeLocationKind(rawKind: string): string {
  return resolveCanonicalKind(rawKind);
}

export interface LocationProps {
  id: string;
  code: string;
  name: string;
  kind: string;
  parentId: string | null;
  containerId: string | null;
  isActive: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateLocationInput {
  code: string;
  name: string;
  kind: string;
  parentId?: string | null;
  /** Physical container (RFC-0069). Omitted or null means "not physically contained". */
  containerId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface UpdateLocationInput {
  code?: string;
  name?: string;
  kind?: string;
  parentId?: string | null;
  /**
   * Physical container (RFC-0069). Omitted leaves the current value unchanged;
   * `null` explicitly clears it; a UUID replaces it (after validation).
   */
  containerId?: string | null;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
}

export class Location {
  public readonly id: string;
  public readonly code: string;
  public readonly name: string;
  public readonly kind: string;
  /**
   * ORGANIZATIONAL parent. Grouping/navigation only — never asserts physical
   * containment. See {@link containerId} for the physical relation.
   */
  public readonly parentId: string | null;
  /**
   * PHYSICAL container. What this location is physically stored inside.
   * Independent of {@link parentId}; neither is derived from the other.
   */
  public readonly containerId: string | null;
  public readonly isActive: boolean;
  public readonly metadata: Record<string, unknown>;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  private constructor(props: LocationProps) {
    this.id = props.id;
    this.code = props.code;
    this.name = props.name;
    this.kind = props.kind;
    this.parentId = props.parentId;
    this.containerId = props.containerId;
    this.isActive = props.isActive;
    this.metadata = props.metadata;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /**
   * Creates a new Location aggregate.
   * Owns identity generation, timestamps, defaults, normalization, and invariants.
   */
  public static create(input: CreateLocationInput): Location {
    // Normalize code: trim and uppercase
    const code = input.code.trim().toUpperCase();

    // Normalize name: trim
    const name = input.name.trim();

    // Normalize and validate kind: legacy aliases are canonicalized, unknown
    // values are rejected. Only a canonical category is persisted.
    const kind = resolveCanonicalKind(input.kind);

    // Validate code
    if (!code) {
      throw new InvalidLocationCodeError("Location code is required");
    }

    // Validate name
    if (!name) {
      throw new InvalidLocationNameError("Location name is required");
    }

    // Generate identity and timestamps
    const id = ObjectId.generate().value;
    const createdAt = new Date();
    const updatedAt = createdAt;

    return new Location({
      id,
      code,
      name,
      kind,
      parentId: input.parentId ?? null,
      // Physical containment is independent of the organizational parent and is
      // never inferred from it. Omitted / null both mean "not contained".
      containerId: input.containerId ?? null,
      isActive: true, // Default to active
      metadata: input.metadata ?? {},
      createdAt,
      updatedAt,
    });
  }

  /**
   * Updates existing Location aggregate parameters maintaining invariants.
   */
  public update(input: UpdateLocationInput): Location {
    const code =
      input.code !== undefined ? input.code.trim().toUpperCase() : this.code;
    const name = input.name !== undefined ? input.name.trim() : this.name;
    // Kind changes go through the same canonicalization as creation; an
    // unchanged kind keeps the (already canonical) persisted value.
    const kind =
      input.kind !== undefined ? resolveCanonicalKind(input.kind) : this.kind;

    if (!code) {
      throw new InvalidLocationCodeError("Location code is required");
    }
    if (!name) {
      throw new InvalidLocationNameError("Location name is required");
    }
    if (!kind) {
      throw new InvalidLocationKindError("Location kind is required");
    }

    return new Location({
      id: this.id,
      code,
      name,
      kind,
      parentId: input.parentId !== undefined ? input.parentId : this.parentId,
      // Omission leaves the physical container unchanged; an explicit null
      // clears it. Never derived from parentId.
      containerId:
        input.containerId !== undefined ? input.containerId : this.containerId,
      isActive: input.isActive !== undefined ? input.isActive : this.isActive,
      metadata: input.metadata !== undefined ? input.metadata : this.metadata,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  /**
   * Rehydrates an existing Location from persistence.
   * Reconstructs state exactly as stored without validation or normalization.
   * Used only by repositories when loading from the database.
   */
  public static rehydrate(props: LocationProps): Location {
    return new Location(props);
  }
}

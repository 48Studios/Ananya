import { ObjectId } from "@ananya/core";

export interface SerialProps {
  id: string;
  componentId: string;
  serialNumber: string;
  locationId?: string | null;
  createdAt: Date;
}

export interface CreateSerialInput {
  componentId: string;
  serialNumber: string;
  locationId?: string | null;
}

export class Serial {
  public readonly id: string;
  public readonly componentId: string;
  public readonly serialNumber: string;
  public readonly locationId?: string | null;
  public readonly createdAt: Date;

  private constructor(props: SerialProps) {
    this.id = props.id;
    this.componentId = props.componentId;
    this.serialNumber = props.serialNumber;
    this.locationId = props.locationId;
    this.createdAt = props.createdAt;
  }

  public static create(input: CreateSerialInput): Serial {
    if (!input.serialNumber || input.serialNumber.trim() === "") {
      throw new Error("Serial number is required");
    }
    if (!input.componentId || input.componentId.trim() === "") {
      throw new Error("Component ID is required");
    }

    const id = ObjectId.generate().value;
    const createdAt = new Date();

    return new Serial({
      id,
      componentId: input.componentId,
      serialNumber: input.serialNumber.trim(),
      locationId: input.locationId ?? null,
      createdAt,
    });
  }

  /**
   * Reassigns this serial to a different component, preserving its identity.
   *
   * Used by component consolidation: a serial number identifies a physical unit,
   * so it keeps its serial number, location and creation timestamp and only
   * changes which component record it is filed under.
   *
   * The (component, serial number) uniqueness constraint is enforced by the
   * database; callers must check for a collision first so a real collision is
   * reported as a blocker rather than surfacing as a constraint violation.
   */
  public reassignTo(componentId: string): Serial {
    if (!componentId || componentId.trim() === "") {
      throw new Error("Component ID is required");
    }

    if (componentId === this.componentId) return this;

    return new Serial({
      id: this.id,
      componentId,
      serialNumber: this.serialNumber,
      locationId: this.locationId,
      createdAt: this.createdAt,
    });
  }

  public static rehydrate(props: SerialProps): Serial {
    return new Serial(props);
  }
}

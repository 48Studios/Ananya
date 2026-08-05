import { ObjectId } from "@ananya/core";
import {
  InvalidProjectStatusError,
  ProjectMaterialError,
} from "./project.errors";

export type ProjectStatus =
  "PLANNING" | "ACTIVE" | "ON_HOLD" | "COMPLETED" | "ARCHIVED" | "CANCELLED";

export type ProjectType =
  | "CUSTOMER"
  | "INTERNAL"
  | "R_AND_D"
  | "PROTOTYPE"
  | "INSTALLATION"
  | "MANUFACTURING_INITIATIVE";

export type ProjectPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export type MilestoneStatus = "OPEN" | "COMPLETED";

export type ProjectActivityType =
  | "CREATED"
  | "STATUS_CHANGED"
  | "MATERIAL_ALLOCATED"
  | "MATERIAL_ISSUED"
  | "MATERIAL_RETURNED"
  | "ARCHIVED";

export interface ProjectMaterialProps {
  id: string;
  projectId: string;
  componentId: string;
  locationId: string;
  allocatedQuantity: number;
  issuedQuantity: number;
  returnedQuantity: number;
  unitOfMeasure: string;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectActivityProps {
  id: string;
  projectId: string;
  activityType: ProjectActivityType;
  description: string;
  performedBy: string;
  metadata?: string | null;
  createdAt: Date;
}

export interface MilestoneProps {
  id: string;
  projectId: string;
  name: string;
  dueDate: Date;
  status: MilestoneStatus;
  completionPercentage: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectProps {
  id: string;
  projectNumber: string;
  name: string;
  projectType: ProjectType;
  description?: string | null;
  owner: string;
  projectManager: string;
  customerId?: string | null;
  salesOrderId?: string | null;
  startDate: Date;
  targetCompletionDate: Date;
  priority: ProjectPriority;
  status: ProjectStatus;
  materials: ProjectMaterialProps[];
  activities: ProjectActivityProps[];
  milestones: MilestoneProps[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProjectProps {
  projectNumber: string;
  name: string;
  projectType?: ProjectType;
  description?: string;
  owner?: string;
  projectManager: string;
  customerId?: string;
  salesOrderId?: string;
  startDate: Date;
  targetCompletionDate: Date;
  priority?: ProjectPriority;
}

export interface UpdateProjectProps {
  name?: string;
  projectType?: ProjectType;
  description?: string;
  owner?: string;
  projectManager?: string;
  customerId?: string;
  salesOrderId?: string;
  startDate?: Date;
  targetCompletionDate?: Date;
  priority?: ProjectPriority;
}

export class Project implements ProjectProps {
  public readonly id: string;
  public projectNumber: string;
  public name: string;
  public projectType: ProjectType;
  public description?: string | null;
  public owner: string;
  public projectManager: string;
  public customerId?: string | null;
  public salesOrderId?: string | null;
  public startDate: Date;
  public targetCompletionDate: Date;
  public priority: ProjectPriority;
  public status: ProjectStatus;
  public materials: ProjectMaterialProps[];
  public activities: ProjectActivityProps[];
  public milestones: MilestoneProps[];
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: ProjectProps) {
    this.id = props.id;
    this.projectNumber = props.projectNumber;
    this.name = props.name;
    this.projectType = props.projectType;
    this.description = props.description;
    this.owner = props.owner;
    this.projectManager = props.projectManager;
    this.customerId = props.customerId;
    this.salesOrderId = props.salesOrderId;
    this.startDate = props.startDate;
    this.targetCompletionDate = props.targetCompletionDate;
    this.priority = props.priority;
    this.status = props.status;
    this.materials = props.materials;
    this.activities = props.activities;
    this.milestones = props.milestones;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(props: CreateProjectProps): Project {
    if (!props.name || props.name.trim() === "") {
      throw new Error("Project name is required");
    }
    if (props.targetCompletionDate < props.startDate) {
      throw new Error("Target completion date cannot be before start date");
    }

    const now = new Date();
    const projectId = ObjectId.generate().value;
    const project = new Project({
      id: projectId,
      projectNumber: props.projectNumber,
      name: props.name.trim(),
      projectType: props.projectType || "INTERNAL",
      description: props.description,
      owner: props.owner || props.projectManager || "Project Lead",
      projectManager: props.projectManager,
      customerId: props.customerId || null,
      salesOrderId: props.salesOrderId || null,
      startDate: props.startDate,
      targetCompletionDate: props.targetCompletionDate,
      priority: props.priority || "MEDIUM",
      status: "PLANNING",
      materials: [],
      activities: [],
      milestones: [],
      createdAt: now,
      updatedAt: now,
    });

    project.logActivity({
      activityType: "CREATED",
      description: `Project "${project.name}" (${project.projectNumber}) created under status PLANNING`,
      performedBy: project.owner,
    });

    return project;
  }

  public static rehydrate(props: ProjectProps): Project {
    return new Project(props);
  }

  public update(
    props: UpdateProjectProps,
    performedBy = "Project Manager",
  ): void {
    if (
      this.status === "COMPLETED" ||
      this.status === "ARCHIVED" ||
      this.status === "CANCELLED"
    ) {
      throw new InvalidProjectStatusError(
        `Cannot edit project in status ${this.status}`,
      );
    }

    if (props.name !== undefined) this.name = props.name.trim();
    if (props.projectType !== undefined) this.projectType = props.projectType;
    if (props.description !== undefined) this.description = props.description;
    if (props.owner !== undefined) this.owner = props.owner;
    if (props.projectManager !== undefined)
      this.projectManager = props.projectManager;
    if (props.customerId !== undefined) this.customerId = props.customerId;
    if (props.salesOrderId !== undefined)
      this.salesOrderId = props.salesOrderId;
    if (props.startDate !== undefined) this.startDate = props.startDate;
    if (props.targetCompletionDate !== undefined)
      this.targetCompletionDate = props.targetCompletionDate;
    if (props.priority !== undefined) this.priority = props.priority;

    this.updatedAt = new Date();
    this.logActivity({
      activityType: "STATUS_CHANGED",
      description: `Updated project metadata & parameters`,
      performedBy,
    });
  }

  public start(performedBy = "Project Manager"): void {
    if (
      this.status === "COMPLETED" ||
      this.status === "ARCHIVED" ||
      this.status === "CANCELLED"
    ) {
      throw new InvalidProjectStatusError(
        `Cannot start project in status ${this.status}`,
      );
    }
    const prevStatus = this.status;
    this.status = "ACTIVE";
    this.updatedAt = new Date();
    this.logActivity({
      activityType: "STATUS_CHANGED",
      description: `Project status transitioned from ${prevStatus} to ACTIVE`,
      performedBy,
    });
  }

  public pause(performedBy = "Project Manager"): void {
    if (this.status !== "ACTIVE") {
      throw new InvalidProjectStatusError(
        `Only ACTIVE projects can be paused (current: ${this.status})`,
      );
    }
    this.status = "ON_HOLD";
    this.updatedAt = new Date();
    this.logActivity({
      activityType: "STATUS_CHANGED",
      description: `Project status set to ON_HOLD`,
      performedBy,
    });
  }

  public complete(performedBy = "Project Manager"): void {
    if (this.status === "CANCELLED" || this.status === "ARCHIVED") {
      throw new InvalidProjectStatusError(
        `Cannot complete project in status ${this.status}`,
      );
    }
    const prevStatus = this.status;
    this.status = "COMPLETED";
    this.updatedAt = new Date();
    this.logActivity({
      activityType: "STATUS_CHANGED",
      description: `Project status transitioned from ${prevStatus} to COMPLETED (Read-only)`,
      performedBy,
    });
  }

  public archive(performedBy = "Project Manager"): void {
    const prevStatus = this.status;
    this.status = "ARCHIVED";
    this.updatedAt = new Date();
    this.logActivity({
      activityType: "ARCHIVED",
      description: `Project archived from status ${prevStatus}`,
      performedBy,
    });
  }

  public cancel(performedBy = "Project Manager"): void {
    if (this.status === "COMPLETED" || this.status === "ARCHIVED") {
      throw new InvalidProjectStatusError(
        `Cannot cancel project in status ${this.status}`,
      );
    }
    const prevStatus = this.status;
    this.status = "CANCELLED";
    this.updatedAt = new Date();
    this.logActivity({
      activityType: "STATUS_CHANGED",
      description: `Project cancelled from status ${prevStatus}`,
      performedBy,
    });
  }

  public allocateMaterial(
    componentId: string,
    locationId: string,
    quantity: number,
    unitOfMeasure = "pcs",
    notes?: string,
    performedBy = "Inventory Lead",
  ): ProjectMaterialProps {
    if (
      this.status === "COMPLETED" ||
      this.status === "ARCHIVED" ||
      this.status === "CANCELLED"
    ) {
      throw new InvalidProjectStatusError(
        `Cannot allocate materials to project in status ${this.status}`,
      );
    }

    if (quantity <= 0) {
      throw new ProjectMaterialError(
        "Material allocation quantity must be greater than zero",
      );
    }

    const now = new Date();
    let mat = this.materials.find(
      (m) => m.componentId === componentId && m.locationId === locationId,
    );

    if (mat) {
      mat.allocatedQuantity += quantity;
      mat.updatedAt = now;
    } else {
      mat = {
        id: ObjectId.generate().value,
        projectId: this.id,
        componentId,
        locationId,
        allocatedQuantity: quantity,
        issuedQuantity: 0,
        returnedQuantity: 0,
        unitOfMeasure,
        notes,
        createdAt: now,
        updatedAt: now,
      };
      this.materials.push(mat);
    }

    this.updatedAt = now;
    this.logActivity({
      activityType: "MATERIAL_ALLOCATED",
      description: `Allocated ${quantity} ${unitOfMeasure} of component (${componentId})`,
      performedBy,
    });

    return mat;
  }

  public issueMaterial(
    componentId: string,
    locationId: string,
    quantity: number,
    performedBy = "Warehouse Lead",
  ): ProjectMaterialProps {
    if (this.status !== "ACTIVE") {
      throw new InvalidProjectStatusError(
        `Only ACTIVE projects can issue materials (current status: ${this.status})`,
      );
    }

    if (quantity <= 0) {
      throw new ProjectMaterialError(
        "Material issue quantity must be greater than zero",
      );
    }

    const mat = this.materials.find(
      (m) => m.componentId === componentId && m.locationId === locationId,
    );

    if (!mat) {
      throw new ProjectMaterialError(
        "Component location allocation not found for this project",
      );
    }

    const unissuedRemaining =
      mat.allocatedQuantity - (mat.issuedQuantity - mat.returnedQuantity);
    if (quantity > unissuedRemaining) {
      throw new ProjectMaterialError(
        `Cannot issue ${quantity} units. Unissued allocated balance is ${unissuedRemaining}`,
      );
    }

    const now = new Date();
    mat.issuedQuantity += quantity;
    mat.updatedAt = now;
    this.updatedAt = now;

    this.logActivity({
      activityType: "MATERIAL_ISSUED",
      description: `Issued ${quantity} ${mat.unitOfMeasure} of component (${componentId}) to project`,
      performedBy,
    });

    return mat;
  }

  public returnMaterial(
    componentId: string,
    locationId: string,
    quantity: number,
    performedBy = "Warehouse Lead",
  ): ProjectMaterialProps {
    if (this.status !== "ACTIVE") {
      throw new InvalidProjectStatusError(
        `Only ACTIVE projects can return materials (current status: ${this.status})`,
      );
    }

    if (quantity <= 0) {
      throw new ProjectMaterialError(
        "Material return quantity must be greater than zero",
      );
    }

    const mat = this.materials.find(
      (m) => m.componentId === componentId && m.locationId === locationId,
    );

    if (!mat) {
      throw new ProjectMaterialError(
        "Component location material balance not found for this project",
      );
    }

    const netIssued = mat.issuedQuantity - mat.returnedQuantity;
    if (quantity > netIssued) {
      throw new ProjectMaterialError(
        `Cannot return ${quantity} units. Net issued balance is ${netIssued}`,
      );
    }

    const now = new Date();
    mat.returnedQuantity += quantity;
    mat.updatedAt = now;
    this.updatedAt = now;

    this.logActivity({
      activityType: "MATERIAL_RETURNED",
      description: `Returned ${quantity} ${mat.unitOfMeasure} of component (${componentId}) from project to warehouse`,
      performedBy,
    });

    return mat;
  }

  public addMilestone(props: {
    name: string;
    dueDate: Date;
    completionPercentage?: number;
  }): MilestoneProps {
    const now = new Date();
    const milestone: MilestoneProps = {
      id: ObjectId.generate().value,
      projectId: this.id,
      name: props.name,
      dueDate: props.dueDate,
      status: "OPEN",
      completionPercentage: props.completionPercentage ?? 0,
      createdAt: now,
      updatedAt: now,
    };
    this.milestones.push(milestone);
    this.updatedAt = now;
    return milestone;
  }

  public completeMilestone(milestoneId: string): void {
    const milestone = this.milestones.find((m) => m.id === milestoneId);
    if (!milestone) {
      throw new Error(
        `Milestone "${milestoneId}" not found on project "${this.id}"`,
      );
    }
    milestone.status = "COMPLETED";
    milestone.completionPercentage = 100;
    milestone.updatedAt = new Date();
    this.updatedAt = new Date();
  }

  private logActivity(props: {
    activityType: ProjectActivityType;
    description: string;
    performedBy: string;
    metadata?: string;
  }) {
    this.activities.push({
      id: ObjectId.generate().value,
      projectId: this.id,
      activityType: props.activityType,
      description: props.description,
      performedBy: props.performedBy,
      metadata: props.metadata || null,
      createdAt: new Date(),
    });
  }
}

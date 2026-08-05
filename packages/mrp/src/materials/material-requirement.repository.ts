import { MaterialRequirement, RequirementSource } from "./material-requirement";

export interface FindManyMaterialRequirementsOptions {
  planningRunId?: string;
  componentId?: string;
  source?: RequirementSource;
  onlyShortages?: boolean;
}

export interface MaterialRequirementRepository {
  findById(id: string): Promise<MaterialRequirement | null>;
  findMany(
    options?: FindManyMaterialRequirementsOptions,
  ): Promise<MaterialRequirement[]>;
  save(requirement: MaterialRequirement): Promise<void>;
  saveMany(requirements: MaterialRequirement[]): Promise<void>;
}

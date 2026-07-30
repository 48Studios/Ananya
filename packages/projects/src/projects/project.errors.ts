export class ProjectNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Project "${identifier}" was not found.`);
    this.name = 'ProjectNotFoundError';
  }
}

export class InvalidProjectStatusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidProjectStatusError';
  }
}

export class ProjectMaterialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectMaterialError';
  }
}

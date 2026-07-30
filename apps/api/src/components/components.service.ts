import { Inject, Injectable } from '@nestjs/common';
import {
  CreateComponent,
  UpdateComponent,
  DeleteComponent,
  type CreateComponentInput,
  type UpdateComponentInput,
  type Component,
  type ComponentRepository,
  ComponentNotFoundError,
} from '@ananya/inventory';
import { COMPONENT_REPOSITORY } from './component.tokens';

@Injectable()
export class ComponentsService {
  private readonly createComponent: CreateComponent;
  private readonly updateComponent: UpdateComponent;
  private readonly deleteComponent: DeleteComponent;

  constructor(
    @Inject(COMPONENT_REPOSITORY)
    private readonly repository: ComponentRepository,
  ) {
    this.createComponent = new CreateComponent(repository);
    this.updateComponent = new UpdateComponent(repository);
    this.deleteComponent = new DeleteComponent(repository);
  }

  create(input: CreateComponentInput): Promise<Component> {
    return this.createComponent.execute(input);
  }

  update(id: string, input: UpdateComponentInput): Promise<Component> {
    return this.updateComponent.execute(id, input);
  }

  delete(id: string): Promise<void> {
    return this.deleteComponent.execute(id);
  }

  getAllComponents(): Promise<Component[]> {
    return this.repository.findMany();
  }

  async getComponent(id: string): Promise<Component> {
    const component = await this.repository.findById(id);
    if (!component) {
      throw new ComponentNotFoundError(id);
    }
    return component;
  }
}

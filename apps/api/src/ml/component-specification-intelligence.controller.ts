import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/permission.guard';
import {
  DocumentReadGuard,
  DocumentWriteGuard,
} from '../documents/document-permissions';
import { ComponentSpecificationIntelligenceService } from './component-specification-intelligence.service';
import type {
  ComponentDocumentationStateDto,
  DocumentAnalysisActor,
  RunComponentDocumentationAnalysisResultDto,
} from './documentation-intelligence.dtos';

/**
 * Component-level Specification Intelligence.
 *
 *   GET  /ml/components/:componentId/documentation           - current state (read)
 *   POST /ml/components/:componentId/documentation/analyze   - run analysis (write)
 *
 * Why component-level: a specification is a property of the component, not of one
 * file. A component usually states the same value in a datasheet, an ordering
 * guide and a product page, and analysing those independently would produce a
 * suggestion per document — with a disagreement decided by whichever ran last.
 *
 * The request carries a component id and nothing else. Which documents are read
 * is derived server-side from the persisted `(entityType, entityId)` relationship,
 * so a caller cannot point the analysis at another component's documentation, and
 * the component a finding is applied to is never supplied by the client.
 *
 * Authorization reuses the documentation vocabulary: reading needs
 * `Inventory.Read`, and analysis (which persists review findings) needs
 * `Inventory.Update`, the same permission as editing component data. Analysis
 * remains advisory — it never writes a component field.
 */
@Controller('ml/components')
export class ComponentSpecificationIntelligenceController {
  constructor(
    private readonly service: ComponentSpecificationIntelligenceService,
  ) {}

  @Get(':componentId/documentation')
  @UseGuards(DocumentReadGuard)
  getState(
    @Param('componentId') componentId: string,
  ): Promise<ComponentDocumentationStateDto> {
    return this.service.getState(componentId);
  }

  @Post(':componentId/documentation/analyze')
  @UseGuards(DocumentWriteGuard)
  analyze(
    @Param('componentId') componentId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<RunComponentDocumentationAnalysisResultDto> {
    const actor: DocumentAnalysisActor = {
      id: req.user?.id,
      email: req.user?.email,
    };
    return this.service.analyzeComponent(componentId, actor);
  }
}

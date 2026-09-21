import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/permission.guard';
import {
  DocumentReadGuard,
  DocumentWriteGuard,
} from '../documents/document-permissions';
import { DocumentationAnalysisService } from './documentation-analysis.service';
import type {
  DocumentAnalysisActor,
  DocumentAnalysisStateDto,
  RunDocumentAnalysisResultDto,
} from './documentation-intelligence.dtos';

/**
 * Datasheet Documentation Intelligence API.
 *
 *   GET  /ml/documents/:documentId/analysis  - current analysis state (read)
 *   POST /ml/documents/:documentId/analyze   - run analysis (write)
 *
 * Authorization reuses the documentation permissions rather than a new
 * vocabulary: a caller who cannot read the document cannot read its analysis,
 * and analysis (which persists findings) requires the same permission as
 * modifying component data. There is no `componentId` in any request: the
 * component is resolved from the persisted document, so an id cannot be swapped
 * to analyze another component's documentation.
 *
 * Analysis is advisory: it never mutates component data. Findings flow through
 * the existing Component Review Queue and its existing apply workflow.
 */
@Controller('ml/documents')
export class DocumentationIntelligenceController {
  constructor(private readonly service: DocumentationAnalysisService) {}

  @Get(':documentId/analysis')
  @UseGuards(DocumentReadGuard)
  getAnalysis(
    @Param('documentId') documentId: string,
  ): Promise<DocumentAnalysisStateDto> {
    return this.service.getAnalysisState(documentId);
  }

  @Post(':documentId/analyze')
  @UseGuards(DocumentWriteGuard)
  analyze(
    @Param('documentId') documentId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<RunDocumentAnalysisResultDto> {
    const actor: DocumentAnalysisActor = {
      id: req.user?.id,
      email: req.user?.email,
    };
    return this.service.analyzeDocument(documentId, actor);
  }
}

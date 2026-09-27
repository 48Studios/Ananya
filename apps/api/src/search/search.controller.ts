import { Controller, Get, Query, Req } from '@nestjs/common';
import { SearchService } from './search.service';
import type { AuthenticatedRequest } from '../auth/permission.guard';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(
    @Req() req: AuthenticatedRequest,
    @Query('q') query?: string,
    @Query('limit') limit?: string,
  ) {
    const q = query || '';
    const parsedLimit = limit ? parseInt(limit, 10) : 5;
    const permissions = req.user?.permissions ?? [];
    return this.searchService.search(q, parsedLimit, permissions);
  }
}

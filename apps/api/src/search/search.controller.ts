import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(@Query('q') query?: string, @Query('limit') limit?: string) {
    const q = query || '';
    const parsedLimit = limit ? parseInt(limit, 10) : 5;
    return this.searchService.search(q, parsedLimit);
  }
}

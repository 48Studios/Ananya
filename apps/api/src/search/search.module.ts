import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { InventorySearchProvider } from './providers/inventory-search.provider';
import { ProcurementSearchProvider } from './providers/procurement-search.provider';
import { ManufacturingSearchProvider } from './providers/manufacturing-search.provider';
import { ProjectsSearchProvider } from './providers/projects-search.provider';
import { AdministrationSearchProvider } from './providers/administration-search.provider';

@Module({
  controllers: [SearchController],
  providers: [
    SearchService,
    InventorySearchProvider,
    ProcurementSearchProvider,
    ManufacturingSearchProvider,
    ProjectsSearchProvider,
    AdministrationSearchProvider,
  ],
  exports: [SearchService],
})
export class SearchModule {}

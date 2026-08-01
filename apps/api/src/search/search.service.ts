import { Injectable } from '@nestjs/common';
import { InventorySearchProvider } from './providers/inventory-search.provider';
import { ProcurementSearchProvider } from './providers/procurement-search.provider';
import { ManufacturingSearchProvider } from './providers/manufacturing-search.provider';
import { ProjectsSearchProvider } from './providers/projects-search.provider';
import { AdministrationSearchProvider } from './providers/administration-search.provider';
import { ISearchProvider, SearchResultItem } from './search.types';

@Injectable()
export class SearchService {
  private readonly providers: ISearchProvider[];

  constructor(
    inventoryProvider: InventorySearchProvider,
    procurementProvider: ProcurementSearchProvider,
    manufacturingProvider: ManufacturingSearchProvider,
    projectsProvider: ProjectsSearchProvider,
    administrationProvider: AdministrationSearchProvider,
  ) {
    this.providers = [
      inventoryProvider,
      procurementProvider,
      manufacturingProvider,
      projectsProvider,
      administrationProvider,
    ];
  }

  async search(query: string, limit = 5): Promise<SearchResultItem[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    const promises = this.providers.map((p) =>
      p.search(trimmed, limit).catch(() => []),
    );

    const nestedResults = await Promise.all(promises);
    return nestedResults.flat();
  }
}

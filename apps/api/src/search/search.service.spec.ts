import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from './search.service';
import { InventorySearchProvider } from './providers/inventory-search.provider';
import { ProcurementSearchProvider } from './providers/procurement-search.provider';
import { ManufacturingSearchProvider } from './providers/manufacturing-search.provider';
import { ProjectsSearchProvider } from './providers/projects-search.provider';
import { AdministrationSearchProvider } from './providers/administration-search.provider';

describe('SearchService', () => {
  let service: SearchService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        {
          provide: InventorySearchProvider,
          useValue: {
            category: 'Inventory',
            search: jest.fn().mockResolvedValue([
              {
                id: '1',
                type: 'Component',
                category: 'Inventory',
                title: 'Resistor 10k',
                href: '/components/1',
              },
            ]),
          },
        },
        {
          provide: ProcurementSearchProvider,
          useValue: {
            category: 'Procurement',
            search: jest.fn().mockResolvedValue([
              {
                id: '2',
                type: 'Supplier',
                category: 'Procurement',
                title: 'Acme Components',
                href: '/suppliers/2',
              },
            ]),
          },
        },
        {
          provide: ManufacturingSearchProvider,
          useValue: {
            category: 'Manufacturing',
            search: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: ProjectsSearchProvider,
          useValue: {
            category: 'Projects',
            search: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: AdministrationSearchProvider,
          useValue: {
            category: 'Administration',
            search: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return empty results when query is empty', async () => {
    const res = await service.search('  ');
    expect(res).toEqual([]);
  });

  it('should aggregate search results across active providers', async () => {
    const res = await service.search('Resistor');
    expect(res.length).toBe(2);
    expect(res[0]?.title).toBe('Resistor 10k');
    expect(res[1]?.title).toBe('Acme Components');
  });
});

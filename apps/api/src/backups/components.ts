export interface BackupComponent {
  id: string;
  name: string;
  tables: string[];
  dependencies: string[];
  optionalRelated: string[];
  restoreOrder: number;
  includeFiles: boolean;
}

export const BACKUP_COMPONENTS: readonly BackupComponent[] = [
  {
    id: 'categories',
    name: 'Categories',
    tables: ['categories'],
    dependencies: [],
    optionalRelated: ['category_attributes'],
    restoreOrder: 10,
    includeFiles: false,
  },
  {
    id: 'manufacturers',
    name: 'Manufacturers',
    tables: ['manufacturers'],
    dependencies: [],
    optionalRelated: [],
    restoreOrder: 20,
    includeFiles: false,
  },
  {
    id: 'attributes',
    name: 'Attributes',
    tables: ['attribute_definitions', 'attribute_options'],
    dependencies: [],
    optionalRelated: ['category_attributes'],
    restoreOrder: 30,
    includeFiles: false,
  },
  {
    id: 'components',
    name: 'Components',
    tables: ['components', 'component_attribute_values'],
    dependencies: ['categories', 'manufacturers', 'attributes'],
    optionalRelated: ['documents'],
    restoreOrder: 40,
    includeFiles: true,
  },
  {
    id: 'locations',
    name: 'Locations',
    tables: ['locations', 'warehouses', 'warehouse_zones', 'warehouse_bins'],
    dependencies: [],
    optionalRelated: ['spatial_layouts', 'spatial_nodes'],
    restoreOrder: 50,
    includeFiles: false,
  },
  {
    id: 'inventory',
    name: 'Inventory',
    tables: [
      'inventory_transactions',
      'inventory_projections',
      'inventory_reservations',
      'inventory_reservation_lines',
      'batches',
      'serials',
    ],
    dependencies: ['components', 'locations'],
    optionalRelated: [],
    restoreOrder: 60,
    includeFiles: false,
  },
];

export function expandComponents(componentIds: string[]) {
  const byId = new Map(
    BACKUP_COMPONENTS.map((component) => [component.id, component]),
  );
  const expanded = new Set<string>();
  const visit = (id: string) => {
    if (expanded.has(id)) return;
    const component = byId.get(id);
    if (!component) throw new Error(`Unsupported backup component "${id}".`);
    expanded.add(id);
    component.dependencies.forEach(visit);
  };
  componentIds.forEach(visit);
  return [...expanded]
    .map((id) => byId.get(id)!)
    .sort((left, right) => left.restoreOrder - right.restoreOrder);
}

export function resolveComponentScope(componentIds: string[]) {
  const components = expandComponents(componentIds);
  return {
    components: components.map((component) => component.id),
    tables: [...new Set(components.flatMap((component) => component.tables))],
    dependencies: components
      .filter((component) => !componentIds.includes(component.id))
      .map((component) => component.name),
    includeFiles: components.some((component) => component.includeFiles),
  };
}

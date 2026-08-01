export type SearchCategory =
  | 'Inventory'
  | 'Procurement'
  | 'Manufacturing'
  | 'Projects'
  | 'Reports'
  | 'Administration';

export interface SearchResultItem {
  id: string;
  type: string;
  category: SearchCategory;
  title: string;
  subtitle?: string | null;
  status?: string | null;
  href: string;
  iconName?: string;
}

export interface ISearchProvider {
  category: SearchCategory;
  search(query: string, limit?: number): Promise<SearchResultItem[]>;
}

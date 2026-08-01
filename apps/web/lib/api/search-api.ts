import { apiClient } from '../api-client';

export interface SearchResultItemDto {
  id: string;
  type: string;
  category: 'Inventory' | 'Procurement' | 'Manufacturing' | 'Projects' | 'Reports' | 'Administration';
  title: string;
  subtitle?: string | null;
  status?: string | null;
  href: string;
  iconName?: string;
}

export const searchApi = {
  query: (q: string, limit = 6): Promise<SearchResultItemDto[]> => {
    if (!q.trim()) return Promise.resolve([]);
    const params = new URLSearchParams({ q: q.trim(), limit: limit.toString() });
    return apiClient.get<SearchResultItemDto[]>(`/search?${params.toString()}`);
  },
};

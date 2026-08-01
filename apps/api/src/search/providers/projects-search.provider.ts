import { Injectable } from '@nestjs/common';
import { db } from '@ananya/database';
import { projects } from '@ananya/database/schema';
import { or, ilike } from '@ananya/database/query';
import {
  ISearchProvider,
  SearchCategory,
  SearchResultItem,
} from '../search.types';

@Injectable()
export class ProjectsSearchProvider implements ISearchProvider {
  readonly category: SearchCategory = 'Projects';

  async search(query: string, limit = 5): Promise<SearchResultItem[]> {
    const term = `%${query}%`;
    const results: SearchResultItem[] = [];

    // Search Projects
    const projRows = await db
      .select()
      .from(projects)
      .where(
        or(ilike(projects.name, term), ilike(projects.projectNumber, term)),
      )
      .limit(limit);

    for (const p of projRows) {
      results.push({
        id: p.id,
        type: 'Project',
        category: 'Projects',
        title: p.name,
        subtitle: `Project #: ${p.projectNumber} | Type: ${p.projectType}`,
        status: p.status,
        href: `/projects/${p.id}`,
        iconName: 'FolderKanban',
      });
    }

    return results;
  }
}

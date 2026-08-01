import { Injectable } from '@nestjs/common';
import { db } from '@ananya/database';
import { users, roles } from '@ananya/database/schema';
import { or, ilike } from '@ananya/database/query';
import {
  ISearchProvider,
  SearchCategory,
  SearchResultItem,
} from '../search.types';

@Injectable()
export class AdministrationSearchProvider implements ISearchProvider {
  readonly category: SearchCategory = 'Administration';

  async search(query: string, limit = 5): Promise<SearchResultItem[]> {
    const term = `%${query}%`;
    const results: SearchResultItem[] = [];

    // Search Users
    const uRows = await db
      .select()
      .from(users)
      .where(
        or(
          ilike(users.firstName, term),
          ilike(users.lastName, term),
          ilike(users.email, term),
        ),
      )
      .limit(limit);

    for (const u of uRows) {
      results.push({
        id: u.id,
        type: 'User Account',
        category: 'Administration',
        title: `${u.firstName} ${u.lastName}`,
        subtitle: `Email: ${u.email} | Dept: ${u.department || 'Operations'}`,
        status: u.status,
        href: `/users/${u.id}`,
        iconName: 'UserCheck',
      });
    }

    // Search Roles
    const rRows = await db
      .select()
      .from(roles)
      .where(or(ilike(roles.name, term), ilike(roles.description, term)))
      .limit(limit);

    for (const r of rRows) {
      results.push({
        id: r.id,
        type: 'Security Role',
        category: 'Administration',
        title: r.name,
        subtitle: r.description || 'Configured access policy',
        status: r.isSystem ? 'SYSTEM' : 'CUSTOM',
        href: `/roles/${r.id}`,
        iconName: 'Shield',
      });
    }

    // Static Administration & Report Navigation Target Matching
    const adminTargets = [
      {
        id: 'nav-audit',
        title: 'Security Audit Log',
        href: '/settings/security',
        type: 'Settings',
        keywords: ['audit', 'security', 'logs'],
      },
      {
        id: 'nav-profile',
        title: 'User Profile & Credentials',
        href: '/profile',
        type: 'Profile',
        keywords: ['profile', 'password', 'sessions'],
      },
      {
        id: 'nav-reports',
        title: 'Analytics & Operational Reports',
        href: '/reports',
        type: 'Report Hub',
        keywords: ['report', 'analytics', 'kpi'],
      },
      {
        id: 'nav-inventory-report',
        title: 'Inventory Stock Valuation Report',
        href: '/reports/inventory',
        type: 'Report',
        keywords: ['stock report', 'valuation', 'inventory report'],
      },
      {
        id: 'nav-procurement-report',
        title: 'Procurement Spend Report',
        href: '/reports/procurement',
        type: 'Report',
        keywords: ['procurement report', 'spend', 'po report'],
      },
    ];

    const q = query.toLowerCase();
    for (const t of adminTargets) {
      if (
        t.title.toLowerCase().includes(q) ||
        t.keywords.some((k) => k.includes(q))
      ) {
        results.push({
          id: t.id,
          type: t.type,
          category: 'Administration',
          title: t.title,
          subtitle: `Platform Route: ${t.href}`,
          href: t.href,
          iconName: 'Settings',
        });
      }
    }

    return results;
  }
}

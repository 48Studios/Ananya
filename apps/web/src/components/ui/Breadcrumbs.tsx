'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconChevronRight } from './Icons';

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Dashboard</span>
      </div>
    );
  }

  const breadcrumbItems = segments.map((segment, index) => {
    const href = '/' + segments.slice(0, index + 1).join('/');
    const isLast = index === segments.length - 1;
    const formattedLabel = segment
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());

    return {
      href,
      label: formattedLabel,
      isLast,
    };
  });

  return (
    <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: '0.8rem' }}>
      <Link href="/" style={{ color: 'var(--text-secondary)', transition: 'color var(--transition-fast)' }}>
        Home
      </Link>
      {breadcrumbItems.map((item) => (
        <React.Fragment key={item.href}>
          <IconChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
          {item.isLast ? (
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {item.label}
            </span>
          ) : (
            <Link
              href={item.href}
              style={{ color: 'var(--text-secondary)', transition: 'color var(--transition-fast)' }}
            >
              {item.label}
            </Link>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

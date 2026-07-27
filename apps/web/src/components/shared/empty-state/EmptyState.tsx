'use client';

import React from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({
  title = 'No items found',
  description = 'There are no records to display at this time.',
  icon,
  action,
}: EmptyStateProps) {
  return (
    <div
      style={{
        padding: '48px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        backgroundColor: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        gap: '12px',
      }}
    >
      <div style={{ color: 'var(--muted-foreground)', opacity: 0.7 }}>
        {icon || <Inbox size={40} />}
      </div>
      <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--foreground)' }}>
        {title}
      </h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', maxWidth: '400px' }}>
        {description}
      </p>
      {action && <div style={{ marginTop: '8px' }}>{action}</div>}
    </div>
  );
}

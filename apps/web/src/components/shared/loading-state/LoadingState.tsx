'use client';

import React from 'react';
import { Skeleton } from '../../ui/Skeleton';

interface LoadingStateProps {
  message?: string;
  rows?: number;
}

export function LoadingState({ message = 'Loading workspace data...', rows = 4 }: LoadingStateProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Skeleton style={{ height: '24px', width: '200px', borderRadius: '4px' }} />
        <span style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>{message}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {Array.from({ length: rows }).map((_, idx) => (
          <Skeleton key={idx} style={{ height: '48px', width: '100%', borderRadius: 'var(--radius-md)' }} />
        ))}
      </div>
    </div>
  );
}

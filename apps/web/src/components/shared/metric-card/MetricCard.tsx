'use client';

import React from 'react';

interface MetricCardProps {
  label: string;
  metric: string | number;
  unit?: string;
  badge?: React.ReactNode;
  footer?: React.ReactNode;
}

export function MetricCard({ label, metric, unit, badge, footer }: MetricCardProps) {
  return (
    <div
      style={{
        backgroundColor: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', fontWeight: 500 }}>{label}</span>
        {badge}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
        <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--foreground)' }}>{metric}</span>
        {unit && <span style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>{unit}</span>}
      </div>
      {footer && <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: '4px' }}>{footer}</div>}
    </div>
  );
}

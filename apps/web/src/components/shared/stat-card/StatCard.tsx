'use client';

import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  subtitle?: string;
  icon?: React.ReactNode;
}

export function StatCard({
  title,
  value,
  change,
  changeType = 'neutral',
  subtitle,
  icon,
}: StatCardProps) {
  const getChangeIcon = () => {
    if (changeType === 'positive') return <TrendingUp size={14} style={{ color: 'var(--success)' }} />;
    if (changeType === 'negative') return <TrendingDown size={14} style={{ color: 'var(--destructive)' }} />;
    return <Minus size={14} style={{ color: 'var(--muted-foreground)' }} />;
  };

  const getChangeColor = () => {
    if (changeType === 'positive') return 'var(--success)';
    if (changeType === 'negative') return 'var(--destructive)';
    return 'var(--muted-foreground)';
  };

  return (
    <div
      style={{
        backgroundColor: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        boxShadow: 'var(--shadow-sm)',
        transition: 'border-color var(--transition-fast)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {title}
        </span>
        {icon && (
          <div
            style={{
              padding: '8px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--muted)',
              color: 'var(--primary)',
              display: 'flex',
            }}
          >
            {icon}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
        <span style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--foreground)' }}>
          {value}
        </span>

        {change && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.775rem', fontWeight: 600, color: getChangeColor() }}>
            {getChangeIcon()}
            <span>{change}</span>
          </div>
        )}
      </div>

      {subtitle && (
        <span style={{ fontSize: '0.775rem', color: 'var(--muted-foreground)' }}>
          {subtitle}
        </span>
      )}
    </div>
  );
}

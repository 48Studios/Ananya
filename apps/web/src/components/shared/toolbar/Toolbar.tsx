'use client';

import React from 'react';

interface ToolbarProps {
  left?: React.ReactNode;
  right?: React.ReactNode;
}

export function Toolbar({ left, right }: ToolbarProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        padding: '12px 16px',
        backgroundColor: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>{left}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>{right}</div>
    </div>
  );
}

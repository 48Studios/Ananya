'use client';

import React from 'react';

interface FilterOption {
  label: string;
  value: string;
}

interface FilterBarProps {
  filters: {
    key: string;
    label: string;
    options: FilterOption[];
    value: string;
    onChange: (val: string) => void;
  }[];
  onReset?: () => void;
}

export function FilterBar({ filters, onReset }: FilterBarProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
      {filters.map((f) => (
        <select
          key={f.key}
          value={f.value}
          onChange={(e) => f.onChange(e.target.value)}
          style={{
            padding: '6px 12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--card)',
            color: 'var(--foreground)',
            outline: 'none',
            fontSize: '0.8rem',
          }}
        >
          <option value="">{f.label}: All</option>
          {f.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ))}
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          style={{
            fontSize: '0.8rem',
            color: 'var(--primary)',
            fontWeight: 500,
            padding: '4px 8px',
          }}
        >
          Reset filters
        </button>
      )}
    </div>
  );
}

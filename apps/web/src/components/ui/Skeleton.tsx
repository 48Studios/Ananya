import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
}

export function Skeleton({ width = '100%', height = '1rem', borderRadius = 'var(--radius-md)', style, ...props }: SkeletonProps) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius,
        backgroundColor: 'var(--bg-hover)',
        opacity: 0.6,
        animation: 'pulse 1.5s ease-in-out infinite',
        ...style,
      }}
      {...props}
    />
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: 'var(--space-4)', padding: 'var(--space-3)' }}>
          <Skeleton width="20%" height="1.2rem" />
          <Skeleton width="40%" height="1.2rem" />
          <Skeleton width="20%" height="1.2rem" />
          <Skeleton width="20%" height="1.2rem" />
        </div>
      ))}
    </div>
  );
}

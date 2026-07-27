import React from 'react';
import { AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'destructive' | 'warning' | 'success';
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}

export function Alert({
  variant = 'default',
  title,
  children,
  action,
  className = '',
  style,
  ...props
}: AlertProps) {
  let bg = 'var(--bg-elevated)';
  let border = 'var(--border-default)';
  let color = 'var(--text-primary)';
  let icon = <AlertCircle size={18} />;

  if (variant === 'destructive') {
    bg = 'var(--danger-subtle)';
    border = 'rgba(239, 68, 68, 0.3)';
    color = 'var(--danger)';
  } else if (variant === 'warning') {
    bg = 'var(--warning-subtle)';
    border = 'rgba(245, 158, 11, 0.3)';
    color = 'var(--warning)';
    icon = <AlertTriangle size={18} />;
  } else if (variant === 'success') {
    bg = 'var(--success-subtle)';
    border = 'rgba(16, 185, 129, 0.3)';
    color = 'var(--success)';
    icon = <CheckCircle size={18} />;
  }

  return (
    <div
      className={`alert ${className}`}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) var(--space-4)',
        backgroundColor: bg,
        border: `1px solid ${border}`,
        borderRadius: 'var(--radius-md)',
        color,
        fontSize: '0.85rem',
        marginBottom: 'var(--space-4)',
        ...style,
      }}
      {...props}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
        <span style={{ display: 'flex', alignItems: 'center', marginTop: '2px' }}>{icon}</span>
        <div>
          {title && <div style={{ fontWeight: 600, marginBottom: '2px' }}>{title}</div>}
          <div style={{ color: variant === 'default' ? 'var(--text-secondary)' : 'inherit' }}>
            {children}
          </div>
        </div>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

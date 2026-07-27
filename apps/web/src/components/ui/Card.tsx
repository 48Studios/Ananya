import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function Card({ children, className = '', style, ...props }: CardProps) {
  return (
    <div
      className={`card ${className}`}
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '', style, ...props }: CardProps) {
  return (
    <div
      className={`card-header ${className}`}
      style={{
        padding: 'var(--space-4) var(--space-6)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export interface CardTextProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
}

export function CardTitle({ children, className = '', style, ...props }: CardTextProps) {
  return (
    <h3
      className={`card-title ${className}`}
      style={{
        fontSize: '0.95rem',
        fontWeight: 600,
        color: 'var(--text-primary)',
        letterSpacing: '-0.01em',
        ...style,
      }}
      {...props}
    >
      {children}
    </h3>
  );
}

export function CardDescription({ children, className = '', style, ...props }: CardTextProps) {
  return (
    <p
      className={`card-description ${className}`}
      style={{
        fontSize: '0.8rem',
        color: 'var(--text-secondary)',
        marginTop: '2px',
        ...style,
      }}
      {...props}
    >
      {children}
    </p>
  );
}

export function CardContent({ children, className = '', style, ...props }: CardProps) {
  return (
    <div
      className={`card-content ${className}`}
      style={{
        padding: 'var(--space-6)',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardFooter({ children, className = '', style, ...props }: CardProps) {
  return (
    <div
      className={`card-footer ${className}`}
      style={{
        padding: 'var(--space-4) var(--space-6)',
        backgroundColor: 'var(--bg-elevated)',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 'var(--space-3)',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

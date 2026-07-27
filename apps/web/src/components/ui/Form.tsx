import React from 'react';

export interface FormItemProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function FormItem({ children, className = '', style, ...props }: FormItemProps) {
  return (
    <div
      className={`form-item ${className}`}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', marginBottom: 'var(--space-4)', ...style }}
      {...props}
    >
      {children}
    </div>
  );
}

export interface FormLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  children: React.ReactNode;
}

export function FormLabel({ children, className = '', style, ...props }: FormLabelProps) {
  return (
    <label
      className={`form-label ${className}`}
      style={{
        fontSize: '0.75rem',
        fontWeight: 600,
        color: 'var(--text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.03em',
        ...style,
      }}
      {...props}
    >
      {children}
    </label>
  );
}

export function FormControl({ children }: { children: React.ReactNode }) {
  return <div style={{ width: '100%' }}>{children}</div>;
}

export interface FormTextProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
}

export function FormDescription({ children, className = '', style, ...props }: FormTextProps) {
  return (
    <p
      className={`form-description ${className}`}
      style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px', ...style }}
      {...props}
    >
      {children}
    </p>
  );
}

export function FormMessage({ children, className = '', style, ...props }: FormTextProps) {
  if (!children) return null;
  return (
    <span
      className={`form-message ${className}`}
      style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '2px', ...style }}
      {...props}
    >
      {children}
    </span>
  );
}

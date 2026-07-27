import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  children: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      className = '',
      disabled,
      children,
      style,
      ...props
    },
    ref
  ) => {
    let variantBg = 'var(--muted)';
    let variantColor = 'var(--foreground)';
    let variantBorder = '1px solid var(--border)';

    if (variant === 'primary') {
      variantBg = 'var(--primary)';
      variantColor = 'var(--primary-foreground)';
      variantBorder = '1px solid var(--primary)';
    } else if (variant === 'outline') {
      variantBg = 'transparent';
      variantColor = 'var(--foreground)';
      variantBorder = '1px solid var(--border)';
    } else if (variant === 'ghost') {
      variantBg = 'transparent';
      variantColor = 'var(--muted-foreground)';
      variantBorder = '1px solid transparent';
    } else if (variant === 'danger') {
      variantBg = 'var(--destructive)';
      variantColor = 'var(--destructive-foreground)';
      variantBorder = '1px solid var(--destructive)';
    }

    let padding = '6px 14px';
    let fontSize = '0.85rem';
    let borderRadius = 'var(--radius-md)';
    let gap = '8px';

    if (size === 'sm') {
      padding = '4px 10px';
      fontSize = '0.775rem';
      borderRadius = 'var(--radius-md)';
      gap = '6px';
    } else if (size === 'lg') {
      padding = '10px 20px';
      fontSize = '0.95rem';
      borderRadius = 'var(--radius-lg)';
      gap = '10px';
    }

    const baseStyle: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 600,
      cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
      opacity: disabled || isLoading ? 0.6 : 1,
      transition: 'all var(--transition-fast)',
      whiteSpace: 'nowrap',
      backgroundColor: variantBg,
      color: variantColor,
      border: variantBorder,
      padding,
      fontSize,
      borderRadius,
      gap,
      ...style,
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`btn ${className}`}
        style={baseStyle}
        {...props}
      >
        {isLoading ? (
          <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
        ) : leftIcon ? (
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>{leftIcon}</span>
        ) : null}
        <span>{children}</span>
        {!isLoading && rightIcon && (
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>{rightIcon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

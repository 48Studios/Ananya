'use client';

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '../../ui/Button';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = 'An error occurred',
  message = 'Failed to fetch resource or execute operations.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      style={{
        padding: '32px 24px',
        borderRadius: 'var(--radius-lg)',
        backgroundColor: 'rgba(239, 68, 68, 0.06)',
        border: '1px solid var(--destructive)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: '12px',
      }}
    >
      <AlertTriangle size={32} style={{ color: 'var(--destructive)' }} />
      <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--foreground)' }}>
        {title}
      </h4>
      <p style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', maxWidth: '400px' }}>
        {message}
      </p>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          leftIcon={<RefreshCw size={14} />}
          style={{ marginTop: '8px' }}
        >
          Retry Request
        </Button>
      )}
    </div>
  );
}

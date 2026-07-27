'use client';

import React, { useEffect } from 'react';

export interface SheetProps {
  isOpen?: boolean;
  open?: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  side?: 'left' | 'right';
}

export function Sheet({ isOpen, open, onClose, title, children, side = 'left' }: SheetProps) {
  const isSheetOpen = open !== undefined ? open : !!isOpen;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isSheetOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSheetOpen, onClose]);

  if (!isSheetOpen) return null;

  const isLeft = side === 'left';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(2px)',
        zIndex: 50,
        display: 'flex',
        justifyContent: isLeft ? 'flex-start' : 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '280px',
          height: '100%',
          backgroundColor: 'var(--bg-sidebar)',
          borderRight: isLeft ? '1px solid var(--border-subtle)' : undefined,
          borderLeft: !isLeft ? '1px solid var(--border-subtle)' : undefined,
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {title && (
          <div
            style={{
              height: 'var(--header-height)',
              padding: '0 var(--space-4)',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{title}</span>
            <button
              type="button"
              onClick={onClose}
              style={{ color: 'var(--text-muted)', padding: '4px', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        )}
        <div style={{ flex: 1, overflowY: 'auto' }}>{children}</div>
      </div>
    </div>
  );
}

export function SheetContent({
  children,
}: {
  children: React.ReactNode;
  side?: 'left' | 'right';
  title?: string;
}) {
  return <>{children}</>;
}

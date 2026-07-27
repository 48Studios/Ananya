'use client';

import React from 'react';

interface PageActionsProps {
  children: React.ReactNode;
}

export function PageActions({ children }: PageActionsProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      {children}
    </div>
  );
}

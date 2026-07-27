'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../src/lib/api';
import { Button } from '../../src/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { ErrorState } from '../../src/components/ui/ErrorState';

export default function SettingsPage() {
  const [apiStatus, setApiStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [errorMessage, setErrorMessage] = useState('');

  const checkConnection = useCallback(async () => {
    setApiStatus('checking');
    setErrorMessage('');
    try {
      await api.getComponents();
      setApiStatus('connected');
    } catch (err: unknown) {
      setApiStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Unable to connect to NestJS backend API.');
    }
  }, []);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
          Operations System Settings
        </h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          48 Studios system parameters, backend integration status, and configuration
        </p>
      </div>

      {/* Grid of Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-6)' }}>
        {/* Backend API Status Card */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Backend API Health & Connection</CardTitle>
              <CardDescription>NestJS core service integration status</CardDescription>
            </div>
          </CardHeader>
          <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>API Endpoint:</span>
              <span className="code-font" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Status:</span>
              {apiStatus === 'checking' && <Badge variant="neutral">Checking...</Badge>}
              {apiStatus === 'connected' && <Badge variant="receipt">CONNECTED (Healthy)</Badge>}
              {apiStatus === 'error' && <Badge variant="issue">DISCONNECTED / ERROR</Badge>}
            </div>

            {errorMessage && <ErrorState message={errorMessage} onRetry={checkConnection} />}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
              <Button variant="secondary" size="sm" onClick={checkConnection} isLoading={apiStatus === 'checking'}>
                Re-test API Connection
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Operational System Parameters */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>System Architecture Principles</CardTitle>
              <CardDescription>System boundaries and invariant rules</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <li>• <strong style={{ color: 'var(--text-primary)' }}>Domain Rules:</strong> Enforced inside <code className="code-font">@ananya/inventory</code> domain services</li>
              <li>• <strong style={{ color: 'var(--text-primary)' }}>Ledger Immutability:</strong> Ledger transactions are never edited or deleted</li>
              <li>• <strong style={{ color: 'var(--text-primary)' }}>Physical Context:</strong> Human-readable location paths prioritized across all views</li>
              <li>• <strong style={{ color: 'var(--text-primary)' }}>Dense & Calm UI:</strong> Operational tool optimized for daily engineering workflows</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

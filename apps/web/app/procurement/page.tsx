'use client';

import React, { useState, useEffect } from 'react';
import { api } from '../../src/lib/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../src/components/ui/Card';
import { Table } from '../../src/components/ui/Table';
import { Badge } from '../../src/components/ui/Badge';
import { Skeleton } from '../../src/components/ui/Skeleton';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { IconProcurement, IconInventory, IconFinance } from '../../src/components/ui/Icons';

export default function ProcurementDashboardPage() {
  const [metrics, setMetrics] = useState<Record<string, unknown> | null>(null);
  const [openPos, setOpenPos] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [m, aging] = await Promise.all([
        api.getProcurementMetrics().catch(() => null),
        api.getOpenPoAging().catch(() => []),
      ]);
      setMetrics(m);
      setOpenPos(aging);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load procurement metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Top Banner */}
      <div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
          Procurement Operations
        </h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Purchasing KPIs, vendor commitment exposure, and open order aging
        </p>
      </div>

      {error && <ErrorState message={error} onRetry={loadData} />}

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
        <Card>
          <CardContent style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Active Suppliers
              </span>
              <IconProcurement size={18} style={{ color: 'var(--accent)' }} />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 'var(--space-2)', fontFamily: 'var(--font-mono)' }}>
              {loading ? <Skeleton width="50px" height="2rem" /> : String(metrics?.activeSuppliersCount ?? 0)}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Approved Vendors</span>
          </CardContent>
        </Card>

        <Card>
          <CardContent style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Purchase Orders
              </span>
              <IconInventory size={18} style={{ color: 'var(--info)' }} />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 'var(--space-2)', fontFamily: 'var(--font-mono)' }}>
              {loading ? <Skeleton width="50px" height="2rem" /> : String(metrics?.totalPurchaseOrdersCount ?? 0)}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Executed Orders</span>
          </CardContent>
        </Card>

        <Card>
          <CardContent style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Completed Receipts
              </span>
              <IconProcurement size={18} style={{ color: 'var(--success)' }} />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 'var(--space-2)', fontFamily: 'var(--font-mono)' }}>
              {loading ? <Skeleton width="50px" height="2rem" /> : String(metrics?.completedGoodsReceiptsCount ?? 0)}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600 }}>Goods Received</span>
          </CardContent>
        </Card>

        <Card>
          <CardContent style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Fulfilled Spend
              </span>
              <IconFinance size={18} style={{ color: 'var(--warning)' }} />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 'var(--space-2)', fontFamily: 'var(--font-mono)' }}>
              {loading ? <Skeleton width="80px" height="2rem" /> : `$${Number(metrics?.totalFulfilledSpend ?? 0).toFixed(2)}`}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Purchasing Value</span>
          </CardContent>
        </Card>
      </div>

      {/* Open PO Aging Table */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Open Purchase Order Aging</CardTitle>
            <CardDescription>Active purchase orders pending warehouse receipt</CardDescription>
          </div>
        </CardHeader>
        <CardContent style={{ padding: 0 }}>
          <Table<Record<string, unknown>>
            isLoading={loading}
            data={openPos}
            keyExtractor={(po) => String(po.id)}
            emptyText="No open Purchase Orders pending receipt."
            columns={[
              {
                header: 'PO Number',
                accessor: (po) => (
                  <span className="code-font" style={{ fontWeight: 700, color: 'var(--accent)' }}>
                    {String(po.poNumber)}
                  </span>
                ),
              },
              {
                header: 'Status',
                accessor: (po) => <Badge variant="transfer">{String(po.status)}</Badge>,
              },
              {
                header: 'Total Value',
                accessor: (po) => (
                  <span className="code-font" style={{ fontWeight: 700 }}>
                    ${Number(po.grandTotal).toFixed(2)}
                  </span>
                ),
              },
              {
                header: 'Issued Date',
                accessor: (po) => (
                  <span className="code-font" style={{ color: 'var(--text-secondary)' }}>
                    {new Date(String(po.createdAt)).toLocaleDateString()}
                  </span>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

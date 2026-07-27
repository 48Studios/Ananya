'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../src/lib/api';
import { Button } from '../../src/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { Table } from '../../src/components/ui/Table';
import { Skeleton } from '../../src/components/ui/Skeleton';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { IconWarehouse, IconPlus, IconArrowRight } from '../../src/components/ui/Icons';

export default function WarehouseDashboardPage() {
  const [warehouses, setWarehouses] = useState<Record<string, unknown>[]>([]);
  const [stockCounts, setStockCounts] = useState<Record<string, unknown>[]>([]);
  const [cycleCounts, setCycleCounts] = useState<Record<string, unknown>[]>([]);
  const [transfers, setTransfers] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [whData, scData, ccData, wtData] = await Promise.all([
        api.getWarehouses().catch(() => []),
        api.getStockCounts().catch(() => []),
        api.getCycleCounts().catch(() => []),
        api.getWarehouseTransfers().catch(() => []),
      ]);
      setWarehouses(whData);
      setStockCounts(scData);
      setCycleCounts(ccData);
      setTransfers(wtData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load warehouse metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const pendingStockCounts = stockCounts.filter((s) => s.status === 'SUBMITTED' || s.status === 'APPROVED').length;
  const activeCycleCounts = cycleCounts.filter((c) => c.status === 'ACTIVE').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
            Warehouse Operations Console
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Physical storage hierarchy, bin utilization, stock audits, and internal transfers
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Link href="/warehouses">
            <Button variant="secondary" size="sm" leftIcon={<IconPlus size={14} />}>
              New Warehouse
            </Button>
          </Link>
          <Link href="/warehouse-transfers">
            <Button variant="primary" size="sm" leftIcon={<IconPlus size={14} />}>
              Bin Transfer
            </Button>
          </Link>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={loadData} />}

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
        <Card>
          <CardContent style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Warehouses
              </span>
              <IconWarehouse size={18} style={{ color: 'var(--accent)' }} />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 'var(--space-2)', fontFamily: 'var(--font-mono)' }}>
              {loading ? <Skeleton width="50px" height="2rem" /> : warehouses.length}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Physical Facilities</span>
          </CardContent>
        </Card>

        <Card>
          <CardContent style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Stock Counts
              </span>
              <IconWarehouse size={18} style={{ color: 'var(--info)' }} />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 'var(--space-2)', fontFamily: 'var(--font-mono)' }}>
              {loading ? <Skeleton width="50px" height="2rem" /> : stockCounts.length}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600 }}>
              {pendingStockCounts} Pending Approval
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardContent style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Cycle Counts
              </span>
              <IconWarehouse size={18} style={{ color: 'var(--success)' }} />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 'var(--space-2)', fontFamily: 'var(--font-mono)' }}>
              {loading ? <Skeleton width="50px" height="2rem" /> : cycleCounts.length}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600 }}>
              {activeCycleCounts} Active Rules
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardContent style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Bin Transfers
              </span>
              <IconWarehouse size={18} style={{ color: 'var(--warning)' }} />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 'var(--space-2)', fontFamily: 'var(--font-mono)' }}>
              {loading ? <Skeleton width="50px" height="2rem" /> : transfers.length}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Relocation Orders
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Module Navigation Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-4)' }}>
        <Link href="/warehouses">
          <Card>
            <CardContent style={{ padding: 'var(--space-4)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>1. Warehouses</h3>
              <p style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Setup physical facility hierarchy.
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/warehouse-bins">
          <Card>
            <CardContent style={{ padding: 'var(--space-4)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>2. Storage Bins</h3>
              <p style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Manage bin capacity & purposes.
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/stock-counts">
          <Card>
            <CardContent style={{ padding: 'var(--space-4)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>3. Stock Counts</h3>
              <p style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Physical audits & ledger adjustment.
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/cycle-counts">
          <Card>
            <CardContent style={{ padding: 'var(--space-4)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>4. Cycle Counting</h3>
              <p style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Recurring audit schedules.
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/warehouse-transfers">
          <Card>
            <CardContent style={{ padding: 'var(--space-4)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>5. Transfers</h3>
              <p style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Bin-to-bin stock relocation.
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/warehouse-policies">
          <Card>
            <CardContent style={{ padding: 'var(--space-4)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>6. Policies</h3>
              <p style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Bin capacity & putaway rules.
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Facilities Overview Table */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Physical Warehouses</CardTitle>
            <CardDescription>Registered corporate warehouse facilities and bin capacities</CardDescription>
          </div>
          <Link href="/warehouses">
            <Button variant="ghost" size="sm" rightIcon={<IconArrowRight size={14} />}>
              View All Facilities
            </Button>
          </Link>
        </CardHeader>
        <CardContent style={{ padding: 0 }}>
          <Table<Record<string, unknown>>
            isLoading={loading}
            data={warehouses}
            keyExtractor={(w) => String(w.id)}
            emptyText="No warehouse facilities configured yet."
            columns={[
              {
                header: 'Facility Code',
                accessor: (w) => (
                  <span className="code-font" style={{ fontWeight: 700, color: 'var(--accent)' }}>
                    {String(w.code)}
                  </span>
                ),
              },
              {
                header: 'Facility Name',
                accessor: (w) => <span style={{ fontWeight: 600 }}>{String(w.name)}</span>,
              },
              {
                header: 'Status',
                accessor: (w) => <Badge variant="receipt">{String(w.status)}</Badge>,
              },
              {
                header: 'Total Bins',
                accessor: (w) => {
                  const bins = (w.bins as Record<string, unknown>[]) || [];
                  return <span className="code-font">{bins.length} bins</span>;
                },
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

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
import { IconMRP, IconPlus, IconArrowRight } from '../../src/components/ui/Icons';

export default function MrpDashboardPage() {
  const [runs, setRuns] = useState<Record<string, unknown>[]>([]);
  const [shortages, setShortages] = useState<Record<string, unknown>[]>([]);
  const [purchases, setPurchases] = useState<Record<string, unknown>[]>([]);
  const [productions, setProductions] = useState<Record<string, unknown>[]>([]);
  const [capacityPlans, setCapacityPlans] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [rData, sData, purData, prodData, capData] = await Promise.all([
        api.getPlanningRuns().catch(() => []),
        api.getMaterialRequirements(undefined, undefined, undefined, true).catch(() => []),
        api.getPurchaseRecommendations(undefined, undefined, undefined, 'PENDING').catch(() => []),
        api.getProductionRecommendations(undefined, undefined, 'PENDING').catch(() => []),
        api.getCapacityPlans(undefined, undefined, true).catch(() => []),
      ]);
      setRuns(rData);
      setShortages(sData);
      setPurchases(purData);
      setProductions(prodData);
      setCapacityPlans(capData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load MRP metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const latestRun = runs[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Top Banner */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
            Material Requirements Planning (MRP) Console
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Central supply/demand engine, net shortage calculations, purchase & production recommendation dispatch
          </p>
        </div>
        <Link href="/mrp/runs">
          <Button variant="primary" size="sm" leftIcon={<IconPlus size={14} />}>
            Execute Planning Run
          </Button>
        </Link>
      </div>

      {error && <ErrorState message={error} onRetry={fetchData} />}

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
        <Card>
          <CardContent style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Planning Runs
              </span>
              <IconMRP size={18} style={{ color: 'var(--accent)' }} />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 'var(--space-2)', fontFamily: 'var(--font-mono)' }}>
              {loading ? <Skeleton width="50px" height="2rem" /> : runs.length}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Latest: {latestRun ? String(latestRun.runNumber) : 'None'}
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardContent style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Material Shortages
              </span>
              <IconMRP size={18} style={{ color: 'var(--danger)' }} />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 'var(--space-2)', fontFamily: 'var(--font-mono)', color: 'var(--danger)' }}>
              {loading ? <Skeleton width="50px" height="2rem" /> : shortages.length}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--danger)', fontWeight: 600 }}>
              Requires Procurement / Production
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardContent style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Purchase Recs
              </span>
              <IconMRP size={18} style={{ color: 'var(--info)' }} />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 'var(--space-2)', fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
              {loading ? <Skeleton width="50px" height="2rem" /> : purchases.length}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Awaiting Planner Approval</span>
          </CardContent>
        </Card>

        <Card>
          <CardContent style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Work Center Load
              </span>
              <IconMRP size={18} style={{ color: 'var(--warning)' }} />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 'var(--space-2)', fontFamily: 'var(--font-mono)', color: 'var(--warning)' }}>
              {loading ? <Skeleton width="50px" height="2rem" /> : capacityPlans.length}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--warning)', fontWeight: 600 }}>
              Utilization &gt; 100%
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Grid of Tables */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 'var(--space-6)' }}>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Recent Material Shortages</CardTitle>
              <CardDescription>Net shortfall inventory items calculated from demand reservations</CardDescription>
            </div>
            <Link href="/mrp/materials">
              <Button variant="ghost" size="sm" rightIcon={<IconArrowRight size={14} />}>
                View All
              </Button>
            </Link>
          </CardHeader>
          <CardContent style={{ padding: 0 }}>
            <Table<Record<string, unknown>>
              isLoading={loading}
              data={shortages.slice(0, 5)}
              keyExtractor={(s) => String(s.id)}
              emptyText="No material shortages reported."
              columns={[
                {
                  header: 'Component ID',
                  accessor: (s) => (
                    <span className="code-font" style={{ fontWeight: 600, color: 'var(--accent)' }}>
                      {String(s.componentId).slice(0, 8)}...
                    </span>
                  ),
                },
                {
                  header: 'Required',
                  accessor: (s) => <span className="code-font">{Number(s.requiredQuantity).toFixed(2)}</span>,
                },
                {
                  header: 'Available',
                  accessor: (s) => <span className="code-font">{Number(s.availableQuantity).toFixed(2)}</span>,
                },
                {
                  header: 'Shortage',
                  accessor: (s) => (
                    <span className="code-font" style={{ fontWeight: 700, color: 'var(--danger)' }}>
                      {Number(s.shortageQuantity).toFixed(2)}
                    </span>
                  ),
                },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Pending Purchase & Production Recs</CardTitle>
              <CardDescription>Generated planner recommendations ready for execution</CardDescription>
            </div>
            <Link href="/mrp/purchases">
              <Button variant="ghost" size="sm" rightIcon={<IconArrowRight size={14} />}>
                View Purchase Recs
              </Button>
            </Link>
          </CardHeader>
          <CardContent style={{ padding: 0 }}>
            <Table<Record<string, unknown>>
              isLoading={loading}
              data={[
                ...purchases.slice(0, 3).map((p) => ({ ...p, recType: 'PURCHASE', itemId: p.componentId })),
                ...productions.slice(0, 3).map((p) => ({ ...p, recType: 'PRODUCTION', itemId: p.productId })),
              ]}
              keyExtractor={(item) => String(item.id)}
              emptyText="No pending recommendations."
              columns={[
                {
                  header: 'Type',
                  accessor: (item) => (
                    <Badge variant={String(item.recType) === 'PURCHASE' ? 'transfer' : 'receipt'}>
                      {String(item.recType)}
                    </Badge>
                  ),
                },
                {
                  header: 'Item ID',
                  accessor: (item) => (
                    <span className="code-font" style={{ color: 'var(--text-secondary)' }}>
                      {String(item.itemId).slice(0, 8)}...
                    </span>
                  ),
                },
                {
                  header: 'Suggested Qty',
                  accessor: (item) => (
                    <span className="code-font" style={{ fontWeight: 700 }}>
                      {Number(item.suggestedQuantity).toFixed(2)}
                    </span>
                  ),
                },
                {
                  header: 'Status',
                  accessor: () => <Badge variant="warning">PENDING</Badge>,
                },
              ]}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

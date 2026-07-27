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
import { IconManufacturing, IconPlus, IconArrowRight, IconInventory } from '../../src/components/ui/Icons';

export default function ManufacturingDashboardPage() {
  const [boms, setBoms] = useState<Record<string, unknown>[]>([]);
  const [orders, setOrders] = useState<Record<string, unknown>[]>([]);
  const [consumptions, setConsumptions] = useState<Record<string, unknown>[]>([]);
  const [fgrs, setFgrs] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [bomData, orderData, mcData, fgrData] = await Promise.all([
        api.getBoms().catch(() => []),
        api.getProductionOrders().catch(() => []),
        api.getMaterialConsumptions().catch(() => []),
        api.getFinishedGoodsReceipts().catch(() => []),
      ]);
      setBoms(bomData);
      setOrders(orderData);
      setConsumptions(mcData);
      setFgrs(fgrData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load manufacturing metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeOrders = orders.filter((o) => o.status === 'IN_PROGRESS' || o.status === 'RELEASED' || o.status === 'MATERIAL_ALLOCATED');
  const releasedBoms = boms.filter((b) => b.status === 'RELEASED');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Top Banner */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
            Manufacturing Operations
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Bill of Materials, Production Runs, Material Consumption & Traceability
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Link href="/boms">
            <Button variant="secondary" size="sm" leftIcon={<IconPlus size={14} />}>
              New BOM
            </Button>
          </Link>
          <Link href="/production-orders">
            <Button variant="primary" size="sm" leftIcon={<IconPlus size={14} />}>
              Production Order
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
                Total BOMs
              </span>
              <IconManufacturing size={18} style={{ color: 'var(--accent)' }} />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 'var(--space-2)', fontFamily: 'var(--font-mono)' }}>
              {loading ? <Skeleton width="50px" height="2rem" /> : boms.length}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{releasedBoms.length} Released Structures</span>
          </CardContent>
        </Card>

        <Card>
          <CardContent style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Production Orders
              </span>
              <IconManufacturing size={18} style={{ color: 'var(--warning)' }} />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 'var(--space-2)', fontFamily: 'var(--font-mono)' }}>
              {loading ? <Skeleton width="50px" height="2rem" /> : orders.length}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600 }}>{activeOrders.length} Active Jobs</span>
          </CardContent>
        </Card>

        <Card>
          <CardContent style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Material Consumptions
              </span>
              <IconInventory size={18} style={{ color: 'var(--info)' }} />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 'var(--space-2)', fontFamily: 'var(--font-mono)' }}>
              {loading ? <Skeleton width="50px" height="2rem" /> : consumptions.length}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Posted Withdrawals</span>
          </CardContent>
        </Card>

        <Card>
          <CardContent style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Finished Goods
              </span>
              <IconInventory size={18} style={{ color: 'var(--success)' }} />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 'var(--space-2)', fontFamily: 'var(--font-mono)' }}>
              {loading ? <Skeleton width="50px" height="2rem" /> : fgrs.length}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600 }}>Assembly Receipts</span>
          </CardContent>
        </Card>
      </div>

      {/* Modules Quick Navigation */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
        <Link href="/boms">
          <Card>
            <CardContent style={{ padding: 'var(--space-4)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>1. Bill of Materials</h3>
              <p style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Manage component assembly structures and revisions.
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/production-orders">
          <Card>
            <CardContent style={{ padding: 'var(--space-4)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>2. Production Orders</h3>
              <p style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Schedule and execute manufacturing jobs.
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/material-consumption">
          <Card>
            <CardContent style={{ padding: 'var(--space-4)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>3. Material Consumption</h3>
              <p style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Record raw material withdrawal from inventory.
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/finished-goods">
          <Card>
            <CardContent style={{ padding: 'var(--space-4)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>4. Finished Goods</h3>
              <p style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Receive finished assemblies into stock.
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/traceability">
          <Card>
            <CardContent style={{ padding: 'var(--space-4)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>5. Traceability</h3>
              <p style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Forward & backward batch genealogy lookups.
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Active Production Orders Summary Table */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Active Production Runs</CardTitle>
            <CardDescription>Manufacturing job execution, completion, and scrap rates</CardDescription>
          </div>
          <Link href="/production-orders">
            <Button variant="ghost" size="sm" rightIcon={<IconArrowRight size={14} />}>
              View All
            </Button>
          </Link>
        </CardHeader>
        <CardContent style={{ padding: 0 }}>
          <Table<Record<string, unknown>>
            isLoading={loading}
            data={orders.slice(0, 10)}
            keyExtractor={(o) => String(o.id)}
            emptyText="No production orders created yet."
            columns={[
              {
                header: 'Production #',
                accessor: (o) => (
                  <span className="code-font" style={{ fontWeight: 700, color: 'var(--accent)' }}>
                    {String(o.productionNumber)}
                  </span>
                ),
              },
              {
                header: 'Status',
                accessor: (o) => {
                  const statusStr = String(o.status);
                  const variant = statusStr === 'COMPLETED' ? 'receipt' : statusStr === 'IN_PROGRESS' ? 'transfer' : 'neutral';
                  return <Badge variant={variant}>{statusStr}</Badge>;
                },
              },
              {
                header: 'Planned Qty',
                accessor: (o) => (
                  <span className="code-font" style={{ fontWeight: 600 }}>
                    {String(o.quantityPlanned)} pcs
                  </span>
                ),
              },
              {
                header: 'Completed',
                accessor: (o) => (
                  <span className="code-font" style={{ fontWeight: 700, color: 'var(--success)' }}>
                    {String(o.quantityCompleted)} pcs
                  </span>
                ),
              },
              {
                header: 'Scrapped',
                accessor: (o) => (
                  <span className="code-font" style={{ color: 'var(--danger)' }}>
                    {String(o.quantityScrapped)} pcs
                  </span>
                ),
              },
              {
                header: 'Created At',
                accessor: (o) => (
                  <span className="code-font" style={{ color: 'var(--text-secondary)' }}>
                    {new Date(String(o.createdAt)).toLocaleString()}
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

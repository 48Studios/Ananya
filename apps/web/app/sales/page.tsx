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
import { IconSales, IconPlus, IconArrowRight, IconCRM, IconInventory, IconProcurement, IconCheck } from '../../src/components/ui/Icons';

export default function SalesDashboardPage() {
  const [customers, setCustomers] = useState<Record<string, unknown>[]>([]);
  const [quotations, setQuotations] = useState<Record<string, unknown>[]>([]);
  const [salesOrders, setSalesOrders] = useState<Record<string, unknown>[]>([]);
  const [fulfillmentRequests, setFulfillmentRequests] = useState<Record<string, unknown>[]>([]);
  const [returns, setReturns] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [cData, qData, soData, fData, rData] = await Promise.all([
        api.getCustomers().catch(() => []),
        api.getQuotations().catch(() => []),
        api.getSalesOrders().catch(() => []),
        api.getFulfillmentRequests().catch(() => []),
        api.getCustomerReturns().catch(() => []),
      ]);
      setCustomers(cData);
      setQuotations(qData);
      setSalesOrders(soData);
      setFulfillmentRequests(fData);
      setReturns(rData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load sales dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeCustomersCount = customers.filter((c) => c.status === 'ACTIVE').length;
  const sentQuotationsCount = quotations.filter((q) => q.status === 'SENT').length;
  const pendingOrdersCount = salesOrders.filter((s) => s.status === 'RELEASED' || s.status === 'APPROVED').length;
  const openReturnsCount = returns.filter((r) => r.status === 'APPROVED' || r.status === 'RECEIVED').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Top Banner */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
            Sales Operations Console
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Commercial customer relationships, quotations, sales orders, and warehouse fulfillment tracking
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Link href="/customers">
            <Button variant="secondary" size="sm" leftIcon={<IconPlus size={14} />}>
              New Customer
            </Button>
          </Link>
          <Link href="/sales-orders">
            <Button variant="primary" size="sm" leftIcon={<IconPlus size={14} />}>
              Sales Order
            </Button>
          </Link>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={loadData} />}

      {/* KPI Metrics Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
        <Card>
          <CardContent style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Customers
              </span>
              <IconCRM size={18} style={{ color: 'var(--accent)' }} />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 'var(--space-2)', fontFamily: 'var(--font-mono)' }}>
              {loading ? <Skeleton width="50px" height="2rem" /> : customers.length}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600 }}>
              {activeCustomersCount} Active Accounts
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardContent style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Quotations
              </span>
              <IconSales size={18} style={{ color: 'var(--info)' }} />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 'var(--space-2)', fontFamily: 'var(--font-mono)' }}>
              {loading ? <Skeleton width="50px" height="2rem" /> : quotations.length}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600 }}>
              {sentQuotationsCount} Sent Proposals
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardContent style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Sales Orders
              </span>
              <IconProcurement size={18} style={{ color: 'var(--warning)' }} />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 'var(--space-2)', fontFamily: 'var(--font-mono)' }}>
              {loading ? <Skeleton width="50px" height="2rem" /> : salesOrders.length}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--warning)', fontWeight: 600 }}>
              {pendingOrdersCount} Pending Fulfillment
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardContent style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Fulfillments
              </span>
              <IconInventory size={18} style={{ color: 'var(--success)' }} />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 'var(--space-2)', fontFamily: 'var(--font-mono)' }}>
              {loading ? <Skeleton width="50px" height="2rem" /> : fulfillmentRequests.length}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Dispatched Packages
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardContent style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Returns (RMA)
              </span>
              <IconCheck size={18} style={{ color: 'var(--danger)' }} />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 'var(--space-2)', fontFamily: 'var(--font-mono)' }}>
              {loading ? <Skeleton width="50px" height="2rem" /> : returns.length}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--danger)', fontWeight: 600 }}>
              {openReturnsCount} Open RMAs
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Navigation Shortcuts Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
        <Link href="/customers">
          <Card style={{ transition: 'border-color var(--transition-fast)' }}>
            <CardContent style={{ padding: 'var(--space-4)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>1. Customers</h3>
              <p style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Account master & contact rosters.
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/quotations">
          <Card style={{ transition: 'border-color var(--transition-fast)' }}>
            <CardContent style={{ padding: 'var(--space-4)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>2. Quotations</h3>
              <p style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Price proposals & conversions.
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/sales-orders">
          <Card style={{ transition: 'border-color var(--transition-fast)' }}>
            <CardContent style={{ padding: 'var(--space-4)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>3. Sales Orders</h3>
              <p style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Order approval & warehouse release.
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/fulfillment">
          <Card style={{ transition: 'border-color var(--transition-fast)' }}>
            <CardContent style={{ padding: 'var(--space-4)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>4. Fulfillment</h3>
              <p style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Pick, pack, & dispatch tracking.
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/customer-returns">
          <Card style={{ transition: 'border-color var(--transition-fast)' }}>
            <CardContent style={{ padding: 'var(--space-4)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>5. Returns (RMA)</h3>
              <p style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Inspection & restocking management.
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Recent Orders Overview Table */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Recent Sales Orders</CardTitle>
            <CardDescription>Commercial order approvals and warehouse release status</CardDescription>
          </div>
          <Link href="/sales-orders">
            <Button variant="ghost" size="sm" rightIcon={<IconArrowRight size={14} />}>
              View All
            </Button>
          </Link>
        </CardHeader>
        <CardContent style={{ padding: 0 }}>
          <Table<Record<string, unknown>>
            isLoading={loading}
            data={salesOrders}
            keyExtractor={(so) => String(so.id)}
            emptyText="No commercial sales orders generated yet."
            columns={[
              {
                header: 'Order Number',
                accessor: (so) => (
                  <span className="code-font" style={{ fontWeight: 700, color: 'var(--accent)' }}>
                    {String(so.orderNumber)}
                  </span>
                ),
              },
              {
                header: 'Customer',
                accessor: (so) => {
                  const cust = customers.find((c) => c.id === so.customerId);
                  return <span style={{ fontWeight: 600 }}>{String(cust?.name ?? so.customerId)}</span>;
                },
              },
              {
                header: 'Order Date',
                accessor: (so) => (
                  <span className="code-font" style={{ color: 'var(--text-secondary)' }}>
                    {new Date(String(so.orderDate)).toLocaleDateString()}
                  </span>
                ),
              },
              {
                header: 'Status',
                accessor: (so) => <Badge variant="transfer">{String(so.status)}</Badge>,
              },
              {
                header: 'Line Items',
                accessor: (so) => {
                  const lines = (so.lines as Record<string, unknown>[]) || [];
                  return <span className="code-font">{lines.length} items</span>;
                },
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

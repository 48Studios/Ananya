'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Component, Location, InventoryTransaction } from '@ananya/inventory';
import { TransactionType } from '@ananya/inventory';
import { api } from '../src/lib/api';
import { Button } from '../src/components/ui/Button';
import { Badge } from '../src/components/ui/Badge';
import { PageHeader } from '../src/components/shared/page-header/PageHeader';
import { StatCard } from '../src/components/shared/stat-card/StatCard';
import { DashboardCard } from '../src/components/shared/dashboard-card/DashboardCard';
import { EntityTable } from '../src/components/shared/entity-table/EntityTable';
import { ErrorState } from '../src/components/shared/error-state/ErrorState';
import { formatLocationPathString } from '../src/lib/location-utils';
import { TransactionModal } from '../src/features/transactions/TransactionModal';
import { Plus, Boxes, Warehouse, Activity, Search, ArrowRight } from 'lucide-react';
import { ColumnDef } from '@tanstack/react-table';

export default function DashboardPage() {
  const [components, setComponents] = useState<Component[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<TransactionType>(TransactionType.Receipt);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [compRes, locRes, txRes] = await Promise.all([
        api.getComponents().catch(() => []),
        api.getLocations().catch(() => []),
        api.getTransactions().catch(() => []),
      ]);
      setComponents(compRes);
      setLocations(locRes);
      setTransactions(txRes);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openAction = (type: TransactionType) => {
    setModalType(type);
    setModalOpen(true);
  };

  const getComponentName = (id: string) => {
    const c = components.find((comp) => comp.id === id);
    return c ? `${c.sku} (${c.name})` : id;
  };

  const transactionColumns: ColumnDef<InventoryTransaction>[] = [
    {
      accessorKey: 'createdAt',
      header: 'Timestamp',
      cell: ({ row }) => (
        <span className="code-font" style={{ color: 'var(--muted-foreground)' }}>
          {new Date(row.original.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      accessorKey: 'transactionType',
      header: 'Type',
      cell: ({ row }) => {
        const v = row.original.transactionType.toLowerCase();
        const variant = v === 'receipt' ? 'receipt' : v === 'transfer' ? 'transfer' : v === 'issue' ? 'issue' : 'adjustment';
        return <Badge variant={variant}>{row.original.transactionType}</Badge>;
      },
    },
    {
      accessorKey: 'componentId',
      header: 'Component',
      cell: ({ row }) => (
        <span style={{ fontWeight: 500 }}>{getComponentName(row.original.componentId)}</span>
      ),
    },
    {
      accessorKey: 'quantity',
      header: 'Quantity',
      cell: ({ row }) => (
        <span className="code-font" style={{ fontWeight: 600 }}>
          {row.original.quantity} {row.original.unitOfMeasure}
        </span>
      ),
    },
    {
      accessorKey: 'sourceLocationId',
      header: 'Source Location',
      cell: ({ row }) => (
        <span className="code-font" style={{ color: 'var(--muted-foreground)' }}>
          {row.original.sourceLocationId ? formatLocationPathString(locations, row.original.sourceLocationId) : '-'}
        </span>
      ),
    },
    {
      accessorKey: 'destinationLocationId',
      header: 'Destination Location',
      cell: ({ row }) => (
        <span className="code-font" style={{ color: 'var(--muted-foreground)' }}>
          {row.original.destinationLocationId ? formatLocationPathString(locations, row.original.destinationLocationId) : '-'}
        </span>
      ),
    },
    {
      accessorKey: 'reference',
      header: 'Reference',
      cell: ({ row }) => (
        <span className="code-font" style={{ color: 'var(--muted-foreground)' }}>
          {row.original.reference || '-'}
        </span>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Page Header */}
      <PageHeader
        title="Operations Console"
        description="48 Studios physical inventory management & audited ledger operations"
        actions={
          <>
            <Button variant="primary" leftIcon={<Plus size={16} />} onClick={() => openAction(TransactionType.Receipt)}>
              Receive Stock
            </Button>
            <Button variant="secondary" onClick={() => openAction(TransactionType.Transfer)}>
              Move Stock
            </Button>
            <Button variant="secondary" onClick={() => openAction(TransactionType.Issue)}>
              Consume Stock
            </Button>
            <Button variant="outline" onClick={() => openAction(TransactionType.Adjustment)}>
              Adjust Stock
            </Button>
          </>
        }
      />

      {error && <ErrorState message={error} onRetry={loadData} />}

      {/* KPI Metrics Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
        }}
      >
        <StatCard
          title="Total Products"
          value={loading ? '...' : components.length}
          subtitle="Registered SKU Catalog"
          icon={<Boxes size={18} />}
        />
        <StatCard
          title="Storage Bins"
          value={loading ? '...' : locations.length}
          subtitle="Active Warehouse Locations"
          icon={<Warehouse size={18} />}
        />
        <StatCard
          title="Ledger Entries"
          value={loading ? '...' : transactions.length}
          subtitle="Audited Stock Transactions"
          icon={<Activity size={18} />}
        />
        <StatCard
          title="Primary Discovery"
          value="Search First"
          subtitle="Human-Readable Storage Paths"
          icon={<Search size={18} />}
        />
      </div>

      {/* Direct Search Launcher Card */}
      <DashboardCard
        title="Direct Inventory Discovery"
        subtitle="Search components by SKU, MPN, location path, or specifications"
        action={
          <Link href="/inventory">
            <Button variant="secondary" size="sm" rightIcon={<ArrowRight size={14} />}>
              Open Inventory Browser
            </Button>
          </Link>
        }
      >
        <Link href="/inventory" style={{ display: 'block' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'var(--muted)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 16px',
              gap: '12px',
              color: 'var(--muted-foreground)',
              fontSize: '0.85rem',
            }}
          >
            <Search size={18} />
            <span style={{ flex: 1 }}>Filter components by SKU, identity, manufacturer MPN, alias, or bin...</span>
            <span
              style={{
                fontSize: '0.7rem',
                fontFamily: 'var(--font-mono)',
                backgroundColor: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '2px 6px',
              }}
            >
              Press /
            </span>
          </div>
        </Link>
      </DashboardCard>

      {/* Recent Ledger Transactions DataTable */}
      <DashboardCard
        title="Recent Ledger Transactions"
        subtitle="Latest audited stock receipts, transfers, issues, and adjustments"
        action={
          <Link href="/transactions">
            <Button variant="ghost" size="sm" rightIcon={<ArrowRight size={14} />}>
              View All
            </Button>
          </Link>
        }
      >
        <EntityTable<InventoryTransaction>
          data={transactions}
          columns={transactionColumns}
          isLoading={loading}
          searchPlaceholder="Search recent transactions..."
          emptyTitle="No ledger transactions recorded yet"
          emptyDescription="Stock operations will record audited ledger entries here."
        />
      </DashboardCard>

      <TransactionModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={loadData}
        components={components}
        locations={locations}
        initialType={modalType}
      />
    </div>
  );
}

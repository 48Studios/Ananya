'use client';

import React, { useEffect, useState } from 'react';
import type { Component, Location, InventoryTransaction } from '@ananya/inventory';
import { TransactionType } from '@ananya/inventory';
import { api } from '../../src/lib/api';
import { Button } from '../../src/components/ui/Button';
import { PageHeader } from '../../src/components/shared/page-header/PageHeader';
import { DashboardCard } from '../../src/components/shared/dashboard-card/DashboardCard';
import { EntityTable } from '../../src/components/shared/entity-table/EntityTable';
import { ErrorState } from '../../src/components/shared/error-state/ErrorState';
import { formatLocationPathString } from '../../src/lib/location-utils';
import { TransactionModal } from '../../src/features/transactions/TransactionModal';
import { Plus } from 'lucide-react';
import { ColumnDef } from '@tanstack/react-table';

interface InventoryStockRow {
  component: Component;
  locationId: string | null;
  totalQuantity: number;
}

export default function InventoryBrowserPage() {
  const [components, setComponents] = useState<Component[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal State
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [selectedCompId, setSelectedCompId] = useState('');
  const [selectedLocId, setSelectedLocId] = useState('');
  const [selectedTxType, setSelectedTxType] = useState<TransactionType>(TransactionType.Receipt);

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
      setError(err instanceof Error ? err.message : 'Failed to load inventory data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Compute stock balances
  const stockMap = new Map<string, InventoryStockRow>();

  components.forEach((comp) => {
    const key = `${comp.id}:${comp.defaultLocationId || 'unassigned'}`;
    stockMap.set(key, {
      component: comp,
      locationId: comp.defaultLocationId || null,
      totalQuantity: 0,
    });
  });

  transactions.forEach((tx) => {
    const comp = components.find((c) => c.id === tx.componentId);
    if (!comp) return;

    if (tx.transactionType === TransactionType.Receipt && tx.destinationLocationId) {
      const key = `${comp.id}:${tx.destinationLocationId}`;
      const existing = stockMap.get(key) || { component: comp, locationId: tx.destinationLocationId, totalQuantity: 0 };
      existing.totalQuantity += tx.quantity;
      stockMap.set(key, existing);
    } else if (tx.transactionType === TransactionType.Issue && tx.sourceLocationId) {
      const key = `${comp.id}:${tx.sourceLocationId}`;
      const existing = stockMap.get(key) || { component: comp, locationId: tx.sourceLocationId, totalQuantity: 0 };
      existing.totalQuantity -= tx.quantity;
      stockMap.set(key, existing);
    } else if (tx.transactionType === TransactionType.Transfer) {
      if (tx.sourceLocationId) {
        const srcKey = `${comp.id}:${tx.sourceLocationId}`;
        const existingSrc = stockMap.get(srcKey) || { component: comp, locationId: tx.sourceLocationId, totalQuantity: 0 };
        existingSrc.totalQuantity -= tx.quantity;
        stockMap.set(srcKey, existingSrc);
      }
      if (tx.destinationLocationId) {
        const destKey = `${comp.id}:${tx.destinationLocationId}`;
        const existingDest = stockMap.get(destKey) || { component: comp, locationId: tx.destinationLocationId, totalQuantity: 0 };
        existingDest.totalQuantity += tx.quantity;
        stockMap.set(destKey, existingDest);
      }
    } else if (tx.transactionType === TransactionType.Adjustment && tx.destinationLocationId) {
      const key = `${comp.id}:${tx.destinationLocationId}`;
      const existing = stockMap.get(key) || { component: comp, locationId: tx.destinationLocationId, totalQuantity: 0 };
      existing.totalQuantity += tx.quantity;
      stockMap.set(key, existing);
    }
  });

  const stockRows = Array.from(stockMap.values());

  const triggerAction = (type: TransactionType, compId: string, locId?: string | null) => {
    setSelectedTxType(type);
    setSelectedCompId(compId);
    setSelectedLocId(locId || '');
    setActionModalOpen(true);
  };

  const columns: ColumnDef<InventoryStockRow>[] = [
    {
      accessorKey: 'component.sku',
      header: 'Item SKU',
      cell: ({ row }) => (
        <span className="code-font" style={{ fontWeight: 600, color: 'var(--primary)' }}>
          {row.original.component.sku}
        </span>
      ),
    },
    {
      accessorKey: 'component.name',
      header: 'Item Identity / Specifications',
      cell: ({ row }) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.original.component.name}</div>
          {row.original.component.description && (
            <div style={{ fontSize: '0.775rem', color: 'var(--muted-foreground)' }}>
              {row.original.component.description}
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'totalQuantity',
      header: 'Current Quantity',
      cell: ({ row }) => (
        <span
          className="code-font"
          style={{
            fontWeight: 700,
            fontSize: '0.95rem',
            color: row.original.totalQuantity > 0 ? 'var(--success)' : 'var(--muted-foreground)',
          }}
        >
          {row.original.totalQuantity} {row.original.component.unit || 'pcs'}
        </span>
      ),
    },
    {
      accessorKey: 'locationId',
      header: 'Physical Location',
      cell: ({ row }) => (
        <span className="code-font" style={{ color: 'var(--foreground)' }}>
          {formatLocationPathString(locations, row.original.locationId)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div style={{ display: 'flex', gap: '4px' }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => triggerAction(TransactionType.Receipt, row.original.component.id, row.original.locationId)}
          >
            Receive
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => triggerAction(TransactionType.Transfer, row.original.component.id, row.original.locationId)}
          >
            Move
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => triggerAction(TransactionType.Issue, row.original.component.id, row.original.locationId)}
          >
            Consume
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => triggerAction(TransactionType.Adjustment, row.original.component.id, row.original.locationId)}
          >
            Adjust
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        title="Inventory Browser"
        description="Search-first primary daily interface for component discovery & stock actions"
        actions={
          <Button
            variant="primary"
            leftIcon={<Plus size={16} />}
            onClick={() => triggerAction(TransactionType.Receipt, '')}
          >
            Receive Inventory
          </Button>
        }
      />

      {error && <ErrorState message={error} onRetry={loadData} />}

      <DashboardCard>
        <EntityTable<InventoryStockRow>
          data={stockRows}
          columns={columns}
          isLoading={loading}
          searchPlaceholder="Filter by SKU, item name, MPN, location, specs..."
          globalFilterFn={(row, query) => {
            const locStr = formatLocationPathString(locations, row.locationId).toLowerCase();
            return (
              row.component.sku.toLowerCase().includes(query.toLowerCase()) ||
              row.component.name.toLowerCase().includes(query.toLowerCase()) ||
              (row.component.description || '').toLowerCase().includes(query.toLowerCase()) ||
              locStr.includes(query.toLowerCase())
            );
          }}
          emptyTitle="No inventory items match search criteria"
          emptyDescription="Try adjusting your filter query or add new stock items."
        />
      </DashboardCard>

      <TransactionModal
        isOpen={actionModalOpen}
        onClose={() => setActionModalOpen(false)}
        onSuccess={loadData}
        components={components}
        locations={locations}
        initialComponentId={selectedCompId}
        initialLocationId={selectedLocId}
        initialType={selectedTxType}
      />
    </div>
  );
}

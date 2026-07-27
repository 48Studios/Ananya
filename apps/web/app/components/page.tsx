'use client';

import React, { useEffect, useState, useCallback } from 'react';
import type { Component, Location, Manufacturer, Unit } from '@ananya/inventory';
import { api } from '../../src/lib/api';
import { Button } from '../../src/components/ui/Button';
import { Card, CardHeader, CardContent } from '../../src/components/ui/Card';
import { Table } from '../../src/components/ui/Table';
import { Input } from '../../src/components/ui/Input';
import { Select } from '../../src/components/ui/Select';
import { Dialog } from '../../src/components/ui/Dialog';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { formatLocationPathString } from '../../src/lib/location-utils';
import { IconPlus, IconSearch } from '../../src/components/ui/Icons';

export default function ComponentsPage() {
  const [components, setComponents] = useState<Component[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  // Create Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [manufacturerId, setManufacturerId] = useState('');
  const [defaultLocationId, setDefaultLocationId] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [compRes, locRes, mfgRes, unitRes] = await Promise.all([
        api.getComponents().catch(() => []),
        api.getLocations().catch(() => []),
        api.getManufacturers().catch(() => []),
        api.getUnits().catch(() => []),
      ]);
      setComponents(compRes);
      setLocations(locRes);
      setManufacturers(mfgRes);
      setUnits(unitRes);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load components');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateComponent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sku || !name) {
      setFormError('SKU and Name are required.');
      return;
    }

    setSubmitting(true);
    setFormError('');

    try {
      await api.createComponent({
        sku,
        name,
        description: description || undefined,
        manufacturerId: manufacturerId || undefined,
        defaultLocationId: defaultLocationId || undefined,
        unit,
      });
      setModalOpen(false);
      setSku('');
      setName('');
      setDescription('');
      loadData();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to create component');
    } finally {
      setSubmitting(false);
    }
  };

  const getManufacturerName = (mfgId?: string | null) => {
    if (!mfgId) return '-';
    const m = manufacturers.find((mfg) => mfg.id === mfgId);
    return m ? `${m.code} (${m.name})` : mfgId;
  };

  const filteredComponents = components.filter(
    (c) =>
      c.sku.toLowerCase().includes(search.toLowerCase()) ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.description || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
            Components Catalog
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Master registry of physical parts, electronic components, and assemblies
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          leftIcon={<IconPlus size={14} />}
          onClick={() => setModalOpen(true)}
        >
          New Component
        </Button>
      </div>

      {error && <ErrorState message={error} onRetry={loadData} />}

      {/* Main Card Table Wrapper */}
      <Card>
        <CardHeader style={{ gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '280px' }}>
            <Input
              placeholder="Search by SKU, component name, specifications..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<IconSearch size={16} />}
            />
          </div>
        </CardHeader>
        <CardContent style={{ padding: 0 }}>
          <Table<Component>
            isLoading={loading}
            data={filteredComponents}
            keyExtractor={(c) => c.id}
            emptyText="No components found in master registry."
            columns={[
              {
                header: 'SKU / Code',
                accessor: (c) => (
                  <span className="code-font" style={{ fontWeight: 600, color: 'var(--accent)' }}>
                    {c.sku}
                  </span>
                ),
              },
              {
                header: 'Component Name',
                accessor: (c) => <span style={{ fontWeight: 600 }}>{c.name}</span>,
              },
              {
                header: 'Description',
                accessor: (c) => (
                  <span style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                    {c.description || '-'}
                  </span>
                ),
              },
              {
                header: 'Manufacturer',
                accessor: (c) => (
                  <span className="code-font" style={{ color: 'var(--text-secondary)' }}>
                    {getManufacturerName(c.manufacturerId)}
                  </span>
                ),
              },
              {
                header: 'Default Location',
                accessor: (c) => (
                  <span className="location-path">
                    {formatLocationPathString(locations, c.defaultLocationId)}
                  </span>
                ),
              },
              {
                header: 'UOM',
                accessor: (c) => (
                  <span className="code-font" style={{ textTransform: 'lowercase' }}>
                    {c.unit || 'pcs'}
                  </span>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>

      {/* Create Component Modal Dialog */}
      <Dialog
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Create New Component"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setModalOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateComponent}
              isLoading={submitting}
            >
              Save Component
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateComponent} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {formError && <ErrorState message={formError} />}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 'var(--space-3)' }}>
            <Input
              label="SKU / Code *"
              required
              placeholder="e.g. RES-0805-10K"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
            />
            <Input
              label="Component Name *"
              required
              placeholder="e.g. 10k Ohm 0805 Resistor 1%"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <Input
            label="Description / Specifications"
            placeholder="e.g. Thick film surface mount resistor, 100mW power rating"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <Select
              label="Manufacturer"
              value={manufacturerId}
              onChange={(e) => setManufacturerId(e.target.value)}
              options={[
                { value: '', label: '-- None / Unknown --' },
                ...manufacturers.map((m) => ({ value: m.id, label: `${m.code} - ${m.name}` })),
              ]}
            />
            <Select
              label="Unit of Measure (UOM)"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              options={
                units.length > 0
                  ? units.map((u) => ({ value: u.name, label: `${u.name} (${u.category})` }))
                  : [
                      { value: 'pcs', label: 'pcs (Pieces)' },
                      { value: 'meters', label: 'meters' },
                      { value: 'grams', label: 'grams' },
                      { value: 'liters', label: 'liters' },
                    ]
              }
            />
          </div>

          <Select
            label="Default Storage Location"
            value={defaultLocationId}
            onChange={(e) => setDefaultLocationId(e.target.value)}
            options={[
              { value: '', label: '-- Unassigned --' },
              ...locations.map((loc) => ({ value: loc.id, label: `${loc.code} - ${loc.name}` })),
            ]}
          />
        </form>
      </Dialog>
    </div>
  );
}

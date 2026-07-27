'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../src/lib/api';
import { Button } from '../../src/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { Table } from '../../src/components/ui/Table';
import { Input } from '../../src/components/ui/Input';
import { Select } from '../../src/components/ui/Select';
import { FormItem, FormLabel } from '../../src/components/ui/Form';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { IconPlus } from '../../src/components/ui/Icons';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Record<string, unknown>[]>([]);
  const [customers, setCustomers] = useState<Record<string, unknown>[]>([]);
  const [salesOrders, setSalesOrders] = useState<Record<string, unknown>[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [salesOrderId, setSalesOrderId] = useState('');
  const [projectManager, setProjectManager] = useState('pm-alice');
  const [startDate, setStartDate] = useState('');
  const [targetCompletionDate, setTargetCompletionDate] = useState('');
  const [priority, setPriority] = useState('MEDIUM');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [pData, cData, soData] = await Promise.all([
        api.getProjects().catch(() => []),
        api.getCustomers().catch(() => []),
        api.getSalesOrders().catch(() => []),
      ]);
      setProjects(pData);
      setCustomers(cData);
      setSalesOrders(soData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createProject({
        name,
        customerId,
        salesOrderId,
        projectManager,
        startDate,
        targetCompletionDate,
        priority,
      });
      setIsCreating(false);
      setName('');
      fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    }
  };

  const handleStart = async (id: string) => {
    try {
      await api.startProject(id);
      fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start project');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
            Project Management Console
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Post-sales commercial execution workspaces, milestone delivery, and progress orchestration
          </p>
        </div>
        <Button
          variant={isCreating ? 'secondary' : 'primary'}
          size="sm"
          leftIcon={!isCreating ? <IconPlus size={14} /> : undefined}
          onClick={() => setIsCreating(!isCreating)}
        >
          {isCreating ? 'Cancel' : 'New Delivery Project'}
        </Button>
      </div>

      {error && <ErrorState message={error} onRetry={fetchData} />}

      {/* Creation Card Form */}
      {isCreating && (
        <Card style={{ maxWidth: 700 }}>
          <CardHeader>
            <div>
              <CardTitle>Create Project Workspace</CardTitle>
              <CardDescription>Initiate a delivery project tied to a commercial sales order</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <Input
                label="Project Name *"
                required
                placeholder="e.g. Acme Corp Cloud Migration & Deployment"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <Select
                  label="Customer *"
                  required
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  options={[
                    { value: '', label: '-- Select Customer --' },
                    ...customers.map((c) => ({ value: String(c.id), label: String(c.name) })),
                  ]}
                />
                <Select
                  label="Initiating Sales Order *"
                  required
                  value={salesOrderId}
                  onChange={(e) => setSalesOrderId(e.target.value)}
                  options={[
                    { value: '', label: '-- Select Sales Order --' },
                    ...salesOrders.map((so) => ({ value: String(so.id), label: String(so.orderNumber) })),
                  ]}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)' }}>
                <Input
                  label="Project Manager"
                  required
                  value={projectManager}
                  onChange={(e) => setProjectManager(e.target.value)}
                />
                <Input
                  label="Start Date *"
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <Input
                  label="Target Completion *"
                  type="date"
                  required
                  value={targetCompletionDate}
                  onChange={(e) => setTargetCompletionDate(e.target.value)}
                />
              </div>

              <FormItem>
                <FormLabel>Priority</FormLabel>
                <Select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  options={[
                    { value: 'LOW', label: 'Low' },
                    { value: 'MEDIUM', label: 'Medium' },
                    { value: 'HIGH', label: 'High' },
                    { value: 'URGENT', label: 'Urgent' },
                  ]}
                />
              </FormItem>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
                <Button type="button" variant="secondary" onClick={() => setIsCreating(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary">
                  Save Project
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Main Table Card */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Delivery Projects Roster</CardTitle>
            <CardDescription>Active commercial delivery projects, project managers, and milestone targets</CardDescription>
          </div>
        </CardHeader>
        <CardContent style={{ padding: 0 }}>
          <Table<Record<string, unknown>>
            isLoading={loading}
            data={projects}
            keyExtractor={(p) => String(p.id)}
            emptyText="No projects found."
            columns={[
              {
                header: 'Project #',
                accessor: (p) => (
                  <span className="code-font" style={{ fontWeight: 700, color: 'var(--accent)' }}>
                    {String(p.projectNumber)}
                  </span>
                ),
              },
              {
                header: 'Project Name',
                accessor: (p) => (
                  <Link href={`/projects/${String(p.id)}`} style={{ fontWeight: 600, color: 'var(--accent)' }}>
                    {String(p.name)}
                  </Link>
                ),
              },
              {
                header: 'Manager',
                accessor: (p) => <span className="code-font">{String(p.projectManager)}</span>,
              },
              {
                header: 'Target Completion',
                accessor: (p) => (
                  <span className="code-font" style={{ color: 'var(--text-secondary)' }}>
                    {new Date(String(p.targetCompletionDate)).toLocaleDateString()}
                  </span>
                ),
              },
              {
                header: 'Priority',
                accessor: (p) => <span style={{ fontWeight: 600 }}>{String(p.priority)}</span>,
              },
              {
                header: 'Status',
                accessor: (p) => {
                  const st = String(p.status);
                  const variant = st === 'COMPLETED' ? 'receipt' : st === 'ACTIVE' ? 'transfer' : st === 'CANCELLED' ? 'issue' : 'neutral';
                  return <Badge variant={variant}>{st}</Badge>;
                },
              },
              {
                header: 'Actions',
                accessor: (p) =>
                  p.status === 'PLANNING' ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleStart(String(p.id))}
                    >
                      Start Project
                    </Button>
                  ) : null,
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

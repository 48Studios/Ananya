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
import { IconCRM, IconPlus, IconArrowRight } from '../../src/components/ui/Icons';

export default function CrmDashboardPage() {
  const [leads, setLeads] = useState<Record<string, unknown>[]>([]);
  const [accounts, setAccounts] = useState<Record<string, unknown>[]>([]);
  const [opportunities, setOpportunities] = useState<Record<string, unknown>[]>([]);
  const [activities, setActivities] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [lData, aData, oData, actData] = await Promise.all([
        api.getLeads().catch(() => []),
        api.getCrmAccounts().catch(() => []),
        api.getOpportunities().catch(() => []),
        api.getActivities().catch(() => []),
      ]);
      setLeads(lData);
      setAccounts(aData);
      setOpportunities(oData);
      setActivities(actData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load CRM dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const pipelineValue = opportunities
    .filter((o) => o.stage !== 'LOST')
    .reduce((sum, o) => sum + (Number(o.estimatedValue) || 0), 0);

  const wonValue = opportunities
    .filter((o) => o.stage === 'WON')
    .reduce((sum, o) => sum + (Number(o.estimatedValue) || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Top Banner */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
            Customer Relationship Management (CRM)
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Lead qualification, pre-sales accounts, deal pipeline, and activity management
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Link href="/leads">
            <Button variant="secondary" size="sm" leftIcon={<IconPlus size={14} />}>
              New Lead
            </Button>
          </Link>
          <Link href="/opportunities">
            <Button variant="primary" size="sm" leftIcon={<IconPlus size={14} />}>
              Pipeline Kanban
            </Button>
          </Link>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={loadData} />}

      {/* CRM Summary Metrics Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
        <Card>
          <CardContent style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Active Leads
              </span>
              <IconCRM size={18} style={{ color: 'var(--accent)' }} />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 'var(--space-2)', fontFamily: 'var(--font-mono)' }}>
              {loading ? <Skeleton width="50px" height="2rem" /> : leads.length}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600 }}>
              {leads.filter((l) => l.status === 'NEW' || l.status === 'QUALIFIED').length} In Pipeline
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardContent style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                CRM Accounts
              </span>
              <IconCRM size={18} style={{ color: 'var(--info)' }} />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 'var(--space-2)', fontFamily: 'var(--font-mono)' }}>
              {loading ? <Skeleton width="50px" height="2rem" /> : accounts.length}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Prospect Companies</span>
          </CardContent>
        </Card>

        <Card>
          <CardContent style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Activities
              </span>
              <IconCRM size={18} style={{ color: 'var(--warning)' }} />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 'var(--space-2)', fontFamily: 'var(--font-mono)' }}>
              {loading ? <Skeleton width="50px" height="2rem" /> : activities.length}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--warning)', fontWeight: 600 }}>
              {activities.filter((act) => act.status === 'SCHEDULED').length} Pending Tasks
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardContent style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Pipeline Forecast
              </span>
              <IconCRM size={18} style={{ color: 'var(--success)' }} />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 'var(--space-2)', fontFamily: 'var(--font-mono)', color: 'var(--success)' }}>
              {loading ? <Skeleton width="80px" height="2rem" /> : `$${pipelineValue.toFixed(2)}`}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Estimated Value</span>
          </CardContent>
        </Card>

        <Card>
          <CardContent style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Won Revenue
              </span>
              <IconCRM size={18} style={{ color: 'var(--accent)' }} />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 'var(--space-2)', fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
              {loading ? <Skeleton width="80px" height="2rem" /> : `$${wonValue.toFixed(2)}`}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600 }}>
              Handed Off to Sales
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Navigation Modules Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
        <Link href="/leads">
          <Card>
            <CardContent style={{ padding: 'var(--space-4)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>1. Lead Management</h3>
              <p style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Inbound leads, qualification & conversion.
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/accounts">
          <Card>
            <CardContent style={{ padding: 'var(--space-4)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>2. Accounts & Contacts</h3>
              <p style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Pre-sales prospect companies & key decision makers.
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/opportunities">
          <Card>
            <CardContent style={{ padding: 'var(--space-4)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>3. Opportunity Pipeline</h3>
              <p style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Kanban deal progression & sales quotation handoff.
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/activities">
          <Card>
            <CardContent style={{ padding: 'var(--space-4)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>4. Activities & Tasks</h3>
              <p style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Calls, meetings, emails & scheduled touchpoints.
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Active Pipeline Deals Table */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Active CRM Opportunity Pipeline</CardTitle>
            <CardDescription>Qualified commercial deal progression and win probabilities</CardDescription>
          </div>
          <Link href="/opportunities">
            <Button variant="ghost" size="sm" rightIcon={<IconArrowRight size={14} />}>
              View Pipeline
            </Button>
          </Link>
        </CardHeader>
        <CardContent style={{ padding: 0 }}>
          <Table<Record<string, unknown>>
            isLoading={loading}
            data={opportunities}
            keyExtractor={(opp) => String(opp.id)}
            emptyText="No opportunities in pipeline."
            columns={[
              {
                header: 'Deal #',
                accessor: (opp) => (
                  <span className="code-font" style={{ fontWeight: 700, color: 'var(--accent)' }}>
                    {String(opp.opportunityNumber)}
                  </span>
                ),
              },
              {
                header: 'Deal Name',
                accessor: (opp) => (
                  <Link href={`/opportunities/${String(opp.id)}`} style={{ fontWeight: 600, color: 'var(--accent)' }}>
                    {String(opp.name)}
                  </Link>
                ),
              },
              {
                header: 'Stage',
                accessor: (opp) => {
                  const stage = String(opp.stage);
                  const variant = stage === 'WON' ? 'receipt' : stage === 'LOST' ? 'issue' : 'transfer';
                  return <Badge variant={variant}>{stage}</Badge>;
                },
              },
              {
                header: 'Est. Value',
                accessor: (opp) => (
                  <span className="code-font" style={{ fontWeight: 700 }}>
                    ${Number(opp.estimatedValue).toFixed(2)}
                  </span>
                ),
              },
              {
                header: 'Win Prob.',
                accessor: (opp) => <span className="code-font">{Number(opp.probability)}%</span>,
              },
              {
                header: 'Expected Close',
                accessor: (opp) => (
                  <span className="code-font" style={{ color: 'var(--text-secondary)' }}>
                    {new Date(String(opp.expectedCloseDate)).toLocaleDateString()}
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

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
import { IconFinance, IconPlus, IconArrowRight } from '../../src/components/ui/Icons';

export default function FinanceDashboardPage() {
  const [accounts, setAccounts] = useState<Record<string, unknown>[]>([]);
  const [journals, setJournals] = useState<Record<string, unknown>[]>([]);
  const [receivables, setReceivables] = useState<Record<string, unknown>[]>([]);
  const [payables, setPayables] = useState<Record<string, unknown>[]>([]);
  const [payments, setPayments] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [accData, jData, arData, apData, pData] = await Promise.all([
        api.getAccounts().catch(() => []),
        api.getJournalEntries().catch(() => []),
        api.getReceivableInvoices().catch(() => []),
        api.getPayableInvoices().catch(() => []),
        api.getPayments().catch(() => []),
      ]);
      setAccounts(accData);
      setJournals(jData);
      setReceivables(arData);
      setPayables(apData);
      setPayments(pData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load finance metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalReceivables = receivables.reduce((sum, r) => sum + (Number(r.balance) || 0), 0);
  const totalPayables = payables.reduce((sum, p) => sum + (Number(p.balance) || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Top Banner */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
            Financial Core Operations Console
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            General ledger system of record, chart of accounts, AR/AP ledgers, payments, and bank reconciliations
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Link href="/chart-of-accounts">
            <Button variant="secondary" size="sm" leftIcon={<IconPlus size={14} />}>
              Chart of Accounts
            </Button>
          </Link>
          <Link href="/journal-entries">
            <Button variant="primary" size="sm" leftIcon={<IconPlus size={14} />}>
              New Journal Entry
            </Button>
          </Link>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={loadData} />}

      {/* Financial Metrics Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
        <Card>
          <CardContent style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Active Accounts
              </span>
              <IconFinance size={18} style={{ color: 'var(--accent)' }} />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 'var(--space-2)', fontFamily: 'var(--font-mono)' }}>
              {loading ? <Skeleton width="50px" height="2rem" /> : accounts.length}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600 }}>
              {accounts.filter((a) => a.isActive).length} Active Nodes
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardContent style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Journal Entries
              </span>
              <IconFinance size={18} style={{ color: 'var(--info)' }} />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 'var(--space-2)', fontFamily: 'var(--font-mono)' }}>
              {loading ? <Skeleton width="50px" height="2rem" /> : journals.length}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600 }}>
              {journals.filter((j) => j.status === 'POSTED').length} Posted Entries
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardContent style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Receivables (AR)
              </span>
              <IconFinance size={18} style={{ color: 'var(--success)' }} />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 'var(--space-2)', fontFamily: 'var(--font-mono)', color: 'var(--success)' }}>
              {loading ? <Skeleton width="80px" height="2rem" /> : `$${totalReceivables.toFixed(2)}`}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {receivables.filter((r) => r.status !== 'PAID').length} Open Customer Invoices
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardContent style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Payables (AP)
              </span>
              <IconFinance size={18} style={{ color: 'var(--danger)' }} />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 'var(--space-2)', fontFamily: 'var(--font-mono)', color: 'var(--danger)' }}>
              {loading ? <Skeleton width="80px" height="2rem" /> : `$${totalPayables.toFixed(2)}`}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {payables.filter((p) => p.status !== 'PAID').length} Open Vendor Bills
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardContent style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Payments
              </span>
              <IconFinance size={18} style={{ color: 'var(--warning)' }} />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 'var(--space-2)', fontFamily: 'var(--font-mono)' }}>
              {loading ? <Skeleton width="50px" height="2rem" /> : payments.length}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--warning)', fontWeight: 600 }}>
              Settled Transactions
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Navigation Submodules Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
        <Link href="/chart-of-accounts">
          <Card>
            <CardContent style={{ padding: 'var(--space-4)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>1. Chart of Accounts</h3>
              <p style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Asset, liability, equity, revenue & expense accounts.
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/journal-entries">
          <Card>
            <CardContent style={{ padding: 'var(--space-4)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>2. Journal Entries & GL</h3>
              <p style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Double-entry ledger posting & reversals.
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/accounts-receivable">
          <Card>
            <CardContent style={{ padding: 'var(--space-4)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>3. Accounts Receivable</h3>
              <p style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Customer invoices & collection aging.
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/accounts-payable">
          <Card>
            <CardContent style={{ padding: 'var(--space-4)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>4. Accounts Payable</h3>
              <p style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Vendor bills & supplier liability schedules.
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/payments">
          <Card>
            <CardContent style={{ padding: 'var(--space-4)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>5. Payments & Cash</h3>
              <p style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Inflow, outflow, transfers & refunds.
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/bank-accounts">
          <Card>
            <CardContent style={{ padding: 'var(--space-4)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>6. Bank Accounts</h3>
              <p style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Corporate bank accounts & balances.
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/bank-reconciliation">
          <Card>
            <CardContent style={{ padding: 'var(--space-4)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>7. Bank Reconciliation</h3>
              <p style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Statement transaction matching & completion.
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Recent Ledger Entries Table */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Recent Posted General Ledger Journals</CardTitle>
            <CardDescription>System of record journal postings and financial transactions</CardDescription>
          </div>
          <Link href="/journal-entries">
            <Button variant="ghost" size="sm" rightIcon={<IconArrowRight size={14} />}>
              View All
            </Button>
          </Link>
        </CardHeader>
        <CardContent style={{ padding: 0 }}>
          <Table<Record<string, unknown>>
            isLoading={loading}
            data={journals.slice(0, 10)}
            keyExtractor={(j) => String(j.id)}
            emptyText="No journal entries posted in general ledger."
            columns={[
              {
                header: 'Journal #',
                accessor: (j) => (
                  <span className="code-font" style={{ fontWeight: 700, color: 'var(--accent)' }}>
                    {String(j.journalNumber)}
                  </span>
                ),
              },
              {
                header: 'Description',
                accessor: (j) => <span style={{ fontWeight: 500 }}>{String(j.description)}</span>,
              },
              {
                header: 'Posting Date',
                accessor: (j) => (
                  <span className="code-font" style={{ color: 'var(--text-secondary)' }}>
                    {new Date(String(j.date)).toLocaleDateString()}
                  </span>
                ),
              },
              {
                header: 'Status',
                accessor: (j) => <Badge variant="receipt">{String(j.status)}</Badge>,
              },
              {
                header: 'Lines',
                accessor: (j) => {
                  const lines = (j.lines as Record<string, unknown>[]) || [];
                  return <span className="code-font">{lines.length} lines</span>;
                },
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

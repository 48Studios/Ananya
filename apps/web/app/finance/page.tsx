'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../src/lib/api';

export default function FinanceDashboardPage() {
  const [accounts, setAccounts] = useState<Record<string, unknown>[]>([]);
  const [journals, setJournals] = useState<Record<string, unknown>[]>([]);
  const [receivables, setReceivables] = useState<Record<string, unknown>[]>([]);
  const [payables, setPayables] = useState<Record<string, unknown>[]>([]);
  const [payments, setPayments] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
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
      console.error(err);
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
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Financial Core Operations Console</h1>
          <p className="text-sm text-gray-500">General ledger system of record, chart of accounts, AR/AP ledgers, payments, and bank reconciliations.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/chart-of-accounts" className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800">
            + Chart of Accounts
          </Link>
          <Link href="/journal-entries" className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700">
            + New Journal Entry
          </Link>
        </div>
      </div>

      {/* Financial Metrics Cards */}
      <div className="grid grid-cols-5 gap-4">
        <div className="border rounded p-4 bg-white">
          <div className="text-xs uppercase font-semibold text-gray-500">Active Accounts</div>
          <div className="text-2xl font-bold mt-1">{loading ? '...' : accounts.length}</div>
          <div className="text-xs text-green-700 font-semibold mt-1">
            {accounts.filter((a) => a.isActive).length} Active Nodes
          </div>
        </div>
        <div className="border rounded p-4 bg-white">
          <div className="text-xs uppercase font-semibold text-gray-500">Journal Entries</div>
          <div className="text-2xl font-bold mt-1">{loading ? '...' : journals.length}</div>
          <div className="text-xs text-blue-600 font-semibold mt-1">
            {journals.filter((j) => j.status === 'POSTED').length} Posted Entries
          </div>
        </div>
        <div className="border rounded p-4 bg-white">
          <div className="text-xs uppercase font-semibold text-gray-500">Accounts Receivable</div>
          <div className="text-2xl font-bold mt-1 text-green-700">${loading ? '...' : totalReceivables.toFixed(2)}</div>
          <div className="text-xs text-gray-500 mt-1">
            {receivables.filter((r) => r.status !== 'PAID').length} Open Customer Invoices
          </div>
        </div>
        <div className="border rounded p-4 bg-white">
          <div className="text-xs uppercase font-semibold text-gray-500">Accounts Payable</div>
          <div className="text-2xl font-bold mt-1 text-red-700">${loading ? '...' : totalPayables.toFixed(2)}</div>
          <div className="text-xs text-gray-500 mt-1">
            {payables.filter((p) => p.status !== 'PAID').length} Open Vendor Bills
          </div>
        </div>
        <div className="border rounded p-4 bg-white">
          <div className="text-xs uppercase font-semibold text-gray-500">Payments Processed</div>
          <div className="text-2xl font-bold mt-1">{loading ? '...' : payments.length}</div>
          <div className="text-xs text-purple-700 font-semibold mt-1">
            {payments.filter((p) => p.status === 'POSTED' || p.status === 'RECONCILED').length} Settled Transactions
          </div>
        </div>
      </div>

      {/* Navigation Submodules */}
      <div className="grid grid-cols-4 gap-4">
        <Link href="/chart-of-accounts" className="border rounded p-4 bg-gray-50 hover:bg-white hover:shadow-sm transition block">
          <h3 className="font-bold text-sm text-gray-900">1. Chart of Accounts</h3>
          <p className="text-xs text-gray-500 mt-1">Asset, liability, equity, revenue & expense accounts.</p>
        </Link>
        <Link href="/journal-entries" className="border rounded p-4 bg-gray-50 hover:bg-white hover:shadow-sm transition block">
          <h3 className="font-bold text-sm text-gray-900">2. Journal Entries & GL</h3>
          <p className="text-xs text-gray-500 mt-1">Double-entry ledger posting & reversals.</p>
        </Link>
        <Link href="/accounts-receivable" className="border rounded p-4 bg-gray-50 hover:bg-white hover:shadow-sm transition block">
          <h3 className="font-bold text-sm text-gray-900">3. Accounts Receivable</h3>
          <p className="text-xs text-gray-500 mt-1">Customer invoices & collection aging.</p>
        </Link>
        <Link href="/accounts-payable" className="border rounded p-4 bg-gray-50 hover:bg-white hover:shadow-sm transition block">
          <h3 className="font-bold text-sm text-gray-900">4. Accounts Payable</h3>
          <p className="text-xs text-gray-500 mt-1">Vendor bills & supplier liability schedules.</p>
        </Link>
        <Link href="/payments" className="border rounded p-4 bg-gray-50 hover:bg-white hover:shadow-sm transition block">
          <h3 className="font-bold text-sm text-gray-900">5. Payments & Cash</h3>
          <p className="text-xs text-gray-500 mt-1">Inflow, outflow, transfers & refunds.</p>
        </Link>
        <Link href="/bank-accounts" className="border rounded p-4 bg-gray-50 hover:bg-white hover:shadow-sm transition block">
          <h3 className="font-bold text-sm text-gray-900">6. Bank Accounts</h3>
          <p className="text-xs text-gray-500 mt-1">Corporate bank accounts & balances.</p>
        </Link>
        <Link href="/bank-reconciliation" className="border rounded p-4 bg-gray-50 hover:bg-white hover:shadow-sm transition block col-span-2">
          <h3 className="font-bold text-sm text-gray-900">7. Bank Reconciliation</h3>
          <p className="text-xs text-gray-500 mt-1">Statement transaction matching & completion.</p>
        </Link>
      </div>

      {/* Recent Ledger Entries */}
      <div className="border rounded bg-white p-4 space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700">Recent Posted General Ledger Journals</h2>
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-100 uppercase text-gray-600 border-b">
            <tr>
              <th className="p-3">Journal #</th>
              <th className="p-3">Description</th>
              <th className="p-3">Posting Date</th>
              <th className="p-3">Status</th>
              <th className="p-3">Lines</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {journals.map((j) => {
              const lines = (j.lines as Record<string, unknown>[]) || [];
              return (
                <tr key={String(j.id)} className="hover:bg-gray-50">
                  <td className="p-3 font-mono font-bold">{String(j.journalNumber)}</td>
                  <td className="p-3 font-semibold">{String(j.description)}</td>
                  <td className="p-3 text-gray-600">{new Date(String(j.date)).toLocaleDateString()}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800">
                      {String(j.status)}
                    </span>
                  </td>
                  <td className="p-3 font-mono">{lines.length} lines</td>
                </tr>
              );
            })}
            {journals.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-gray-500">No journal entries posted in general ledger.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

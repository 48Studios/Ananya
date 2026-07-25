'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../src/lib/api';

export default function JournalEntriesPage() {
  const [journals, setJournals] = useState<Record<string, unknown>[]>([]);
  const [accounts, setAccounts] = useState<Record<string, unknown>[]>([]);
  const [selectedJournal, setSelectedJournal] = useState<Record<string, unknown> | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');

  // Line form state
  const [accountId, setAccountId] = useState('');
  const [debit, setDebit] = useState('0');
  const [credit, setCredit] = useState('0');
  const [lineDesc, setLineDesc] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [jData, accData] = await Promise.all([
        api.getJournalEntries(),
        api.getAccounts(),
      ]);
      setJournals(jData);
      setAccounts(accData);
    } catch (err: unknown) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createJournalEntry({
        description,
        reference: reference || undefined,
      });
      setIsCreating(false);
      setDescription('');
      setReference('');
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create journal entry');
    }
  };

  const handleAddLine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJournal) return;
    try {
      await api.addJournalLine(String(selectedJournal.id), {
        accountId,
        debit: parseFloat(debit),
        credit: parseFloat(credit),
        description: lineDesc || undefined,
      });
      const updated = await api.getJournalEntry(String(selectedJournal.id));
      setSelectedJournal(updated);
      setDebit('0');
      setCredit('0');
      setLineDesc('');
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to add journal line');
    }
  };

  const handleAction = async (journalId: string, action: 'post' | 'reverse' | 'void') => {
    try {
      if (action === 'post') await api.postJournalEntry(journalId);
      if (action === 'reverse') await api.reverseJournalEntry(journalId);
      if (action === 'void') await api.voidJournalEntry(journalId);

      fetchData();
      if (selectedJournal?.id === journalId) {
        const updated = await api.getJournalEntry(journalId);
        setSelectedJournal(updated);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : `Failed to ${action} journal entry`);
    }
  };

  const lines = (selectedJournal?.lines as Record<string, unknown>[]) || [];
  const totalDebits = lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
  const totalCredits = lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.0001 && lines.length >= 2;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">General Ledger Journal Entries</h1>
          <p className="text-sm text-gray-500">Double-entry bookkeeping, debit/credit balance verification, and ledger posting.</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
        >
          {isCreating ? 'Cancel' : '+ New Journal Entry'}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="p-4 border rounded bg-gray-50 space-y-4 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">Create Draft Journal Entry</h2>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Journal Description / Memo *</label>
            <input
              type="text"
              required
              placeholder="e.g. Month-end payroll accrual"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">External Reference #</label>
            <input
              type="text"
              placeholder="REF-99482"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white"
            />
          </div>
          <button type="submit" className="px-4 py-2 bg-black text-white text-xs font-semibold rounded">
            Generate Journal Draft
          </button>
        </form>
      )}

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-6">
          <div className="border rounded overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-100 uppercase text-gray-600 border-b">
                <tr>
                  <th className="p-3">Journal #</th>
                  <th className="p-3">Description</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {journals.map((j) => (
                  <tr
                    key={String(j.id)}
                    onClick={() => setSelectedJournal(j)}
                    className={`cursor-pointer hover:bg-gray-50 ${selectedJournal?.id === j.id ? 'bg-blue-50' : ''}`}
                  >
                    <td className="p-3 font-mono font-bold text-gray-900">{String(j.journalNumber)}</td>
                    <td className="p-3 font-semibold text-gray-800">{String(j.description)}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        j.status === 'POSTED' ? 'bg-blue-100 text-blue-800' :
                        j.status === 'REVERSED' ? 'bg-purple-100 text-purple-800' :
                        j.status === 'VOID' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {String(j.status)}
                      </span>
                    </td>
                    <td className="p-3 text-gray-600">{new Date(String(j.date)).toLocaleDateString()}</td>
                  </tr>
                ))}
                {journals.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-gray-500">No general ledger journal entries found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col-span-6">
          {selectedJournal ? (
            <div className="border rounded p-4 space-y-4 bg-white">
              <div className="flex justify-between items-start border-b pb-3">
                <div>
                  <h3 className="font-mono font-bold text-lg">{String(selectedJournal.journalNumber)}</h3>
                  <p className="text-xs text-gray-500">{String(selectedJournal.description)}</p>
                </div>
                <div className="flex gap-1">
                  {selectedJournal.status === 'DRAFT' && (
                    <button
                      disabled={!isBalanced}
                      onClick={() => handleAction(String(selectedJournal.id), 'post')}
                      className={`px-3 py-1 text-xs font-bold rounded shadow ${
                        isBalanced ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      Post to Ledger
                    </button>
                  )}
                  {selectedJournal.status === 'POSTED' && (
                    <button
                      onClick={() => handleAction(String(selectedJournal.id), 'reverse')}
                      className="px-3 py-1 bg-purple-600 text-white text-xs font-bold rounded"
                    >
                      Reverse Entry
                    </button>
                  )}
                </div>
              </div>

              {/* Debit/Credit Balance Bar */}
              <div className="p-2 border rounded text-xs flex justify-between bg-gray-50 font-mono">
                <div>
                  <span>Total Debits: <strong className="text-gray-900">${totalDebits.toFixed(2)}</strong></span>
                </div>
                <div>
                  <span>Total Credits: <strong className="text-gray-900">${totalCredits.toFixed(2)}</strong></span>
                </div>
                <div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    isBalanced ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {isBalanced ? 'BALANCED' : 'UNBALANCED'}
                  </span>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase text-gray-600 mb-2">Double-Entry Journal Lines</h4>
                <div className="space-y-1.5">
                  {lines.map((l) => {
                    const acc = accounts.find((a) => a.id === l.accountId);
                    return (
                      <div key={String(l.id)} className="p-2 border rounded text-xs flex justify-between bg-gray-50">
                        <div>
                          <p className="font-bold">{String(acc?.accountNumber)} - {String(acc?.name ?? l.accountId)}</p>
                          <p className="text-gray-500 text-[10px]">{String(l.description || 'Line item')}</p>
                        </div>
                        <div className="text-right font-mono">
                          {Number(l.debit) > 0 && <span className="text-green-700 font-bold mr-3">DR ${Number(l.debit).toFixed(2)}</span>}
                          {Number(l.credit) > 0 && <span className="text-blue-700 font-bold">CR ${Number(l.credit).toFixed(2)}</span>}
                        </div>
                      </div>
                    );
                  })}
                  {lines.length === 0 && (
                    <div className="text-xs text-gray-400 py-2">No debit/credit lines added yet.</div>
                  )}
                </div>
              </div>

              {selectedJournal.status === 'DRAFT' && (
                <form onSubmit={handleAddLine} className="border-t pt-3 space-y-2">
                  <h4 className="text-xs font-bold uppercase text-gray-600">Add Line Item</h4>
                  <select
                    required
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full px-2 py-1 text-xs border rounded bg-white"
                  >
                    <option value="">-- Select Account --</option>
                    {accounts.map((a) => (
                      <option key={String(a.id)} value={String(a.id)}>{String(a.accountNumber)} - {String(a.name)}</option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      placeholder="Debit Amount ($)"
                      value={debit}
                      onChange={(e) => setDebit(e.target.value)}
                      className="px-2 py-1 text-xs border rounded font-mono font-bold"
                    />
                    <input
                      type="number"
                      placeholder="Credit Amount ($)"
                      value={credit}
                      onChange={(e) => setCredit(e.target.value)}
                      className="px-2 py-1 text-xs border rounded font-mono font-bold"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Line Description / Note"
                    value={lineDesc}
                    onChange={(e) => setLineDesc(e.target.value)}
                    className="w-full px-2 py-1 text-xs border rounded"
                  />
                  <button type="submit" className="w-full py-1.5 bg-gray-900 text-white text-xs font-medium rounded">
                    + Add Journal Line
                  </button>
                </form>
              )}
            </div>
          ) : (
            <div className="p-8 border border-dashed rounded text-center text-sm text-gray-400">
              Select a journal entry to add debit/credit lines or post to the general ledger.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

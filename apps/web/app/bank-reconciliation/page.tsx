'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../src/lib/api';

export default function BankReconciliationPage() {
  const [reconciliations, setReconciliations] = useState<Record<string, unknown>[]>([]);
  const [payments, setPayments] = useState<Record<string, unknown>[]>([]);
  const [selectedRecon, setSelectedRecon] = useState<Record<string, unknown> | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [bankAccountId, setBankAccountId] = useState('bank-operating-01');
  const [statementDate, setStatementDate] = useState('');
  const [openingBalance, setOpeningBalance] = useState('1000.00');
  const [closingBalance, setClosingBalance] = useState('1500.00');

  // Statement Line form
  const [txDate, setTxDate] = useState('');
  const [txDesc, setTxDesc] = useState('');
  const [txAmount, setTxAmount] = useState('500.00');

  // Match form
  const [targetTxId, setTargetTxId] = useState('');
  const [targetPaymentId, setTargetPaymentId] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [rData, pData] = await Promise.all([
        api.getBankReconciliations(),
        api.getPayments(),
      ]);
      setReconciliations(rData);
      setPayments(pData);
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
      await api.createBankReconciliation({
        bankAccountId,
        statementDate,
        openingBalance: parseFloat(openingBalance),
        closingBalance: parseFloat(closingBalance),
      });
      setIsCreating(false);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create reconciliation session');
    }
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecon) return;
    try {
      await api.addBankTransaction(String(selectedRecon.id), {
        transactionDate: txDate,
        description: txDesc,
        amount: parseFloat(txAmount),
      });
      setTxDesc('');
      const updated = await api.getBankReconciliation(String(selectedRecon.id));
      setSelectedRecon(updated);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to add statement transaction');
    }
  };

  const handleMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecon || !targetTxId || !targetPaymentId) return;
    try {
      await api.matchBankTransaction(String(selectedRecon.id), {
        transactionId: targetTxId,
        paymentId: targetPaymentId,
      });
      const updated = await api.getBankReconciliation(String(selectedRecon.id));
      setSelectedRecon(updated);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to match statement transaction');
    }
  };

  const handleComplete = async (reconId: string) => {
    try {
      await api.completeBankReconciliation(reconId);
      alert('Bank Reconciliation Session Completed!');
      fetchData();
      if (selectedRecon?.id === reconId) {
        const updated = await api.getBankReconciliation(reconId);
        setSelectedRecon(updated);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to complete reconciliation');
    }
  };

  const transactions = (selectedRecon?.transactions as Record<string, unknown>[]) || [];
  const unmatchedCount = transactions.filter((t) => !t.isMatched).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Bank Statement Reconciliation</h1>
          <p className="text-sm text-gray-500">Statement import, transaction matching, balance adjustments, and reconciliation completion.</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
        >
          {isCreating ? 'Cancel' : '+ New Reconciliation Session'}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="p-4 border rounded bg-gray-50 space-y-4 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">Start Bank Reconciliation Session</h2>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Bank Account *</label>
            <input
              type="text"
              required
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white font-mono font-bold"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Statement Ending Date *</label>
            <input
              type="date"
              required
              value={statementDate}
              onChange={(e) => setStatementDate(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Opening Balance ($) *</label>
              <input
                type="number"
                required
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-mono font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Closing Balance ($) *</label>
              <input
                type="number"
                required
                value={closingBalance}
                onChange={(e) => setClosingBalance(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-mono font-bold"
              />
            </div>
          </div>
          <button type="submit" className="px-4 py-2 bg-black text-white text-xs font-semibold rounded">
            Create Session
          </button>
        </form>
      )}

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-6">
          <div className="border rounded overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-100 uppercase text-gray-600 border-b">
                <tr>
                  <th className="p-3">Session Date</th>
                  <th className="p-3">Bank Account</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Closing Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {reconciliations.map((rec) => (
                  <tr
                    key={String(rec.id)}
                    onClick={() => setSelectedRecon(rec)}
                    className={`cursor-pointer hover:bg-gray-50 ${selectedRecon?.id === rec.id ? 'bg-blue-50' : ''}`}
                  >
                    <td className="p-3 text-gray-600">{new Date(String(rec.statementDate)).toLocaleDateString()}</td>
                    <td className="p-3 font-mono font-bold text-gray-900">{String(rec.bankAccountId)}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        rec.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {String(rec.status)}
                      </span>
                    </td>
                    <td className="p-3 font-mono font-bold text-gray-900">${Number(rec.closingBalance).toFixed(2)}</td>
                  </tr>
                ))}
                {reconciliations.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-gray-500">No bank reconciliation sessions found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col-span-6">
          {selectedRecon ? (
            <div className="border rounded p-4 space-y-4 bg-white">
              <div className="flex justify-between items-start border-b pb-3">
                <div>
                  <h3 className="font-mono font-bold text-lg">Bank Session ({String(selectedRecon.bankAccountId)})</h3>
                  <p className="text-xs text-gray-500">Status: {String(selectedRecon.status)}</p>
                </div>
                <div>
                  {selectedRecon.status === 'IN_PROGRESS' && (
                    <button
                      disabled={unmatchedCount > 0 || transactions.length === 0}
                      onClick={() => handleComplete(String(selectedRecon.id))}
                      className={`px-3 py-1 text-xs font-bold rounded shadow ${
                        unmatchedCount === 0 && transactions.length > 0 ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      Complete Session
                    </button>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase text-gray-600 mb-2">Statement Line Items</h4>
                <div className="space-y-1.5">
                  {transactions.map((t) => (
                    <div key={String(t.id)} className="p-2 border rounded text-xs flex justify-between bg-gray-50">
                      <div>
                        <p className="font-bold">{String(t.description)}</p>
                        <p className="text-gray-500">{new Date(String(t.transactionDate)).toLocaleDateString()} | ${Number(t.amount).toFixed(2)}</p>
                      </div>
                      <div className="text-right">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          t.isMatched ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {t.isMatched ? 'MATCHED' : 'UNMATCHED'}
                        </span>
                      </div>
                    </div>
                  ))}
                  {transactions.length === 0 && (
                    <div className="text-xs text-gray-400 py-2">No bank statement lines added.</div>
                  )}
                </div>
              </div>

              {selectedRecon.status === 'IN_PROGRESS' && (
                <>
                  <form onSubmit={handleAddTransaction} className="border-t pt-3 space-y-2">
                    <h4 className="text-xs font-bold uppercase text-gray-600">Add Statement Line</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        required
                        value={txDate}
                        onChange={(e) => setTxDate(e.target.value)}
                        className="px-2 py-1 text-xs border rounded"
                      />
                      <input
                        type="number"
                        required
                        placeholder="Amount ($)"
                        value={txAmount}
                        onChange={(e) => setTxAmount(e.target.value)}
                        className="px-2 py-1 text-xs border rounded font-mono font-bold"
                      />
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="Transaction Memo / Statement Text *"
                      value={txDesc}
                      onChange={(e) => setTxDesc(e.target.value)}
                      className="w-full px-2 py-1 text-xs border rounded"
                    />
                    <button type="submit" className="w-full py-1.5 bg-gray-900 text-white text-xs font-medium rounded">
                      + Add Statement Line
                    </button>
                  </form>

                  {transactions.filter((t) => !t.isMatched).length > 0 && (
                    <form onSubmit={handleMatch} className="border-t pt-3 space-y-2">
                      <h4 className="text-xs font-bold uppercase text-gray-600">Match Statement Line to Payment</h4>
                      <select
                        required
                        value={targetTxId}
                        onChange={(e) => setTargetTxId(e.target.value)}
                        className="w-full px-2 py-1 text-xs border rounded bg-white"
                      >
                        <option value="">-- Choose Unmatched Statement Line --</option>
                        {transactions.filter((t) => !t.isMatched).map((t) => (
                          <option key={String(t.id)} value={String(t.id)}>{String(t.description)} (${Number(t.amount).toFixed(2)})</option>
                        ))}
                      </select>
                      <select
                        required
                        value={targetPaymentId}
                        onChange={(e) => setTargetPaymentId(e.target.value)}
                        className="w-full px-2 py-1 text-xs border rounded bg-white"
                      >
                        <option value="">-- Choose Internal Posted Payment --</option>
                        {payments.map((p) => (
                          <option key={String(p.id)} value={String(p.id)}>{String(p.paymentNumber)} - ${Number(p.amount).toFixed(2)} ({String(p.paymentType)})</option>
                        ))}
                      </select>
                      <button type="submit" className="w-full py-1.5 bg-blue-600 text-white text-xs font-bold rounded shadow">
                        Match & Verify Pair
                      </button>
                    </form>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="p-8 border border-dashed rounded text-center text-sm text-gray-400">
              Select a bank reconciliation session to import statement lines or match payments.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../src/lib/api';

export default function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState<Record<string, unknown>[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [accountNumber, setAccountNumber] = useState('');
  const [name, setName] = useState('');
  const [accountType, setAccountType] = useState('ASSET');
  const [parentAccountId, setParentAccountId] = useState('');
  const [currency, setCurrency] = useState('USD');

  const fetchData = useCallback(async () => {
    try {
      const data = await api.getAccounts();
      setAccounts(data);
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
      await api.createAccount({
        accountNumber,
        name,
        accountType,
        parentAccountId: parentAccountId || undefined,
        currency,
      });
      setIsCreating(false);
      setAccountNumber('');
      setName('');
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create account');
    }
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      if (isActive) {
        await api.deactivateAccount(id);
      } else {
        await api.activateAccount(id);
      }
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to toggle account status');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Chart of Accounts</h1>
          <p className="text-sm text-gray-500">Master financial account taxonomy, account classification, and active status.</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
        >
          {isCreating ? 'Cancel' : '+ New Financial Account'}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="p-4 border rounded bg-gray-50 space-y-4 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">Create Account Node</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Account Number / Code *</label>
              <input
                type="text"
                required
                placeholder="1010"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-mono font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Account Name *</label>
              <input
                type="text"
                required
                placeholder="Operating Bank Account"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Account Type *</label>
              <select
                value={accountType}
                onChange={(e) => setAccountType(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-semibold"
              >
                <option value="ASSET">ASSET</option>
                <option value="LIABILITY">LIABILITY</option>
                <option value="EQUITY">EQUITY</option>
                <option value="REVENUE">REVENUE</option>
                <option value="EXPENSE">EXPENSE</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Parent Account</label>
              <select
                value={parentAccountId}
                onChange={(e) => setParentAccountId(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white"
              >
                <option value="">-- Top Level --</option>
                {accounts.map((a) => (
                  <option key={String(a.id)} value={String(a.id)}>{String(a.accountNumber)} - {String(a.name)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>
          </div>
          <button type="submit" className="px-4 py-2 bg-black text-white text-xs font-semibold rounded">
            Save Financial Account
          </button>
        </form>
      )}

      <div className="border rounded overflow-hidden bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-100 uppercase text-gray-600 border-b">
            <tr>
              <th className="p-3">Account #</th>
              <th className="p-3">Account Name</th>
              <th className="p-3">Classification</th>
              <th className="p-3">Currency</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {accounts.map((acc) => (
              <tr key={String(acc.id)} className="hover:bg-gray-50">
                <td className="p-3 font-mono font-bold text-gray-900">{String(acc.accountNumber)}</td>
                <td className="p-3 font-semibold text-gray-800">{String(acc.name)}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    acc.accountType === 'ASSET' ? 'bg-green-100 text-green-800' :
                    acc.accountType === 'LIABILITY' ? 'bg-red-100 text-red-800' :
                    acc.accountType === 'REVENUE' ? 'bg-blue-100 text-blue-800' :
                    acc.accountType === 'EXPENSE' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-purple-100 text-purple-800'
                  }`}>
                    {String(acc.accountType)}
                  </span>
                </td>
                <td className="p-3 font-mono">{String(acc.currency)}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                    acc.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {acc.isActive ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </td>
                <td className="p-3 text-right">
                  <button
                    onClick={() => handleToggleActive(String(acc.id), Boolean(acc.isActive))}
                    className={`px-2 py-1 text-[10px] font-bold rounded ${
                      acc.isActive ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200'
                    }`}
                  >
                    {acc.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
            {accounts.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-500">No chart of accounts nodes found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../src/lib/api';

export default function CrmAccountsPage() {
  const [accounts, setAccounts] = useState<Record<string, unknown>[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [website, setWebsite] = useState('');
  const [billingAddress, setBillingAddress] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const data = await api.getCrmAccounts();
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
      await api.createCrmAccount({
        companyName,
        industry: industry || undefined,
        website: website || undefined,
        billingAddress: billingAddress || undefined,
      });
      setIsCreating(false);
      setCompanyName('');
      setIndustry('');
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create CRM account');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">CRM Accounts & Companies</h1>
          <p className="text-sm text-gray-500">Pre-sales target business accounts, contacts directory, and organizational profiles.</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
        >
          {isCreating ? 'Cancel' : '+ New CRM Account'}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="p-4 border rounded bg-gray-50 space-y-4 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">Create CRM Account Record</h2>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Company Name *</label>
            <input
              type="text"
              required
              placeholder="Stark Industries"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white font-bold"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Industry</label>
              <input
                type="text"
                placeholder="Aerospace & Defense"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Website URL</label>
              <input
                type="text"
                placeholder="https://stark.com"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Billing Address</label>
            <textarea
              rows={2}
              placeholder="10880 Wilshire Blvd, Los Angeles, CA"
              value={billingAddress}
              onChange={(e) => setBillingAddress(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white"
            />
          </div>
          <button type="submit" className="px-4 py-2 bg-black text-white text-xs font-semibold rounded">
            Save CRM Account
          </button>
        </form>
      )}

      <div className="border rounded overflow-hidden bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-100 uppercase text-gray-600 border-b">
            <tr>
              <th className="p-3">Company Name</th>
              <th className="p-3">Industry</th>
              <th className="p-3">Website</th>
              <th className="p-3">Contacts</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {accounts.map((acc) => {
              const contacts = (acc.contacts as Record<string, unknown>[]) || [];
              return (
                <tr key={String(acc.id)} className="hover:bg-gray-50">
                  <td className="p-3 font-semibold text-gray-900">
                    <Link href={`/accounts/${String(acc.id)}`} className="text-blue-600 hover:underline">
                      {String(acc.companyName)}
                    </Link>
                  </td>
                  <td className="p-3 text-gray-700">{String(acc.industry || '—')}</td>
                  <td className="p-3 font-mono text-gray-600">{String(acc.website || '—')}</td>
                  <td className="p-3 font-mono font-bold text-gray-900">{contacts.length} Contact(s)</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      acc.isArchived ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-800'
                    }`}>
                      {acc.isArchived ? 'ARCHIVED' : 'ACTIVE'}
                    </span>
                  </td>
                </tr>
              );
            })}
            {accounts.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-gray-500">No CRM accounts found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../src/lib/api';

export default function LeadsPage() {
  const [leads, setLeads] = useState<Record<string, unknown>[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState('WEBSITE');
  const [industry, setIndustry] = useState('');
  const [owner, setOwner] = useState('rep-1');

  const fetchData = useCallback(async () => {
    try {
      const data = await api.getLeads();
      setLeads(data);
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
      await api.createLead({
        name,
        company,
        email: email || undefined,
        phone: phone || undefined,
        source,
        industry: industry || undefined,
        owner,
      });
      setIsCreating(false);
      setName('');
      setCompany('');
      setEmail('');
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create lead');
    }
  };

  const handleQualify = async (id: string) => {
    try {
      await api.qualifyLead(id);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to qualify lead');
    }
  };

  const handleConvert = async (id: string) => {
    try {
      await api.convertLead(id);
      alert('Lead successfully converted into CRM Account and Contact!');
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to convert lead');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Lead Management</h1>
          <p className="text-sm text-gray-500">Inbound prospect leads, owner assignment, qualification, and account conversion.</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
        >
          {isCreating ? 'Cancel' : '+ New Inbound Lead'}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="p-4 border rounded bg-gray-50 space-y-4 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">Create Lead Record</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Contact Name *</label>
              <input
                type="text"
                required
                placeholder="Sarah Connor"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Company / Organization *</label>
              <input
                type="text"
                required
                placeholder="Cyberdyne Systems"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email Address</label>
              <input
                type="email"
                placeholder="sarah@cyberdyne.io"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Phone Number</label>
              <input
                type="text"
                placeholder="+1 555-0199"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Lead Source</label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white"
              >
                <option value="WEBSITE">Website</option>
                <option value="REFERRAL">Referral</option>
                <option value="TRADE_SHOW">Trade Show</option>
                <option value="COLD_OUTREACH">Cold Outreach</option>
                <option value="INBOUND_PHONE">Inbound Phone</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Industry</label>
              <input
                type="text"
                placeholder="Technology"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Assigned Owner</label>
              <input
                type="text"
                required
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-mono font-bold"
              />
            </div>
          </div>
          <button type="submit" className="px-4 py-2 bg-black text-white text-xs font-semibold rounded">
            Save Inbound Lead
          </button>
        </form>
      )}

      <div className="border rounded overflow-hidden bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-100 uppercase text-gray-600 border-b">
            <tr>
              <th className="p-3">Lead #</th>
              <th className="p-3">Name</th>
              <th className="p-3">Company</th>
              <th className="p-3">Source</th>
              <th className="p-3">Owner</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {leads.map((l) => (
              <tr key={String(l.id)} className="hover:bg-gray-50">
                <td className="p-3 font-mono font-bold text-gray-900">{String(l.leadNumber)}</td>
                <td className="p-3 font-semibold text-gray-900">
                  <Link href={`/leads/${String(l.id)}`} className="text-blue-600 hover:underline">
                    {String(l.name)}
                  </Link>
                </td>
                <td className="p-3 font-semibold text-gray-800">{String(l.company)}</td>
                <td className="p-3 font-mono text-gray-600">{String(l.source)}</td>
                <td className="p-3 font-mono">{String(l.owner)}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    l.status === 'CONVERTED' ? 'bg-green-100 text-green-800' :
                    l.status === 'QUALIFIED' ? 'bg-blue-100 text-blue-800' :
                    l.status === 'DISQUALIFIED' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {String(l.status)}
                  </span>
                </td>
                <td className="p-3 text-right space-x-1">
                  {l.status === 'NEW' && (
                    <button
                      onClick={() => handleQualify(String(l.id))}
                      className="px-2 py-1 bg-blue-100 text-blue-700 text-[10px] font-bold rounded hover:bg-blue-200"
                    >
                      Qualify
                    </button>
                  )}
                  {l.status === 'QUALIFIED' && (
                    <button
                      onClick={() => handleConvert(String(l.id))}
                      className="px-2 py-1 bg-green-600 text-white text-[10px] font-bold rounded shadow hover:bg-green-700"
                    >
                      Convert to Account
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {leads.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-500">No leads found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

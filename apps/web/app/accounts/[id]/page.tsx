'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../../src/lib/api';

export default function CrmAccountDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [account, setAccount] = useState<Record<string, unknown> | null>(null);
  const [isAddingContact, setIsAddingContact] = useState(false);

  // Contact form
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('DECISION_MAKER');

  const fetchDetails = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.getCrmAccount(id);
      setAccount(data);
    } catch (err: unknown) {
      console.error(err);
    }
  }, [id]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    try {
      await api.addCrmContact(id, {
        firstName,
        lastName,
        email,
        phone: phone || undefined,
        role,
      });
      setIsAddingContact(false);
      setFirstName('');
      setLastName('');
      setEmail('');
      fetchDetails();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to add contact');
    }
  };

  if (!account) return <div className="p-6 text-sm text-gray-500">Loading account details...</div>;

  const contacts = (account.contacts as Record<string, unknown>[]) || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start border-b pb-4">
        <div>
          <span className="text-xs font-mono uppercase text-gray-400">CRM Target Account</span>
          <h1 className="text-2xl font-bold tracking-tight">{String(account.companyName)}</h1>
          <p className="text-xs text-gray-500 font-mono">{String(account.website || 'No website registered')}</p>
        </div>
        <button
          onClick={() => setIsAddingContact(!isAddingContact)}
          className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
        >
          {isAddingContact ? 'Cancel' : '+ Add Contact Person'}
        </button>
      </div>

      {isAddingContact && (
        <form onSubmit={handleAddContact} className="p-4 border rounded bg-gray-50 space-y-4 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">Add Key Contact Person</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">First Name *</label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Last Name *</label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email Address *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Phone Number</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Organizational Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white font-semibold"
            >
              <option value="DECISION_MAKER">Decision Maker</option>
              <option value="EVALUATOR">Evaluator</option>
              <option value="EXECUTIVE">Executive Sponsor</option>
              <option value="TECHNICAL_BUYER">Technical Buyer</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <button type="submit" className="px-4 py-2 bg-black text-white text-xs font-semibold rounded">
            Save Contact
          </button>
        </form>
      )}

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-4 border rounded p-4 bg-white space-y-3 text-xs">
          <h2 className="font-bold uppercase tracking-wider text-gray-700 border-b pb-2">Account Overview</h2>
          <p><span className="text-gray-500">Industry:</span> <strong className="text-gray-900">{String(account.industry || '—')}</strong></p>
          <p><span className="text-gray-500">Billing Address:</span> <strong className="text-gray-900">{String(account.billingAddress || '—')}</strong></p>
          <p><span className="text-gray-500">Shipping Address:</span> <strong className="text-gray-900">{String(account.shippingAddress || '—')}</strong></p>
        </div>

        <div className="col-span-8 border rounded p-4 bg-white space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700 border-b pb-2">Associated Contact Directory</h2>
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-100 uppercase text-gray-600 border-b">
              <tr>
                <th className="p-2">Name</th>
                <th className="p-2">Email</th>
                <th className="p-2">Phone</th>
                <th className="p-2">Role</th>
                <th className="p-2">Primary</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {contacts.map((c) => (
                <tr key={String(c.id)} className="hover:bg-gray-50">
                  <td className="p-2 font-bold text-gray-900">{String(c.firstName)} {String(c.lastName)}</td>
                  <td className="p-2 font-mono text-gray-700">{String(c.email)}</td>
                  <td className="p-2 font-mono text-gray-600">{String(c.phone || '—')}</td>
                  <td className="p-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-800">
                      {String(c.role)}
                    </span>
                  </td>
                  <td className="p-2">
                    {Boolean(c.isPrimary) && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-800">PRIMARY</span>}
                  </td>
                </tr>
              ))}
              {contacts.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-gray-500">No contacts added to account.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../src/lib/api';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Record<string, unknown>[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Record<string, unknown> | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [taxId, setTaxId] = useState('');
  const [currency, setCurrency] = useState('USD');

  // Contact form
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactRole, setContactRole] = useState('');

  // Address form
  const [addressType, setAddressType] = useState('BILLING');
  const [street1, setStreet1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('US');

  const fetchData = useCallback(async () => {
    try {
      const data = await api.getCustomers();
      setCustomers(data);
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
      await api.createCustomer({
        name,
        email,
        phone: phone || undefined,
        taxId: taxId || undefined,
        currency,
      });
      setIsCreating(false);
      setName('');
      setEmail('');
      setPhone('');
      setTaxId('');
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create customer');
    }
  };

  const handleActivateSuspend = async (id: string, currentStatus: string) => {
    try {
      if (currentStatus === 'ACTIVE') {
        await api.suspendCustomer(id);
      } else {
        await api.activateCustomer(id);
      }
      fetchData();
      if (selectedCustomer?.id === id) {
        const updated = await api.getCustomer(id);
        setSelectedCustomer(updated);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to change customer status');
    }
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    try {
      await api.addCustomerContact(String(selectedCustomer.id), {
        name: contactName,
        email: contactEmail,
        phone: contactPhone || undefined,
        role: contactRole || undefined,
      });
      setContactName('');
      setContactEmail('');
      const updated = await api.getCustomer(String(selectedCustomer.id));
      setSelectedCustomer(updated);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to add contact');
    }
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    try {
      await api.addCustomerAddress(String(selectedCustomer.id), {
        addressType,
        street1,
        city,
        state: state || undefined,
        postalCode,
        country,
      });
      setStreet1('');
      setCity('');
      setPostalCode('');
      const updated = await api.getCustomer(String(selectedCustomer.id));
      setSelectedCustomer(updated);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to add address');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Customer Accounts</h1>
          <p className="text-sm text-gray-500">Commercial buyer entities, contact rosters, billing addresses, and credit risk statuses.</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
        >
          {isCreating ? 'Cancel' : '+ New Customer Account'}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="p-4 border rounded bg-gray-50 space-y-4 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">Create Customer Master</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Company / Customer Name *</label>
              <input
                type="text"
                required
                placeholder="Acme Electronics Ltd"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Primary Email *</label>
              <input
                type="email"
                required
                placeholder="purchasing@acme.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="text"
                placeholder="+1 555-0192"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tax ID / VAT</label>
              <input
                type="text"
                placeholder="TAX-99482"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white"
              />
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
            Save Customer Account
          </button>
        </form>
      )}

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-6">
          <div className="border rounded overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-100 uppercase text-gray-600 border-b">
                <tr>
                  <th className="p-3">Customer #</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {customers.map((c) => (
                  <tr
                    key={String(c.id)}
                    onClick={() => setSelectedCustomer(c)}
                    className={`cursor-pointer hover:bg-gray-50 ${selectedCustomer?.id === c.id ? 'bg-blue-50' : ''}`}
                  >
                    <td className="p-3 font-mono font-bold text-gray-900">{String(c.customerNumber)}</td>
                    <td className="p-3 font-semibold text-gray-800">
                      <Link href={`/customers/${c.id}`} className="hover:underline text-blue-600">
                        {String(c.name)}
                      </Link>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        c.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                        c.status === 'SUSPENDED' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {String(c.status)}
                      </span>
                    </td>
                    <td className="p-3 font-mono font-bold">{String(c.creditStatus)}</td>
                  </tr>
                ))}
                {customers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-gray-500">No customer master accounts found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col-span-6">
          {selectedCustomer ? (
            <div className="border rounded p-4 space-y-4 bg-white">
              <div className="flex justify-between items-start border-b pb-3">
                <div>
                  <h3 className="font-mono font-bold text-lg">{String(selectedCustomer.customerNumber)} - {String(selectedCustomer.name)}</h3>
                  <p className="text-xs text-gray-500">{String(selectedCustomer.email)} | Tax ID: {String(selectedCustomer.taxId || '—')}</p>
                </div>
                <button
                  onClick={() => handleActivateSuspend(String(selectedCustomer.id), String(selectedCustomer.status))}
                  className={`px-3 py-1 text-xs font-bold rounded ${
                    selectedCustomer.status === 'ACTIVE' ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200'
                  }`}
                >
                  {selectedCustomer.status === 'ACTIVE' ? 'Suspend Account' : 'Activate Account'}
                </button>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase text-gray-600 mb-2">Contacts</h4>
                <div className="space-y-1.5">
                  {((selectedCustomer.contacts as Record<string, unknown>[]) ?? []).map((cnt) => (
                    <div key={String(cnt.id)} className="p-2 border rounded text-xs flex justify-between bg-gray-50">
                      <div>
                        <p className="font-bold">{String(cnt.name)} ({String(cnt.role || 'Contact')})</p>
                        <p className="text-gray-500">{String(cnt.email)}</p>
                      </div>
                      {Boolean(cnt.isPrimary) && <span className="text-[10px] font-bold text-blue-600">Primary</span>}
                    </div>
                  ))}
                  {((selectedCustomer.contacts as Record<string, unknown>[]) ?? []).length === 0 && (
                    <div className="text-xs text-gray-400 py-1">No contact persons added.</div>
                  )}
                </div>

                <form onSubmit={handleAddContact} className="mt-2 grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Contact Name *"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="px-2 py-1 text-xs border rounded"
                  />
                  <input
                    type="email"
                    required
                    placeholder="Email *"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="px-2 py-1 text-xs border rounded"
                  />
                  <input
                    type="text"
                    placeholder="Phone"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    className="px-2 py-1 text-xs border rounded"
                  />
                  <input
                    type="text"
                    placeholder="Role / Title"
                    value={contactRole}
                    onChange={(e) => setContactRole(e.target.value)}
                    className="px-2 py-1 text-xs border rounded"
                  />
                  <button type="submit" className="col-span-2 py-1 bg-black text-white text-xs font-semibold rounded">
                    + Add Contact
                  </button>
                </form>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase text-gray-600 mb-2">Addresses</h4>
                <div className="space-y-1.5">
                  {((selectedCustomer.addresses as Record<string, unknown>[]) ?? []).map((addr) => (
                    <div key={String(addr.id)} className="p-2 border rounded text-xs flex justify-between bg-gray-50">
                      <div>
                        <span className="font-bold text-[10px] uppercase bg-gray-200 px-1 rounded mr-2">{String(addr.addressType)}</span>
                        <span>{String(addr.street1)}, {String(addr.city)}, {String(addr.country)}</span>
                      </div>
                    </div>
                  ))}
                  {((selectedCustomer.addresses as Record<string, unknown>[]) ?? []).length === 0 && (
                    <div className="text-xs text-gray-400 py-1">No customer addresses added.</div>
                  )}
                </div>

                <form onSubmit={handleAddAddress} className="mt-2 space-y-1.5">
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={addressType}
                      onChange={(e) => setAddressType(e.target.value)}
                      className="px-2 py-1 text-xs border rounded bg-white"
                    >
                      <option value="BILLING">Billing</option>
                      <option value="SHIPPING">Shipping</option>
                      <option value="BOTH">Both</option>
                    </select>
                    <input
                      type="text"
                      required
                      placeholder="Street Address *"
                      value={street1}
                      onChange={(e) => setStreet1(e.target.value)}
                      className="px-2 py-1 text-xs border rounded col-span-2"
                    />
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <input
                      type="text"
                      required
                      placeholder="City *"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="px-2 py-1 text-xs border rounded"
                    />
                    <input
                      type="text"
                      placeholder="State"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      className="px-2 py-1 text-xs border rounded"
                    />
                    <input
                      type="text"
                      required
                      placeholder="Postal Code *"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      className="px-2 py-1 text-xs border rounded"
                    />
                    <input
                      type="text"
                      required
                      placeholder="Country *"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="px-2 py-1 text-xs border rounded"
                    />
                  </div>
                  <button type="submit" className="w-full py-1 bg-black text-white text-xs font-semibold rounded">
                    + Add Address
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="p-8 border border-dashed rounded text-center text-sm text-gray-400">
              Select a customer account to view details, roster, or address book.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';
import { api } from '../../../src/lib/api';

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const [customer, setCustomer] = useState<Record<string, unknown> | null>(null);
  const [salesOrders, setSalesOrders] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [cData, soData] = await Promise.all([
        api.getCustomer(resolvedParams.id),
        api.getSalesOrders(resolvedParams.id).catch(() => []),
      ]);
      setCustomer(cData);
      setSalesOrders(soData);
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [resolvedParams.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading customer account details...</div>;
  }

  if (!customer) {
    return <div className="p-6 text-sm text-red-600">Customer account not found.</div>;
  }

  const contacts = (customer.contacts as Record<string, unknown>[]) || [];
  const addresses = (customer.addresses as Record<string, unknown>[]) || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/customers" className="text-xs text-gray-500 hover:underline">← Customers</Link>
            <span className="text-xs text-gray-400">/</span>
            <span className="text-xs font-mono font-bold">{String(customer.customerNumber)}</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight mt-1">{String(customer.name)}</h1>
        </div>
        <span className={`px-3 py-1 rounded text-xs font-bold ${
          customer.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {String(customer.status)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="border rounded p-4 bg-white space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700 border-b pb-2">Account Overview</h2>
          <div className="text-xs space-y-2">
            <p><span className="text-gray-500">Email:</span> <span className="font-bold">{String(customer.email)}</span></p>
            <p><span className="text-gray-500">Phone:</span> {String(customer.phone || '—')}</p>
            <p><span className="text-gray-500">Tax ID:</span> {String(customer.taxId || '—')}</p>
            <p><span className="text-gray-500">Currency:</span> <span className="font-mono font-bold">{String(customer.currency)}</span></p>
            <p><span className="text-gray-500">Credit Status:</span> <span className="font-mono font-bold">{String(customer.creditStatus)}</span></p>
          </div>
        </div>

        <div className="border rounded p-4 bg-white space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700 border-b pb-2">Contact Roster ({contacts.length})</h2>
          <div className="text-xs space-y-2">
            {contacts.map((cnt) => (
              <div key={String(cnt.id)} className="p-2 border rounded bg-gray-50">
                <p className="font-bold">{String(cnt.name)}</p>
                <p className="text-gray-500">{String(cnt.email)} | {String(cnt.phone || 'No phone')}</p>
              </div>
            ))}
            {contacts.length === 0 && <p className="text-gray-400">No contacts listed.</p>}
          </div>
        </div>

        <div className="border rounded p-4 bg-white space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700 border-b pb-2">Address Book ({addresses.length})</h2>
          <div className="text-xs space-y-2">
            {addresses.map((addr) => (
              <div key={String(addr.id)} className="p-2 border rounded bg-gray-50">
                <span className="font-bold text-[10px] uppercase bg-gray-200 px-1 rounded mr-2">{String(addr.addressType)}</span>
                <p className="mt-1 font-semibold">{String(addr.street1)}</p>
                <p className="text-gray-500">{String(addr.city)}, {String(addr.country)}</p>
              </div>
            ))}
            {addresses.length === 0 && <p className="text-gray-400">No addresses listed.</p>}
          </div>
        </div>
      </div>

      <div className="border rounded bg-white p-4 space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700">Commercial Order History</h2>
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-100 uppercase text-gray-600 border-b">
            <tr>
              <th className="p-3">Order #</th>
              <th className="p-3">Order Date</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {salesOrders.map((so) => (
              <tr key={String(so.id)} className="hover:bg-gray-50">
                <td className="p-3 font-mono font-bold">{String(so.orderNumber)}</td>
                <td className="p-3 text-gray-600">{new Date(String(so.orderDate)).toLocaleDateString()}</td>
                <td className="p-3">
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800">
                    {String(so.status)}
                  </span>
                </td>
              </tr>
            ))}
            {salesOrders.length === 0 && (
              <tr>
                <td colSpan={3} className="p-4 text-center text-gray-500">No commercial sales orders for this customer.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

'use client';

import React, { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';
import { api } from '../../../src/lib/api';

export default function CustomerReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const [customerReturn, setCustomerReturn] = useState<Record<string, unknown> | null>(null);
  const [customer, setCustomer] = useState<Record<string, unknown> | null>(null);
  const [salesOrder, setSalesOrder] = useState<Record<string, unknown> | null>(null);
  const [components, setComponents] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [rData, compData] = await Promise.all([
        api.getCustomerReturn(resolvedParams.id),
        api.getComponents(),
      ]);
      setCustomerReturn(rData);
      setComponents(compData as unknown as Record<string, unknown>[]);
      if (rData.customerId) {
        const cData = await api.getCustomer(String(rData.customerId));
        setCustomer(cData);
      }
      if (rData.salesOrderId) {
        const soData = await api.getSalesOrder(String(rData.salesOrderId));
        setSalesOrder(soData);
      }
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
    return <div className="p-6 text-sm text-gray-500">Loading customer return RMA details...</div>;
  }

  if (!customerReturn) {
    return <div className="p-6 text-sm text-red-600">Customer return document not found.</div>;
  }

  const lines = (customerReturn.lines as Record<string, unknown>[]) || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/customer-returns" className="text-xs text-gray-500 hover:underline">← Customer Returns</Link>
            <span className="text-xs text-gray-400">/</span>
            <span className="text-xs font-mono font-bold">{String(customerReturn.returnNumber)}</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight mt-1">Customer Return (RMA) Authorization</h1>
        </div>
        <span className="px-3 py-1 rounded text-xs font-bold bg-purple-100 text-purple-800">
          {String(customerReturn.status)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="border rounded p-4 bg-white space-y-2">
          <h2 className="text-xs font-bold uppercase text-gray-500">Customer Account</h2>
          <p className="font-bold text-sm">{String(customer?.name ?? customerReturn.customerId)}</p>
          <p className="text-xs text-gray-500">{String(customer?.email ?? '—')}</p>
        </div>

        <div className="border rounded p-4 bg-white space-y-2">
          <h2 className="text-xs font-bold uppercase text-gray-500">Original Sales Order</h2>
          <p className="font-mono font-bold text-sm">{String(salesOrder?.orderNumber ?? customerReturn.salesOrderId)}</p>
          <p className="text-xs text-gray-500">Order Status: {String(salesOrder?.status || '—')}</p>
        </div>

        <div className="border rounded p-4 bg-white space-y-2">
          <h2 className="text-xs font-bold uppercase text-gray-500">Return Authorization Notes</h2>
          <p className="text-xs text-gray-700 font-semibold">{String(customerReturn.notes || 'No notes provided.')}</p>
        </div>
      </div>

      <div className="border rounded bg-white p-4 space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700">RMA Line Items</h2>
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-100 uppercase text-gray-600 border-b">
            <tr>
              <th className="p-3">Component</th>
              <th className="p-3">Quantity</th>
              <th className="p-3">Return Reason</th>
              <th className="p-3 text-right">Inspection Disposition</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lines.map((l) => {
              const comp = components.find((c) => c.id === l.componentId);
              return (
                <tr key={String(l.id)} className="hover:bg-gray-50">
                  <td className="p-3 font-bold">{String(comp?.sku ?? l.componentId)}</td>
                  <td className="p-3 font-mono">{String(l.quantity)}</td>
                  <td className="p-3 font-semibold">{String(l.reason)}</td>
                  <td className="p-3 font-mono font-bold text-right text-purple-700">{String(l.disposition || 'PENDING')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

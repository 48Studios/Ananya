'use client';

import React, { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';
import { api } from '../../../src/lib/api';

export default function SalesOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const [salesOrder, setSalesOrder] = useState<Record<string, unknown> | null>(null);
  const [customer, setCustomer] = useState<Record<string, unknown> | null>(null);
  const [components, setComponents] = useState<Record<string, unknown>[]>([]);
  const [fulfillmentRequests, setFulfillmentRequests] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [soData, compData, fulData] = await Promise.all([
        api.getSalesOrder(resolvedParams.id),
        api.getComponents(),
        api.getFulfillmentRequests(resolvedParams.id).catch(() => []),
      ]);
      setSalesOrder(soData);
      setComponents(compData as unknown as Record<string, unknown>[]);
      setFulfillmentRequests(fulData);
      if (soData.customerId) {
        const cData = await api.getCustomer(String(soData.customerId));
        setCustomer(cData);
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
    return <div className="p-6 text-sm text-gray-500">Loading commercial sales order details...</div>;
  }

  if (!salesOrder) {
    return <div className="p-6 text-sm text-red-600">Sales order not found.</div>;
  }

  const lines = (salesOrder.lines as Record<string, unknown>[]) || [];
  const total = lines.reduce((sum, l) => sum + (Number(l.totalPrice) || 0), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/sales-orders" className="text-xs text-gray-500 hover:underline">← Sales Orders</Link>
            <span className="text-xs text-gray-400">/</span>
            <span className="text-xs font-mono font-bold">{String(salesOrder.orderNumber)}</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight mt-1">Commercial Sales Order</h1>
        </div>
        <span className="px-3 py-1 rounded text-xs font-bold bg-blue-100 text-blue-800">
          {String(salesOrder.status)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="border rounded p-4 bg-white space-y-2">
          <h2 className="text-xs font-bold uppercase text-gray-500">Customer Account</h2>
          <p className="font-bold text-sm">{String(customer?.name ?? salesOrder.customerId)}</p>
          <p className="text-xs text-gray-500">{String(customer?.email ?? '—')}</p>
        </div>

        <div className="border rounded p-4 bg-white space-y-2">
          <h2 className="text-xs font-bold uppercase text-gray-500">Dates & Reference</h2>
          <p className="text-xs text-gray-500">Order Date: <span className="font-mono font-bold text-gray-900">{new Date(String(salesOrder.orderDate)).toLocaleDateString()}</span></p>
          {Boolean(salesOrder.requiredDate) && (
            <p className="text-xs text-gray-500">Required: <span className="font-mono font-bold text-gray-900">{new Date(String(salesOrder.requiredDate)).toLocaleDateString()}</span></p>
          )}
        </div>

        <div className="border rounded p-4 bg-white space-y-2 text-right">
          <h2 className="text-xs font-bold uppercase text-gray-500">Total Order Value</h2>
          <p className="font-mono font-bold text-2xl text-blue-700">${total.toFixed(2)}</p>
        </div>
      </div>

      <div className="border rounded bg-white p-4 space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700">Contract Line Items</h2>
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-100 uppercase text-gray-600 border-b">
            <tr>
              <th className="p-3">Component</th>
              <th className="p-3">Quantity</th>
              <th className="p-3">Unit Price</th>
              <th className="p-3">Discount</th>
              <th className="p-3">Fulfilled Qty</th>
              <th className="p-3 text-right">Total Price</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lines.map((l) => {
              const comp = components.find((c) => c.id === l.componentId);
              return (
                <tr key={String(l.id)} className="hover:bg-gray-50">
                  <td className="p-3 font-bold">{String(comp?.sku ?? l.componentId)}</td>
                  <td className="p-3 font-mono">{String(l.quantity)}</td>
                  <td className="p-3 font-mono">${String(l.unitPrice)}</td>
                  <td className="p-3 font-mono">{String(l.discount)}%</td>
                  <td className="p-3 font-mono font-bold text-blue-600">{String(l.fulfilledQuantity || 0)} / {String(l.quantity)}</td>
                  <td className="p-3 font-mono font-bold text-right">${String(l.totalPrice)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="border rounded bg-white p-4 space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700">Associated Warehouse Fulfillment Requests ({fulfillmentRequests.length})</h2>
        <div className="space-y-2">
          {fulfillmentRequests.map((ful) => (
            <div key={String(ful.id)} className="p-3 border rounded text-xs flex justify-between bg-gray-50">
              <div>
                <p className="font-mono font-bold text-gray-900">{String(ful.requestNumber)}</p>
                <p className="text-gray-500">Carrier: {String(ful.carrierName || '—')} | Tracking #: {String(ful.trackingNumber || '—')}</p>
              </div>
              <div className="text-right">
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-800">
                  {String(ful.status)}
                </span>
              </div>
            </div>
          ))}
          {fulfillmentRequests.length === 0 && (
            <div className="text-xs text-gray-400 py-2">No fulfillment requests created for this order yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

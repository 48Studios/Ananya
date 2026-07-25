'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../src/lib/api';

export default function SalesDashboardPage() {
  const [customers, setCustomers] = useState<Record<string, unknown>[]>([]);
  const [quotations, setQuotations] = useState<Record<string, unknown>[]>([]);
  const [salesOrders, setSalesOrders] = useState<Record<string, unknown>[]>([]);
  const [fulfillmentRequests, setFulfillmentRequests] = useState<Record<string, unknown>[]>([]);
  const [returns, setReturns] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cData, qData, soData, fData, rData] = await Promise.all([
        api.getCustomers().catch(() => []),
        api.getQuotations().catch(() => []),
        api.getSalesOrders().catch(() => []),
        api.getFulfillmentRequests().catch(() => []),
        api.getCustomerReturns().catch(() => []),
      ]);
      setCustomers(cData);
      setQuotations(qData);
      setSalesOrders(soData);
      setFulfillmentRequests(fData);
      setReturns(rData);
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Sales Operations Console</h1>
          <p className="text-sm text-gray-500">Commercial customer relationships, quotations, sales orders, and warehouse fulfillment tracking.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/customers" className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800">
            + New Customer
          </Link>
          <Link href="/sales-orders" className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700">
            + Sales Order
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-5 gap-4">
        <div className="border rounded p-4 bg-white">
          <div className="text-xs uppercase font-semibold text-gray-500">Customers</div>
          <div className="text-2xl font-bold mt-1">{loading ? '...' : customers.length}</div>
          <div className="text-xs text-green-700 font-semibold mt-1">
            {customers.filter((c) => c.status === 'ACTIVE').length} Active Accounts
          </div>
        </div>
        <div className="border rounded p-4 bg-white">
          <div className="text-xs uppercase font-semibold text-gray-500">Quotations</div>
          <div className="text-2xl font-bold mt-1">{loading ? '...' : quotations.length}</div>
          <div className="text-xs text-blue-600 font-semibold mt-1">
            {quotations.filter((q) => q.status === 'SENT').length} Sent Quotes
          </div>
        </div>
        <div className="border rounded p-4 bg-white">
          <div className="text-xs uppercase font-semibold text-gray-500">Sales Orders</div>
          <div className="text-2xl font-bold mt-1">{loading ? '...' : salesOrders.length}</div>
          <div className="text-xs text-yellow-700 font-semibold mt-1">
            {salesOrders.filter((s) => s.status === 'RELEASED' || s.status === 'APPROVED').length} Pending Fulfillment
          </div>
        </div>
        <div className="border rounded p-4 bg-white">
          <div className="text-xs uppercase font-semibold text-gray-500">Fulfillment Requests</div>
          <div className="text-2xl font-bold mt-1">{loading ? '...' : fulfillmentRequests.length}</div>
          <div className="text-xs text-gray-400 mt-1">
            {fulfillmentRequests.filter((f) => f.status === 'SHIPPED').length} Shipped Packages
          </div>
        </div>
        <div className="border rounded p-4 bg-white">
          <div className="text-xs uppercase font-semibold text-gray-500">Customer Returns</div>
          <div className="text-2xl font-bold mt-1">{loading ? '...' : returns.length}</div>
          <div className="text-xs text-red-600 font-semibold mt-1">
            {returns.filter((r) => r.status === 'APPROVED' || r.status === 'RECEIVED').length} Open RMAs
          </div>
        </div>
      </div>

      {/* Navigation Cards */}
      <div className="grid grid-cols-5 gap-4">
        <Link href="/customers" className="border rounded p-4 bg-gray-50 hover:bg-white hover:shadow-sm transition block">
          <h3 className="font-bold text-sm text-gray-900">1. Customers</h3>
          <p className="text-xs text-gray-500 mt-1">Account master & contact rosters.</p>
        </Link>
        <Link href="/quotations" className="border rounded p-4 bg-gray-50 hover:bg-white hover:shadow-sm transition block">
          <h3 className="font-bold text-sm text-gray-900">2. Quotations</h3>
          <p className="text-xs text-gray-500 mt-1">Price proposals & conversions.</p>
        </Link>
        <Link href="/sales-orders" className="border rounded p-4 bg-gray-50 hover:bg-white hover:shadow-sm transition block">
          <h3 className="font-bold text-sm text-gray-900">3. Sales Orders</h3>
          <p className="text-xs text-gray-500 mt-1">Order approval & warehouse release.</p>
        </Link>
        <Link href="/fulfillment" className="border rounded p-4 bg-gray-50 hover:bg-white hover:shadow-sm transition block">
          <h3 className="font-bold text-sm text-gray-900">4. Fulfillment</h3>
          <p className="text-xs text-gray-500 mt-1">Pick, pack, & dispatch tracking.</p>
        </Link>
        <Link href="/customer-returns" className="border rounded p-4 bg-gray-50 hover:bg-white hover:shadow-sm transition block">
          <h3 className="font-bold text-sm text-gray-900">5. Returns (RMA)</h3>
          <p className="text-xs text-gray-500 mt-1">Inspection & restocking management.</p>
        </Link>
      </div>

      {/* Recent Orders Overview */}
      <div className="border rounded bg-white p-4 space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700">Recent Sales Orders</h2>
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-100 uppercase text-gray-600 border-b">
            <tr>
              <th className="p-3">Order #</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Order Date</th>
              <th className="p-3">Status</th>
              <th className="p-3">Lines</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {salesOrders.map((so) => {
              const cust = customers.find((c) => c.id === so.customerId);
              const lines = (so.lines as Record<string, unknown>[]) || [];
              return (
                <tr key={String(so.id)} className="hover:bg-gray-50">
                  <td className="p-3 font-mono font-bold">{String(so.orderNumber)}</td>
                  <td className="p-3 font-semibold">{String(cust?.name ?? so.customerId)}</td>
                  <td className="p-3 text-gray-600">{new Date(String(so.orderDate)).toLocaleDateString()}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800">
                      {String(so.status)}
                    </span>
                  </td>
                  <td className="p-3 font-mono">{lines.length} items</td>
                </tr>
              );
            })}
            {salesOrders.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-gray-500">No commercial sales orders generated yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

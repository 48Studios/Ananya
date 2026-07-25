'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../src/lib/api';

export default function ManufacturingDashboardPage() {
  const [boms, setBoms] = useState<Record<string, unknown>[]>([]);
  const [orders, setOrders] = useState<Record<string, unknown>[]>([]);
  const [consumptions, setConsumptions] = useState<Record<string, unknown>[]>([]);
  const [fgrs, setFgrs] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [bomData, orderData, mcData, fgrData] = await Promise.all([
        api.getBoms().catch(() => []),
        api.getProductionOrders().catch(() => []),
        api.getMaterialConsumptions().catch(() => []),
        api.getFinishedGoodsReceipts().catch(() => []),
      ]);
      setBoms(bomData);
      setOrders(orderData);
      setConsumptions(mcData);
      setFgrs(fgrData);
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeOrders = orders.filter((o) => o.status === 'IN_PROGRESS' || o.status === 'RELEASED' || o.status === 'MATERIAL_ALLOCATED');
  const releasedBoms = boms.filter((b) => b.status === 'RELEASED');

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Manufacturing Operations</h1>
          <p className="text-sm text-gray-500">Bill of Materials, Production Runs, Material Consumption & Traceability</p>
        </div>
        <div className="flex gap-2">
          <Link href="/boms" className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800">
            + New BOM
          </Link>
          <Link href="/production-orders" className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700">
            + Create Production Order
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-4 gap-4">
        <div className="border rounded p-4 bg-white">
          <div className="text-xs uppercase font-semibold text-gray-500">Total BOMs</div>
          <div className="text-2xl font-bold mt-1">{loading ? '...' : boms.length}</div>
          <div className="text-xs text-gray-400 mt-1">{releasedBoms.length} Released</div>
        </div>
        <div className="border rounded p-4 bg-white">
          <div className="text-xs uppercase font-semibold text-gray-500">Production Orders</div>
          <div className="text-2xl font-bold mt-1">{loading ? '...' : orders.length}</div>
          <div className="text-xs text-blue-600 font-semibold mt-1">{activeOrders.length} Active Runs</div>
        </div>
        <div className="border rounded p-4 bg-white">
          <div className="text-xs uppercase font-semibold text-gray-500">Material Consumptions</div>
          <div className="text-2xl font-bold mt-1">{loading ? '...' : consumptions.length}</div>
          <div className="text-xs text-gray-400 mt-1">{consumptions.filter((c) => c.status === 'POSTED').length} Posted</div>
        </div>
        <div className="border rounded p-4 bg-white">
          <div className="text-xs uppercase font-semibold text-gray-500">Finished Goods Receipts</div>
          <div className="text-2xl font-bold mt-1">{loading ? '...' : fgrs.length}</div>
          <div className="text-xs text-gray-400 mt-1">{fgrs.filter((f) => f.status === 'POSTED').length} Posted</div>
        </div>
      </div>

      {/* Modules Quick Navigation */}
      <div className="grid grid-cols-5 gap-4">
        <Link href="/boms" className="border rounded p-4 bg-gray-50 hover:bg-white hover:shadow-sm transition block">
          <h3 className="font-bold text-sm text-gray-900">1. Bill of Materials</h3>
          <p className="text-xs text-gray-500 mt-1">Manage component assembly structures and revisions.</p>
        </Link>
        <Link href="/production-orders" className="border rounded p-4 bg-gray-50 hover:bg-white hover:shadow-sm transition block">
          <h3 className="font-bold text-sm text-gray-900">2. Production Orders</h3>
          <p className="text-xs text-gray-500 mt-1">Schedule and execute manufacturing jobs.</p>
        </Link>
        <Link href="/material-consumption" className="border rounded p-4 bg-gray-50 hover:bg-white hover:shadow-sm transition block">
          <h3 className="font-bold text-sm text-gray-900">3. Material Consumption</h3>
          <p className="text-xs text-gray-500 mt-1">Record raw material withdrawal from inventory.</p>
        </Link>
        <Link href="/finished-goods" className="border rounded p-4 bg-gray-50 hover:bg-white hover:shadow-sm transition block">
          <h3 className="font-bold text-sm text-gray-900">4. Finished Goods</h3>
          <p className="text-xs text-gray-500 mt-1">Receive finished assemblies into stock.</p>
        </Link>
        <Link href="/traceability" className="border rounded p-4 bg-gray-50 hover:bg-white hover:shadow-sm transition block">
          <h3 className="font-bold text-sm text-gray-900">5. Traceability</h3>
          <p className="text-xs text-gray-500 mt-1">Forward & backward batch genealogy lookups.</p>
        </Link>
      </div>

      {/* Active Production Orders Summary Table */}
      <div className="border rounded bg-white p-4 space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700">Active Production Runs</h2>
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-100 uppercase text-gray-600 border-b">
            <tr>
              <th className="p-3">Order #</th>
              <th className="p-3">Status</th>
              <th className="p-3">Planned Qty</th>
              <th className="p-3">Completed</th>
              <th className="p-3">Scrapped</th>
              <th className="p-3">Created At</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {orders.slice(0, 10).map((o) => (
              <tr key={String(o.id)} className="hover:bg-gray-50">
                <td className="p-3 font-mono font-bold">{String(o.productionNumber)}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                    o.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' :
                    o.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {String(o.status)}
                  </span>
                </td>
                <td className="p-3 font-mono">{String(o.quantityPlanned)} pcs</td>
                <td className="p-3 font-mono text-green-700 font-semibold">{String(o.quantityCompleted)} pcs</td>
                <td className="p-3 font-mono text-red-600">{String(o.quantityScrapped)} pcs</td>
                <td className="p-3 text-gray-500">{new Date(String(o.createdAt)).toLocaleString()}</td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-500">No production orders created yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../src/lib/api';

export default function WarehouseDashboardPage() {
  const [warehouses, setWarehouses] = useState<Record<string, unknown>[]>([]);
  const [stockCounts, setStockCounts] = useState<Record<string, unknown>[]>([]);
  const [cycleCounts, setCycleCounts] = useState<Record<string, unknown>[]>([]);
  const [transfers, setTransfers] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [whData, scData, ccData, wtData] = await Promise.all([
        api.getWarehouses().catch(() => []),
        api.getStockCounts().catch(() => []),
        api.getCycleCounts().catch(() => []),
        api.getWarehouseTransfers().catch(() => []),
      ]);
      setWarehouses(whData);
      setStockCounts(scData);
      setCycleCounts(ccData);
      setTransfers(wtData);
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
          <h1 className="text-xl font-bold tracking-tight">Warehouse Operations Console</h1>
          <p className="text-sm text-gray-500">Physical storage hierarchy, bin utilization, stock audits, and internal transfers</p>
        </div>
        <div className="flex gap-2">
          <Link href="/warehouses" className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800">
            + New Warehouse
          </Link>
          <Link href="/warehouse-transfers" className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700">
            + Bin Transfer
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-4 gap-4">
        <div className="border rounded p-4 bg-white">
          <div className="text-xs uppercase font-semibold text-gray-500">Warehouses</div>
          <div className="text-2xl font-bold mt-1">{loading ? '...' : warehouses.length}</div>
          <div className="text-xs text-gray-400 mt-1">Physical Facilities</div>
        </div>
        <div className="border rounded p-4 bg-white">
          <div className="text-xs uppercase font-semibold text-gray-500">Stock Counts</div>
          <div className="text-2xl font-bold mt-1">{loading ? '...' : stockCounts.length}</div>
          <div className="text-xs text-blue-600 font-semibold mt-1">
            {stockCounts.filter((s) => s.status === 'SUBMITTED' || s.status === 'APPROVED').length} Pending Approval
          </div>
        </div>
        <div className="border rounded p-4 bg-white">
          <div className="text-xs uppercase font-semibold text-gray-500">Cycle Count Schedules</div>
          <div className="text-2xl font-bold mt-1">{loading ? '...' : cycleCounts.length}</div>
          <div className="text-xs text-green-700 font-semibold mt-1">
            {cycleCounts.filter((c) => c.status === 'ACTIVE').length} Active Rules
          </div>
        </div>
        <div className="border rounded p-4 bg-white">
          <div className="text-xs uppercase font-semibold text-gray-500">Bin-to-Bin Transfers</div>
          <div className="text-2xl font-bold mt-1">{loading ? '...' : transfers.length}</div>
          <div className="text-xs text-gray-400 mt-1">
            {transfers.filter((t) => t.status === 'COMPLETED').length} Completed
          </div>
        </div>
      </div>

      {/* Module Navigation */}
      <div className="grid grid-cols-6 gap-4">
        <Link href="/warehouses" className="border rounded p-4 bg-gray-50 hover:bg-white hover:shadow-sm transition block">
          <h3 className="font-bold text-sm text-gray-900">1. Warehouses</h3>
          <p className="text-xs text-gray-500 mt-1">Setup physical facility hierarchy.</p>
        </Link>
        <Link href="/warehouse-bins" className="border rounded p-4 bg-gray-50 hover:bg-white hover:shadow-sm transition block">
          <h3 className="font-bold text-sm text-gray-900">2. Storage Bins</h3>
          <p className="text-xs text-gray-500 mt-1">Manage bin capacity & purposes.</p>
        </Link>
        <Link href="/stock-counts" className="border rounded p-4 bg-gray-50 hover:bg-white hover:shadow-sm transition block">
          <h3 className="font-bold text-sm text-gray-900">3. Stock Counts</h3>
          <p className="text-xs text-gray-500 mt-1">Physical audits & ledger adjustment.</p>
        </Link>
        <Link href="/cycle-counts" className="border rounded p-4 bg-gray-50 hover:bg-white hover:shadow-sm transition block">
          <h3 className="font-bold text-sm text-gray-900">4. Cycle Counting</h3>
          <p className="text-xs text-gray-500 mt-1">Recurring audit schedules.</p>
        </Link>
        <Link href="/warehouse-transfers" className="border rounded p-4 bg-gray-50 hover:bg-white hover:shadow-sm transition block">
          <h3 className="font-bold text-sm text-gray-900">5. Transfers</h3>
          <p className="text-xs text-gray-500 mt-1">Bin-to-bin stock relocation.</p>
        </Link>
        <Link href="/warehouse-policies" className="border rounded p-4 bg-gray-50 hover:bg-white hover:shadow-sm transition block">
          <h3 className="font-bold text-sm text-gray-900">6. Policies</h3>
          <p className="text-xs text-gray-500 mt-1">Bin capacity & putaway rules.</p>
        </Link>
      </div>

      {/* Facilities Overview */}
      <div className="border rounded bg-white p-4 space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700">Physical Warehouses</h2>
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-100 uppercase text-gray-600 border-b">
            <tr>
              <th className="p-3">Code</th>
              <th className="p-3">Facility Name</th>
              <th className="p-3">Status</th>
              <th className="p-3">Total Bins</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {warehouses.map((w) => {
              const bins = (w.bins as Record<string, unknown>[]) || [];
              return (
                <tr key={String(w.id)} className="hover:bg-gray-50">
                  <td className="p-3 font-mono font-bold">{String(w.code)}</td>
                  <td className="p-3 font-semibold">{String(w.name)}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-800">
                      {String(w.status)}
                    </span>
                  </td>
                  <td className="p-3 font-mono font-bold">{bins.length} bins</td>
                </tr>
              );
            })}
            {warehouses.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-gray-500">No warehouse facilities configured yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

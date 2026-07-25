'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../src/lib/api';

export default function MrpDashboardPage() {
  const [runs, setRuns] = useState<Record<string, unknown>[]>([]);
  const [shortages, setShortages] = useState<Record<string, unknown>[]>([]);
  const [purchases, setPurchases] = useState<Record<string, unknown>[]>([]);
  const [productions, setProductions] = useState<Record<string, unknown>[]>([]);
  const [capacityPlans, setCapacityPlans] = useState<Record<string, unknown>[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [rData, sData, purData, prodData, capData] = await Promise.all([
        api.getPlanningRuns(),
        api.getMaterialRequirements(undefined, undefined, undefined, true),
        api.getPurchaseRecommendations(undefined, undefined, undefined, 'PENDING'),
        api.getProductionRecommendations(undefined, undefined, 'PENDING'),
        api.getCapacityPlans(undefined, undefined, true),
      ]);
      setRuns(rData);
      setShortages(sData);
      setPurchases(purData);
      setProductions(prodData);
      setCapacityPlans(capData);
    } catch (err: unknown) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const latestRun = runs[0];

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Material Requirements Planning (MRP) Console</h1>
          <p className="text-sm text-gray-500">Central supply/demand engine, net shortage calculations, purchase & production recommendation dispatch.</p>
        </div>
        <Link
          href="/mrp/runs"
          className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
        >
          + Execute Planning Run
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 border rounded bg-white space-y-1">
          <span className="text-xs uppercase text-gray-500 font-medium">Total Planning Runs</span>
          <div className="text-2xl font-bold font-mono text-gray-900">{runs.length}</div>
          <p className="text-[11px] text-gray-400 font-mono">Latest: {latestRun ? String(latestRun.runNumber) : 'None'}</p>
        </div>
        <div className="p-4 border rounded bg-white space-y-1">
          <span className="text-xs uppercase text-gray-500 font-medium">Net Material Shortages</span>
          <div className="text-2xl font-bold font-mono text-red-600">{shortages.length}</div>
          <p className="text-[11px] text-gray-400 font-mono">Requires procurement / production</p>
        </div>
        <div className="p-4 border rounded bg-white space-y-1">
          <span className="text-xs uppercase text-gray-500 font-medium">Pending Purchase Recs</span>
          <div className="text-2xl font-bold font-mono text-blue-600">{purchases.length}</div>
          <p className="text-[11px] text-gray-400 font-mono">Awaiting planner approval</p>
        </div>
        <div className="p-4 border rounded bg-white space-y-1">
          <span className="text-xs uppercase text-gray-500 font-medium">Overloaded Work Centers</span>
          <div className="text-2xl font-bold font-mono text-yellow-600">{capacityPlans.length}</div>
          <p className="text-[11px] text-gray-400 font-mono">Utilization &gt; 100%</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="border rounded p-4 bg-white space-y-3">
          <div className="flex justify-between items-center border-b pb-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700">Recent Material Shortages</h2>
            <Link href="/mrp/materials" className="text-xs font-semibold text-blue-600 hover:underline">View All</Link>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-600 uppercase border-b">
              <tr>
                <th className="p-2">Component ID</th>
                <th className="p-2">Required</th>
                <th className="p-2">Available</th>
                <th className="p-2">Shortage</th>
                <th className="p-2">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {shortages.slice(0, 5).map((s) => (
                <tr key={String(s.id)}>
                  <td className="p-2 font-mono font-bold text-gray-900">{String(s.componentId).slice(0, 8)}...</td>
                  <td className="p-2 font-mono">{Number(s.requiredQuantity).toFixed(2)}</td>
                  <td className="p-2 font-mono text-gray-600">{Number(s.availableQuantity).toFixed(2)}</td>
                  <td className="p-2 font-mono font-bold text-red-600">{Number(s.shortageQuantity).toFixed(2)}</td>
                  <td className="p-2 font-mono text-gray-700">{String(s.source)}</td>
                </tr>
              ))}
              {shortages.length === 0 && (
                <tr><td colSpan={5} className="p-3 text-center text-gray-500">No material shortages reported.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border rounded p-4 bg-white space-y-3">
          <div className="flex justify-between items-center border-b pb-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700">Pending Purchase & Production Recs</h2>
            <Link href="/mrp/purchases" className="text-xs font-semibold text-blue-600 hover:underline">View Purchase Recs</Link>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-600 uppercase border-b">
              <tr>
                <th className="p-2">Type</th>
                <th className="p-2">Item ID</th>
                <th className="p-2">Suggested Qty</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {purchases.slice(0, 3).map((p) => (
                <tr key={String(p.id)}>
                  <td className="p-2 font-mono font-bold text-blue-700">PURCHASE</td>
                  <td className="p-2 font-mono">{String(p.componentId).slice(0, 8)}...</td>
                  <td className="p-2 font-mono font-bold">{Number(p.suggestedQuantity).toFixed(2)}</td>
                  <td className="p-2"><span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-[10px] font-bold rounded">PENDING</span></td>
                </tr>
              ))}
              {productions.slice(0, 3).map((p) => (
                <tr key={String(p.id)}>
                  <td className="p-2 font-mono font-bold text-purple-700">PRODUCTION</td>
                  <td className="p-2 font-mono">{String(p.productId).slice(0, 8)}...</td>
                  <td className="p-2 font-mono font-bold">{Number(p.suggestedQuantity).toFixed(2)}</td>
                  <td className="p-2"><span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-[10px] font-bold rounded">PENDING</span></td>
                </tr>
              ))}
              {purchases.length === 0 && productions.length === 0 && (
                <tr><td colSpan={4} className="p-3 text-center text-gray-500">No pending recommendations.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

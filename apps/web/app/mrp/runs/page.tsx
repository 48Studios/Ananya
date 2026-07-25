'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../../src/lib/api';

export default function PlanningRunsPage() {
  const [runs, setRuns] = useState<Record<string, unknown>[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);

  // Form state
  const [horizonDays, setHorizonDays] = useState('30');
  const [startedBy, setStartedBy] = useState('planner-admin');

  const fetchRuns = useCallback(async () => {
    try {
      const data = await api.getPlanningRuns();
      setRuns(data);
    } catch (err: unknown) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  const handleStartRun = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.startPlanningRun({
        horizonDays: parseInt(horizonDays, 10),
        startedBy,
      });
      setIsExecuting(false);
      fetchRuns();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to execute planning run');
    }
  };

  const handleCancelRun = async (id: string) => {
    try {
      await api.cancelPlanningRun(id);
      fetchRuns();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to cancel planning run');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">MRP Planning Runs History & Execution</h1>
          <p className="text-sm text-gray-500">Configure planning horizon and launch MRP engine calculation runs.</p>
        </div>
        <button
          onClick={() => setIsExecuting(!isExecuting)}
          className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
        >
          {isExecuting ? 'Cancel' : '+ Start New Planning Run'}
        </button>
      </div>

      {isExecuting && (
        <form onSubmit={handleStartRun} className="p-4 border rounded bg-gray-50 space-y-4 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">Launch MRP Engine Calculation</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Planning Horizon (Days) *</label>
              <input
                type="number"
                required
                min="1"
                max="365"
                value={horizonDays}
                onChange={(e) => setHorizonDays(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-mono font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Planner User *</label>
              <input
                type="text"
                required
                value={startedBy}
                onChange={(e) => setStartedBy(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-mono"
              />
            </div>
          </div>
          <button type="submit" className="px-4 py-2 bg-black text-white text-xs font-semibold rounded">
            Run MRP Calculation Engine
          </button>
        </form>
      )}

      <div className="border rounded overflow-hidden bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-100 uppercase text-gray-600 border-b">
            <tr>
              <th className="p-3">Run #</th>
              <th className="p-3">Horizon</th>
              <th className="p-3">Started By</th>
              <th className="p-3">Status</th>
              <th className="p-3">Created At</th>
              <th className="p-3">Completed At</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {runs.map((r) => (
              <tr key={String(r.id)} className="hover:bg-gray-50">
                <td className="p-3 font-mono font-bold text-gray-900">
                  <Link href={`/mrp/runs/${String(r.id)}`} className="text-blue-600 hover:underline">
                    {String(r.runNumber)}
                  </Link>
                </td>
                <td className="p-3 font-mono font-bold">{String(r.horizonDays)} Days</td>
                <td className="p-3 font-mono text-gray-700">{String(r.startedBy)}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    r.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                    r.status === 'RUNNING' ? 'bg-blue-100 text-blue-800' :
                    r.status === 'CANCELLED' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {String(r.status)}
                  </span>
                </td>
                <td className="p-3 font-mono text-gray-600">{new Date(String(r.createdAt)).toLocaleString()}</td>
                <td className="p-3 font-mono text-gray-600">{r.completedAt ? new Date(String(r.completedAt)).toLocaleString() : '—'}</td>
                <td className="p-3 text-right">
                  {r.status !== 'COMPLETED' && r.status !== 'CANCELLED' && (
                    <button
                      onClick={() => handleCancelRun(String(r.id))}
                      className="px-2 py-1 bg-red-100 text-red-700 text-[10px] font-bold rounded hover:bg-red-200"
                    >
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-500">No planning runs found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

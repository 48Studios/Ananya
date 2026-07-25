'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../../src/lib/api';

export default function CapacityPlanningPage() {
  const [plans, setPlans] = useState<Record<string, unknown>[]>([]);
  const [onlyOverloaded, setOnlyOverloaded] = useState(false);

  const fetchPlans = useCallback(async () => {
    try {
      const data = await api.getCapacityPlans(undefined, undefined, onlyOverloaded);
      setPlans(data);
    } catch (err: unknown) {
      console.error(err);
    }
  }, [onlyOverloaded]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Work Center Capacity Planning & Utilization</h1>
          <p className="text-sm text-gray-500">Available vs planned work center hours, load percentages, and bottleneck overload alerts.</p>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 bg-gray-50 px-3 py-1.5 border rounded cursor-pointer">
          <input
            type="checkbox"
            checked={onlyOverloaded}
            onChange={(e) => setOnlyOverloaded(e.target.checked)}
            className="rounded"
          />
          Show Only Overloaded (&gt; 100%)
        </label>
      </div>

      <div className="border rounded overflow-hidden bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-100 uppercase text-gray-600 border-b">
            <tr>
              <th className="p-3">Work Center ID</th>
              <th className="p-3">Work Center Name</th>
              <th className="p-3">Available Hours</th>
              <th className="p-3">Planned Hours</th>
              <th className="p-3">Utilization</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {plans.map((p) => (
              <tr key={String(p.id)} className="hover:bg-gray-50">
                <td className="p-3 font-mono font-bold text-gray-900">{String(p.workCenterId)}</td>
                <td className="p-3 font-semibold text-gray-900">{String(p.workCenterName)}</td>
                <td className="p-3 font-mono">{Number(p.availableCapacityHours).toFixed(2)}h</td>
                <td className="p-3 font-mono font-bold text-blue-700">{Number(p.plannedCapacityHours).toFixed(2)}h</td>
                <td className="p-3 font-mono font-bold">
                  <div className="flex items-center gap-2">
                    <span>{Number(p.utilizationPercentage).toFixed(2)}%</span>
                    <div className="w-24 bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-2 rounded-full ${
                          p.isOverloaded ? 'bg-red-600' : 'bg-green-600'
                        }`}
                        style={{ width: `${Math.min(100, Number(p.utilizationPercentage))}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    p.isOverloaded ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                  }`}>
                    {p.isOverloaded ? 'OVERLOADED' : 'BALANCED'}
                  </span>
                </td>
              </tr>
            ))}
            {plans.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-500">No capacity plans generated.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

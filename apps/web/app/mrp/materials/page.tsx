'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../../src/lib/api';

export default function MaterialRequirementsPage() {
  const [requirements, setRequirements] = useState<Record<string, unknown>[]>([]);
  const [onlyShortages, setOnlyShortages] = useState(false);

  const fetchRequirements = useCallback(async () => {
    try {
      const data = await api.getMaterialRequirements(undefined, undefined, undefined, onlyShortages);
      setRequirements(data);
    } catch (err: unknown) {
      console.error(err);
    }
  }, [onlyShortages]);

  useEffect(() => {
    fetchRequirements();
  }, [fetchRequirements]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Material Requirements & Shortages Matrix</h1>
          <p className="text-sm text-gray-500">Gross demand vs available stock reconciliation and component shortage evaluation.</p>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 bg-gray-50 px-3 py-1.5 border rounded cursor-pointer">
          <input
            type="checkbox"
            checked={onlyShortages}
            onChange={(e) => setOnlyShortages(e.target.checked)}
            className="rounded"
          />
          Show Only Shortages (&gt; 0)
        </label>
      </div>

      <div className="border rounded overflow-hidden bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-100 uppercase text-gray-600 border-b">
            <tr>
              <th className="p-3">Component ID</th>
              <th className="p-3">Required Qty</th>
              <th className="p-3">Available Qty</th>
              <th className="p-3">Reserved Qty</th>
              <th className="p-3">Shortage Qty</th>
              <th className="p-3">Required Date</th>
              <th className="p-3">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {requirements.map((req) => (
              <tr key={String(req.id)} className="hover:bg-gray-50">
                <td className="p-3 font-mono font-bold text-gray-900">{String(req.componentId)}</td>
                <td className="p-3 font-mono">{Number(req.requiredQuantity).toFixed(2)}</td>
                <td className="p-3 font-mono text-gray-600">{Number(req.availableQuantity).toFixed(2)}</td>
                <td className="p-3 font-mono text-gray-600">{Number(req.reservedQuantity).toFixed(2)}</td>
                <td className="p-3 font-mono font-bold text-red-600">
                  {Number(req.shortageQuantity) > 0 ? Number(req.shortageQuantity).toFixed(2) : '0.00'}
                </td>
                <td className="p-3 font-mono text-gray-700">{new Date(String(req.requiredDate)).toLocaleDateString()}</td>
                <td className="p-3 font-mono text-gray-700">{String(req.source)}</td>
              </tr>
            ))}
            {requirements.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-500">No material requirements found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

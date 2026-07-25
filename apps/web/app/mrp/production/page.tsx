'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../../src/lib/api';

export default function ProductionRecommendationsPage() {
  const [recommendations, setRecommendations] = useState<Record<string, unknown>[]>([]);

  const fetchRecommendations = useCallback(async () => {
    try {
      const data = await api.getProductionRecommendations();
      setRecommendations(data);
    } catch (err: unknown) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  const handleAccept = async (id: string) => {
    try {
      await api.acceptProductionRecommendation(id);
      fetchRecommendations();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to accept recommendation');
    }
  };

  const handleReject = async (id: string) => {
    try {
      await api.rejectProductionRecommendation(id);
      fetchRecommendations();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to reject recommendation');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Production Planning Recommendations</h1>
          <p className="text-sm text-gray-500">MRP manufactured product runs, suggested start/completion dates, and manufacturing route dispatch.</p>
        </div>
      </div>

      <div className="border rounded overflow-hidden bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-100 uppercase text-gray-600 border-b">
            <tr>
              <th className="p-3">Product ID</th>
              <th className="p-3">Suggested Qty</th>
              <th className="p-3">Start Date</th>
              <th className="p-3">Completion Date</th>
              <th className="p-3">Route</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {recommendations.map((rec) => (
              <tr key={String(rec.id)} className="hover:bg-gray-50">
                <td className="p-3 font-mono font-bold text-gray-900">{String(rec.productId)}</td>
                <td className="p-3 font-mono font-bold text-purple-700">{Number(rec.suggestedQuantity).toFixed(2)}</td>
                <td className="p-3 font-mono text-gray-700">{new Date(String(rec.suggestedStart)).toLocaleDateString()}</td>
                <td className="p-3 font-mono text-gray-700">{new Date(String(rec.suggestedCompletion)).toLocaleDateString()}</td>
                <td className="p-3 font-mono text-gray-600">{String(rec.manufacturingRoute || 'Default')}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    rec.status === 'ACCEPTED' || rec.status === 'IMPLEMENTED' ? 'bg-green-100 text-green-800' :
                    rec.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {String(rec.status)}
                  </span>
                </td>
                <td className="p-3 text-right space-x-1">
                  {rec.status === 'PENDING' && (
                    <>
                      <button
                        onClick={() => handleAccept(String(rec.id))}
                        className="px-2 py-1 bg-green-600 text-white text-[10px] font-bold rounded shadow hover:bg-green-700"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleReject(String(rec.id))}
                        className="px-2 py-1 bg-red-100 text-red-700 text-[10px] font-bold rounded hover:bg-red-200"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {recommendations.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-500">No production recommendations found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

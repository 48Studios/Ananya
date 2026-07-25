'use client';

import React, { useState } from 'react';
import { api } from '../../src/lib/api';

export default function TraceabilityPage() {
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [batchNumber, setBatchNumber] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [results, setResults] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchNumber && !serialNumber) {
      alert('Please enter a batch number or serial number to search.');
      return;
    }
    setLoading(true);
    setHasSearched(true);
    try {
      let data: Record<string, unknown>[] = [];
      if (direction === 'forward') {
        data = await api.getForwardTrace({
          batchNumber: batchNumber || undefined,
          serialNumber: serialNumber || undefined,
        });
      } else {
        data = await api.getBackwardTrace({
          batchNumber: batchNumber || undefined,
          serialNumber: serialNumber || undefined,
        });
      }
      setResults(data);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Traceability query failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-xl font-bold tracking-tight">Manufacturing Traceability & Genealogy</h1>
        <p className="text-sm text-gray-500">
          Forward trace finished products to raw material component origins, or backward trace component batches to impacted finished products.
        </p>
      </div>

      <form onSubmit={handleSearch} className="p-4 border rounded bg-gray-50 space-y-4 max-w-2xl">
        <div className="flex gap-4">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 cursor-pointer">
            <input
              type="radio"
              name="direction"
              value="forward"
              checked={direction === 'forward'}
              onChange={() => setDirection('forward')}
            />
            Forward Trace (Finished Product → Consumed Materials)
          </label>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 cursor-pointer">
            <input
              type="radio"
              name="direction"
              value="backward"
              checked={direction === 'backward'}
              onChange={() => setDirection('backward')}
            />
            Backward Trace (Component Batch → Finished Assemblies)
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Batch Number</label>
            <input
              type="text"
              placeholder="e.g. BATCH-2026-001"
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Serial Number</label>
            <input
              type="text"
              placeholder="e.g. SN-998231"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? 'Executing Trace Query...' : 'Execute Traceability Query'}
        </button>
      </form>

      {hasSearched && (
        <div className="border rounded bg-white p-4 space-y-4">
          <div className="flex justify-between items-center border-b pb-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700">
              Genealogy Traversal Results ({results.length} records found)
            </h2>
          </div>

          <div className="space-y-3">
            {results.map((r) => (
              <div key={String(r.id)} className="p-3 border rounded text-xs bg-gray-50 flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      r.eventType === 'MATERIAL_CONSUMED' ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'
                    }`}>
                      {String(r.eventType)}
                    </span>
                    <span className="font-mono font-bold text-gray-900">
                      Component ID: {String(r.componentId)}
                    </span>
                  </div>
                  <div className="text-gray-500 mt-1 space-x-3">
                    <span>Order ID: <span className="font-mono">{String(r.productionOrderId)}</span></span>
                    {Boolean(r.batchNumber) && <span>Batch: <span className="font-mono font-semibold text-gray-700">{String(r.batchNumber)}</span></span>}
                  </div>
                </div>
                <div className="text-right font-mono font-bold text-gray-900">
                  Qty: {String(r.quantity)}
                </div>
              </div>
            ))}

            {results.length === 0 && !loading && (
              <div className="p-6 text-center text-gray-500 text-sm">
                No matching traceability event records found for the specified criteria.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

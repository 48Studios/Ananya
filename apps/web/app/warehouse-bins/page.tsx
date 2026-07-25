'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../src/lib/api';

export default function WarehouseBinsPage() {
  const [warehouses, setWarehouses] = useState<Record<string, unknown>[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const data = await api.getWarehouses();
      setWarehouses(data);
    } catch (err: unknown) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleToggleState = async (whId: string, binId: string, currentActive: boolean) => {
    try {
      await api.updateWarehouseBin(whId, binId, { isActive: !currentActive });
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update bin state');
    }
  };

  const selectedWh = warehouses.find((w) => w.id === selectedWarehouseId) || warehouses[0];
  const allBins = (selectedWh?.bins as Record<string, unknown>[]) || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Storage Bins & Utilization</h1>
          <p className="text-sm text-gray-500">Addressable bin locations, capacity enforcement, and operational purpose assignment.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-600">Select Warehouse:</label>
          <select
            value={selectedWarehouseId || (warehouses[0]?.id as string) || ''}
            onChange={(e) => setSelectedWarehouseId(e.target.value)}
            className="px-3 py-1.5 text-xs border rounded bg-white font-medium"
          >
            {warehouses.map((w) => (
              <option key={String(w.id)} value={String(w.id)}>{String(w.code)} - {String(w.name)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="border rounded bg-white p-4 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700">
          Bin Registry ({allBins.length} Bins)
        </h2>

        <div className="grid grid-cols-3 gap-4">
          {allBins.map((bin) => {
            const cap = Number(bin.capacity) || 1000;
            const util = Number(bin.currentUtilization) || 0;
            const percent = Math.min(100, Math.round((util / cap) * 100));

            return (
              <div key={String(bin.id)} className="p-4 border rounded bg-gray-50 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-mono font-bold text-sm text-gray-900">{String(bin.code)}</h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-200 text-gray-800">
                      {String(bin.purpose)}
                    </span>
                  </div>
                  <button
                    onClick={() => selectedWh && handleToggleState(String(selectedWh.id), String(bin.id), Boolean(bin.isActive))}
                    className={`px-2 py-1 text-[10px] font-bold rounded ${
                      bin.isActive ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200'
                    }`}
                  >
                    {bin.isActive ? 'Disable Bin' : 'Activate Bin'}
                  </button>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1 font-mono">
                    <span>Utilization</span>
                    <span>{util} / {cap} ({percent}%)</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full ${percent > 90 ? 'bg-red-500' : percent > 75 ? 'bg-yellow-500' : 'bg-blue-600'}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}

          {allBins.length === 0 && (
            <div className="col-span-3 p-8 text-center text-gray-400 border border-dashed rounded">
              No bins configured in this warehouse facility.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

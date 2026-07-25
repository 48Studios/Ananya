'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../src/lib/api';

export default function WarehousePoliciesPage() {
  const [warehouses, setWarehouses] = useState<Record<string, unknown>[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [policy, setPolicy] = useState<Record<string, unknown> | null>(null);

  // Form states
  const [allowNegativeInventory, setAllowNegativeInventory] = useState(false);
  const [enforceBinCapacity, setEnforceBinCapacity] = useState(true);
  const [directedPutaway, setDirectedPutaway] = useState(false);
  const [directedPicking, setDirectedPicking] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const whData = await api.getWarehouses();
      setWarehouses(whData);
      const targetId = selectedWarehouseId || (whData[0]?.id as string);
      if (targetId) {
        setSelectedWarehouseId(targetId);
        try {
          const pol = await api.getWarehousePolicy(targetId);
          setPolicy(pol);
          setAllowNegativeInventory(Boolean(pol.allowNegativeInventory));
          setEnforceBinCapacity(Boolean(pol.enforceBinCapacity));
          setDirectedPutaway(Boolean(pol.directedPutaway));
          setDirectedPicking(Boolean(pol.directedPicking));
        } catch {
          setPolicy(null);
        }
      }
    } catch (err: unknown) {
      console.error(err);
    }
  }, [selectedWarehouseId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWarehouseId) return;
    try {
      const saved = await api.saveWarehousePolicy({
        warehouseId: selectedWarehouseId,
        allowNegativeInventory,
        enforceBinCapacity,
        directedPutaway,
        directedPicking,
      });
      setPolicy(saved);
      alert('Warehouse policy updated successfully!');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to save policy');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Warehouse Policies & Operational Governance</h1>
          <p className="text-sm text-gray-500">Configure capacity enforcement rules, directed putaway, and negative stock allowance.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-600">Warehouse Facility:</label>
          <select
            value={selectedWarehouseId}
            onChange={(e) => setSelectedWarehouseId(e.target.value)}
            className="px-3 py-1.5 text-xs border rounded bg-white font-medium"
          >
            {warehouses.map((w) => (
              <option key={String(w.id)} value={String(w.id)}>{String(w.code)} - {String(w.name)}</option>
            ))}
          </select>
        </div>
      </div>

      <form onSubmit={handleSave} className="p-6 border rounded bg-white space-y-6 max-w-2xl">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-800 border-b pb-2">
          Operational Governance Rules
        </h2>

        <div className="space-y-4">
          <label className="flex items-start gap-3 p-3 border rounded bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              checked={enforceBinCapacity}
              onChange={(e) => setEnforceBinCapacity(e.target.checked)}
              className="mt-1"
            />
            <div>
              <p className="font-bold text-xs text-gray-900">Enforce Bin Maximum Capacity</p>
              <p className="text-xs text-gray-500">Prohibit stock putaway or transfers into bins exceeding their designated volumetric threshold.</p>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 border rounded bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              checked={allowNegativeInventory}
              onChange={(e) => setAllowNegativeInventory(e.target.checked)}
              className="mt-1"
            />
            <div>
              <p className="font-bold text-xs text-gray-900">Allow Negative Inventory Balances</p>
              <p className="text-xs text-gray-500">Allow operational dispatch even if physical stock level is temporarily below zero in system projection.</p>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 border rounded bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              checked={directedPutaway}
              onChange={(e) => setDirectedPutaway(e.target.checked)}
              className="mt-1"
            />
            <div>
              <p className="font-bold text-xs text-gray-900">Enable Directed Putaway System Guidance</p>
              <p className="text-xs text-gray-500">Automatically suggest optimal destination bin locations during goods receipt.</p>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 border rounded bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              checked={directedPicking}
              onChange={(e) => setDirectedPicking(e.target.checked)}
              className="mt-1"
            />
            <div>
              <p className="font-bold text-xs text-gray-900">Enable Directed Picking Route Optimization</p>
              <p className="text-xs text-gray-500">Generate optimized picking sequence routes across warehouse aisles during material consumption.</p>
            </div>
          </label>
        </div>

        <div className="pt-2 border-t flex justify-between items-center">
          <span className="text-xs text-gray-400">
            {policy ? `Last Updated: ${new Date(String(policy.updatedAt)).toLocaleString()}` : 'No active policy saved for this facility.'}
          </span>
          <button type="submit" className="px-5 py-2 bg-black text-white text-xs font-bold rounded shadow hover:bg-gray-800">
            Save Warehouse Policy
          </button>
        </div>
      </form>
    </div>
  );
}

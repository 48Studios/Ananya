'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../src/lib/api';

export default function CycleCountsPage() {
  const [cycleCounts, setCycleCounts] = useState<Record<string, unknown>[]>([]);
  const [warehouses, setWarehouses] = useState<Record<string, unknown>[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  // Form states
  const [warehouseId, setWarehouseId] = useState('');
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState('MONTHLY');

  const fetchData = useCallback(async () => {
    try {
      const [ccData, whData] = await Promise.all([
        api.getCycleCounts(),
        api.getWarehouses(),
      ]);
      setCycleCounts(ccData);
      setWarehouses(whData);
    } catch (err: unknown) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createCycleCount({
        warehouseId,
        name,
        frequency,
      });
      setIsCreating(false);
      setName('');
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create cycle count schedule');
    }
  };

  const handleExecute = async (id: string) => {
    try {
      const sc = await api.executeCycleCount(id);
      alert(`Stock Count Generated! New Count Number: ${String(sc.countNumber)}`);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to execute schedule');
    }
  };

  const handlePauseResume = async (id: string, currentStatus: string) => {
    try {
      if (currentStatus === 'ACTIVE') {
        await api.pauseCycleCount(id);
      } else {
        await api.resumeCycleCount(id);
      }
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update schedule status');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Recurring Cycle Counting</h1>
          <p className="text-sm text-gray-500">Configure automated recurring stock audit schedules across warehouse zones and bins.</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
        >
          {isCreating ? 'Cancel' : '+ New Audit Schedule'}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="p-4 border rounded bg-gray-50 space-y-4 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">Create Cycle Count Schedule</h2>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Target Warehouse *</label>
            <select
              required
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white"
            >
              <option value="">-- Choose Warehouse --</option>
              {warehouses.map((w) => (
                <option key={String(w.id)} value={String(w.id)}>{String(w.code)} - {String(w.name)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Schedule Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Monthly SMD Reel Audit"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Frequency *</label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white"
            >
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="QUARTERLY">Quarterly</option>
            </select>
          </div>
          <button type="submit" className="px-4 py-2 bg-black text-white text-xs font-semibold rounded">
            Save Schedule
          </button>
        </form>
      )}

      <div className="border rounded bg-white p-4 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700">Configured Schedules</h2>

        <div className="space-y-3">
          {cycleCounts.map((cc) => {
            const wh = warehouses.find((w) => w.id === cc.warehouseId);
            return (
              <div key={String(cc.id)} className="p-4 border rounded bg-gray-50 flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-gray-900">{String(cc.name)}</h3>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      cc.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {String(cc.status)}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-100 text-blue-800">
                      {String(cc.frequency)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Warehouse: <span className="font-mono font-semibold">{String(wh?.code ?? cc.warehouseId)}</span> | Next Run: <span className="font-mono text-gray-700">{new Date(String(cc.nextScheduledDate)).toLocaleDateString()}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleExecute(String(cc.id))}
                    className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
                  >
                    Trigger Count Run Now
                  </button>
                  <button
                    onClick={() => handlePauseResume(String(cc.id), String(cc.status))}
                    className="px-3 py-1.5 border border-gray-300 text-gray-700 text-xs font-semibold rounded bg-white hover:bg-gray-100"
                  >
                    {cc.status === 'ACTIVE' ? 'Pause' : 'Resume'}
                  </button>
                </div>
              </div>
            );
          })}

          {cycleCounts.length === 0 && (
            <div className="p-8 text-center text-gray-400 border border-dashed rounded">
              No cycle count schedules configured.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

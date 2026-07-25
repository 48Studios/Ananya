'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../src/lib/api';

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState<Record<string, unknown>[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<Record<string, unknown> | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form states
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Bin form
  const [binCode, setBinCode] = useState('');
  const [capacity, setCapacity] = useState('1000');
  const [purpose, setPurpose] = useState('STORAGE');

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createWarehouse({
        code,
        name,
        description: description || undefined,
      });
      setIsCreating(false);
      setCode('');
      setName('');
      setDescription('');
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create warehouse');
    }
  };

  const handleAddBin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWarehouse) return;
    try {
      await api.addWarehouseBin(String(selectedWarehouse.id), {
        code: binCode,
        capacity: parseFloat(capacity),
        purpose,
      });
      setBinCode('');
      const updated = await api.getWarehouse(String(selectedWarehouse.id));
      setSelectedWarehouse(updated);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to add bin');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Warehouse Facilities</h1>
          <p className="text-sm text-gray-500">Physical facility hierarchy and storage structure management.</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
        >
          {isCreating ? 'Cancel' : '+ New Warehouse'}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="p-4 border rounded bg-gray-50 space-y-4 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">Create Warehouse Facility</h2>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Facility Code *</label>
            <input
              type="text"
              required
              placeholder="e.g. WH-MAIN"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Facility Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Main Production Warehouse"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              placeholder="Primary component and assembly storage"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white"
            />
          </div>
          <button type="submit" className="px-4 py-2 bg-black text-white text-xs font-semibold rounded">
            Save Facility
          </button>
        </form>
      )}

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-6">
          <div className="border rounded overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-100 uppercase text-gray-600 border-b">
                <tr>
                  <th className="p-3">Code</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Bins</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {warehouses.map((w) => {
                  const bins = (w.bins as Record<string, unknown>[]) || [];
                  return (
                    <tr
                      key={String(w.id)}
                      onClick={() => setSelectedWarehouse(w)}
                      className={`cursor-pointer hover:bg-gray-50 ${selectedWarehouse?.id === w.id ? 'bg-blue-50' : ''}`}
                    >
                      <td className="p-3 font-mono font-bold text-gray-900">{String(w.code)}</td>
                      <td className="p-3 font-semibold text-gray-800">{String(w.name)}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-800">
                          {String(w.status)}
                        </span>
                      </td>
                      <td className="p-3 font-mono font-bold">{bins.length}</td>
                    </tr>
                  );
                })}
                {warehouses.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-gray-500">No warehouses configured.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col-span-6">
          {selectedWarehouse ? (
            <div className="border rounded p-4 space-y-4 bg-white">
              <div className="border-b pb-3">
                <h3 className="font-mono font-bold text-lg">{String(selectedWarehouse.code)} - {String(selectedWarehouse.name)}</h3>
                <p className="text-xs text-gray-500">{String(selectedWarehouse.description || 'No description provided.')}</p>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase text-gray-600 mb-2">Storage Bins in Facility</h4>
                <div className="space-y-2">
                  {((selectedWarehouse.bins as Record<string, unknown>[]) ?? []).map((b) => (
                    <div key={String(b.id)} className="p-2.5 border rounded text-xs flex justify-between bg-gray-50">
                      <div>
                        <p className="font-mono font-bold text-gray-900">{String(b.code)}</p>
                        <p className="text-gray-500">Purpose: <span className="font-semibold">{String(b.purpose)}</span></p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-bold text-gray-900">Cap: {String(b.capacity)}</p>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${b.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {b.isActive ? 'Active' : 'Disabled'}
                        </span>
                      </div>
                    </div>
                  ))}
                  {((selectedWarehouse.bins as Record<string, unknown>[]) ?? []).length === 0 && (
                    <div className="text-xs text-gray-400 py-2">No storage bins created in this facility yet.</div>
                  )}
                </div>
              </div>

              <form onSubmit={handleAddBin} className="border-t pt-3 space-y-2">
                <h4 className="text-xs font-bold uppercase text-gray-600">Create Addressable Bin</h4>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Bin Code (e.g. BIN-A1-01)"
                    value={binCode}
                    onChange={(e) => setBinCode(e.target.value)}
                    className="px-2 py-1.5 text-xs border rounded"
                  />
                  <input
                    type="number"
                    required
                    placeholder="Capacity"
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    className="px-2 py-1.5 text-xs border rounded"
                  />
                </div>
                <select
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border rounded bg-white"
                >
                  <option value="STORAGE">Storage</option>
                  <option value="RECEIVING">Receiving Default</option>
                  <option value="PRODUCTION">Production Default</option>
                  <option value="SHIPPING">Shipping Default</option>
                  <option value="QUALITY_HOLD">Quality Hold</option>
                </select>
                <button type="submit" className="w-full py-1.5 bg-gray-900 text-white text-xs font-medium rounded">
                  + Add Bin to Facility
                </button>
              </form>
            </div>
          ) : (
            <div className="p-8 border border-dashed rounded text-center text-sm text-gray-400">
              Select a warehouse facility to manage hierarchy and bins.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

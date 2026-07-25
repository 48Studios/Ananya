'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../src/lib/api';

export default function StockCountsPage() {
  const [stockCounts, setStockCounts] = useState<Record<string, unknown>[]>([]);
  const [warehouses, setWarehouses] = useState<Record<string, unknown>[]>([]);
  const [components, setComponents] = useState<Record<string, unknown>[]>([]);
  const [selectedCount, setSelectedCount] = useState<Record<string, unknown> | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form states
  const [warehouseId, setWarehouseId] = useState('');
  const [assignedUser, setAssignedUser] = useState('');

  // Line form
  const [componentId, setComponentId] = useState('');
  const [binId, setBinId] = useState('');
  const [expectedQty, setExpectedQty] = useState('0');
  const [countedQty, setCountedQty] = useState('0');
  const [lineNotes, setLineNotes] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [scData, whData, compData] = await Promise.all([
        api.getStockCounts(),
        api.getWarehouses(),
        api.getComponents(),
      ]);
      setStockCounts(scData);
      setWarehouses(whData);
      setComponents(compData as unknown as Record<string, unknown>[]);
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
      await api.createStockCount({
        warehouseId,
        assignedUser: assignedUser || undefined,
      });
      setIsCreating(false);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create stock count');
    }
  };

  const handleAddLine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCount) return;
    try {
      await api.addStockCountLine(String(selectedCount.id), {
        componentId,
        binId,
        expectedQuantity: parseFloat(expectedQty),
        countedQuantity: parseFloat(countedQty),
        notes: lineNotes || undefined,
      });
      const updated = await api.getStockCount(String(selectedCount.id));
      setSelectedCount(updated);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to add count line');
    }
  };

  const handleAction = async (countId: string, action: 'submit' | 'approve' | 'post' | 'cancel') => {
    try {
      if (action === 'submit') await api.submitStockCount(countId);
      if (action === 'approve') await api.approveStockCount(countId);
      if (action === 'post') {
        await api.postStockCount(countId);
        alert('Stock Count Posted! Inventory Adjustment transactions created.');
      }
      if (action === 'cancel') await api.cancelStockCount(countId);

      fetchData();
      if (selectedCount?.id === countId) {
        const updated = await api.getStockCount(countId);
        setSelectedCount(updated);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : `Failed to ${action} stock count`);
    }
  };

  const selectedWh = warehouses.find((w) => w.id === (selectedCount?.warehouseId as string));
  const binsInWh = (selectedWh?.bins as Record<string, unknown>[]) || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Physical Stock Counts</h1>
          <p className="text-sm text-gray-500">Perform physical stock audits, review variances, and post inventory ledger adjustments.</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
        >
          {isCreating ? 'Cancel' : '+ Initialize Stock Count'}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="p-4 border rounded bg-gray-50 space-y-4 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">Initialize Physical Count</h2>
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
            <label className="block text-xs font-medium text-gray-700 mb-1">Assigned Counter / Operator</label>
            <input
              type="text"
              placeholder="e.g. John Doe"
              value={assignedUser}
              onChange={(e) => setAssignedUser(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white"
            />
          </div>
          <button type="submit" className="px-4 py-2 bg-black text-white text-xs font-semibold rounded">
            Start Count Audit
          </button>
        </form>
      )}

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-6">
          <div className="border rounded overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-100 uppercase text-gray-600 border-b">
                <tr>
                  <th className="p-3">Count #</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Assigned User</th>
                  <th className="p-3">Lines</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {stockCounts.map((sc) => {
                  const lines = (sc.lines as Record<string, unknown>[]) || [];
                  return (
                    <tr
                      key={String(sc.id)}
                      onClick={() => setSelectedCount(sc)}
                      className={`cursor-pointer hover:bg-gray-50 ${selectedCount?.id === sc.id ? 'bg-blue-50' : ''}`}
                    >
                      <td className="p-3 font-mono font-bold text-gray-900">{String(sc.countNumber)}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          sc.status === 'POSTED' ? 'bg-green-100 text-green-800' :
                          sc.status === 'APPROVED' ? 'bg-blue-100 text-blue-800' :
                          sc.status === 'SUBMITTED' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {String(sc.status)}
                        </span>
                      </td>
                      <td className="p-3 text-gray-700">{String(sc.assignedUser || '—')}</td>
                      <td className="p-3 font-mono">{lines.length} lines</td>
                    </tr>
                  );
                })}
                {stockCounts.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-gray-500">No stock count audits found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col-span-6">
          {selectedCount ? (
            <div className="border rounded p-4 space-y-4 bg-white">
              <div className="flex justify-between items-start border-b pb-3">
                <div>
                  <h3 className="font-mono font-bold text-lg">{String(selectedCount.countNumber)}</h3>
                  <p className="text-xs text-gray-500">Status: {String(selectedCount.status)}</p>
                </div>
                <div className="flex gap-1">
                  {(selectedCount.status === 'DRAFT' || selectedCount.status === 'COUNTING') && (
                    <button
                      onClick={() => handleAction(String(selectedCount.id), 'submit')}
                      className="px-3 py-1 bg-yellow-600 text-white text-xs font-bold rounded"
                    >
                      Submit
                    </button>
                  )}
                  {selectedCount.status === 'SUBMITTED' && (
                    <button
                      onClick={() => handleAction(String(selectedCount.id), 'approve')}
                      className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded"
                    >
                      Approve
                    </button>
                  )}
                  {selectedCount.status === 'APPROVED' && (
                    <button
                      onClick={() => handleAction(String(selectedCount.id), 'post')}
                      className="px-3 py-1 bg-green-600 text-white text-xs font-bold rounded shadow"
                    >
                      Post Adjustments
                    </button>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase text-gray-600 mb-2">Count Line Variances</h4>
                <div className="space-y-2">
                  {((selectedCount.lines as Record<string, unknown>[]) ?? []).map((l) => {
                    const comp = components.find((c) => c.id === l.componentId);
                    const varNum = Number(l.variance) || 0;
                    return (
                      <div key={String(l.id)} className="p-2.5 border rounded text-xs flex justify-between bg-gray-50">
                        <div>
                          <p className="font-bold">{String(comp?.sku ?? l.componentId)}</p>
                          <p className="text-gray-500">Bin: {String(l.binId)}</p>
                        </div>
                        <div className="text-right font-mono">
                          <p className="text-gray-500">Exp: {String(l.expectedQuantity)} | Count: {String(l.countedQuantity)}</p>
                          <p className={`font-bold ${varNum > 0 ? 'text-green-700' : varNum < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                            Var: {varNum > 0 ? `+${varNum}` : varNum}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {((selectedCount.lines as Record<string, unknown>[]) ?? []).length === 0 && (
                    <div className="text-xs text-gray-400 py-2">No count lines added yet.</div>
                  )}
                </div>
              </div>

              {(selectedCount.status === 'DRAFT' || selectedCount.status === 'ASSIGNED' || selectedCount.status === 'COUNTING') && (
                <form onSubmit={handleAddLine} className="border-t pt-3 space-y-2">
                  <h4 className="text-xs font-bold uppercase text-gray-600">Enter Component Physical Count</h4>
                  <select
                    required
                    value={componentId}
                    onChange={(e) => setComponentId(e.target.value)}
                    className="w-full px-2 py-1 text-xs border rounded bg-white"
                  >
                    <option value="">-- Select Component --</option>
                    {components.map((c) => (
                      <option key={String(c.id)} value={String(c.id)}>{String(c.sku)} - {String(c.name)}</option>
                    ))}
                  </select>
                  <select
                    required
                    value={binId}
                    onChange={(e) => setBinId(e.target.value)}
                    className="w-full px-2 py-1 text-xs border rounded bg-white"
                  >
                    <option value="">-- Select Bin Location --</option>
                    {binsInWh.map((b) => (
                      <option key={String(b.id)} value={String(b.id)}>{String(b.code)} ({String(b.purpose)})</option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      placeholder="Expected Qty"
                      value={expectedQty}
                      onChange={(e) => setExpectedQty(e.target.value)}
                      className="px-2 py-1 text-xs border rounded"
                    />
                    <input
                      type="number"
                      placeholder="Counted Qty *"
                      required
                      value={countedQty}
                      onChange={(e) => setCountedQty(e.target.value)}
                      className="px-2 py-1 text-xs border rounded font-bold"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Notes (optional)"
                    value={lineNotes}
                    onChange={(e) => setLineNotes(e.target.value)}
                    className="w-full px-2 py-1 text-xs border rounded"
                  />
                  <button type="submit" className="w-full py-1.5 bg-gray-900 text-white text-xs font-medium rounded">
                    + Save Count Line
                  </button>
                </form>
              )}
            </div>
          ) : (
            <div className="p-8 border border-dashed rounded text-center text-sm text-gray-400">
              Select a physical stock count document to enter lines or process approvals.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

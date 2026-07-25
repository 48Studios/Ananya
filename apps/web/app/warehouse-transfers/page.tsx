'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../src/lib/api';

export default function WarehouseTransfersPage() {
  const [transfers, setTransfers] = useState<Record<string, unknown>[]>([]);
  const [warehouses, setWarehouses] = useState<Record<string, unknown>[]>([]);
  const [components, setComponents] = useState<Record<string, unknown>[]>([]);
  const [selectedTransfer, setSelectedTransfer] = useState<Record<string, unknown> | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form states
  const [sourceBinId, setSourceBinId] = useState('');
  const [destinationBinId, setDestinationBinId] = useState('');

  // Line form
  const [componentId, setComponentId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [batchNumber, setBatchNumber] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [wtData, whData, compData] = await Promise.all([
        api.getWarehouseTransfers(),
        api.getWarehouses(),
        api.getComponents(),
      ]);
      setTransfers(wtData);
      setWarehouses(whData);
      setComponents(compData as unknown as Record<string, unknown>[]);
    } catch (err: unknown) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const allBins = warehouses.flatMap((w) => (w.bins as Record<string, unknown>[]) || []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createWarehouseTransfer({
        sourceBinId,
        destinationBinId,
      });
      setIsCreating(false);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create transfer document');
    }
  };

  const handleAddLine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTransfer) return;
    try {
      await api.addTransferLine(String(selectedTransfer.id), {
        componentId,
        quantity: parseFloat(quantity),
        batchNumber: batchNumber || undefined,
      });
      const updated = await api.getWarehouseTransfer(String(selectedTransfer.id));
      setSelectedTransfer(updated);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to add transfer line');
    }
  };

  const handleAction = async (transferId: string, action: 'approve' | 'dispatch' | 'complete' | 'cancel') => {
    try {
      if (action === 'approve') await api.approveTransfer(transferId);
      if (action === 'dispatch') await api.dispatchTransfer(transferId);
      if (action === 'complete') {
        await api.completeTransfer(transferId);
        alert('Transfer Completed! Inventory Transfer transactions executed.');
      }
      if (action === 'cancel') await api.cancelTransfer(transferId);

      fetchData();
      if (selectedTransfer?.id === transferId) {
        const updated = await api.getWarehouseTransfer(transferId);
        setSelectedTransfer(updated);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : `Failed to ${action} transfer`);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Internal Warehouse Transfers</h1>
          <p className="text-sm text-gray-500">Relocate stock between physical storage bins and execute inventory ledger transfers.</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
        >
          {isCreating ? 'Cancel' : '+ New Bin Transfer'}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="p-4 border rounded bg-gray-50 space-y-4 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">Create Transfer Document</h2>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Source Origin Bin *</label>
            <select
              required
              value={sourceBinId}
              onChange={(e) => setSourceBinId(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white"
            >
              <option value="">-- Choose Origin Bin --</option>
              {allBins.map((b) => (
                <option key={String(b.id)} value={String(b.id)}>{String(b.code)} ({String(b.purpose)})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Destination Target Bin *</label>
            <select
              required
              value={destinationBinId}
              onChange={(e) => setDestinationBinId(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white"
            >
              <option value="">-- Choose Destination Bin --</option>
              {allBins.map((b) => (
                <option key={String(b.id)} value={String(b.id)}>{String(b.code)} ({String(b.purpose)})</option>
              ))}
            </select>
          </div>
          <button type="submit" className="px-4 py-2 bg-black text-white text-xs font-semibold rounded">
            Generate Transfer Order
          </button>
        </form>
      )}

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-6">
          <div className="border rounded overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-100 uppercase text-gray-600 border-b">
                <tr>
                  <th className="p-3">Transfer #</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Source Bin</th>
                  <th className="p-3">Dest Bin</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {transfers.map((wt) => {
                  const srcBin = allBins.find((b) => b.id === wt.sourceBinId);
                  const dstBin = allBins.find((b) => b.id === wt.destinationBinId);
                  return (
                    <tr
                      key={String(wt.id)}
                      onClick={() => setSelectedTransfer(wt)}
                      className={`cursor-pointer hover:bg-gray-50 ${selectedTransfer?.id === wt.id ? 'bg-blue-50' : ''}`}
                    >
                      <td className="p-3 font-mono font-bold text-gray-900">{String(wt.transferNumber)}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          wt.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                          wt.status === 'IN_TRANSIT' ? 'bg-blue-100 text-blue-800' :
                          wt.status === 'APPROVED' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {String(wt.status)}
                        </span>
                      </td>
                      <td className="p-3 font-mono">{String(srcBin?.code ?? wt.sourceBinId)}</td>
                      <td className="p-3 font-mono">{String(dstBin?.code ?? wt.destinationBinId)}</td>
                    </tr>
                  );
                })}
                {transfers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-gray-500">No warehouse transfers found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col-span-6">
          {selectedTransfer ? (
            <div className="border rounded p-4 space-y-4 bg-white">
              <div className="flex justify-between items-start border-b pb-3">
                <div>
                  <h3 className="font-mono font-bold text-lg">{String(selectedTransfer.transferNumber)}</h3>
                  <p className="text-xs text-gray-500">Status: {String(selectedTransfer.status)}</p>
                </div>
                <div className="flex gap-1">
                  {selectedTransfer.status === 'DRAFT' && (
                    <button
                      onClick={() => handleAction(String(selectedTransfer.id), 'approve')}
                      className="px-3 py-1 bg-yellow-600 text-white text-xs font-bold rounded"
                    >
                      Approve
                    </button>
                  )}
                  {selectedTransfer.status === 'APPROVED' && (
                    <button
                      onClick={() => handleAction(String(selectedTransfer.id), 'dispatch')}
                      className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded"
                    >
                      Dispatch
                    </button>
                  )}
                  {(selectedTransfer.status === 'APPROVED' || selectedTransfer.status === 'IN_TRANSIT') && (
                    <button
                      onClick={() => handleAction(String(selectedTransfer.id), 'complete')}
                      className="px-3 py-1 bg-green-600 text-white text-xs font-bold rounded shadow"
                    >
                      Complete & Relocate
                    </button>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase text-gray-600 mb-2">Relocated Component Line Items</h4>
                <div className="space-y-2">
                  {((selectedTransfer.lines as Record<string, unknown>[]) ?? []).map((l) => {
                    const comp = components.find((c) => c.id === l.componentId);
                    return (
                      <div key={String(l.id)} className="p-2.5 border rounded text-xs flex justify-between bg-gray-50">
                        <div>
                          <p className="font-bold">{String(comp?.sku ?? l.componentId)}</p>
                          {Boolean(l.batchNumber) && <p className="font-mono text-gray-400">Batch: {String(l.batchNumber)}</p>}
                        </div>
                        <div className="text-right font-mono font-bold text-gray-900">
                          {String(l.quantity)} pcs
                        </div>
                      </div>
                    );
                  })}
                  {((selectedTransfer.lines as Record<string, unknown>[]) ?? []).length === 0 && (
                    <div className="text-xs text-gray-400 py-2">No transfer line items added.</div>
                  )}
                </div>
              </div>

              {selectedTransfer.status === 'DRAFT' && (
                <form onSubmit={handleAddLine} className="border-t pt-3 space-y-2">
                  <h4 className="text-xs font-bold uppercase text-gray-600">Add Component Item to Transfer</h4>
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
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      step="0.0001"
                      placeholder="Transfer Qty *"
                      required
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="px-2 py-1 text-xs border rounded font-bold"
                    />
                    <input
                      type="text"
                      placeholder="Batch # (optional)"
                      value={batchNumber}
                      onChange={(e) => setBatchNumber(e.target.value)}
                      className="px-2 py-1 text-xs border rounded"
                    />
                  </div>
                  <button type="submit" className="w-full py-1.5 bg-gray-900 text-white text-xs font-medium rounded">
                    + Add Item to Transfer Order
                  </button>
                </form>
              )}
            </div>
          ) : (
            <div className="p-8 border border-dashed rounded text-center text-sm text-gray-400">
              Select a warehouse transfer document to inspect lines or complete relocation.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

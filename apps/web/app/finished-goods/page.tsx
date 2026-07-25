'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../src/lib/api';

export default function FinishedGoodsPage() {
  const [fgrs, setFgrs] = useState<Record<string, unknown>[]>([]);
  const [orders, setOrders] = useState<Record<string, unknown>[]>([]);
  const [components, setComponents] = useState<Record<string, unknown>[]>([]);
  const [locations, setLocations] = useState<Record<string, unknown>[]>([]);
  const [selectedFgr, setSelectedFgr] = useState<Record<string, unknown> | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form states
  const [productionOrderId, setProductionOrderId] = useState('');

  // Line form
  const [componentId, setComponentId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [qtyProduced, setQtyProduced] = useState('1');
  const [qtyScrapped, setQtyScrapped] = useState('0');
  const [batchNumber, setBatchNumber] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [fgrData, orderData, compData, locData] = await Promise.all([
        api.getFinishedGoodsReceipts(),
        api.getProductionOrders(),
        api.getComponents(),
        api.getLocations(),
      ]);
      setFgrs(fgrData);
      setOrders(orderData);
      setComponents(compData as unknown as Record<string, unknown>[]);
      setLocations(locData as unknown as Record<string, unknown>[]);
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
      await api.createFinishedGoodsReceipt({ productionOrderId });
      setIsCreating(false);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create Finished Goods Receipt');
    }
  };

  const handleAddLine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFgr) return;
    try {
      await api.addFgrLine(String(selectedFgr.id), {
        componentId,
        locationId,
        quantityProduced: parseInt(qtyProduced, 10),
        quantityScrapped: parseInt(qtyScrapped, 10),
        batchNumber: batchNumber || undefined,
      });
      const updated = await api.getFinishedGoodsReceipt(String(selectedFgr.id));
      setSelectedFgr(updated);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to add yield line');
    }
  };

  const handlePost = async (fgrId: string) => {
    try {
      await api.postFinishedGoodsReceipt(fgrId);
      alert('Finished Goods Receipt Posted! Inventory Receipt transactions created and stock added.');
      fetchData();
      if (selectedFgr?.id === fgrId) {
        const updated = await api.getFinishedGoodsReceipt(fgrId);
        setSelectedFgr(updated);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to post finished goods receipt');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Finished Goods Receipt (FGR)</h1>
          <p className="text-sm text-gray-500">Receive manufactured products into inventory stock and record production yield & scrap.</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
        >
          {isCreating ? 'Cancel' : '+ New Finished Goods Receipt'}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="p-4 border rounded bg-gray-50 space-y-4 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">Create Finished Goods Receipt Document</h2>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Production Order *</label>
            <select
              required
              value={productionOrderId}
              onChange={(e) => setProductionOrderId(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white"
            >
              <option value="">-- Select Production Order --</option>
              {orders.map((o) => (
                <option key={String(o.id)} value={String(o.id)}>
                  {String(o.productionNumber)} - [{String(o.status)}]
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="px-4 py-2 bg-black text-white text-xs font-semibold rounded">
            Generate FGR Document
          </button>
        </form>
      )}

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-6">
          <div className="border rounded overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-100 uppercase text-gray-600 border-b">
                <tr>
                  <th className="p-3">FGR #</th>
                  <th className="p-3">Production Order</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Yield Lines</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {fgrs.map((f) => {
                  const order = orders.find((o) => o.id === f.productionOrderId);
                  const lines = (f.lines as Record<string, unknown>[]) || [];
                  return (
                    <tr
                      key={String(f.id)}
                      onClick={() => setSelectedFgr(f)}
                      className={`cursor-pointer hover:bg-gray-50 ${selectedFgr?.id === f.id ? 'bg-blue-50' : ''}`}
                    >
                      <td className="p-3 font-mono font-bold text-gray-900">{String(f.fgrNumber)}</td>
                      <td className="p-3 font-mono text-gray-700">{String(order?.productionNumber ?? f.productionOrderId)}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          f.status === 'POSTED' ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-800'
                        }`}>
                          {String(f.status)}
                        </span>
                      </td>
                      <td className="p-3 font-mono">{lines.length} lines</td>
                    </tr>
                  );
                })}
                {fgrs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-gray-500">No finished goods receipts found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col-span-6">
          {selectedFgr ? (
            <div className="border rounded p-4 space-y-4 bg-white">
              <div className="flex justify-between items-start border-b pb-3">
                <div>
                  <h3 className="font-mono font-bold text-lg">{String(selectedFgr.fgrNumber)}</h3>
                  <p className="text-xs text-gray-500">Status: {String(selectedFgr.status)}</p>
                </div>
                {selectedFgr.status === 'DRAFT' && (
                  <button
                    onClick={() => handlePost(String(selectedFgr.id))}
                    className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded shadow hover:bg-green-700"
                  >
                    Post & Add Stock
                  </button>
                )}
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase text-gray-600 mb-2">Production Yield & Scrap</h4>
                <div className="space-y-2">
                  {((selectedFgr.lines as Record<string, unknown>[]) ?? []).map((l) => {
                    const comp = components.find((c) => c.id === l.componentId);
                    const loc = locations.find((loc) => loc.id === l.locationId);
                    return (
                      <div key={String(l.id)} className="p-2.5 border rounded text-xs flex justify-between bg-gray-50">
                        <div>
                          <p className="font-bold">{String(comp?.sku ?? l.componentId)}</p>
                          <p className="text-gray-500">Destination: {String(loc?.code ?? l.locationId)}</p>
                          {Boolean(l.batchNumber) && <p className="font-mono text-gray-400">Batch: {String(l.batchNumber)}</p>}
                        </div>
                        <div className="text-right font-mono">
                          <p className="font-bold text-green-700">+{String(l.quantityProduced)} produced</p>
                          <p className="text-red-600 font-semibold">{String(l.quantityScrapped)} scrapped</p>
                        </div>
                      </div>
                    );
                  })}
                  {((selectedFgr.lines as Record<string, unknown>[]) ?? []).length === 0 && (
                    <div className="text-xs text-gray-400 py-2">No yield lines recorded.</div>
                  )}
                </div>
              </div>

              {selectedFgr.status === 'DRAFT' && (
                <form onSubmit={handleAddLine} className="border-t pt-3 space-y-2">
                  <h4 className="text-xs font-bold uppercase text-gray-600">Add Production Output Line</h4>
                  <select
                    required
                    value={componentId}
                    onChange={(e) => setComponentId(e.target.value)}
                    className="w-full px-2 py-1 text-xs border rounded bg-white"
                  >
                    <option value="">-- Select Finished Product Component --</option>
                    {components.map((c) => (
                      <option key={String(c.id)} value={String(c.id)}>{String(c.sku)} - {String(c.name)}</option>
                    ))}
                  </select>
                  <select
                    required
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value)}
                    className="w-full px-2 py-1 text-xs border rounded bg-white"
                  >
                    <option value="">-- Select Destination Storage Location --</option>
                    {locations.map((loc) => (
                      <option key={String(loc.id)} value={String(loc.id)}>{String(loc.code)} ({String(loc.name)})</option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      placeholder="Qty Produced"
                      required
                      value={qtyProduced}
                      onChange={(e) => setQtyProduced(e.target.value)}
                      className="px-2 py-1 text-xs border rounded"
                    />
                    <input
                      type="number"
                      placeholder="Qty Scrapped"
                      value={qtyScrapped}
                      onChange={(e) => setQtyScrapped(e.target.value)}
                      className="px-2 py-1 text-xs border rounded"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Finished Product Batch # (optional)"
                    value={batchNumber}
                    onChange={(e) => setBatchNumber(e.target.value)}
                    className="w-full px-2 py-1 text-xs border rounded"
                  />
                  <button type="submit" className="w-full py-1.5 bg-gray-900 text-white text-xs font-medium rounded">
                    + Add Yield Line
                  </button>
                </form>
              )}
            </div>
          ) : (
            <div className="p-8 border border-dashed rounded text-center text-sm text-gray-400">
              Select a finished goods receipt document to inspect or post.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

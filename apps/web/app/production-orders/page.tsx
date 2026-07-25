'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../src/lib/api';

export default function ProductionOrdersPage() {
  const [orders, setOrders] = useState<Record<string, unknown>[]>([]);
  const [boms, setBoms] = useState<Record<string, unknown>[]>([]);
  const [components, setComponents] = useState<Record<string, unknown>[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Record<string, unknown> | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form states
  const [bomId, setBomId] = useState('');
  const [componentId, setComponentId] = useState('');
  const [qtyPlanned, setQtyPlanned] = useState('10');

  const fetchData = useCallback(async () => {
    try {
      const [orderData, bomData, compData] = await Promise.all([
        api.getProductionOrders(),
        api.getBoms(),
        api.getComponents(),
      ]);
      setOrders(orderData);
      setBoms(bomData);
      setComponents(compData as unknown as Record<string, unknown>[]);
    } catch (err: unknown) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSelectBom = (selectedBomId: string) => {
    setBomId(selectedBomId);
    const matchedBom = boms.find((b) => b.id === selectedBomId);
    if (matchedBom && matchedBom.componentId) {
      setComponentId(String(matchedBom.componentId));
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createProductionOrder({
        bomId,
        componentId,
        quantityPlanned: parseInt(qtyPlanned, 10),
      });
      setIsCreating(false);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create Production Order');
    }
  };

  const handleAction = async (orderId: string, actionName: 'release' | 'start' | 'complete' | 'close' | 'cancel') => {
    try {
      if (actionName === 'release') await api.releaseProductionOrder(orderId);
      if (actionName === 'start') await api.startProductionOrder(orderId);
      if (actionName === 'complete') await api.completeProductionOrder(orderId);
      if (actionName === 'close') await api.closeProductionOrder(orderId);
      if (actionName === 'cancel') await api.cancelProductionOrder(orderId);

      fetchData();
      if (selectedOrder?.id === orderId) {
        const updated = await api.getProductionOrder(orderId);
        setSelectedOrder(updated);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : `Failed to ${actionName} production order`);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Production Orders</h1>
          <p className="text-sm text-gray-500">Plan, release, start, and complete electronics assembly runs.</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
        >
          {isCreating ? 'Cancel' : '+ New Production Order'}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="p-4 border rounded bg-gray-50 space-y-4 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">Create Production Order</h2>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Select BOM *</label>
            <select
              required
              value={bomId}
              onChange={(e) => handleSelectBom(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white"
            >
              <option value="">-- Choose Released BOM --</option>
              {boms.map((b) => {
                const comp = components.find((c) => c.id === b.componentId);
                return (
                  <option key={String(b.id)} value={String(b.id)}>
                    {String(comp?.sku ?? b.componentId)} (Rev {String(b.revision)}) - [{String(b.status)}]
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Target Finished Assembly *</label>
            <select
              required
              value={componentId}
              onChange={(e) => setComponentId(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white"
            >
              <option value="">-- Select Product Component --</option>
              {components.map((c) => (
                <option key={String(c.id)} value={String(c.id)}>{String(c.sku)} - {String(c.name)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Planned Production Quantity *</label>
            <input
              type="number"
              min="1"
              required
              value={qtyPlanned}
              onChange={(e) => setQtyPlanned(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded"
            />
          </div>
          <button type="submit" className="px-4 py-2 bg-black text-white text-xs font-semibold rounded">
            Generate Production Order
          </button>
        </form>
      )}

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-7">
          <div className="border rounded overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-100 uppercase text-gray-600 border-b">
                <tr>
                  <th className="p-3">MO Number</th>
                  <th className="p-3">Product SKU</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Planned</th>
                  <th className="p-3">Completed</th>
                  <th className="p-3">Scrapped</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {orders.map((o) => {
                  const comp = components.find((c) => c.id === o.componentId);
                  return (
                    <tr
                      key={String(o.id)}
                      onClick={() => setSelectedOrder(o)}
                      className={`cursor-pointer hover:bg-gray-50 ${selectedOrder?.id === o.id ? 'bg-blue-50' : ''}`}
                    >
                      <td className="p-3 font-mono font-bold text-gray-900">{String(o.productionNumber)}</td>
                      <td className="p-3 font-mono text-gray-700">{String(comp?.sku ?? o.componentId)}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          o.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' :
                          o.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                          o.status === 'RELEASED' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {String(o.status)}
                        </span>
                      </td>
                      <td className="p-3 font-mono">{String(o.quantityPlanned)}</td>
                      <td className="p-3 font-mono text-green-700 font-bold">{String(o.quantityCompleted)}</td>
                      <td className="p-3 font-mono text-red-600">{String(o.quantityScrapped)}</td>
                    </tr>
                  );
                })}
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-gray-500">No production orders found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col-span-5">
          {selectedOrder ? (
            <div className="border rounded p-4 space-y-4 bg-white">
              <div className="flex justify-between items-start border-b pb-3">
                <div>
                  <h3 className="font-mono font-bold text-lg">{String(selectedOrder.productionNumber)}</h3>
                  <p className="text-xs text-gray-500">Status: {String(selectedOrder.status)}</p>
                </div>
                <div className="flex flex-col gap-1">
                  {selectedOrder.status === 'DRAFT' && (
                    <button
                      onClick={() => handleAction(String(selectedOrder.id), 'release')}
                      className="px-3 py-1 bg-yellow-600 text-white text-xs font-bold rounded"
                    >
                      Release Order
                    </button>
                  )}
                  {(selectedOrder.status === 'RELEASED' || selectedOrder.status === 'MATERIAL_ALLOCATED') && (
                    <button
                      onClick={() => handleAction(String(selectedOrder.id), 'start')}
                      className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded"
                    >
                      Start Run
                    </button>
                  )}
                  {selectedOrder.status === 'IN_PROGRESS' && (
                    <button
                      onClick={() => handleAction(String(selectedOrder.id), 'complete')}
                      className="px-3 py-1 bg-green-600 text-white text-xs font-bold rounded"
                    >
                      Complete Run
                    </button>
                  )}
                  {selectedOrder.status === 'COMPLETED' && (
                    <button
                      onClick={() => handleAction(String(selectedOrder.id), 'close')}
                      className="px-3 py-1 bg-gray-800 text-white text-xs font-bold rounded"
                    >
                      Close Order
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b">
                  <span className="text-gray-500">Product:</span>
                  <span className="font-mono font-bold">
                    {String(components.find((c) => c.id === selectedOrder.componentId)?.sku ?? selectedOrder.componentId)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-gray-500">Planned Yield:</span>
                  <span className="font-mono font-bold">{String(selectedOrder.quantityPlanned)} pcs</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-gray-500">Completed Yield:</span>
                  <span className="font-mono font-bold text-green-700">{String(selectedOrder.quantityCompleted)} pcs</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-gray-500">Scrapped Yield:</span>
                  <span className="font-mono font-bold text-red-600">{String(selectedOrder.quantityScrapped)} pcs</span>
                </div>
              </div>

              {/* Progress Bar */}
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Run Progress</span>
                  <span>
                    {Math.round((Number(selectedOrder.quantityCompleted) / Number(selectedOrder.quantityPlanned)) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{
                      width: `${Math.min(
                        100,
                        (Number(selectedOrder.quantityCompleted) / Number(selectedOrder.quantityPlanned)) * 100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 border border-dashed rounded text-center text-sm text-gray-400">
              Select a production order to inspect details and perform state transitions.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

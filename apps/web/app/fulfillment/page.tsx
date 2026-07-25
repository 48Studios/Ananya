'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../src/lib/api';

export default function FulfillmentPage() {
  const [fulfillmentRequests, setFulfillmentRequests] = useState<Record<string, unknown>[]>([]);
  const [components, setComponents] = useState<Record<string, unknown>[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<Record<string, unknown> | null>(null);

  // Shipping form
  const [carrierName, setCarrierName] = useState('FedEx Express');
  const [trackingNumber, setTrackingNumber] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [fData, compData] = await Promise.all([
        api.getFulfillmentRequests(),
        api.getComponents(),
      ]);
      setFulfillmentRequests(fData);
      setComponents(compData as unknown as Record<string, unknown>[]);
    } catch (err: unknown) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAction = async (
    reqId: string,
    action: 'accept' | 'pick' | 'pack' | 'ship' | 'complete' | 'cancel',
  ) => {
    try {
      if (action === 'accept') await api.acceptFulfillmentRequest(reqId);
      if (action === 'pick') await api.startPickingFulfillmentRequest(reqId);
      if (action === 'pack') await api.packFulfillmentRequest(reqId);
      if (action === 'ship') {
        if (!trackingNumber) {
          alert('Please enter a tracking number for shipping.');
          return;
        }
        await api.shipFulfillmentRequest(reqId, { carrierName, trackingNumber });
      }
      if (action === 'complete') {
        await api.completeFulfillmentRequest(reqId);
        alert('Fulfillment Completed! Inventory Issue transaction created & Sales Order lines updated.');
      }
      if (action === 'cancel') await api.cancelFulfillmentRequest(reqId);

      fetchData();
      if (selectedRequest?.id === reqId) {
        const updated = await api.getFulfillmentRequest(reqId);
        setSelectedRequest(updated);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : `Failed to ${action} fulfillment request`);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Order Fulfillment Operations</h1>
          <p className="text-sm text-gray-500">Pick, pack, ship, and deliver commercial order fulfillment requests from Warehouse storage.</p>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-6">
          <div className="border rounded overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-100 uppercase text-gray-600 border-b">
                <tr>
                  <th className="p-3">Request #</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Carrier</th>
                  <th className="p-3">Tracking #</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {fulfillmentRequests.map((ful) => (
                  <tr
                    key={String(ful.id)}
                    onClick={() => setSelectedRequest(ful)}
                    className={`cursor-pointer hover:bg-gray-50 ${selectedRequest?.id === ful.id ? 'bg-blue-50' : ''}`}
                  >
                    <td className="p-3 font-mono font-bold text-gray-900">{String(ful.requestNumber)}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        ful.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                        ful.status === 'SHIPPED' ? 'bg-blue-100 text-blue-800' :
                        ful.status === 'PACKED' ? 'bg-purple-100 text-purple-800' :
                        ful.status === 'PICKING' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {String(ful.status)}
                      </span>
                    </td>
                    <td className="p-3 font-semibold text-gray-800">{String(ful.carrierName || '—')}</td>
                    <td className="p-3 font-mono text-gray-600">{String(ful.trackingNumber || '—')}</td>
                  </tr>
                ))}
                {fulfillmentRequests.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-gray-500">No fulfillment requests in process.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col-span-6">
          {selectedRequest ? (
            <div className="border rounded p-4 space-y-4 bg-white">
              <div className="flex justify-between items-start border-b pb-3">
                <div>
                  <h3 className="font-mono font-bold text-lg">{String(selectedRequest.requestNumber)}</h3>
                  <p className="text-xs text-gray-500">Status: {String(selectedRequest.status)}</p>
                </div>
                <div className="flex gap-1">
                  {selectedRequest.status === 'PENDING' && (
                    <button
                      onClick={() => handleAction(String(selectedRequest.id), 'accept')}
                      className="px-3 py-1 bg-yellow-600 text-white text-xs font-bold rounded"
                    >
                      Accept Request
                    </button>
                  )}
                  {selectedRequest.status === 'ACCEPTED' && (
                    <button
                      onClick={() => handleAction(String(selectedRequest.id), 'pick')}
                      className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded"
                    >
                      Start Picking
                    </button>
                  )}
                  {selectedRequest.status === 'PICKING' && (
                    <button
                      onClick={() => handleAction(String(selectedRequest.id), 'pack')}
                      className="px-3 py-1 bg-purple-600 text-white text-xs font-bold rounded"
                    >
                      Pack Items
                    </button>
                  )}
                  {selectedRequest.status === 'SHIPPED' && (
                    <button
                      onClick={() => handleAction(String(selectedRequest.id), 'complete')}
                      className="px-3 py-1 bg-green-600 text-white text-xs font-bold rounded shadow"
                    >
                      Confirm Delivery
                    </button>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase text-gray-600 mb-2">Requested Component Line Items</h4>
                <div className="space-y-2">
                  {((selectedRequest.lines as Record<string, unknown>[]) ?? []).map((l) => {
                    const comp = components.find((c) => c.id === l.componentId);
                    return (
                      <div key={String(l.id)} className="p-2.5 border rounded text-xs flex justify-between bg-gray-50">
                        <div>
                          <p className="font-bold">{String(comp?.sku ?? l.componentId)}</p>
                          <p className="text-gray-500">Requested Qty: {String(l.requestedQuantity)}</p>
                        </div>
                        <div className="text-right font-mono font-bold text-gray-900">
                          Fulfilled: {String(l.fulfilledQuantity || 0)} / {String(l.requestedQuantity)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {selectedRequest.status === 'PACKED' && (
                <div className="border-t pt-3 space-y-2">
                  <h4 className="text-xs font-bold uppercase text-gray-600">Dispatch Package & Assign Carrier</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Carrier Name *"
                      required
                      value={carrierName}
                      onChange={(e) => setCarrierName(e.target.value)}
                      className="px-2 py-1 text-xs border rounded"
                    />
                    <input
                      type="text"
                      placeholder="Tracking Number *"
                      required
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                      className="px-2 py-1 text-xs border rounded font-mono font-bold"
                    />
                  </div>
                  <button
                    onClick={() => handleAction(String(selectedRequest.id), 'ship')}
                    className="w-full py-1.5 bg-blue-600 text-white text-xs font-bold rounded shadow"
                  >
                    Ship Package & Notify Customer
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 border border-dashed rounded text-center text-sm text-gray-400">
              Select a fulfillment request to progress picking, packing, shipping, or delivery confirmation.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

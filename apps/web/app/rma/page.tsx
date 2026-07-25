'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../src/lib/api';

export default function RmaPage() {
  const [rmaRequests, setRmaRequests] = useState<Record<string, unknown>[]>([]);
  const [customers, setCustomers] = useState<Record<string, unknown>[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [customerId, setCustomerId] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [reason, setReason] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [rData, cData] = await Promise.all([
        api.getRmaRequests(),
        api.getCustomers(),
      ]);
      setRmaRequests(rData);
      setCustomers(cData);
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
      await api.createRmaRequest({
        customerId,
        itemDescription,
        serialNumber: serialNumber || undefined,
        reason,
      });
      setIsCreating(false);
      setItemDescription('');
      setReason('');
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create RMA request');
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await api.approveRmaRequest(id);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to approve RMA');
    }
  };

  const handleReceive = async (id: string) => {
    try {
      await api.receiveRmaItem(id);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to mark item received');
    }
  };

  const handleInspect = async (id: string) => {
    const disp = prompt('Enter disposition (REPAIR, REPLACE, SCRAP, RETURN):', 'REPAIR');
    if (!disp) return;
    try {
      await api.inspectRmaItem(id, { disposition: disp });
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to record inspection');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">RMA Requests & Returns Inspection</h1>
          <p className="text-sm text-gray-500">Return Merchandise Authorization processing, warehouse item receipt, and technical dispositioning.</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
        >
          {isCreating ? 'Cancel' : '+ Authorize New RMA'}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="p-4 border rounded bg-gray-50 space-y-4 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">Authorize Return Request</h2>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Customer *</label>
            <select
              required
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white font-semibold"
            >
              <option value="">-- Select Customer --</option>
              {customers.map((c) => (
                <option key={String(c.id)} value={String(c.id)}>{String(c.name)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Item Description *</label>
            <input
              type="text"
              required
              placeholder="e.g. Industrial Controller Unit Mod-B"
              value={itemDescription}
              onChange={(e) => setItemDescription(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white font-bold"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Serial Number</label>
            <input
              type="text"
              placeholder="SN-77391"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Reason for Return *</label>
            <textarea
              rows={2}
              required
              placeholder="Defective HDMI output port..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white"
            />
          </div>
          <button type="submit" className="px-4 py-2 bg-black text-white text-xs font-semibold rounded">
            Authorize RMA Request
          </button>
        </form>
      )}

      <div className="border rounded overflow-hidden bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-100 uppercase text-gray-600 border-b">
            <tr>
              <th className="p-3">RMA #</th>
              <th className="p-3">Item Description</th>
              <th className="p-3">Serial #</th>
              <th className="p-3">Reason</th>
              <th className="p-3">Disposition</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rmaRequests.map((r) => (
              <tr key={String(r.id)} className="hover:bg-gray-50">
                <td className="p-3 font-mono font-bold text-gray-900">{String(r.rmaNumber)}</td>
                <td className="p-3 font-semibold text-gray-900">{String(r.itemDescription)}</td>
                <td className="p-3 font-mono text-gray-700">{String(r.serialNumber || '—')}</td>
                <td className="p-3 text-gray-700">{String(r.reason)}</td>
                <td className="p-3 font-mono font-bold text-purple-700">{String(r.disposition || 'Pending Inspection')}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    r.status === 'CLOSED' || r.status === 'PROCESSED' ? 'bg-green-100 text-green-800' :
                    r.status === 'INSPECTED' || r.status === 'RECEIVED' ? 'bg-blue-100 text-blue-800' :
                    r.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {String(r.status)}
                  </span>
                </td>
                <td className="p-3 text-right space-x-1">
                  {r.status === 'REQUESTED' && (
                    <button
                      onClick={() => handleApprove(String(r.id))}
                      className="px-2 py-1 bg-green-600 text-white text-[10px] font-bold rounded shadow hover:bg-green-700"
                    >
                      Approve
                    </button>
                  )}
                  {r.status === 'APPROVED' && (
                    <button
                      onClick={() => handleReceive(String(r.id))}
                      className="px-2 py-1 bg-blue-600 text-white text-[10px] font-bold rounded shadow hover:bg-blue-700"
                    >
                      Receive Item
                    </button>
                  )}
                  {r.status === 'RECEIVED' && (
                    <button
                      onClick={() => handleInspect(String(r.id))}
                      className="px-2 py-1 bg-purple-600 text-white text-[10px] font-bold rounded shadow hover:bg-purple-700"
                    >
                      Inspect Item
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rmaRequests.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-500">No RMA requests found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../src/lib/api';

export default function WarrantyPage() {
  const [claims, setClaims] = useState<Record<string, unknown>[]>([]);
  const [customers, setCustomers] = useState<Record<string, unknown>[]>([]);
  const [components, setComponents] = useState<Record<string, unknown>[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [customerId, setCustomerId] = useState('');
  const [productId, setProductId] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [claimReason, setClaimReason] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [wData, cData, compData] = await Promise.all([
        api.getWarrantyClaims(),
        api.getCustomers(),
        api.getComponents(),
      ]);
      setClaims(wData);
      setCustomers(cData);
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
      await api.createWarrantyClaim({
        customerId,
        productId,
        serialNumber: serialNumber || undefined,
        purchaseDate,
        expiryDate,
        claimReason,
      });
      setIsCreating(false);
      setClaimReason('');
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to submit warranty claim');
    }
  };

  const handleApprove = async (id: string) => {
    const notes = prompt('Enter approval notes (optional):', 'Approved under standard product warranty terms.');
    try {
      await api.approveWarrantyClaim(id, notes || undefined);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to approve claim');
    }
  };

  const handleReject = async (id: string) => {
    const notes = prompt('Enter rejection reason (optional):', 'Product damage caused by misuse.');
    try {
      await api.rejectWarrantyClaim(id, notes || undefined);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to reject claim');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Warranty Claims & Entitlement Approvals</h1>
          <p className="text-sm text-gray-500">Customer product warranty adjudication, entitlement validation, and claim decisions.</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
        >
          {isCreating ? 'Cancel' : '+ Submit Warranty Claim'}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="p-4 border rounded bg-gray-50 space-y-4 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">Submit Warranty Entitlement Claim</h2>
          <div className="grid grid-cols-2 gap-3">
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
              <label className="block text-xs font-medium text-gray-700 mb-1">Product Component *</label>
              <select
                required
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-semibold"
              >
                <option value="">-- Select Product --</option>
                {components.map((comp) => (
                  <option key={String(comp.id)} value={String(comp.id)}>{String(comp.name)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Serial Number</label>
              <input
                type="text"
                placeholder="SN-88241"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Purchase Date *</label>
              <input
                type="date"
                required
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Warranty Expiry *</label>
              <input
                type="date"
                required
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Claim Reason *</label>
            <textarea
              rows={2}
              required
              placeholder="PSU failure within valid 2-year warranty window..."
              value={claimReason}
              onChange={(e) => setClaimReason(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white"
            />
          </div>
          <button type="submit" className="px-4 py-2 bg-black text-white text-xs font-semibold rounded">
            Submit Claim
          </button>
        </form>
      )}

      <div className="border rounded overflow-hidden bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-100 uppercase text-gray-600 border-b">
            <tr>
              <th className="p-3">Warranty #</th>
              <th className="p-3">Purchase Date</th>
              <th className="p-3">Expiry Date</th>
              <th className="p-3">Claim Reason</th>
              <th className="p-3">Decision</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {claims.map((c) => (
              <tr key={String(c.id)} className="hover:bg-gray-50">
                <td className="p-3 font-mono font-bold text-gray-900">{String(c.warrantyNumber)}</td>
                <td className="p-3 font-mono text-gray-600">{new Date(String(c.purchaseDate)).toLocaleDateString()}</td>
                <td className="p-3 font-mono text-gray-600">{new Date(String(c.expiryDate)).toLocaleDateString()}</td>
                <td className="p-3 text-gray-700">{String(c.claimReason)}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    c.decision === 'APPROVED' ? 'bg-green-100 text-green-800' :
                    c.decision === 'REJECTED' ? 'bg-red-100 text-red-800' :
                    c.decision === 'EXPIRED' ? 'bg-gray-200 text-gray-700' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {String(c.decision)}
                  </span>
                </td>
                <td className="p-3 text-right space-x-1">
                  {(c.decision === 'SUBMITTED' || c.decision === 'UNDER_REVIEW') && (
                    <>
                      <button
                        onClick={() => handleApprove(String(c.id))}
                        className="px-2 py-1 bg-green-600 text-white text-[10px] font-bold rounded shadow hover:bg-green-700"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleReject(String(c.id))}
                        className="px-2 py-1 bg-red-100 text-red-700 text-[10px] font-bold rounded hover:bg-red-200"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {claims.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-500">No warranty claims logged.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

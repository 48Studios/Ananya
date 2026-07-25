'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../src/lib/api';

export default function CustomerReturnsPage() {
  const [returns, setReturns] = useState<Record<string, unknown>[]>([]);
  const [customers, setCustomers] = useState<Record<string, unknown>[]>([]);
  const [salesOrders, setSalesOrders] = useState<Record<string, unknown>[]>([]);
  const [components, setComponents] = useState<Record<string, unknown>[]>([]);
  const [selectedReturn, setSelectedReturn] = useState<Record<string, unknown> | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form states
  const [customerId, setCustomerId] = useState('');
  const [salesOrderId, setSalesOrderId] = useState('');
  const [notes, setNotes] = useState('');

  // Return Line form
  const [salesOrderLineId, setSalesOrderLineId] = useState('');
  const [componentId, setComponentId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('DEFECTIVE');

  // Inspection disposition form
  const [dispositions, setDispositions] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    try {
      const [rData, cData, soData, compData] = await Promise.all([
        api.getCustomerReturns(),
        api.getCustomers(),
        api.getSalesOrders(),
        api.getComponents(),
      ]);
      setReturns(rData);
      setCustomers(cData);
      setSalesOrders(soData);
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
      await api.createCustomerReturn({
        customerId,
        salesOrderId,
        notes: notes || undefined,
      });
      setIsCreating(false);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create return document');
    }
  };

  const handleAddLine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReturn) return;
    try {
      await api.addCustomerReturnLine(String(selectedReturn.id), {
        salesOrderLineId,
        componentId,
        quantity: parseFloat(quantity),
        reason,
      });
      const updated = await api.getCustomerReturn(String(selectedReturn.id));
      setSelectedReturn(updated);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to add return line');
    }
  };

  const handleAction = async (
    returnId: string,
    action: 'approve' | 'receive' | 'inspect' | 'restock' | 'reject' | 'close',
  ) => {
    try {
      if (action === 'approve') await api.approveCustomerReturn(returnId);
      if (action === 'receive') await api.receiveCustomerReturn(returnId);
      if (action === 'inspect') await api.inspectCustomerReturn(returnId, dispositions);
      if (action === 'restock') {
        await api.restockCustomerReturn(returnId);
        alert('Return Restocked! Inventory Adjustment transactions issued for RESTOCK disposition items.');
      }
      if (action === 'reject') await api.rejectCustomerReturn(returnId);
      if (action === 'close') await api.closeCustomerReturn(returnId);

      fetchData();
      if (selectedReturn?.id === returnId) {
        const updated = await api.getCustomerReturn(returnId);
        setSelectedReturn(updated);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : `Failed to ${action} customer return`);
    }
  };

  const currentOrder = salesOrders.find((s) => s.id === salesOrderId);
  const currentOrderLines = (currentOrder?.lines as Record<string, unknown>[]) || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Customer Returns (RMA)</h1>
          <p className="text-sm text-gray-500">Manage customer return authorizations, warehouse inspections, and inventory restocking rules.</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
        >
          {isCreating ? 'Cancel' : '+ New Return Request'}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="p-4 border rounded bg-gray-50 space-y-4 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">Create Return Authorization (RMA)</h2>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Select Customer Account *</label>
            <select
              required
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white"
            >
              <option value="">-- Choose Customer --</option>
              {customers.map((c) => (
                <option key={String(c.id)} value={String(c.id)}>{String(c.customerNumber)} - {String(c.name)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Original Commercial Sales Order *</label>
            <select
              required
              value={salesOrderId}
              onChange={(e) => setSalesOrderId(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white"
            >
              <option value="">-- Choose Sales Order --</option>
              {salesOrders.filter((s) => !customerId || s.customerId === customerId).map((so) => (
                <option key={String(so.id)} value={String(so.id)}>{String(so.orderNumber)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Return Reason / Notes</label>
            <input
              type="text"
              placeholder="e.g. Returned due to shipping damage"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white"
            />
          </div>
          <button type="submit" className="px-4 py-2 bg-black text-white text-xs font-semibold rounded">
            Generate RMA Document
          </button>
        </form>
      )}

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-6">
          <div className="border rounded overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-100 uppercase text-gray-600 border-b">
                <tr>
                  <th className="p-3">RMA #</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {returns.map((ret) => {
                  const cust = customers.find((c) => c.id === ret.customerId);
                  return (
                    <tr
                      key={String(ret.id)}
                      onClick={() => setSelectedReturn(ret)}
                      className={`cursor-pointer hover:bg-gray-50 ${selectedReturn?.id === ret.id ? 'bg-blue-50' : ''}`}
                    >
                      <td className="p-3 font-mono font-bold text-gray-900">
                        <Link href={`/customer-returns/${ret.id}`} className="hover:underline text-blue-600">
                          {String(ret.returnNumber)}
                        </Link>
                      </td>
                      <td className="p-3 font-semibold text-gray-800">{String(cust?.name ?? ret.customerId)}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          ret.status === 'RESTOCKED' ? 'bg-green-100 text-green-800' :
                          ret.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                          ret.status === 'INSPECTED' ? 'bg-purple-100 text-purple-800' :
                          ret.status === 'RECEIVED' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {String(ret.status)}
                        </span>
                      </td>
                      <td className="p-3 text-gray-600">{new Date(String(ret.createdAt)).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
                {returns.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-gray-500">No customer return authorizations found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col-span-6">
          {selectedReturn ? (
            <div className="border rounded p-4 space-y-4 bg-white">
              <div className="flex justify-between items-start border-b pb-3">
                <div>
                  <h3 className="font-mono font-bold text-lg">{String(selectedReturn.returnNumber)}</h3>
                  <p className="text-xs text-gray-500">Status: {String(selectedReturn.status)}</p>
                </div>
                <div className="flex gap-1">
                  {selectedReturn.status === 'DRAFT' && (
                    <button
                      onClick={() => handleAction(String(selectedReturn.id), 'approve')}
                      className="px-3 py-1 bg-yellow-600 text-white text-xs font-bold rounded"
                    >
                      Approve Return
                    </button>
                  )}
                  {selectedReturn.status === 'APPROVED' && (
                    <button
                      onClick={() => handleAction(String(selectedReturn.id), 'receive')}
                      className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded"
                    >
                      Receive Package
                    </button>
                  )}
                  {selectedReturn.status === 'INSPECTED' && (
                    <button
                      onClick={() => handleAction(String(selectedReturn.id), 'restock')}
                      className="px-3 py-1 bg-green-600 text-white text-xs font-bold rounded shadow"
                    >
                      Restock Items
                    </button>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase text-gray-600 mb-2">Returned Component Items</h4>
                <div className="space-y-2">
                  {((selectedReturn.lines as Record<string, unknown>[]) ?? []).map((l) => {
                    const comp = components.find((c) => c.id === l.componentId);
                    return (
                      <div key={String(l.id)} className="p-2.5 border rounded text-xs flex justify-between bg-gray-50">
                        <div>
                          <p className="font-bold">{String(comp?.sku ?? l.componentId)}</p>
                          <p className="text-gray-500">Reason: {String(l.reason)} | Qty: {String(l.quantity)}</p>
                        </div>
                        <div className="text-right">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-200 text-gray-800 font-mono">
                            Disp: {String(l.disposition || 'PENDING')}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {((selectedReturn.lines as Record<string, unknown>[]) ?? []).length === 0 && (
                    <div className="text-xs text-gray-400 py-2">No return line items added.</div>
                  )}
                </div>
              </div>

              {selectedReturn.status === 'DRAFT' && (
                <form onSubmit={handleAddLine} className="border-t pt-3 space-y-2">
                  <h4 className="text-xs font-bold uppercase text-gray-600">Add Item to Return</h4>
                  <select
                    required
                    value={salesOrderLineId}
                    onChange={(e) => {
                      setSalesOrderLineId(e.target.value);
                      const selectedLine = currentOrderLines.find((l) => l.id === e.target.value);
                      if (selectedLine) setComponentId(String(selectedLine.componentId));
                    }}
                    className="w-full px-2 py-1 text-xs border rounded bg-white"
                  >
                    <option value="">-- Select Sales Order Line --</option>
                    {currentOrderLines.map((l) => {
                      const comp = components.find((c) => c.id === l.componentId);
                      return (
                        <option key={String(l.id)} value={String(l.id)}>
                          {String(comp?.sku ?? l.componentId)} (Shipped: {String(l.fulfilledQuantity)})
                        </option>
                      );
                    })}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      placeholder="Return Qty *"
                      required
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="px-2 py-1 text-xs border rounded font-bold"
                    />
                    <select
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="px-2 py-1 text-xs border rounded bg-white font-semibold"
                    >
                      <option value="DEFECTIVE">Defective</option>
                      <option value="WRONG_ITEM">Wrong Item</option>
                      <option value="DAMAGED_IN_TRANSIT">Damaged in Transit</option>
                      <option value="EXCESS_ORDER">Excess Order</option>
                    </select>
                  </div>
                  <button type="submit" className="w-full py-1.5 bg-gray-900 text-white text-xs font-medium rounded">
                    + Add Item to RMA
                  </button>
                </form>
              )}

              {selectedReturn.status === 'RECEIVED' && (
                <div className="border-t pt-3 space-y-2">
                  <h4 className="text-xs font-bold uppercase text-gray-600">Inspection & Disposition Decision</h4>
                  {((selectedReturn.lines as Record<string, unknown>[]) ?? []).map((l) => (
                    <div key={String(l.id)} className="flex justify-between items-center text-xs p-2 bg-gray-50 border rounded">
                      <span className="font-bold">{String(l.componentId)} (Qty: {String(l.quantity)})</span>
                      <select
                        value={dispositions[String(l.id)] || 'RESTOCK'}
                        onChange={(e) => setDispositions({ ...dispositions, [String(l.id)]: e.target.value })}
                        className="px-2 py-1 text-xs border rounded bg-white"
                      >
                        <option value="RESTOCK">Restock into Inventory</option>
                        <option value="SCRAP">Scrap / Write-off</option>
                        <option value="VENDOR_RETURN">Return to Vendor</option>
                      </select>
                    </div>
                  ))}
                  <button
                    onClick={() => handleAction(String(selectedReturn.id), 'inspect')}
                    className="w-full py-1.5 bg-purple-600 text-white text-xs font-bold rounded shadow"
                  >
                    Submit Quality Inspection Report
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 border border-dashed rounded text-center text-sm text-gray-400">
              Select a customer return document to manage line items or process inspection & restocking.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../src/lib/api';

export default function SalesOrdersPage() {
  const [salesOrders, setSalesOrders] = useState<Record<string, unknown>[]>([]);
  const [customers, setCustomers] = useState<Record<string, unknown>[]>([]);
  const [components, setComponents] = useState<Record<string, unknown>[]>([]);
  const [warehouses, setWarehouses] = useState<Record<string, unknown>[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Record<string, unknown> | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form states
  const [customerId, setCustomerId] = useState('');
  const [requiredDate, setRequiredDate] = useState('');

  // Line form
  const [componentId, setComponentId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('10.00');
  const [discount, setDiscount] = useState('0');
  const [tax, setTax] = useState('0');

  // Fulfillment trigger form
  const [targetWarehouseId, setTargetWarehouseId] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [soData, cData, compData, whData] = await Promise.all([
        api.getSalesOrders(),
        api.getCustomers(),
        api.getComponents(),
        api.getWarehouses(),
      ]);
      setSalesOrders(soData);
      setCustomers(cData);
      setComponents(compData as unknown as Record<string, unknown>[]);
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
      await api.createSalesOrder({
        customerId,
        requiredDate: requiredDate || undefined,
      });
      setIsCreating(false);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create sales order');
    }
  };

  const handleAddLine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    try {
      await api.addSalesOrderLine(String(selectedOrder.id), {
        componentId,
        quantity: parseFloat(quantity),
        unitPrice: parseFloat(unitPrice),
        discount: parseFloat(discount),
        tax: parseFloat(tax),
      });
      const updated = await api.getSalesOrder(String(selectedOrder.id));
      setSelectedOrder(updated);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to add order line');
    }
  };

  const handleAction = async (orderId: string, action: 'approve' | 'release' | 'cancel') => {
    try {
      if (action === 'approve') await api.approveSalesOrder(orderId);
      if (action === 'release') await api.releaseSalesOrder(orderId);
      if (action === 'cancel') await api.cancelSalesOrder(orderId);

      fetchData();
      if (selectedOrder?.id === orderId) {
        const updated = await api.getSalesOrder(orderId);
        setSelectedOrder(updated);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : `Failed to ${action} sales order`);
    }
  };

  const handleGenerateFulfillment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || !targetWarehouseId) return;
    try {
      const ful = await api.createFulfillmentRequest({
        salesOrderId: String(selectedOrder.id),
        warehouseId: targetWarehouseId,
      });
      alert(`Warehouse Fulfillment Request Generated! Request #: ${String(ful.requestNumber)}`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to generate fulfillment request');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Commercial Sales Orders</h1>
          <p className="text-sm text-gray-500">Commercial buyer contracts, line items, order approval, and Warehouse fulfillment dispatch.</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
        >
          {isCreating ? 'Cancel' : '+ New Sales Order'}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="p-4 border rounded bg-gray-50 space-y-4 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">Create Commercial Sales Order</h2>
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
            <label className="block text-xs font-medium text-gray-700 mb-1">Required Delivery Date</label>
            <input
              type="date"
              value={requiredDate}
              onChange={(e) => setRequiredDate(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white"
            />
          </div>
          <button type="submit" className="px-4 py-2 bg-black text-white text-xs font-semibold rounded">
            Generate Sales Order
          </button>
        </form>
      )}

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-6">
          <div className="border rounded overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-100 uppercase text-gray-600 border-b">
                <tr>
                  <th className="p-3">Order #</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {salesOrders.map((so) => {
                  const cust = customers.find((c) => c.id === so.customerId);
                  return (
                    <tr
                      key={String(so.id)}
                      onClick={() => setSelectedOrder(so)}
                      className={`cursor-pointer hover:bg-gray-50 ${selectedOrder?.id === so.id ? 'bg-blue-50' : ''}`}
                    >
                      <td className="p-3 font-mono font-bold text-gray-900">
                        <Link href={`/sales-orders/${so.id}`} className="hover:underline text-blue-600">
                          {String(so.orderNumber)}
                        </Link>
                      </td>
                      <td className="p-3 font-semibold text-gray-800">{String(cust?.name ?? so.customerId)}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          so.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                          so.status === 'RELEASED' ? 'bg-blue-100 text-blue-800' :
                          so.status === 'APPROVED' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {String(so.status)}
                        </span>
                      </td>
                      <td className="p-3 text-gray-600">{new Date(String(so.orderDate)).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
                {salesOrders.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-gray-500">No commercial sales orders found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col-span-6">
          {selectedOrder ? (
            <div className="border rounded p-4 space-y-4 bg-white">
              <div className="flex justify-between items-start border-b pb-3">
                <div>
                  <h3 className="font-mono font-bold text-lg">{String(selectedOrder.orderNumber)}</h3>
                  <p className="text-xs text-gray-500">Status: {String(selectedOrder.status)}</p>
                </div>
                <div className="flex gap-1">
                  {selectedOrder.status === 'DRAFT' && (
                    <button
                      onClick={() => handleAction(String(selectedOrder.id), 'approve')}
                      className="px-3 py-1 bg-yellow-600 text-white text-xs font-bold rounded"
                    >
                      Approve Order
                    </button>
                  )}
                  {selectedOrder.status === 'APPROVED' && (
                    <button
                      onClick={() => handleAction(String(selectedOrder.id), 'release')}
                      className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded"
                    >
                      Release Order
                    </button>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase text-gray-600 mb-2">Order Items & Fulfillment Status</h4>
                <div className="space-y-2">
                  {((selectedOrder.lines as Record<string, unknown>[]) ?? []).map((l) => {
                    const comp = components.find((c) => c.id === l.componentId);
                    return (
                      <div key={String(l.id)} className="p-2.5 border rounded text-xs flex justify-between bg-gray-50">
                        <div>
                          <p className="font-bold">{String(comp?.sku ?? l.componentId)}</p>
                          <p className="text-gray-500">Qty: {String(l.quantity)} | Price: ${String(l.unitPrice)}</p>
                        </div>
                        <div className="text-right font-mono">
                          <p className="font-bold text-gray-900">${String(l.totalPrice)}</p>
                          <p className="text-[10px] text-gray-500">Fulfilled: {String(l.fulfilledQuantity || 0)} / {String(l.quantity)}</p>
                        </div>
                      </div>
                    );
                  })}
                  {((selectedOrder.lines as Record<string, unknown>[]) ?? []).length === 0 && (
                    <div className="text-xs text-gray-400 py-2">No order lines added yet.</div>
                  )}
                </div>
              </div>

              {selectedOrder.status === 'DRAFT' && (
                <form onSubmit={handleAddLine} className="border-t pt-3 space-y-2">
                  <h4 className="text-xs font-bold uppercase text-gray-600">Add Line Item to Order</h4>
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
                  <div className="grid grid-cols-4 gap-2">
                    <input
                      type="number"
                      placeholder="Qty *"
                      required
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="px-2 py-1 text-xs border rounded font-bold"
                    />
                    <input
                      type="number"
                      placeholder="Unit Price *"
                      required
                      value={unitPrice}
                      onChange={(e) => setUnitPrice(e.target.value)}
                      className="px-2 py-1 text-xs border rounded font-bold"
                    />
                    <input
                      type="number"
                      placeholder="Discount %"
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                      className="px-2 py-1 text-xs border rounded"
                    />
                    <input
                      type="number"
                      placeholder="Tax %"
                      value={tax}
                      onChange={(e) => setTax(e.target.value)}
                      className="px-2 py-1 text-xs border rounded"
                    />
                  </div>
                  <button type="submit" className="w-full py-1.5 bg-gray-900 text-white text-xs font-medium rounded">
                    + Add Item to Sales Order
                  </button>
                </form>
              )}

              {(selectedOrder.status === 'RELEASED' || selectedOrder.status === 'APPROVED') && (
                <form onSubmit={handleGenerateFulfillment} className="border-t pt-3 space-y-2">
                  <h4 className="text-xs font-bold uppercase text-gray-600">Dispatch to Warehouse Fulfillment</h4>
                  <select
                    required
                    value={targetWarehouseId}
                    onChange={(e) => setTargetWarehouseId(e.target.value)}
                    className="w-full px-2 py-1 text-xs border rounded bg-white"
                  >
                    <option value="">-- Select Fulfilling Warehouse Facility --</option>
                    {warehouses.map((w) => (
                      <option key={String(w.id)} value={String(w.id)}>{String(w.code)} - {String(w.name)}</option>
                    ))}
                  </select>
                  <button type="submit" className="w-full py-1.5 bg-blue-600 text-white text-xs font-bold rounded shadow">
                    Generate Warehouse Fulfillment Request
                  </button>
                </form>
              )}
            </div>
          ) : (
            <div className="p-8 border border-dashed rounded text-center text-sm text-gray-400">
              Select a sales order to view line items or generate warehouse fulfillment requests.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

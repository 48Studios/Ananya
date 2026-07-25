'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../src/lib/api';

export default function AccountsReceivablePage() {
  const [receivables, setReceivables] = useState<Record<string, unknown>[]>([]);
  const [customers, setCustomers] = useState<Record<string, unknown>[]>([]);
  const [salesOrders, setSalesOrders] = useState<Record<string, unknown>[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Record<string, unknown> | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [customerId, setCustomerId] = useState('');
  const [salesOrderId, setSalesOrderId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [amount, setAmount] = useState('100.00');

  // Payment application state
  const [paymentAmount, setPaymentAmount] = useState('50.00');

  const fetchData = useCallback(async () => {
    try {
      const [rData, cData, soData] = await Promise.all([
        api.getReceivableInvoices(),
        api.getCustomers(),
        api.getSalesOrders(),
      ]);
      setReceivables(rData);
      setCustomers(cData);
      setSalesOrders(soData);
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
      await api.createReceivableInvoice({
        customerId,
        salesOrderId,
        dueDate,
        amount: parseFloat(amount),
      });
      setIsCreating(false);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create receivable invoice');
    }
  };

  const handleAction = async (invoiceId: string, action: 'post' | 'cancel') => {
    try {
      if (action === 'post') await api.postReceivableInvoice(invoiceId);
      if (action === 'cancel') await api.cancelReceivableInvoice(invoiceId);

      fetchData();
      if (selectedInvoice?.id === invoiceId) {
        const updated = await api.getReceivableInvoice(invoiceId);
        setSelectedInvoice(updated);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : `Failed to ${action} receivable invoice`);
    }
  };

  const handleApplyPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;
    try {
      const p = await api.createPayment({
        paymentType: 'CUSTOMER_PAYMENT',
        paymentMethod: 'WIRE_TRANSFER',
        amount: parseFloat(paymentAmount),
        reference: `AR-INV-${String(selectedInvoice.invoiceNumber)}`,
        targetInvoiceId: String(selectedInvoice.id),
      });
      await api.postPayment(String(p.id), String(selectedInvoice.id));
      alert(`Payment ${String(p.paymentNumber)} applied & posted to invoice balance!`);

      fetchData();
      const updated = await api.getReceivableInvoice(String(selectedInvoice.id));
      setSelectedInvoice(updated);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to apply customer payment');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Accounts Receivable (Customer Invoices)</h1>
          <p className="text-sm text-gray-500">Commercial customer billing originating from Sales Orders, payment tracking, and collection aging.</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
        >
          {isCreating ? 'Cancel' : '+ New Customer Invoice'}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="p-4 border rounded bg-gray-50 space-y-4 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">Create Receivable Invoice</h2>
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
            <label className="block text-xs font-medium text-gray-700 mb-1">Commercial Sales Order Reference *</label>
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Due Date *</label>
              <input
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Invoice Amount ($) *</label>
              <input
                type="number"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-mono font-bold"
              />
            </div>
          </div>
          <button type="submit" className="px-4 py-2 bg-black text-white text-xs font-semibold rounded">
            Generate Receivable Invoice
          </button>
        </form>
      )}

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-6">
          <div className="border rounded overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-100 uppercase text-gray-600 border-b">
                <tr>
                  <th className="p-3">Invoice #</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Open Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {receivables.map((inv) => {
                  const cust = customers.find((c) => c.id === inv.customerId);
                  return (
                    <tr
                      key={String(inv.id)}
                      onClick={() => setSelectedInvoice(inv)}
                      className={`cursor-pointer hover:bg-gray-50 ${selectedInvoice?.id === inv.id ? 'bg-blue-50' : ''}`}
                    >
                      <td className="p-3 font-mono font-bold text-gray-900">{String(inv.invoiceNumber)}</td>
                      <td className="p-3 font-semibold text-gray-800">{String(cust?.name ?? inv.customerId)}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          inv.status === 'PAID' ? 'bg-green-100 text-green-800' :
                          inv.status === 'PARTIALLY_PAID' ? 'bg-yellow-100 text-yellow-800' :
                          inv.status === 'POSTED' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {String(inv.status)}
                        </span>
                      </td>
                      <td className="p-3 font-mono font-bold text-gray-900">${Number(inv.balance).toFixed(2)}</td>
                    </tr>
                  );
                })}
                {receivables.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-gray-500">No accounts receivable customer invoices found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col-span-6">
          {selectedInvoice ? (
            <div className="border rounded p-4 space-y-4 bg-white">
              <div className="flex justify-between items-start border-b pb-3">
                <div>
                  <h3 className="font-mono font-bold text-lg">{String(selectedInvoice.invoiceNumber)}</h3>
                  <p className="text-xs text-gray-500">Status: {String(selectedInvoice.status)}</p>
                </div>
                <div className="flex gap-1">
                  {selectedInvoice.status === 'DRAFT' && (
                    <button
                      onClick={() => handleAction(String(selectedInvoice.id), 'post')}
                      className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded shadow"
                    >
                      Post Invoice
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs bg-gray-50 p-3 border rounded">
                <div>
                  <p className="text-gray-500">Total Invoice Amount:</p>
                  <p className="font-mono font-bold text-sm">${Number(selectedInvoice.amount).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Remaining Balance:</p>
                  <p className="font-mono font-bold text-sm text-green-700">${Number(selectedInvoice.balance).toFixed(2)}</p>
                </div>
              </div>

              {(selectedInvoice.status === 'POSTED' || selectedInvoice.status === 'PARTIALLY_PAID') && Number(selectedInvoice.balance) > 0 && (
                <form onSubmit={handleApplyPayment} className="border-t pt-3 space-y-2">
                  <h4 className="text-xs font-bold uppercase text-gray-600">Apply Customer Cash Payment</h4>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      required
                      placeholder="Payment Amount ($)"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="px-2 py-1 text-xs border rounded font-mono font-bold w-1/2"
                    />
                    <button type="submit" className="w-1/2 py-1 bg-green-600 text-white text-xs font-bold rounded shadow">
                      Record Payment & Settle
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            <div className="p-8 border border-dashed rounded text-center text-sm text-gray-400">
              Select a customer invoice to review balance or apply incoming cash payments.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

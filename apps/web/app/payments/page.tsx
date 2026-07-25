'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../src/lib/api';

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Record<string, unknown>[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<Record<string, unknown> | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [paymentType, setPaymentType] = useState('CUSTOMER_PAYMENT');
  const [paymentMethod, setPaymentMethod] = useState('WIRE_TRANSFER');
  const [amount, setAmount] = useState('500.00');
  const [reference, setReference] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const data = await api.getPayments();
      setPayments(data);
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
      await api.createPayment({
        paymentType,
        paymentMethod,
        amount: parseFloat(amount),
        reference: reference || undefined,
      });
      setIsCreating(false);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create payment transaction');
    }
  };

  const handleAction = async (paymentId: string, action: 'post' | 'cancel') => {
    try {
      if (action === 'post') await api.postPayment(paymentId);
      if (action === 'cancel') await api.cancelPayment(paymentId);

      fetchData();
      if (selectedPayment?.id === paymentId) {
        const updated = await api.getPayment(paymentId);
        setSelectedPayment(updated);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : `Failed to ${action} payment`);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Payments & Cash Movements</h1>
          <p className="text-sm text-gray-500">Customer payments, supplier disbursements, internal transfers, and cash refunds.</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
        >
          {isCreating ? 'Cancel' : '+ New Payment Transaction'}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="p-4 border rounded bg-gray-50 space-y-4 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">Create Payment Transaction</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Payment Type *</label>
              <select
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-semibold"
              >
                <option value="CUSTOMER_PAYMENT">Customer Payment (Inflow)</option>
                <option value="SUPPLIER_PAYMENT">Supplier Payment (Outflow)</option>
                <option value="INTERNAL_TRANSFER">Internal Transfer</option>
                <option value="REFUND">Refund</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Payment Method *</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white"
              >
                <option value="WIRE_TRANSFER">Wire Transfer</option>
                <option value="CHECK">Check</option>
                <option value="CREDIT_CARD">Credit Card</option>
                <option value="CASH">Cash</option>
                <option value="ACH">ACH Direct Debit</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Payment Amount ($) *</label>
              <input
                type="number"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-mono font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Reference / Confirmation #</label>
              <input
                type="text"
                placeholder="TRX-994821"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white"
              />
            </div>
          </div>
          <button type="submit" className="px-4 py-2 bg-black text-white text-xs font-semibold rounded">
            Generate Draft Payment
          </button>
        </form>
      )}

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-6">
          <div className="border rounded overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-100 uppercase text-gray-600 border-b">
                <tr>
                  <th className="p-3">Payment #</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Method</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {payments.map((p) => (
                  <tr
                    key={String(p.id)}
                    onClick={() => setSelectedPayment(p)}
                    className={`cursor-pointer hover:bg-gray-50 ${selectedPayment?.id === p.id ? 'bg-blue-50' : ''}`}
                  >
                    <td className="p-3 font-mono font-bold text-gray-900">{String(p.paymentNumber)}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        p.paymentType === 'CUSTOMER_PAYMENT' ? 'bg-green-100 text-green-800' :
                        p.paymentType === 'SUPPLIER_PAYMENT' ? 'bg-red-100 text-red-800' :
                        'bg-purple-100 text-purple-800'
                      }`}>
                        {String(p.paymentType)}
                      </span>
                    </td>
                    <td className="p-3 font-semibold">{String(p.paymentMethod)}</td>
                    <td className="p-3 font-mono font-bold text-gray-900">${Number(p.amount).toFixed(2)}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        p.status === 'RECONCILED' ? 'bg-purple-100 text-purple-800' :
                        p.status === 'POSTED' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {String(p.status)}
                      </span>
                    </td>
                  </tr>
                ))}
                {payments.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-gray-500">No payment cash transactions found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col-span-6">
          {selectedPayment ? (
            <div className="border rounded p-4 space-y-4 bg-white">
              <div className="flex justify-between items-start border-b pb-3">
                <div>
                  <h3 className="font-mono font-bold text-lg">{String(selectedPayment.paymentNumber)}</h3>
                  <p className="text-xs text-gray-500">Status: {String(selectedPayment.status)}</p>
                </div>
                <div className="flex gap-1">
                  {selectedPayment.status === 'DRAFT' && (
                    <button
                      onClick={() => handleAction(String(selectedPayment.id), 'post')}
                      className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded shadow"
                    >
                      Post Payment
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-2 text-xs border rounded p-3 bg-gray-50">
                <p><span className="text-gray-500">Payment Type:</span> <strong className="uppercase">{String(selectedPayment.paymentType)}</strong></p>
                <p><span className="text-gray-500">Payment Method:</span> <strong className="uppercase">{String(selectedPayment.paymentMethod)}</strong></p>
                <p><span className="text-gray-500">Amount:</span> <strong className="font-mono text-sm text-gray-900">${Number(selectedPayment.amount).toFixed(2)}</strong></p>
                <p><span className="text-gray-500">Reference:</span> {String(selectedPayment.reference || '—')}</p>
              </div>
            </div>
          ) : (
            <div className="p-8 border border-dashed rounded text-center text-sm text-gray-400">
              Select a payment transaction to inspect cash movement or trigger posting.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

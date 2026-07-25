'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../src/lib/api';

export default function QuotationsPage() {
  const [quotations, setQuotations] = useState<Record<string, unknown>[]>([]);
  const [customers, setCustomers] = useState<Record<string, unknown>[]>([]);
  const [components, setComponents] = useState<Record<string, unknown>[]>([]);
  const [selectedQuotation, setSelectedQuotation] = useState<Record<string, unknown> | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form states
  const [customerId, setCustomerId] = useState('');
  const [currency, setCurrency] = useState('USD');

  // Line form
  const [componentId, setComponentId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('10.00');
  const [discount, setDiscount] = useState('0');

  const fetchData = useCallback(async () => {
    try {
      const [qData, cData, compData] = await Promise.all([
        api.getQuotations(),
        api.getCustomers(),
        api.getComponents(),
      ]);
      setQuotations(qData);
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
      await api.createQuotation({
        customerId,
        currency,
      });
      setIsCreating(false);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create quotation');
    }
  };

  const handleAddLine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQuotation) return;
    try {
      await api.addQuotationLine(String(selectedQuotation.id), {
        componentId,
        quantity: parseFloat(quantity),
        unitPrice: parseFloat(unitPrice),
        discount: parseFloat(discount),
      });
      const updated = await api.getQuotation(String(selectedQuotation.id));
      setSelectedQuotation(updated);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to add quotation line');
    }
  };

  const handleAction = async (quoteId: string, action: 'send' | 'accept' | 'cancel' | 'convert') => {
    try {
      if (action === 'send') await api.sendQuotation(quoteId);
      if (action === 'accept') await api.acceptQuotation(quoteId);
      if (action === 'convert') {
        const order = await api.convertQuotationToSalesOrder({ quotationId: quoteId });
        alert(`Sales Order Generated! Order Number: ${String(order.orderNumber)}`);
      }
      if (action === 'cancel') await api.cancelQuotation(quoteId);

      fetchData();
      if (selectedQuotation?.id === quoteId) {
        const updated = await api.getQuotation(quoteId);
        setSelectedQuotation(updated);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : `Failed to ${action} quotation`);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Commercial Quotations</h1>
          <p className="text-sm text-gray-500">Draft price proposals, customer terms, and automated conversion into Sales Orders.</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
        >
          {isCreating ? 'Cancel' : '+ New Quotation'}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="p-4 border rounded bg-gray-50 space-y-4 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">Create Quotation Proposal</h2>
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
            <label className="block text-xs font-medium text-gray-700 mb-1">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white"
            >
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
            </select>
          </div>
          <button type="submit" className="px-4 py-2 bg-black text-white text-xs font-semibold rounded">
            Generate Quotation
          </button>
        </form>
      )}

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-6">
          <div className="border rounded overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-100 uppercase text-gray-600 border-b">
                <tr>
                  <th className="p-3">Quote #</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Valid Until</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {quotations.map((q) => {
                  const cust = customers.find((c) => c.id === q.customerId);
                  return (
                    <tr
                      key={String(q.id)}
                      onClick={() => setSelectedQuotation(q)}
                      className={`cursor-pointer hover:bg-gray-50 ${selectedQuotation?.id === q.id ? 'bg-blue-50' : ''}`}
                    >
                      <td className="p-3 font-mono font-bold text-gray-900">
                        <Link href={`/quotations/${q.id}`} className="hover:underline text-blue-600">
                          {String(q.quoteNumber)}
                        </Link>
                      </td>
                      <td className="p-3 font-semibold text-gray-800">{String(cust?.name ?? q.customerId)}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          q.status === 'ACCEPTED' ? 'bg-green-100 text-green-800' :
                          q.status === 'SENT' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {String(q.status)}
                        </span>
                      </td>
                      <td className="p-3 font-mono">{new Date(String(q.validUntil)).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
                {quotations.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-gray-500">No quotation proposals found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col-span-6">
          {selectedQuotation ? (
            <div className="border rounded p-4 space-y-4 bg-white">
              <div className="flex justify-between items-start border-b pb-3">
                <div>
                  <h3 className="font-mono font-bold text-lg">{String(selectedQuotation.quoteNumber)}</h3>
                  <p className="text-xs text-gray-500">Status: {String(selectedQuotation.status)}</p>
                </div>
                <div className="flex gap-1">
                  {selectedQuotation.status === 'DRAFT' && (
                    <button
                      onClick={() => handleAction(String(selectedQuotation.id), 'send')}
                      className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded"
                    >
                      Send Proposal
                    </button>
                  )}
                  {selectedQuotation.status === 'SENT' && (
                    <button
                      onClick={() => handleAction(String(selectedQuotation.id), 'accept')}
                      className="px-3 py-1 bg-green-600 text-white text-xs font-bold rounded"
                    >
                      Accept Proposal
                    </button>
                  )}
                  {selectedQuotation.status === 'ACCEPTED' && (
                    <button
                      onClick={() => handleAction(String(selectedQuotation.id), 'convert')}
                      className="px-3 py-1 bg-black text-white text-xs font-bold rounded shadow"
                    >
                      Convert to Sales Order
                    </button>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase text-gray-600 mb-2">Line Items</h4>
                <div className="space-y-2">
                  {((selectedQuotation.lines as Record<string, unknown>[]) ?? []).map((l) => {
                    const comp = components.find((c) => c.id === l.componentId);
                    return (
                      <div key={String(l.id)} className="p-2.5 border rounded text-xs flex justify-between bg-gray-50">
                        <div>
                          <p className="font-bold">{String(comp?.sku ?? l.componentId)}</p>
                          <p className="text-gray-500">Qty: {String(l.quantity)} | Price: ${String(l.unitPrice)}</p>
                        </div>
                        <div className="text-right font-mono font-bold text-gray-900">
                          ${String(l.totalPrice)}
                        </div>
                      </div>
                    );
                  })}
                  {((selectedQuotation.lines as Record<string, unknown>[]) ?? []).length === 0 && (
                    <div className="text-xs text-gray-400 py-2">No quotation lines added yet.</div>
                  )}
                </div>
              </div>

              {selectedQuotation.status === 'DRAFT' && (
                <form onSubmit={handleAddLine} className="border-t pt-3 space-y-2">
                  <h4 className="text-xs font-bold uppercase text-gray-600">Add Line Item</h4>
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
                  <div className="grid grid-cols-3 gap-2">
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
                  </div>
                  <button type="submit" className="w-full py-1.5 bg-gray-900 text-white text-xs font-medium rounded">
                    + Add Item to Proposal
                  </button>
                </form>
              )}
            </div>
          ) : (
            <div className="p-8 border border-dashed rounded text-center text-sm text-gray-400">
              Select a quotation proposal to add line items or perform status actions.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

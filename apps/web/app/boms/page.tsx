'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../src/lib/api';

export default function BomsPage() {
  const [boms, setBoms] = useState<Record<string, unknown>[]>([]);
  const [components, setComponents] = useState<Record<string, unknown>[]>([]);
  const [selectedBom, setSelectedBom] = useState<Record<string, unknown> | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form states
  const [componentId, setComponentId] = useState('');
  const [revision, setRevision] = useState('v1.0');
  const [notes, setNotes] = useState('');

  // Line form
  const [lineComponentId, setLineComponentId] = useState('');
  const [qtyPerUnit, setQtyPerUnit] = useState('1');
  const [scrapPercent, setScrapPercent] = useState('0');
  const [lineNotes, setLineNotes] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [bomData, compData] = await Promise.all([
        api.getBoms(),
        api.getComponents(),
      ]);
      setBoms(bomData);
      setComponents(compData as unknown as Record<string, unknown>[]);
    } catch (err: unknown) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateBom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createBom({
        componentId,
        revision: revision || 'v1.0',
        notes: notes || undefined,
      });
      setIsCreating(false);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create BOM');
    }
  };

  const handleAddLine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBom) return;
    try {
      await api.addBomLine(String(selectedBom.id), {
        componentId: lineComponentId,
        quantityPerUnit: parseFloat(qtyPerUnit),
        scrapFactorPercent: parseFloat(scrapPercent),
        notes: lineNotes || undefined,
      });
      const updated = await api.getBom(String(selectedBom.id));
      setSelectedBom(updated);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to add BOM line');
    }
  };

  const handleRelease = async (bomId: string) => {
    try {
      await api.releaseBom(bomId);
      fetchData();
      if (selectedBom?.id === bomId) {
        const updated = await api.getBom(bomId);
        setSelectedBom(updated);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to release BOM');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Bill of Materials (BOM)</h1>
          <p className="text-sm text-gray-500">Define multi-level component assemblies, quantities, and scrap allowances.</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
        >
          {isCreating ? 'Cancel' : '+ Create New BOM'}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreateBom} className="p-4 border rounded bg-gray-50 space-y-4 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">Create BOM Header</h2>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Assembly Component *</label>
            <select
              required
              value={componentId}
              onChange={(e) => setComponentId(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white"
            >
              <option value="">-- Select Target Component --</option>
              {components.map((c) => (
                <option key={String(c.id)} value={String(c.id)}>{String(c.sku)} - {String(c.name)}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Revision</label>
              <input
                type="text"
                value={revision}
                onChange={(e) => setRevision(e.target.value)}
                placeholder="v1.0"
                className="w-full px-3 py-1.5 text-sm border rounded"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Initial release"
                className="w-full px-3 py-1.5 text-sm border rounded"
              />
            </div>
          </div>
          <button type="submit" className="px-4 py-2 bg-black text-white text-xs font-semibold rounded">
            Save BOM Header
          </button>
        </form>
      )}

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-6">
          <div className="border rounded overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-100 uppercase text-gray-600 border-b">
                <tr>
                  <th className="p-3">Assembly SKU</th>
                  <th className="p-3">Revision</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Items</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {boms.map((b) => {
                  const comp = components.find((c) => c.id === b.componentId);
                  const lines = (b.lines as Record<string, unknown>[]) || [];
                  return (
                    <tr
                      key={String(b.id)}
                      onClick={() => setSelectedBom(b)}
                      className={`cursor-pointer hover:bg-gray-50 ${selectedBom?.id === b.id ? 'bg-blue-50' : ''}`}
                    >
                      <td className="p-3 font-mono font-bold text-gray-900">{String(comp?.sku ?? b.componentId)}</td>
                      <td className="p-3 font-mono text-gray-600">{String(b.revision)}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          b.status === 'RELEASED' ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-800'
                        }`}>
                          {String(b.status)}
                        </span>
                      </td>
                      <td className="p-3 font-mono">{lines.length} components</td>
                    </tr>
                  );
                })}
                {boms.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-gray-500">No BOMs found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col-span-6">
          {selectedBom ? (
            <div className="border rounded p-4 space-y-4 bg-white">
              <div className="flex justify-between items-start border-b pb-3">
                <div>
                  <h3 className="font-mono font-bold text-lg">
                    {String(components.find((c) => c.id === selectedBom.componentId)?.sku ?? selectedBom.componentId)} ({String(selectedBom.revision)})
                  </h3>
                  <p className="text-xs text-gray-500">Status: {String(selectedBom.status)}</p>
                </div>
                {selectedBom.status === 'DRAFT' && (
                  <button
                    onClick={() => handleRelease(String(selectedBom.id))}
                    className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded shadow hover:bg-green-700"
                  >
                    Release BOM
                  </button>
                )}
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase text-gray-600 mb-2">BOM Component Lines</h4>
                <div className="space-y-2">
                  {((selectedBom.lines as Record<string, unknown>[]) ?? []).map((l) => {
                    const lineComp = components.find((c) => c.id === l.componentId);
                    return (
                      <div key={String(l.id)} className="p-2.5 border rounded text-xs flex justify-between bg-gray-50">
                        <div>
                          <p className="font-bold">{String(lineComp?.sku ?? l.componentId)} - {String(lineComp?.name ?? '')}</p>
                          <p className="text-gray-500">Scrap factor: {String(l.scrapFactorPercent)}%</p>
                        </div>
                        <div className="text-right font-mono font-bold text-gray-900">
                          {String(l.quantityPerUnit)} {String(l.unitOfMeasure || 'pcs')} / unit
                        </div>
                      </div>
                    );
                  })}
                  {((selectedBom.lines as Record<string, unknown>[]) ?? []).length === 0 && (
                    <div className="text-xs text-gray-400 py-2">No line items in this BOM yet.</div>
                  )}
                </div>
              </div>

              {selectedBom.status === 'DRAFT' && (
                <form onSubmit={handleAddLine} className="border-t pt-3 space-y-2">
                  <h4 className="text-xs font-bold uppercase text-gray-600">Add Raw Material Component</h4>
                  <select
                    required
                    value={lineComponentId}
                    onChange={(e) => setLineComponentId(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border rounded bg-white"
                  >
                    <option value="">-- Select Child Component --</option>
                    {components.map((c) => (
                      <option key={String(c.id)} value={String(c.id)}>{String(c.sku)} - {String(c.name)}</option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-0.5">Quantity Per Unit</label>
                      <input
                        type="number"
                        step="0.0001"
                        required
                        value={qtyPerUnit}
                        onChange={(e) => setQtyPerUnit(e.target.value)}
                        className="w-full px-2 py-1 text-xs border rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-0.5">Scrap %</label>
                      <input
                        type="number"
                        step="0.1"
                        value={scrapPercent}
                        onChange={(e) => setScrapPercent(e.target.value)}
                        className="w-full px-2 py-1 text-xs border rounded"
                      />
                    </div>
                  </div>
                  <input
                    type="text"
                    placeholder="Notes (optional)"
                    value={lineNotes}
                    onChange={(e) => setLineNotes(e.target.value)}
                    className="w-full px-2 py-1 text-xs border rounded"
                  />
                  <button type="submit" className="w-full py-1.5 bg-gray-900 text-white text-xs font-medium rounded">
                    + Add Component to BOM
                  </button>
                </form>
              )}
            </div>
          ) : (
            <div className="p-8 border border-dashed rounded text-center text-sm text-gray-400">
              Select a Bill of Materials to inspect or manage lines.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

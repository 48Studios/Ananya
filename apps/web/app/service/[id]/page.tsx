'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../../src/lib/api';

export default function ServiceRequestDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [request, setRequest] = useState<Record<string, unknown> | null>(null);
  const [workOrders, setWorkOrders] = useState<Record<string, unknown>[]>([]);
  const [notes, setNotes] = useState<Record<string, unknown>[]>([]);

  // Forms
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagNotes, setDiagNotes] = useState('');
  const [isCreatingWO, setIsCreatingWO] = useState(false);
  const [woTitle, setWoTitle] = useState('');
  const [woTech, setWoTech] = useState('');
  const [woHours, setWoHours] = useState('4.00');

  const fetchDetails = useCallback(async () => {
    if (!id) return;
    try {
      const [rData, woData, nData] = await Promise.all([
        api.getServiceRequest(id),
        api.getWorkOrders(id),
        api.getServiceNotes(id),
      ]);
      setRequest(rData);
      setWorkOrders(woData);
      setNotes(nData);
    } catch (err: unknown) {
      console.error(err);
    }
  }, [id]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const handleDiagnose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    try {
      await api.diagnoseServiceRequest(id, diagNotes);
      setIsDiagnosing(false);
      setDiagNotes('');
      fetchDetails();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to record diagnosis');
    }
  };

  const handleCreateWO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    try {
      await api.createWorkOrder({
        serviceRequestId: id,
        assignedTechnician: woTech || undefined,
        title: woTitle,
        plannedHours: parseFloat(woHours),
      });
      setIsCreatingWO(false);
      setWoTitle('');
      fetchDetails();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create work order');
    }
  };

  const handleStartRepair = async () => {
    if (!id) return;
    try {
      await api.startServiceRequestRepair(id);
      fetchDetails();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to start repair');
    }
  };

  const handleComplete = async () => {
    if (!id) return;
    try {
      await api.completeServiceRequest(id);
      fetchDetails();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to complete request');
    }
  };

  if (!request) return <div className="p-6 text-sm text-gray-500">Loading service request details...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start border-b pb-4">
        <div>
          <span className="text-xs font-mono uppercase text-gray-400">Service Request Workspace</span>
          <h1 className="text-2xl font-bold font-mono tracking-tight">{String(request.serviceNumber)} — {String(request.title)}</h1>
          <p className="text-xs text-gray-500 font-mono">Category: {String(request.category)} | Customer ID: {String(request.customerId)}</p>
        </div>
        <div className="flex gap-2">
          {request.status === 'ASSIGNED' && (
            <button
              onClick={() => setIsDiagnosing(!isDiagnosing)}
              className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded shadow hover:bg-blue-700"
            >
              {isDiagnosing ? 'Cancel' : '+ Record Diagnosis'}
            </button>
          )}
          {request.status === 'DIAGNOSING' && (
            <button
              onClick={handleStartRepair}
              className="px-3 py-1.5 bg-purple-600 text-white text-xs font-bold rounded shadow hover:bg-purple-700"
            >
              Start Repair
            </button>
          )}
          {request.status === 'REPAIRING' && (
            <button
              onClick={handleComplete}
              className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded shadow hover:bg-green-700"
            >
              Complete Request
            </button>
          )}
          <button
            onClick={() => setIsCreatingWO(!isCreatingWO)}
            className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
          >
            {isCreatingWO ? 'Cancel' : '+ Create Work Order'}
          </button>
        </div>
      </div>

      {isDiagnosing && (
        <form onSubmit={handleDiagnose} className="p-4 border rounded bg-blue-50 space-y-3 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-blue-900">Record Technical Diagnosis</h2>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Diagnostic Findings *</label>
            <textarea
              rows={3}
              required
              placeholder="e.g. Primary power regulator failure causing brownouts under load."
              value={diagNotes}
              onChange={(e) => setDiagNotes(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white font-mono"
            />
          </div>
          <button type="submit" className="px-3 py-1.5 bg-blue-700 text-white text-xs font-semibold rounded">
            Save Diagnosis & Progress
          </button>
        </form>
      )}

      {isCreatingWO && (
        <form onSubmit={handleCreateWO} className="p-4 border rounded bg-gray-50 space-y-3 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">Dispatch Technical Work Order</h2>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Work Order Title *</label>
            <input
              type="text"
              required
              placeholder="e.g. Replace regulator board and test voltage stability"
              value={woTitle}
              onChange={(e) => setWoTitle(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white font-bold"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Assigned Technician</label>
              <input
                type="text"
                placeholder="tech-bob"
                value={woTech}
                onChange={(e) => setWoTech(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Planned Hours *</label>
              <input
                type="number"
                required
                value={woHours}
                onChange={(e) => setWoHours(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-mono font-bold"
              />
            </div>
          </div>
          <button type="submit" className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded">
            Dispatch Work Order
          </button>
        </form>
      )}

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-4 border rounded p-4 bg-white space-y-3 text-xs">
          <h2 className="font-bold uppercase tracking-wider text-gray-700 border-b pb-2">Request Details</h2>
          <p><span className="text-gray-500">Technician:</span> <strong className="font-mono text-gray-900">{String(request.assignedTechnician || 'Unassigned')}</strong></p>
          <p><span className="text-gray-500">Priority:</span> <strong className="text-gray-900">{String(request.priority)}</strong></p>
          <p><span className="text-gray-500">Status:</span> <strong className="font-bold text-gray-900">{String(request.status)}</strong></p>
          {Boolean(request.diagnosticNotes) && (
            <div className="border-t pt-2 mt-2">
              <span className="text-gray-500 block mb-1">Diagnostic Notes:</span>
              <p className="font-mono bg-gray-50 p-2 rounded text-[11px] text-gray-800">{String(request.diagnosticNotes)}</p>
            </div>
          )}
        </div>

        <div className="col-span-8 space-y-6">
          <div className="border rounded p-4 bg-white space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700 border-b pb-2">Technical Work Orders</h2>
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-100 uppercase text-gray-600 border-b">
                <tr>
                  <th className="p-2">WO #</th>
                  <th className="p-2">Title</th>
                  <th className="p-2">Technician</th>
                  <th className="p-2">Planned Hours</th>
                  <th className="p-2">Actual Hours</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {workOrders.map((wo) => (
                  <tr key={String(wo.id)} className="hover:bg-gray-50">
                    <td className="p-2 font-mono font-bold text-gray-900">{String(wo.workOrderNumber)}</td>
                    <td className="p-2 font-semibold text-gray-900">
                      <Link href={`/work-orders/${String(wo.id)}`} className="text-blue-600 hover:underline">
                        {String(wo.title)}
                      </Link>
                    </td>
                    <td className="p-2 font-mono text-gray-700">{String(wo.assignedTechnician || 'Unassigned')}</td>
                    <td className="p-2 font-mono">{Number(wo.plannedHours).toFixed(2)}h</td>
                    <td className="p-2 font-mono font-bold text-blue-700">{Number(wo.actualHours).toFixed(2)}h</td>
                    <td className="p-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        wo.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                        wo.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {String(wo.status)}
                      </span>
                    </td>
                  </tr>
                ))}
                {workOrders.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-gray-500">No work orders dispatched.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="border rounded p-4 bg-white space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700 border-b pb-2">Service Collaboration Notes ({notes.length})</h2>
            <div className="space-y-2">
              {notes.map((n) => (
                <div key={String(n.id)} className="p-2 border rounded bg-gray-50 text-xs">
                  <div className="flex justify-between font-mono text-[10px] text-gray-500 mb-1">
                    <span className="font-bold text-gray-800">{String(n.author)}</span>
                    <span>{new Date(String(n.createdAt)).toLocaleString()}</span>
                  </div>
                  <p className="text-gray-800">{String(n.body)}</p>
                </div>
              ))}
              {notes.length === 0 && (
                <div className="text-xs text-gray-400 py-1">No service notes recorded.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

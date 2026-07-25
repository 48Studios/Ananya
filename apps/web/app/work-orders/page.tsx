'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../src/lib/api';

export default function WorkOrdersPage() {
  const [workOrders, setWorkOrders] = useState<Record<string, unknown>[]>([]);
  const [serviceRequests, setServiceRequests] = useState<Record<string, unknown>[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [serviceRequestId, setServiceRequestId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTechnician, setAssignedTechnician] = useState('');
  const [plannedHours, setPlannedHours] = useState('4.00');

  const fetchData = useCallback(async () => {
    try {
      const [woData, srData] = await Promise.all([
        api.getWorkOrders(),
        api.getServiceRequests(),
      ]);
      setWorkOrders(woData);
      setServiceRequests(srData);
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
      await api.createWorkOrder({
        serviceRequestId,
        title,
        description: description || undefined,
        assignedTechnician: assignedTechnician || undefined,
        plannedHours: parseFloat(plannedHours),
      });
      setIsCreating(false);
      setTitle('');
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create work order');
    }
  };

  const handleStart = async (id: string) => {
    try {
      await api.startWorkOrder(id);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to start work order');
    }
  };

  const handleComplete = async (id: string) => {
    try {
      await api.completeWorkOrder(id);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to complete work order');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Work Orders & Technician Repairs</h1>
          <p className="text-sm text-gray-500">Technical repair dispatch, labor estimation, and field work order completion console.</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
        >
          {isCreating ? 'Cancel' : '+ New Work Order'}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="p-4 border rounded bg-gray-50 space-y-4 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">Dispatch Work Order</h2>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Target Service Request *</label>
            <select
              required
              value={serviceRequestId}
              onChange={(e) => setServiceRequestId(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white font-semibold"
            >
              <option value="">-- Select Service Request --</option>
              {serviceRequests.map((sr) => (
                <option key={String(sr.id)} value={String(sr.id)}>
                  {String(sr.serviceNumber)} — {String(sr.title)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Work Order Title *</label>
            <input
              type="text"
              required
              placeholder="e.g. Disassemble and replace main logic board"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white font-bold"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Assigned Technician</label>
              <input
                type="text"
                placeholder="tech-bob"
                value={assignedTechnician}
                onChange={(e) => setAssignedTechnician(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Planned Labor Hours *</label>
              <input
                type="number"
                required
                value={plannedHours}
                onChange={(e) => setPlannedHours(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-mono font-bold"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white"
            />
          </div>
          <button type="submit" className="px-4 py-2 bg-black text-white text-xs font-semibold rounded">
            Dispatch Work Order
          </button>
        </form>
      )}

      <div className="border rounded overflow-hidden bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-100 uppercase text-gray-600 border-b">
            <tr>
              <th className="p-3">WO #</th>
              <th className="p-3">Title</th>
              <th className="p-3">Technician</th>
              <th className="p-3">Planned Hours</th>
              <th className="p-3">Actual Hours</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {workOrders.map((wo) => (
              <tr key={String(wo.id)} className="hover:bg-gray-50">
                <td className="p-3 font-mono font-bold text-gray-900">{String(wo.workOrderNumber)}</td>
                <td className="p-3 font-semibold text-gray-900">
                  <Link href={`/work-orders/${String(wo.id)}`} className="text-blue-600 hover:underline">
                    {String(wo.title)}
                  </Link>
                </td>
                <td className="p-3 font-mono text-gray-700">{String(wo.assignedTechnician || 'Unassigned')}</td>
                <td className="p-3 font-mono">{Number(wo.plannedHours).toFixed(2)}h</td>
                <td className="p-3 font-mono font-bold text-blue-700">{Number(wo.actualHours).toFixed(2)}h</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    wo.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                    wo.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' :
                    wo.status === 'PAUSED' ? 'bg-yellow-100 text-yellow-800' :
                    wo.status === 'CANCELLED' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {String(wo.status)}
                  </span>
                </td>
                <td className="p-3 text-right space-x-1">
                  {(wo.status === 'CREATED' || wo.status === 'ASSIGNED') && (
                    <button
                      onClick={() => handleStart(String(wo.id))}
                      className="px-2 py-1 bg-blue-600 text-white text-[10px] font-bold rounded shadow hover:bg-blue-700"
                    >
                      Start Work
                    </button>
                  )}
                  {wo.status === 'IN_PROGRESS' && (
                    <button
                      onClick={() => handleComplete(String(wo.id))}
                      className="px-2 py-1 bg-green-600 text-white text-[10px] font-bold rounded shadow hover:bg-green-700"
                    >
                      Complete
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {workOrders.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-500">No work orders found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

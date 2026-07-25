'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../../src/lib/api';

export default function WorkOrderDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [workOrder, setWorkOrder] = useState<Record<string, unknown> | null>(null);
  const [isLoggingHours, setIsLoggingHours] = useState(false);
  const [hours, setHours] = useState('2.00');

  const fetchDetails = useCallback(async () => {
    if (!id) return;
    try {
      const woData = await api.getWorkOrder(id);
      setWorkOrder(woData);
    } catch (err: unknown) {
      console.error(err);
    }
  }, [id]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const handleLogHours = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    try {
      await api.logWorkOrderHours(id, parseFloat(hours));
      setIsLoggingHours(false);
      fetchDetails();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to log hours');
    }
  };

  const handleStart = async () => {
    if (!id) return;
    try {
      await api.startWorkOrder(id);
      fetchDetails();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to start work order');
    }
  };

  const handlePause = async () => {
    if (!id) return;
    try {
      await api.pauseWorkOrder(id);
      fetchDetails();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to pause work order');
    }
  };

  const handleComplete = async () => {
    if (!id) return;
    try {
      await api.completeWorkOrder(id);
      fetchDetails();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to complete work order');
    }
  };

  if (!workOrder) return <div className="p-6 text-sm text-gray-500">Loading work order details...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start border-b pb-4">
        <div>
          <span className="text-xs font-mono uppercase text-gray-400">Technician Work Order</span>
          <h1 className="text-2xl font-bold font-mono tracking-tight">{String(workOrder.workOrderNumber)} — {String(workOrder.title)}</h1>
          <p className="text-xs text-gray-500 font-mono">Service Request ID: {String(workOrder.serviceRequestId)} | Technician: {String(workOrder.assignedTechnician || 'Unassigned')}</p>
        </div>
        <div className="flex gap-2">
          {workOrder.status === 'ASSIGNED' && (
            <button
              onClick={handleStart}
              className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded shadow hover:bg-blue-700"
            >
              Start Work
            </button>
          )}
          {workOrder.status === 'IN_PROGRESS' && (
            <>
              <button
                onClick={handlePause}
                className="px-3 py-1.5 bg-yellow-600 text-white text-xs font-bold rounded shadow hover:bg-yellow-700"
              >
                Pause Work
              </button>
              <button
                onClick={handleComplete}
                className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded shadow hover:bg-green-700"
              >
                Complete Work
              </button>
            </>
          )}
          {workOrder.status !== 'COMPLETED' && workOrder.status !== 'CANCELLED' && (
            <button
              onClick={() => setIsLoggingHours(!isLoggingHours)}
              className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
            >
              {isLoggingHours ? 'Cancel' : '+ Log Repair Hours'}
            </button>
          )}
        </div>
      </div>

      {isLoggingHours && (
        <form onSubmit={handleLogHours} className="p-4 border rounded bg-gray-50 space-y-3 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">Log Technician Labor Hours</h2>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Hours Logged *</label>
            <input
              type="number"
              step="0.25"
              required
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white font-mono font-bold"
            />
          </div>
          <button type="submit" className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded">
            Save Labor Hours
          </button>
        </form>
      )}

      <div className="border rounded p-4 bg-white space-y-3 max-w-xl text-xs">
        <h2 className="font-bold uppercase tracking-wider text-gray-700 border-b pb-2">Execution Metrics</h2>
        <p><span className="text-gray-500">Planned Labor Hours:</span> <strong className="font-mono text-gray-900">{Number(workOrder.plannedHours).toFixed(2)}h</strong></p>
        <p><span className="text-gray-500">Actual Labor Hours:</span> <strong className="font-mono text-blue-700">{Number(workOrder.actualHours).toFixed(2)}h</strong></p>
        <p><span className="text-gray-500">Priority:</span> <strong className="text-gray-900">{String(workOrder.priority)}</strong></p>
        <p><span className="text-gray-500">Status:</span> <strong className="font-bold text-gray-900">{String(workOrder.status)}</strong></p>
      </div>
    </div>
  );
}

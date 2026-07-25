'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../src/lib/api';

export default function ServiceRequestsPage() {
  const [requests, setRequests] = useState<Record<string, unknown>[]>([]);
  const [customers, setCustomers] = useState<Record<string, unknown>[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [customerId, setCustomerId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('HARDWARE');
  const [priority, setPriority] = useState('MEDIUM');
  const [serialNumber, setSerialNumber] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [rData, cData] = await Promise.all([
        api.getServiceRequests(),
        api.getCustomers(),
      ]);
      setRequests(rData);
      setCustomers(cData);
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
      await api.createServiceRequest({
        customerId,
        title,
        description: description || undefined,
        category,
        priority,
        serialNumber: serialNumber || undefined,
      });
      setIsCreating(false);
      setTitle('');
      setDescription('');
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create service request');
    }
  };

  const handleAssign = async (id: string) => {
    const tech = prompt('Enter assigned technician ID (e.g. tech-bob):', 'tech-bob');
    if (!tech) return;
    try {
      await api.assignServiceRequest(id, tech);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to assign technician');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Service Requests & Customer Support</h1>
          <p className="text-sm text-gray-500">Post-delivery support requests, diagnostic tracking, and repair dispatch.</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
        >
          {isCreating ? 'Cancel' : '+ New Service Request'}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="p-4 border rounded bg-gray-50 space-y-4 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">Log Customer Service Request</h2>
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
            <label className="block text-xs font-medium text-gray-700 mb-1">Issue Title *</label>
            <input
              type="text"
              required
              placeholder="e.g. Server Unit Overheating under heavy load"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white font-bold"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-semibold"
              >
                <option value="HARDWARE">Hardware</option>
                <option value="SOFTWARE">Software</option>
                <option value="MAINTENANCE">Maintenance</option>
                <option value="INSTALLATION">Installation</option>
                <option value="INSPECTION">Inspection</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-semibold"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Serial Number</label>
              <input
                type="text"
                placeholder="SN-99482"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <textarea
              rows={2}
              placeholder="Detailed description of customer reported issue..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white"
            />
          </div>
          <button type="submit" className="px-4 py-2 bg-black text-white text-xs font-semibold rounded">
            Submit Service Request
          </button>
        </form>
      )}

      <div className="border rounded overflow-hidden bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-100 uppercase text-gray-600 border-b">
            <tr>
              <th className="p-3">Service #</th>
              <th className="p-3">Title</th>
              <th className="p-3">Category</th>
              <th className="p-3">Technician</th>
              <th className="p-3">Priority</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {requests.map((r) => (
              <tr key={String(r.id)} className="hover:bg-gray-50">
                <td className="p-3 font-mono font-bold text-gray-900">{String(r.serviceNumber)}</td>
                <td className="p-3 font-semibold text-gray-900">
                  <Link href={`/service/${String(r.id)}`} className="text-blue-600 hover:underline">
                    {String(r.title)}
                  </Link>
                </td>
                <td className="p-3 font-mono text-gray-700">{String(r.category)}</td>
                <td className="p-3 font-mono text-gray-700">{String(r.assignedTechnician || 'Unassigned')}</td>
                <td className="p-3 font-bold text-gray-800">{String(r.priority)}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    r.status === 'COMPLETED' || r.status === 'CLOSED' ? 'bg-green-100 text-green-800' :
                    r.status === 'REPAIRING' || r.status === 'DIAGNOSING' ? 'bg-blue-100 text-blue-800' :
                    r.status === 'WAITING_PARTS' ? 'bg-yellow-100 text-yellow-800' :
                    r.status === 'CANCELLED' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {String(r.status)}
                  </span>
                </td>
                <td className="p-3 text-right">
                  {r.status === 'OPEN' && (
                    <button
                      onClick={() => handleAssign(String(r.id))}
                      className="px-2 py-1 bg-blue-600 text-white text-[10px] font-bold rounded shadow hover:bg-blue-700"
                    >
                      Assign Tech
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-500">No service requests found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

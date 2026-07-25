'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../src/lib/api';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Record<string, unknown>[]>([]);
  const [customers, setCustomers] = useState<Record<string, unknown>[]>([]);
  const [salesOrders, setSalesOrders] = useState<Record<string, unknown>[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [salesOrderId, setSalesOrderId] = useState('');
  const [projectManager, setProjectManager] = useState('pm-alice');
  const [startDate, setStartDate] = useState('');
  const [targetCompletionDate, setTargetCompletionDate] = useState('');
  const [priority, setPriority] = useState('MEDIUM');

  const fetchData = useCallback(async () => {
    try {
      const [pData, cData, soData] = await Promise.all([
        api.getProjects(),
        api.getCustomers(),
        api.getSalesOrders(),
      ]);
      setProjects(pData);
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
      await api.createProject({
        name,
        customerId,
        salesOrderId,
        projectManager,
        startDate,
        targetCompletionDate,
        priority,
      });
      setIsCreating(false);
      setName('');
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create project');
    }
  };

  const handleStart = async (id: string) => {
    try {
      await api.startProject(id);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to start project');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Project Management Console</h1>
          <p className="text-sm text-gray-500">Post-sales commercial execution workspaces, milestone delivery, and progress orchestration.</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
        >
          {isCreating ? 'Cancel' : '+ New Delivery Project'}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="p-4 border rounded bg-gray-50 space-y-4 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">Create Project Workspace</h2>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Project Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Acme Corp Cloud Migration & Deployment"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white font-bold"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Customer *</label>
              <select
                required
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white"
              >
                <option value="">-- Select Customer --</option>
                {customers.map((c) => (
                  <option key={String(c.id)} value={String(c.id)}>{String(c.name)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Initiating Sales Order *</label>
              <select
                required
                value={salesOrderId}
                onChange={(e) => setSalesOrderId(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-mono"
              >
                <option value="">-- Select Sales Order --</option>
                {salesOrders.map((so) => (
                  <option key={String(so.id)} value={String(so.id)}>{String(so.orderNumber)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Project Manager</label>
              <input
                type="text"
                required
                value={projectManager}
                onChange={(e) => setProjectManager(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Start Date *</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Target Completion *</label>
              <input
                type="date"
                required
                value={targetCompletionDate}
                onChange={(e) => setTargetCompletionDate(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white"
              />
            </div>
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
          <button type="submit" className="px-4 py-2 bg-black text-white text-xs font-semibold rounded">
            Save Project
          </button>
        </form>
      )}

      <div className="border rounded overflow-hidden bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-100 uppercase text-gray-600 border-b">
            <tr>
              <th className="p-3">Project #</th>
              <th className="p-3">Project Name</th>
              <th className="p-3">Manager</th>
              <th className="p-3">Target Completion</th>
              <th className="p-3">Priority</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {projects.map((p) => (
              <tr key={String(p.id)} className="hover:bg-gray-50">
                <td className="p-3 font-mono font-bold text-gray-900">{String(p.projectNumber)}</td>
                <td className="p-3 font-semibold text-gray-900">
                  <Link href={`/projects/${String(p.id)}`} className="text-blue-600 hover:underline">
                    {String(p.name)}
                  </Link>
                </td>
                <td className="p-3 font-mono text-gray-700">{String(p.projectManager)}</td>
                <td className="p-3 text-gray-600">{new Date(String(p.targetCompletionDate)).toLocaleDateString()}</td>
                <td className="p-3 font-bold text-gray-800">{String(p.priority)}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    p.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                    p.status === 'ACTIVE' ? 'bg-blue-100 text-blue-800' :
                    p.status === 'ON_HOLD' ? 'bg-yellow-100 text-yellow-800' :
                    p.status === 'CANCELLED' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {String(p.status)}
                  </span>
                </td>
                <td className="p-3 text-right">
                  {p.status === 'PLANNING' && (
                    <button
                      onClick={() => handleStart(String(p.id))}
                      className="px-2 py-1 bg-blue-600 text-white text-[10px] font-bold rounded shadow hover:bg-blue-700"
                    >
                      Start Project
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {projects.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-500">No projects found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

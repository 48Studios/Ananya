'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../src/lib/api';

export default function MaintenancePage() {
  const [schedules, setSchedules] = useState<Record<string, unknown>[]>([]);
  const [customers, setCustomers] = useState<Record<string, unknown>[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [customerId, setCustomerId] = useState('');
  const [assetName, setAssetName] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [frequency, setFrequency] = useState('QUARTERLY');
  const [nextVisitDate, setNextVisitDate] = useState('');
  const [assignedTechnician, setAssignedTechnician] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [sData, cData] = await Promise.all([
        api.getMaintenanceSchedules(),
        api.getCustomers(),
      ]);
      setSchedules(sData);
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
      await api.createMaintenanceSchedule({
        customerId,
        assetName,
        serialNumber: serialNumber || undefined,
        frequency,
        nextVisitDate,
        assignedTechnician: assignedTechnician || undefined,
      });
      setIsCreating(false);
      setAssetName('');
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create maintenance schedule');
    }
  };

  const handleCompleteVisit = async (id: string) => {
    try {
      await api.completeMaintenanceVisit(id);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to complete visit');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Preventive Maintenance Schedules</h1>
          <p className="text-sm text-gray-500">Asset service intervals, recurring maintenance visits, and field service technician dispatch.</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
        >
          {isCreating ? 'Cancel' : '+ New Maintenance Schedule'}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="p-4 border rounded bg-gray-50 space-y-4 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">Create Asset Maintenance Schedule</h2>
          <div className="grid grid-cols-2 gap-3">
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
              <label className="block text-xs font-medium text-gray-700 mb-1">Asset Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Industrial HVAC Cooling Rack #2"
                value={assetName}
                onChange={(e) => setAssetName(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-bold"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Serial Number</label>
            <input
              type="text"
              placeholder="SN-10928"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white font-mono"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Frequency *</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-semibold"
              >
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="BIANNUAL">Biannual</option>
                <option value="ANNUAL">Annual</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Next Visit Date *</label>
              <input
                type="date"
                required
                value={nextVisitDate}
                onChange={(e) => setNextVisitDate(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Technician</label>
              <input
                type="text"
                placeholder="tech-bob"
                value={assignedTechnician}
                onChange={(e) => setAssignedTechnician(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-mono"
              />
            </div>
          </div>
          <button type="submit" className="px-4 py-2 bg-black text-white text-xs font-semibold rounded">
            Save Schedule
          </button>
        </form>
      )}

      <div className="border rounded overflow-hidden bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-100 uppercase text-gray-600 border-b">
            <tr>
              <th className="p-3">Schedule #</th>
              <th className="p-3">Asset Name</th>
              <th className="p-3">Frequency</th>
              <th className="p-3">Next Scheduled Visit</th>
              <th className="p-3">Technician</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {schedules.map((s) => (
              <tr key={String(s.id)} className="hover:bg-gray-50">
                <td className="p-3 font-mono font-bold text-gray-900">{String(s.scheduleNumber)}</td>
                <td className="p-3 font-semibold text-gray-900">{String(s.assetName)}</td>
                <td className="p-3 font-mono font-bold text-purple-700">{String(s.frequency)}</td>
                <td className="p-3 font-mono text-gray-900 font-bold">{new Date(String(s.nextVisitDate)).toLocaleDateString()}</td>
                <td className="p-3 font-mono text-gray-700">{String(s.assignedTechnician || 'Unassigned')}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    s.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                    s.status === 'PAUSED' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {String(s.status)}
                  </span>
                </td>
                <td className="p-3 text-right">
                  {s.status === 'ACTIVE' && (
                    <button
                      onClick={() => handleCompleteVisit(String(s.id))}
                      className="px-2 py-1 bg-green-600 text-white text-[10px] font-bold rounded shadow hover:bg-green-700"
                    >
                      Complete Visit
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {schedules.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-500">No maintenance schedules found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

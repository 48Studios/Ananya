'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../src/lib/api';

export default function ActivitiesPage() {
  const [activities, setActivities] = useState<Record<string, unknown>[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [type, setType] = useState('CALL');
  const [subject, setSubject] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [owner, setOwner] = useState('rep-1');

  const fetchData = useCallback(async () => {
    try {
      const data = await api.getActivities();
      setActivities(data);
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
      await api.createActivity({
        type,
        subject,
        dueDate,
        owner,
      });
      setIsCreating(false);
      setSubject('');
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to schedule activity');
    }
  };

  const handleComplete = async (id: string) => {
    try {
      await api.completeActivity(id);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to complete activity');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">CRM Activities & Touchpoints</h1>
          <p className="text-sm text-gray-500">Scheduled calls, meetings, emails, tasks, and demo touchpoint history.</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
        >
          {isCreating ? 'Cancel' : '+ Schedule Activity'}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="p-4 border rounded bg-gray-50 space-y-4 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">Schedule CRM Touchpoint</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Activity Type *</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-bold"
              >
                <option value="CALL">Phone Call</option>
                <option value="MEETING">In-Person / Virtual Meeting</option>
                <option value="EMAIL">Email Outreach</option>
                <option value="TASK">Task Item</option>
                <option value="DEMO">Product Demo</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Subject / Summary *</label>
              <input
                type="text"
                required
                placeholder="Product Discovery Call"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white"
              />
            </div>
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
              <label className="block text-xs font-medium text-gray-700 mb-1">Owner *</label>
              <input
                type="text"
                required
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-mono font-bold"
              />
            </div>
          </div>
          <button type="submit" className="px-4 py-2 bg-black text-white text-xs font-semibold rounded">
            Save Scheduled Touchpoint
          </button>
        </form>
      )}

      <div className="border rounded overflow-hidden bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-100 uppercase text-gray-600 border-b">
            <tr>
              <th className="p-3">Type</th>
              <th className="p-3">Subject</th>
              <th className="p-3">Due Date</th>
              <th className="p-3">Owner</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {activities.map((act) => (
              <tr key={String(act.id)} className="hover:bg-gray-50">
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    act.type === 'MEETING' ? 'bg-purple-100 text-purple-800' :
                    act.type === 'CALL' ? 'bg-blue-100 text-blue-800' :
                    act.type === 'DEMO' ? 'bg-green-100 text-green-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {String(act.type)}
                  </span>
                </td>
                <td className="p-3 font-semibold text-gray-900">{String(act.subject)}</td>
                <td className="p-3 text-gray-600">{new Date(String(act.dueDate)).toLocaleDateString()}</td>
                <td className="p-3 font-mono">{String(act.owner)}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    act.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {String(act.status)}
                  </span>
                </td>
                <td className="p-3 text-right">
                  {act.status === 'SCHEDULED' && (
                    <button
                      onClick={() => handleComplete(String(act.id))}
                      className="px-2 py-1 bg-green-600 text-white text-[10px] font-bold rounded shadow hover:bg-green-700"
                    >
                      Complete Touchpoint
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {activities.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-500">No scheduled activities found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

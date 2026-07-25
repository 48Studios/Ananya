'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../src/lib/api';

export default function TimesheetsPage() {
  const [timeEntries, setTimeEntries] = useState<Record<string, unknown>[]>([]);
  const [tasks, setTasks] = useState<Record<string, unknown>[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [userId, setUserId] = useState('dev-charlie');
  const [taskId, setTaskId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0] || '');
  const [hours, setHours] = useState('8.00');
  const [description, setDescription] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [teData, tData] = await Promise.all([
        api.getTimeEntries(),
        api.getTasks(),
      ]);
      setTimeEntries(teData);
      setTasks(tData);
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
      await api.createTimeEntry({
        userId,
        taskId,
        date,
        hours: parseFloat(hours),
        description: description || undefined,
      });
      setIsCreating(false);
      setDescription('');
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to log time entry');
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await api.approveTimeEntry(id, 'pm-alice');
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to approve time entry');
    }
  };

  const handleReject = async (id: string) => {
    try {
      await api.rejectTimeEntry(id);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to reject time entry');
    }
  };

  const totalHours = timeEntries.reduce((sum, te) => sum + (Number(te.hours) || 0), 0);
  const approvedHours = timeEntries
    .filter((te) => te.status === 'APPROVED')
    .reduce((sum, te) => sum + (Number(te.hours) || 0), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Time Tracking & Timesheets</h1>
          <p className="text-sm text-gray-500">Log labor hours against project tasks, track team timesheets, and approve labor entries.</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
        >
          {isCreating ? 'Cancel' : '+ Log Timesheet Entry'}
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-4 gap-4">
        <div className="border rounded p-4 bg-white">
          <div className="text-xs uppercase font-semibold text-gray-500">Total Entries</div>
          <div className="text-2xl font-bold mt-1">{timeEntries.length}</div>
        </div>
        <div className="border rounded p-4 bg-white">
          <div className="text-xs uppercase font-semibold text-gray-500">Total Hours Logged</div>
          <div className="text-2xl font-bold mt-1 text-blue-700">{totalHours.toFixed(2)}h</div>
        </div>
        <div className="border rounded p-4 bg-white">
          <div className="text-xs uppercase font-semibold text-gray-500">Approved Labor Hours</div>
          <div className="text-2xl font-bold mt-1 text-green-700">{approvedHours.toFixed(2)}h</div>
        </div>
        <div className="border rounded p-4 bg-white">
          <div className="text-xs uppercase font-semibold text-gray-500">Pending Approval</div>
          <div className="text-2xl font-bold mt-1 text-yellow-700">
            {timeEntries.filter((te) => te.status === 'SUBMITTED').length} Entries
          </div>
        </div>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="p-4 border rounded bg-gray-50 space-y-4 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">Log Timesheet Record</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">User / Team Member *</label>
              <input
                type="text"
                required
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-mono font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Assigned Task *</label>
              <select
                required
                value={taskId}
                onChange={(e) => setTaskId(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-semibold"
              >
                <option value="">-- Select Task --</option>
                {tasks.map((t) => (
                  <option key={String(t.id)} value={String(t.id)}>
                    {String(t.taskNumber)} — {String(t.title)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Date *</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Hours Spent *</label>
              <input
                type="number"
                step="0.25"
                required
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-mono font-bold"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Work Description</label>
            <textarea
              rows={2}
              placeholder="Completed backend service implementation..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white"
            />
          </div>
          <button type="submit" className="px-4 py-2 bg-black text-white text-xs font-semibold rounded">
            Save Timesheet Entry
          </button>
        </form>
      )}

      <div className="border rounded overflow-hidden bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-100 uppercase text-gray-600 border-b">
            <tr>
              <th className="p-3">Date</th>
              <th className="p-3">User</th>
              <th className="p-3">Task ID</th>
              <th className="p-3">Hours Logged</th>
              <th className="p-3">Description</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {timeEntries.map((te) => (
              <tr key={String(te.id)} className="hover:bg-gray-50">
                <td className="p-3 font-mono text-gray-600">{new Date(String(te.date)).toLocaleDateString()}</td>
                <td className="p-3 font-mono font-bold text-gray-900">{String(te.userId)}</td>
                <td className="p-3 font-mono text-gray-700">{String(te.taskId)}</td>
                <td className="p-3 font-mono font-bold text-blue-700">{Number(te.hours).toFixed(2)}h</td>
                <td className="p-3 text-gray-700">{String(te.description || '—')}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    te.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                    te.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {String(te.status)}
                  </span>
                </td>
                <td className="p-3 text-right space-x-1">
                  {te.status === 'SUBMITTED' && (
                    <>
                      <button
                        onClick={() => handleApprove(String(te.id))}
                        className="px-2 py-1 bg-green-600 text-white text-[10px] font-bold rounded shadow hover:bg-green-700"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleReject(String(te.id))}
                        className="px-2 py-1 bg-red-100 text-red-700 text-[10px] font-bold rounded hover:bg-red-200"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {timeEntries.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-500">No time entries recorded.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

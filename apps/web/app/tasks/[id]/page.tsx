'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../../src/lib/api';

export default function TaskDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [task, setTask] = useState<Record<string, unknown> | null>(null);
  const [timeEntries, setTimeEntries] = useState<Record<string, unknown>[]>([]);
  const [isLoggingTime, setIsLoggingTime] = useState(false);

  // Time Form
  const [hours, setHours] = useState('4.00');
  const [description, setDescription] = useState('');

  const fetchDetails = useCallback(async () => {
    if (!id) return;
    try {
      const [tData, teData] = await Promise.all([
        api.getTask(id),
        api.getTimeEntries(undefined, id),
      ]);
      setTask(tData);
      setTimeEntries(teData);
    } catch (err: unknown) {
      console.error(err);
    }
  }, [id]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const handleLogTime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !task) return;
    try {
      await api.createTimeEntry({
        userId: String(task.assignedUser || 'dev-charlie'),
        taskId: id,
        date: new Date().toISOString().split('T')[0] || '',
        hours: parseFloat(hours),
        description: description || undefined,
      });
      setIsLoggingTime(false);
      setDescription('');
      fetchDetails();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to log time entry');
    }
  };

  const handleApproveTime = async (timeId: string) => {
    try {
      await api.approveTimeEntry(timeId, 'pm-alice');
      fetchDetails();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to approve time entry');
    }
  };

  if (!task) return <div className="p-6 text-sm text-gray-500">Loading task details...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start border-b pb-4">
        <div>
          <span className="text-xs font-mono uppercase text-gray-400">Project Task Item</span>
          <h1 className="text-2xl font-bold font-mono tracking-tight">{String(task.taskNumber)} — {String(task.title)}</h1>
          <p className="text-sm text-gray-600 font-mono">Assigned User: <strong className="text-gray-900">{String(task.assignedUser || 'Unassigned')}</strong></p>
        </div>
        <div>
          {task.status !== 'DONE' && task.status !== 'CANCELLED' && (
            <button
              onClick={() => setIsLoggingTime(!isLoggingTime)}
              className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
            >
              {isLoggingTime ? 'Cancel' : '+ Log Work Hours'}
            </button>
          )}
        </div>
      </div>

      {isLoggingTime && (
        <form onSubmit={handleLogTime} className="p-4 border rounded bg-gray-50 space-y-3 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">Log Timesheet Hours</h2>
          <div className="grid grid-cols-2 gap-3">
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
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                defaultValue={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Work Description</label>
            <textarea
              rows={2}
              placeholder="Summary of work completed..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white"
            />
          </div>
          <button type="submit" className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded">
            Submit Timesheet Entry
          </button>
        </form>
      )}

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-4 border rounded p-4 bg-white space-y-3 text-xs">
          <h2 className="font-bold uppercase tracking-wider text-gray-700 border-b pb-2">Task Details</h2>
          <p><span className="text-gray-500">Estimated Hours:</span> <strong className="font-mono text-gray-900">{Number(task.estimatedHours).toFixed(2)}h</strong></p>
          <p><span className="text-gray-500">Actual Hours Logged:</span> <strong className="font-mono text-blue-700">{Number(task.actualHours).toFixed(2)}h</strong></p>
          <p><span className="text-gray-500">Priority:</span> <strong className="text-gray-900">{String(task.priority)}</strong></p>
          <p><span className="text-gray-500">Status:</span> <strong className="font-bold text-gray-900">{String(task.status)}</strong></p>
        </div>

        <div className="col-span-8 border rounded p-4 bg-white space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700 border-b pb-2">Logged Time Entries</h2>
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-100 uppercase text-gray-600 border-b">
              <tr>
                <th className="p-2">Date</th>
                <th className="p-2">User</th>
                <th className="p-2">Hours</th>
                <th className="p-2">Description</th>
                <th className="p-2">Status</th>
                <th className="p-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {timeEntries.map((te) => (
                <tr key={String(te.id)} className="hover:bg-gray-50">
                  <td className="p-2 font-mono text-gray-600">{new Date(String(te.date)).toLocaleDateString()}</td>
                  <td className="p-2 font-mono text-gray-900 font-bold">{String(te.userId)}</td>
                  <td className="p-2 font-mono font-bold text-blue-700">{Number(te.hours).toFixed(2)}h</td>
                  <td className="p-2 text-gray-700">{String(te.description || '—')}</td>
                  <td className="p-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      te.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                      te.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {String(te.status)}
                    </span>
                  </td>
                  <td className="p-2 text-right">
                    {te.status === 'SUBMITTED' && (
                      <button
                        onClick={() => handleApproveTime(String(te.id))}
                        className="px-2 py-1 bg-green-600 text-white text-[10px] font-bold rounded shadow hover:bg-green-700"
                      >
                        Approve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {timeEntries.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-gray-500">No time entries logged against task.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

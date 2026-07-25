'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../../src/lib/api';

export default function ProjectDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [project, setProject] = useState<Record<string, unknown> | null>(null);
  const [tasks, setTasks] = useState<Record<string, unknown>[]>([]);
  const [isAddingMilestone, setIsAddingMilestone] = useState(false);
  const [isAddingTask, setIsAddingTask] = useState(false);

  // Milestone Form
  const [mName, setMName] = useState('');
  const [mDueDate, setMDueDate] = useState('');

  // Task Form
  const [tTitle, setTTitle] = useState('');
  const [tUser, setTUser] = useState('');
  const [tHours, setTHours] = useState('8.00');

  const fetchDetails = useCallback(async () => {
    if (!id) return;
    try {
      const [pData, tData] = await Promise.all([
        api.getProject(id),
        api.getTasks(id),
      ]);
      setProject(pData);
      setTasks(tData);
    } catch (err: unknown) {
      console.error(err);
    }
  }, [id]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const handleAddMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    try {
      await api.addProjectMilestone(id, {
        name: mName,
        dueDate: mDueDate,
      });
      setIsAddingMilestone(false);
      setMName('');
      fetchDetails();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to add milestone');
    }
  };

  const handleCompleteMilestone = async (milestoneId: string) => {
    if (!id) return;
    try {
      await api.completeProjectMilestone(id, milestoneId);
      fetchDetails();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to complete milestone');
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    try {
      await api.createTask({
        projectId: id,
        title: tTitle,
        assignedUser: tUser || undefined,
        estimatedHours: parseFloat(tHours),
      });
      setIsAddingTask(false);
      setTTitle('');
      fetchDetails();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create task');
    }
  };

  const handleCompleteProject = async () => {
    if (!id) return;
    try {
      await api.completeProject(id);
      fetchDetails();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to complete project');
    }
  };

  if (!project) return <div className="p-6 text-sm text-gray-500">Loading project details...</div>;

  const milestones = (project.milestones as Record<string, unknown>[]) || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start border-b pb-4">
        <div>
          <span className="text-xs font-mono uppercase text-gray-400">Project Delivery Workspace</span>
          <h1 className="text-2xl font-bold font-mono tracking-tight">{String(project.projectNumber)} — {String(project.name)}</h1>
          <p className="text-xs text-gray-500 font-mono">Manager: {String(project.projectManager)} | Sales Order ID: {String(project.salesOrderId)}</p>
        </div>
        <div className="flex gap-2">
          {project.status === 'ACTIVE' && (
            <button
              onClick={handleCompleteProject}
              className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded shadow hover:bg-green-700"
            >
              Complete Project
            </button>
          )}
          <button
            onClick={() => setIsAddingMilestone(!isAddingMilestone)}
            className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
          >
            {isAddingMilestone ? 'Cancel' : '+ Add Milestone'}
          </button>
          <button
            onClick={() => setIsAddingTask(!isAddingTask)}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700"
          >
            {isAddingTask ? 'Cancel' : '+ New Task'}
          </button>
        </div>
      </div>

      {isAddingMilestone && (
        <form onSubmit={handleAddMilestone} className="p-4 border rounded bg-gray-50 space-y-3 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">Add Deliverable Milestone</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Milestone Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. System Integration Testing"
                value={mName}
                onChange={(e) => setMName(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Due Date *</label>
              <input
                type="date"
                required
                value={mDueDate}
                onChange={(e) => setMDueDate(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white"
              />
            </div>
          </div>
          <button type="submit" className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded">
            Save Milestone
          </button>
        </form>
      )}

      {isAddingTask && (
        <form onSubmit={handleAddTask} className="p-4 border rounded bg-blue-50 space-y-3 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-blue-900">Add Project Task</h2>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Task Title *</label>
            <input
              type="text"
              required
              placeholder="e.g. Configure API endpoints"
              value={tTitle}
              onChange={(e) => setTTitle(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white font-bold"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Assigned User</label>
              <input
                type="text"
                placeholder="dev-charlie"
                value={tUser}
                onChange={(e) => setTUser(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Estimated Hours *</label>
              <input
                type="number"
                required
                value={tHours}
                onChange={(e) => setTHours(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-mono font-bold"
              />
            </div>
          </div>
          <button type="submit" className="px-3 py-1.5 bg-blue-700 text-white text-xs font-semibold rounded">
            Save Task
          </button>
        </form>
      )}

      {/* Gantt-style Milestone Timeline */}
      <div className="border rounded bg-white p-4 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700 border-b pb-2">Milestone Deliverable Timeline</h2>
        <div className="space-y-3">
          {milestones.map((m) => (
            <div key={String(m.id)} className="p-3 border rounded bg-gray-50 flex justify-between items-center text-xs">
              <div className="space-y-1">
                <div className="font-bold text-gray-900">{String(m.name)}</div>
                <div className="text-[10px] text-gray-500 font-mono">Due: {new Date(String(m.dueDate)).toLocaleDateString()}</div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-32 bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-green-600 h-2 rounded-full"
                    style={{ width: `${Number(m.completionPercentage)}%` }}
                  />
                </div>
                <span className="font-mono text-xs font-bold text-gray-700">{Number(m.completionPercentage)}%</span>
                {m.status === 'OPEN' && (
                  <button
                    onClick={() => handleCompleteMilestone(String(m.id))}
                    className="px-2 py-1 bg-green-600 text-white text-[10px] font-bold rounded shadow hover:bg-green-700"
                  >
                    Mark Done
                  </button>
                )}
              </div>
            </div>
          ))}
          {milestones.length === 0 && (
            <div className="text-xs text-gray-400 py-2">No milestones defined for this project.</div>
          )}
        </div>
      </div>

      {/* Associated Project Tasks */}
      <div className="border rounded bg-white p-4 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700 border-b pb-2">Project Work Tasks</h2>
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-100 uppercase text-gray-600 border-b">
            <tr>
              <th className="p-2">Task #</th>
              <th className="p-2">Title</th>
              <th className="p-2">Assigned User</th>
              <th className="p-2">Est. Hours</th>
              <th className="p-2">Actual Hours</th>
              <th className="p-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {tasks.map((t) => (
              <tr key={String(t.id)} className="hover:bg-gray-50">
                <td className="p-2 font-mono font-bold text-gray-900">{String(t.taskNumber)}</td>
                <td className="p-2 font-semibold text-gray-900">
                  <Link href={`/tasks/${String(t.id)}`} className="text-blue-600 hover:underline">
                    {String(t.title)}
                  </Link>
                </td>
                <td className="p-2 font-mono text-gray-700">{String(t.assignedUser || 'Unassigned')}</td>
                <td className="p-2 font-mono font-bold">{Number(t.estimatedHours).toFixed(2)}h</td>
                <td className="p-2 font-mono font-bold text-blue-700">{Number(t.actualHours).toFixed(2)}h</td>
                <td className="p-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    t.status === 'DONE' ? 'bg-green-100 text-green-800' :
                    t.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' :
                    t.status === 'BLOCKED' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {String(t.status)}
                  </span>
                </td>
              </tr>
            ))}
            {tasks.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-500">No tasks created yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

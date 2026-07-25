'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../src/lib/api';

const TASK_STAGES = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'];

export default function TasksPage() {
  const [tasks, setTasks] = useState<Record<string, unknown>[]>([]);
  const [projects, setProjects] = useState<Record<string, unknown>[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedUser, setAssignedUser] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('8.00');

  const fetchData = useCallback(async () => {
    try {
      const [tData, pData] = await Promise.all([
        api.getTasks(),
        api.getProjects(),
      ]);
      setTasks(tData);
      setProjects(pData);
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
      await api.createTask({
        projectId,
        title,
        description: description || undefined,
        assignedUser: assignedUser || undefined,
        estimatedHours: parseFloat(estimatedHours),
      });
      setIsCreating(false);
      setTitle('');
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create task');
    }
  };

  const handleStart = async (id: string) => {
    try {
      await api.startTask(id);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to start task');
    }
  };

  const handleComplete = async (id: string) => {
    try {
      await api.completeTask(id);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to complete task');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Cross-Project Task Board</h1>
          <p className="text-sm text-gray-500">Track assigned team tasks, hours estimation, execution status, and blockers.</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
        >
          {isCreating ? 'Cancel' : '+ New Work Task'}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="p-4 border rounded bg-gray-50 space-y-4 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">Create Task Item</h2>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Target Project *</label>
            <select
              required
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white font-semibold"
            >
              <option value="">-- Select Project --</option>
              {projects.map((p) => (
                <option key={String(p.id)} value={String(p.id)}>{String(p.name)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Task Title *</label>
            <input
              type="text"
              required
              placeholder="e.g. Implement API controllers"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white font-bold"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Assigned User</label>
              <input
                type="text"
                placeholder="dev-charlie"
                value={assignedUser}
                onChange={(e) => setAssignedUser(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Estimated Hours *</label>
              <input
                type="number"
                required
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-mono font-bold"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Task Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white"
            />
          </div>
          <button type="submit" className="px-4 py-2 bg-black text-white text-xs font-semibold rounded">
            Save Task Item
          </button>
        </form>
      )}

      {/* Task Kanban Columns */}
      <div className="grid grid-cols-5 gap-3 overflow-x-auto pb-4">
        {TASK_STAGES.map((stage) => {
          const tasksInStage = tasks.filter((t) => t.status === stage);
          return (
            <div key={stage} className="border rounded bg-gray-50 p-2 space-y-2 min-w-[220px]">
              <div className="border-b pb-2 flex justify-between items-center">
                <span className="font-bold text-xs uppercase tracking-wider text-gray-800">{stage}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 font-bold">
                  {tasksInStage.length}
                </span>
              </div>

              <div className="space-y-2 min-h-[300px]">
                {tasksInStage.map((task) => (
                  <div key={String(task.id)} className="p-3 border rounded bg-white shadow-sm hover:shadow transition space-y-2 text-xs">
                    <div className="font-mono text-[10px] text-gray-400 font-bold">{String(task.taskNumber)}</div>
                    <div className="font-bold text-gray-900 leading-snug">
                      <Link href={`/tasks/${String(task.id)}`} className="text-blue-600 hover:underline">
                        {String(task.title)}
                      </Link>
                    </div>
                    <div className="flex justify-between items-center text-[10px] font-mono border-t pt-1 text-gray-600">
                      <span>User: {String(task.assignedUser || 'Unassigned')}</span>
                      <span className="font-bold text-blue-800">{Number(task.actualHours).toFixed(1)} / {Number(task.estimatedHours).toFixed(1)}h</span>
                    </div>

                    {stage === 'TODO' && (
                      <button
                        onClick={() => handleStart(String(task.id))}
                        className="w-full mt-1 py-1 bg-blue-600 text-white text-[10px] font-bold rounded hover:bg-blue-700"
                      >
                        Start Task
                      </button>
                    )}
                    {stage === 'IN_PROGRESS' && (
                      <button
                        onClick={() => handleComplete(String(task.id))}
                        className="w-full mt-1 py-1 bg-green-600 text-white text-[10px] font-bold rounded hover:bg-green-700"
                      >
                        Complete Task
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

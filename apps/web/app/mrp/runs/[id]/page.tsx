'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../../../src/lib/api';

export default function PlanningRunDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [run, setRun] = useState<Record<string, unknown> | null>(null);
  const [messages, setMessages] = useState<Record<string, unknown>[]>([]);
  const [requirements, setRequirements] = useState<Record<string, unknown>[]>([]);
  const [purchases, setPurchases] = useState<Record<string, unknown>[]>([]);
  const [productions, setProductions] = useState<Record<string, unknown>[]>([]);
  const [capacityPlans, setCapacityPlans] = useState<Record<string, unknown>[]>([]);

  const fetchDetails = useCallback(async () => {
    if (!id) return;
    try {
      const [rData, mData, reqData, purData, prodData, capData] = await Promise.all([
        api.getPlanningRun(id),
        api.getPlanningMessages(id),
        api.getMaterialRequirements(id),
        api.getPurchaseRecommendations(id),
        api.getProductionRecommendations(id),
        api.getCapacityPlans(id),
      ]);
      setRun(rData);
      setMessages(mData);
      setRequirements(reqData);
      setPurchases(purData);
      setProductions(prodData);
      setCapacityPlans(capData);
    } catch (err: unknown) {
      console.error(err);
    }
  }, [id]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  if (!run) return <div className="p-6 text-sm text-gray-500">Loading planning run details...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start border-b pb-4">
        <div>
          <span className="text-xs font-mono uppercase text-gray-400">MRP Execution Workspace</span>
          <h1 className="text-2xl font-bold font-mono tracking-tight">{String(run.runNumber)}</h1>
          <p className="text-xs text-gray-500 font-mono">Horizon: {String(run.horizonDays)} Days | Started By: {String(run.startedBy)}</p>
        </div>
        <div>
          <span className={`px-3 py-1 rounded text-xs font-bold ${
            run.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
            run.status === 'RUNNING' ? 'bg-blue-100 text-blue-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {String(run.status)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="p-3 border rounded bg-white font-mono text-xs">
          <span className="text-gray-500 block">Requirements Evaluated</span>
          <strong className="text-base text-gray-900">{requirements.length}</strong>
        </div>
        <div className="p-3 border rounded bg-white font-mono text-xs">
          <span className="text-gray-500 block">Purchase Recs Generated</span>
          <strong className="text-base text-blue-700">{purchases.length}</strong>
        </div>
        <div className="p-3 border rounded bg-white font-mono text-xs">
          <span className="text-gray-500 block">Production Recs Generated</span>
          <strong className="text-base text-purple-700">{productions.length}</strong>
        </div>
        <div className="p-3 border rounded bg-white font-mono text-xs">
          <span className="text-gray-500 block">Work Center Capacity Plans</span>
          <strong className="text-base text-gray-900">{capacityPlans.length}</strong>
        </div>
      </div>

      <div className="border rounded p-4 bg-white space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700 border-b pb-2">Execution Log & Audit Messages ({messages.length})</h2>
        <div className="space-y-2 max-h-60 overflow-y-auto font-mono text-xs">
          {messages.map((m) => (
            <div key={String(m.id)} className={`p-2 border rounded ${
              m.severity === 'ERROR' ? 'bg-red-50 border-red-200 text-red-900' :
              m.severity === 'WARNING' ? 'bg-yellow-50 border-yellow-200 text-yellow-900' :
              'bg-gray-50 border-gray-200 text-gray-800'
            }`}>
              <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                <span className="font-bold">{String(m.severity)}</span>
                <span>{new Date(String(m.createdAt)).toLocaleString()}</span>
              </div>
              <p>{String(m.message)}</p>
            </div>
          ))}
          {messages.length === 0 && (
            <div className="text-gray-400 py-2 text-center">No log messages recorded.</div>
          )}
        </div>
      </div>
    </div>
  );
}

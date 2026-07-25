'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../src/lib/api';

const PIPELINE_STAGES = [
  'PROSPECTING',
  'QUALIFICATION',
  'PROPOSAL',
  'NEGOTIATION',
  'WON',
  'LOST',
];

export default function OpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<Record<string, unknown>[]>([]);
  const [accounts, setAccounts] = useState<Record<string, unknown>[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [crmAccountId, setCrmAccountId] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('100000.00');
  const [expectedCloseDate, setExpectedCloseDate] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [oData, aData] = await Promise.all([
        api.getOpportunities(),
        api.getCrmAccounts(),
      ]);
      setOpportunities(oData);
      setAccounts(aData);
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
      await api.createOpportunity({
        name,
        crmAccountId,
        estimatedValue: parseFloat(estimatedValue),
        expectedCloseDate,
      });
      setIsCreating(false);
      setName('');
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create opportunity');
    }
  };

  const handleAdvance = async (id: string, currentStage: string) => {
    const stageFlow: Record<string, string> = {
      PROSPECTING: 'QUALIFICATION',
      QUALIFICATION: 'PROPOSAL',
      PROPOSAL: 'NEGOTIATION',
      NEGOTIATION: 'WON',
    };
    const nextStage = stageFlow[currentStage];
    if (!nextStage) return;

    try {
      if (nextStage === 'WON') {
        const result = await api.winOpportunity(id) as Record<string, unknown>;
        alert(`Opportunity WON! Handed off to Sales context for Quotation draft creation.`);
        if (result.quotationId) {
          window.location.href = `/quotations/${String(result.quotationId)}`;
          return;
        }
      } else {
        await api.advanceOpportunityStage(id, nextStage);
      }
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to advance opportunity stage');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Opportunity Pipeline & Kanban</h1>
          <p className="text-sm text-gray-500">Track deal stages, estimated contract value, win probabilities, and sales quotation handoff.</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800"
        >
          {isCreating ? 'Cancel' : '+ New Opportunity Deal'}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="p-4 border rounded bg-gray-50 space-y-4 max-w-xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">Create Opportunity</h2>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Opportunity / Deal Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Enterprise ERP Platform Deployment"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white font-bold"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Target CRM Account *</label>
            <select
              required
              value={crmAccountId}
              onChange={(e) => setCrmAccountId(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded bg-white font-semibold"
            >
              <option value="">-- Select CRM Account --</option>
              {accounts.map((a) => (
                <option key={String(a.id)} value={String(a.id)}>{String(a.companyName)}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Estimated Deal Value ($) *</label>
              <input
                type="number"
                required
                value={estimatedValue}
                onChange={(e) => setEstimatedValue(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white font-mono font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Expected Close Date *</label>
              <input
                type="date"
                required
                value={expectedCloseDate}
                onChange={(e) => setExpectedCloseDate(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border rounded bg-white"
              />
            </div>
          </div>
          <button type="submit" className="px-4 py-2 bg-black text-white text-xs font-semibold rounded">
            Save Opportunity
          </button>
        </form>
      )}

      {/* Kanban Pipeline Columns */}
      <div className="grid grid-cols-6 gap-3 overflow-x-auto pb-4">
        {PIPELINE_STAGES.map((stage) => {
          const dealsInStage = opportunities.filter((o) => o.stage === stage);
          const stageTotal = dealsInStage.reduce((sum, o) => sum + (Number(o.estimatedValue) || 0), 0);
          return (
            <div key={stage} className="border rounded bg-gray-50 p-2 space-y-2 min-w-[200px]">
              <div className="border-b pb-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-xs uppercase tracking-wider text-gray-800">{stage}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 font-bold">
                    {dealsInStage.length}
                  </span>
                </div>
                <div className="text-[11px] font-mono font-bold text-gray-600 mt-1">
                  ${stageTotal.toLocaleString()}
                </div>
              </div>

              <div className="space-y-2 min-h-[300px]">
                {dealsInStage.map((opp) => {
                  const acc = accounts.find((a) => a.id === opp.crmAccountId);
                  return (
                    <div key={String(opp.id)} className="p-3 border rounded bg-white shadow-sm hover:shadow transition space-y-2 text-xs">
                      <div className="font-bold text-gray-900 leading-snug">
                        <Link href={`/opportunities/${String(opp.id)}`} className="text-blue-600 hover:underline">
                          {String(opp.name)}
                        </Link>
                      </div>
                      <div className="text-gray-500 font-semibold text-[11px]">{String(acc?.companyName ?? 'Account')}</div>
                      <div className="flex justify-between items-center pt-1 border-t">
                        <span className="font-mono font-bold text-gray-900">${Number(opp.estimatedValue).toLocaleString()}</span>
                        <span className="text-[10px] font-mono text-gray-500">{Number(opp.probability)}%</span>
                      </div>
                      {stage !== 'WON' && stage !== 'LOST' && (
                        <button
                          onClick={() => handleAdvance(String(opp.id), String(opp.stage))}
                          className="w-full mt-1 py-1 bg-gray-900 text-white text-[10px] font-bold rounded hover:bg-black"
                        >
                          Advance Stage &rarr;
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

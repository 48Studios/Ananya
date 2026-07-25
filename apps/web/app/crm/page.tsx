'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../src/lib/api';

export default function CrmDashboardPage() {
  const [leads, setLeads] = useState<Record<string, unknown>[]>([]);
  const [accounts, setAccounts] = useState<Record<string, unknown>[]>([]);
  const [opportunities, setOpportunities] = useState<Record<string, unknown>[]>([]);
  const [activities, setActivities] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [lData, aData, oData, actData] = await Promise.all([
        api.getLeads().catch(() => []),
        api.getCrmAccounts().catch(() => []),
        api.getOpportunities().catch(() => []),
        api.getActivities().catch(() => []),
      ]);
      setLeads(lData);
      setAccounts(aData);
      setOpportunities(oData);
      setActivities(actData);
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const pipelineValue = opportunities
    .filter((o) => o.stage !== 'LOST')
    .reduce((sum, o) => sum + (Number(o.estimatedValue) || 0), 0);

  const wonValue = opportunities
    .filter((o) => o.stage === 'WON')
    .reduce((sum, o) => sum + (Number(o.estimatedValue) || 0), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Customer Relationship Management (CRM)</h1>
          <p className="text-sm text-gray-500">Lead qualification, pre-sales accounts, deal pipeline, and activity management.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/leads" className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800">
            + New Lead
          </Link>
          <Link href="/opportunities" className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700">
            Pipeline Kanban
          </Link>
        </div>
      </div>

      {/* CRM Summary Metrics */}
      <div className="grid grid-cols-5 gap-4">
        <div className="border rounded p-4 bg-white">
          <div className="text-xs uppercase font-semibold text-gray-500">Active Leads</div>
          <div className="text-2xl font-bold mt-1">{loading ? '...' : leads.length}</div>
          <div className="text-xs text-blue-600 font-semibold mt-1">
            {leads.filter((l) => l.status === 'NEW' || l.status === 'QUALIFIED').length} In Pipeline
          </div>
        </div>
        <div className="border rounded p-4 bg-white">
          <div className="text-xs uppercase font-semibold text-gray-500">CRM Accounts</div>
          <div className="text-2xl font-bold mt-1">{loading ? '...' : accounts.length}</div>
          <div className="text-xs text-gray-500 mt-1">Prospect Companies</div>
        </div>
        <div className="border rounded p-4 bg-white">
          <div className="text-xs uppercase font-semibold text-gray-500">Scheduled Activities</div>
          <div className="text-2xl font-bold mt-1">{loading ? '...' : activities.length}</div>
          <div className="text-xs text-purple-700 font-semibold mt-1">
            {activities.filter((act) => act.status === 'SCHEDULED').length} Pending Tasks
          </div>
        </div>
        <div className="border rounded p-4 bg-white">
          <div className="text-xs uppercase font-semibold text-gray-500">Pipeline Forecast</div>
          <div className="text-2xl font-bold mt-1 text-green-700">${loading ? '...' : pipelineValue.toFixed(2)}</div>
          <div className="text-xs text-gray-500 mt-1">Total Estimated Value</div>
        </div>
        <div className="border rounded p-4 bg-white">
          <div className="text-xs uppercase font-semibold text-gray-500">Won Revenue</div>
          <div className="text-2xl font-bold mt-1 text-blue-700">${loading ? '...' : wonValue.toFixed(2)}</div>
          <div className="text-xs text-green-700 font-semibold mt-1">
            Handed off to Sales
          </div>
        </div>
      </div>

      {/* CRM Navigation Modules */}
      <div className="grid grid-cols-4 gap-4">
        <Link href="/leads" className="border rounded p-4 bg-gray-50 hover:bg-white hover:shadow-sm transition block">
          <h3 className="font-bold text-sm text-gray-900">1. Lead Management</h3>
          <p className="text-xs text-gray-500 mt-1">Inbound leads, qualification & conversion.</p>
        </Link>
        <Link href="/accounts" className="border rounded p-4 bg-gray-50 hover:bg-white hover:shadow-sm transition block">
          <h3 className="font-bold text-sm text-gray-900">2. Accounts & Contacts</h3>
          <p className="text-xs text-gray-500 mt-1">Pre-sales prospect companies & key decision makers.</p>
        </Link>
        <Link href="/opportunities" className="border rounded p-4 bg-gray-50 hover:bg-white hover:shadow-sm transition block">
          <h3 className="font-bold text-sm text-gray-900">3. Opportunity Pipeline</h3>
          <p className="text-xs text-gray-500 mt-1">Kanban deal progression & sales quotation handoff.</p>
        </Link>
        <Link href="/activities" className="border rounded p-4 bg-gray-50 hover:bg-white hover:shadow-sm transition block">
          <h3 className="font-bold text-sm text-gray-900">4. Activities & Tasks</h3>
          <p className="text-xs text-gray-500 mt-1">Calls, meetings, emails & scheduled touchpoints.</p>
        </Link>
      </div>

      {/* Active Pipeline Deals Table */}
      <div className="border rounded bg-white p-4 space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700">Active CRM Opportunity Pipeline</h2>
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-100 uppercase text-gray-600 border-b">
            <tr>
              <th className="p-3">Deal #</th>
              <th className="p-3">Deal Name</th>
              <th className="p-3">Stage</th>
              <th className="p-3">Est. Value</th>
              <th className="p-3">Win Prob.</th>
              <th className="p-3">Expected Close</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {opportunities.map((opp) => (
              <tr key={String(opp.id)} className="hover:bg-gray-50">
                <td className="p-3 font-mono font-bold">{String(opp.opportunityNumber)}</td>
                <td className="p-3 font-semibold text-gray-900">
                  <Link href={`/opportunities/${String(opp.id)}`} className="text-blue-600 hover:underline">
                    {String(opp.name)}
                  </Link>
                </td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    opp.stage === 'WON' ? 'bg-green-100 text-green-800' :
                    opp.stage === 'LOST' ? 'bg-red-100 text-red-800' :
                    opp.stage === 'NEGOTIATION' ? 'bg-purple-100 text-purple-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {String(opp.stage)}
                  </span>
                </td>
                <td className="p-3 font-mono font-bold text-gray-900">${Number(opp.estimatedValue).toFixed(2)}</td>
                <td className="p-3 font-mono">{Number(opp.probability)}%</td>
                <td className="p-3 text-gray-600">{new Date(String(opp.expectedCloseDate)).toLocaleDateString()}</td>
              </tr>
            ))}
            {opportunities.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-500">No opportunities in pipeline.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

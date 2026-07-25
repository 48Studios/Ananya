'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../../src/lib/api';

export default function OpportunityDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [opportunity, setOpportunity] = useState<Record<string, unknown> | null>(null);
  const [notes, setNotes] = useState<Record<string, unknown>[]>([]);
  const [newNoteBody, setNewNoteBody] = useState('');
  const [lostReason, setLostReason] = useState('');
  const [isLosing, setIsLosing] = useState(false);

  const fetchDetails = useCallback(async () => {
    if (!id) return;
    try {
      const [oData, nData] = await Promise.all([
        api.getOpportunity(id),
        api.getNotes(undefined, undefined, id),
      ]);
      setOpportunity(oData);
      setNotes(nData);
    } catch (err: unknown) {
      console.error(err);
    }
  }, [id]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const handleWin = async () => {
    if (!id) return;
    try {
      const result = await api.winOpportunity(id) as Record<string, unknown>;
      alert('Opportunity marked WON! Handoff complete to Sales context.');
      if (result.quotationId) {
        window.location.href = `/quotations/${String(result.quotationId)}`;
      } else {
        fetchDetails();
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to mark opportunity Won');
    }
  };

  const handleLose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !lostReason.trim()) return;
    try {
      await api.loseOpportunity(id, lostReason);
      setIsLosing(false);
      fetchDetails();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to mark opportunity Lost');
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteBody.trim() || !id) return;
    try {
      await api.createNote({
        author: 'rep-1',
        body: newNoteBody,
        opportunityId: id,
      });
      setNewNoteBody('');
      fetchDetails();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to attach note');
    }
  };

  if (!opportunity) return <div className="p-6 text-sm text-gray-500">Loading opportunity details...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start border-b pb-4">
        <div>
          <span className="text-xs font-mono uppercase text-gray-400">Opportunity Deal</span>
          <h1 className="text-2xl font-bold font-mono tracking-tight">{String(opportunity.opportunityNumber)} — {String(opportunity.name)}</h1>
          <p className="text-sm font-semibold text-gray-700">Stage: <span className="font-bold text-blue-600">{String(opportunity.stage)}</span></p>
        </div>
        <div className="flex gap-2">
          {opportunity.stage !== 'WON' && opportunity.stage !== 'LOST' && (
            <>
              <button
                onClick={handleWin}
                className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded shadow hover:bg-green-700"
              >
                Mark Won & Hand Off to Sales
              </button>
              <button
                onClick={() => setIsLosing(!isLosing)}
                className="px-3 py-1.5 bg-red-100 text-red-700 text-xs font-bold rounded hover:bg-red-200"
              >
                Mark Lost
              </button>
            </>
          )}
        </div>
      </div>

      {isLosing && (
        <form onSubmit={handleLose} className="p-4 border rounded bg-red-50 space-y-3 max-w-xl">
          <h2 className="text-xs font-bold uppercase text-red-800">Close Opportunity as Lost</h2>
          <textarea
            required
            rows={2}
            placeholder="Specify reason for lost deal..."
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
            className="w-full p-2 text-xs border rounded bg-white"
          />
          <button type="submit" className="px-3 py-1.5 bg-red-700 text-white text-xs font-bold rounded">
            Confirm Close Lost
          </button>
        </form>
      )}

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-4 border rounded p-4 bg-white space-y-3 text-xs">
          <h2 className="font-bold uppercase tracking-wider text-gray-700 border-b pb-2">Deal Summary</h2>
          <p><span className="text-gray-500">Estimated Value:</span> <strong className="font-mono text-sm text-gray-900">${Number(opportunity.estimatedValue).toFixed(2)}</strong></p>
          <p><span className="text-gray-500">Win Probability:</span> <strong className="font-mono text-gray-900">{Number(opportunity.probability)}%</strong></p>
          <p><span className="text-gray-500">Expected Close:</span> <strong className="text-gray-900">{new Date(String(opportunity.expectedCloseDate)).toLocaleDateString()}</strong></p>
          {Boolean(opportunity.lostReason) && (
            <p><span className="text-red-500 font-semibold">Lost Reason:</span> <strong className="text-red-800">{String(opportunity.lostReason)}</strong></p>
          )}
        </div>

        <div className="col-span-8 border rounded p-4 bg-white space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700 border-b pb-2">Deal Activity & Notes Log</h2>
          
          <form onSubmit={handleAddNote} className="space-y-2">
            <textarea
              required
              rows={3}
              placeholder="Record deal negotiation note or meeting feedback..."
              value={newNoteBody}
              onChange={(e) => setNewNoteBody(e.target.value)}
              className="w-full p-2 text-xs border rounded bg-gray-50"
            />
            <button type="submit" className="px-3 py-1.5 bg-gray-900 text-white text-xs font-semibold rounded">
              + Post Note
            </button>
          </form>

          <div className="space-y-2">
            {notes.map((n) => (
              <div key={String(n.id)} className="p-3 border rounded bg-gray-50 text-xs space-y-1">
                <div className="flex justify-between text-gray-500 font-mono text-[10px]">
                  <span>{String(n.author)}</span>
                  <span>{new Date(String(n.createdAt)).toLocaleString()}</span>
                </div>
                <p className="text-gray-800 font-medium">{String(n.body)}</p>
              </div>
            ))}
            {notes.length === 0 && (
              <div className="text-xs text-gray-400 py-2">No notes recorded for this deal.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

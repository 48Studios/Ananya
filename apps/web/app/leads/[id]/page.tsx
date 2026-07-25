'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../../src/lib/api';

export default function LeadDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [lead, setLead] = useState<Record<string, unknown> | null>(null);
  const [notes, setNotes] = useState<Record<string, unknown>[]>([]);
  const [newNoteBody, setNewNoteBody] = useState('');

  const fetchDetails = useCallback(async () => {
    if (!id) return;
    try {
      const [lData, nData] = await Promise.all([
        api.getLead(id),
        api.getNotes(id),
      ]);
      setLead(lData);
      setNotes(nData);
    } catch (err: unknown) {
      console.error(err);
    }
  }, [id]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteBody.trim() || !id) return;
    try {
      await api.createNote({
        author: String(lead?.owner || 'rep-1'),
        body: newNoteBody,
        leadId: id,
      });
      setNewNoteBody('');
      fetchDetails();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to attach note');
    }
  };

  if (!lead) return <div className="p-6 text-sm text-gray-500">Loading lead details...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start border-b pb-4">
        <div>
          <span className="text-xs font-mono uppercase text-gray-400">Lead Record</span>
          <h1 className="text-2xl font-bold font-mono tracking-tight">{String(lead.leadNumber)} — {String(lead.name)}</h1>
          <p className="text-sm font-semibold text-gray-700">{String(lead.company)}</p>
        </div>
        <div>
          <span className={`px-3 py-1 rounded text-xs font-bold ${
            lead.status === 'CONVERTED' ? 'bg-green-100 text-green-800' :
            lead.status === 'QUALIFIED' ? 'bg-blue-100 text-blue-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {String(lead.status)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-4 border rounded p-4 bg-white space-y-3 text-xs">
          <h2 className="font-bold uppercase tracking-wider text-gray-700 border-b pb-2">Lead Information</h2>
          <p><span className="text-gray-500">Email:</span> <strong className="text-gray-900">{String(lead.email || '—')}</strong></p>
          <p><span className="text-gray-500">Phone:</span> <strong className="text-gray-900">{String(lead.phone || '—')}</strong></p>
          <p><span className="text-gray-500">Source:</span> <strong className="font-mono text-gray-900">{String(lead.source)}</strong></p>
          <p><span className="text-gray-500">Industry:</span> <strong className="text-gray-900">{String(lead.industry || '—')}</strong></p>
          <p><span className="text-gray-500">Owner:</span> <strong className="font-mono text-gray-900">{String(lead.owner)}</strong></p>
        </div>

        <div className="col-span-8 border rounded p-4 bg-white space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700 border-b pb-2">Interaction Notes & History</h2>
          
          <form onSubmit={handleAddNote} className="space-y-2">
            <textarea
              required
              rows={3}
              placeholder="Add observation or interaction note..."
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
              <div className="text-xs text-gray-400 py-2">No notes attached to lead.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

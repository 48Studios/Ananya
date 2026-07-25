'use client';

import React from 'react';

export default function BankAccountsPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Corporate Bank Accounts</h1>
          <p className="text-sm text-gray-500">Corporate bank accounts, GL account linkage, and currency settings.</p>
        </div>
      </div>

      <div className="border rounded p-6 bg-white space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700">Bank Accounts Master</h2>
        <div className="grid grid-cols-3 gap-4 text-xs">
          <div className="border rounded p-4 bg-gray-50 space-y-2">
            <h3 className="font-bold text-sm text-gray-900">Silicon Valley Bank — Operating</h3>
            <p className="text-gray-500">Acc #: <span className="font-mono font-bold text-gray-800">**** 4921</span></p>
            <p className="text-gray-500">Currency: <span className="font-bold">USD ($)</span></p>
            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-800">ACTIVE</span>
          </div>
          <div className="border rounded p-4 bg-gray-50 space-y-2">
            <h3 className="font-bold text-sm text-gray-900">JPMorgan Chase — Payroll</h3>
            <p className="text-gray-500">Acc #: <span className="font-mono font-bold text-gray-800">**** 8830</span></p>
            <p className="text-gray-500">Currency: <span className="font-bold">USD ($)</span></p>
            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-800">ACTIVE</span>
          </div>
          <div className="border rounded p-4 bg-gray-50 space-y-2">
            <h3 className="font-bold text-sm text-gray-900">Barclays Bank — International</h3>
            <p className="text-gray-500">Acc #: <span className="font-mono font-bold text-gray-800">**** 1092</span></p>
            <p className="text-gray-500">Currency: <span className="font-bold">EUR (€)</span></p>
            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-800">ACTIVE</span>
          </div>
        </div>
      </div>
    </div>
  );
}

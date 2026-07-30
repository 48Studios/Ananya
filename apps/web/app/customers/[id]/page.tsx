'use client'

import { use } from 'react'

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-1">
          Customers #{id}
        </h1>
        <p className="text-muted-foreground text-sm">
          UI under reconstruction for feature module
        </p>
      </div>
      <div className="bg-card border border-border rounded-lg p-6">
        <p className="text-sm text-muted-foreground">
          This record view is queued for feature migration onto the new v0 UI shell.
        </p>
      </div>
    </div>
  )
}

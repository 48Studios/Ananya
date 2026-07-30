'use client'

import { Search, Plus, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function InventoryPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Inventory Overview
          </h1>
          <p className="text-muted-foreground">
            Manage components, categories, and warehouse locations.
          </p>
        </div>
        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground w-full md:w-auto">
          <Plus className="w-4 h-4 mr-2" />
          Add Item
        </Button>
      </div>

      {/* Search and Filter */}
      <div className="flex gap-4">
        <div className="flex-1 flex items-center gap-2 bg-input rounded-lg px-3 py-2">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <input
            type="text"
            placeholder="Search items..."
            className="bg-transparent text-sm outline-none w-full text-foreground placeholder-muted-foreground"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-input/50">
                <th className="px-6 py-3 text-left font-medium text-foreground">
                  Item Code
                </th>
                <th className="px-6 py-3 text-left font-medium text-foreground">
                  Description
                </th>
                <th className="px-6 py-3 text-left font-medium text-foreground">
                  Category
                </th>
                <th className="px-6 py-3 text-left font-medium text-foreground">
                  Quantity
                </th>
                <th className="px-6 py-3 text-left font-medium text-foreground">
                  Status
                </th>
                <th className="px-6 py-3 text-right font-medium text-foreground">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                {
                  code: 'INV-001',
                  description: 'Microcontroller Unit',
                  category: 'Components',
                  quantity: 245,
                  status: 'In Stock',
                },
                {
                  code: 'INV-002',
                  description: 'Resistor Pack',
                  category: 'Components',
                  quantity: 1020,
                  status: 'In Stock',
                },
                {
                  code: 'INV-003',
                  description: 'Power Supply Module',
                  category: 'Modules',
                  quantity: 45,
                  status: 'Low Stock',
                },
                {
                  code: 'INV-004',
                  description: 'PCB Assembly',
                  category: 'Assemblies',
                  quantity: 0,
                  status: 'Out of Stock',
                },
                {
                  code: 'INV-005',
                  description: 'Connector Kit',
                  category: 'Components',
                  quantity: 156,
                  status: 'In Stock',
                },
              ].map((item) => (
                <tr
                  key={item.code}
                  className="border-b border-border hover:bg-input/50 transition-colors"
                >
                  <td className="px-6 py-4 font-medium text-foreground">
                    {item.code}
                  </td>
                  <td className="px-6 py-4 text-foreground">{item.description}</td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {item.category}
                  </td>
                  <td className="px-6 py-4 text-foreground">{item.quantity}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${
                        item.status === 'In Stock'
                          ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                          : item.status === 'Low Stock'
                            ? 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'
                            : 'bg-red-500/10 text-red-700 dark:text-red-400'
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-muted-foreground hover:text-foreground transition-colors">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between text-sm">
          <p className="text-muted-foreground">Showing 1 to 5 of 47 items</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              Previous
            </Button>
            <Button variant="outline" size="sm">
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

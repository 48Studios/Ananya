'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  Boxes,
  Truck,
  Factory,
  ShoppingCart,
  Warehouse,
  Landmark,
  Users,
  FolderKanban,
  RotateCcw,
  FileText,
  Settings,
  Menu,
  X,
  ShieldCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface NavItem {
  label: string
  href?: string
  icon: React.ReactNode
  children?: { label: string; href: string }[]
}

const navItems: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/',
    icon: <LayoutDashboard className="w-4 h-4" />,
  },
  {
    label: 'Inventory',
    icon: <Boxes className="w-4 h-4" />,
    children: [
      { label: 'Overview', href: '/inventory' },
      { label: 'Components', href: '/components' },
      { label: 'Manufacturers', href: '/manufacturers' },
      { label: 'Locations', href: '/locations' },
      { label: 'Warehouses', href: '/warehouses' },
      { label: 'Stock Counts', href: '/stock-counts' },
      { label: 'Cycle Counts', href: '/cycle-counts' },
      { label: 'Transactions', href: '/transactions' },
    ],
  },
  {
    label: 'Procurement',
    icon: <Truck className="w-4 h-4" />,
    children: [
      { label: 'Overview', href: '/procurement' },
      { label: 'Suppliers', href: '/suppliers' },
      { label: 'Purchase Orders', href: '/purchase-orders' },
      { label: 'Goods Receipts', href: '/goods-receipts' },
      { label: 'Supplier Returns', href: '/supplier-returns' },
      { label: 'Invoices', href: '/purchase-invoices' },
    ],
  },
  {
    label: 'Manufacturing',
    icon: <Factory className="w-4 h-4" />,
    children: [
      { label: 'Overview', href: '/manufacturing' },
      { label: 'BOMs', href: '/boms' },
      { label: 'Production Orders', href: '/production-orders' },
      { label: 'Work Orders', href: '/work-orders' },
      { label: 'Material Consumption', href: '/material-consumption' },
      { label: 'Finished Goods', href: '/finished-goods' },
    ],
  },
  {
    label: 'Sales',
    icon: <ShoppingCart className="w-4 h-4" />,
    children: [
      { label: 'Overview', href: '/sales' },
      { label: 'Customers', href: '/customers' },
      { label: 'Quotations', href: '/quotations' },
      { label: 'Sales Orders', href: '/sales-orders' },
      { label: 'Fulfillment', href: '/fulfillment' },
      { label: 'Customer Returns', href: '/customer-returns' },
    ],
  },
  {
    label: 'Warehouse',
    icon: <Warehouse className="w-4 h-4" />,
    children: [
      { label: 'Overview', href: '/warehouse' },
      { label: 'Warehouses', href: '/warehouses' },
      { label: 'Bins', href: '/warehouse-bins' },
      { label: 'Transfers', href: '/warehouse-transfers' },
      { label: 'Policies', href: '/warehouse-policies' },
    ],
  },
  {
    label: 'Finance',
    icon: <Landmark className="w-4 h-4" />,
    children: [
      { label: 'Overview', href: '/finance' },
      { label: 'Chart of Accounts', href: '/chart-of-accounts' },
      { label: 'Journal Entries', href: '/journal-entries' },
      { label: 'Receivables', href: '/accounts-receivable' },
      { label: 'Payables', href: '/accounts-payable' },
      { label: 'Payments', href: '/payments' },
      { label: 'Bank Accounts', href: '/bank-accounts' },
      { label: 'Reconciliation', href: '/bank-reconciliation' },
    ],
  },
  {
    label: 'CRM',
    icon: <Users className="w-4 h-4" />,
    children: [
      { label: 'Overview', href: '/crm' },
      { label: 'Leads', href: '/leads' },
      { label: 'Accounts', href: '/accounts' },
      { label: 'Opportunities', href: '/opportunities' },
      { label: 'Activities', href: '/activities' },
    ],
  },
  {
    label: 'Projects & Service',
    icon: <FolderKanban className="w-4 h-4" />,
    children: [
      { label: 'Projects', href: '/projects' },
      { label: 'Tasks', href: '/tasks' },
      { label: 'Timesheets', href: '/time' },
      { label: 'Service Requests', href: '/service' },
      { label: 'RMA', href: '/rma' },
      { label: 'Warranty', href: '/warranty' },
      { label: 'Maintenance', href: '/maintenance' },
    ],
  },
  {
    label: 'MRP',
    icon: <RotateCcw className="w-4 h-4" />,
    children: [
      { label: 'Overview', href: '/mrp' },
      { label: 'Planning Runs', href: '/mrp/runs' },
      { label: 'Material Shortages', href: '/mrp/materials' },
      { label: 'Purchase Recs', href: '/mrp/purchases' },
      { label: 'Production Recs', href: '/mrp/production' },
      { label: 'Capacity Planning', href: '/mrp/capacity' },
    ],
  },
  {
    label: 'Traceability & Batches',
    icon: <FileText className="w-4 h-4" />,
    children: [
      { label: 'Batches', href: '/batches' },
      { label: 'Serials', href: '/serials' },
      { label: 'Reservations', href: '/reservations' },
      { label: 'Projections', href: '/projections' },
    ],
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: <Settings className="w-4 h-4" />,
  },
]

interface NavItemProps {
  item: NavItem
  isCollapsed: boolean
  pathname: string
  onItemClick?: () => void
}

function NavItemComponent({
  item,
  isCollapsed,
  pathname,
  onItemClick,
}: NavItemProps) {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (item.children) {
      const isChildActive = item.children.some(
        (child) => pathname === child.href || pathname.startsWith(child.href + '/')
      )
      if (isChildActive) {
        setIsOpen(true)
      }
    }
  }, [pathname, item.children])

  const isActive = item.href ? pathname === item.href : isOpen

  return (
    <div>
      {item.children ? (
        <>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className={cn(
              'w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md text-sm transition-colors',
              'hover:bg-sidebar-accent text-sidebar-foreground',
              isOpen && 'bg-sidebar-accent'
            )}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex-shrink-0">{item.icon}</div>
              {!isCollapsed && (
                <span className="truncate font-medium">{item.label}</span>
              )}
            </div>
            {!isCollapsed && (
              <ChevronDown
                className={cn(
                  'w-4 h-4 flex-shrink-0 transition-transform',
                  isOpen && 'rotate-180'
                )}
              />
            )}
          </button>
          {isOpen && !isCollapsed && (
            <div className="ml-3 mt-1 space-y-1 border-l border-sidebar-border">
              {item.children.map((child) => {
                const isSubActive = pathname === child.href
                return (
                  <Link
                    key={child.href}
                    href={child.href}
                    onClick={onItemClick}
                    className={cn(
                      'block px-3 py-2 pl-4 text-xs rounded-md transition-colors truncate',
                      'hover:bg-sidebar-accent text-sidebar-foreground',
                      isSubActive &&
                      '!bg-sidebar-primary text-sidebar-primary-foreground font-medium'
                    )}
                  >
                    {child.label}
                  </Link>
                )
              })}
            </div>
          )}
        </>
      ) : (
        <Link
          href={item.href || '#'}
          onClick={onItemClick}
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
            'hover:bg-sidebar-accent',
            isActive
              ? 'bg-sidebar-primary text-sidebar-primary-foreground font-medium'
              : 'text-sidebar-foreground'
          )}
        >
          <div className="flex-shrink-0">{item.icon}</div>
          {!isCollapsed && <span className="truncate">{item.label}</span>}
        </Link>
      )}
    </div>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
      if (window.innerWidth >= 768) {
        setIsMobileOpen(false)
      }
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  return (
    <>
      {/* Mobile menu button */}
      <div className="fixed top-4 left-4 z-50 md:hidden">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="bg-card"
        >
          {isMobileOpen ? (
            <X className="w-4 h-4" />
          ) : (
            <Menu className="w-4 h-4" />
          )}
        </Button>
      </div>

      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed md:static top-0 left-0 h-screen z-40 transition-all duration-300',
          'bg-sidebar border-r border-sidebar-border',
          'flex flex-col',
          isMobile ? (isMobileOpen ? 'w-64' : '-translate-x-full') : '',
          isCollapsed && !isMobile ? 'w-20' : 'w-64'
        )}
      >
        {/* Logo / Header */}
        <div className="px-6 h-16 border-b border-sidebar-border flex items-center justify-between">
          {!isCollapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
                <ShieldCheck className="w-4 h-4 text-sidebar-primary-foreground" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-sm text-sidebar-foreground truncate leading-none">
                  ANANYA
                </span>
                <span className="text-[10px] text-muted-foreground tracking-wider font-semibold">
                  48 STUDIOS
                </span>
              </div>
            </div>
          )}
          {!isMobile && (
            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="text-sidebar-foreground hover:bg-sidebar-accent p-1 rounded transition-colors"
              title={isCollapsed ? 'Expand' : 'Collapse'}
            >
              <ChevronRight
                className={cn(
                  'w-4 h-4 transition-transform',
                  isCollapsed && 'rotate-180'
                )}
              />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {navItems.map((item) => (
            <NavItemComponent
              key={item.label}
              item={item}
              isCollapsed={isCollapsed}
              pathname={pathname}
              onItemClick={() => {
                if (isMobile) setIsMobileOpen(false)
              }}
            />
          ))}
        </nav>

        {/* Footer */}
        {!isCollapsed && (
          <div className="border-t border-sidebar-border p-4 text-xs text-sidebar-foreground/60 space-y-1">
            <div>v0.1.0-beta.4</div>
            <div>Internal Operations Engine</div>
          </div>
        )}
      </aside>
    </>
  )
}

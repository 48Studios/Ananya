'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Boxes,
  Truck,
  Factory,
  FolderKanban,
  ShoppingCart,
  UserCheck,
  Shield,
  Tag,
  MapPin,
  Building2,
  ClipboardList,
  PackageCheck,
  ArrowDownLeft,
  ArrowUpRight,
  Wrench,
  FileText,
  Plus,
  LayoutGrid,
  Settings,
  History,
  CornerDownLeft,
  ArrowRightLeft,
} from 'lucide-react'
import { useNavigation } from '@/lib/navigation/navigation-context'
import { useAuth } from '@/lib/auth/auth-context'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from '@/components/ui/command'
import { searchApi, SearchResultItemDto } from '@/lib/api/search-api'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Boxes,
  Truck,
  Factory,
  FolderKanban,
  ShoppingCart,
  UserCheck,
  Shield,
  Tag,
  MapPin,
  Building2,
  ClipboardList,
  PackageCheck,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRightLeft,
  Wrench,
  FileText,
  LayoutGrid,
  Settings,
}

const RECENT_SEARCHES_KEY = 'ananya_recent_searches'
const RECENT_PAGES_KEY = 'ananya_recent_pages'

const ALL_QUICK_ACTIONS = [
  { title: 'Create Component', icon: Plus, href: '/components/new', category: 'Inventory', permission: 'Inventory.Create' },
  { title: 'Receive Stock', icon: ArrowDownLeft, href: '/goods-receipts/new', category: 'Inventory', permission: 'Inventory.Create' },
  { title: 'Create Supplier', icon: Plus, href: '/suppliers', category: 'Procurement', permission: 'PurchaseOrders.Create' },
  { title: 'Create Purchase Order', icon: Plus, href: '/purchase-orders/new', category: 'Procurement', permission: 'PurchaseOrders.Create' },
  { title: 'Create Bill of Materials (BOM)', icon: Plus, href: '/boms/new', category: 'Manufacturing', permission: 'WorkOrders.Manage' },
  { title: 'Create Work Order', icon: Plus, href: '/work-orders', category: 'Manufacturing', permission: 'WorkOrders.Manage' },
  { title: 'Create Project', icon: Plus, href: '/projects', category: 'Projects', permission: 'Projects.Manage' },
  { title: 'Open Analytics Hub', icon: FileText, href: '/reports', category: 'Analytics', permission: 'Reporting.Read' },
  { title: 'Open User Directory', icon: UserCheck, href: '/users', category: 'Administration', permission: 'Administration.Users' },
  { title: 'Open Organization Settings', icon: Settings, href: '/settings', category: 'Administration', permission: 'Administration.Security' },
]

export function CommandPalette() {
  const router = useRouter()
  const { searchOpen, setSearchOpen } = useNavigation()
  const { hasPermission } = useAuth()

  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<SearchResultItemDto[]>([])
  const [loading, setLoading] = React.useState(false)
  const [recentSearches, setRecentSearches] = React.useState<string[]>([])
  const [recentPages, setRecentPages] = React.useState<{ title: string; href: string }[]>([])

  // Listen for ⌘K / Ctrl+K keyboard shortcut globally and sync with searchOpen
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(!searchOpen)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [searchOpen, setSearchOpen])

  // Load cached recent items on mount
  React.useEffect(() => {
    try {
      const s = localStorage.getItem(RECENT_SEARCHES_KEY)
      if (s) setRecentSearches(JSON.parse(s))
      const p = localStorage.getItem(RECENT_PAGES_KEY)
      if (p) setRecentPages(JSON.parse(p))
    } catch {
      // Ignore storage errors
    }
  }, [])

  // Debounced search query
  React.useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const res = await searchApi.query(query)
        setResults(res)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 180)

    return () => clearTimeout(timer)
  }, [query])

  const handleSelect = (href: string, title?: string) => {
    setSearchOpen(false)
    if (query.trim()) {
      const nextSearches = [query.trim(), ...recentSearches.filter((s) => s !== query.trim())].slice(0, 5)
      setRecentSearches(nextSearches)
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(nextSearches))
    }
    if (title && href) {
      const nextPages = [{ title, href }, ...recentPages.filter((p) => p.href !== href)].slice(0, 5)
      setRecentPages(nextPages)
      localStorage.setItem(RECENT_PAGES_KEY, JSON.stringify(nextPages))
    }
    setQuery('')
    router.push(href)
  }

  // Filter Quick Actions based on user permissions
  const quickActions = React.useMemo(() => {
    return ALL_QUICK_ACTIONS.filter((action) => !action.permission || hasPermission(action.permission))
  }, [hasPermission])

  // Group search results by category
  const groupedResults = React.useMemo(() => {
    const groups: Record<string, SearchResultItemDto[]> = {}
    for (const item of results) {
      if (!groups[item.category]) {
        groups[item.category] = []
      }
      groups[item.category]!.push(item)
    }
    return groups
  }, [results])

  return (
    <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
      <CommandInput
        placeholder="Type a command or search entities (components, POs, BOMs, projects, users)..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {loading && (
          <div className="py-6 text-center text-xs text-muted-foreground">
            Searching across enterprise records...
          </div>
        )}

        {!loading && query.trim() && results.length === 0 && (
          <CommandEmpty>No matching records or actions found for &quot;{query}&quot;.</CommandEmpty>
        )}

        {/* Dynamic Search Results Grouped by Domain Category */}
        {!loading &&
          Object.entries(groupedResults).map(([cat, items]) => (
            <CommandGroup key={cat} heading={`${cat} Results (${items.length})`}>
              {items.map((item) => {
                const IconComponent = (item.iconName && ICON_MAP[item.iconName]) || Boxes
                return (
                  <CommandItem
                    key={`${item.type}-${item.id}`}
                    onSelect={() => handleSelect(item.href, item.title)}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <div className="p-1.5 bg-muted/50 rounded-md text-muted-foreground shrink-0">
                        <IconComponent className="w-3.5 h-3.5" />
                      </div>
                      <div className="truncate">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground text-xs">{item.title}</span>
                          <span className="px-1.5 py-0.2 text-[10px] font-mono rounded bg-primary/10 text-primary border border-primary/20">
                            {item.type}
                          </span>
                          {item.status && (
                            <span className="px-1.5 py-0.2 text-[10px] font-mono rounded bg-muted text-muted-foreground">
                              {item.status}
                            </span>
                          )}
                        </div>
                        {item.subtitle && (
                          <p className="text-[11px] text-muted-foreground truncate">{item.subtitle}</p>
                        )}
                      </div>
                    </div>
                    <CornerDownLeft className="w-3.5 h-3.5 text-muted-foreground shrink-0 opacity-50" />
                  </CommandItem>
                )
              })}
            </CommandGroup>
          ))}

        {/* Default Quick Actions & Recent Items */}
        {!query.trim() && (
          <>
            {recentPages.length > 0 && (
              <CommandGroup heading="Recent Pages">
                {recentPages.map((p) => (
                  <CommandItem
                    key={p.href}
                    onSelect={() => handleSelect(p.href, p.title)}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <History className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="font-medium text-foreground">{p.title}</span>
                    </div>
                    <CommandShortcut>{p.href}</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            <CommandGroup heading="Quick Actions">
              {quickActions.map((action) => {
                const ActionIcon = action.icon
                return (
                  <CommandItem
                    key={action.title}
                    onSelect={() => handleSelect(action.href, action.title)}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-1 bg-primary/10 rounded text-primary">
                        <ActionIcon className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-semibold text-foreground">{action.title}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono bg-muted/40 px-1.5 py-0.5 rounded">
                      {action.category}
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import { useNavigation } from "@/lib/navigation/navigation-context";
import { useAuth } from "@/lib/auth/auth-context";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandIcon,
  CommandShortcut,
} from "@/components/ui/command";
import { searchApi, SearchResultItemDto } from "@/lib/api/search-api";

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
};

const RECENT_SEARCHES_KEY = "ananya_recent_searches";
const RECENT_PAGES_KEY = "ananya_recent_pages";

const ALL_QUICK_ACTIONS = [
  {
    title: "Create Component",
    icon: Plus,
    href: "/components/new",
    category: "Inventory",
    permission: "Inventory.Create",
    keywords: [
      "new component",
      "part",
      "item",
      "add component",
      "inventory",
      "part number",
    ],
  },
  {
    title: "Receive Stock",
    icon: ArrowDownLeft,
    href: "/goods-receipts/new",
    category: "Inventory",
    permission: "Inventory.Create",
    keywords: [
      "goods receipt",
      "inbound",
      "stock in",
      "receive",
      "grn",
      "stock receipt",
    ],
  },
  {
    title: "Create Supplier",
    icon: Plus,
    href: "/suppliers",
    category: "Procurement",
    permission: "PurchaseOrders.Create",
    keywords: [
      "vendor",
      "new supplier",
      "procurement",
      "partner",
      "add supplier",
    ],
  },
  {
    title: "Create Purchase Order",
    icon: Plus,
    href: "/purchase-orders/new",
    category: "Procurement",
    permission: "PurchaseOrders.Create",
    keywords: ["po", "new order", "buy", "procurement", "purchase order"],
  },
  {
    title: "Create Bill of Materials (BOM)",
    icon: Plus,
    href: "/boms/new",
    category: "Manufacturing",
    permission: "WorkOrders.Manage",
    keywords: [
      "bom",
      "assembly",
      "recipe",
      "bill of materials",
      "manufacturing",
      "parts list",
    ],
  },
  {
    title: "Create Work Order",
    icon: Plus,
    href: "/work-orders",
    category: "Manufacturing",
    permission: "WorkOrders.Manage",
    keywords: [
      "wo",
      "build",
      "job",
      "production",
      "manufacturing",
      "work order",
    ],
  },
  {
    title: "Create Project",
    icon: Plus,
    href: "/projects",
    category: "Projects",
    permission: "Projects.Manage",
    keywords: ["new project", "job", "client project", "engagement"],
  },
  {
    title: "Open Analytics Hub",
    icon: FileText,
    href: "/reports",
    category: "Analytics",
    permission: "Reporting.Read",
    keywords: ["reports", "analytics", "dashboard", "metrics", "charts"],
  },
  {
    title: "Open User Directory",
    icon: UserCheck,
    href: "/users",
    category: "Administration",
    permission: "Administration.Users",
    keywords: [
      "users",
      "team",
      "people",
      "members",
      "staff",
      "permissions",
      "directory",
    ],
  },
  {
    title: "Open Organization Settings",
    icon: Settings,
    href: "/settings",
    category: "Administration",
    permission: "Administration.Security",
    keywords: [
      "settings",
      "preferences",
      "config",
      "org",
      "admin",
      "organization",
    ],
  },
];

export function CommandPalette() {
  const router = useRouter();
  const { searchOpen, setSearchOpen } = useNavigation();
  const { hasPermission } = useAuth();

  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResultItemDto[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [recentSearches, setRecentSearches] = React.useState<string[]>([]);
  const [recentPages, setRecentPages] = React.useState<
    { title: string; href: string }[]
  >([]);

  // Listen for ⌘K / Ctrl+K keyboard shortcut globally and sync with searchOpen
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(!searchOpen);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [searchOpen, setSearchOpen]);

  // Load cached recent items on mount
  React.useEffect(() => {
    try {
      const s = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (s) setRecentSearches(JSON.parse(s));
      const p = localStorage.getItem(RECENT_PAGES_KEY);
      if (p) setRecentPages(JSON.parse(p));
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Debounced search query
  React.useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await searchApi.query(query);
        setResults(res);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (href: string, title?: string) => {
    setSearchOpen(false);
    if (query.trim()) {
      const nextSearches = [
        query.trim(),
        ...recentSearches.filter((s) => s !== query.trim()),
      ].slice(0, 5);
      setRecentSearches(nextSearches);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(nextSearches));
    }
    if (title && href) {
      const nextPages = [
        { title, href },
        ...recentPages.filter((p) => p.href !== href),
      ].slice(0, 5);
      setRecentPages(nextPages);
      localStorage.setItem(RECENT_PAGES_KEY, JSON.stringify(nextPages));
    }
    setQuery("");
    router.push(href);
  };

  // Filter Quick Actions based on user permissions
  const quickActions = React.useMemo(() => {
    return ALL_QUICK_ACTIONS.filter(
      (action) => !action.permission || hasPermission(action.permission),
    );
  }, [hasPermission]);

  // Group search results by category
  const groupedResults = React.useMemo(() => {
    const groups: Record<string, SearchResultItemDto[]> = {};
    for (const item of results) {
      if (!groups[item.category]) {
        groups[item.category] = [];
      }
      groups[item.category]!.push(item);
    }
    return groups;
  }, [results]);

  return (
    <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
      <CommandInput
        placeholder="Type a command or search entities (components, POs, BOMs, projects, users)..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {loading
            ? "Searching across enterprise records..."
            : `No matching records or actions found for "${query}".`}
        </CommandEmpty>

        {loading && (
          <div className="py-6 text-center text-xs text-muted-foreground">
            Searching across enterprise records...
          </div>
        )}

        {/* Dynamic Search Results Grouped by Domain Category */}
        {!loading &&
          Object.entries(groupedResults).map(([cat, items]) => (
            <CommandGroup
              key={cat}
              heading={`${cat} Results (${items.length})`}
            >
              {items.map((item) => {
                const IconComponent =
                  (item.iconName && ICON_MAP[item.iconName]) || Boxes;
                return (
                  <CommandItem
                    key={`${item.type}-${item.id}`}
                    value={`${item.title} ${item.type} ${item.category} ${item.subtitle || ""} ${item.id}`}
                    keywords={[query, item.type, item.category]}
                    onSelect={() => handleSelect(item.href, item.title)}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <CommandIcon icon={IconComponent} />
                      <div className="truncate">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground group-data-[selected=true]:text-primary-foreground text-xs">
                            {item.title}
                          </span>
                          <span className="px-1.5 py-0.2 text-[10px] font-mono rounded bg-primary/10 text-primary border border-primary/20 group-data-[selected=true]:bg-primary-foreground/20 group-data-[selected=true]:text-primary-foreground group-data-[selected=true]:border-primary-foreground/30">
                            {item.type}
                          </span>
                          {item.status && (
                            <span className="px-1.5 py-0.2 text-[10px] font-mono rounded bg-muted text-muted-foreground group-data-[selected=true]:bg-primary-foreground/20 group-data-[selected=true]:text-primary-foreground">
                              {item.status}
                            </span>
                          )}
                        </div>
                        {item.subtitle && (
                          <p className="text-[11px] text-muted-foreground group-data-[selected=true]:text-primary-foreground/75 truncate">
                            {item.subtitle}
                          </p>
                        )}
                      </div>
                    </div>
                    <CornerDownLeft className="w-3.5 h-3.5 text-muted-foreground group-data-[selected=true]:text-primary-foreground shrink-0 opacity-50 group-data-[selected=true]:opacity-90" />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}

        {/* Quick Actions & Recent Pages - Always rendered so cmdk can filter them natively */}
        {recentPages.length > 0 && (
          <CommandGroup heading="Recent Pages">
            {recentPages.map((p) => (
              <CommandItem
                key={p.href}
                value={p.title}
                keywords={[p.href]}
                onSelect={() => handleSelect(p.href, p.title)}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5">
                  <CommandIcon icon={History} />
                  <span className="font-medium text-foreground group-data-[selected=true]:text-primary-foreground">
                    {p.title}
                  </span>
                </div>
                <CommandShortcut>{p.href}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandGroup heading="Quick Actions">
          {quickActions.map((action) => {
            return (
              <CommandItem
                key={action.title}
                value={action.title}
                keywords={action.keywords}
                onSelect={() => handleSelect(action.href, action.title)}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5">
                  <CommandIcon icon={action.icon} />
                  <span className="font-semibold text-foreground group-data-[selected=true]:text-primary-foreground">
                    {action.title}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground font-mono bg-muted/40 px-1.5 py-0.5 rounded group-data-[selected=true]:bg-primary-foreground/20 group-data-[selected=true]:text-primary-foreground">
                  {action.category}
                </span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

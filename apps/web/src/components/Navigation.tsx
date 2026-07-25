'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { label: 'Dashboard', href: '/' },
  { label: 'Inventory', href: '/inventory' },
  { label: 'Components', href: '/components' },
  { label: 'Locations', href: '/locations' },
  { label: 'Procurement', href: '/procurement' },
  { label: 'Suppliers', href: '/suppliers' },
  { label: 'PO Orders', href: '/purchase-orders' },
  { label: 'Goods Receipts', href: '/goods-receipts' },
  { label: 'Returns', href: '/supplier-returns' },
  { label: 'Invoices', href: '/purchase-invoices' },
  { label: 'Manufacturing', href: '/manufacturing' },
  { label: 'BOMs', href: '/boms' },
  { label: 'Prod Orders', href: '/production-orders' },
  { label: 'Consumptions', href: '/material-consumption' },
  { label: 'Finished Goods', href: '/finished-goods' },
  { label: 'Traceability', href: '/traceability' },
  { label: 'Warehouse', href: '/warehouse' },
  { label: 'Warehouses', href: '/warehouses' },
  { label: 'Bins', href: '/warehouse-bins' },
  { label: 'Stock Counts', href: '/stock-counts' },
  { label: 'Cycle Counts', href: '/cycle-counts' },
  { label: 'WH Transfers', href: '/warehouse-transfers' },
  { label: 'WH Policies', href: '/warehouse-policies' },
  { label: 'Transactions', href: '/transactions' },
  { label: 'Projections', href: '/projections' },
  { label: 'Reservations', href: '/reservations' },
  { label: 'Batches', href: '/batches' },
  { label: 'Serials', href: '/serials' },
  { label: 'Settings', href: '/settings' },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <header className="top-header">
      <div className="brand-section">
        <Link href="/" className="brand-logo">
          <span>ANANYA</span>
          <span className="brand-tag">48 STUDIOS</span>
        </Link>
      </div>

      <nav className="nav-links">
        {navItems.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${isActive ? 'active' : ''}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

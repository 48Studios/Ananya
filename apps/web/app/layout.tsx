import type { Metadata } from 'next';
import './globals.css';
import { GlobalProviders } from '../src/components/layout/providers/GlobalProviders';
import { DashboardLayout } from '../src/components/layout/dashboard-layout/DashboardLayout';

export const metadata: Metadata = {
  title: 'Ananya — 48 Studios ERP Platform',
  description: 'Enterprise Operations System for physical inventory, procurement, manufacturing, and analytics',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <GlobalProviders>
          <DashboardLayout>{children}</DashboardLayout>
        </GlobalProviders>
      </body>
    </html>
  );
}

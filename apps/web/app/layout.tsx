import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ananya ERP',
  description: 'Internal operations system for 48 Studios',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

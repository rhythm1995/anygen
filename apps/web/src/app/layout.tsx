import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '../components/Sidebar';

export const metadata: Metadata = {
  title: 'Helix — AI Content Midplatform',
  description: 'Crypto exchange operations & GEO content production.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink text-zinc-100 antialiased">
        <div className="flex">
          <Sidebar />
          <main className="flex-1 p-8 max-w-[1400px]">{children}</main>
        </div>
      </body>
    </html>
  );
}

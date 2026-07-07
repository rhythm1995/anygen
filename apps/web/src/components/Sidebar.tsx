'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from './ui';

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/briefs', label: 'Briefs' },
  { href: '/content', label: 'Content' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/knowledge', label: 'Knowledge' },
  { href: '/brand', label: 'Brand' },
  { href: '/compliance', label: 'Compliance' },
  { href: '/geo', label: 'GEO / llms.txt' },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="w-60 shrink-0 border-r border-ink-line bg-ink-soft/40 min-h-screen p-4 flex flex-col gap-1">
      <div className="px-2 py-3 mb-2">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-accent grid place-items-center font-bold text-white">H</div>
          <div>
            <div className="font-semibold tracking-tight">Helix</div>
            <div className="text-[10px] text-zinc-500 -mt-0.5">Content Midplatform</div>
          </div>
        </div>
      </div>
      {NAV.map((n) => {
        const active = path === n.href || path?.startsWith(n.href + '/');
        return (
          <Link
            key={n.href}
            href={n.href}
            className={cx(
              'rounded-lg px-3 py-2 text-sm transition-colors',
              active ? 'bg-accent/15 text-accent-soft' : 'text-zinc-400 hover:text-zinc-100 hover:bg-ink-line/40',
            )}
          >
            {n.label}
          </Link>
        );
      })}
      <div className="mt-auto px-3 py-2 text-[10px] text-zinc-600">
        crypto ops + GEO · eve agent
      </div>
    </aside>
  );
}

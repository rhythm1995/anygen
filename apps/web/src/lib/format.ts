import { CONTENT_TYPE_META, type ContentStatus, type ContentType } from '@helix/shared';

export function typeLabel(t: ContentType): string {
  return CONTENT_TYPE_META[t]?.label ?? t;
}
export function typeIsGeo(t: ContentType): boolean {
  return CONTENT_TYPE_META[t]?.isGeo ?? false;
}

const statusStyles: Record<ContentStatus, string> = {
  draft: 'bg-zinc-700/50 text-zinc-300',
  reviewing: 'bg-blue-500/15 text-blue-300',
  approved: 'bg-accent/15 text-accent-soft',
  published: 'bg-ok/15 text-ok',
  rejected: 'bg-bad/15 text-bad',
  archived: 'bg-zinc-800 text-zinc-500',
};

export function statusBadge(s: ContentStatus): string {
  return statusStyles[s] ?? 'bg-zinc-700 text-zinc-300';
}

export function timeAgo(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso).getTime();
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function scoreColor(score: number): string {
  if (score >= 90) return 'text-ok';
  if (score >= 70) return 'text-warn';
  return 'text-bad';
}

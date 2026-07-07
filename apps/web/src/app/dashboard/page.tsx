'use client';
import Link from 'next/link';
import { useApi } from '../../lib/useApi';
import { Badge, Card, PageHeader, Spinner } from '../../components/ui';
import { statusBadge, timeAgo, typeLabel } from '../../lib/format';
import type { ContentItem } from '@helix/shared';

interface Stats {
  briefs: number;
  content: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  jobs: number;
  knowledge: number;
  compliance: number;
}
interface Health {
  status: string;
  config: { mode: string; supabase: boolean; eve: boolean };
  agent: 'eve' | 'mock';
}

export default function DashboardPage() {
  const stats = useApi<Stats>('/health/stats');
  const recent = useApi<ContentItem[]>('/content');
  const health = useApi<Health>('/health');

  const items = (recent.data ?? []).slice(0, 6);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Crypto exchange operations + GEO content production"
        action={
          <Link href="/briefs" className="text-sm text-accent-soft hover:underline">
            + New brief →
          </Link>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Stat label="Briefs" value={stats.data?.briefs} />
        <Stat label="Content items" value={stats.data?.content} />
        <Stat label="Knowledge" value={stats.data?.knowledge} />
        <Stat label="Compliance terms" value={stats.data?.compliance} />
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <Card>
          <div className="text-sm font-medium mb-3">Pipeline by status</div>
          {stats.loading ? <Spinner /> : <StatusGrid data={stats.data?.byStatus ?? {}} />}
        </Card>
        <Card>
          <div className="text-sm font-medium mb-3">System</div>
          {health.loading || !health.data ? (
            <Spinner />
          ) : (
            <div className="space-y-2 text-sm">
              <Row k="Run mode" v={<Badge className="bg-accent/15 text-accent-soft">{health.data.config.mode}</Badge>} />
              <Row k="Datastore" v={health.data.config.supabase ? 'Supabase' : 'In-memory (mock)'} />
              <Row
                k="Agent"
                v={<Badge className={health.data.agent === 'eve' ? 'bg-ok/15 text-ok' : 'bg-warn/15 text-warn'}>{health.data.agent}</Badge>}
              />
              <Row k="GEO durability" v={health.data.config.eve ? 'eve + Postgres' : 'mock fallback'} />
            </div>
          )}
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium">Recent content</div>
          <Link href="/content" className="text-xs text-zinc-400 hover:text-zinc-100">
            view all →
          </Link>
        </div>
        {recent.loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <div className="text-sm text-zinc-500 py-6 text-center">
            No content yet. <Link href="/briefs" className="text-accent-soft">Create a brief</Link> to start.
          </div>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-t border-ink-line first:border-0">
                  <td className="py-2 pr-3">
                    <Link href={`/content/${c.id}`} className="hover:text-accent-soft">
                      {c.title}
                    </Link>
                  </td>
                  <td className="py-2 px-3 text-zinc-400 w-36">{typeLabel(c.content_type)}</td>
                  <td className="py-2 px-3 w-28">
                    <Badge className={statusBadge(c.status)}>{c.status}</Badge>
                  </td>
                  <td className="py-2 pl-3 text-zinc-500 w-24 text-right">{timeAgo(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <Card className="py-4">
      <div className="text-3xl font-semibold tracking-tight">{value ?? '—'}</div>
      <div className="text-xs text-zinc-500 mt-1">{label}</div>
    </Card>
  );
}

function StatusGrid({ data }: { data: Record<string, number> }) {
  const order = ['draft', 'reviewing', 'approved', 'published', 'rejected'];
  return (
    <div className="space-y-2">
      {order.map((s) => (
        <div key={s} className="flex items-center justify-between text-sm">
          <Badge className={statusBadge(s as any)}>{s}</Badge>
          <span className="font-mono text-zinc-300">{data[s] ?? 0}</span>
        </div>
      ))}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-500">{k}</span>
      <span>{v}</span>
    </div>
  );
}

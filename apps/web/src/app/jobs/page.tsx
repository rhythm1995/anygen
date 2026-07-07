'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { type Brief, type ContentJob } from '@helix/shared';
import { useApi } from '../../lib/useApi';
import { apiPost } from '../../lib/api';
import { Badge, Button, Card, Field, Input, PageHeader, Select } from '../../components/ui';
import { timeAgo, typeLabel } from '../../lib/format';

const statusColor: Record<string, string> = {
  queued: 'bg-zinc-700/50 text-zinc-300',
  running: 'bg-blue-500/15 text-blue-300',
  completed: 'bg-ok/15 text-ok',
  failed: 'bg-bad/15 text-bad',
  partial: 'bg-warn/15 text-warn',
};

export default function JobsPage() {
  const jobsApi = useApi<ContentJob[]>('/jobs');
  const briefsApi = useApi<Brief[]>('/briefs');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [concurrency, setConcurrency] = useState(5);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const anyRunning = (jobsApi.data ?? []).some((j) => j.status === 'queued' || j.status === 'running');
  useEffect(() => {
    if (!anyRunning) return;
    const t = setInterval(() => jobsApi.reload(), 1500);
    return () => clearInterval(t);
  }, [anyRunning, jobsApi]);

  function toggle(id: string) {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  }

  async function create() {
    if (selected.size === 0) return;
    setBusy(true);
    setErr(null);
    try {
      await apiPost('/jobs', {
        name: name.trim() || `Batch of ${selected.size}`,
        brief_ids: [...selected],
        concurrency,
      });
      setName('');
      setSelected(new Set());
      jobsApi.reload();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const pendingBriefs = (briefsApi.data ?? []).filter((b) => b.status === 'pending' || b.status === 'done');

  return (
    <div>
      <PageHeader title="Jobs" subtitle="Batch generation — fans out one durable session per brief." />

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <div className="text-sm font-medium mb-4">New batch</div>
          {pendingBriefs.length === 0 ? (
            <div className="text-sm text-zinc-500 py-6 text-center">
              No briefs available. <Link href="/briefs" className="text-accent-soft">Create one</Link> first.
            </div>
          ) : (
            <>
              <div className="max-h-56 overflow-auto border border-ink-line rounded-lg mb-3 divide-y divide-ink-line">
                {pendingBriefs.map((b) => (
                  <label key={b.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-ink-line/30">
                    <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggle(b.id)} className="accent-[#7c5cff]" />
                    <span className="flex-1">{b.title}</span>
                    <span className="text-xs text-zinc-500">{typeLabel(b.content_type)}</span>
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Field label="Name (optional)">
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Batch of ${selected.size}`} />
                </Field>
                <Field label="Concurrency">
                  <Select value={String(concurrency)} onChange={(e) => setConcurrency(Number(e.target.value))}>
                    {[1, 2, 3, 5, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                  </Select>
                </Field>
              </div>
              {err && <div className="text-sm text-bad mb-2">{err}</div>}
              <Button onClick={create} disabled={busy || selected.size === 0}>
                Run batch ({selected.size})
              </Button>
            </>
          )}
        </Card>

        <Card className="p-0">
          <div className="p-4 border-b border-ink-line text-sm font-medium">Runs ({jobsApi.data?.length ?? 0})</div>
          {jobsApi.loading ? (
            <div className="p-6 text-zinc-500 text-sm">Loading…</div>
          ) : !jobsApi.data || jobsApi.data.length === 0 ? (
            <div className="p-10 text-center text-sm text-zinc-500">No jobs yet.</div>
          ) : (
            <div className="divide-y divide-ink-line">
              {jobsApi.data.map((j) => {
                const pct = j.total ? Math.round(((j.done + j.failed) / j.total) * 100) : 0;
                return (
                  <div key={j.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm">{j.name}</div>
                      <Badge className={statusColor[j.status] ?? 'bg-zinc-700 text-zinc-300'}>{j.status}</Badge>
                    </div>
                    <div className="text-xs text-zinc-500 mt-1">
                      {j.done}/{j.total} done{j.failed ? `, ${j.failed} failed` : ''} · {timeAgo(j.created_at)}
                    </div>
                    <div className="h-1.5 bg-ink-line rounded mt-2 overflow-hidden">
                      <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

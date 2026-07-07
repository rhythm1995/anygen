'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { ContentItem } from '@helix/shared';
import { useApi } from '../../../lib/useApi';
import { apiPost, apiPatch, apiDel, downloadExport } from '../../../lib/api';
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
  Textarea,
  cx,
} from '../../../components/ui';
import { statusBadge, typeLabel } from '../../../lib/format';

interface Readiness {
  score: number;
  ready: boolean;
  isGeo: boolean;
  compliancePassed: boolean;
  gates: { id: string; label: string; passed: boolean }[];
}

const ACTIONS: { id: 'improve' | 'shorten' | 'expand_faq' | 'seo'; label: string }[] = [
  { id: 'improve', label: 'Improve' },
  { id: 'shorten', label: 'Shorten' },
  { id: 'expand_faq', label: '+ FAQ' },
  { id: 'seo', label: 'SEO' },
];

export default function ContentDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const itemApi = useApi<ContentItem>(`/content/${id}`);
  const readinessApi = useApi<Readiness>(`/content/${id}/readiness`);

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [meta, setMeta] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (itemApi.data) {
      setTitle(itemApi.data.title);
      setSummary(itemApi.data.summary ?? '');
      setMeta(itemApi.data.meta_description ?? '');
      setBody(itemApi.data.body_markdown);
    }
  }, [itemApi.data]);

  const item = itemApi.data;

  async function save() {
    setBusy(true);
    try {
      await apiPatch(`/content/${id}`, { title, summary: summary || null, meta_description: meta || null, body_markdown: body });
      setMsg('Saved.');
      itemApi.reload();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function act(a: string) {
    setBusy(true);
    setMsg(null);
    try {
      const updated = await apiPost<ContentItem>(`/content/${id}/action`, { action: a });
      setBody(updated.body_markdown);
      if (updated.title) setTitle(updated.title);
      if (updated.meta_description) setMeta(updated.meta_description);
      itemApi.reload();
      setMsg(`Applied: ${a}`);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function recheckCompliance() {
    setBusy(true);
    try {
      await apiPost(`/content/${id}/compliance`, {});
      itemApi.reload();
      readinessApi.reload();
      setMsg('Compliance re-checked.');
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(to: any) {
    await apiPost(`/content/${id}/status`, { to });
    itemApi.reload();
  }

  async function remove() {
    if (!confirm('Delete this content item?')) return;
    await apiDel(`/content/${id}`);
    router.push('/content');
  }

  if (itemApi.loading && !item) return <div className="text-zinc-500">Loading…</div>;
  if (!item) return <div className="text-bad">Content not found.</div>;

  const compliance = item.compliance;

  return (
    <div>
      <PageHeader
        title={item.title}
        subtitle={`${typeLabel(item.content_type)} · ${item.language} · ${item.model_used ?? '—'}`}
        action={
          <div className="flex gap-2">
            <Badge className={statusBadge(item.status)}>{item.status}</Badge>
            <Button size="sm" variant="ghost" onClick={() => setStatus('reviewing')}>Review</Button>
            <Button size="sm" variant="ghost" onClick={() => setStatus('approved')}>Approve</Button>
            <Button size="sm" onClick={() => setStatus('published')}>Publish</Button>
            <Button size="sm" variant="danger" onClick={remove}>Delete</Button>
          </div>
        }
      />

      {msg && <div className="mb-4 text-sm text-accent-soft">{msg}</div>}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <div className="space-y-3">
              <Field label="Title">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Summary">
                  <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} className="min-h-[80px]" />
                </Field>
                <Field label="Meta description (SEO)">
                  <Textarea value={meta} onChange={(e) => setMeta(e.target.value)} className="min-h-[80px]" />
                </Field>
              </div>
              <Field label="Body (Markdown)">
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[360px]" />
              </Field>
              <div className="flex gap-2 flex-wrap">
                <Button onClick={save} disabled={busy}>Save</Button>
                <span className="text-zinc-600 text-xs self-center mx-1">AI:</span>
                {ACTIONS.map((a) => (
                  <Button key={a.id} variant="subtle" size="sm" onClick={() => act(a.id)} disabled={busy}>
                    {a.label}
                  </Button>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium">Compliance</div>
              <Button size="sm" variant="ghost" onClick={recheckCompliance} disabled={busy}>Re-check</Button>
            </div>
            {!compliance ? (
              <div className="text-sm text-zinc-500">Not checked yet.</div>
            ) : (
              <>
                <Badge className={compliance.passed ? 'bg-ok/15 text-ok' : 'bg-bad/15 text-bad'}>
                  {compliance.passed ? 'PASS' : `${compliance.issues.length} issue(s)`}
                </Badge>
                {compliance.issues.length > 0 && (
                  <ul className="mt-3 space-y-1 text-sm">
                    {compliance.issues.map((i, idx) => (
                      <li key={idx} className="flex gap-2">
                        <Badge className={i.severity === 'high' ? 'bg-bad/15 text-bad' : 'bg-warn/15 text-warn'}>
                          {i.category}
                        </Badge>
                        <span className="text-zinc-300">“{i.term}”</span>
                        {i.suggestion && <span className="text-zinc-500">→ {i.suggestion}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium">Readiness</div>
              <div className={cx('text-3xl font-semibold', readinessColor(readinessApi.data?.score))}>
                {readinessApi.data?.score ?? '—'}
              </div>
            </div>
            {readinessApi.data ? (
              <>
                <Badge className={readinessApi.data.ready ? 'bg-ok/15 text-ok' : 'bg-warn/15 text-warn'}>
                  {readinessApi.data.ready ? 'ready to publish' : 'needs work'}
                </Badge>
                <ul className="mt-3 space-y-1.5 text-xs">
                  {readinessApi.data.gates.map((g) => (
                    <li key={g.id} className="flex gap-2">
                      <span className={g.passed ? 'text-ok' : 'text-zinc-600'}>{g.passed ? '✓' : '○'}</span>
                      <span className="text-zinc-400">{g.label}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="text-zinc-500 text-sm">Loading…</div>
            )}
          </Card>

          <Card>
            <div className="text-sm font-medium mb-3">Export</div>
            <div className="flex flex-col gap-2">
              <Button variant="ghost" size="sm" onClick={() => downloadExport(`/content/${id}/export?format=md`)}>Markdown (.md)</Button>
              <Button variant="ghost" size="sm" onClick={() => downloadExport(`/content/${id}/export?format=html`)}>HTML (+ JSON-LD)</Button>
              <Button variant="ghost" size="sm" onClick={() => downloadExport(`/content/${id}/export?format=jsonld`)}>JSON-LD</Button>
            </div>
            {item.content_type.startsWith('geo_') && (
              <div className="mt-3 text-xs text-zinc-500">
                GEO content ships JSON-LD (FAQPage/Article) so AI engines can cite it. Publish it to surface in <code>/api/geo/llms.txt</code>.
              </div>
            )}
          </Card>

          <Card>
            <div className="text-sm font-medium mb-2">Meta</div>
            <div className="text-xs text-zinc-400 space-y-1">
              <div>slug: <span className="font-mono text-zinc-300">{item.slug}</span></div>
              <div>agent_run: <span className="font-mono text-zinc-300">{item.agent_run_id ?? '—'}</span></div>
              <div>tags: {item.tags?.join(', ') || '—'}</div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function readinessColor(score?: number): string {
  if (score === undefined) return 'text-zinc-500';
  if (score >= 90) return 'text-ok';
  if (score >= 70) return 'text-warn';
  return 'text-bad';
}

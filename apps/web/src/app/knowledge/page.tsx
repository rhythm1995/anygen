'use client';
import { useState } from 'react';
import { KNOWLEDGE_TYPES, type KnowledgeItem } from '@helix/shared';
import { useApi } from '../../lib/useApi';
import { apiPost, apiDel } from '../../lib/api';
import { Badge, Button, Card, Field, Input, PageHeader, Select, Textarea } from '../../components/ui';

const empty = { type: 'fact', title: '', content: '', source_url: '', tags: '' };

export default function KnowledgePage() {
  const { data, loading, reload } = useApi<KnowledgeItem[]>('/knowledge');
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof empty, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function add() {
    setBusy(true);
    setErr(null);
    try {
      await apiPost('/knowledge', {
        type: form.type,
        title: form.title.trim(),
        content: form.content.trim(),
        source_url: form.source_url.trim() || null,
        tags: form.tags.split(',').map((s) => s.trim()).filter(Boolean),
      });
      setForm(empty);
      reload();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete?')) return;
    await apiDel(`/knowledge/${id}`);
    reload();
  }

  return (
    <div>
      <PageHeader title="Knowledge Base" subtitle="Grounding material — the agent queries this for every factual claim." />
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <div className="text-sm font-medium mb-4">Add item</div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <Select value={form.type} onChange={(e) => set('type', e.target.value)}>
                  {KNOWLEDGE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Tags (comma)">
                <Input value={form.tags} onChange={(e) => set('tags', e.target.value)} />
              </Field>
            </div>
            <Field label="Title">
              <Input value={form.title} onChange={(e) => set('title', e.target.value)} />
            </Field>
            <Field label="Content">
              <Textarea value={form.content} onChange={(e) => set('content', e.target.value)} className="min-h-[140px]" />
            </Field>
            <Field label="Source URL (optional)">
              <Input value={form.source_url} onChange={(e) => set('source_url', e.target.value)} placeholder="https://..." />
            </Field>
            {err && <div className="text-sm text-bad">{err}</div>}
            <Button onClick={add} disabled={busy || !form.title.trim() || !form.content.trim()}>Add</Button>
          </div>
        </Card>

        <Card className="p-0">
          <div className="p-4 border-b border-ink-line text-sm font-medium">Items ({data?.length ?? 0})</div>
          {loading ? (
            <div className="p-6 text-zinc-500 text-sm">Loading…</div>
          ) : !data || data.length === 0 ? (
            <div className="p-10 text-center text-sm text-zinc-500">Empty.</div>
          ) : (
            <div className="divide-y divide-ink-line max-h-[600px] overflow-auto">
              {data.map((k) => (
                <div key={k.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm">{k.title}</div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-zinc-700/50 text-zinc-300">{k.type}</Badge>
                      <button onClick={() => remove(k.id)} className="text-xs text-zinc-600 hover:text-bad">delete</button>
                    </div>
                  </div>
                  <div className="text-xs text-zinc-400 mt-1 line-clamp-2">{k.content}</div>
                  {k.tags?.length > 0 && <div className="text-[10px] text-zinc-600 mt-1">{k.tags.join(' · ')}</div>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

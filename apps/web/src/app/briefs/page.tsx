'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CONTENT_TYPE_OPTIONS,
  LANGUAGES,
  LANGUAGE_LABELS,
  type Brief,
} from '@helix/shared';
import { useApi } from '../../lib/useApi';
import { apiPost } from '../../lib/api';
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
} from '../../components/ui';
import { timeAgo, typeIsGeo, typeLabel } from '../../lib/format';

const empty = {
  title: '',
  content_type: 'geo_faq' as string,
  language: 'en',
  audience: '',
  key_points: '',
  keywords: '',
  references: '',
  notes: '',
  target_channel: '',
};

export default function BriefsPage() {
  const { data, loading, reload } = useApi<Brief[]>('/briefs');
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  const set = (k: keyof typeof empty, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        title: form.title.trim(),
        content_type: form.content_type,
        language: form.language,
        audience: form.audience.trim() || undefined,
        key_points: form.key_points.split('\n').map((s) => s.trim()).filter(Boolean),
        keywords: form.keywords.split(',').map((s) => s.trim()).filter(Boolean),
        references: form.references.split('\n').map((s) => s.trim()).filter(Boolean),
        notes: form.notes.trim() || undefined,
        target_channel: form.target_channel.trim() || undefined,
      };
      await apiPost<Brief>('/briefs', payload);
      setForm(empty);
      reload();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function generateNow(id: string) {
    setBusy(true);
    try {
      const c = await apiPost<any>('/jobs/generate', { brief_id: id });
      router.push(`/content/${c.id}`);
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Briefs" subtitle="Content requests — turn each into a draft via the agent." />

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <div className="text-sm font-medium mb-4">New brief</div>
          <div className="space-y-3">
            <Field label="Title">
              <Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Slippage" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Content type">
                <Select value={form.content_type} onChange={(e) => set('content_type', e.target.value)}>
                  {CONTENT_TYPE_OPTIONS.map((o) => (
                    <option key={o.type} value={o.type}>
                      {o.isGeo ? 'GEO · ' : 'OPS · '}
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Language">
                <Select value={form.language} onChange={(e) => set('language', e.target.value)}>
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {LANGUAGE_LABELS[l]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Key points" hint="One per line — these must appear in the draft.">
              <Textarea value={form.key_points} onChange={(e) => set('key_points', e.target.value)} placeholder={'slippage is the gap between expected and executed price\nworse in low-liquidity pools'} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Keywords (comma)">
                <Input value={form.keywords} onChange={(e) => set('keywords', e.target.value)} placeholder="slippage, dex" />
              </Field>
              <Field label="Target channel">
                <Input value={form.target_channel} onChange={(e) => set('target_channel', e.target.value)} placeholder="blog / twitter / web" />
              </Field>
            </div>
            <Field label="References" hint="One URL per line (optional).">
              <Textarea value={form.references} onChange={(e) => set('references', e.target.value)} placeholder="https://..." />
            </Field>
            <Field label="Notes">
              <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </Field>
            {err && <div className="text-sm text-bad">{err}</div>}
            <Button onClick={submit} disabled={busy || !form.title.trim()}>
              {busy ? 'Creating…' : 'Create brief'}
            </Button>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium">All briefs ({data?.length ?? 0})</div>
            {data && data.length > 0 && (
              <Link href="/jobs" className="text-xs text-accent-soft hover:underline">
                run batch →
              </Link>
            )}
          </div>
          {loading ? (
            <div className="text-zinc-500 text-sm">Loading…</div>
          ) : !data || data.length === 0 ? (
            <div className="text-sm text-zinc-500 py-8 text-center">No briefs yet.</div>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {data.map((b) => (
                  <tr key={b.id} className="border-t border-ink-line first:border-0">
                    <td className="py-2 pr-2">
                      <div className="font-medium">{b.title}</div>
                      <div className="text-xs text-zinc-500 flex gap-2 items-center">
                        <span className={cx(typeIsGeo(b.content_type) && 'text-accent-soft')}>{typeLabel(b.content_type)}</span>
                        <span>· {b.language}</span>
                        <Badge className="bg-zinc-700/50 text-zinc-300">{b.status}</Badge>
                      </div>
                      <div className="text-[10px] text-zinc-600 mt-0.5">{timeAgo(b.created_at)}</div>
                    </td>
                    <td className="py-2 pl-2 text-right align-top">
                      <Button size="sm" variant="ghost" onClick={() => generateNow(b.id)} disabled={busy}>
                        Generate
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}

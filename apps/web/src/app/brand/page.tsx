'use client';
import { useEffect, useState } from 'react';
import { LANGUAGES, type BrandProfile } from '@helix/shared';
import { useApi } from '../../lib/useApi';
import { apiPost } from '../../lib/api';
import { Button, Card, Field, Input, PageHeader, Select, Textarea } from '../../components/ui';

const empty = {
  name: '',
  brand_voice: '',
  target_audience: '',
  do_phrases: '',
  dont_phrases: '',
  disclaimers: '',
  target_markets: '',
  default_language: 'en',
};

export default function BrandPage() {
  const { data } = useApi<BrandProfile | null>('/brand');
  const [form, setForm] = useState(empty);
  const [glossary, setGlossary] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const set = (k: keyof typeof empty, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (data && (data as any).name) {
      setForm({
        name: data.name ?? '',
        brand_voice: data.brand_voice ?? '',
        target_audience: data.target_audience ?? '',
        do_phrases: (data.do_phrases ?? []).join('\n'),
        dont_phrases: (data.dont_phrases ?? []).join('\n'),
        disclaimers: (data.disclaimers ?? []).join('\n'),
        target_markets: (data.target_markets ?? []).join(', '),
        default_language: data.default_language ?? 'en',
      });
      setGlossary(data.glossary ?? {});
    }
  }, [data]);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await apiPost('/brand', {
        name: form.name,
        brand_voice: form.brand_voice,
        target_audience: form.target_audience.trim() || null,
        do_phrases: form.do_phrases.split('\n').map((s) => s.trim()).filter(Boolean),
        dont_phrases: form.dont_phrases.split('\n').map((s) => s.trim()).filter(Boolean),
        disclaimers: form.disclaimers.split('\n').map((s) => s.trim()).filter(Boolean),
        target_markets: form.target_markets.split(',').map((s) => s.trim()).filter(Boolean),
        default_language: form.default_language,
        glossary,
      });
      setMsg('Brand profile saved. The eve agent picks this up via the brand-tone skill.');
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Brand Profile" subtitle="Drives the agent's brand-tone skill and compliance glossary." />
      <Card>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Brand name">
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Default language">
            <Select value={form.default_language} onChange={(e) => set('default_language', e.target.value)}>
              {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Brand voice" hint="Free-form — the agent internalizes this.">
            <Textarea value={form.brand_voice} onChange={(e) => set('brand_voice', e.target.value)} className="min-h-[120px]" />
          </Field>
          <Field label="Target audience">
            <Textarea value={form.target_audience} onChange={(e) => set('target_audience', e.target.value)} className="min-h-[120px]" />
          </Field>
          <Field label="Preferred phrases (one per line)">
            <Textarea value={form.do_phrases} onChange={(e) => set('do_phrases', e.target.value)} />
          </Field>
          <Field label="Avoid phrases (one per line)" hint="Also feeds the compliance checker.">
            <Textarea value={form.dont_phrases} onChange={(e) => set('dont_phrases', e.target.value)} />
          </Field>
          <Field label="Disclaimers (one per line)">
            <Textarea value={form.disclaimers} onChange={(e) => set('disclaimers', e.target.value)} />
          </Field>
          <Field label="Target markets (comma)" hint="e.g. global, exclude-US — scopes compliance.">
            <Input value={form.target_markets} onChange={(e) => set('target_markets', e.target.value)} />
          </Field>
        </div>
        <div className="mt-4 flex items-center gap-4">
          <Button onClick={save} disabled={busy || !form.name.trim() || !form.brand_voice.trim()}>
            {busy ? 'Saving…' : 'Save brand profile'}
          </Button>
          {msg && <span className="text-sm text-accent-soft">{msg}</span>}
        </div>
        {Object.keys(glossary).length > 0 && (
          <div className="mt-6 text-xs text-zinc-500">
            Glossary ({Object.keys(glossary).length} terms) loaded — edit via the compliance terms or KB.
          </div>
        )}
      </Card>
    </div>
  );
}

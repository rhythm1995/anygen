'use client';
import { useState } from 'react';
import { COMPLIANCE_CATEGORIES, type ComplianceCategory, type ComplianceTerm } from '@helix/shared';
import { useApi } from '../../lib/useApi';
import { apiPost, apiDel } from '../../lib/api';
import { Badge, Button, Card, Field, Input, PageHeader, Select } from '../../components/ui';

const catColor: Record<ComplianceCategory, string> = {
  banned: 'bg-bad/15 text-bad',
  restricted: 'bg-warn/15 text-warn',
  required: 'bg-ok/15 text-ok',
};

const empty = { term: '', category: 'banned' as ComplianceCategory, severity: 'medium', reason: '', replacement: '' };

export default function CompliancePage() {
  const { data, loading, reload } = useApi<ComplianceTerm[]>('/compliance');
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof empty, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function add() {
    setBusy(true);
    try {
      await apiPost('/compliance', {
        term: form.term.trim(),
        category: form.category,
        severity: form.severity,
        reason: form.reason.trim() || null,
        replacement: form.replacement.trim() || null,
      });
      setForm(empty);
      reload();
    } catch {
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    await apiDel(`/compliance/${id}`);
    reload();
  }

  return (
    <div>
      <PageHeader title="Compliance Terms" subtitle="Banned / restricted / required phrasing — scanned on every draft." />
      <div className="grid lg:grid-cols-3 gap-6">
        <Card>
          <div className="text-sm font-medium mb-4">Add term</div>
          <div className="space-y-3">
            <Field label="Term / phrase">
              <Input value={form.term} onChange={(e) => set('term', e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <Select value={form.category} onChange={(e) => set('category', e.target.value)}>
                  {COMPLIANCE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="Severity">
                <Select value={form.severity} onChange={(e) => set('severity', e.target.value)}>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </Select>
              </Field>
            </div>
            <Field label="Reason">
              <Input value={form.reason} onChange={(e) => set('reason', e.target.value)} />
            </Field>
            <Field label="Suggested replacement">
              <Input value={form.replacement} onChange={(e) => set('replacement', e.target.value)} />
            </Field>
            <Button onClick={add} disabled={busy || !form.term.trim()}>Add</Button>
          </div>
        </Card>

        <Card className="lg:col-span-2 p-0">
          <div className="p-4 border-b border-ink-line text-sm font-medium">Terms ({data?.length ?? 0})</div>
          {loading ? (
            <div className="p-6 text-zinc-500 text-sm">Loading…</div>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {(data ?? []).map((t) => (
                  <tr key={t.id} className="border-t border-ink-line first:border-0">
                    <td className="py-2 px-4">
                      <div className="flex items-center gap-2">
                        <Badge className={catColor[t.category]}>{t.category}</Badge>
                        <span className="font-medium">“{t.term}”</span>
                        <span className="text-[10px] text-zinc-600 uppercase">{t.severity}</span>
                      </div>
                      {t.reason && <div className="text-xs text-zinc-500 mt-0.5">{t.reason}</div>}
                    </td>
                    <td className="py-2 px-4 text-right">
                      <button onClick={() => remove(t.id)} className="text-xs text-zinc-600 hover:text-bad">delete</button>
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

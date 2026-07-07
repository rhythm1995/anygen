'use client';
import { useState } from 'react';
import Link from 'next/link';
import { CONTENT_STATUSES, CONTENT_TYPE_OPTIONS, type ContentItem, type ContentStatus } from '@helix/shared';
import { useApi } from '../../lib/useApi';
import { apiPost } from '../../lib/api';
import { Badge, Card, Input, PageHeader, Select } from '../../components/ui';
import { statusBadge, timeAgo, typeLabel } from '../../lib/format';

export default function ContentListPage() {
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const path = `/content?${[['status', status], ['type', type], ['q', q]].filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&')}`;
  const { data, loading, reload } = useApi<ContentItem[]>(path);

  async function changeStatus(id: string, to: ContentStatus) {
    await apiPost(`/content/${id}/status`, { to });
    reload();
  }

  return (
    <div>
      <PageHeader title="Content" subtitle="Produced drafts → review → publish." />

      <Card className="mb-4">
        <div className="grid md:grid-cols-4 gap-3">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {CONTENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {CONTENT_TYPE_OPTIONS.map((o) => (
              <option key={o.type} value={o.type}>
                {o.label}
              </option>
            ))}
          </Select>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search title / body…" className="md:col-span-2" />
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-6 text-zinc-500 text-sm">Loading…</div>
        ) : !data || data.length === 0 ? (
          <div className="p-10 text-center text-sm text-zinc-500">
            No content. <Link href="/briefs" className="text-accent-soft">Create a brief</Link> and generate.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500 border-b border-ink-line">
                <th className="py-2 px-4 font-medium">Title</th>
                <th className="py-2 px-2 font-medium w-40">Type</th>
                <th className="py-2 px-2 font-medium w-24">Lang</th>
                <th className="py-2 px-2 font-medium w-40">Status</th>
                <th className="py-2 px-4 font-medium w-24 text-right">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} className="border-t border-ink-line hover:bg-ink-line/20">
                  <td className="py-2 px-4">
                    <Link href={`/content/${c.id}`} className="hover:text-accent-soft font-medium">
                      {c.title}
                    </Link>
                    {c.content_type.startsWith('geo_') && (
                      <Badge className="ml-2 bg-accent/15 text-accent-soft">GEO</Badge>
                    )}
                  </td>
                  <td className="py-2 px-2 text-zinc-400">{typeLabel(c.content_type)}</td>
                  <td className="py-2 px-2 text-zinc-400 uppercase">{c.language}</td>
                  <td className="py-2 px-2">
                    <Select
                      value={c.status}
                      onChange={(e) => changeStatus(c.id, e.target.value as ContentStatus)}
                      className="text-xs py-1"
                    >
                      {CONTENT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="py-2 px-4 text-zinc-500 text-right">{timeAgo(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

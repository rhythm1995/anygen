'use client';
import { useEffect, useState } from 'react';
import { API_BASE, ORG_ID } from '../../lib/api';
import { Card, PageHeader } from '../../components/ui';

export default function GeoPage() {
  const [llms, setLlms] = useState('');
  const [feed, setFeed] = useState<any[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/geo/llms.txt`, { headers: { 'x-org-id': ORG_ID } })
      .then((r) => r.text())
      .then(setLlms)
      .catch((e) => setLlms(`error: ${e.message}`));
    fetch(`${API_BASE}/geo/feed`, { headers: { 'x-org-id': ORG_ID } })
      .then((r) => r.json())
      .then(setFeed)
      .catch(() => {});
  }, []);

  return (
    <div>
      <PageHeader
        title="GEO / llms.txt"
        subtitle="Generative Engine Optimization outputs — publish these so AI engines cite your exchange."
      />

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium">llms.txt</div>
            <a href={`${API_BASE}/geo/llms.txt`} target="_blank" className="text-xs text-accent-soft hover:underline">
              open raw →
            </a>
          </div>
          <pre className="text-xs font-mono text-zinc-300 bg-ink-soft border border-ink-line rounded-lg p-3 overflow-auto max-h-[460px] whitespace-pre-wrap">
            {llms || 'loading…'}
          </pre>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium">Published GEO feed ({feed.length})</div>
            <a href={`${API_BASE}/geo/feed`} target="_blank" className="text-xs text-accent-soft hover:underline">
              JSON feed →
            </a>
          </div>
          {feed.length === 0 ? (
            <div className="text-sm text-zinc-500 py-8 text-center">
              No published GEO content yet. Generate <code>geo_*</code> briefs and set them to <code>published</code>.
            </div>
          ) : (
            <div className="divide-y divide-ink-line max-h-[460px] overflow-auto">
              {feed.map((f) => (
                <div key={f.id} className="py-2">
                  <div className="text-sm font-medium">{f.title}</div>
                  <div className="text-xs text-zinc-500">{f.type} · /{f.url} · {(f.keywords || []).join(', ')}</div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 text-xs text-zinc-500 leading-relaxed">
            <strong>GEO strategy:</strong> each published geo_* item ships FAQPage/Article JSON-LD, a concise direct
            answer, sourced facts, and an entity definition — the signals LLMs use to cite. Serve <code>/api/geo/llms.txt</code>{' '}
            and the JSON-LD on your marketing site and submit to AI crawlers.
          </div>
        </Card>
      </div>
    </div>
  );
}

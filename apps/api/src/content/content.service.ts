import { Injectable, Inject } from '@nestjs/common';
import { marked } from 'marked';
import {
  GEO_QUALITY_GATES,
  isGeoType,
  type BrandProfile,
  type ComplianceIssue,
  type ComplianceResult,
  type ComplianceTerm,
  type ContentItem,
  type GeoMeta,
} from '@helix/shared';
import { REPOSITORIES, type Repositories } from '../repositories/repository';

export interface ReadinessResult {
  score: number; // 0..100
  ready: boolean;
  isGeo: boolean;
  compliancePassed: boolean;
  gates: { id: string; label: string; passed: boolean }[];
}

@Injectable()
export class ContentService {
  constructor(@Inject(REPOSITORIES) private repos: Repositories) {}

  /** Scan content against the org's compliance terms. Pure logic, no LLM. */
  async checkCompliance(orgId: string, item: ContentItem): Promise<ComplianceResult> {
    const terms = await this.repos.compliance.list(orgId);
    return scanCompliance(terms, item);
  }

  /**
   * Score how ready a piece of content is to publish / be cited by an AI engine.
   * Combines compliance with GEO quality gates (for geo_* types). Heuristics.
   */
  async scoreReadiness(item: ContentItem, compliance?: ComplianceResult | null): Promise<ReadinessResult> {
    const passed = compliance ?? item.compliance ?? null;
    const compliancePassed = passed ? passed.passed : false;

    if (!isGeoType(item.content_type)) {
      const gates = [
        { id: 'compliance', label: 'Passes compliance checks', passed: compliancePassed },
        { id: 'has_body', label: 'Has a non-trivial body', passed: item.body_markdown.trim().length > 200 },
        { id: 'has_summary', label: 'Has a summary / meta description', passed: !!(item.summary || item.meta_description) },
      ];
      return finalize(gates, compliancePassed, false);
    }

    const geo: GeoMeta | null = item.geo ?? null;
    const wordCount = item.body_markdown.trim().split(/\s+/).length;
    const firstParagraph = item.body_markdown.split('\n\n')[0] ?? '';
    const firstParaWords = firstParagraph.split(/\s+/).filter(Boolean).length;
    const linkCount = (item.body_markdown.match(/\]\(http/g) || []).length;
    const citations = geo?.citation_count ?? linkCount;

    const gates = [
      { id: 'g1', label: GEO_QUALITY_GATES[0], passed: firstParaWords > 0 && firstParaWords <= 60 },
      { id: 'g2', label: GEO_QUALITY_GATES[1], passed: citations >= 1 },
      { id: 'g3', label: GEO_QUALITY_GATES[2], passed: (geo?.entities?.length ?? 0) > 0 },
      { id: 'g4', label: GEO_QUALITY_GATES[3], passed: !!geo?.jsonld },
      { id: 'g5', label: GEO_QUALITY_GATES[4], passed: wordCount >= 150 && wordCount <= 1500 },
      { id: 'g6', label: GEO_QUALITY_GATES[5], passed: compliancePassed },
    ];
    return finalize(gates, compliancePassed, true);
  }

  /** Re-run compliance, persist onto the item, and return item + result. */
  async rerunCompliance(orgId: string, id: string) {
    const item = await this.repos.content.get(id);
    if (!item) throw notFound('content', id);
    const result = await this.checkCompliance(orgId, item);
    const updated = await this.repos.content.update(id, { compliance: result });
    const readiness = await this.scoreReadiness(updated, result);
    return { item: updated, compliance: result, readiness };
  }

  async exportItem(orgId: string, id: string, format: 'md' | 'html' | 'jsonld') {
    const item = await this.repos.content.get(id);
    if (!item) throw notFound('content', id);
    if (format === 'md') {
      return { format, filename: `${item.slug ?? item.id}.md`, body: toMarkdown(item) };
    }
    if (format === 'html') {
      const html = await marked(toMarkdown(item));
      return { format, filename: `${item.slug ?? item.id}.html`, body: fullHtml(item, html) };
    }
    return {
      format,
      filename: `${item.slug ?? item.id}.jsonld`,
      body: JSON.stringify(toJsonLd(item), null, 2),
    };
  }
}

/** Pure compliance scan (no repos / DI) — reused by BatchRunner. */
export function scanCompliance(terms: ComplianceTerm[], item: ContentItem): ComplianceResult {
  const hay = `${item.title}\n${item.summary ?? ''}\n${item.body_markdown}`.toLowerCase();
  const issues: ComplianceIssue[] = [];
  for (const t of terms) {
    const needle = t.term.toLowerCase();
    if (!needle) continue;
    const present = hay.includes(needle);
    if (t.category === 'banned' && present) {
      issues.push({ severity: t.severity, category: 'banned', term: t.term, suggestion: t.replacement ?? undefined });
    } else if (t.category === 'required' && !present) {
      issues.push({ severity: t.severity, category: 'required', term: t.term, suggestion: t.replacement ?? undefined });
    } else if (t.category === 'restricted' && present) {
      issues.push({ severity: t.severity, category: 'restricted', term: t.term, suggestion: t.replacement ?? undefined });
    }
  }
  const blocking = issues.filter((i) => i.category === 'banned' || i.category === 'required');
  return { checked_at: new Date().toISOString(), passed: blocking.length === 0, issues };
}

function finalize(gates: { id: string; label: string; passed: boolean }[], compliancePassed: boolean, isGeo: boolean): ReadinessResult {
  const passedCount = gates.filter((g) => g.passed).length;
  const score = Math.round((passedCount / gates.length) * 100);
  return {
    score,
    ready: score === 100 && (isGeo ? true : compliancePassed),
    isGeo,
    compliancePassed,
    gates,
  };
}

export function toMarkdown(item: ContentItem): string {
  const lines: string[] = [`# ${item.title}`, ''];
  if (item.summary) lines.push(`> ${item.summary}`, '');
  lines.push(item.body_markdown, '');
  if (item.geo?.faqs?.length) {
    lines.push('## FAQ', '');
    for (const f of item.geo.faqs) {
      lines.push(`**Q: ${f.question}**`, '', f.answer, '');
    }
  }
  if (item.tags?.length) lines.push('', `Tags: ${item.tags.join(', ')}`);
  return lines.join('\n');
}

export function toJsonLd(item: ContentItem): Record<string, unknown> {
  if (item.geo?.jsonld) return item.geo.jsonld;
  const base: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': item.content_type.startsWith('geo_faq') ? 'FAQPage' : 'Article',
    headline: item.title,
    description: item.meta_description ?? item.summary ?? '',
    inLanguage: item.language,
    datePublished: item.published_at ?? item.updated_at,
    keywords: (item.tags ?? []).join(', '),
  };
  if (item.geo?.faqs?.length) {
    base['mainEntity'] = item.geo.faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    }));
  }
  return base;
}

function fullHtml(item: ContentItem, bodyHtml: string): string {
  const jsonld = JSON.stringify(toJsonLd(item));
  return `<!doctype html><html lang="${item.language}"><head><meta charset="utf-8">
<title>${escapeHtml(item.title)}</title>
<meta name="description" content="${escapeHtml(item.meta_description ?? item.summary ?? '')}">
<script type="application/ld+json">${jsonld}</script>
</head><body><article>${bodyHtml}</article></body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

function notFound(entity: string, id: string): Error {
  const e = new Error(`${entity} ${id} not found`) as Error & { status?: number };
  e.status = 404;
  return e;
}

export type { BrandProfile, ComplianceTerm };

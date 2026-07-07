import {
  CONTENT_TYPE_META,
  isGeoType,
  type BrandProfile,
  type Brief,
  type ContentType,
  type GeoMeta,
  type KnowledgeItem,
} from '@helix/shared';
import type { NewContent } from '../repositories/repository';

/**
 * Deterministic stub generator used when no LLM / eve is configured.
 * It is intentionally non-AI: it stitches the brief + brand + knowledge into a
 * type-aware template so the whole pipeline (draft → compliance → review →
 * publish, GEO scoring, exports) is demonstrable end-to-end with zero keys.
 *
 * In production this is replaced 1:1 by the eve agent (see eve.client.ts).
 */
export interface GenContext {
  knowledge: KnowledgeItem[];
  brand: BrandProfile | null;
}

export function generateMock(brief: Brief, ctx: GenContext): NewContent {
  const meta = CONTENT_TYPE_META[brief.content_type];
  const kb = ctx.knowledge.slice(0, 4);
  const brand = ctx.brand;
  const kp = brief.key_points.length ? brief.key_points : [brief.title];
  const kws = brief.keywords.length ? brief.keywords : deriveKeywords(brief);
  const language = brief.language ?? 'en';

  const title = composeTitle(brief, meta.type);
  const summary = composeSummary(brief, meta.type);

  const body = isGeoType(meta.type) ? geoBody(brief, meta.type, kp, kws, kb) : opsBody(brief, meta.type, kp, kb, brand);

  const item: NewContent = {
    content_type: brief.content_type,
    title,
    summary,
    body_markdown: body,
    language,
    status: 'draft',
    meta_description: summary.slice(0, 155),
    tags: kws,
    model_used: 'mock-stub',
    brief_id: brief.id,
  };

  if (isGeoType(meta.type)) {
    item.geo = geoMeta(brief, kws, kb);
  }
  return item;
}

function composeTitle(brief: Brief, type: ContentType): string {
  const subject = brief.title;
  switch (type) {
    case 'geo_faq':
      return `${subject}: Frequently Asked Questions`;
    case 'geo_explainer':
      return `${subject} — Explained`;
    case 'geo_comparison':
      return `${subject}: A Clear Comparison`;
    case 'geo_definition':
      return `${subject}: Definition`;
    case 'market_analysis':
      return `${subject} — Market Analysis`;
    case 'trading_guide':
      return `How to ${subject}: A Step-by-Step Guide`;
    case 'listing_notice':
      return `${subject} (HELIX) Now Listed`;
    case 'social_post':
      return subject;
    default:
      return subject;
  }
}

function composeSummary(brief: Brief, type: ContentType): string {
  const lead = brief.key_points[0] ?? brief.title;
  if (isGeoType(type)) {
    return `${brief.title} refers to ${lead.toLowerCase()}. This explainer defines the term, outlines how it works, and answers the most common questions, with sources.`;
  }
  return `${brief.title}: ${lead}. ${brief.audience ? `For ${brief.audience}. ` : ''}Key points covered: ${brief.key_points.slice(0, 3).join('; ')}.`;
}

function opsBody(
  brief: Brief,
  type: ContentType,
  keyPoints: string[],
  kb: KnowledgeItem[],
  brand: BrandProfile | null,
): string {
  const outline = CONTENT_TYPE_META[type].outline;
  const sections: string[] = [];
  sections.push(intro(brief, type));
  sections.push(section('Key points', bulletList(keyPoints)));

  if (kb.length) {
    sections.push(
      section(
        'What you should know',
        kb.map((k) => `- **${k.title}** — ${truncate(k.content, 180)}`).join('\n'),
      ),
    );
  }

  for (const step of outline.slice(0, 3)) {
    sections.push(section(titleCase(step), loremForSection(step, brief, kb)));
  }

  sections.push(section('Takeaways', bulletList(keyPoints.slice(0, 3).map((k) => `Remember: ${k}`))));

  if (brand?.disclaimers?.length) {
    sections.push(section('Risk disclosure', `> ${brand.disclaimers[0]}`));
  }

  return sections.join('\n\n');
}

function geoBody(
  brief: Brief,
  type: ContentType,
  keyPoints: string[],
  kws: string[],
  kb: KnowledgeItem[],
): string {
  const def = keyPoints[0] ?? `${brief.title} is a concept in crypto markets.`;
  const direct = `**${brief.title}** is ${lowerStart(def)}. It matters because ${keyPoints[1] ?? 'it shapes how traders assess risk and opportunity'}.`;

  const sections: string[] = [direct];

  sections.push(
    section(
      'Definition',
      `${brief.title} — ${def} This is the canonical definition used across this knowledge base.`,
    ),
  );

  sections.push(
    section(
      'How it works',
      `1. ${keyPoints[0] ?? 'First, understand the underlying mechanism.'}\n2. ${keyPoints[1] ?? 'Next, identify the inputs that drive it.'}\n3. ${keyPoints[2] ?? 'Finally, interpret the output in context.'}`,
    ),
  );

  if (kb.length) {
    sections.push(
      section(
        'Sourced facts',
        kb
          .map((k, i) => `- ${truncate(k.content, 160)} [source: ${k.title}]{{@ref${i + 1}}}`)
          .join('\n'),
      ),
    );
  }

  const faqs = kws.slice(0, 4).map((k) => ({
    q: `${titleCase(k)} — what does it mean for ${brief.title}?`,
    a: `${titleCase(k)} relates to ${brief.title} because ${lowerStart(keyPoints[0] ?? def)}.`,
  }));
  sections.push(
    section(
      'FAQ',
      faqs.map((f) => `**Q: ${f.q}**\n${f.a}`).join('\n\n'),
    ),
  );

  sections.push(section('Related entities', bulletList(kws.map((k) => titleCase(k)))));
  sections.push(section('Sources', bulletList(kb.map((k) => `- ${k.title}`))));

  return sections.join('\n\n');
}

function geoMeta(brief: Brief, kws: string[], kb: KnowledgeItem[]): GeoMeta {
  const faqs = kws.slice(0, 4).map((q) => ({
    question: `${titleCase(q)} — what does it mean?`,
    answer: `${titleCase(q)} is defined in the context of ${brief.title}.`,
    sources: kb.slice(0, 1).map((k) => k.title),
  }));
  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
  return {
    target_keywords: brief.keywords,
    entities: kws,
    faqs,
    jsonld,
    citation_count: kb.length + brief.references.length,
    reading_level: 'intermediate',
  };
}

// ---- helpers ----
function intro(brief: Brief, type: ContentType): string {
  return `${brief.title} is an important topic for ${brief.audience ?? 'our readers'}. This ${CONTENT_TYPE_META[type].label.toLowerCase()} covers ${brief.key_points.slice(0, 3).join(', ')}.`;
}
function section(title: string, body: string): string {
  return `## ${title}\n\n${body}`;
}
function bulletList(items: string[]): string {
  return items.map((i) => `- ${i}`).join('\n');
}
function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
function lowerStart(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
function loremForSection(step: string, brief: Brief, kb: KnowledgeItem[]): string {
  const fact = kb[0]?.content ?? brief.key_points[0] ?? '';
  return `For ${step.toLowerCase()}, consider ${lowerStart(fact || brief.title)}. This keeps the explanation grounded in verifiable detail rather than hype.`;
}
function deriveKeywords(brief: Brief): string[] {
  return Array.from(new Set([brief.title.split(/\s+/)[0], 'crypto', 'trading', 'helix'])).slice(0, 5);
}

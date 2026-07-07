import type { ContentFamily, ContentType, Language } from './enums';

export interface ContentTypeMeta {
  type: ContentType;
  family: ContentFamily;
  label: string;
  description: string;
  isGeo: boolean;
  /** Default production outline — maps to subagent steps. */
  outline: string[];
}

/**
 * Catalogue of every content type with its production outline.
 * The agent uses `outline` to know what a good draft for this type contains,
 * and the UI uses it to render type choosers.
 */
export const CONTENT_TYPE_META: Record<ContentType, ContentTypeMeta> = {
  announcement: {
    type: 'announcement',
    family: 'ops',
    label: 'Announcement',
    description: 'Product / listing / maintenance announcements.',
    isGeo: false,
    outline: ['headline', 'what changed', 'impact on users', 'timeline', 'call to action', 'support channel'],
  },
  market_analysis: {
    type: 'market_analysis',
    family: 'ops',
    label: 'Market Analysis',
    description: 'Market recap / token / sector analysis with disclaimers.',
    isGeo: false,
    outline: ['headline + TL;DR', 'macro context', 'asset/sector breakdown', 'on-chain or data evidence', 'risk factors', 'disclaimer'],
  },
  trading_guide: {
    type: 'trading_guide',
    family: 'ops',
    label: 'Trading Guide',
    description: 'How-to / educational trading walkthrough.',
    isGeo: false,
    outline: ['objective', 'prerequisites', 'step-by-step', 'worked example', 'common pitfalls', 'risk disclaimer'],
  },
  listing_notice: {
    type: 'listing_notice',
    family: 'ops',
    label: 'Listing Notice',
    description: 'New token listing notice with ticker, pairs, schedule.',
    isGeo: false,
    outline: ['asset overview', 'ticker & chain', 'trading pairs', 'schedule (deposit/trade/withdraw)', 'links', 'risk disclaimer'],
  },
  social_post: {
    type: 'social_post',
    family: 'ops',
    label: 'Social Post',
    description: 'Short-form social / X post with hooks + hashtags.',
    isGeo: false,
    outline: ['hook', 'body', 'cta', 'hashtags', 'compliance note'],
  },
  educational: {
    type: 'educational',
    family: 'ops',
    label: 'Educational',
    description: 'Evergreen explainer / academy content.',
    isGeo: false,
    outline: ['intro hook', 'core concept', 'example', 'deeper detail', 'summary', 'next steps'],
  },
  ama_recap: {
    type: 'ama_recap',
    family: 'ops',
    label: 'AMA Recap',
    description: 'Recap of an AMA / livestream with Q&A.',
    isGeo: false,
    outline: ['overview', 'key announcements', 'Q&A highlights', 'quotes', 'what to watch next'],
  },
  geo_faq: {
    type: 'geo_faq',
    family: 'geo',
    label: 'GEO FAQ',
    description: 'FAQ page optimized to be cited by LLMs (FAQPage JSON-LD).',
    isGeo: true,
    outline: ['entity definition', 'concise direct answer (<=50 words)', 'supporting detail', 'sourced facts', 'FAQPage JSON-LD', 'related entities'],
  },
  geo_explainer: {
    type: 'geo_explainer',
    family: 'geo',
    label: 'GEO Explainer',
    description: 'Authoritative explainer targeting AI answer engines.',
    isGeo: true,
    outline: ['TL;DR answer', 'definitions', 'step-by-step', 'data with sources', 'comparisons', 'citations'],
  },
  geo_comparison: {
    type: 'geo_comparison',
    family: 'geo',
    label: 'GEO Comparison',
    description: 'Structured X-vs-Y comparison (table + analysis).',
    isGeo: true,
    outline: ['entities defined', 'comparison table', 'when to choose each', 'data with sources', 'citations'],
  },
  geo_definition: {
    type: 'geo_definition',
    family: 'geo',
    label: 'GEO Definition',
    description: 'Glossary-style term definition for AI retrieval.',
    isGeo: true,
    outline: ['term', 'one-sentence definition', 'expanded explanation', 'example', 'related terms', 'source'],
  },
};

export const CONTENT_TYPE_OPTIONS: ContentTypeMeta[] = Object.values(CONTENT_TYPE_META);

export const LANGUAGE_LABELS: Record<Language, string> = {
  en: 'English',
  zh: '中文',
  ja: '日本語',
  ko: '한국어',
  es: 'Español',
  vi: 'Tiếng Việt',
};

/**
 * GEO quality gates enforced by the geo-checklist skill + check_compliance tool.
 * A geo_* item is not "approved" until these hold.
 */
export const GEO_QUALITY_GATES = [
  'Has a concise direct answer in the first 1–2 sentences',
  'Every non-trivial factual claim has a source citation',
  'Defines the target entity/term explicitly',
  'Includes valid JSON-LD structured data',
  'Reading level is appropriate for a general audience',
  'Contains no banned / uncompliant phrasing',
] as const;

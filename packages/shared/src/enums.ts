// Helix domain enums — shared across api, web and the eve agent.

export const RUN_MODES = ['mock', 'supabase'] as const;
export type RunMode = (typeof RUN_MODES)[number];

export const CONTENT_FAMILIES = ['ops', 'geo'] as const;
export type ContentFamily = (typeof CONTENT_FAMILIES)[number];

/**
 * Every content type the midplatform can produce.
 * - ops*  → human-facing operations / marketing content (conversion)
 * - geo*  → Generative-Engine-Optimized content (cited by LLMs)
 */
export const CONTENT_TYPES = [
  // operations
  'announcement',
  'market_analysis',
  'trading_guide',
  'listing_notice',
  'social_post',
  'educational',
  'ama_recap',
  // geo
  'geo_faq',
  'geo_explainer',
  'geo_comparison',
  'geo_definition',
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_STATUSES = [
  'draft',
  'reviewing',
  'approved',
  'published',
  'rejected',
  'archived',
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const LANGUAGES = ['en', 'zh', 'ja', 'ko', 'es', 'vi'] as const;
export type Language = (typeof LANGUAGES)[number];

export const JOB_STATUSES = ['queued', 'running', 'completed', 'failed', 'partial'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const COMPLIANCE_CATEGORIES = ['banned', 'restricted', 'required'] as const;
export type ComplianceCategory = (typeof COMPLIANCE_CATEGORIES)[number];

export const KNOWLEDGE_TYPES = ['doc', 'fact', 'faq', 'product', 'competitor', 'market_data'] as const;
export type KnowledgeType = (typeof KNOWLEDGE_TYPES)[number];

export function contentFamilyOf(type: ContentType): ContentFamily {
  return (type as string).startsWith('geo_') ? 'geo' : 'ops';
}

export function isGeoType(type: ContentType): boolean {
  return contentFamilyOf(type) === 'geo';
}

import type {
  ComplianceCategory,
  ContentStatus,
  ContentType,
  JobStatus,
  KnowledgeType,
  Language,
} from './enums';

/** An org / tenant. Single-tenant friendly (a default org is seeded). */
export interface Org {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

/** Org-level brand & compliance profile — drives eve skills. */
export interface BrandProfile {
  id: string;
  org_id: string;
  name: string;
  brand_voice: string; // free-form tone description
  target_audience: string | null;
  do_phrases: string[]; // preferred phrasing
  dont_phrases: string[]; // avoid
  glossary: Record<string, string>; // term -> preferred phrasing / definition
  disclaimers: string[]; // e.g. risk-disclosure template
  target_markets: string[]; // regions, for compliance scoping
  default_language: Language;
  updated_at: string;
}

/** A knowledge-base item (素材库) — fed to the agent via query_kb. */
export interface KnowledgeItem {
  id: string;
  org_id: string;
  type: KnowledgeType;
  title: string;
  content: string;
  source_url?: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
}

/** A compliance term (禁用/限制/必带词). */
export interface ComplianceTerm {
  id: string;
  org_id: string;
  term: string;
  category: ComplianceCategory;
  severity: 'low' | 'medium' | 'high';
  reason?: string | null;
  replacement?: string | null;
  created_at: string;
}

/**
 * A content brief — the unit of "produce me content".
 * A brief is turned into one or more ContentItems by the agent.
 */
export interface Brief {
  id: string;
  org_id: string;
  title: string;
  content_type: ContentType;
  language: Language;
  audience?: string | null;
  key_points: string[]; // must-cover points
  keywords: string[]; // SEO / GEO target keywords
  references: string[]; // source urls / context
  notes?: string | null;
  target_channel?: string | null; // web / twitter / blog / ...
  status: 'pending' | 'generating' | 'done' | 'failed';
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

/** A GEO FAQ block — question + answer + cited sources. */
export interface GeoFaq {
  question: string;
  answer: string;
  sources?: string[];
}

/** Compliance check result attached to a content item. */
export interface ComplianceResult {
  checked_at: string;
  passed: boolean;
  issues: ComplianceIssue[];
}
export interface ComplianceIssue {
  severity: 'low' | 'medium' | 'high';
  category: ComplianceCategory;
  term: string;
  snippet?: string;
  suggestion?: string;
}

/** GEO-specific metadata (only populated for geo_* types). */
export interface GeoMeta {
  target_keywords: string[];
  entities: string[]; // named entities the content defines/mentions
  faqs: GeoFaq[];
  jsonld?: Record<string, unknown> | null; // structured data (FAQPage / Article)
  citation_count: number;
  reading_level: 'basic' | 'intermediate' | 'advanced';
}

/** A produced piece of content. */
export interface ContentItem {
  id: string;
  org_id: string;
  brief_id?: string | null;
  content_type: ContentType;
  title: string;
  slug?: string | null;
  summary?: string | null;
  body_markdown: string;
  body_html?: string | null;
  language: Language;
  status: ContentStatus;
  meta_description?: string | null;
  tags: string[];
  geo?: GeoMeta | null;
  compliance?: ComplianceResult | null;
  model_used?: string | null;
  agent_run_id?: string | null; // eve session / trace id
  tokens_used?: number | null;
  created_at: string;
  updated_at: string;
  published_at?: string | null;
}

/** A batch generation job — fans out one durable session per brief. */
export interface ContentJob {
  id: string;
  org_id: string;
  name: string;
  brief_ids: string[];
  status: JobStatus;
  total: number;
  done: number;
  failed: number;
  config: {
    concurrency: number;
    draft_model?: string;
    quality_model?: string;
  };
  started_at?: string | null;
  finished_at?: string | null;
  created_at: string;
  results?: Record<string, { content_id?: string; status: 'ok' | 'error'; error?: string }>;
}

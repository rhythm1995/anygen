import { z } from 'zod';
import {
  COMPLIANCE_CATEGORIES,
  CONTENT_STATUSES,
  CONTENT_TYPES,
  KNOWLEDGE_TYPES,
  LANGUAGES,
} from './enums';

export const uuid = z.string().uuid();

export const createBriefSchema = z.object({
  title: z.string().min(3).max(200),
  content_type: z.enum(CONTENT_TYPES),
  language: z.enum(LANGUAGES).default('en'),
  audience: z.string().max(300).nullish(),
  key_points: z.array(z.string().min(1)).min(1).max(20),
  keywords: z.array(z.string().min(1)).max(30).default([]),
  references: z.array(z.string().url()).max(20).default([]),
  notes: z.string().max(2000).nullish(),
  target_channel: z.string().max(100).nullish(),
});
export type CreateBriefInput = z.infer<typeof createBriefSchema>;

export const updateContentSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  body_markdown: z.string().min(1).optional(),
  summary: z.string().max(500).nullish(),
  meta_description: z.string().max(300).nullish(),
  slug: z.string().max(200).nullish(),
  tags: z.array(z.string()).max(30).optional(),
  status: z.enum(CONTENT_STATUSES).optional(),
});
export type UpdateContentInput = z.infer<typeof updateContentSchema>;

export const createJobSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  brief_ids: z.array(uuid).min(1).max(50),
  concurrency: z.number().int().min(1).max(10).default(5),
  draft_model: z.string().optional(),
  quality_model: z.string().optional(),
});
export type CreateJobInput = z.infer<typeof createJobSchema>;

export const createKnowledgeSchema = z.object({
  type: z.enum(KNOWLEDGE_TYPES),
  title: z.string().min(1).max(300),
  content: z.string().min(1).max(20000),
  source_url: z.string().url().nullish(),
  tags: z.array(z.string()).max(30).default([]),
  metadata: z.record(z.unknown()).default({}),
});
export type CreateKnowledgeInput = z.infer<typeof createKnowledgeSchema>;

export const upsertBrandSchema = z.object({
  name: z.string().min(1).max(200),
  brand_voice: z.string().min(1).max(2000),
  target_audience: z.string().max(1000).nullish(),
  do_phrases: z.array(z.string()).max(100).default([]),
  dont_phrases: z.array(z.string()).max(100).default([]),
  glossary: z.record(z.string(), z.string()).default({}),
  disclaimers: z.array(z.string()).max(50).default([]),
  target_markets: z.array(z.string()).max(50).default([]),
  default_language: z.enum(LANGUAGES).default('en'),
});
export type UpsertBrandInput = z.infer<typeof upsertBrandSchema>;

export const createComplianceTermSchema = z.object({
  term: z.string().min(1).max(200),
  category: z.enum(COMPLIANCE_CATEGORIES),
  severity: z.enum(['low', 'medium', 'high']).default('medium'),
  reason: z.string().max(1000).nullish(),
  replacement: z.string().max(300).nullish(),
});
export type CreateComplianceTermInput = z.infer<typeof createComplianceTermSchema>;

export const transitionStatusSchema = z.object({
  to: z.enum(CONTENT_STATUSES),
});

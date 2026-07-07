import { Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BrandProfile,
  Brief,
  ComplianceTerm,
  ContentItem,
  ContentJob,
  KnowledgeItem,
  Org,
} from '@helix/shared';
import type { ContentStatus } from '@helix/shared';
import type {
  BrandRepo,
  BriefRepo,
  ComplianceRepo,
  ContentRepo,
  JobRepo,
  KnowledgeRepo,
  ListOpts,
  NewContent,
  OrgRepo,
  Repositories,
} from './repository';
import { slugify } from './in-memory.repository';

const fail = (e: { message: string; code?: string }) => {
  throw new Error(`[supabase] ${e.message}`);
};
const nf = (entity: string, id: string) => {
  const err = new Error(`${entity} ${id} not found`) as Error & { status?: number };
  err.status = 404;
  throw err;
};

@Injectable()
export class SupabaseRepositories implements Repositories {
  constructor(private client: SupabaseClient) {}

  orgs: OrgRepo = {
    getById: async (id) => {
      const { data, error } = await this.client.from('orgs').select('*').eq('id', id).maybeSingle();
      if (error) fail(error);
      return (data as Org) ?? null;
    },
  };

  brand: BrandRepo = {
    get: async (orgId) => {
      const { data, error } = await this.client
        .from('brand_profiles')
        .select('*')
        .eq('org_id', orgId)
        .maybeSingle();
      if (error) fail(error);
      return (data as BrandProfile) ?? null;
    },
    upsert: async (orgId, input) => {
      const row = { ...input, org_id: orgId };
      const existing = await this.brand.get(orgId);
      if (existing) {
        const { data, error } = await this.client
          .from('brand_profiles')
          .update(row)
          .eq('id', existing.id)
          .select()
          .single();
        if (error) fail(error);
        return data as BrandProfile;
      }
      const { data, error } = await this.client.from('brand_profiles').insert(row).select().single();
      if (error) fail(error);
      return data as BrandProfile;
    },
  };

  knowledge: KnowledgeRepo = {
    list: async (orgId, opts = {}) => {
      let q = this.client.from('knowledge_items').select('*').eq('org_id', orgId);
      if (opts.type) q = q.eq('type', opts.type);
      if (opts.q) q = q.or(`title.ilike.%${opts.q}%,content.ilike.%${opts.q}%`);
      const { data, error } = await q.order('created_at', { ascending: false });
      if (error) fail(error);
      return (data as KnowledgeItem[]) ?? [];
    },
    get: async (id) => {
      const { data, error } = await this.client.from('knowledge_items').select('*').eq('id', id).maybeSingle();
      if (error) fail(error);
      return (data as KnowledgeItem) ?? null;
    },
    create: async (orgId, input) => {
      const { data, error } = await this.client
        .from('knowledge_items')
        .insert({ ...input, org_id: orgId })
        .select()
        .single();
      if (error) fail(error);
      return data as KnowledgeItem;
    },
    update: async (id, patch) => {
      const { data, error } = await this.client.from('knowledge_items').update(patch).eq('id', id).select().single();
      if (error) fail(error);
      return data as KnowledgeItem;
    },
    delete: async (id) => {
      const { error } = await this.client.from('knowledge_items').delete().eq('id', id);
      if (error) fail(error);
    },
  };

  compliance: ComplianceRepo = {
    list: async (orgId) => {
      const { data, error } = await this.client
        .from('compliance_terms')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });
      if (error) fail(error);
      return (data as ComplianceTerm[]) ?? [];
    },
    create: async (orgId, input) => {
      const { data, error } = await this.client
        .from('compliance_terms')
        .insert({ ...input, org_id: orgId })
        .select()
        .single();
      if (error) fail(error);
      return data as ComplianceTerm;
    },
    delete: async (id) => {
      const { error } = await this.client.from('compliance_terms').delete().eq('id', id);
      if (error) fail(error);
    },
  };

  briefs: BriefRepo = {
    list: async (orgId) => {
      const { data, error } = await this.client
        .from('briefs')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });
      if (error) fail(error);
      return (data as Brief[]) ?? [];
    },
    get: async (id) => {
      const { data, error } = await this.client.from('briefs').select('*').eq('id', id).maybeSingle();
      if (error) fail(error);
      return (data as Brief) ?? null;
    },
    create: async (orgId, input) => {
      const { data, error } = await this.client
        .from('briefs')
        .insert({ ...input, org_id: orgId })
        .select()
        .single();
      if (error) fail(error);
      return data as Brief;
    },
    update: async (id, patch) => {
      const { data, error } = await this.client.from('briefs').update(patch).eq('id', id).select().single();
      if (error) fail(error);
      return data as Brief;
    },
  };

  content: ContentRepo = {
    list: async (orgId, opts = {}) => {
      let q = this.client.from('content_items').select('*').eq('org_id', orgId);
      if (opts.status) q = q.eq('status', opts.status);
      if (opts.type) q = q.eq('content_type', opts.type);
      if (opts.q) q = q.or(`title.ilike.%${opts.q}%,body_markdown.ilike.%${opts.q}%`);
      const { data, error } = await q.order('created_at', { ascending: false });
      if (error) fail(error);
      return (data as ContentItem[]) ?? [];
    },
    get: async (id) => {
      const { data, error } = await this.client.from('content_items').select('*').eq('id', id).maybeSingle();
      if (error) fail(error);
      return (data as ContentItem) ?? null;
    },
    create: async (orgId, input: NewContent) => {
      const row = {
        ...input,
        org_id: orgId,
        slug: input.slug ?? slugify(input.title),
      };
      const { data, error } = await this.client.from('content_items').insert(row).select().single();
      if (error) fail(error);
      return data as ContentItem;
    },
    update: async (id, patch) => {
      const { data, error } = await this.client.from('content_items').update(patch).eq('id', id).select().single();
      if (error) fail(error);
      return data as ContentItem;
    },
    delete: async (id) => {
      const { error } = await this.client.from('content_items').delete().eq('id', id);
      if (error) fail(error);
    },
    setStatus: async (id, status: ContentStatus) => {
      const patch: Partial<ContentItem> = { status };
      if (status === 'published') patch.published_at = new Date().toISOString();
      const { data, error } = await this.client.from('content_items').update(patch).eq('id', id).select().single();
      if (error) fail(error);
      return data as ContentItem;
    },
  };

  jobs: JobRepo = {
    list: async (orgId) => {
      const { data, error } = await this.client
        .from('content_jobs')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });
      if (error) fail(error);
      return (data as ContentJob[]) ?? [];
    },
    get: async (id) => {
      const { data, error } = await this.client.from('content_jobs').select('*').eq('id', id).maybeSingle();
      if (error) fail(error);
      return (data as ContentJob) ?? null;
    },
    create: async (orgId, input) => {
      const { data, error } = await this.client
        .from('content_jobs')
        .insert({ ...input, org_id: orgId })
        .select()
        .single();
      if (error) fail(error);
      return data as ContentJob;
    },
    update: async (id, patch) => {
      const { data, error } = await this.client.from('content_jobs').update(patch).eq('id', id).select().single();
      if (error) fail(error);
      return data as ContentJob;
    },
  };
}

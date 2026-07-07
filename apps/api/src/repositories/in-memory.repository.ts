import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
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
import { DEFAULT_ORG_ID } from '../common/org-context';
import { seedKnowledge, seedCompliance, seedBrand } from './seed';

const now = () => new Date().toISOString();
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

@Injectable()
export class InMemoryRepositories implements Repositories {
  private readonly log = new Logger('InMemoryRepo');
  orgs: OrgRepo;
  brand: BrandRepo;
  knowledge: KnowledgeRepo;
  compliance: ComplianceRepo;
  briefs: BriefRepo;
  content: ContentRepo;
  jobs: JobRepo;

  private readonly store = {
    orgs: new Map<string, Org>(),
    brand: new Map<string, BrandProfile>(),
    knowledge: new Map<string, KnowledgeItem>(),
    compliance: new Map<string, ComplianceTerm>(),
    briefs: new Map<string, Brief>(),
    content: new Map<string, ContentItem>(),
    jobs: new Map<string, ContentJob>(),
  };

  constructor() {
    this.seed();
    this.orgs = this.makeOrgs();
    this.brand = this.makeBrand();
    this.knowledge = this.makeKnowledge();
    this.compliance = this.makeCompliance();
    this.briefs = this.makeBriefs();
    this.content = this.makeContent();
    this.jobs = this.makeJobs();
    this.log.log(`seeded default org + ${seedKnowledge.length} knowledge items + ${seedCompliance.length} compliance terms`);
  }

  private seed() {
    this.store.orgs.set(DEFAULT_ORG_ID, {
      id: DEFAULT_ORG_ID,
      name: 'Helix Demo Exchange',
      slug: 'default',
      created_at: now(),
    });
    this.store.brand.set(DEFAULT_ORG_ID, {
      ...seedBrand,
      id: randomUUID(),
      org_id: DEFAULT_ORG_ID,
      updated_at: now(),
    } as BrandProfile);
    for (const k of seedKnowledge)
      this.store.knowledge.set(randomUUID(), { ...k, id: randomUUID(), org_id: DEFAULT_ORG_ID, created_at: now() } as KnowledgeItem);
    for (const c of seedCompliance)
      this.store.compliance.set(randomUUID(), { ...c, id: randomUUID(), org_id: DEFAULT_ORG_ID, created_at: now() } as ComplianceTerm);
  }

  // ---- orgs ----
  private makeOrgs(): OrgRepo {
    return {
      getById: async (id) => clone(this.store.orgs.get(id) ?? null),
    };
  }

  // ---- brand ----
  private makeBrand(): BrandRepo {
    return {
      get: async (orgId) => clone(this.store.brand.get(orgId) ?? null),
      upsert: async (orgId, input) => {
        const existing = this.store.brand.get(orgId);
        const next: BrandProfile = {
          ...(existing ?? {
            id: randomUUID(),
            org_id: orgId,
            name: 'Default',
            brand_voice: '',
            target_audience: null,
            do_phrases: [],
            dont_phrases: [],
            glossary: {},
            disclaimers: [],
            target_markets: [],
            default_language: 'en',
            updated_at: now(),
          }),
          ...input,
          org_id: orgId,
          updated_at: now(),
        } as BrandProfile;
        this.store.brand.set(orgId, next);
        return clone(next);
      },
    };
  }

  // ---- knowledge ----
  private makeKnowledge(): KnowledgeRepo {
    return {
      list: async (orgId, opts = {}) => {
        let items = [...this.store.knowledge.values()].filter((k) => k.org_id === orgId);
        if (opts.type) items = items.filter((k) => k.type === opts.type);
        if (opts.q) {
          const q = opts.q.toLowerCase();
          items = items.filter(
            (k) => k.title.toLowerCase().includes(q) || k.content.toLowerCase().includes(q),
          );
        }
        return clone(items.sort((a, b) => b.created_at.localeCompare(a.created_at)));
      },
      get: async (id) => clone(this.store.knowledge.get(id) ?? null),
      create: async (orgId, input) => {
        const item: KnowledgeItem = {
          id: randomUUID(),
          org_id: orgId,
          type: input.type ?? 'doc',
          title: input.title ?? 'Untitled',
          content: input.content ?? '',
          source_url: input.source_url ?? null,
          tags: input.tags ?? [],
          metadata: input.metadata ?? {},
          created_at: now(),
        };
        this.store.knowledge.set(item.id, item);
        return clone(item);
      },
      update: async (id, patch) => {
        const cur = this.store.knowledge.get(id);
        if (!cur) throw notFound('knowledge', id);
        const next = { ...cur, ...patch };
        this.store.knowledge.set(id, next);
        return clone(next);
      },
      delete: async (id) => {
        this.store.knowledge.delete(id);
      },
    };
  }

  // ---- compliance ----
  private makeCompliance(): ComplianceRepo {
    return {
      list: async (orgId) =>
        clone([...this.store.compliance.values()].filter((c) => c.org_id === orgId)),
      create: async (orgId, input) => {
        const term: ComplianceTerm = {
          id: randomUUID(),
          org_id: orgId,
          term: input.term ?? '',
          category: input.category ?? 'restricted',
          severity: input.severity ?? 'medium',
          reason: input.reason ?? null,
          replacement: input.replacement ?? null,
          created_at: now(),
        };
        this.store.compliance.set(term.id, term);
        return clone(term);
      },
      delete: async (id) => {
        this.store.compliance.delete(id);
      },
    };
  }

  // ---- briefs ----
  private makeBriefs(): BriefRepo {
    return {
      list: async (orgId) =>
        clone(
          [...this.store.briefs.values()]
            .filter((b) => b.org_id === orgId)
            .sort((a, b) => b.created_at.localeCompare(a.created_at)),
        ),
      get: async (id) => clone(this.store.briefs.get(id) ?? null),
      create: async (orgId, input) => {
        const brief: Brief = {
          id: randomUUID(),
          org_id: orgId,
          title: input.title ?? 'Untitled brief',
          content_type: input.content_type ?? 'educational',
          language: input.language ?? 'en',
          audience: input.audience ?? null,
          key_points: input.key_points ?? [],
          keywords: input.keywords ?? [],
          references: input.references ?? [],
          notes: input.notes ?? null,
          target_channel: input.target_channel ?? null,
          status: 'pending',
          created_by: input.created_by ?? null,
          created_at: now(),
          updated_at: now(),
        };
        this.store.briefs.set(brief.id, brief);
        return clone(brief);
      },
      update: async (id, patch) => {
        const cur = this.store.briefs.get(id);
        if (!cur) throw notFound('brief', id);
        const next = { ...cur, ...patch, updated_at: now() };
        this.store.briefs.set(id, next);
        return clone(next);
      },
    };
  }

  // ---- content ----
  private makeContent(): ContentRepo {
    return {
      list: async (orgId, opts = {}) => {
        let items = [...this.store.content.values()].filter((c) => c.org_id === orgId);
        if (opts.status) items = items.filter((c) => c.status === opts.status);
        if (opts.type) items = items.filter((c) => c.content_type === opts.type);
        if (opts.q) {
          const q = opts.q.toLowerCase();
          items = items.filter(
            (c) => c.title.toLowerCase().includes(q) || c.body_markdown.toLowerCase().includes(q),
          );
        }
        return clone(items.sort((a, b) => b.created_at.localeCompare(a.created_at)));
      },
      get: async (id) => clone(this.store.content.get(id) ?? null),
      create: async (orgId, input: NewContent) => {
        const item: ContentItem = {
          id: randomUUID(),
          org_id: orgId,
          brief_id: input.brief_id ?? null,
          content_type: input.content_type,
          title: input.title,
          slug: input.slug ?? slugify(input.title),
          summary: input.summary ?? null,
          body_markdown: input.body_markdown,
          body_html: input.body_html ?? null,
          language: input.language,
          status: input.status ?? 'draft',
          meta_description: input.meta_description ?? null,
          tags: input.tags ?? [],
          geo: input.geo ?? null,
          compliance: input.compliance ?? null,
          model_used: input.model_used ?? null,
          agent_run_id: input.agent_run_id ?? null,
          tokens_used: input.tokens_used ?? null,
          created_at: now(),
          updated_at: now(),
          published_at: input.published_at ?? null,
        };
        this.store.content.set(item.id, item);
        return clone(item);
      },
      update: async (id, patch) => {
        const cur = this.store.content.get(id);
        if (!cur) throw notFound('content', id);
        const next: ContentItem = {
          ...cur,
          ...patch,
          updated_at: now(),
          published_at:
            patch.status === 'published' ? now() : cur.published_at,
        };
        this.store.content.set(id, next);
        return clone(next);
      },
      delete: async (id) => {
        this.store.content.delete(id);
      },
      setStatus: async (id, status) => {
        return this.makeContentUpdate(id, { status });
      },
    };
  }

  // helper to reuse update logic from setStatus without recursion
  private makeContentUpdate(id: string, patch: Partial<ContentItem>) {
    const cur = this.store.content.get(id);
    if (!cur) throw notFound('content', id);
    const next: ContentItem = {
      ...cur,
      ...patch,
      updated_at: now(),
      published_at: patch.status === 'published' ? now() : cur.published_at,
    };
    this.store.content.set(id, next);
    return clone(next);
  }

  // ---- jobs ----
  private makeJobs(): JobRepo {
    return {
      list: async (orgId) =>
        clone(
          [...this.store.jobs.values()]
            .filter((j) => j.org_id === orgId)
            .sort((a, b) => b.created_at.localeCompare(a.created_at)),
        ),
      get: async (id) => clone(this.store.jobs.get(id) ?? null),
      create: async (orgId, input) => {
        const job: ContentJob = {
          id: randomUUID(),
          org_id: orgId,
          name: input.name ?? 'Batch',
          brief_ids: input.brief_ids ?? [],
          status: input.status ?? 'queued',
          total: input.total ?? 0,
          done: input.done ?? 0,
          failed: input.failed ?? 0,
          config: input.config ?? { concurrency: 5 },
          results: input.results ?? {},
          started_at: input.started_at ?? null,
          finished_at: input.finished_at ?? null,
          created_at: now(),
        };
        this.store.jobs.set(job.id, job);
        return clone(job);
      },
      update: async (id, patch) => {
        const cur = this.store.jobs.get(id);
        if (!cur) throw notFound('job', id);
        const next = { ...cur, ...patch };
        this.store.jobs.set(id, next);
        return clone(next);
      },
    };
  }
}

function notFound(entity: string, id: string): Error {
  // Nest will map an Error to 500; wrap into NotFound for proper 404 upstream.
  const e = new Error(`${entity} ${id} not found`) as Error & { status?: number };
  e.status = 404;
  return e;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

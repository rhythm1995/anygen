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

export interface ListOpts {
  status?: string;
  type?: string;
  limit?: number;
  offset?: number;
  q?: string;
}

export interface OrgRepo {
  getById(id: string): Promise<Org | null>;
}

export interface BrandRepo {
  get(orgId: string): Promise<BrandProfile | null>;
  upsert(orgId: string, input: Partial<BrandProfile>): Promise<BrandProfile>;
}

export interface KnowledgeRepo {
  list(orgId: string, opts?: ListOpts): Promise<KnowledgeItem[]>;
  get(id: string): Promise<KnowledgeItem | null>;
  create(orgId: string, input: Partial<KnowledgeItem>): Promise<KnowledgeItem>;
  update(id: string, patch: Partial<KnowledgeItem>): Promise<KnowledgeItem>;
  delete(id: string): Promise<void>;
}

export interface ComplianceRepo {
  list(orgId: string): Promise<ComplianceTerm[]>;
  create(orgId: string, input: Partial<ComplianceTerm>): Promise<ComplianceTerm>;
  delete(id: string): Promise<void>;
}

export interface BriefRepo {
  list(orgId: string): Promise<Brief[]>;
  get(id: string): Promise<Brief | null>;
  create(orgId: string, input: Partial<Brief>): Promise<Brief>;
  update(id: string, patch: Partial<Brief>): Promise<Brief>;
}

export interface ContentRepo {
  list(orgId: string, opts?: ListOpts): Promise<ContentItem[]>;
  get(id: string): Promise<ContentItem | null>;
  create(orgId: string, input: NewContent): Promise<ContentItem>;
  update(id: string, patch: Partial<ContentItem>): Promise<ContentItem>;
  delete(id: string): Promise<void>;
  setStatus(id: string, status: ContentStatus): Promise<ContentItem>;
}

export interface JobRepo {
  list(orgId: string): Promise<ContentJob[]>;
  get(id: string): Promise<ContentJob | null>;
  create(orgId: string, input: Partial<ContentJob>): Promise<ContentJob>;
  update(id: string, patch: Partial<ContentJob>): Promise<ContentJob>;
}

export interface Repositories {
  orgs: OrgRepo;
  brand: BrandRepo;
  knowledge: KnowledgeRepo;
  compliance: ComplianceRepo;
  briefs: BriefRepo;
  content: ContentRepo;
  jobs: JobRepo;
}

export type NewContent = Pick<ContentItem, 'content_type' | 'title' | 'body_markdown' | 'language'> &
  Partial<ContentItem>;

export const REPOSITORIES = Symbol('REPOSITORIES');

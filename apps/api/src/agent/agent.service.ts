import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CONTENT_TYPE_META,
  GEO_QUALITY_GATES,
  isGeoType,
  type Brief,
  type ContentItem,
} from '@helix/shared';
import { ConfigService } from '../config/config.service';
import { REPOSITORIES, type NewContent, type Repositories } from '../repositories/repository';
import { EveClient } from './eve.client';
import { generateMock, type GenContext } from './mock-generator';

export type AgentAction = 'improve' | 'shorten' | 'expand_faq' | 'translate' | 'seo';

export interface GenerateResult {
  item: NewContent;
  via: 'eve' | 'mock';
}

@Injectable()
export class AgentService {
  private readonly log = new Logger('AgentService');
  private readonly eve: EveClient | null;

  constructor(
    private cfg: ConfigService,
    @Inject(REPOSITORIES) private repos: Repositories,
  ) {
    this.eve = cfg.useEve ? new EveClient(cfg.eveApiUrl!) : null;
  }

  get configured(): 'eve' | 'mock' {
    return this.eve ? 'eve' : 'mock';
  }

  async pingEve(): Promise<boolean> {
    return this.eve ? this.eve.ping() : false;
  }

  /** Produce a draft content item for a brief via eve, or the mock stub. */
  async generate(orgId: string, brief: Brief): Promise<GenerateResult> {
    const ctx: GenContext = {
      knowledge: await this.repos.knowledge.list(orgId),
      brand: await this.repos.brand.get(orgId),
    };
    if (this.eve) {
      try {
        const out = await this.eve.runAgent(buildPrompt(brief, ctx));
        if (out.text && out.text.trim().length > 40) {
          return { item: parseEveText(out.text, brief), via: 'eve' };
        }
        this.log.warn('eve returned empty text, falling back to mock');
      } catch (e) {
        this.log.warn(`eve generation failed, falling back to mock: ${(e as Error).message}`);
      }
    }
    return { item: generateMock(brief, ctx), via: 'mock' };
  }

  /** Run an editing action on an existing content item (improve / shorten / ...). */
  async act(
    orgId: string,
    item: ContentItem,
    action: AgentAction,
    opts: { lang?: string } = {},
  ): Promise<{ item: Partial<ContentItem>; via: 'eve' | 'mock' }> {
    if (this.eve) {
      try {
        const out = await this.eve.runAgent(actionPrompt(item, action, opts));
        if (out.text && out.text.trim().length > 40) {
          return { item: { body_markdown: out.text }, via: 'eve' };
        }
      } catch (e) {
        this.log.warn(`eve action failed, mocking: ${(e as Error).message}`);
      }
    }
    return { item: mockAct(item, action, opts), via: 'mock' };
  }
}

// ---- prompt construction (used when eve is configured) ----

export function buildPrompt(brief: Brief, ctx: GenContext): string {
  const meta = CONTENT_TYPE_META[brief.content_type];
  const lines: string[] = [];
  lines.push(`# Task`);
  lines.push(`Produce a ${meta.label} (${brief.content_type}) in ${brief.language}.`);
  lines.push(`Follow the brand voice: ${ctx.brand?.brand_voice ?? 'neutral, precise, no hype.'}`);
  lines.push(``);
  lines.push(`# Subject`);
  lines.push(brief.title);
  lines.push(``);
  lines.push(`# Must cover`);
  for (const p of brief.key_points) lines.push(`- ${p}`);
  if (brief.keywords.length) lines.push(``, `Target keywords: ${brief.keywords.join(', ')}`);
  if (ctx.knowledge.length) {
    lines.push(``, `# Verified knowledge (cite these)`);
    for (const k of ctx.knowledge.slice(0, 5)) lines.push(`- ${k.title}: ${k.content}`);
  }
  lines.push(``, `# Required structure`);
  for (const s of meta.outline) lines.push(`- ${s}`);
  if (isGeoType(brief.content_type)) {
    lines.push(``, `# GEO requirements (this is AI-engine-optimized content)`);
    for (const g of GEO_QUALITY_GATES) lines.push(`- ${g}`);
    lines.push(`Return markdown with a FAQ section and cite sources inline.`);
  }
  if (ctx.brand?.disclaimers?.length) {
    lines.push(``, `# Required disclaimer`, ctx.brand.disclaimers[0]);
  }
  lines.push(``, `Output only the final markdown article.`);
  return lines.join('\n');
}

function actionPrompt(item: ContentItem, action: AgentAction, opts: { lang?: string }): string {
  const goal: Record<AgentAction, string> = {
    improve: 'Improve clarity, flow and authority without changing the meaning.',
    shorten: 'Shorten by ~40% while keeping every key fact and the disclaimer.',
    expand_faq: 'Add a concise FAQ section with 3 Q&A pairs grounded in the body.',
    translate: `Translate the body to ${opts.lang ?? 'zh'} preserving markdown and the disclaimer.`,
    seo: 'Optimize for search: sharpen the title, add a 155-char meta description, and refine headings.',
  };
  return [
    `# Task`,
    goal[action],
    ``,
    `# Title`,
    item.title,
    ``,
    `# Current body`,
    item.body_markdown,
    ``,
    `Output only the new markdown body.`,
  ].join('\n');
}

export function parseEveText(text: string, brief: Brief): NewContent {
  const trimmed = text.trim();
  const titleMatch = trimmed.match(/^#{1,6}\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : brief.title;
  const body = trimmed.replace(/^#{1,6}\s+.+$/m, '').trim() || trimmed;
  const firstPara = body.split('\n\n')[0]?.replace(/[#>*`-]/g, '').trim() ?? '';
  const summary = firstPara.slice(0, 180);
  return {
    content_type: brief.content_type,
    title,
    summary,
    body_markdown: body,
    language: brief.language,
    status: 'draft',
    meta_description: summary.slice(0, 155),
    tags: brief.keywords,
    model_used: 'eve',
    brief_id: brief.id,
  };
}

export function mockAct(item: ContentItem, action: AgentAction, opts: { lang?: string }): Partial<ContentItem> {
  const body = item.body_markdown;
  switch (action) {
    case 'shorten': {
      const sections = body.split(/\n\n## /);
      const head = sections.slice(0, Math.max(2, Math.ceil(sections.length / 2))).join('\n\n## ');
      return { body_markdown: head };
    }
    case 'expand_faq':
      return {
        body_markdown:
          body +
          '\n\n## FAQ\n\n**Q: Is this financial advice?**\nNo. This content is for informational purposes only.\n\n**Q: Where can I learn more?**\nSee the related knowledge base entries cited above.',
      };
    case 'translate':
      return { body_markdown: `> [Translated to ${opts.lang ?? 'zh'} — mock]\n\n${body}`, language: (opts.lang as ContentItem['language']) ?? item.language };
    case 'seo':
      return {
        meta_description: (item.summary ?? item.title).slice(0, 155),
        title: item.title.includes('|') ? item.title : `${item.title} | Helix`,
      };
    case 'improve':
    default:
      return { body_markdown: body + '\n\n*(Revised for clarity and authority.)*' };
  }
}

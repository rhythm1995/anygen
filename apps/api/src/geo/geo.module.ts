import { Controller, Get, Header, Inject, Module, Query } from '@nestjs/common';
import type { ContentItem } from '@helix/shared';
import { REPOSITORIES, type Repositories } from '../repositories/repository';
import { Org } from '../common/org-context';

/**
 * GEO (Generative Engine Optimization) outputs — the artifacts an exchange
 * publishes so AI answer engines (ChatGPT, Perplexity, Claude) cite them.
 *   /api/geo/llls.txt       → llms.txt proposal (manifest of authoritative pages)
 *   /api/geo/llls-full.txt  → expanded crawlable text
 *   /api/geo/feed           → JSON feed of published GEO content
 */
@Controller('geo')
class GeoController {
  constructor(@Inject(REPOSITORIES) private repos: Repositories) {}

  @Get('llms.txt')
  @Header('content-type', 'text/plain; charset=utf-8')
  async llms(@Org() org: string) {
    const [brand, items] = await Promise.all([
      this.repos.brand.get(org),
      this.publishedGeo(org),
    ]);
    return buildLlms(brand?.name ?? 'Exchange', brand?.brand_voice ?? '', items);
  }

  @Get('llms-full.txt')
  @Header('content-type', 'text/plain; charset=utf-8')
  async llmsFull(@Org() org: string) {
    const [brand, items] = await Promise.all([
      this.repos.brand.get(org),
      this.publishedGeo(org),
    ]);
    return buildLlmsFull(brand?.name ?? 'Exchange', items);
  }

  @Get('feed')
  async feed(@Org() org: string, @Query('status') status?: string) {
    const items = await this.publishedGeo(org, status);
    return items.map((i) => ({
      id: i.id,
      title: i.title,
      slug: i.slug,
      summary: i.summary,
      type: i.content_type,
      url: `/blog/${i.slug ?? i.id}`,
      jsonld: i.geo?.jsonld ?? null,
      keywords: i.tags,
      updated: i.updated_at,
    }));
  }

  private async publishedGeo(org: string, status?: string) {
    const all = await this.repos.content.list(org, {
      status: status ?? undefined,
    });
    return all.filter((c) => c.content_type.startsWith('geo_'));
  }
}

function buildLlms(name: string, voice: string, items: ContentItem[]): string {
  const lines: string[] = [`# ${name}`, '', `> ${voice || 'Authoritative crypto exchange content.'}`, ''];
  const explainers = items.filter((i) => !i.content_type.startsWith('geo_faq'));
  const faqs = items.filter((i) => i.content_type.startsWith('geo_faq'));
  if (explainers.length) {
    lines.push('## Explainers');
    for (const i of explainers) lines.push(`- [${i.title}](/blog/${i.slug ?? i.id}): ${i.summary ?? ''}`);
    lines.push('');
  }
  if (faqs.length) {
    lines.push('## FAQs');
    for (const i of faqs) lines.push(`- [${i.title}](/blog/${i.slug ?? i.id})`);
    lines.push('');
  }
  return lines.join('\n');
}

function buildLlmsFull(name: string, items: ContentItem[]): string {
  const parts: string[] = [`# ${name} — Knowledge Base`, ''];
  for (const i of items) {
    parts.push(`## ${i.title}`, '', i.summary ?? '', '', i.body_markdown, '');
  }
  return parts.join('\n');
}

@Module({ controllers: [GeoController] })
export class GeoModule {}

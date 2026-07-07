import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Brief } from '@helix/shared';
import { REPOSITORIES, type Repositories } from '../repositories/repository';
import { AgentService } from './agent.service';
import { scanCompliance } from '../content/content.service';

const now = () => new Date().toISOString();

/**
 * Runs a content job: fans out one generation per brief with a concurrency cap,
 * persists each draft, auto-runs compliance, and aggregates progress onto the
 * job row. Designed so a crash mid-batch only loses in-flight items — every
 * completed item is already persisted (and in supabase mode, the durable eve
 * session resumes per-item).
 */
@Injectable()
export class BatchRunner {
  private readonly log = new Logger('BatchRunner');

  constructor(
    private agent: AgentService,
    @Inject(REPOSITORIES) private repos: Repositories,
  ) {}

  async run(jobId: string): Promise<void> {
    const job = await this.repos.jobs.get(jobId);
    if (!job) {
      this.log.warn(`job ${jobId} not found`);
      return;
    }
    await this.repos.jobs.update(jobId, { status: 'running', started_at: now(), total: job.brief_ids.length });

    const briefs = (await Promise.all(job.brief_ids.map((id) => this.repos.briefs.get(id)))).filter(
      (b): b is Brief => !!b,
    );
    const concurrency = Math.max(1, job.config?.concurrency ?? 5);
    const results: Record<string, { content_id?: string; status: 'ok' | 'error'; error?: string }> = {};
    let done = 0;
    let failed = 0;

    await pool(briefs, concurrency, async (brief) => {
      await this.repos.briefs.update(brief.id, { status: 'generating' });
      try {
        const { item, via } = await this.agent.generate(job.org_id, brief);
        const created = await this.repos.content.create(job.org_id, item);
        const terms = await this.repos.compliance.list(job.org_id);
        const compliance = scanCompliance(terms, created);
        const updated = await this.repos.content.update(created.id, {
          compliance,
          status: 'draft',
          agent_run_id: via === 'eve' ? `eve:${created.id}` : `mock:${created.id}`,
        });
        await this.repos.briefs.update(brief.id, { status: 'done' });
        results[brief.id] = { content_id: updated.id, status: 'ok' };
        done++;
      } catch (e) {
        await this.repos.briefs.update(brief.id, { status: 'failed' });
        results[brief.id] = { status: 'error', error: (e as Error).message };
        failed++;
        this.log.error(`brief ${brief.id} failed: ${(e as Error).message}`);
      }
    });

    const status = failed === 0 ? 'completed' : done === 0 ? 'failed' : 'partial';
    await this.repos.jobs.update(jobId, {
      status,
      done,
      failed,
      total: briefs.length,
      results,
      finished_at: now(),
    });
    this.log.log(`job ${jobId} ${status} (done=${done} failed=${failed})`);
  }
}

/** Minimal concurrency-limited mapper. */
export async function pool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const ret: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      ret[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return ret;
}

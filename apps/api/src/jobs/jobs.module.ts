import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Module,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { createJobSchema, type CreateJobInput } from '@helix/shared';
import { REPOSITORIES, type Repositories } from '../repositories/repository';
import { AgentModule } from '../agent/agent.module';
import { AgentService } from '../agent/agent.service';
import { BatchRunner } from '../agent/batch.runner';
import { scanCompliance } from '../content/content.service';
import { Org } from '../common/org-context';
import { ZodValidationPipe } from '../common/zod.pipe';

const log = new Logger('JobsController');

@Controller('jobs')
class JobsController {
  constructor(
    @Inject(REPOSITORIES) private repos: Repositories,
    private runner: BatchRunner,
    private agent: AgentService,
  ) {}

  @Get()
  list(@Org() org: string) {
    return this.repos.jobs.list(org);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const j = await this.repos.jobs.get(id);
    if (!j) throw new NotFoundException('job not found');
    return j;
  }

  /** Create a batch job and kick it off in the background. */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async create(@Org() org: string, @Body(new ZodValidationPipe(createJobSchema)) body: CreateJobInput) {
    const job = await this.repos.jobs.create(org, {
      name: body.name ?? `Batch of ${body.brief_ids.length}`,
      brief_ids: body.brief_ids,
      total: body.brief_ids.length,
      status: 'queued',
      config: { concurrency: body.concurrency, draft_model: body.draft_model, quality_model: body.quality_model },
    });
    // fire and forget — UI polls GET /jobs/:id
    this.runner.run(job.id).catch((e) => log.error(`job ${job.id} crashed: ${e?.message ?? e}`));
    return job;
  }

  /** Re-run every brief in a job (idempotent: produces fresh drafts). */
  @Post(':id/rerun')
  @HttpCode(HttpStatus.ACCEPTED)
  async rerun(@Param('id') id: string) {
    const exists = await this.repos.jobs.get(id);
    if (!exists) throw new NotFoundException('job not found');
    await this.repos.jobs.update(id, { status: 'queued', done: 0, failed: 0, started_at: null, finished_at: null, results: {} });
    this.runner.run(id).catch((e) => log.error(`job ${id} rerun crashed: ${e?.message ?? e}`));
    return this.repos.jobs.get(id);
  }

  /** Generate a single brief immediately and return the produced content. */
  @Post('generate')
  async generateOne(@Org() org: string, @Body() body: { brief_id: string }) {
    const brief = await this.repos.briefs.get(body.brief_id);
    if (!brief) throw new NotFoundException('brief not found');
    await this.repos.briefs.update(brief.id, { status: 'generating' });
    try {
      const { item } = await this.agent.generate(org, brief);
      const created = await this.repos.content.create(org, item);
      const terms = await this.repos.compliance.list(org);
      const compliance = scanCompliance(terms, created);
      const updated = await this.repos.content.update(created.id, { compliance, status: 'draft' });
      await this.repos.briefs.update(brief.id, { status: 'done' });
      return updated;
    } catch (e) {
      await this.repos.briefs.update(brief.id, { status: 'failed' });
      throw e;
    }
  }
}

@Module({ imports: [AgentModule], controllers: [JobsController] })
export class JobsModule {}

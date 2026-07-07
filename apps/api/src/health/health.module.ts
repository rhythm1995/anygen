import { Controller, Get, Header, Inject, Module } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { REPOSITORIES, type Repositories } from '../repositories/repository';
import { AgentService } from '../agent/agent.service';
import { AgentModule } from '../agent/agent.module';
import { Org } from '../common/org-context';

@Controller('health')
class HealthController {
  constructor(
    private cfg: ConfigService,
    private agent: AgentService,
    @Inject(REPOSITORIES) private repos: Repositories,
  ) {}

  @Get()
  async health() {
    return {
      status: 'ok',
      service: 'helix-api',
      time: new Date().toISOString(),
      config: this.cfg.summary,
      agent: this.agent.configured,
      eveReachable: this.cfg.useEve ? await this.agent.pingEve().catch(() => false) : null,
    };
  }

  @Get('ping')
  @Header('content-type', 'text/plain')
  ping() {
    return 'ok';
  }

  @Get('stats')
  async stats(@Org() org: string) {
    const [briefs, content, jobs, knowledge, compliance] = await Promise.all([
      this.repos.briefs.list(org),
      this.repos.content.list(org),
      this.repos.jobs.list(org),
      this.repos.knowledge.list(org),
      this.repos.compliance.list(org),
    ]);
    return {
      briefs: briefs.length,
      content: content.length,
      byStatus: countBy(content, (c) => c.status),
      byType: countBy(content, (c) => c.content_type),
      jobs: jobs.length,
      knowledge: knowledge.length,
      compliance: compliance.length,
    };
  }
}

function countBy<T>(arr: T[], key: (x: T) => string): Record<string, number> {
  return arr.reduce(
    (acc, x) => {
      const k = key(x);
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
}

@Module({ imports: [AgentModule], controllers: [HealthController] })
export class HealthModule {}

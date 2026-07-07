import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  transitionStatusSchema,
  updateContentSchema,
  type ContentStatus,
  type UpdateContentInput,
} from '@helix/shared';
import { REPOSITORIES, type Repositories } from '../repositories/repository';
import { AgentService, type AgentAction } from '../agent/agent.service';
import { AgentModule } from '../agent/agent.module';
import { Org } from '../common/org-context';
import { ZodValidationPipe } from '../common/zod.pipe';
import { ContentService } from './content.service';

@Controller('content')
class ContentController {
  constructor(
    @Inject(REPOSITORIES) private repos: Repositories,
    private content: ContentService,
    private agent: AgentService,
  ) {}

  @Get()
  list(
    @Org() org: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('q') q?: string,
  ) {
    return this.repos.content.list(org, { status, type, q });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const c = await this.repos.content.get(id);
    if (!c) throw new NotFoundException('content not found');
    return c;
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(updateContentSchema)) body: UpdateContentInput) {
    return this.repos.content.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.repos.content.delete(id);
  }

  @Post(':id/status')
  status(@Org() org: string, @Param('id') id: string, @Body(new ZodValidationPipe(transitionStatusSchema)) body: { to: ContentStatus }) {
    return this.repos.content.setStatus(id, body.to);
  }

  @Post('bulk/status')
  bulkStatus(@Org() org: string, @Body() body: { ids: string[]; to: ContentStatus }) {
    return Promise.all((body.ids ?? []).map((id) => this.repos.content.setStatus(id, body.to)));
  }

  @Post(':id/compliance')
  rerunCompliance(@Org() org: string, @Param('id') id: string) {
    return this.content.rerunCompliance(org, id);
  }

  @Get(':id/readiness')
  async readiness(@Org() org: string, @Param('id') id: string) {
    const item = await this.repos.content.get(id);
    if (!item) throw new NotFoundException('content not found');
    const compliance = item.compliance ?? (await this.content.checkCompliance(org, item));
    return this.content.scoreReadiness(item, compliance);
  }

  @Get(':id/export')
  export(@Org() org: string, @Param('id') id: string, @Query('format') format: 'md' | 'html' | 'jsonld' = 'md') {
    return this.content.exportItem(org, id, format || 'md');
  }

  @Post(':id/action')
  async action(
    @Org() org: string,
    @Param('id') id: string,
    @Body() body: { action: AgentAction; lang?: string },
  ) {
    const item = await this.repos.content.get(id);
    if (!item) throw new NotFoundException('content not found');
    const { item: patch } = await this.agent.act(org, item, body.action, { lang: body.lang });
    return this.repos.content.update(id, patch);
  }
}

@Module({
  imports: [AgentModule],
  providers: [ContentService],
  controllers: [ContentController],
  exports: [ContentService],
})
export class ContentModule {}

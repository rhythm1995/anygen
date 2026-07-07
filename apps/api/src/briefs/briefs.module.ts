import {
  Body,
  Controller,
  Get,
  Inject,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { createBriefSchema, type CreateBriefInput } from '@helix/shared';
import { REPOSITORIES, type Repositories } from '../repositories/repository';
import { RepositoryModule } from '../repositories/repository.module';
import { Org } from '../common/org-context';
import { ZodValidationPipe } from '../common/zod.pipe';

@Controller('briefs')
class BriefsController {
  constructor(@Inject(REPOSITORIES) private repos: Repositories) {}

  @Get()
  list(@Org() org: string) {
    return this.repos.briefs.list(org);
  }

  @Post()
  create(@Org() org: string, @Body(new ZodValidationPipe(createBriefSchema)) body: CreateBriefInput) {
    return this.repos.briefs.create(org, body);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const b = await this.repos.briefs.get(id);
    if (!b) throw new NotFoundException('brief not found');
    return b;
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Partial<CreateBriefInput>) {
    return this.repos.briefs.update(id, body);
  }
}

@Module({ imports: [RepositoryModule], controllers: [BriefsController] })
export class BriefsModule {}

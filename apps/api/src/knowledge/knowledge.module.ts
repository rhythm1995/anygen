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
import { createKnowledgeSchema, type CreateKnowledgeInput } from '@helix/shared';
import { REPOSITORIES, type Repositories } from '../repositories/repository';
import { RepositoryModule } from '../repositories/repository.module';
import { Org } from '../common/org-context';
import { ZodValidationPipe } from '../common/zod.pipe';

@Controller('knowledge')
class KnowledgeController {
  constructor(@Inject(REPOSITORIES) private repos: Repositories) {}

  @Get()
  list(@Org() org: string, @Query('type') type?: string, @Query('q') q?: string) {
    return this.repos.knowledge.list(org, { type, q });
  }

  @Post()
  create(@Org() org: string, @Body(new ZodValidationPipe(createKnowledgeSchema)) body: CreateKnowledgeInput) {
    return this.repos.knowledge.create(org, body);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const k = await this.repos.knowledge.get(id);
    if (!k) throw new NotFoundException('knowledge not found');
    return k;
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Partial<CreateKnowledgeInput>) {
    return this.repos.knowledge.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.repos.knowledge.delete(id);
  }
}

@Module({ imports: [RepositoryModule], controllers: [KnowledgeController] })
export class KnowledgeModule {}

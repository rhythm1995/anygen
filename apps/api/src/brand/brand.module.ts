import { Body, Controller, Get, Inject, Module, Post } from '@nestjs/common';
import { upsertBrandSchema, type UpsertBrandInput } from '@helix/shared';
import { REPOSITORIES, type Repositories } from '../repositories/repository';
import { RepositoryModule } from '../repositories/repository.module';
import { Org } from '../common/org-context';
import { ZodValidationPipe } from '../common/zod.pipe';

@Controller('brand')
class BrandController {
  constructor(@Inject(REPOSITORIES) private repos: Repositories) {}

  @Get()
  async get(@Org() org: string) {
    return (await this.repos.brand.get(org)) ?? { brand_voice: '', do_phrases: [], dont_phrases: [] };
  }

  @Post()
  upsert(@Org() org: string, @Body(new ZodValidationPipe(upsertBrandSchema)) body: UpsertBrandInput) {
    return this.repos.brand.upsert(org, body);
  }
}

@Module({ imports: [RepositoryModule], controllers: [BrandController] })
export class BrandModule {}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Module,
  Param,
  Post,
} from '@nestjs/common';
import { createComplianceTermSchema, type CreateComplianceTermInput } from '@helix/shared';
import { REPOSITORIES, type Repositories } from '../repositories/repository';
import { RepositoryModule } from '../repositories/repository.module';
import { Org } from '../common/org-context';
import { ZodValidationPipe } from '../common/zod.pipe';

@Controller('compliance')
class ComplianceController {
  constructor(@Inject(REPOSITORIES) private repos: Repositories) {}

  @Get()
  list(@Org() org: string) {
    return this.repos.compliance.list(org);
  }

  @Post()
  create(@Org() org: string, @Body(new ZodValidationPipe(createComplianceTermSchema)) body: CreateComplianceTermInput) {
    return this.repos.compliance.create(org, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.repos.compliance.delete(id);
  }
}

@Module({ imports: [RepositoryModule], controllers: [ComplianceController] })
export class ComplianceModule {}

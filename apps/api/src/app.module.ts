import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { AuthModule } from './auth/auth.module';
import { RepositoryModule } from './repositories/repository.module';
import { BriefsModule } from './briefs/briefs.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { BrandModule } from './brand/brand.module';
import { ComplianceModule } from './compliance/compliance.module';
import { ContentModule } from './content/content.module';
import { JobsModule } from './jobs/jobs.module';
import { GeoModule } from './geo/geo.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    RepositoryModule,
    BriefsModule,
    KnowledgeModule,
    BrandModule,
    ComplianceModule,
    ContentModule,
    JobsModule,
    GeoModule,
    HealthModule,
  ],
})
export class AppModule {}

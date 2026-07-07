import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from './config/config.service';
import { AllExceptionsFilter } from './common/exceptions.filter';
import { ZodValidationPipe } from './common/zod.pipe';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  const cfg = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());

  await app.listen(cfg.port);
  // eslint-disable-next-line no-console
  console.log(
    `[helix-api] 🚀 mode=${cfg.mode}  supabase=${cfg.useSupabase}  eve=${cfg.useEve}  → http://localhost:${cfg.port}/api`,
  );
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[helix-api] fatal', err);
  process.exit(1);
});

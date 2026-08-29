import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api");
  app.enableCors({ origin: true, credentials: true });
  return app;
}

export async function bootstrap(): Promise<void> {
  const app = await createApp();
  const config = app.get((await import("./config/config.service")).ConfigService);
  await app.listen(config.apiPort);
  console.log(`[api] listening on http://127.0.0.1:${config.apiPort}/api`);
}

// allow `node dist/main.js` 之外的直接执行
if (process.argv[1]?.endsWith("main.ts") || process.argv[1]?.endsWith("main.js")) {
  void bootstrap();
}

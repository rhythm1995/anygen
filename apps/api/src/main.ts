import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ConfigService } from "./config/config.service";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  app.setGlobalPrefix("api");
  app.enableCors({ origin: true, credentials: true });
  await app.listen(config.apiPort);
  console.log(`[api] listening on http://127.0.0.1:${config.apiPort}/api`);
}

void bootstrap();

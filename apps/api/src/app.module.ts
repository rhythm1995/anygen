import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "./config/config.module";

@Module({
  imports: [ConfigModule],
})
export class AppModule {}

import { Global, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ConfigService } from "./config.service";
import { ConfigController } from "./config.controller";

@Global()
@Module({
  imports: [AuthModule],
  controllers: [ConfigController],
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}

export { ConfigService };

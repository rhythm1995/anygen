import { Module, Provider } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AssetsModule } from "../assets/assets.module";
import { CreditsModule } from "../credits/credits.module";
import { GenerationController } from "./generation.controller";
import { GenerationService } from "./generation.service";
import { ArkProvider } from "./providers/ark.provider";
import { GENERATION_PROVIDER } from "./providers/types";
import { ConfigService } from "../config/config.service";

const providerFactory: Provider = {
  provide: GENERATION_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService) =>
    new ArkProvider({
      baseUrl: config.arkBaseUrl ?? "",
      apiKey: config.arkApiKey ?? "",
      imageModel: config.arkImageModel ?? "",
      videoModel: config.arkVideoModel ?? "",
    }),
};

@Module({
  imports: [AuthModule, AssetsModule, CreditsModule],
  controllers: [GenerationController],
  providers: [GenerationService, providerFactory],
  exports: [GenerationService, GENERATION_PROVIDER],
})
export class GenerationModule {}

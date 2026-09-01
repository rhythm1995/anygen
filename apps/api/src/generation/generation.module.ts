import { Module, Provider } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AuthModule } from "../auth/auth.module";
import { AssetsModule } from "../assets/assets.module";
import { CreditsModule } from "../credits/credits.module";
import { StorageService } from "../assets/storage.service";
import { GenerationController } from "./generation.controller";
import { GenerationService } from "./generation.service";
import { ArkProvider } from "./providers/ark.provider";
import { OpenRouterProvider } from "./providers/openrouter.provider";
import { AudioProvider } from "./providers/audio.provider";
import { GENERATION_PROVIDER, OPENROUTER_PROVIDER, AUDIO_PROVIDER } from "./providers/types";
import { ConfigService } from "../config/config.service";
import { ProviderKeysService } from "../admin/provider-keys.service";

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

const openRouterFactory: Provider = {
  provide: OPENROUTER_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService) =>
    new OpenRouterProvider({
      baseUrl: config.openRouterBaseUrl ?? "",
      apiKey: config.openRouterApiKey ?? "",
    }),
};

const audioFactory: Provider = {
  provide: AUDIO_PROVIDER,
  inject: [StorageService, ProviderKeysService],
  useFactory: (storage: StorageService, keys: ProviderKeysService) =>
    new AudioProvider({
      uploadAudio: async (body, contentType) => {
        const ext = contentType.includes("mpeg") || contentType.includes("mp3") ? "mp3" : "bin";
        const key = `audio/${randomUUID()}.${ext}`;
        await storage.uploadBuffer({ key, body, contentType });
        return storage.publicUrl(key);
      },
      resolveKeys: async () => ({
        elevenLabs: (await keys.resolve("elevenlabs")) ?? process.env.ELEVENLABS_API_KEY,
        doubaoSpeech: (await keys.resolve("doubao-speech")) ?? process.env.DOUBAO_SPEECH_API_KEY,
        doubaoVoice: process.env.DOUBAO_SPEECH_VOICE_TYPE,
      }),
    }),
};

@Module({
  imports: [AuthModule, AssetsModule, CreditsModule],
  controllers: [GenerationController],
  providers: [GenerationService, ProviderKeysService, providerFactory, openRouterFactory, audioFactory],
  exports: [GenerationService, GENERATION_PROVIDER, ProviderKeysService],
})
export class GenerationModule {}

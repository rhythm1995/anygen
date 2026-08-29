import { Module } from "@nestjs/common";
import { AssetsModule } from "./assets/assets.module";
import { AuthModule } from "./auth/auth.module";
import { ChatsModule } from "./chats/chats.module";
import { ConfigModule } from "./config/config.module";
import { CreditsModule } from "./credits/credits.module";
import { FeedModule } from "./feed/feed.module";
import { GenerationModule } from "./generation/generation.module";
import { MeModule } from "./me/me.module";
import { ProjectsModule } from "./projects/projects.module";

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    MeModule,
    CreditsModule,
    FeedModule,
    ProjectsModule,
    ChatsModule,
    AssetsModule,
    GenerationModule,
  ],
})
export class AppModule {}

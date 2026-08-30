import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AssetsModule } from "../assets/assets.module";
import { CreditsModule } from "../credits/credits.module";
import { GenerationModule } from "../generation/generation.module";
import { AgentController } from "./agent.controller";
import { FreeAgentController } from "./free-agent.controller";
import { FreeAgentService } from "./free-agent.service";
import { AgentService } from "./agent.service";

@Module({
  imports: [AuthModule, AssetsModule, CreditsModule, GenerationModule],
  controllers: [AgentController, FreeAgentController],
  providers: [AgentService, FreeAgentService],
})
export class AgentModule {}

import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CreditsModule } from "../credits/credits.module";
import { AdminAuditService } from "./admin-audit.service";
import { AdminGuard } from "./admin.guard";
import { AdminController } from "./admin.controller";
import { AdminUsageController } from "./admin-usage.controller";
import { AdminUserInsightsController } from "./admin-user-insights.controller";
import { AdminProvidersController } from "./admin-providers.controller";
import { ProviderKeysService } from "./provider-keys.service";

@Module({
  imports: [AuthModule, CreditsModule],
  controllers: [AdminController, AdminUsageController, AdminUserInsightsController, AdminProvidersController],
  providers: [AdminGuard, AdminAuditService, ProviderKeysService],
  exports: [ProviderKeysService],
})
export class AdminModule {}

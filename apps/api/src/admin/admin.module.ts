import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CreditsModule } from "../credits/credits.module";
import { AdminAuditService } from "./admin-audit.service";
import { AdminGuard } from "./admin.guard";
import { AdminController } from "./admin.controller";
import { AdminUsageController } from "./admin-usage.controller";
import { AdminUserInsightsController } from "./admin-user-insights.controller";

@Module({
  imports: [AuthModule, CreditsModule],
  controllers: [AdminController, AdminUsageController, AdminUserInsightsController],
  providers: [AdminGuard, AdminAuditService],
})
export class AdminModule {}

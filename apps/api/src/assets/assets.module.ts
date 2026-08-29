import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AssetsController } from "./assets.controller";
import { StorageService } from "./storage.service";

@Module({
  imports: [AuthModule],
  controllers: [AssetsController],
  providers: [StorageService],
  exports: [StorageService],
})
export class AssetsModule {}

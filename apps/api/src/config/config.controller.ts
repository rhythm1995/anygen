import { Controller, Get } from "@nestjs/common";
import { SupabaseClientFactory } from "../auth/supabase.client";
import { creationModesConfigSchema } from "@dreamina/shared";

// 创作类型/模型配置是公开信息（匿名首页也要渲染面板）；写操作仍走 admin
@Controller("config")
export class ConfigController {
  constructor(private readonly factory: SupabaseClientFactory) {}

  /** 创作面板聚合配置：7 类型 + 每类型启用模型（admin models 表驱动） */
  @Get("creation-types")
  async creationTypes() {
    const db = this.factory.serviceClient;
    const [modes, models] = await Promise.all([
      db.from("creation_modes").select("key,label,icon,enabled,sort").eq("enabled", true).order("sort"),
      db
        .from("models")
        .select("creation_type,code,display_name,description,badge,unit_type,price_cents,provider_cost_cents,resolution_factor,params,is_default,provider")
        .eq("enabled", true)
        .order("sort"),
    ]);
    if (modes.error) throw new Error(modes.error.message);
    if (models.error) throw new Error(models.error.message);

    const parsed = creationModesConfigSchema.parse({
      modes: modes.data ?? [],
      models: (models.data ?? []).map((m: any) => ({
        creation_type: m.creation_type,
        code: m.code,
        display_name: m.display_name,
        description: m.description,
        badge: m.badge,
        unit_type: m.unit_type,
        price_cents: m.price_cents,
        params: m.params ?? {},
        is_default: m.is_default,
      })),
    });
    return parsed;
  }
}

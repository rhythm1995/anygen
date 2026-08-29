# ADMIN — 管理后台与美元计费设计

> 状态：**设计稿，待用户确认后才进代码**。
> 决策依据（用户已拍板）：三件套合并设计；**计费=美元制**；内容审核纳入本期（schema + 队列）。

## 1. 入口与权限

- 左侧栏底部组（API / 3D / 设置）**上方**新增「管理」菜单项，仅 `profiles.role = 'admin'` 可见
- 双保险：前端隐藏 + 后端 `AdminGuard`（查 profiles.role，非 admin 一律 **404** 而非 403，不暴露路由存在）
- 路由：`/admin`（Next.js 同 app 内，独立 layout：左侧二级导航，不复用主站 Composer）
- `profiles` 加 `role text not null default 'user'`；首个 admin 用 SQL 手工提（`update profiles set role='admin' where id=...`），不做注册即管理员

## 2. 信息架构（8 个二级页）

| 页面 | 路径 | 职责 |
|---|---|---|
| 供应商 Providers | /admin/providers | 供应商 CRUD：名称、协议类型（ark / openai-compat / …）、base_url、启停 |
| API Keys | /admin/providers/:id/keys | 密钥管理（见 §5 安全设计） |
| 模型 Models | /admin/models | 模型 CRUD + 定价 + 上下架 + 徽标（New/VIP/Pro）+ 成本单价 |
| 计费 Pricing | /admin/pricing | 三类口径单价表 + 分辨率系数 + 赠金策略（注册赠 $X） |
| 用量报表 | /admin/usage | 按日/用户/模型聚合：调用次数、用户扣费、供应商成本、**毛利**；CSV 导出 |
| 内容审核 | /admin/moderation | 待复审队列（见 MODERATION.md）、通过/驳回/封禁 |
| 用户管理 | /admin/users | 搜索、余额调整（走 ledger）、封禁、提权（双向，留审计） |
| 审计日志 | /admin/audit | admin_audit_log 全量可查（谁在何时改了什么，含 diff 摘要） |

## 3. 数据模型（新表）

```sql
-- 供应商（同一能力可配多家）
providers (
  id uuid PK, name text, protocol text check in ('ark','openai-compat'),
  base_url text, enabled bool default true, created_at/updated_at
)

-- API Key：pgcrypto 加密入库（见 §5）
api_keys (
  id uuid PK, provider_id uuid FK,
  secret_encrypted bytea not null,        -- pgp_sym_encrypt
  secret_hint text not null,              -- 'sk-****abcd' 仅尾4位
  enabled bool, created_at
)

-- 模型：admin 配什么，创作面板就显示什么（UI-SPEC-CN 的数据源）
models (
  id uuid PK,
  provider_id uuid FK,
  creation_type text not null,   -- image | video | music | dubbing | digital_human | motion_mimic | llm
  code text not null,            -- 调用代号，如 seedream-5.0-pro
  display_name text not null,    -- '图片 5.0 Pro'（中文，来自即梦截图命名）
  description text default '',
  badge text,                    -- 'New' | 'VIP' | 'Pro' | null
  unit_type text not null check in ('per_image','per_second','per_token','per_request'),
  price_cents integer not null,                      -- 用户价：美分/单位
  provider_cost_cents integer not null default 0,    -- 成本价：美分/单位（毛利=价-成本）
  resolution_factor jsonb default '{}',  -- 分辨率系数 {"720p":1.0,"1080p":1.6} / {"1k":1.0,"2k":1.8,"4k":3.2}
  enabled bool default true,
  sort integer default 0,
  created_at/updated_at,
  unique(provider_id, code)
)

-- 美分账本（替代 credit_ledger，迁移方案见 §4）
ledger (
  id bigserial PK,
  user_id uuid FK,
  cents integer not null,              -- 正=入账/退款，负=消耗
  reason text check in ('signup_bonus','generation','generation_refund','topup','admin_adjust','agent_step'),
  task_id uuid null,                   -- generation_tasks / agent_steps 关联
  balance_after_cents integer not null,
  created_at
)

-- 内容审核事件（MODERATION.md 展开）
moderation_events (
  id bigserial PK, target_type text check in ('prompt','asset','feed_item'),
  target_id uuid, user_id uuid,
  auto_score numeric, auto_verdict text,   -- 机审结果
  status text check in ('pending','approved','rejected','human_review'),
  reviewer uuid null, reviewed_at, note text, created_at
)

-- 用户举报
user_reports ( id uuid PK, reporter uuid, target_type text, target_id uuid, reason text, status text, created_at )

-- Admin 审计
admin_audit_log (
  id bigserial PK, admin_id uuid, action text, target_table text, target_id text,
  diff jsonb,  -- {field: [before, after]}
  created_at
)
```

## 4. 美元计费口径（用户已拍板：美元制）

- **记账单位 = 美分（integer cents）**，全站展示 `$x.xx`；永不存浮点
- 现有积分迁移：一次性 `credit_ledger → ledger`（积分 × 平台汇率折美分，汇率入 config）；`profiles.credit_balance` → `balance_cents`
- 注册赠金：**$1.50**（对应原 150 积分语义）
- 三类单价口径（admin/pricing 可改，改价写审计）：

| unit_type | 计费式 | 示例 |
|---|---|---|
| per_image | price × 分辨率系数 × 张数 | $0.02/张 × 2K(1.8) × 2 张 = $0.072 → **$0.07** |
| per_second | price × 秒 × 分辨率系数 | $0.01/s × 5s × 1080p(1.6) = **$0.08** |
| per_token | (输入 tokens×入价 + 输出 tokens×出价)/1M | LLM/Agent 用，输入输出分列 |

- **扣费时机**：提交任务时预扣（沿用 try_debit 幂等模式，改 cents）；失败走幂等 refund
- **毛利**：usage 报表 `sum(用户扣费) − sum(provider_cost)`；成本 = 单次调用按 provider_cost_cents × 单位落账（真实账单 API 对账后置）
- 展示：admin 才见成本/毛利；普通用户只看自己的扣费明细

## 5. API Key 安全设计

- **入库加密**：pgcrypto `pgp_sym_encrypt(secret, key)`，密钥来自 env `ENCRYPTION_KEY`（不入库）；service 层加解密，任何 API 不回传明文
- **展示**：列表仅 `secret_hint`（尾 4 位）+ enabled；编辑 = 整体重填，无"查看明文"
- **审计**：keys 增删改、models 改价、users 提权/调余额、moderation 裁决——全写 admin_audit_log（diff jsonb）
- **测试连接**按钮：后端用该 key 发一次 cheapest 真实探测调用，结果回显

## 6. 计费接入点（现有代码改造清单，实现阶段执行）

| 现有 | 改造 |
|---|---|
| CreditsService（积分 RPC） | 换 cents 版：try_debit_cents / refund_cents / grant_cents（同幂等语义，TDD 重写） |
| generation.service TASK_COST 常量 | 读 models 表按 model+params 实时算价（§4 公式），提交前展示预估 |
| /api/me credit 字段 | 改 cents + `$x.xx` 格式化；前端全局换文案 |
| ArkProvider | 从 api_keys 解密取 key；按 models.code 路由而非 env 常量 |
| 注册赠金 | $1.50 写 ledger(signup_bonus) |

## 7. TDD 要点（实现时）
- ledger cents RPC：并发扣减/不足拒绝/幂等退款（沿用现有测试结构改 cents）
- 定价计算器：三类口径纯函数 + 分辨率系数矩阵（边界：4K×4 张 不超过单笔上限）
- AdminGuard：非 admin 404；审计写入断言
- key 加解密 round-trip + hint 生成
- usage 聚合 SQL 正确性（固定 seed 数据集）

## 8. 明确不做（本期）
- 支付通道（微信/支付宝/Stripe）——只做 admin 手动调余额 + 兑换码预留
- 发票/税务
- 灰度发布（模型上下架为布尔开关，非百分比灰度）
- 多租户/团队空间

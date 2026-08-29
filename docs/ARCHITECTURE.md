# ARCHITECTURE

## 总览

```
┌───────────────────────────  apps/web (Next.js 最新, React 19) ───────────────────────────┐
│  /ai-tool/home        /ai-tool/generate           /ai-tool/assets-canvas                 │
│  Trends 瀑布流         Octo 会话 + 生成             入口态 + @xyflow/react 画布编辑器        │
│        │ tanstack-query 轮询/变更        │ S3 预签名 PUT 直传                              │
└────────┼──────────────────────────────┼──────────────────────────────────────────────┘
         │ HTTP (fetch, /api 前缀)       │
┌────────▼──────────────────────────▼  apps/api (NestJS 11) ────────────────────────────────┐
│  auth(JWT Guard) · me · credits · feed · projects · assets · generation · chats          │
│         │                    │                        │                                   │
│  repositories/         GenerationProvider        StorageService(s3 presign)               │
│  (supabase-js)         └─ ArkProvider(默认)      │                                       │
└────────┼────────────────────┼────────────────────────┼─────────────────────────────────────┘
         ▼                    ▼                        ▼
   Supabase Postgres     火山方舟 Ark API          S3 兼容存储（本地 MinIO / 生产 R2/OSS）
   (+ Supabase Auth)     Seedream/Seedance        bucket: dreamina-local
```

共享契约：`packages/shared`（zod schema + 推导类型），web 与 api 均依赖（workspace:*）。

## Turborepo 布局

- `turbo.json`：tasks = build / dev / test / typecheck / lint；`test` 依赖 `^build`（shared 先建）
- `pnpm-workspace.yaml`：`apps/*` `packages/*`
- 根 `package.json`：`dev` = `turbo run dev`（api:3001 / web:3000 并行）；`postinstall` 先 build shared
- TS：`tsconfig.base.json` 严格模式，各 app extends

## NestJS 模块划分

| 模块 | 职责 | 关键依赖 |
|---|---|---|
| `config` | env 读取 + 计算开关（useSupabase/useS3/useArk） | 无 |
| `auth` | Supabase JWT Guard（Bearer → getUser → req.user）、SupabaseClientFactory | supabase-js |
| `me` | GET /me（用户+积分，对齐 `mweb-v1-get_user_info` / `commerce-v1-benefits-user_credit` 形状） | auth, repositories |
| `credits` | 积分扣减/流水（`credit_ledger` 原子事务） | repositories |
| `feed` | GET /feed?offset= 分页瀑布流 | repositories |
| `projects` | 画布项目 CRUD，graph(jsonb) 校验+zod | repositories, shared |
| `assets` | POST /assets/presign（S3 PUT 预签名）、POST /assets（登记）、GET /assets?type= | storage |
| `generation` | POST /generation/tasks（扣积分→建任务→提交 Provider）、GET /generation/tasks(:id)（轮询） | credits, providers, storage |
| `providers` | `GenerationProvider` 接口 + `ArkProvider` 实现 + 注册表 | 无（HTTP 用 undici/fetch） |
| `storage` | @aws-sdk/client-s3 + s3-request-presigner；本地 MinIO | aws-sdk |
| `chats` | 会话/消息 CRUD（generate 页 Your chats） | repositories |

横切：ZodValidationPipe（全局）、AllExceptionsFilter、序列化出参对齐原站 `{ret:0, data}` 包装**不采用**——前端契约用本项目的 REST JSON，仅在 shared 里保留原站形状的类型便于 seed 对照。

## 生成链路（核心数据流）

```
POST /api/generation/tasks {type: 'image'|'video', prompt, params, refs?}
  → credits.tryDebit(userId, cost)            # 原子扣减，不足 402
  → generation_tasks.insert(status='queued')
  → provider.submit(task)                      # ArkProvider: POST ark API
  → tasks.update(status='running', remote_id)

GET /api/generation/tasks/:id                 # 前端 2s 轮询
  → provider.poll(remote_id)                  # Ark: GET 任务结果
  → 成功: fetch 产物 URL → 流式转存 S3 → assets.insert
  → tasks.update(status='succeeded', outputs=[asset_id...]); credits 流水确认
  → 失败: status='failed', error 原因; 退还积分
```

状态机：`queued → running → succeeded | failed`（非法迁移抛 `InvalidTransition`；`running` 超过 `GENERATION_TIMEOUT_MS` 由回收任务置 failed + 退积分）。

## Ark 集成（协议边界）

- 端点/模型 id 全部走 env：`ARK_BASE_URL`、`ARK_IMAGE_MODEL`（如 doubao-seedream-*）、`ARK_VIDEO_MODEL`（doubao-seedance-*）、`ARK_API_KEY`
- `ArkProvider` 只做三件事：submit 组装请求体、poll 解析任务状态、fetchResult 取产物 URL 列表——HTTP 客户端注入，测试用 nock 打桩
- 后续新增协议 = 新增一个 Provider 实现 + 注册表登记，业务层不动

## S3 预签名直传

```
POST /api/assets/presign {filename, contentType, kind}
  → key = `${kind}/${userId}/${uuid}.${ext}`; bucket 按 env
  → {url, key, expiresIn: 900}
前端 PUT 直传 MinIO/CDN → POST /api/assets {key, kind, meta} 登记 → assets 表
```
读取走公开 URL（本地 MinIO bucket 公读；生产可换 CDN 域名 env `CDN_BASE_URL`）。

## Supabase

- Auth：邮箱注册/登录；api 用 service_role + 用户 JWT 双通道（Guard 校验后用 service_role 查询，RLS 兜底）
- migrations：纯 SQL、可独立执行（不依赖 supabase 特有 schema，除 `auth.users` 外键引用）；参考 Helix 风格（快照：`dreamina-clone/RECON/helix-patterns/0001_init.sql`）
- seed：feed_items 灌 RECON 捕获的 20 条（封面改指本地 `web/public/seed/`）；agent 配置灌 model_list/skills（对齐 `mweb-v1-creation_agent-v2-get_agent_config.json`）

## 前端结构（apps/web）

```
app/
├── layout.tsx              # 字体(CapCut Sans/Montserrat self-host) + token css + 侧边栏壳
├── ai-tool/home/page.tsx
├── ai-tool/generate/page.tsx
└── ai-tool/assets-canvas/page.tsx (+ /project/[id])
components/
├── shell/ (SideRail, UserBadge, CreditsPill)
├── home/ (HeroPromptBox, ModelCards, FeedTabs, MasonryFeed)
├── generate/ (Composer(tiptap), MentionMenu, SkillMenu, ChatList, TaskCenter)
└── canvas/ (CanvasEntry, IdeaCards, ProjectList, CanvasEditor(@xyflow))
lib/ (api client, query keys, s3 direct-upload)
```

状态/数据：@tanstack/react-query（轮询 generation、feed 分页）；无全局 store 需求（会话态走 Supabase Auth session + query cache）。

## 明确不做（架构层）
- SSR 数据依赖（三页全部 client 交互型；Next 仅提供路由与资产）
- 埋点/遥测、支付、第三方 OAuth
- 生成模型本地推理

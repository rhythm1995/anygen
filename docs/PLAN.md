# Dreamina 全栈复刻 · 总计划

> 目标：以 dreamina.capcut.com 的 /ai-tool/home、/ai-tool/generate、/ai-tool/assets-canvas 三页为蓝本，
> 用 React(Next.js 最新) + Tailwind v4 + shadcn/ui + NestJS + Supabase + S3 兼容 CDN + Turborepo
> 重建一个**可运行的全栈项目**。UI 逐像素对齐原站；数据模型对齐原站真实 API 形状；生成能力接真模型。
>
> 证据基线：`dreamina-clone/RECON/`（渲染 DOM 快照、计算样式 probe、19 个自托管字体、51MB 图片、
> 匿名+登录态共 85 个 API fixtures、三页 1440/768/390 截图基线）。

## 里程碑

| 里程碑 | 内容 | 验收标准 |
|---|---|---|
| M1 文档定稿 | docs/ 五份文档 | 本目录全部成文，数据模型/UI 规格/测试策略可执行 |
| M2 骨架可跑 | Turborepo + web + api + shared + supabase + MinIO | `pnpm dev` 一条命令起全栈；`turbo test` 空转通过 |
| M3 契约绿 | packages/shared zod schema | 用捕获 fixtures 做 round-trip 校验全绿 |
| M4 API 核心绿 | auth/credits/generation/storage/feed/projects/chats | TESTING.md 所列测试全部红→绿 |
| M5 三页 UI | home / generate / canvas | 截图 vs RECON 基线对照；核心交互可用 |
| M6 端到端 | 注册→feed→真实生成→产物落 S3→资产→画布持久化 | 无 ARK key 时全流程除生成外可跑通，生成接口报明确配置错误 |

## 任务拆解（TDD 单元，红-绿-重构）

见 `TESTING.md` 的核心功能表。执行顺序：
1. shared 契约（fixtures round-trip）
2. supabase migrations + RLS
3. auth guard → me/credits
4. generation 状态机 → Ark Provider（mock HTTP 层）
5. storage 预签名
6. feed / projects / chats
7. 前端：token/字体 → 布局壳（侧边栏）→ home → generate → canvas
8. e2e 冒烟 + 截图对照

## 已确认决策
- 生成：**只接真模型**（火山方舟 Ark：Seedream 文生图 / Seedance 文生视频），Provider 适配器接口便于后续加协议；不做 mock 生成
- 画布：**完整编辑器**（@xyflow/react）
- 前端：**Next.js 最新版**（App Router）+ React 19 + Tailwind v4 + shadcn/ui
- 位置：anygen 原地重建（Helix 已删除，.git 历史保留）
- 登录：Supabase Auth（邮箱）；不做 Google/TikTok OAuth、支付订阅、埋点

## 风险与对策
| 风险 | 对策 |
|---|---|
| ARK API key 未就绪 | Provider 接口先行，HTTP 层用 nock 测试驱动；真实调用由 env 开关控制，缺 key 返回明确配置错误 |
| ibyteimg 签名图过期 | seed 数据的封面统一改走本地 `public/seed/` 图片（51MB 已在 dreamina-clone 落地） |
| Supabase CLI/本地栈不可用 | migrations 保持纯 SQL 可直接跑任意 Postgres；supabase-js 双模式（Helix 模式：mock/supabase）不引入 |
| 原站 UI 更新导致偏差 | 以 RECON 快照日期 2026-08-29/30 的基线为准，文档记录证据路径 |
| CapCut Sans 版权 | 仅本地学习用；商业部署需替换字体与品牌资产（NOTES.md 替换清单） |

## 目录规划（目标态）
```
anygen/
├── docs/                  # 本目录
├── apps/
│   ├── web/               # Next.js（三页 + 画布编辑器）
│   └── api/               # NestJS（/api 前缀）
├── packages/shared/       # zod 契约 + 类型
├── supabase/              # config.toml + migrations + seed.sql
├── docker-compose.yml     # MinIO (9000/9001)
├── turbo.json · pnpm-workspace.yaml · package.json · tsconfig.base.json · .env.example
└── dreamina-clone/        # 侦察基线（只读证据库，不参与构建）
```

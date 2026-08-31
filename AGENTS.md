# AGENTS.md — anygen 项目协作规范

> 给在本仓库工作的 AI coding agent（以及未来的人）。**结论与决策以 [`docs/CONCLUSIONS.md`](docs/CONCLUSIONS.md) 为唯一权威**，本文只讲"怎么干活"。

## 项目是什么

即梦（国内版 jimeng.jianying.com）的**内部复刻平台**：三页（灵感/生成/画布）+ 7 创作类型面板 + admin 模型管理与美元计费 + Agent 模式（技能模板 v1 → 自由 agent v2）。内部使用，不对外，无支付。

## 技术栈与结构

```
Turborepo (pnpm) · Node ≥20
apps/web      Next.js 16 + React 19 + Tailwind v4 + shadcn/ui（全站 zh-Hans）
apps/api      NestJS 11，全局前缀 /api，Zod 校验管道
packages/shared  zod 契约（web/api 共用；原站真实 fixtures 驱动 TDD）
supabase/     迁移 + seed（本地栈 `supabase start`）
vendor/openmontage  上游 core 模块（AGPL，只读，同步制）
vendor/infinite-canvas  上游无限画布全栈（tigerowo，AGPL，只读，同步制——移植手册 docs/CANVAS-RESEARCH.md）
vendor-overlay/     我们的定制层（bridge/patches/seed）——vendor 的任何文件禁止手改
dreamina-clone/     侦察证据库（RECON/ 快照与 fixtures，只读）
docs/         设计文档；CONCLUSIONS.md 是权威决策表
```

## 常用命令

```bash
pnpm dev                  # 起 api(3101) + web(3100)；infra 另起：
supabase start            # Postgres+Auth 本地栈（54321）
docker compose up -d      # MinIO (9000)
pnpm turbo run typecheck test   # 全量质量门（提交前必须绿）
pnpm test:e2e --filter @dreamina/api   # API e2e（需要 supabase 在跑）
pnpm db:reset             # 重置 DB + seed
node tools/e2e-ui.mjs     # 真实浏览器 UI 全流程（注册→feed→生成→画布）
./tools/sync-openmontage.sh   # 仅当用户说「同步 OpenMontage」时执行！
./tools/sync-infinite-canvas.sh  # 仅当用户说「同步 infinite-canvas」时执行！
```

## 环境变量

各 app 读自己的 `.env.local`（不入库）；模板见根 `.env.example`。Supabase 本地 keys 用 `supabase status -o env` 生成后补 `SUPABASE_` 前缀（脚本见 tools/ 或历史）。无 ARK key 时生成接口必须返回 503 + 明确 config 错误文案（不许 mock 生成结果）。

## 工作纪律（重要）

1. **文档先行**：动代码前确认 docs/CONCLUSIONS.md 对应决策存在且最新；新决策先落 CONCLUSIONS.md 再实现。
1.5 **文档分层**：改文档前先看 CONCLUSIONS.md §0 文档地图——决策只进 CONCLUSIONS，历史层文档只加横幅不改内容；每份文档首行必须带状态横幅。
2. **TDD 核心功能**：计费/状态机/权限/契约类改动先写失败测试（现有 42 个测试的模式照抄：fixtures round-trip → 红 → 绿）。
3. **不动 vendor/**：定制一律进 `vendor-overlay/`；对上游的调用只走 `vendor-overlay/bridge/run.py`（JSON stdin/stdout）。
4. **UI 还原纪律**：颜色/字体/尺寸以 `dreamina-clone/RECON/` 的计算值为准（token 已在 apps/web globals.css），禁止目测；面板数据一律来自 admin models 表，禁止前端硬编码模型清单。
5. **计费铁律**：账本只存美分整数；扣退必须幂等（复用 RPC 模式）；任何新扣费点都要有并发测试。
6. **提交规范**：conventional commits（feat/fix/docs/chore(vendor)…）；vendor 同步单独成 commit：`chore(vendor): sync openmontage @ <hash>`。
7. **敏感信息**：cookie/key 永不入库（.gitignore 已防）；侦察 cookie 放 dreamina-clone/RECON/ 且 chmod 600。

## 侦察与验证

- 原站行为存疑时：用 web-clone skill 的 CDP 探针真实抓取，禁止凭记忆写"原站是这样"。
- UI 改动必须过 `node tools/e2e-ui.mjs`（0 page error + 截图对照 docs/verify/）。
- 新 API 必须补 e2e（apps/api/test/e2e/ 模式：真实 supabase + 原生 fetch）。

## 已知坑（踩过的，别再踩）

- Next 16 dev origin 保护拦 `127.0.0.1` → next.config.ts 已配 `allowedDevOrigins`；测试脚本用 `localhost`。
- xyflow 容器在 flex 布局下高度塌陷 → 用显式 `style={{height: 'calc(100vh - 48px)'}}`。
- tsx 不支持 `emitDecoratorMetadata` → api dev 用 `nest start --watch`。
- supabase-js 的 error 是普通对象 → 一律 `unwrap()` 包成真 Error。
- supertest v7 在 jest interop 下 `.set` 丢失 → e2e 用原生 fetch。
- CDP `captureBeyondViewport` 截图对 canvas 类页面渲染异常 → 用原生 `Page.captureScreenshot`。

## 里程碑指针

见 docs/CONCLUSIONS.md §5。当前：M7（画布 v2，D12——vendor 化 tigerowo 对照重写）。动手前重读该节与 docs/CANVAS-RESEARCH.md。
